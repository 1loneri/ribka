import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {personalChatConnection} from '../../../../lib/twitch-personal-chat';
import {ChatSendError,sendChatMessage} from '../../../../lib/twitch-chat';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function POST(req:Request){
 try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
  const user=await getChatGPTUser();
  if(!user)return reply({error:'Войди в аккаунт сайта, чтобы писать в чат.'},401);
  const raw=await req.text();
  if(raw.length>4096)return reply({error:'Запрос слишком большой.'},413);
  let body:{channel?:unknown;message?:unknown};
  try{body=JSON.parse(raw);if(!body||typeof body!=='object')throw Error();}catch{return reply({error:'Не удалось прочитать сообщение.'},400);}
  const channel=typeof body.channel==='string'?body.channel.trim().toLowerCase():'';
  const message=typeof body.message==='string'?body.message.trim().replace(/[\r\n]+/g,' '):'';
  if(!/^[a-z0-9_]{1,25}$/.test(channel))return reply({error:'Выбери Twitch-канал.'},400);
  if(!message||Array.from(message).length>500)return reply({error:'Напиши сообщение длиной от 1 до 500 символов.'},400);
  const target=await env.DB!.prepare('SELECT channel FROM streamers WHERE channel=? UNION SELECT channel FROM twitch_bot_channels WHERE channel=?').bind(channel,channel).first();
  if(!target)return reply({error:'Этот канал не добавлен на сайт.'},404);
  let connection:Awaited<ReturnType<typeof personalChatConnection>>;
  try{connection=await personalChatConnection(user.userId);}catch{return reply({error:'Подключи Twitch для отправки сообщения.',reconnect:true},409);}
  const messageId=await sendChatMessage(connection,channel,message);
  return reply({sent:true,messageId,sender:connection.channel,channel});
 }catch(error){
  if(error instanceof ChatSendError)return reply({error:error.message,reconnect:error.reconnect},error.status);
  return reply({error:'Не удалось подтвердить отправку. Проверь чат перед повторной попыткой.'},503);
 }
}
