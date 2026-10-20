import {getChatGPTUser} from '../../../../chatgpt-auth';
import {getRole} from '../../../../../lib/streamer-auth';
import {getBotConnection,helix} from '../../../../../lib/twitch-api';
import {botDb} from '../../../../../lib/twitch-bot/storage';
import {BOT_CONNECT_URL} from '../../../../../lib/twitch-bot/channels';
import {interval} from '../../../../../lib/fishing/storage';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт.'},401);
 if(!(await getRole(user)).streamer)return reply({error:'Настройка доступна организаторам.'},403);
 const db=botDb(),bot=await db.prepare('SELECT channel,scopes FROM twitch_bot_connections WHERE user=?').bind(user.userId).first<{channel:string;scopes:string}>(),regular=await db.prepare('SELECT channel,scopes FROM twitch_connections WHERE user=?').bind(user.userId).first<{channel:string;scopes:string}>();
 const connection=bot??regular;let scopes:string[]=[];try{scopes=JSON.parse(connection?.scopes??'[]');}catch{}
 const channels=await db.prepare('SELECT b.channel,g.enabled FROM twitch_bot_channels b JOIN fishing_games g ON g.channel=b.channel AND g.owner=b.owner WHERE b.owner=? ORDER BY b.channel').bind(user.userId).all();
 return reply({sender:connection?.channel??null,ready:scopes.includes('user:read:chat')&&scopes.includes('user:write:chat'),connectUrl:BOT_CONNECT_URL,channels:channels.results});
}catch{return reply({error:'Не удалось загрузить каналы бота.'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт.'},401);
 if(!(await getRole(user)).streamer)return reply({error:'Настройка доступна организаторам.'},403);
 const raw=await req.text();if(raw.length>512)return reply({error:'Некорректный запрос.'},400);
 let body:{channel?:unknown};try{body=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}
 if(typeof body?.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(body.channel))return reply({error:'Укажи Twitch-ник канала друга.'},400);
 const channel=body.channel,connection=await getBotConnection(user.userId);
 if(!connection.permissions.includes('user:read:chat')||!connection.permissions.includes('user:write:chat'))return reply({error:'Подключи свой аккаунт бота с чтением и отправкой сообщений.',connectUrl:BOT_CONNECT_URL},409);
 const response=await helix(connection,'users?login='+encodeURIComponent(channel));
 const data=await response.json() as {data:{id:string;login:string;display_name:string}[]},target=data.data.find(x=>x.login.toLowerCase()===channel);
 if(!target||!/^\d+$/.test(target.id))return reply({error:'Такой Twitch-канал не найден.'},404);
 const db=botDb();
 const claim=await db.prepare(`INSERT INTO twitch_bot_channels (channel,owner,broadcaster) SELECT ?,?,?
  WHERE NOT EXISTS (SELECT 1 FROM streamers WHERE channel=? AND email!=?)
  AND NOT EXISTS (SELECT 1 FROM fishing_games WHERE channel=? AND owner!=?)
  AND NOT EXISTS (SELECT 1 FROM twitch_bot_settings WHERE channel=? AND owner!=?)
  AND NOT EXISTS (SELECT 1 FROM chat_channels WHERE channel=? AND owner!=?)
  ON CONFLICT(channel) DO UPDATE SET broadcaster=excluded.broadcaster WHERE twitch_bot_channels.owner=excluded.owner`)
 .bind(channel,user.userId,target.id,channel,user.email.toLowerCase(),channel,user.userId,channel,user.userId,channel,user.userId).run();
 if(!claim.meta.changes)return reply({error:'Этот канал уже настроен другим организатором.'},409);
 await db.batch([
  db.prepare('INSERT INTO fishing_games (channel,owner,host,enabled,next_event) VALUES (?,?,?,1,?) ON CONFLICT(channel) DO UPDATE SET enabled=1 WHERE fishing_games.owner=excluded.owner').bind(channel,user.userId,target.display_name||channel,Date.now()+interval()),
  db.prepare('INSERT INTO twitch_bot_settings (channel,owner,enabled,fish_replies,winner_announcements) VALUES (?,?,1,1,0) ON CONFLICT(channel) DO UPDATE SET enabled=1,fish_replies=1,last_error=NULL,reconnect=0 WHERE twitch_bot_settings.owner=excluded.owner').bind(channel,user.userId),
  db.prepare("UPDATE chat_channels SET collector_token=NULL,collector_until=NULL,status='idle',error=NULL WHERE channel=? AND owner=?").bind(channel,user.userId),
  db.prepare('UPDATE fishing_games SET collector_token=NULL,collector_until=NULL WHERE channel=? AND owner=?').bind(channel,user.userId),
 ]);
 return reply({ok:true,channel,sender:connection.channel});
}catch(e){return reply({error:e instanceof Error?e.message:'Не удалось добавить канал.'},503);}}
