'use client';
import {useEffect,useState,type CSSProperties} from 'react';
import {monsterForParticipant,type MonsterVariant,type VendingPerson} from '../../lib/monster-catalog';
import {VENDING_DRAW_DURATION} from '../../lib/giveaway-animation-timing';
import sprites from './vending-sprites.json';
import './vending-draw.css';

export function MonsterCan({variant,className=''}:{variant:MonsterVariant;className?:string}){
 const sheet=sprites[variant.sheet],frame=sheet.frames[variant.sprite];
 return <svg className={'monster-can '+className} viewBox={frame.join(' ')} aria-hidden="true" focusable="false"><image href={'/vending/cans-'+(variant.sheet+1)+'.png'} width={sheet.width} height={sheet.height}/></svg>;
}

const WINDOW_SIZE=25;
export default function VendingDraw({giveawayId,people,winner,running=false,startedAt=0,revealed=false,total=people.length,entryWord}:{giveawayId:string;people:VendingPerson[];winner:VendingPerson|null;running?:boolean;startedAt?:number;revealed?:boolean;total?:number;entryWord?:string|null}){
 const [page,setPage]=useState(0),[clock,setClock]=useState(Date.now());
 useEffect(()=>{
  if(!running)return;
  setClock(Date.now());
  const timer=setInterval(()=>setClock(Date.now()),50);
  return()=>clearInterval(timer);
 },[running,startedAt]);
 const eligible=people.filter(p=>!p.excluded),pages=Math.max(1,Math.ceil(eligible.length/WINDOW_SIZE));
 const elapsed=running?Math.max(0,clock-startedAt):revealed?VENDING_DRAW_DURATION:0;
 const activePage=running?Math.floor(Math.min(elapsed,8000)/750)%pages:Math.min(page,pages-1);
 let display=eligible.slice(activePage*WINDOW_SIZE,(activePage+1)*WINDOW_SIZE);
 // The complete server-selected winner is supplied even when outside the loaded page.
 // Every slot scans identically until the final mechanical release.
 if(running&&elapsed>=8300&&winner&&!display.some(p=>(p.user||p.name)===(winner.user||winner.name))){
  display=[...display];display[Math.min(display.length,WINDOW_SIZE-1)]=winner;
 }
 const finalIndex=winner?display.findIndex(p=>(p.user||p.name)===(winner.user||winner.name)):-1;
 const scanIndex=running&&elapsed<9000?Math.floor(elapsed/(95+elapsed*.018))%Math.max(1,display.length):-1;
 const dropped=!!winner&&(revealed||running&&elapsed>=9000),dropProgress=Math.max(0,Math.min(1,(elapsed-9000)/2000));
 const dropEase=1-Math.pow(1-dropProgress,3);
 const status=running?(elapsed<8300?'ВЫБИРАЕМ…':elapsed<11000?'ВЫДАЧА БАНКИ':'ЗАБЕРИ УДАЧУ'):revealed?'ВЫДАНО':'WARIOUSS';
 const variant=winner?monsterForParticipant(giveawayId,winner):null;
 return <section className={'vending-draw'+(running?' is-running':'')+(revealed?' is-revealed':'')} aria-label="Автомат розыгрыша">
  <div className="vending-machine">
   <img className="vending-cabinet" src="/vending/machine-white-tall-v3.png" width="971" height="1619" alt="Высокий белый пиксельный автомат с большой витриной и котиком на крыше"/>
   <span className="vending-marquee" aria-hidden="true">{status}</span>
   <div className="vending-glass" aria-label="Банки участников">
    <div className="vending-grid">{Array.from({length:WINDOW_SIZE},(_,index)=>{
     const person=display[index],isDropping=running&&elapsed>=9000&&index===finalIndex;
     return <div className={'vending-slot'+(index===scanIndex?' is-scanned':'')+(isDropping?' is-emptying':'')} key={index}>
      <span className="vending-slot-code">{String(activePage*WINDOW_SIZE+index+1).padStart(2,'0')}</span>
      {person?<><MonsterCan variant={monsterForParticipant(giveawayId,person)}/><span className="vending-nickname" title={person.name}>{person.name}</span></>:<span className="vending-empty-slot">—</span>}
      <span className="vending-coil"/>
     </div>;
    })}</div>
    {!eligible.length&&!running&&<p className="vending-waiting">Банки появятся<br/>вместе с участниками</p>}
    <div className="vending-glass-shine"/>
   </div>
   {dropped&&variant&&<div className="vending-falling-can" style={{top:(66+13.3*dropEase)+'%',transform:`translateX(-50%) rotate(${96*dropEase}deg)`} as CSSProperties}><MonsterCan variant={variant}/></div>}
   <span className={'vending-hatch-light'+(dropped?' is-lit':'')} aria-hidden="true"/>
  </div>
  <div className="vending-under-machine">
   <div className="vending-shelf-controls"><button type="button" aria-label="Предыдущая полка" disabled={running||activePage===0} onClick={()=>setPage(activePage-1)}>←</button><span>Полка {activePage+1} / {pages}</span><button type="button" aria-label="Следующая полка" disabled={running||activePage>=pages-1} onClick={()=>setPage(activePage+1)}>→</button></div>
   <p className="vending-caption">{running?'Автомат выбирает банку…':revealed?'Банка нашла своего владельца':entryWord?<><code>{entryWord}</code> в чате Twitch — и твоя банка в автомате</>:total?'У каждого участника своя случайная банка':'Ожидаем участников'}</p>
   {revealed&&winner&&variant&&<div className="vending-winner" role="status"><MonsterCan variant={variant}/><div><small>ПОБЕДИТЕЛЬ</small><strong>{winner.name}</strong><span>{variant.name}</span></div></div>}
  </div>
 </section>;
}
