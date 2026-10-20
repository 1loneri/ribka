'use client';
import FishingRig from './fishing-rig';
import {useState,useEffect,useCallback,type CSSProperties} from 'react';
export type AnimationPerson={user?:string;name:string;avatar?:string|null;excluded?:number};
function contestants(people:AnimationPerson[],winner:AnimationPerson|null,count:number){
 const list=people.filter(p=>!p.excluded&&p.name!==winner?.name).slice(0,count-(winner?1:0));
 if(winner)list.splice(winner.name.split('').reduce((sum,c)=>sum+c.charCodeAt(0),0)%(list.length+1),0,winner);
 return list;
}
function FishIcon({tone}:{tone:number}){return <svg viewBox="0 0 56 28" aria-hidden="true"><path d="M8 14 0 4v20Zm0 0c4-11 28-17 43 0-15 17-39 11-43 0Z" fill={['#81b4bc','#c2a56a','#a79abf','#91ad86','#ba806f'][tone%5]}/><path d="m23 7 8-7 5 9M22 21l8 7 4-8" fill="#ffffff33"/><circle cx="42" cy="11" r="2" fill="#182a30"/><path d="M34 9v10" stroke="#182a3055" strokeWidth="2"/></svg>;}
export function PondDraw({people,winner,running=false,total=people.length,onMore,busy=false}:{people:AnimationPerson[];winner:AnimationPerson|null;running?:boolean;total?:number;onMore?:()=>void;busy?:boolean}){
 const list=contestants(people,winner,12);
 const [caught,setCaught]=useState(false),markCaught=useCallback(()=>setCaught(true),[]);
 useEffect(()=>{setCaught(false);},[running,winner?.name]);
 return <><div className={'raffle-pond'+(running?' is-fishing':'')+(caught?' has-catch':'')} role="status" aria-label={running?'Рыбки участников подплывают к крючку':'Пруд участников'}>
  <div className="pond-moon"/><div className="pond-mist"/><div className="pond-bank"><span/><span/><span/></div>
  <svg className="pond-fisher" viewBox="0 0 220 190" aria-hidden="true"><image href="/fisher-wowko-complete.png" x="40" y="0" width="180" height="180"/></svg>
  <div className="pond-water"><div className="pond-water-surface"><div className="pond-water-lines"/><div className="pond-depth"/></div>
   {list.map((p,i)=><div className={'pond-fish'+(running&&p.name===winner?.name?' fish-chosen':'')} key={p.name} style={{'--fish-x':(12+i*23%73)+'%','--fish-y':(28+i*17%48)+'%','--fish-chase-x':(43+(12+i*23%73)*.12)+'%','--fish-chase-y':(28+(28+i*17%48)*.12)+'%','--fish-delay':(-i*.37)+'s','--fish-direction':i%2?-1:1} as CSSProperties}><div className="pond-fish-swim"><FishIcon tone={i}/><span>{p.name}</span></div></div>)}
   {!list.length&&<p className="pond-waiting">Рыбки появятся вместе с участниками</p>}
  </div><FishingRig running={running} onCaught={markCaught}/><div className="pond-reeds reeds-left"/><div className="pond-reeds reeds-right"/><div className="pond-caption"><span>{running?'ЗАБРОС УДАЧИ':'ПРУД УЧАСТНИКОВ'}</span><small>{running?'Кто попадётся на крючок?':'Каждая рыбка — участник розыгрыша'}</small></div>
 </div><PondParticipants people={people} winner={winner?.name??null} revealed={caught} total={total} onMore={onMore} busy={busy}/></>;
}
export function PondParticipants({people,winner,revealed,total=people.length,onMore,busy=false}:{people:AnimationPerson[];winner:string|null;revealed:boolean;total?:number;onMore?:()=>void;busy?:boolean}){return <section className="pond-participant-list" aria-label="Участники рыбалки"><div className="pond-participant-heading"><h3>Участники</h3><span>{total}</span></div><div className="pond-participant-names">{people.map((person,index)=><div key={person.name+index} className={"pond-participant-name"+(person.excluded?" is-excluded":"")+(revealed&&person.name===winner?" is-caught":"")}><small>{index+1}</small><span title={person.name}>{person.name}</span>{person.excluded?<em>Исключён</em>:revealed&&person.name===winner?<em>На крючке</em>:null}</div>)}</div>{!people.length&&<p>Участников пока нет.</p>}{people.length<total&&onMore&&<button className="secondary" disabled={busy} onClick={onMore}>Показать ещё · {people.length}/{total}</button>}</section>;}
function Avatar({person}:{person:AnimationPerson}){const [failed,setFailed]=useState(false);return <span className="race-avatar">{person.avatar&&!failed?<img src={person.avatar} alt={person.name} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<span>{person.name[0]?.toUpperCase()}</span>}</span>;}
export function RaceDraw({people,winner,running=false}:{people:AnimationPerson[];winner:AnimationPerson|null;running?:boolean}){
 const list=contestants(people,winner,8);
 return <div className={'raffle-race'+(running?' is-racing':'')} role="status" aria-label={running?'Гонка Twitch-аватарок участников':'Стартовые дорожки участников'}>
  <div className="race-heading"><span>{running?'ГОНКА НАЧАЛАСЬ':'НА СТАРТЕ'}</span><strong>До последнего метра</strong><small>СТАРТ <span>ФИНИШ</span></small></div>
  <div className="race-tracks">{list.map((p,i)=><div className="race-lane" key={p.name}><span className="race-lane-number">{String(i+1).padStart(2,'0')}</span><div className={'race-runner runner-'+i%4+(running&&p.name===winner?.name?' race-chosen':'')} style={{'--race-delay':(i*.055)+'s'} as CSSProperties}><Avatar person={p}/><strong>{p.name}</strong><span className="race-trail"/></div><span className="race-finish"/></div>)}{!list.length&&<p className="pond-waiting">Дорожки появятся вместе с участниками</p>}</div>
  <p className="race-caption">{running?'Кто первым пересечёт финишную черту?':'Twitch-аватарки участников · случайный выбор победителя'}</p>
 </div>;
}
