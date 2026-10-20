import {MAX_FEEDBACK_BYTES,MAX_FEEDBACK_PIXELS} from './model';

export class FeedbackImageError extends Error{constructor(message:string,public status=400){super(message);}}
export async function readFeedbackImage(req:Request){
 const declared=Number(req.headers.get('content-length')??0);
 if(!Number.isSafeInteger(declared)||declared<0||declared>MAX_FEEDBACK_BYTES)throw new FeedbackImageError('Изображение должно быть не больше 10 МБ.',413);
 if(!req.body)throw new FeedbackImageError('Выбери изображение.');
 const reader=req.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{while(true){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>MAX_FEEDBACK_BYTES){await reader.cancel();throw new FeedbackImageError('Изображение должно быть не больше 10 МБ.',413);}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return bytes;
}
export function inspectFeedbackImage(bytes:Uint8Array){
 const fail=()=>{throw new FeedbackImageError('Выбери обычный PNG, JPG или WebP.',415);};
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),text=(at:number,n:number)=>String.fromCharCode(...bytes.subarray(at,at+n));
 let mime='',extension='',width=0,height=0;
 if(bytes.length>=45&&bytes[0]===137&&text(1,7)==='PNG\r\n\x1a\n'){
  let offset=8,header=false,data=false,end=false;
  while(offset+12<=bytes.length){const size=view.getUint32(offset),kind=text(offset+4,4);if(size>bytes.length-offset-12)fail();
   if(!header){if(kind!=='IHDR'||size!==13)fail();width=view.getUint32(offset+8);height=view.getUint32(offset+12);header=true;}
   else if(kind==='IHDR')fail();
   if(kind==='IDAT')data=true;
   offset+=size+12;if(kind==='IEND'){if(size!==0||offset!==bytes.length)fail();end=true;break;}
  }
  if(!header||!data||!end)fail();mime='image/png';extension='png';
 }else if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217){
  let offset=2,scan=false;
  while(offset+4<=bytes.length){if(bytes[offset++]!==255)fail();while(bytes[offset]===255)offset++;const marker=bytes[offset++];if(offset+2>bytes.length)fail();if(marker===217)break;if(marker===216||marker===0)fail();
   const size=view.getUint16(offset);if(size<2||offset+size>bytes.length)fail();
   if(marker>=192&&marker<=207&&![196,200,204].includes(marker)){if(size<8)fail();height=view.getUint16(offset+3);width=view.getUint16(offset+5);}
   if(marker===218){scan=true;break;}offset+=size;
  }
  if(!scan)fail();mime='image/jpeg';extension='jpg';
 }else if(bytes.length>=30&&text(0,4)==='RIFF'&&text(8,4)==='WEBP'&&view.getUint32(4,true)+8===bytes.length){
  let offset=12,frame=false;
  const little24=(at:number)=>bytes[at]|bytes[at+1]<<8|bytes[at+2]<<16;
  while(offset+8<=bytes.length){const kind=text(offset,4),size=view.getUint32(offset+4,true),start=offset+8;if(size>bytes.length-start)fail();
   if(kind==='VP8X'){if(size!==10)fail();width=little24(start+4)+1;height=little24(start+7)+1;}
   else if(kind==='VP8 '){if(size<10||text(start+3,3)!=='\x9d\x01\x2a')fail();if(!width){width=view.getUint16(start+6,true)&16383;height=view.getUint16(start+8,true)&16383;}frame=true;}
   else if(kind==='VP8L'){if(size<5||bytes[start]!==47)fail();const packed=view.getUint32(start+1,true);if(!width){width=(packed&16383)+1;height=(packed>>>14&16383)+1;}frame=true;}
   else if(kind==='ANMF'&&size>16)frame=true;
   offset=start+size+(size%2);
  }
  if(!frame||offset!==bytes.length)fail();mime='image/webp';extension='webp';
 }else fail();
 if(!width||!height||width>12000||height>12000||width*height>MAX_FEEDBACK_PIXELS)throw new FeedbackImageError('Изображение слишком большое по разрешению. Сохрани его поменьше.',413);
 return {mime,extension,width,height};
}
