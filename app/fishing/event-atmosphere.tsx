'use client';
import {CloudLightning,Moon,Orbit,Bird,Coins,ShieldAlert} from 'lucide-react';
import type {CSSProperties} from 'react';
import type {FishEvent} from '../../lib/fishing/game';
import {eventTime} from '../../lib/fishing/effects';
export function EventIcon({id,size=18}:{id:string;size?:number}){return id==='abductors'?<ShieldAlert size={size}/>:id==='seagulls'?<Bird size={size}/>:id==='thieves'?<Coins size={size}/>:id==='storm'?<CloudLightning size={size}/>:id==='moon'?<Moon size={size}/>:<Orbit size={size}/>;}
export function EventBanner({event,preview,until,now}:{event:FishEvent;preview:boolean;until:number;now:number}){
 return <section className={'fish-world-event world-event-'+event.id} aria-label={preview?'Демонстрация события':'Активное событие'}><EventIcon id={event.id} size={24}/><div><strong role="status">{event.name}</strong><span>{event.text}</span></div><span className="world-event-time">{preview?'Предпросмотр':eventTime(until,now)}<small>{preview?'Эффект для демонстрации':'до конца события'}</small></span>{!preview&&<progress className="world-event-progress" value={Math.max(0,Math.min(600000,until-now))} max={600000} aria-label="Осталось времени события"/>}</section>;
}
export default function EventAtmosphere(){
 return <div className="event-atmosphere" aria-hidden="true"><div className="hazard-birds">{Array.from({length:5},(_,i)=><Bird key={i} size={30+i*3} style={{top:(10+i*11)+'%',animationDelay:(i*-2)+'s'}}/>)}</div><div className="hazard-coins">{Array.from({length:7},(_,i)=><Coins key={i} size={18} style={{left:(10+i*12)+'%',animationDelay:(i*-.6)+'s'}}/>)}</div><div className="storm-light"/><div className="storm-rain">{Array.from({length:20},(_,i)=><i key={i} style={{left:(i*5-3)+'%',animationDelay:(i*-.21)+'s',animationDuration:(1.6+i%4*.3)+'s','--rain-opacity':.15+i%4*.07} as CSSProperties}/>)}</div><div className="moon-rays"/><div className="event-glimmer">{Array.from({length:16},(_,i)=><i key={i} style={{left:(7+i*5.8)+'%',top:(20+i*11%64)+'%',animationDelay:(i*-.8)+'s',animationDuration:(4+i%4)+'s'} as CSSProperties}/>)}</div><div className="void-aura"/><div className="void-scan"/><div className="void-pixels">{Array.from({length:18},(_,i)=><i key={i} style={{left:(3+i*5.4)+'%',top:(25+i*17%60)+'%','--void-size':(2+i%3*2)+'px',animationDelay:(i*-.7)+'s',animationDuration:(5+i%5)+'s'} as CSSProperties}/>)}</div></div>;
}
