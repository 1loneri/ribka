'use client';
import {useCallback,useEffect,useState} from 'react';
import {ArrowUpRight,RefreshCw} from 'lucide-react';
type Person={userId:string;name:string;login:string;xp:number;messages:number;position:number;title:string};
type Season={channel:string;month:string;label:string;current:boolean;months:{id:string;label:string}[];leaders:Person[];me:Person|null;stats:{participants:number;xp:number;since:number|null};rewardsEnabled:false};
const count=(n:number)=>n.toLocaleString('ru-RU');
export default function LevelSeason({channel,onProfile}:{channel:string;onProfile:(id:string)=>void}){
 const [month,setMonth]=useState(''),[data,setData]=useState<Season|null>(null),[error,setError]=useState('');
 const load=useCallback(async(signal?:AbortSignal)=>{try{const response=await fetch('/api/levels/season?'+new URLSearchParams({channel,...(month?{month}:{})}),{cache:'no-store',signal}),body=await response.json() as Season&{error?:string};if(signal?.aborted)return;if(!response.ok)throw Error(body.error);setData(body);setError('');}catch(e){if(!signal?.aborted)setError(e instanceof Error?e.message:'Не удалось обновить рейтинг.');}},[channel,month]);
 useEffect(()=>{const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;let stopped=false;async function poll(){await load(abort.signal);if(!stopped)timer=setTimeout(poll,10000);}void poll();return()=>{stopped=true;abort.abort();clearTimeout(timer);};},[load]);
 const profile=(person:Person)=><button className="level-open-profile" onClick={()=>onProfile(person.userId)}>{person.name}<ArrowUpRight size={12}/></button>;
 return <div className="level-season"><div className="level-season-heading"><div><span className="levels-kicker">РЕЙТИНГ КАНАЛА</span><h2>Топ месяца</h2><p>Новый месяц, новый старт. Общий уровень сохраняется.</p></div><label>Месяц<select aria-label="Месяц рейтинга" value={month||data?.month||''} onChange={e=>{setMonth(e.target.value);setData(null);}}>{data?.months.map(option=><option value={option.id} key={option.id}>{option.label}</option>)}</select></label></div>
  <div className="level-season-note"><span>Призы пока не назначены</span><span>Рейтинг по опыту · время Таллинна</span></div>
  {error&&<p role="alert" className="level-notice is-error">{error}<button className="level-action" onClick={()=>void load()}><RefreshCw size={13}/>Повторить</button></p>}
  {!data&&!error?<p className="levels-loading" role="status">Загружаем рейтинг…</p>:data&&<><div className="level-season-podium">{[0,1,2].map(i=>{const person=data.leaders[i];return <div key={i} className={'level-season-place'+(i===0?' is-first':'')}><span className="level-season-position">{String(i+1).padStart(2,'0')}</span>{person?<div>{profile(person)}{person.title&&<span className="level-title-tag">{person.title}</span>}<strong>{count(person.xp)} <small>опыта</small></strong></div>:<div><span>Место свободно</span><strong>0 <small>опыта</small></strong></div>}</div>;})}</div>
   <div className="level-season-summary"><span>{count(data.stats.participants)} участников</span><span>{count(data.stats.xp)} опыта за месяц</span>{data.stats.since&&<span>Учёт с {new Date(data.stats.since).toLocaleDateString('ru-RU',{day:'numeric',month:'long'})}</span>}</div>
   {data.me&&<div className="level-season-me"><span>Твоё место <b>#{data.me.position}</b></span><span>{count(data.me.xp)} опыта за месяц</span></div>}
   {data.leaders.length?<ol className="level-season-list">{data.leaders.map(person=><li key={person.userId} className={person.userId===data.me?.userId?'is-me':''}><span>{String(person.position).padStart(2,'0')}</span><div>{profile(person)}{person.title&&<span className="level-title-tag">{person.title}</span>}</div><strong>{count(person.xp)} <small>опыта</small></strong></li>)}</ol>:<div className="level-leaders-empty"><h3>Первое место свободно</h3><p>Опыт начнёт попадать в рейтинг после сообщений в чате во время эфира.</p></div>}
  </>}
 </div>;
}
