import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRole} from '../../../../lib/streamer-auth';
import {botRoom,canOperateRoom,channelConnection,storedChannelConnection} from '../../../../lib/twitch-bot/channels';
import {hasChatWriteScope} from '../../../../lib/twitch-chat';
import {botDb,botSettings} from '../../../../lib/twitch-bot/storage';
import {chatMode} from '../../../../lib/twitch-bot/ai';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function GET(req?:Request) {
  try {
    const user=await getChatGPTUser();if(!user)return reply({error:'Войди, чтобы управлять ботом.'},401);
    const role=await getRole(user);if(!role.streamer)return reply({error:'Управлять ботом может только стример.'},403);
    const channel=req?new URL(req.url).searchParams.get('channel')??role.streamer.channel:role.streamer.channel,db=botDb();
    if(!await canOperateRoom(user,channel))return reply({error:'Нет доступа к этому боту.'},403);
    const [settings,connection,feed,game]=await Promise.all([
      botSettings(channel,user.userId),
      storedChannelConnection(user.userId,channel),
      db.prepare('SELECT status,collector_until FROM chat_channels WHERE channel=? AND owner=?').bind(channel,user.userId).first<{status:string;collector_until:number|null}>(),
      db.prepare('SELECT enabled,collector_until FROM fishing_games WHERE channel=? AND owner=?').bind(channel,user.userId).first<{enabled:number;collector_until:number|null}>(),
    ]);
    return reply({channel,enabled:!!settings?.enabled,fishReplies:settings?!!settings.fish_replies:true,winnerAnnouncements:settings?!!settings.winner_announcements:true,chatReplies:settings?!!settings.ai_replies:true,chatMode:chatMode(),chatError:settings?.ai_error??'',
      sender:connection?.channel??channel,friend:!!await botRoom(channel),canSend:!!connection&&hasChatWriteScope(connection.scopes),connected:feed?.status==='ready'&&!!feed.collector_until&&feed.collector_until>Date.now(),
      fishingActive:!!game?.enabled&&!!game.collector_until&&game.collector_until>Date.now(),lastSent:settings?.last_sent??0,error:settings?.last_error??'',reconnect:!!settings?.reconnect});
  } catch {return reply({error:'Не удалось загрузить настройки бота.'},503);}
}
export async function POST(req:Request) {
  try {
    if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
    const user=await getChatGPTUser();if(!user)return reply({error:'Требуется вход.'},401);
    const role=await getRole(user);if(!role.streamer)return reply({error:'Управлять ботом может только стример.'},403);
    const raw=await req.text();if(raw.length>1024)return reply({error:'Слишком большой запрос.'},413);
    let body:unknown;try{body=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}
    if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Некорректный запрос.'},400);
    const b=body as Record<string,unknown>;
    if(typeof b.enabled!=='boolean'||typeof b.fishReplies!=='boolean'||typeof b.winnerAnnouncements!=='boolean'||(b.chatReplies!==undefined&&typeof b.chatReplies!=='boolean'))return reply({error:'Проверь настройки бота.'},400);
    const channel=typeof b.channel==='string'?b.channel:role.streamer.channel;
    if(!await canOperateRoom(user,channel))return reply({error:'Нет доступа к этому боту.'},403);
    if(b.enabled){
      const c=await channelConnection(user.userId,channel);
      if(!c.permissions.includes('user:read:chat')||!c.permissions.includes('user:write:chat'))return reply({error:'Переподключи свой Twitch с доступом к чтению и отправке сообщений.',reconnect:true},409);
    }
    const db=botDb(),chatReplies=typeof b.chatReplies==='boolean'?Number(b.chatReplies):(await botSettings(channel,user.userId))?.ai_replies??1;
    const saved=await db.prepare(`INSERT INTO twitch_bot_settings (channel,owner,enabled,fish_replies,winner_announcements,ai_replies) VALUES (?,?,?,?,?,?)
      ON CONFLICT(channel) DO UPDATE SET enabled=excluded.enabled,fish_replies=excluded.fish_replies,winner_announcements=excluded.winner_announcements,ai_replies=excluded.ai_replies,ai_error=NULL,ai_retry_after=0,last_error=NULL,reconnect=0
      WHERE twitch_bot_settings.owner=excluded.owner`).bind(channel,user.userId,Number(b.enabled),Number(b.fishReplies),Number(b.winnerAnnouncements),chatReplies).run();
    if(!saved.meta.changes)return reply({error:'Этот канал подключён другим владельцем.'},403);
    await db.batch([
      db.prepare("UPDATE twitch_bot_messages SET status='cancelled' WHERE channel=? AND status='queued' AND (?=0 OR (kind='fish' AND ?=0) OR (kind='winner' AND ?=0) OR (kind='ai' AND ?=0))").bind(channel,Number(b.enabled),Number(b.fishReplies),Number(b.winnerAnnouncements),chatReplies),
      db.prepare("UPDATE twitch_bot_ai_requests SET status='cancelled' WHERE channel=? AND status IN ('generating','queued') AND (?=0 OR ?=0)").bind(channel,Number(b.enabled),chatReplies),
      db.prepare('DELETE FROM twitch_bot_ai_requests WHERE channel=? AND created<?').bind(channel,Date.now()-7*86400000),
      db.prepare("DELETE FROM twitch_bot_messages WHERE channel=? AND created<? AND status!='queued'").bind(channel,Date.now()-7*86400000),
    ]);
    return reply({ok:true});
  } catch(error) {return reply({error:error instanceof Error?error.message:'Не удалось изменить настройки бота.'},503);}
}
