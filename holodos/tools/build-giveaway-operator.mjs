import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';import path from 'node:path';
const input=process.argv[2];if(!input)throw Error('Usage: node tools/build-giveaway-operator.mjs source.gif [output-directory]');
const out=path.resolve(process.argv[3]||new URL('../src/site/',import.meta.url).pathname);fs.mkdirSync(out,{recursive:true});
const expected='20e91d66371d1085da6eea143e9072f0f7a0278c79477dc190b4becff64af1fb';if(createHash('sha256').update(fs.readFileSync(input)).digest('hex')!==expected)throw Error('This matte is calibrated for the supplied 163-frame GIF.');
const W=600,H=338,N=W*H,centers=[[524, 190], [515, 190], [512, 192], [507, 194], [493, 196], [484, 199], [461, 207], [453, 210], [452, 209], [450, 209], [449, 209], [448, 209], [451, 207], [457, 203], [466, 198], [472, 196], [480, 195], [492, 195], [494, 195], [493, 195], [493, 195], [493, 195], [493, 195], [493, 195], [494, 195]];
const source=spawnSync('ffmpeg',['-v','error','-i',input,'-vf','trim=start_frame=81:end_frame=106','-f','rawvideo','-pix_fmt','rgba','pipe:1'],{maxBuffer:64e6});if(source.status)throw Error(source.stderr);
function polygon(x,y,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
const output=Buffer.alloc(source.stdout.length),queue=new Int32Array(N);
for(let f=0;f<25;f++){
 const rgb=source.stdout.subarray(f*N*4,(f+1)*N*4),[cx,cy]=centers[f],mask=new Uint8Array(N),seen=new Uint8Array(N);
 const bounds=[[348,cy-24],[cx-75,cy-39],[cx+15,cy-41],[cx+42,cy-20],[cx+43,cy+32],[cx+115,cy+89],[610,328],[438,328],[400,cy+76],[371,cy+31],[348,cy-10]];
 for(let y=150;y<328;y++)for(let x=342;x<600;x++){const i=y*W+x,k=i*4,r=rgb[k],g=rgb[k+1],b=rgb[k+2];if((polygon(x,y,bounds)&&r<200&&g<190&&b<200&&b+12>r*.87)||(f===0&&polygon(x,y,[[350,178],[354,177],[384,197],[381,204],[350,183]])))mask[i]=1;}
 // Keep the connected weapon silhouette; detached scenery and HUD pixels disappear.
 let head=0,tail=0,best=[];const visited=new Uint8Array(N);
 for(let seed=0;seed<N;seed++){if(!mask[seed]||visited[seed])continue;head=0;tail=0;queue[tail++]=seed;visited[seed]=1;
 while(head<tail){const i=queue[head++];for(const j of [i-1,i+1,i-W,i+W])if(j>=0&&j<N&&!visited[j]&&mask[j]){visited[j]=1;queue[tail++]=j}}
 if(tail>best.length)best=Array.from(queue.subarray(0,tail));}
 for(const i of best)seen[i]=1;
 // Fill enclosed lens/reflection gaps without replacing the original RGB.
 const outside=new Uint8Array(N);head=0;tail=0;
 for(let x=0;x<W;x++){outside[x]=1;queue[tail++]=x;const j=(H-1)*W+x;outside[j]=1;queue[tail++]=j}
 for(let y=1;y<H-1;y++)for(const x of [0,W-1]){const j=y*W+x;outside[j]=1;queue[tail++]=j}
 while(head<tail){const i=queue[head++];for(const j of [i-1,i+1,i-W,i+W])if(j>=0&&j<N&&!outside[j]&&!seen[j]){outside[j]=1;queue[tail++]=j}}
 const solid=new Uint8Array(N);
 for(let i=0;i<N;i++){const x=i%W,y=Math.floor(i/W),flash=f===0&&(x-350)**2+(y-180)**2<43**2&&rgb[i*4]>200&&rgb[i*4+1]>150&&rgb[i*4+2]>80;solid[i]=seen[i]||!outside[i]||flash?1:0;}
 // One-pixel coverage feather. Edge RGB comes only from retained foreground,
 // so soft edges do not pick up the brown scenery behind the original weapon.
 for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){const i=y*W+x,k=f*N*4+i*4;let weight=0,r=0,g=0,b=0;
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const j=i+dy*W+dx,w=(dx===0?2:1)*(dy===0?2:1)*solid[j];weight+=w;r+=rgb[j*4]*w;g+=rgb[j*4+1]*w;b+=rgb[j*4+2]*w;}
  if(!weight)continue;output[k+3]=Math.round(weight*255/16);
  if(weight===16){output[k]=rgb[i*4];output[k+1]=rgb[i*4+1];output[k+2]=rgb[i*4+2];}
  else{output[k]=Math.round(r/weight);output[k+1]=Math.round(g/weight);output[k+2]=Math.round(b/weight);}
 }

}
function encode(args){const result=spawnSync('ffmpeg',['-v','error','-y',...args],{input:output,maxBuffer:64e6});if(result.status)throw Error(String(result.stderr));}
const raw=['-f','rawvideo','-pix_fmt','rgba','-s','600x338','-r','25','-i','pipe:0'];
encode([...raw,'-vf','crop=300:178:300:140,tile=7x4:nb_frames=25:color=black@0','-frames:v','1','-c:v','libwebp','-lossless','1',path.join(out,'giveaway-operator-atlas.webp')]);
encode([...raw,'-vf','crop=300:178:300:140','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-lossless','1','-auto-alt-ref','0',path.join(out,'giveaway-operator.webm')]);
encode(['-f','lavfi','-i','color=c=0x111820:s=600x338:r=25',...raw,'-filter_complex','[0:v][1:v]overlay=shortest=1,crop=300:178:300:140','-c:v','libx264','-pix_fmt','yuv420p',path.join(out,'giveaway-operator-preview.mp4')]);
console.log('Built 25 original frames (81–105), 25 fps, 1 s, transparent atlas/WebM and dark preview.');
