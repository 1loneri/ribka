'use client';
import {useEffect,useState} from 'react';
export default function TwitchConnection({context='giveaway'}:{context?:'giveaway'|'fishing'}){
 const [state,setState]=useState<{connected:boolean;channel?:string;canConnect:boolean;canSend:boolean}|null>(null),[message,setMessage]=useState('');
 useEffect(()=>{
  fetch('/api/twitch/status').then(async r=>{if(r.ok)setState(await r.json());}).catch(()=>{});
  const result=new URL(location.href).searchParams.get('twitch');
  if(result&&result!=='player-connected'&&result!=='bot-connected'&&result!=='chat-connected')setMessage(result==='connected'?(context==='fishing'?'Twitch подключён. Запусти рыбалку и включи ответы бота.':'Twitch-канал подключён. Создавай и запускай розыгрыши в студии.'):result);
 },[context]);
 if(!state?.canConnect)return message?<p className="error">{message}</p>:null;
 return <section className="twitch-connection"><div><strong>{state.connected?'Twitch: '+state.channel:'Подключи Twitch-канал'}</strong><p>{message||(state.connected?(context==='fishing'?(state.canSend?'Бот может отвечать на команды от твоего аккаунта.':'Для ответов бота разреши приложению писать в Twitch.'):'Выбирай канал стрима выше. Сбор слова запускается в пульте розыгрыша.'):'Разреши приложению читать и отправлять сообщения и управлять наградами канала.')}</p></div><a className="secondary" href={'/api/twitch/connect'+(context==='fishing'?'?return_to=/fishing':'')} target="_top">{state.connected?'Переподключить':'Подключить Twitch'}</a></section>;
}
