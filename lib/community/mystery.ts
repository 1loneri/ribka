import type {FeedMessage} from '../twitch-feed/types';
import {readMessages} from '../twitch-feed/storage';
import {KNOWN_BOTS} from '../levels/rules';
import {reviewTwitchProfile} from '../reviews/twitch-profile';
import {communityDb,communityOperatorSql} from './access';
import {anonymousQuote,normalizeGuess,randomIndex,safeAvatar} from './model';
export type MysteryRound={id:string;channel:string;owner:string;target_id:string;target_login:string;target_name:string;avatar:string;message_ids:string;state:string;active:number|null;created:number;ends:number};
async function quotesFor(row:MysteryRound){
 let ids:unknown;try{ids=JSON.parse(row.message_ids);}catch{return [];}
 if(!Array.isArray(ids)||!ids.length)return [];
 const rows=await communityDb().prepare('SELECT payload FROM chat_messages WHERE channel=? AND user_id=? AND removed=0 AND message_id IN ('+ids.map(()=>'?').join(',')+') ORDER BY seq').bind(row.channel,row.target_id,...ids).all<{payload:string}>();
 return rows.results.flatMap(item=>{try{const m=JSON.parse(item.payload) as FeedMessage;if(m.kind!=='message')return [];const text=anonymousQuote(m.text,row.target_login,row.target_name);return text?[text]:[];}catch{return [];}});
}
export async function currentMystery(channel:string){
 const db=communityDb();let row=await db.prepare('SELECT * FROM community_mystery_rounds WHERE channel=? ORDER BY active DESC,created DESC,id DESC LIMIT 1').bind(channel).first<MysteryRound>();if(!row)return null;
 const quotes=await quotesFor(row);
 if(!quotes.length&&row.state!=='cancelled'){await db.prepare("UPDATE community_mystery_rounds SET state='cancelled',active=NULL WHERE id=?").bind(row.id).run();row={...row,state:'cancelled',active:null};}
 else if(row.active&&row.ends<=Date.now()){await db.prepare("UPDATE community_mystery_rounds SET state='revealed',active=NULL WHERE id=? AND active=1 AND ends<=?").bind(row.id,Date.now()).run();row={...row,state:'revealed',active:null};}
 return {row,quotes};
}
export async function mysterySnapshot(channel:string,viewer?:string){
 const current=await currentMystery(channel);if(!current)return null;const {row,quotes}=current,db=communityDb(),revealed=row.state==='revealed';
 const [total,mine,winners]=await Promise.all([
  db.prepare('SELECT COUNT(*) AS n FROM community_mystery_guesses WHERE round_id=?').bind(row.id).first<{n:number}>(),
  viewer?db.prepare('SELECT guess,attempts FROM community_mystery_guesses WHERE round_id=? AND user_id=?').bind(row.id,viewer).first<{guess:string;attempts:number}>():null,
  revealed?db.prepare('SELECT name FROM community_mystery_guesses WHERE round_id=? AND correct_at IS NOT NULL ORDER BY correct_at,user_id LIMIT 12').bind(row.id).all<{name:string}>():{results:[]},
 ]);
 return {id:row.id,state:row.state,ends:row.ends,quotes:row.state==='cancelled'?[]:quotes,portrait:row.state==='cancelled'?null:'/api/community/portrait?round='+row.id+'&phase='+(revealed?'answer':'clue'),total:total?.n??0,mine,canGuess:viewer!==row.target_id,answer:revealed?{name:row.target_name,login:row.target_login}:null,winners:winners.results.map(x=>x.name)};
}
export async function startMystery(channel:string,owner:string,id:string,email:string){
 const db=communityDb(),prior=await db.prepare('SELECT owner,channel FROM community_mystery_rounds WHERE id=?').bind(id).first<{owner:string;channel:string}>();if(prior)return prior.owner===owner&&prior.channel===channel;
 const current=await currentMystery(channel);if(current?.row.active)throw Error('Сначала заверши текущий раунд.');
 const messages=await readMessages(channel),people=new Map<string,{id:string;login:string;name:string;messages:FeedMessage[]}>(),now=Date.now();
 for(const m of messages){if(m.kind!=='message'||!/^\d{1,30}$/.test(m.userId)||!/^[a-z0-9_]{1,25}$/i.test(m.login)||KNOWN_BOTS.has(m.login.toLowerCase())||m.login.toLowerCase()===channel||m.created<now-6*3600000||m.created>now+10000||(m.source&&m.source.toLowerCase()!==channel)||!anonymousQuote(m.text,m.login,m.name))continue;
  const person=people.get(m.userId)??{id:m.userId,login:m.login.toLowerCase(),name:m.name||m.login,messages:[]};if(!person.messages.some(x=>x.text===m.text))person.messages.push(m);people.set(m.userId,person);
 }
 let pool=[...people.values()].filter(p=>p.messages.length>=2);if(current?.row.target_id&&pool.length>1)pool=pool.filter(p=>p.id!==current.row.target_id);
 if(!pool.length)throw Error('Нужны хотя бы два разных сообщения от одного зрителя в недавнем чате.');
 const person=pool[randomIndex(pool.length)],profile=await reviewTwitchProfile({twitchId:person.id,username:person.login}),avatar=safeAvatar(profile.avatar);if(!avatar)throw Error('Не удалось получить аватарку зрителя. Попробуй ещё раз.');
 const selected=[...person.messages];for(let i=selected.length-1;i>0;i--){const j=randomIndex(i+1);[selected[i],selected[j]]=[selected[j],selected[i]];}
 const ids=selected.slice(0,3).map(m=>m.id);
 const result=await db.prepare(`INSERT OR IGNORE INTO community_mystery_rounds(id,channel,owner,target_id,target_login,target_name,avatar,message_ids,state,active,created,ends)
 SELECT ?,?,?,?,?,?,?,?,'playing',1,?,? WHERE (SELECT COUNT(*) FROM chat_messages WHERE channel=? AND user_id=? AND removed=0 AND message_id IN (${ids.map(()=>'?').join(',')}))>=2 AND ${communityOperatorSql}`)
 .bind(id,channel,owner,person.id,profile.login,person.name,avatar,JSON.stringify(ids),Date.now(),Date.now()+90000,channel,person.id,...ids,email.toLowerCase(),channel,channel,owner).run();
 if(!result.meta.changes)throw Error('Раунд уже запущен или сообщения были удалены. Обнови страницу.');return true;
}
export async function mysteryGuess(channel:string,roundId:string,user:string,name:string,input:unknown,created=Date.now(),delivery?:{lease:string;messageId:string}){
 const guess=normalizeGuess(input);if(!guess)return false;const db=communityDb(),now=Date.now();
 const nonce=crypto.randomUUID(),statement=db.prepare(`INSERT INTO community_mystery_guesses(round_id,user_id,name,guess,attempts,updated,correct_at)
 SELECT id,?,?,?,1,?,CASE WHEN target_login=? THEN ? ELSE NULL END FROM community_mystery_rounds g WHERE id=? AND channel=? AND active=1 AND state='playing' AND ends>? AND created<=? AND target_id!=?
 ${delivery?'AND EXISTS(SELECT 1 FROM community_mystery_events e WHERE e.channel=g.channel AND e.message_id=? AND e.nonce=?) AND EXISTS(SELECT 1 FROM chat_channels c WHERE c.channel=g.channel AND c.owner=g.owner AND c.collector_token=? AND c.collector_until>?)':''}
 ON CONFLICT(round_id,user_id) DO UPDATE SET name=excluded.name,guess=excluded.guess,attempts=community_mystery_guesses.attempts+1,updated=excluded.updated,correct_at=COALESCE(community_mystery_guesses.correct_at,excluded.correct_at)
 WHERE community_mystery_guesses.attempts<3 AND community_mystery_guesses.guess!=excluded.guess AND excluded.updated>=community_mystery_guesses.updated`)
 .bind(user,name.slice(0,100),guess,created,guess,created,roundId,channel,now,created,user,...(delivery?[delivery.messageId,nonce,delivery.lease,now]:[]));
 if(!delivery)return !!(await statement.run()).meta.changes;
 const results=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO community_mystery_events(channel,message_id,created,nonce) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM chat_messages WHERE channel=? AND message_id=? AND user_id=? AND removed=0) AND EXISTS(SELECT 1 FROM chat_channels c JOIN community_mystery_rounds g ON g.channel=c.channel AND g.owner=c.owner WHERE g.id=? AND g.active=1 AND g.ends>? AND c.collector_token=? AND c.collector_until>?)`).bind(channel,delivery.messageId,now,nonce,channel,delivery.messageId,user,roundId,now,delivery.lease,now),
  statement,
  db.prepare('DELETE FROM community_mystery_events WHERE channel=? AND created<?').bind(channel,now-86400000),
 ]);return !!results[1].meta.changes;
}
export async function ingestMysteryGuess(channel:string,lease:string,message:FeedMessage){
 const match=/^!кто\s+(@?[a-z0-9_]{1,25})\s*$/i.exec(message.text.trim()),now=Date.now();
 if(!match||message.kind!=='message'||!/^\d{1,30}$/.test(message.userId)||KNOWN_BOTS.has(message.login.toLowerCase())||!Number.isFinite(message.created)||message.created<now-60000||message.created>now+10000||(message.source&&message.source.toLowerCase()!==channel))return false;
 const row=await communityDb().prepare('SELECT id FROM community_mystery_rounds WHERE channel=? AND active=1 AND created<=?').bind(channel,message.created).first<{id:string}>();if(!row)return false;
 return mysteryGuess(channel,row.id,message.userId,message.name||message.login,match[1],message.created,{lease,messageId:message.id});
}
export async function finishMystery(channel:string,owner:string,id:string,reveal:boolean,email:string){
 const result=await communityDb().prepare(`UPDATE community_mystery_rounds SET state=?,active=NULL WHERE id=? AND channel=? AND owner=? AND active=1 AND ${communityOperatorSql}`).bind(reveal?'revealed':'cancelled',id,channel,owner,email.toLowerCase(),channel,channel,owner).run();return !!result.meta.changes;
}
