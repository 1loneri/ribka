import type {getConnection} from '../twitch-api';
import type {FeedMessage} from '../twitch-feed/types';
import {KNOWN_BOTS} from '../levels/rules';
import {botDb,finishBotReply,flushBot} from './storage';
import {chatText} from './messages';

type Connection=Awaited<ReturnType<typeof getConnection>>;
type Chatter={user_id:string;login:string};
function randomIndex(length:number){
 if(length===1)return 0;
 const limit=Math.floor(4294967296/length)*length;let value;
 do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=limit);
 return value%length;
}

export async function answerChatCommand(connection:Connection,channel:string,lease:string,message:FeedMessage){
 const now=Date.now(),command=message.text.trim().toLowerCase();
 if(message.kind!=='message'||!['!вирт','!секс','!монетка'].includes(command)||!message.id||message.id.length>200||!/^[a-z0-9_]{1,25}$/.test(channel)||(message.source&&message.source.toLowerCase()!==channel)||!Number.isFinite(message.created)||message.created<now-45000||message.created>now+5000)return;
 const valid=(person:Chatter)=>/^\d{1,30}$/.test(person.user_id)&&/^[a-z0-9_]{1,25}$/i.test(person.login)&&!KNOWN_BOTS.has(person.login.toLowerCase());
 const candidate=(person:Chatter)=>valid(person)&&person.user_id!==connection.broadcaster&&person.login.toLowerCase()!==connection.channel.toLowerCase();
 if(!valid({user_id:message.userId,login:message.login}))return;
 const db=botDb();
 if(command==='!монетка'){
  const side=randomIndex(2)===0?'орёл':'решка';
  const text=chatText('Лёха: @'+message.login+', монетка показывает — '+side+'!');
  const id='command:'+channel+':'+message.id;
  const queued=await db.prepare(`INSERT OR IGNORE INTO twitch_bot_messages(id,channel,kind,text,created,ready_at,expires,reply_to)
   SELECT ?,?,'command',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM twitch_bot_settings s JOIN chat_channels c ON c.channel=s.channel AND c.owner=s.owner WHERE s.channel=? AND s.owner=? AND s.enabled=1 AND c.collector_token=? AND c.collector_until>?)
   AND EXISTS(SELECT 1 FROM streamers WHERE email=? AND (channel=? OR EXISTS(SELECT 1 FROM twitch_bot_channels WHERE channel=? AND owner=?)))
   AND EXISTS(SELECT 1 FROM chat_messages WHERE channel=? AND message_id=? AND user_id=? AND removed=0)
   AND (SELECT COUNT(*) FROM twitch_bot_messages WHERE channel=? AND kind='command' AND status='queued' AND expires>?)<10`)
   .bind(id,channel,text,now,now,now+30000,message.id,channel,connection.user,lease,now,connection.email.toLowerCase(),channel,channel,connection.user,channel,message.id,message.userId,channel,now).run();
  if(!queued.meta.changes)return;
  await flushBot(connection,channel);await finishBotReply(connection,id,channel);
  return;
 }
 const active=await db.prepare(`SELECT c.stream_started FROM level_channels c WHERE c.channel=? AND c.owner=? AND c.stream_live=1 AND c.checked_at>?`).bind(channel,connection.user,now-90000).first<{stream_started:number}>();
 const since=active?.stream_started||now-2*3600000;
 const [participants,history]=await Promise.all([
  db.prepare(`SELECT p.user_id,p.login FROM level_players p JOIN level_sessions s ON s.channel=p.channel AND s.user_id=p.user_id JOIN level_channels c ON c.channel=s.channel AND c.stream_id=s.stream_id WHERE c.channel=? AND c.owner=? AND c.stream_live=1 AND c.checked_at>? AND s.messages>0 ORDER BY p.user_id`).bind(channel,connection.user,now-90000).all<Chatter>(),
  db.prepare('SELECT payload FROM chat_messages WHERE channel=? AND removed=0 AND created>=? AND created<=? ORDER BY seq DESC LIMIT 300').bind(channel,since,now+5000).all<{payload:string}>(),
 ]);
 // Each account occupies one slot, regardless of how many messages they wrote.
 const people=new Map<string,Chatter>();
 for(const person of participants.results)if(candidate(person))people.set(person.user_id,person);
 for(const row of [...history.results].reverse())try{
  const entry=JSON.parse(row.payload) as FeedMessage;
  if(entry.kind==='message'&&(!entry.source||entry.source.toLowerCase()===channel)&&candidate({user_id:entry.userId,login:entry.login}))people.set(entry.userId,{user_id:entry.userId,login:entry.login});
 }catch{}
 const pool=[...people.values()].filter(person=>person.user_id!==message.userId&&person.login.toLowerCase()!==message.login.toLowerCase());
 const allowed=command==='!вирт'||randomIndex(100)<10;
 const partner=allowed&&pool.length?pool[randomIndex(pool.length)]:undefined;
 const text=chatText(command==='!секс'
  ?'@'+message.login+' '+(partner?'в сексе разрешено с @'+partner.login:'в сексе отказано war1ouBase')
  :partner?'@'+message.login+' секретненько виртит с @'+partner.login:'@'+message.login+', пока не с кем. Ждём ещё одного чаттера.');
 const id='command:'+channel+':'+message.id;
 const queued=await db.prepare(`INSERT OR IGNORE INTO twitch_bot_messages(id,channel,kind,text,created,ready_at,expires,reply_to)
  SELECT ?,?,'command',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM twitch_bot_settings s JOIN chat_channels c ON c.channel=s.channel AND c.owner=s.owner WHERE s.channel=? AND s.owner=? AND s.enabled=1 AND c.collector_token=? AND c.collector_until>?)
  AND EXISTS(SELECT 1 FROM streamers WHERE email=? AND (channel=? OR EXISTS(SELECT 1 FROM twitch_bot_channels WHERE channel=? AND owner=?)))
  AND EXISTS(SELECT 1 FROM chat_messages WHERE channel=? AND message_id=? AND user_id=? AND removed=0)
  AND (SELECT COUNT(*) FROM twitch_bot_messages WHERE channel=? AND kind='command' AND status='queued' AND expires>?)<10`)
  .bind(id,channel,text,now,now,now+30000,message.id,channel,connection.user,lease,now,connection.email.toLowerCase(),channel,channel,connection.user,channel,message.id,message.userId,channel,now).run();
 if(!queued.meta.changes)return;
 await flushBot(connection,channel);await finishBotReply(connection,id,channel);
}
