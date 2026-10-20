import type {getConnection} from '../twitch-api';
import {botDb,flushBot,finishBotReply} from './storage';
import {botQuestion,basicBotAnswer,cleanBotAnswer} from './personality';
import {chatText} from './messages';
import {BotAiError,chatMode,neuralBotAnswer,type BotTurn} from './ai';

export const CHAT_CHANNEL_PAUSE=8000,CHAT_USER_PAUSE=30000,CHAT_DAILY_LIMIT=200;
export type ChatQuestion={id:string;userId:string;login:string;text:string;created:number};

export async function answerBotQuestion(connection:Awaited<ReturnType<typeof getConnection>>,channel:string,lease:string,message:ChatQuestion){
 const now=Date.now();if(!message.id||message.id.length>200||!Number.isFinite(message.created)||message.created<now-45000||message.created>now+5000||!/^[a-z0-9_]{1,25}$/i.test(message.login)||!/^\d+$/.test(message.userId))return;
 const question=botQuestion(message.text,message.login,message.userId,{id:connection.broadcaster,login:connection.channel});if(!question)return;
 const db=botDb(),id='ai:'+channel+':'+message.id;
 try{
  const claimed=await db.prepare(`INSERT OR IGNORE INTO twitch_bot_ai_requests(id,channel,owner,user_id,login,question,mode,status,created,expires)
   SELECT ?,?,?,?,?,?,?,'generating',?,? WHERE EXISTS(SELECT 1 FROM twitch_bot_settings s JOIN fishing_games g ON g.channel=s.channel
    WHERE s.channel=? AND s.owner=? AND s.enabled=1 AND s.ai_replies=1 AND g.owner=s.owner AND g.enabled=1 AND g.collector_token=? AND g.collector_until>?)
   AND EXISTS(SELECT 1 FROM streamers WHERE email=?)
   AND NOT EXISTS(SELECT 1 FROM twitch_bot_ai_requests WHERE channel=? AND status='generating' AND expires>?)
   AND NOT EXISTS(SELECT 1 FROM twitch_bot_ai_requests WHERE channel=? AND created>?)
   AND NOT EXISTS(SELECT 1 FROM twitch_bot_ai_requests WHERE channel=? AND user_id=? AND created>?)
   AND (SELECT COUNT(*) FROM twitch_bot_ai_requests WHERE channel=? AND created>?)<60
   AND (SELECT COUNT(*) FROM twitch_bot_ai_requests WHERE channel=? AND created>?)<?`)
   .bind(id,channel,connection.user,message.userId,message.login,question,chatMode(),now,now+30000,channel,connection.user,lease,now,connection.email.toLowerCase(),channel,now,channel,now-CHAT_CHANNEL_PAUSE,channel,message.userId,now-CHAT_USER_PAUSE,channel,now-3600000,channel,now-86400000,CHAT_DAILY_LIMIT).run();
  if(!claimed.meta.changes)return;
  const recent=await db.prepare("SELECT answer FROM twitch_bot_ai_requests WHERE channel=? AND status='sent' AND answer IS NOT NULL AND created>? ORDER BY created DESC LIMIT 3").bind(channel,now-600000).all<{answer:string}>();
  let answer=basicBotAnswer(question,recent.results.map(row=>row.answer));
  let mode='basic';
  const settings=await db.prepare('SELECT ai_retry_after FROM twitch_bot_settings WHERE channel=? AND owner=?').bind(channel,connection.user).first<{ai_retry_after:number}>();
  if(chatMode()==='openai'&&settings&&settings.ai_retry_after<=Date.now()){
   const history=await db.prepare("SELECT question,answer FROM twitch_bot_ai_requests WHERE channel=? AND user_id=? AND status='sent' AND answer IS NOT NULL AND created>? ORDER BY created DESC LIMIT 3").bind(channel,message.userId,now-600000).all<BotTurn>();
   try{
    answer=await neuralBotAnswer(question,history.results.reverse());mode='openai';
    await db.prepare('UPDATE twitch_bot_settings SET ai_error=NULL,ai_retry_after=0 WHERE channel=? AND owner=?').bind(channel,connection.user).run();
   }catch(error){
    const issue=error instanceof BotAiError?error:new BotAiError('unavailable','Нейросеть временно недоступна. Включены готовые реплики.');
    await db.prepare('UPDATE twitch_bot_settings SET ai_error=?,ai_retry_after=? WHERE channel=? AND owner=?').bind(issue.message,Date.now()+issue.pause,channel,connection.user).run();
   }
  }
  answer=cleanBotAnswer(answer)??'чутка подвис, братик. пока держим спокойный вайб';
  const text=chatText('@'+message.login+' · '+answer),expires=now+30000;
  const result=await db.batch([
   db.prepare(`UPDATE twitch_bot_ai_requests SET status='queued',answer=?,mode=? WHERE id=? AND status='generating' AND expires>?
    AND EXISTS(SELECT 1 FROM twitch_bot_settings s JOIN fishing_games g ON g.channel=s.channel WHERE s.channel=? AND s.owner=? AND s.enabled=1 AND s.ai_replies=1 AND g.owner=s.owner AND g.enabled=1 AND g.collector_token=? AND g.collector_until>?)
    AND EXISTS(SELECT 1 FROM streamers WHERE email=?)`).bind(answer,mode,id,Date.now(),channel,connection.user,lease,Date.now(),connection.email.toLowerCase()),
   db.prepare("INSERT OR IGNORE INTO twitch_bot_messages(id,channel,kind,text,created,ready_at,expires,reply_to) SELECT ?,?,'ai',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM twitch_bot_ai_requests WHERE id=? AND status='queued')").bind(id,channel,text,Date.now(),Date.now(),expires,message.id,id),
  ]);
  if(!result[0].meta.changes){await db.prepare("UPDATE twitch_bot_ai_requests SET status='cancelled' WHERE id=? AND status='generating'").bind(id).run();return;}
  await flushBot(connection,channel);await finishBotReply(connection,id,channel);
 }catch{
  await db.prepare("UPDATE twitch_bot_ai_requests SET status='failed' WHERE id=? AND status='generating'").bind(id).run().catch(()=>{});
 }
}
