import {env} from 'cloudflare:workers';
import {helix,type getConnection} from '../twitch-api';
import type {FeedMessage} from '../twitch-feed/types';
import {readMessages} from '../twitch-feed/storage';
import {appearanceFor,KNOWN_BOTS,progressFor} from './rules';
import {levelTitle} from './titles';
import {levelMonth} from './season';
import {overlayRole} from './roles';
import {overlayFragments} from './emotes';
import {restoreMessageHistory} from './message-history';
type Connection=Awaited<ReturnType<typeof getConnection>>;
export type LevelChannel={channel:string;owner:string;enabled:number;appearance:string;stream_id:string|null;stream_started:number;stream_live:number;checked_at:number;sync_until:number;stream_event_at:number;error:string|null};
type PlayerRow={user_id:string;login:string;name:string;color:string;xp:number;messages:number;streamMessages:number;earned:number;title_id:string|null};
export const levelsDb=()=>{if(!env.DB)throw Error('Уровни временно недоступны.');return env.DB;};
export const readLevelChannel=(channel:string)=>levelsDb().prepare('SELECT * FROM level_channels WHERE channel=?').bind(channel).first<LevelChannel>();
// The collector lease and current organizer approval are rechecked inside the award transaction.
const approved=`EXISTS (SELECT 1 FROM streamers WHERE email=? AND (channel=? OR EXISTS (SELECT 1 FROM twitch_bot_channels WHERE channel=? AND owner=?)))`;
export async function refreshLevelStream(connection:Connection,channel:string){
 const db=levelsDb(),now=Date.now(),row=await readLevelChannel(channel);
 if(!row?.enabled||row.owner!==connection.user||row.checked_at>now-45000||row.sync_until>now)return row;
 const lock=now+15000,claimed=await db.prepare('UPDATE level_channels SET sync_until=? WHERE channel=? AND owner=? AND enabled=1 AND sync_until<=? AND checked_at<=?').bind(lock,channel,connection.user,now,now-45000).run();
 if(!claimed.meta.changes)return readLevelChannel(channel);
 try{
  const response=await helix(connection,'streams?user_login='+encodeURIComponent(channel)),body=await response.json() as {data?:{id:string;user_login:string;type:string;started_at?:string}[]};
  if(!Array.isArray(body.data))throw Error();
  const live=body.data.find(s=>s.user_login===channel&&s.type==='live'&&s.id),started=live?.started_at?Date.parse(live.started_at):0;
  await db.prepare('UPDATE level_channels SET stream_id=COALESCE(?,stream_id),stream_started=CASE WHEN ? IS NULL THEN stream_started ELSE ? END,stream_live=?,checked_at=?,sync_until=0,error=NULL WHERE channel=? AND owner=? AND enabled=1 AND sync_until=? AND stream_event_at<=?').bind(live?.id??null,live?.id??null,Number.isFinite(started)?started:0,Number(!!live),Date.now(),channel,connection.user,lock,now).run();
 }catch{
  await db.prepare("UPDATE level_channels SET stream_live=0,checked_at=?,sync_until=0,error='Не удалось проверить эфир. Опыт на паузе до ответа Twitch.' WHERE channel=? AND owner=? AND sync_until=?").bind(Date.now(),channel,connection.user,lock).run();
 }
 return readLevelChannel(channel);
}
export async function levelStreamEvent(channel:string,owner:string,type:string,event:Record<string,unknown>,created:number){
 if(!['stream.online','stream.offline'].includes(type)||!Number.isFinite(created)||created<Date.now()-60000||created>Date.now()+10000)return;
 const online=type==='stream.online',id=typeof event.id==='string'?event.id.slice(0,100):'',started=typeof event.started_at==='string'?Date.parse(event.started_at):0;
 if(online&&(!id||event.type!=='live'))return;
 await levelsDb().prepare('UPDATE level_channels SET stream_live=?,stream_id=CASE WHEN ?=1 THEN ? ELSE stream_id END,stream_started=CASE WHEN ?=1 THEN ? ELSE stream_started END,stream_event_at=?,checked_at=?,sync_until=0,error=NULL WHERE channel=? AND owner=? AND enabled=1 AND stream_event_at<=?').bind(Number(online),Number(online),id,Number(online),Number.isFinite(started)?started:0,created,Date.now(),channel,owner,created).run();
}
export async function ingestLevelMessage(connection:Connection,channel:string,lease:string,message:FeedMessage,legacy=false){
 const now=Date.now();
 if(message.kind!=='message'||!message.id||!/^\d{1,30}$/.test(message.userId)||!/^[a-z0-9_]{1,25}$/i.test(message.login)||!Number.isFinite(message.created)||message.created<now-60000||message.created>now+10000)return;
 const login=message.login.toLowerCase();if(KNOWN_BOTS.has(login)||(connection.channel!==channel&&connection.channel===login))return;
 const state=await refreshLevelStream(connection,channel);
 if(!state?.enabled||state.owner!==connection.user||!state.stream_live||!state.stream_id||state.checked_at<now-90000||(state.stream_started&&message.created<state.stream_started))return;
 const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(message.text))),x=>x.toString(16).padStart(2,'0')).join('');
 const db=levelsDb(),nonce=crypto.randomUUID(),leaseTable=legacy?'fishing_games':'chat_channels';
 const eventGuard='channel=? AND message_id=? AND nonce=?',eventArgs=[channel,message.id,nonce];
 const result=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO level_events (channel,message_id,user_id,stream_id,fingerprint,created,eligible,nonce)
   SELECT ?,?,?,?,?,?,1,?
   WHERE EXISTS (SELECT 1 FROM level_channels WHERE channel=? AND owner=? AND enabled=1 AND stream_live=1 AND stream_id=? AND checked_at>?)
    AND EXISTS (SELECT 1 FROM ${leaseTable} WHERE channel=? AND owner=? AND collector_token=? AND collector_until>?) AND ${approved}`)
   .bind(channel,message.id,message.userId,state.stream_id,fingerprint,now,nonce,channel,connection.user,state.stream_id,now-90000,channel,connection.user,lease,now,connection.email.toLowerCase(),channel,channel,connection.user),
  db.prepare(`INSERT INTO level_players (channel,user_id,login,name,color,xp,messages,last_earned,last_seen)
   SELECT channel,user_id,?,?,?,eligible,1,CASE WHEN eligible=1 THEN created ELSE 0 END,created FROM level_events WHERE ${eventGuard}
   ON CONFLICT(channel,user_id) DO UPDATE SET login=excluded.login,name=excluded.name,color=excluded.color,xp=level_players.messages+1,messages=level_players.messages+1,last_earned=excluded.last_earned,last_seen=excluded.last_seen`)
   .bind(login,(message.name||login).slice(0,100),/^#[0-9a-f]{6}$/i.test(message.color)?message.color:'',...eventArgs),
  db.prepare(`INSERT INTO level_sessions (channel,stream_id,user_id,messages,earned) SELECT channel,stream_id,user_id,1,eligible FROM level_events WHERE ${eventGuard}
   ON CONFLICT(channel,stream_id,user_id) DO UPDATE SET messages=level_sessions.messages+1,earned=level_sessions.messages+1`).bind(...eventArgs),
  db.prepare(`INSERT INTO level_months (channel,month,user_id,xp,messages,last_earned,first_seen) SELECT channel,?,user_id,eligible,1,CASE WHEN eligible=1 THEN created ELSE 0 END,created FROM level_events WHERE ${eventGuard}
   ON CONFLICT(channel,month,user_id) DO UPDATE SET xp=level_months.messages+1,messages=level_months.messages+1,last_earned=excluded.last_earned`).bind(levelMonth(now),...eventArgs),
  db.prepare('DELETE FROM level_events WHERE channel=? AND created<?').bind(channel,now-3600000),
 ]);
 return !!result[0].meta.changes;
}
const present=(row:PlayerRow)=>({userId:row.user_id,login:row.login,name:row.name,color:row.color,title:levelTitle(row.title_id,progressFor(row.xp).level),...progressFor(row.xp),messages:row.messages,streamMessages:row.streamMessages??0,earned:row.earned??0});
export async function levelSnapshot(channel:string,identity?:string){
 await restoreMessageHistory(channel);
 const db=levelsDb(),state=await readLevelChannel(channel);
 const session=state?.stream_id??'';
 const from=`FROM level_players p LEFT JOIN level_profiles f ON f.twitch_id=p.user_id LEFT JOIN level_sessions s ON s.channel=p.channel AND s.user_id=p.user_id AND s.stream_id=? WHERE p.channel=?`;
 // Message totals also recover experience previously withheld by cooldowns and text filters.
 const select='SELECT p.user_id,p.login,p.name,p.color,p.messages,p.messages AS xp,f.title_id,COALESCE(s.messages,0) AS streamMessages,COALESCE(s.messages,0) AS earned ';
 const [ranked,me,stats,feed]=await Promise.all([
  db.prepare(select+from+' ORDER BY p.messages DESC,p.last_seen DESC,p.user_id LIMIT 30').bind(session,channel).all<PlayerRow>(),
  identity?db.prepare(select+from+' AND p.user_id=?').bind(session,channel,identity).first<PlayerRow>():null,
  db.prepare('SELECT COUNT(*) AS viewers,COALESCE(SUM(messages),0) AS messages,COALESCE(SUM(messages),0) AS earned,(SELECT COALESCE(SUM(messages),0) FROM level_players WHERE channel=?) AS totalMessages FROM level_sessions WHERE channel=? AND stream_id=?').bind(channel,channel,session).first<{viewers:number;messages:number;earned:number;totalMessages:number}>(),
  db.prepare('SELECT collector_until,status FROM chat_channels WHERE channel=?').bind(channel).first<{collector_until:number|null;status:string}>(),
 ]);
 return {channel,enabled:!!state?.enabled,appearance:appearanceFor(state?.appearance),streamLive:!!state?.stream_live&&!!state.checked_at&&state.checked_at>Date.now()-90000,streamId:session,streamStarted:state?.stream_started??0,connected:!!feed?.collector_until&&feed.collector_until>Date.now()&&feed.status==='ready',collectorUntil:feed?.collector_until??0,leaders:ranked.results.map(present),me:me?present(me):null,stats:stats??{viewers:0,messages:0,earned:0,totalMessages:0}};
}
export async function overlaySnapshot(channel:string){
 await restoreMessageHistory(channel);
 const state=await readLevelChannel(channel);if(!state?.enabled)return null;
 const appearance=appearanceFor(state.appearance),rows=(await readMessages(channel)).filter(x=>x.kind==='message'&&!KNOWN_BOTS.has(x.login.toLowerCase())).slice(-appearance.messages);
 const ids=[...new Set(rows.map(x=>x.userId).filter(Boolean))];
 const players=ids.length?await levelsDb().prepare('SELECT p.user_id,p.messages AS xp,f.title_id FROM level_players p LEFT JOIN level_profiles f ON f.twitch_id=p.user_id WHERE p.channel=? AND p.user_id IN ('+ids.map(()=>'?').join(',')+')').bind(channel,...ids).all<{user_id:string;xp:number;title_id:string|null}>():{results:[]};
 const people=new Map(players.results.map(x=>[x.user_id,x]));
 return {channel,appearance,now:Date.now(),messages:rows.map(m=>{const person=people.get(m.userId),progress=progressFor(person?.xp??0);return {id:m.id,userId:m.userId,name:m.name,role:overlayRole(m.badges),title:levelTitle(person?.title_id,progress.level)?.name??'',text:m.text.slice(0,500),fragments:overlayFragments(m.text,m.fragments),created:m.created,...progress};})};
}
