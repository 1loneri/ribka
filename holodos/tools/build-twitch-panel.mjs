
import {readFileSync,writeFileSync} from 'node:fs';
import {inflateRawSync,deflateRawSync} from 'node:zlib';
const root=new URL('../',import.meta.url),site=new URL('src/site/',root),extension=new URL('twitch-extension/',root),file=new URL('twitch-panel.zip',site),input=readFileSync(file),entries=new Map();
let end=input.length-22;while(end>=0&&input.readUInt32LE(end)!==0x06054b50)end--;if(end<0)throw Error('Invalid ZIP');
const count=input.readUInt16LE(end+10);let cursor=input.readUInt32LE(end+16);
for(let i=0;i<count;i++){
 if(input.readUInt32LE(cursor)!==0x02014b50)throw Error('Invalid central directory');
 const method=input.readUInt16LE(cursor+10),size=input.readUInt32LE(cursor+20),nameLength=input.readUInt16LE(cursor+28),extra=input.readUInt16LE(cursor+30),comment=input.readUInt16LE(cursor+32),offset=input.readUInt32LE(cursor+42),name=input.subarray(cursor+46,cursor+46+nameLength).toString();
 const start=offset+30+input.readUInt16LE(offset+26)+input.readUInt16LE(offset+28),data=input.subarray(start,start+size);
 if(method!==0&&method!==8)throw Error('Unsupported compression');
 entries.set(name,method===8?inflateRawSync(data):data);cursor+=46+nameLength+extra+comment;
}
for(const name of ['panel.html','panel.js','catalog.json'])entries.set(name,readFileSync(new URL(name,extension)));
entries.set('panel.css',Buffer.from(readFileSync(new URL('panel.css',extension),'utf8')+'\n'+readFileSync(new URL('cosmetic-titles.css',site),'utf8').replaceAll('/assets/monocraft.woff','media/monocraft.woff')));
for(const id of ['peach','berry']){const data=readFileSync(new URL(id==='peach'?'duel-can-rehab.webp':'duel-can-strawberry.webp',site));entries.set('media/duel-can-'+id+'.webp',data);entries.set('media/duel-can-'+id+'-real.webp',data);}
entries.set('media/slot-w-edition.webp',readFileSync(new URL('slot-w-edition-v2.webp',site)));
for(const name of ['duel-can-rehab.webp','duel-can-strawberry.webp','slot-w-edition-v2.webp','frame-gta6.png'])entries.set('media/'+name,readFileSync(new URL(name,site)));
entries.set('media/frame-throne.png',readFileSync(new URL('frame-throne.png',site)));
for(const name of ['dela-gothic-one.woff','dela-gothic-one-LICENSE.txt'])entries.set('media/'+name,readFileSync(new URL(name,site)));
const crcTable=Array.from({length:256},(_,n)=>{for(let j=0;j<8;j++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=b=>{let n=0xffffffff;for(const v of b)n=crcTable[(n^v)&255]^(n>>>8);return (n^0xffffffff)>>>0;};
const local=[],central=[];let offset=0,centralSize=0;
for(const [name,raw] of entries){
 const n=Buffer.from(name),data=deflateRawSync(raw,{level:9}),crc=crc32(raw),h=Buffer.alloc(30),c=Buffer.alloc(46);
 h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);
 c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
 local.push(h,n,data);central.push(c,n);offset+=h.length+n.length+data.length;centralSize+=c.length+n.length;
}
const tail=Buffer.alloc(22);tail.writeUInt32LE(0x06054b50);tail.writeUInt16LE(entries.size,8);tail.writeUInt16LE(entries.size,10);tail.writeUInt32LE(centralSize,12);tail.writeUInt32LE(offset,16);
writeFileSync(file,Buffer.concat([...local,...central,tail]));console.log('Updated Twitch archive:',entries.size,'files');
