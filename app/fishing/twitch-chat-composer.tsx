'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {FormEvent,KeyboardEvent} from 'react';
import {Send} from 'lucide-react';

type ChatAccess={authenticated:boolean;connected:boolean;canSend:boolean;channel:string|null};
export default function TwitchChatComposer({channel,onSent}:{channel:string;onSent?:()=>void}){
 const [access,setAccess]=useState<ChatAccess|null>(null),[accessError,setAccessError]=useState(''),[retry,setRetry]=useState(0),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false);
 const input=useRef<HTMLTextAreaElement>(null),sending=useRef(false),id=useId();
 useEffect(()=>{
  const controller=new AbortController();setAccessError('');
  fetch('/api/twitch/chat/access',{cache:'no-store',signal:controller.signal}).then(async response=>{const result=await response.json() as ChatAccess&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted)setAccess(result);}).catch(error=>{if(!controller.signal.aborted)setAccessError(error.message||'Не удалось проверить подключение Twitch.');});
  return()=>controller.abort();
 },[retry]);
 async function send(event?:FormEvent){
  event?.preventDefault();const message=draft.trim();if(!access?.canSend||!message||sending.current)return;
  sending.current=true;setBusy(true);setNotice('');setFailed(false);
  try{
   const response=await fetch('/api/twitch/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,message}),signal:AbortSignal.timeout(15000)});
   const result=await response.json() as {sent?:boolean;error?:string;reconnect?:boolean};
   if(result.reconnect)setAccess(current=>current?{...current,canSend:false}:current);
   if(!response.ok||result.sent!==true)throw Error(result.error||'Не удалось подтвердить отправку. Проверь чат перед повторной попыткой.');
   setDraft('');setNotice('Отправлено');onSent?.();
  }catch(error){setFailed(true);setNotice(error instanceof Error&&error.name!=='TimeoutError'&&error.name!=='TypeError'?error.message:'Не удалось подтвердить отправку. Проверь чат перед повторной попыткой.');}
  finally{sending.current=false;setBusy(false);}
 }
 useEffect(()=>{if(!busy&&access?.canSend&&notice&&!failed)input.current?.focus();},[busy,access?.canSend,notice,failed]);
 function onKeyDown(event:KeyboardEvent<HTMLTextAreaElement>){if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}
 return <form className="fish-chat-composer" onSubmit={send} aria-label="Сообщение в Twitch">
  {access?.canSend?<>
   <div className="fish-composer-label"><label htmlFor={id}>@{access.channel}</label><span>{Array.from(draft).length}/500</span></div>
   <textarea id={id} ref={input} rows={1} maxLength={500} value={draft} disabled={busy} onChange={event=>{setDraft(event.target.value);setNotice('');}} onKeyDown={onKeyDown} placeholder="Отправить сообщение" autoComplete="off"/>
   <div className="fish-composer-actions"><button className="fish-chat-send" type="submit" disabled={busy||!draft.trim()}><Send size={15}/>{busy?'Отправляем…':'Отправить'}</button></div>
  </>:access?<a className="fish-chat-connect" href={'/api/twitch/connect?purpose=chat&return_to='+encodeURIComponent(typeof window==='undefined'?'/fishing':window.location.pathname)+'&channel='+encodeURIComponent(channel)} target="_top">ПОДКЛЮЧИТЕ ТВИЧ ДЛЯ ОТПРАВКИ СООБЩЕНИЯ</a>:!accessError?<p className="fish-composer-note" role="status">Проверяем подключение Twitch…</p>:null}
  {accessError&&<div className="fish-composer-access"><p role="alert">{accessError}</p><button type="button" onClick={()=>setRetry(n=>n+1)}>Повторить</button></div>}
  {notice&&<p className={'fish-composer-note'+(failed?' is-error':'')} role={failed?'alert':'status'}>{notice}</p>}
 </form>;
}
