import {env} from 'cloudflare:workers';
import {ChatSendError,sendChatMessage} from '../twitch-chat';
import type {getConnection} from '../twitch-api';
import {BOT_INTERVAL} from './messages';

export const botDb = () => {
  if (!env.DB) throw Error('Бот временно недоступен.');
  return env.DB;
};
export type BotSettings = {channel:string;owner:string;enabled:number;fish_replies:number;winner_announcements:number;ai_replies:number;ai_error:string|null;ai_retry_after:number;next_send:number;sending_until:number;send_token:string|null;last_sent:number;last_error:string|null;reconnect:number};
export async function botSettings(channel:string,owner:string) {
  return botDb().prepare('SELECT * FROM twitch_bot_settings WHERE channel=? AND owner=?').bind(channel,owner).first<BotSettings>();
}

// A durable claim prevents two open tabs from sending the same reply.
// An uncertain delivery is never retried: Twitch may already have received it.
export async function flushBot(connection:Awaited<ReturnType<typeof getConnection>>,channel=connection.channel) {
  const db=botDb(),now=Date.now(),token=crypto.randomUUID();
  const claim=await db.prepare(`UPDATE twitch_bot_settings SET send_token=?,sending_until=?,next_send=?
    WHERE channel=? AND owner=? AND enabled=1 AND next_send<=? AND sending_until<=?
    AND (EXISTS (SELECT 1 FROM streamers s JOIN twitch_connections c ON lower(c.email)=s.email WHERE c.user=? AND c.channel=s.channel AND s.channel=?) OR EXISTS (SELECT 1 FROM twitch_bot_channels b JOIN streamers s ON s.email=? WHERE b.owner=? AND b.channel=?))
    AND EXISTS (SELECT 1 FROM twitch_bot_messages m WHERE m.channel=twitch_bot_settings.channel AND m.status='queued' AND m.ready_at<=? AND m.expires>?)`)
    .bind(token,now+15000,now+BOT_INTERVAL,channel,connection.user,now,now,connection.user,channel,connection.email.toLowerCase(),connection.user,channel,now,now).run();
  if(!claim.meta.changes)return;
  let message:{id:string;text:string;kind:string;reply_to:string|null}|null=null;
  try {
    await db.prepare("UPDATE twitch_bot_messages SET status='expired' WHERE channel=? AND status='queued' AND expires<=?").bind(channel,now).run();
    message=await db.prepare(`SELECT id,text,kind,reply_to FROM twitch_bot_messages m WHERE channel=? AND status='queued' AND ready_at<=? AND expires>?
      AND EXISTS (SELECT 1 FROM twitch_bot_settings s WHERE s.channel=m.channel AND s.owner=? AND s.enabled=1 AND s.send_token=? AND ((m.kind='fish' AND s.fish_replies=1) OR (m.kind='winner' AND s.winner_announcements=1) OR (m.kind='command' AND EXISTS(SELECT 1 FROM chat_channels c WHERE c.channel=s.channel AND c.owner=s.owner AND c.collector_until>?)) OR (m.kind='ai' AND s.ai_replies=1 AND EXISTS(SELECT 1 FROM fishing_games g WHERE g.channel=s.channel AND g.owner=s.owner AND g.enabled=1 AND g.collector_until>?))))
      ORDER BY CASE kind WHEN 'winner' THEN 0 WHEN 'fish' THEN 1 ELSE 2 END,created,id LIMIT 1`).bind(channel,now,now,connection.user,token,now,now).first<{id:string;text:string;kind:string;reply_to:string|null}>();
    if(!message)return;
    const sending=await db.prepare(`UPDATE twitch_bot_messages SET status='sending' WHERE id=? AND channel=? AND status='queued'
      AND EXISTS (SELECT 1 FROM twitch_bot_settings s WHERE s.channel=twitch_bot_messages.channel AND s.owner=? AND s.enabled=1 AND s.send_token=? AND ((kind='fish' AND s.fish_replies=1) OR (kind='winner' AND s.winner_announcements=1) OR (kind='command' AND EXISTS(SELECT 1 FROM chat_channels c WHERE c.channel=s.channel AND c.owner=s.owner AND c.collector_until>?)) OR (kind='ai' AND s.ai_replies=1 AND EXISTS(SELECT 1 FROM fishing_games g WHERE g.channel=s.channel AND g.owner=s.owner AND g.enabled=1 AND g.collector_until>?))))`)
      .bind(message.id,channel,connection.user,token,Date.now(),Date.now()).run();
    if(!sending.meta.changes)return;
    const messageId=await sendChatMessage(connection,channel,message.text,message.reply_to??undefined);
    await db.batch([
      db.prepare("UPDATE twitch_bot_messages SET status='sent',twitch_id=? WHERE id=? AND status='sending'").bind(messageId,message.id),
      ...(message.kind==='ai'?[db.prepare("UPDATE twitch_bot_ai_requests SET status='sent' WHERE id=? AND status='queued'").bind(message.id)]:[]),
      db.prepare('UPDATE twitch_bot_settings SET last_sent=?,last_error=NULL,reconnect=0 WHERE channel=? AND owner=? AND send_token=?').bind(Date.now(),channel,connection.user,token),
    ]);
  } catch(error) {
    const known=error instanceof ChatSendError;
    await db.batch([
      ...(message?[db.prepare("UPDATE twitch_bot_messages SET status='failed' WHERE id=? AND status='sending'").bind(message.id)]:[]),
      ...(message?.kind==='ai'?[db.prepare("UPDATE twitch_bot_ai_requests SET status='failed' WHERE id=? AND status='queued'").bind(message.id)]:[]),
      db.prepare('UPDATE twitch_bot_settings SET last_error=?,reconnect=?,next_send=? WHERE channel=? AND owner=? AND send_token=?')
        .bind(known?error.message:'Ответ не подтверждён Twitch. Проверь чат; повторная отправка отключена.',known&&error.reconnect?1:0,Date.now()+30000,channel,connection.user,token),
    ]).catch(()=>{});
  } finally {
    await db.prepare('UPDATE twitch_bot_settings SET send_token=NULL,sending_until=0 WHERE channel=? AND owner=? AND send_token=?').bind(channel,connection.user,token).run().catch(()=>{});
  }
}

// A website click keeps a short-lived drain alive even without a collector tab.
// The same durable lock and Twitch rate limit apply to all senders.
export async function finishBotReply(connection:Awaited<ReturnType<typeof getConnection>>,id:string,channel=connection.channel){
  const db=botDb(),deadline=Date.now()+18000;
  for(let attempt=0;attempt<10&&Date.now()<deadline;attempt++){
    const pending=await db.prepare("SELECT id,kind FROM twitch_bot_messages WHERE id=? AND channel=? AND status='queued' AND expires>?").bind(id,channel,Date.now()).first<{id:string;kind:string}>();
    if(!pending)return;
    const settings=await botSettings(channel,connection.user);
    if(!settings?.enabled||(pending.kind==='fish'&&!settings.fish_replies)||(pending.kind==='winner'&&!settings.winner_announcements)||(pending.kind==='ai'&&!settings.ai_replies))return;
    const delay=Math.max(0,Math.max(settings.next_send,settings.sending_until)-Date.now());
    if(Date.now()+delay>=deadline)return;
    if(delay)await new Promise<void>(resolve=>setTimeout(resolve,delay));
    await flushBot(connection,channel);
  }
}
