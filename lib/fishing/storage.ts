import {settleCat} from './cat';
import {streamCatClock,prepareCatClock} from './cat-clock';
import {catNameCandidate} from './cat-names';
import {moderateCatName} from './cat-name-moderation';
import {ingestDuel,duelCommands} from './duels';
import {env} from 'cloudflare:workers';
import {commands,events,naturalEvents,newPlayer,play,random,type Player,type FishEvent} from './game';
import {fishingReply} from '../twitch-bot/messages';
import type {FeedMessage} from '../twitch-feed/types';
export const fishDb=()=>{if(!env.DB)throw Error('Рыбалка временно недоступна.');return env.DB;};
export type Game={channel:string;owner:string;host:string;enabled:number;collector_token:string|null;collector_until:number|null;event_id:string|null;active_until:number;next_event:number};
export const interval=()=>[15,30,40,60][Math.floor(random()*4)]*60000;
export async function eventFor(g:Game,now=Date.now()):Promise<FishEvent|null>{
 if(g.active_until>now)return events.find(e=>e.id===g.event_id)??null;
 if(g.next_event>now)return null;
 const event=naturalEvents[Math.floor(random()*naturalEvents.length)],active=now+600000,next=active+interval();
 const r=await fishDb().prepare('UPDATE fishing_games SET event_id=?,active_until=?,next_event=? WHERE channel=? AND next_event=?').bind(event.id,active,next,g.channel,g.next_event).run();
 if(r.meta.changes){g.event_id=event.id;g.active_until=active;g.next_event=next;return event;}
 const current=await fishDb().prepare('SELECT * FROM fishing_games WHERE channel=?').bind(g.channel).first<Game>();
 if(current){g.event_id=current.event_id;g.active_until=current.active_until;g.next_event=current.next_event;g.enabled=current.enabled;}
 return current?.enabled&&current.active_until>now?events.find(e=>e.id===current.event_id)??null:null;
}
export function cleanUsername(value:string){return value.trim().toLowerCase().replace(/^@/,'').replace(/[^a-z0-9_]/g,'').slice(0,25);}
export async function readPlayer(channel:string,username:string){
 const db=fishDb(),game=await db.prepare('SELECT * FROM fishing_games WHERE channel=?').bind(channel).first<Game>();let clock:Awaited<ReturnType<typeof streamCatClock>>|null=null;for(let attempt=0;attempt<3;attempt++){
  const row=await db.prepare('SELECT state,rev FROM fishing_players WHERE channel=? AND username=?').bind(channel,username).first<{state:string;rev:number}>();if(!row)return newPlayer();
  const p=JSON.parse(row.state) as Player;if(!p.cat)return p;if(!clock&&game)clock=await streamCatClock(game);const now=Date.now(),prepared=clock?prepareCatClock(p,clock,now):false;const settled=settleCat(p,p.cat.clockAt??now,random,now);if(!prepared&&!settled)return p;
  const updated=await db.prepare('UPDATE fishing_players SET state=?,rev=rev+1,coins=? WHERE channel=? AND username=? AND rev=?').bind(JSON.stringify(p),p.coins,channel,username,row.rev).run();if(updated.meta.changes)return p;
 }
 const row=await db.prepare('SELECT state FROM fishing_players WHERE channel=? AND username=?').bind(channel,username).first<{state:string}>();return row?JSON.parse(row.state) as Player:newPlayer();
}
export type FishingEntry={id:string;username:string;message:string;item_id:string|null;chance:number|null;created:number};
type CommandResult={kind:'saved';entry:FishingEntry;player:Player;owner:string;replayed:boolean}|{kind:'cooldown';player:Player;retryAt:number}|{kind:'unavailable'};

// Both chat commands and website clicks use this revision-checked transaction.
// No client supplies the result, player state, or random odds.
async function recordCommand(g:Game,id:string,name:string,text:string,lease:string|null):Promise<CommandResult>{
 const db=fishDb(),channel=g.channel,site=lease===null;
 const replay=async():Promise<CommandResult|null>=>{
  const entry=await db.prepare('SELECT id,username,message,item_id,chance,created FROM fishing_log WHERE id=? AND channel=? AND username=?').bind(id,channel,name).first<FishingEntry>();
  return entry?{kind:'saved',entry,player:await readPlayer(channel,name),owner:g.owner,replayed:true}:null;
 };
 const existing=await replay();if(existing)return existing;
 const event=await eventFor(g);let catClock:Awaited<ReturnType<typeof streamCatClock>>|null=null;await db.prepare('INSERT OR IGNORE INTO fishing_players (channel,username,state,rev,coins,catches,streak) VALUES (?,?,?,0,0,0,0)').bind(channel,name,JSON.stringify(newPlayer())).run();
 for(let retry=0;retry<3;retry++){
  const row=await db.prepare('SELECT state,rev FROM fishing_players WHERE channel=? AND username=?').bind(channel,name).first<{state:string;rev:number}>();if(!row)return {kind:'unavailable'};
  const player=JSON.parse(row.state) as Player,now=Date.now();if(player.cat||/^!(?:кот|cat)(?:\s|$)/i.test(text.trim())||/^!(?:купить|buy)\s+кота(?:\s|$)/i.test(text.trim())){catClock??=await streamCatClock(g);prepareCatClock(player,catClock,now);}
  if(site&&['!рыба','!рыбалка','!fish'].includes(text.trim().split(/\s+/)[0].toLowerCase())&&player.lastCatch&&player.lastCatch+20000>now)return await replay()??{kind:'cooldown',player,retryAt:player.lastCatch+20000};
  const [cmd,arg]=text.trim().toLowerCase().split(/\s+/);
  const consumesFish=((cmd==='!наживка'||cmd==='!bait')&&!!arg&&!['купить','buy'].includes(arg))||(cmd==='!обменять'&&arg==='наживку')||(['!кот','!cat'].includes(cmd)&&['корм','feed'].includes(arg));
  const locked=consumesFish&&!!await db.prepare('SELECT duel FROM fishing_duel_locks WHERE channel=? AND username=? AND expires>?').bind(channel,name,now).first();
  const nameCandidate=catNameCandidate(text),nameError=nameCandidate!==null&&player.cat?.alive&&player.cat.level>=5?await moderateCatName(g,nameCandidate):null;
  let outcome=play(player,locked||nameError?'!баланс':text,now,event);if(nameError)outcome={...outcome,message:nameError};if(locked)outcome={...outcome,message:'Сначала закончи дуэль: рыба выставлена на бой.'};
  if(cmd==='!топ'||cmd==='!top'){
   const column=arg==='catches'||arg==='уловы'?'catches':arg==='streak'||arg==='серия'?'streak':'coins';
   const rows=await db.prepare('SELECT username,'+column+' AS score FROM fishing_players WHERE channel=? ORDER BY '+column+' DESC,username LIMIT 10').bind(channel).all<{username:string;score:number}>();
   outcome={state:outcome.state,changed:false,message:'Топ: '+(rows.results.map((x,i)=>(i+1)+'. @'+x.username+' — '+x.score).join(' | ')||'пока пусто')};
  }
  if(cmd==='!титулы'||cmd==='!titles'){
   const rows=await db.prepare("SELECT username,json_extract(state,'$.title') AS title FROM fishing_players WHERE channel=? AND json_extract(state,'$.title')!='' ORDER BY username LIMIT 30").bind(channel).all<{username:string;title:string}>();
   outcome={state:outcome.state,changed:false,message:'Титулы: '+(rows.results.map(x=>'@'+x.username+' — '+x.title).join(' | ')||'пока пусто')};
  }
  if(!outcome.message)return {kind:'unavailable'};if(catClock)prepareCatClock(outcome.state,catClock,now);
  const guard=site?'channel=? AND owner=? AND enabled=1':'channel=? AND owner=? AND collector_token=? AND collector_until>? AND enabled=1';
  const guardArgs=site?[channel,g.owner]:[channel,g.owner,lease,now];
  const inventoryGuard=consumesFish&&!locked?' AND NOT EXISTS(SELECT 1 FROM fishing_duel_locks WHERE channel=? AND username=? AND expires>?)':'',inventoryArgs=consumesFish&&!locked?[channel,name,now]:[];
  const entry:FishingEntry={id,username:name,message:outcome.message,item_id:outcome.item?.id??null,chance:outcome.chance??null,created:now};
  const statements=[
   db.prepare('UPDATE fishing_players SET state=?,rev=rev+1,coins=?,catches=?,streak=? WHERE channel=? AND username=? AND rev=? AND NOT EXISTS (SELECT 1 FROM fishing_log WHERE id=?) AND EXISTS (SELECT 1 FROM fishing_games WHERE '+guard+')'+inventoryGuard).bind(JSON.stringify(outcome.state),outcome.state.coins,outcome.state.catches,outcome.state.streak,channel,name,row.rev,id,...guardArgs,...inventoryArgs),
   db.prepare('INSERT OR IGNORE INTO fishing_log (id,channel,username,message,item_id,chance,created) SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id,channel,name,outcome.message,outcome.item?.id??null,outcome.chance??null,now),
   db.prepare("INSERT OR IGNORE INTO twitch_bot_messages (id,channel,kind,text,created,ready_at,expires) SELECT ?,?,'fish',?,?,?,? WHERE changes()=1 AND EXISTS (SELECT 1 FROM twitch_bot_settings WHERE channel=? AND owner=? AND enabled=1 AND fish_replies=1) AND (SELECT COUNT(*) FROM twitch_bot_messages WHERE channel=? AND status='queued' AND expires>?)<100").bind('fish:'+channel+':'+id,channel,fishingReply(name,outcome.message,site&&['!рыба','!рыбалка','!fish'].includes(cmd)?'site':'twitch'),now,now,now+45000,channel,g.owner,channel,now)
  ];
  if(site){
   const message:FeedMessage={id:'fish:'+id,kind:'fish',userId:'',login:'ribka',name:'Рыбка',color:'',badges:[],text:fishingReply(name,outcome.message,'site'),fragments:[],created:now};
   statements.push(db.prepare('INSERT OR IGNORE INTO chat_messages (channel,message_id,user_id,payload,created,removed) SELECT ?,?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM fishing_log WHERE id=? AND channel=? AND username=?)').bind(channel,message.id,'',JSON.stringify(message),now,id,channel,name));
  }
  const r=await db.batch(statements);
  if(r[0].meta.changes)return {kind:'saved',entry,player:outcome.state,owner:g.owner,replayed:false};
  const duplicate=await replay();if(duplicate)return duplicate;
  if(!await db.prepare('SELECT channel FROM fishing_games WHERE '+guard).bind(...guardArgs).first())return {kind:'unavailable'};
 }
 return {kind:'unavailable'};
}

export async function ingestFish(channel:string,lease:string,id:string,username:string,text:string){
 if(!commands.includes(text.trim().split(/\s+/)[0].toLowerCase()))return null;
 const name=cleanUsername(username);if(!name||!id||!lease)return null;
 const g=await fishDb().prepare('SELECT * FROM fishing_games WHERE channel=? AND enabled=1 AND collector_token=? AND collector_until>?').bind(channel,lease,Date.now()).first<Game>();if(!g)return null;
 if(duelCommands.includes(text.trim().split(/\s+/)[0].toLowerCase()))return ingestDuel(g,lease,id,name,text);
 const result=await recordCommand(g,id,name,text,lease);
 return result.kind==='saved'&&!result.replayed?result.entry:null;
}

export async function castFish(channel:string,id:string,username:string):Promise<CommandResult>{
 const name=cleanUsername(username);if(!name||!id)return {kind:'unavailable'};
 const g=await fishDb().prepare('SELECT * FROM fishing_games WHERE channel=? AND enabled=1').bind(channel).first<Game>();
 return g?recordCommand(g,id,name,'!рыба',null):{kind:'unavailable'};
}

export async function performFishCommand(channel:string,id:string,username:string,text:string):Promise<CommandResult>{
 const name=cleanUsername(username);if(!name||!id)return {kind:'unavailable'};
 const g=await fishDb().prepare('SELECT * FROM fishing_games WHERE channel=? AND enabled=1').bind(channel).first<Game>();return g?recordCommand(g,id,name,text,null):{kind:'unavailable'};
}
