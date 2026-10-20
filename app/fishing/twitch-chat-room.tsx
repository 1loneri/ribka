'use client';
import './twitch-chat.css';
import TwitchChatComposer from './twitch-chat-composer';
import {useEffect,useRef,useState} from 'react';
import {ArrowDown,Check,Coins,Crown,Fish,Gift,MessageSquare,Pin,RefreshCw,Shield,Star,Vote} from 'lucide-react';
import type {ChatFragment,FeedMessage,FeedSnapshot,Poll,Prediction} from '../../lib/twitch-feed/types';

function Links({text}:{text:string}){
 return <>{text.split(/(https?:\/\/[^\s<>]+)/g).map((part,index)=>{
  if(/^https?:\/\//.test(part))return <a key={index} href={part} target="_blank" rel="noopener noreferrer ugc">{part}</a>;
  return <span key={index}>{part}</span>;
 })}</>;
}
function ChatImage({fragment}:{fragment:ChatFragment}){
 const [failed,setFailed]=useState(false);
 if(failed)return <span>{fragment.text}</span>;
 const src=fragment.type==='gif'?fragment.url:'https://static-cdn.jtvnw.net/emoticons/v2/'+encodeURIComponent(fragment.id??'')+'/default/dark/1.0';
 return <img className={fragment.type==='gif'?'fish-chat-gif':'fish-chat-emote'} src={src} alt={fragment.text} title={fragment.text} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
}
function ChatText({parts,text}:{parts:ChatFragment[];text:string}){
 if(!parts.length)return <Links text={text}/>;
 return <>{parts.map((fragment,index)=>fragment.type==='emote'||fragment.type==='gif'?<ChatImage key={index} fragment={fragment}/>:fragment.type==='cheermote'?<span className="fish-chat-cheer" key={index} title={fragment.bits+' Bits'}><Coins size={13}/>{fragment.text}</span>:fragment.type==='mention'?<span className="fish-chat-mention" key={index}>{fragment.text}</span>:<Links key={index} text={fragment.text}/>)}</>;
}
function Badges({badges}:{badges:string[]}){
 return <>{badges.map((badge,index)=>badge==='broadcaster'?<Crown key={index} size={14} className="fish-chat-badge host" aria-label="Владелец канала"/>:badge==='moderator'?<Shield key={index} size={14} className="fish-chat-badge mod" aria-label="Модератор"/>:badge==='subscriber'||badge==='founder'?<Star key={index} size={14} className="fish-chat-badge sub" aria-label="Подписчик"/>:badge==='vip'?<span key={index} className="fish-chat-badge vip">VIP</span>:badge==='verified'?<Check key={index} size={14} className="fish-chat-badge" aria-label="Подтверждённый аккаунт"/>:null)}</>;
}
function nameColor(color:string){
 if(!/^#[0-9a-f]{6}$/i.test(color))return undefined;
 const rgb=[1,3,5].map(start=>parseInt(color.slice(start,start+2),16));
 const light=(value:number)=>value/255<=.04045?value/255/12.92:((value/255+.055)/1.055)**2.4;
 for(let step=0;step<20&&.2126*light(rgb[0])+.7152*light(rgb[1])+.0722*light(rgb[2])<.25;step++)for(let index=0;index<3;index++)rgb[index]=Math.round(rgb[index]+(255-rgb[index])*.1);
 return 'rgb('+rgb.join(',')+')';
}
function Message({message}:{message:FeedMessage}){
 const special=message.kind!=='message';
 return <div className={'fish-chat-line'+(special?' is-notice':'')+(message.kind==='fish'?' is-game':'')+(message.highlight?' is-highlight':'')}>
  {message.replyTo&&<span className="fish-chat-reply">Ответ @{message.replyTo}</span>}
  <div className="fish-chat-message-head"><span className="fish-chat-author">
   {message.kind==='fish'?<Fish size={15}/>:message.kind==='reward'?<Gift size={15}/>:null}
   <Badges badges={message.badges}/><strong style={message.color?{color:nameColor(message.color)}:undefined}>{message.name}</strong>
   {message.kind==='fish'&&<span className="fish-chat-game-label">Игра</span>}
  </span><time dateTime={new Date(message.created).toISOString()}>{new Date(message.created).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}</time></div>
  <p><ChatText parts={message.fragments} text={message.text}/></p>
  {message.source&&<span className="fish-chat-source">Общий чат · @{message.source}</span>}
 </div>;
}
function countdown(endsAt:number,now:number){const seconds=Math.max(0,Math.ceil((endsAt-now)/1000));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
function PredictionCard({value,now,channel}:{value:Prediction;now:number;channel:string}){
 const open=value.status==='ACTIVE'&&value.endsAt>now,total=value.outcomes.reduce((sum,outcome)=>sum+outcome.points,0);
 const status=open?'Осталось '+countdown(value.endsAt,now):value.status==='RESOLVED'?'Результат':value.status==='CANCELED'?'Отменена':'Приём завершён';
 return <details className="fish-chat-activity is-prediction" open={open}>
  <summary><Coins size={16}/><span><small>Ставка · {status}</small><strong>{value.title}</strong></span></summary>
  <div className="fish-chat-activity-body">{value.outcomes.map((outcome,index)=>{
   const percent=total?Math.round(outcome.points/total*100):0;
   return <div key={outcome.id} className={'fish-chat-outcome'+(value.winner===outcome.id?' is-winner':'')}>
    <div><strong>{value.winner===outcome.id&&<Check size={14}/>} {outcome.title}</strong><span>{percent}%</span></div>
    <div className={'fish-chat-meter tone-'+(index%2)}><span style={{width:percent+'%'}}/></div>
    <p>{outcome.points.toLocaleString('ru')} баллов · {outcome.users.toLocaleString('ru')} участников</p>
   </div>;
  })}{open&&<a href={'https://www.twitch.tv/'+encodeURIComponent(channel)} target="_blank" rel="noreferrer">Сделать ставку в Twitch ↗</a>}</div>
 </details>;
}
function PollCard({value,now,channel}:{value:Poll;now:number;channel:string}){
 const open=value.status==='ACTIVE'&&value.endsAt>now,total=value.choices.reduce((sum,choice)=>sum+choice.votes,0);
 return <details className="fish-chat-activity is-poll" open={open}>
  <summary><Vote size={16}/><span><small>Голосование · {open?countdown(value.endsAt,now):'Завершено'}</small><strong>{value.title}</strong></span></summary>
  <div className="fish-chat-activity-body">{value.choices.map(choice=>{
   const percent=total?Math.round(choice.votes/total*100):0;
   return <div key={choice.id} className="fish-chat-outcome"><div><strong>{choice.title}</strong><span>{percent}%</span></div><div className="fish-chat-meter"><span style={{width:percent+'%'}}/></div><p>{choice.votes.toLocaleString('ru')} голосов</p></div>;
  })}{open&&<a href={'https://www.twitch.tv/'+encodeURIComponent(channel)} target="_blank" rel="noreferrer">Проголосовать в Twitch ↗</a>}</div>
 </details>;
}
function recent(value:Prediction|Poll|null|undefined,now:number){return !!value&&(value.status==='ACTIVE'||value.status==='LOCKED'||!!value.finishedAt&&now-value.finishedAt<600000);}

export default function TwitchChatRoom({channel,title="Чат Рыбки",maintainConnection=false,showHeader=true}:{channel:string;title?:string;maintainConnection?:boolean;showHeader?:boolean}){
 const [feed,setFeed]=useState<FeedSnapshot|null>(null),[error,setError]=useState(''),[now,setNow]=useState(Date.now()),[hasNew,setHasNew]=useState(false);
 const thread=useRef<HTMLDivElement>(null),atBottom=useRef(true),refresh=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let alive=true,inFlight=false,again=false;let debounce:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  async function load(){
   if(inFlight){again=true;return;}inFlight=true;
   try{
    const response=await fetch('/api/twitch/feed?channel='+encodeURIComponent(channel),{cache:'no-store',signal:controller.signal});
    const result=await response.json() as FeedSnapshot&{error:string};
    if(!response.ok)throw Error(result.error);if(alive){setFeed(result);setNow(Date.now());setError('');}
   }catch(problem){if(alive&&!controller.signal.aborted)setError(problem instanceof Error&&problem.name!=='TypeError'?problem.message:'Не удалось обновить чат.');}
   finally{inFlight=false;if(again&&alive){again=false;clearTimeout(debounce);debounce=setTimeout(()=>{debounce=undefined;void load();},450);}}
  }
  function updated(event:Event){if((event as CustomEvent<{channel:string}>).detail?.channel!==channel||debounce)return;debounce=setTimeout(()=>{debounce=undefined;void load();},450);}
  refresh.current=()=>void load();void load();
  const polling=setInterval(()=>void load(),3000),clock=setInterval(()=>setNow(Date.now()),1000);
  window.addEventListener('twitch-feed-update',updated);
  return()=>{alive=false;controller.abort();clearInterval(polling);clearInterval(clock);clearTimeout(debounce);window.removeEventListener('twitch-feed-update',updated);};
 },[channel]);
 useEffect(()=>{
  if(!maintainConnection||!feed?.canCollect)return;
  let stopped=false,source:EventSource|undefined,timer:ReturnType<typeof setTimeout>|undefined;
  const retry=()=>{if(!stopped)timer=setTimeout(()=>void start(),8000);};
  async function start(){
   try{const response=await fetch('/api/twitch/feed?channel='+encodeURIComponent(channel),{cache:'no-store'});const snapshot=await response.json() as FeedSnapshot;
    if(stopped)return;if(!response.ok){retry();return;}if(!snapshot.canCollect)return;if(snapshot.live){retry();return;}
    source=new EventSource('/api/twitch/feed/live?channel='+encodeURIComponent(channel)+'&fish=0');
    source.onmessage=event=>{if(stopped)return;const value=JSON.parse(event.data) as {status:string;reconnect?:boolean};refresh.current();if(value.status==='error'||value.status==='closed'){source?.close();if(!value.reconnect)retry();}};
    source.onerror=()=>{source?.close();retry();};
   }catch{retry();}
  }
  void start();return()=>{stopped=true;clearTimeout(timer);source?.close();};
 },[channel,maintainConnection,feed?.canCollect]);
 const newest=feed?.messages.at(-1)?.seq;
 useEffect(()=>{const target=thread.current;if(!target)return;if(atBottom.current){target.scrollTop=target.scrollHeight;setHasNew(false);}else setHasNew(true);},[newest]);
 const state=feed?.state??{},live=!!feed?.live&&feed.collectorUntil>now,pin=state.pin&&(!state.pin.endsAt||state.pin.endsAt>now)?state.pin:null;
 const warnings=[...(state.warnings??[]),...(state.subscriptionWarnings??[])],settings=state.settings;
 function bottom(){if(thread.current)thread.current.scrollTop=thread.current.scrollHeight;atBottom.current=true;setHasNew(false);}
 return <section className={'fish-chat-panel fish-native-chat'+(showHeader?'':' fish-chat-no-heading')} aria-label={title+' — '+channel}>
  {showHeader&&<div className="fish-media-heading"><div><MessageSquare size={18}/><h2>{title} <span>@{channel}</span></h2></div><button className="fish-chat-refresh" onClick={()=>refresh.current()} aria-label="Обновить чат" title="Обновить чат"><RefreshCw size={16}/></button></div>}
  <div className={'fish-chat-connection'+(live?' is-live':'')} role="status"><span/>{live?'Синхронизирован с Twitch':feed?.configured?feed.canCollect?'Подключаем Twitch…':'Ждём подключения стримера':'Нужно подключить Twitch'}{!showHeader&&<button className="fish-chat-refresh" onClick={()=>refresh.current()} aria-label="Обновить чат" title="Обновить чат"><RefreshCw size={16}/></button>}</div>
  {pin&&<details className="fish-chat-pin" open><summary><Pin size={15}/><span>Закреплено · {pin.name}</span></summary><p><ChatText parts={pin.fragments} text={pin.text}/></p></details>}
  {(recent(state.prediction,now)||recent(state.poll,now))&&<div className="fish-chat-activities">
   {state.prediction&&recent(state.prediction,now)&&<PredictionCard value={state.prediction} now={now} channel={channel}/>}
   {state.poll&&recent(state.poll,now)&&<PollCard value={state.poll} now={now} channel={channel}/>}
  </div>}
  {settings&&(settings.slow>0||settings.followers!==null||settings.subscribers||settings.emotes)&&<div className="fish-chat-modes">{settings.slow>0&&<span>Пауза {settings.slow} с</span>}{settings.followers!==null&&<span>Для фолловеров</span>}{settings.subscribers&&<span>Для подписчиков</span>}{settings.emotes&&<span>Только эмоуты</span>}</div>}
  <div className="fish-chat-thread" ref={thread} role="log" aria-label="Сообщения Twitch" aria-live="polite" aria-relevant="additions" tabIndex={0} onScroll={()=>{const target=thread.current;if(target){atBottom.current=target.scrollHeight-target.scrollTop-target.clientHeight<70;if(atBottom.current)setHasNew(false);}}}>
   {feed?.messages.length?feed.messages.map(message=><Message key={message.id} message={message}/>):<div className="fish-chat-empty"><MessageSquare size={28}/><p>{feed?'Здесь появятся новые сообщения зрителей и ботов из Twitch.':'Подключаем чат…'}</p><span>{feed?.configured?'Лента собирается с момента подключения.':'Стримеру нужно подключить Twitch-аккаунт.'}</span></div>}
  </div>
  {hasNew&&<button className="fish-chat-new" onClick={bottom}>Новые сообщения <ArrowDown size={15}/></button>}
  {(error||feed?.error)&&<p className="fish-chat-error" role="alert">{error||feed?.error}</p>}
  {!!warnings.length&&<details className="fish-chat-warnings"><summary>Не все события обновились</summary>{warnings.map(warning=><p key={warning}>{warning}</p>)}</details>}
  {feed?.canCollect&&(feed.needsPermissions||!feed.configured||feed.error)&&<div className="fish-chat-sync-permission"><p>{feed.needsPermissions?'Подключи закреп, ставки и голосования из Twitch.':'Переподключи Twitch, чтобы восстановить синхронизацию.'}</p><a href={'/api/twitch/connect?return_to='+encodeURIComponent(typeof window==='undefined'?'/fishing':window.location.pathname)} target="_top">Подключить события Twitch</a></div>}
  <TwitchChatComposer channel={channel} onSent={()=>refresh.current()}/>
 </section>;
}
