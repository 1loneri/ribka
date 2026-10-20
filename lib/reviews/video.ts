import {MAX_VIDEO_SECONDS} from './model';

export type VideoReader={size:number;read:(offset:number,length:number)=>Promise<Uint8Array>};
type Box={type:string;start:number;body:number;end:number};
const invalid=()=>new Error('Не удалось прочитать видео. Сохрани обычный MP4 с видео и повтори загрузку.');
const view=(bytes:Uint8Array)=>new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
const text=(bytes:Uint8Array,start:number,end:number)=>String.fromCharCode(...bytes.subarray(start,end));
function uint64(bytes:Uint8Array,offset:number){const v=view(bytes),n=v.getUint32(offset)*4294967296+v.getUint32(offset+4);if(!Number.isSafeInteger(n))throw invalid();return n;}
function boxes(bytes:Uint8Array,start:number,end:number):Box[]{
 const result:Box[]=[];
 while(start<end){
  if(end-start<8||result.length>4096)throw invalid();
  let size=view(bytes).getUint32(start),header=8;
  if(size===1){if(end-start<16)throw invalid();size=uint64(bytes,start+8);header=16;}
  if(size===0)size=end-start;
  if(size<header||start+size>end)throw invalid();
  result.push({type:text(bytes,start+4,start+8),start,body:start+header,end:start+size});start+=size;
 }
 return result;
}
function timedHeader(bytes:Uint8Array,box:Box){
 const version=bytes[box.body],scaleOffset=box.body+(version===1?20:12),durationOffset=scaleOffset+4;
 if(version>1||durationOffset+(version===1?8:4)>box.end)throw invalid();
 const scale=view(bytes).getUint32(scaleOffset),duration=version===1?uint64(bytes,durationOffset):view(bytes).getUint32(durationOffset);
 if(!scale||!duration)return null;
 return {scale,seconds:duration/scale};
}
function withinLimit(seconds:number){
 if(!Number.isFinite(seconds)||seconds<=0)throw invalid();
 if(seconds>MAX_VIDEO_SECONDS+0.000001)throw new Error('Видео длиннее двух минут. Обрежь его до 2:00 и загрузи снова.');
 return seconds;
}
function editedDuration(bytes:Uint8Array,parts:Box[],scale:number):number|null{
 const edts=parts.find(b=>b.type==='edts');if(!edts)return null;
 const elst=boxes(bytes,edts.body,edts.end).find(b=>b.type==='elst');if(!elst||elst.body+8>elst.end)throw invalid();
 const version=bytes[elst.body],count=view(bytes).getUint32(elst.body+4),stride=version===1?20:12;
 if(version>1||!count||count>64||elst.body+8+count*stride!==elst.end)throw invalid();
 let ticks=0,hasMedia=false;
 for(let i=0;i<count;i++){
  const at=elst.body+8+i*stride,duration=version===1?uint64(bytes,at):view(bytes).getUint32(at),timeAt=at+(version===1?8:4),rateAt=at+(version===1?16:8);
  const empty=version===1?view(bytes).getUint32(timeAt)===4294967295&&view(bytes).getUint32(timeAt+4)===4294967295:view(bytes).getInt32(timeAt)===-1;
  if(!duration||view(bytes).getInt16(rateAt)!==1||view(bytes).getInt16(rateAt+2)!==0)throw invalid();
  if(!empty){if(version===0&&view(bytes).getInt32(timeAt)<0||version===1&&view(bytes).getUint32(timeAt)>=2147483648)throw invalid();hasMedia=true;}
  ticks+=duration;
 }
 if(!hasMedia||!Number.isSafeInteger(ticks))throw invalid();return withinLimit(ticks/scale);
}
export function inspectMoov(bytes:Uint8Array):number{
 const root=boxes(bytes,0,bytes.length);if(root.length!==1||root[0].type!=='moov')throw invalid();
 const children=boxes(bytes,root[0].body,root[0].end),mvhd=children.find(b=>b.type==='mvhd');
 if(!mvhd||children.some(b=>b.type==='mvex'))throw invalid(); // Fragmented / live containers have no complete sample timeline.
 const movie=timedHeader(bytes,mvhd);if(!movie)throw invalid();let duration=withinLimit(movie.seconds),video=false;
 for(const track of children.filter(b=>b.type==='trak')){
  const parts=boxes(bytes,track.body,track.end),tkhd=parts.find(b=>b.type==='tkhd'),mdia=parts.find(b=>b.type==='mdia');
  if(!tkhd||!mdia)throw invalid();
  const version=bytes[tkhd.body],offset=tkhd.body+(version===1?28:20),length=version===1?8:4;
  if(version>1||offset+length>tkhd.end)throw invalid();
  const trackSeconds=(version===1?uint64(bytes,offset):view(bytes).getUint32(offset))/movie.scale;
  duration=Math.max(duration,withinLimit(trackSeconds));
  const edited=editedDuration(bytes,parts,movie.scale);
  if(edited!==null&&Math.abs(edited-trackSeconds)>1/movie.scale+.000001)throw invalid();
  const media=boxes(bytes,mdia.body,mdia.end),mdhd=media.find(b=>b.type==='mdhd'),hdlr=media.find(b=>b.type==='hdlr'),minf=media.find(b=>b.type==='minf');
  if(!mdhd||!hdlr||hdlr.body+12>hdlr.end||!minf)throw invalid();
  const timing=timedHeader(bytes,mdhd);if(!timing||!Number.isFinite(timing.seconds))throw invalid();
  // MP4 edits trim decoder priming (notably AAC audio and B frames).
  // Bound the presented timeline when edits exist; otherwise bound every sample.
  if(edited===null)duration=Math.max(duration,withinLimit(timing.seconds));
  const handler=text(bytes,hdlr.body+8,hdlr.body+12);
  if(handler!=='vide'&&handler!=='soun')continue;
  const stbl=boxes(bytes,minf.body,minf.end).find(b=>b.type==='stbl');if(!stbl)throw invalid();
  const table=boxes(bytes,stbl.body,stbl.end),stts=table.find(b=>b.type==='stts');
  if(!stts||stts.body+8>stts.end)throw invalid();
  const count=view(bytes).getUint32(stts.body+4);if(!count||count>100000||stts.body+8+count*8!==stts.end)throw invalid();
  let ticks=0,samples=0;
  for(let i=0;i<count;i++){const at=stts.body+8+i*8,n=view(bytes).getUint32(at),delta=view(bytes).getUint32(at+4);if(!n||!delta)throw invalid();ticks+=n*delta;samples+=n;}
  if(!Number.isSafeInteger(ticks))throw invalid();if(edited===null)duration=Math.max(duration,withinLimit(ticks/timing.scale));
  const stsz=table.find(b=>b.type==='stsz');if(!stsz||stsz.body+12>stsz.end||view(bytes).getUint32(stsz.body+8)!==samples)throw invalid();
  if(handler==='vide'){
   if(tkhd.end-tkhd.body<8||!view(bytes).getUint32(tkhd.end-8)||!view(bytes).getUint32(tkhd.end-4))throw invalid();
   video=true;
  }
 }
 if(!video)throw invalid();return duration;
}
export async function inspectMP4(reader:VideoReader):Promise<number>{
 if(reader.size<32)throw invalid();
 let offset=0,moov:Uint8Array|null=null,media=false,ftyp=false;
 for(let count=0;offset<reader.size;count++){
  if(count>=32||reader.size-offset<8)throw invalid();
  const head=await reader.read(offset,Math.min(32,reader.size-offset));if(head.length<8)throw invalid();
  let length=view(head).getUint32(0),header=8;const type=text(head,4,8);
  if(length===1){if(head.length<16)throw invalid();length=uint64(head,8);header=16;}
  if(length===0)length=reader.size-offset;
  if(length<header||length>reader.size-offset)throw invalid();
  if(offset===0&&type!=='ftyp')throw invalid();
  if(type==='ftyp'){if(length<16)throw invalid();ftyp=true;}
  if(type==='moof')throw invalid();
  if(type==='mdat'&&length>header)media=true;
  if(type==='moov'){
   if(moov||length>2*1024*1024)throw invalid();
   moov=await reader.read(offset,length);if(moov.length!==length)throw invalid();
  }
  offset+=length;
 }
 if(!ftyp||!media||!moov)throw invalid();return inspectMoov(moov);
}
