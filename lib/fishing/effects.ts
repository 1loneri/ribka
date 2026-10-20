import {events,type FishEvent} from './game';
export function sceneEvent(mode:string,preview:string,source:{event:FishEvent|null;enabled:boolean;activeUntil:number}|null,now:number):FishEvent|null{
 if(mode==='demo')return events.find(event=>event.id===preview)??null;
 if(!source||source.activeUntil<=now||(!source.enabled&&!['seagulls','thieves','abductors'].includes(source.event?.id??'')))return null;
 return events.find(event=>event.id===source.event?.id)??null;
}
export function eventTime(activeUntil:number,now:number){const seconds=Math.max(0,Math.ceil((activeUntil-now)/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
