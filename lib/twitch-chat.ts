import {env} from 'cloudflare:workers';
import type {getConnection} from './twitch-api';

export const CHAT_CONNECT_URL='/api/twitch/connect?purpose=chat&return_to=/fishing';
export function hasChatWriteScope(scopes:string){
 try{const permissions:unknown=JSON.parse(scopes);return Array.isArray(permissions)&&permissions.includes('user:write:chat');}catch{return false;}
}
export class ChatSendError extends Error{
 constructor(message:string,public status:number,public reconnect=false){super(message);}
}

async function chatRequest(connection:Awaited<ReturnType<typeof getConnection>>,path:string,options:RequestInit={}){
 const response=await fetch('https://api.twitch.tv/helix/'+path,{
  ...options,headers:{'Client-Id':env.TWITCH_CLIENT_ID!,Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000),
 });
 if(response.status===401)throw new ChatSendError('Переподключи Twitch и разреши отправку сообщений.',409,true);
 if(response.status===403)throw new ChatSendError('Twitch запретил отправку в этот канал. Проверь ограничения чата.',403);
 if(response.status===429)throw new ChatSendError('Слишком много сообщений. Подожди немного и отправь снова.',429);
 if(response.status===422)throw new ChatSendError('Сообщение слишком длинное. Максимум — 500 символов.',422);
 if(!response.ok)throw new ChatSendError('Twitch не принял запрос. Сообщение сохранено в поле ввода.',502);
 return response;
}

export async function sendChatMessage(connection:Awaited<ReturnType<typeof getConnection>>,channel:string,message:string,replyTo?:string){
 if(!connection.permissions.includes('user:write:chat'))throw new ChatSendError('Разреши отправку сообщений в Twitch.',409,true);
 let broadcaster=connection.broadcaster;
 if(channel!==connection.channel){
  const response=await chatRequest(connection,'users?login='+encodeURIComponent(channel));
  const users=await response.json() as {data?:{id:string;login:string}[]};
  const target=users.data?.find(user=>user.login.toLowerCase()===channel);
  if(!target?.id)throw new ChatSendError('Twitch-канал не найден.',404);
  broadcaster=target.id;
 }
 const response=await chatRequest(connection,'chat/messages',{method:'POST',body:JSON.stringify({broadcaster_id:broadcaster,sender_id:connection.broadcaster,message,...(replyTo?{reply_parent_message_id:replyTo}:{})})});
 const result=await response.json() as {data?:{message_id:string;is_sent:boolean;drop_reason?:{code:string;message:string}|null}[]};
 const sent=result.data?.[0];
 if(sent?.is_sent!==true){
  const reason=sent?.drop_reason;
  throw new ChatSendError(reason?.code==='automod_held'?'Сообщение ожидает проверки модератором Twitch.':reason?.message?'Twitch не отправил сообщение: '+reason.message:'Twitch не отправил сообщение. Проверь ограничения чата.',422);
 }
 return sent.message_id;
}
