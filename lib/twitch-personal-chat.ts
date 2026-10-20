import {env} from 'cloudflare:workers';
import {getConnection,getBotConnection,getChatConnection} from './twitch-api';
import {hasChatWriteScope} from './twitch-chat';
export async function personalChatInfo(user:string){
 for(const source of ['chat','streamer','bot'] as const){
  const table={chat:'twitch_chat_connections',streamer:'twitch_connections',bot:'twitch_bot_connections'}[source];
  const row=await env.DB!.prepare('SELECT channel,scopes FROM '+table+' WHERE user=?').bind(user).first<{channel:string;scopes:string}>();
  if(row&&hasChatWriteScope(row.scopes))return {source,channel:row.channel};
 }
 return null;
}
export async function personalChatConnection(user:string){
 const info=await personalChatInfo(user);if(!info)throw Error('Подключи Twitch для отправки сообщения.');
 return info.source==='chat'?getChatConnection(user):info.source==='bot'?getBotConnection(user):getConnection(user);
}
