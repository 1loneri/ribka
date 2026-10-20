import {overlayFontFor,type OverlayFontId} from './fonts';
export const LEVEL_RULES={first:1500,step:750} as const;
export type LevelProgress={level:number;xp:number;progress:number;needed:number;remaining:number;percent:number};
export function progressFor(value:number):LevelProgress{
 const xp=Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
 const total=(steps:number)=>steps*LEVEL_RULES.first+LEVEL_RULES.step*steps*(steps-1)/2;
 const a=LEVEL_RULES.step/2,b=LEVEL_RULES.first-a;
 let steps=Math.max(0,Math.floor((-b+Math.sqrt(b*b+4*a*xp))/(2*a)));
 while(total(steps+1)<=xp)steps++;
 while(total(steps)>xp)steps--;
 const needed=LEVEL_RULES.first+steps*LEVEL_RULES.step,progress=xp-total(steps);
 return {level:steps+1,xp,progress,needed,remaining:needed-progress,percent:Math.min(100,progress/needed*100)};
}
export type LevelAppearance={accent:string;opacity:number;fontSize:number;messages:number;hideAfter:number;fontFamily:OverlayFontId};
export const DEFAULT_APPEARANCE:LevelAppearance={accent:'#ce3833',opacity:82,fontSize:18,messages:6,hideAfter:90,fontFamily:'manrope'};
export function appearanceFor(value:unknown):LevelAppearance{
 let candidate=value;if(typeof value==='string')try{candidate=JSON.parse(value);}catch{candidate={};}
 const v=candidate&&typeof candidate==='object'?candidate as Record<string,unknown>:{};
 const number=(key:keyof LevelAppearance,min:number,max:number)=>typeof v[key]==='number'&&Number.isFinite(v[key])?Math.round(Math.max(min,Math.min(max,v[key] as number))):DEFAULT_APPEARANCE[key] as number;
 return {accent:typeof v.accent==='string'&&/^#[0-9a-f]{6}$/i.test(v.accent)?v.accent:DEFAULT_APPEARANCE.accent,opacity:number('opacity',0,100),fontSize:number('fontSize',14,26),messages:number('messages',3,10),hideAfter:number('hideAfter',0,600),fontFamily:overlayFontFor(v.fontFamily).id};
}
export const KNOWN_BOTS=new Set(['nightbot','streamelements','streamlabs','moobot','fossabot','wizebot','sery_bot','commanderroot','bot_leha_ai','bot_lehaai']);
