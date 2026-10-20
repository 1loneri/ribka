'use client';
import {useEffect,useRef,useState} from 'react';
import {FISHING_DRAW_DURATION} from '../../lib/giveaway-animation-timing';
type Geometry={width:number;height:number;hx:number;hy:number;tx:number;ty:number;kx:number;ky:number;scale:number};
const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
export default function FishingRig({running,onCaught}:{running:boolean;onCaught?:()=>void}){
 const notified=useRef(false),ref=useRef<SVGSVGElement>(null),[geometry,setGeometry]=useState<Geometry|null>(null),[progress,setProgress]=useState(0);
 useEffect(()=>{
  const svg=ref.current,scene=svg?.parentElement;if(!svg||!scene)return;
  const measure=()=>{const base=scene.getBoundingClientRect(),fisher=scene.querySelector('.pond-fisher')?.getBoundingClientRect(),water=scene.querySelector('.pond-water')?.getBoundingClientRect();if(!fisher||!water)return;
   setGeometry({width:base.width,height:base.height,hx:fisher.left-base.left+fisher.width*148/220,hy:fisher.top-base.top+fisher.height*141/190,tx:fisher.left-base.left+fisher.width*25/220,ty:fisher.top-base.top+fisher.height*20/190,kx:water.left-base.left+water.width*.48,ky:water.top-base.top+water.height*.28,scale:fisher.width/220});};
  measure();const observer=new ResizeObserver(measure);observer.observe(scene);window.addEventListener('resize',measure);return()=>{observer.disconnect();window.removeEventListener('resize',measure);};
 },[]);
 useEffect(()=>{notified.current=false;if(!running){setProgress(0);return;}let frame=0,start=performance.now();const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tick=(now:number)=>{const progress=reduced?1:Math.min(1,(now-start)/FISHING_DRAW_DURATION);setProgress(progress);if(progress<1)frame=requestAnimationFrame(tick);};frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
 },[running]);
 const lift=running?smooth((progress-.66)/.3):0,angle=running?(-3*Math.sin(progress*Math.PI*2)*(1-lift)+20*lift)*Math.PI/180:0;
 let tip={x:0,y:0},hook={x:0,y:0};
 if(geometry){const dx=geometry.tx-geometry.hx,dy=geometry.ty-geometry.hy;tip={x:geometry.hx+dx*Math.cos(angle)-dy*Math.sin(angle),y:geometry.hy+dx*Math.sin(angle)+dy*Math.cos(angle)};
  hook={x:geometry.kx+(geometry.hx-48*geometry.scale-geometry.kx)*lift,y:geometry.ky+(geometry.hy-50*geometry.scale-geometry.ky)*lift+(running?Math.sin(progress*30)*2*(1-lift):0)};
 }
 useEffect(()=>{const scene=ref.current?.parentElement,fish=scene?.querySelector<HTMLElement>('.fish-chosen'),water=scene?.querySelector('.pond-water');if(!fish||!water||!geometry)return;
  const base=scene!.getBoundingClientRect(),rect=water.getBoundingClientRect(),pull=smooth((progress-.66)/.1);
  fish.style.setProperty('--caught-x',hook.x-(rect.left-base.left)+'px');fish.style.setProperty('--caught-y',hook.y-(rect.top-base.top)+10+'px');fish.style.setProperty('--caught-angle',(-12-65*lift)+'deg');
  if(running&&pull>0){if(!notified.current){notified.current=true;onCaught?.();}fish.style.animation='none';fish.style.left='var(--caught-x)';fish.style.top='var(--caught-y)';fish.style.transform='translate(-50%,-50%) rotate(var(--caught-angle))';}
 },[geometry,progress,running,onCaught]);
 return <svg ref={ref} className="pond-fishing-rig" viewBox={geometry?`0 0 ${geometry.width} ${geometry.height}`:undefined} aria-hidden="true">{geometry&&<>
  <path d={`M${geometry.hx} ${geometry.hy} Q${(geometry.hx+tip.x)/2} ${tip.y+12} ${tip.x} ${tip.y}`} fill="none" stroke="#cab99a" strokeWidth={3*geometry.scale}/>
  <path d={`M${tip.x} ${tip.y} Q${(tip.x+hook.x)/2} ${Math.max(tip.y,hook.y-26)+10*(1-lift)} ${hook.x} ${hook.y-20} L${hook.x} ${hook.y-3} q0 12 10 8`} fill="none" stroke="#ddd8c5" strokeWidth={geometry.scale} strokeLinecap="round"/>
  {lift<.2&&<ellipse cx={hook.x} cy={geometry.ky-23} rx={19+Math.sin(progress*14)*3} ry="4" fill="none" stroke="#c1d0c53b"/>}
  <g transform={`translate(${geometry.hx} ${geometry.hy}) scale(${geometry.scale})`}><path d="M0 0 8 12" stroke="#d9c8ad" strokeWidth="6" strokeLinecap="round"/><circle cx="-7" cy="0" r="5" fill="#716751" stroke="#d9c8ad" strokeWidth="2"/><path d="M-5-4q-5 1-4 6l5 5q3 2 6-1l1-4q-1-4-5-5Zm10 7q-4 0-5 4l2 5q4 3 7 0l1-4q-1-4-5-5Z" fill="#f5f3ef" stroke="#171717" strokeWidth="2" strokeLinejoin="round"/></g>
 </>}</svg>;
}
