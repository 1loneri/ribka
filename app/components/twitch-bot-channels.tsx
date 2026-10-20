'use client';
import {useEffect,useState} from 'react';
type State={sender:string|null;ready:boolean;channels:{channel:string;enabled:number}[];error?:string};
export default function TwitchBotChannels({selected,onSelect,context="fishing"}:{selected:string;onSelect:(channel:string)=>void;context?:"fishing"|"studio"}){
 const [state,setState]=useState<State|null>(null),[channel,setChannel]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/twitch/bot/channels',{cache:'no-store'}),d=await r.json() as State;if(!r.ok)throw Error(d.error??'Не удалось загрузить каналы.');setState(d);}
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 async function add(event:React.FormEvent){event.preventDefault();setBusy(true);setError('');try{
  const target=channel.trim().replace(/^@/,'').toLowerCase(),r=await fetch('/api/twitch/bot/channels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:target})}),d=await r.json() as {channel:string;error?:string};
  if(!r.ok)throw Error(d.error??'Не удалось добавить канал.');await load();setChannel('');onSelect(d.channel);
 }catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className={"fish-owner-panel fish-friend-bot"+(context==="studio"?" studio-friend-channels":"")}><div className="fish-panel-heading"><h2>{context==="studio"?"Добавить стрим и чат друга":"Бот в канале друга"}</h2></div>
  <p className="fish-small-note">{context==="studio"?"Укажи канал друга, где ты пишешь и модерируешь со своего Twitch-ника. Его аккаунт подключать не нужно.":"Твой аккаунт отвечает в чате друга. Рыба, монеты и садок сохраняются на сайте; другу подключать аккаунт не нужно."}</p>
  <p className="fish-bot-sender">{state?.ready?(context==='studio'?'Твой аккаунт: @':'Бот: @')+state.sender:'Подключи свой Twitch-аккаунт для бота.'}</p>
  <a className="fish-secondary-button" href={"/api/twitch/connect?purpose=bot&return_to="+(context==="studio"?"/studio":"/fishing")} target="_top">{state?.ready?'Сменить аккаунт бота':'Подключить мой Twitch'}</a>
  <form className="fish-friend-form" onSubmit={add}><label htmlFor="friend-channel">Twitch-ник друга</label><input id="friend-channel" value={channel} onChange={e=>setChannel(e.target.value)} placeholder="Ник канала" pattern="@?[A-Za-z0-9_]{1,25}" maxLength={26} required/><button className="fish-primary-button" disabled={busy||!state?.ready}>{busy?'Подключаем…':context==='studio'?'Добавить канал':'Запустить в канале'}</button></form>
  {!!state?.channels.length&&<div className="fish-friend-channels">{state.channels.map(room=><button type="button" className="fish-secondary-button" key={room.channel} aria-pressed={selected===room.channel} onClick={()=>onSelect(room.channel)}>@{room.channel}{selected===room.channel?' · выбран':''}</button>)}</div>}
  <p className="fish-small-note">{context==="studio"?"Выбери этот канал при создании розыгрыша. Для сбора слова держи пульт розыгрыша открытым.":"Оставь эту страницу открытой для команд из Twitch. Если чат ограничивает сообщения, друг может дать твоему аккаунту права модератора."}</p>
  {error&&<p className="error" role="alert">{error}</p>}
 </section>;
}
