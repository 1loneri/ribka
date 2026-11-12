import type {getConnection} from '../twitch-api';
import type {FeedMessage} from '../twitch-feed/types';
import {KNOWN_BOTS} from '../levels/rules';
import {botDb,finishBotReply,flushBot} from './storage';
import {chatText} from './messages';

type Connection=Awaited<ReturnType<typeof getConnection>>;
type Player={user_id:string;login:string;balance:number;last_opened:number};
type Duel={id:string;challenger_id:string;challenger_login:string;opponent_id:string;opponent_login:string;stake:number;expires:number};

const FRIDGE_COOLDOWN=90_000;
const DUEL_TIMEOUT=60_000;
const CANS=[
 {label:'белый',symbol:'⚪'},
 {label:'зелёный',symbol:'🟢'},
 {label:'манго',symbol:'🥭'},
 {label:'розовый',symbol:'🌸'},
 {label:'голубой',symbol:'🔵'},
 {label:'чёрный',symbol:'⚫'},
 {label:'W Edition',symbol:'ⓦ'},
] as const;

function randomInt(length:number){
 const limit=Math.floor(4294967296/length)*length;
 let value:number;
 do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=limit);
 return value%length;
}
function shuffle<T>(items:T[]):T[]{
 for(let i=items.length-1;i>0;i--){
  const j=randomInt(i+1);
  [items[i],items[j]]=[items[j],items[i]];
 }
 return items;
}
function chooseDifferent(except:number,used:number[]=[]){
 const pool=CANS.map((_,i)=>i).filter(i=>i!==except&&!used.includes(i));
 return pool[randomInt(pool.length)];
}
function fridgeResult(){
 const chance=randomInt(100);
 let drawn:number[],earned:number,description:string;
 if(chance===0){
  drawn=[6,6,6];earned=100;description='W EDITION! РЕДКИЙ ДЖЕКПОТ';
 }else if(chance<8){
  const a=randomInt(6);drawn=[a,a,a];earned=20;description='три одинаковые банки!';
 }else if(chance<35){
  const a=randomInt(20)===0?6:randomInt(6);
  drawn=shuffle([a,a,chooseDifferent(a)]);
  earned=5;description='две одинаковые банки!';
 }else{
  const a=randomInt(12)===0?6:randomInt(6);
  const b=chooseDifferent(a),c=chooseDifferent(a,[b]);
  drawn=shuffle([a,b,c]);earned=0;description='три разные банки.';
 }
 return {earned,text:drawn.map(i=>CANS[i].symbol).join(' | ')+' — '+description};
}
function feeFor(stake:number){
 const rate=stake<100?.02:stake<500?.05:stake<2000?.08:.12;
 return Math.ceil(2*stake*rate);
}
async function queue(connection:Connection,channel:string,message:FeedMessage,text:string){
 const db=botDb(),now=Date.now(),id='monster:'+channel+':'+message.id;
 const queued=await db.prepare("INSERT OR IGNORE INTO twitch_bot_messages(id,channel,kind,text,created,ready_at,expires,reply_to) SELECT ?,?,'command',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM twitch_bot_settings WHERE channel=? AND owner=? AND enabled=1) AND EXISTS(SELECT 1 FROM chat_messages WHERE channel=? AND message_id=? AND user_id=? AND removed=0)")
  .bind(id,channel,chatText(text),now,now,now+45000,message.id,channel,connection.user,channel,message.id,message.userId).run();
 if(!queued.meta.changes)return;
 await flushBot(connection,channel);
 await finishBotReply(connection,id,channel);
}
async function signup(channel:string,message:FeedMessage){
 await botDb().prepare("INSERT OR IGNORE INTO monster_players(channel,user_id,login,balance,last_opened,opens,wins,jackpots) VALUES (?,?,?,0,0,0,0,0)")
  .bind(channel,message.userId,message.login).run();
 await botDb().prepare('UPDATE monster_players SET login=? WHERE channel=? AND user_id=? AND login<>?')
  .bind(message.login,channel,message.userId,message.login).run();
}
async function findPlayer(channel:string,id:string){
 return botDb().prepare('SELECT user_id,login,balance,last_opened FROM monster_players WHERE channel=? AND user_id=?').bind(channel,id).first<Player>();
}
async function fridge(channel:string,message:FeedMessage){
 const db=botDb(),now=Date.now(),result=fridgeResult();
 const applied=await db.prepare('UPDATE monster_players SET balance=balance+?,last_opened=?,opens=opens+1,wins=wins+?,jackpots=jackpots+? WHERE channel=? AND user_id=? AND last_opened<=?')
  .bind(result.earned,now,result.earned>0?1:0,result.earned===100?1:0,channel,message.userId,now-FRIDGE_COOLDOWN).run();
 if(applied.meta.changes)return '@'+message.login+' открыл холодос: '+result.text+' +'+result.earned+' W';
 const player=await findPlayer(channel,message.userId);
 const seconds=Math.max(1,Math.ceil(((player?.last_opened??now)+FRIDGE_COOLDOWN-now)/1000));
 return '@'+message.login+', холодос откроется через '+seconds+' сек.';
}
async function balance(channel:string,message:FeedMessage){
 const player=await findPlayer(channel,message.userId);
 return '@'+message.login+', твой баланс: '+(player?.balance??0).toLocaleString('ru-RU')+' W-монет.';
}
async function top(channel:string){
 const rows=await botDb().prepare('SELECT login,balance FROM monster_players WHERE channel=? ORDER BY balance DESC,login LIMIT 5').bind(channel).all<{login:string;balance:number}>();
 if(!rows.results.length)return 'Топ W-монет пока пуст. Напиши !холодос.';
 return 'Топ W-монет: '+rows.results.map((row,i)=>(i+1)+'. @'+row.login+' — '+row.balance+' W').join(' | ');
}
async function challenge(channel:string,message:FeedMessage,command:string){
 const match=/^!дуэль\s+@?([a-z0-9_]{1,25})\s+(\d{1,8})$/i.exec(command);
 if(!match)return '@'+message.login+', формат: !дуэль @ник 500';
 const target=match[1].toLowerCase(),stake=Number(match[2]),now=Date.now(),db=botDb();
 if(stake<1||stake>100_000||!Number.isSafeInteger(stake))return 'Ставка должна быть от 1 до 100 000 W.';
 if(target===message.login.toLowerCase())return 'Нельзя вызвать самого себя.';
 if(KNOWN_BOTS.has(target))return 'Ботов на дуэль не вызываем.';
 const opponent=await db.prepare("SELECT user_id,login FROM monster_players WHERE channel=? AND lower(login)=? UNION SELECT user_id,login FROM level_players WHERE channel=? AND lower(login)=? LIMIT 1")
  .bind(channel,target,channel,target).first<{user_id:string;login:string}>();
 if(!opponent||opponent.user_id===message.userId)return '@'+message.login+', @'+target+' сначала должен написать !баланс или !холодос.';
 await db.prepare("INSERT OR IGNORE INTO monster_players(channel,user_id,login,balance,last_opened,opens,wins,jackpots) VALUES (?,?,?,0,0,0,0,0)")
  .bind(channel,opponent.user_id,opponent.login).run();
 const challenger=await findPlayer(channel,message.userId),other=await findPlayer(channel,opponent.user_id);
 if((challenger?.balance??0)<stake||(other?.balance??0)<stake)return 'Для дуэли у обоих должно быть минимум '+stake+' W.';
 const id='monster-duel:'+channel+':'+message.id;
 const created=await db.prepare("INSERT OR IGNORE INTO monster_duels(id,channel,challenger_id,challenger_login,opponent_id,opponent_login,stake,status,created,expires) SELECT ?,?,?,?,?,?,?,'pending',?,? WHERE NOT EXISTS (SELECT 1 FROM monster_duels WHERE channel=? AND status='pending' AND expires>? AND (challenger_id IN (?,?) OR opponent_id IN (?,?)))")
  .bind(id,channel,message.userId,message.login,opponent.user_id,opponent.login,stake,now,now+DUEL_TIMEOUT,channel,now,message.userId,opponent.user_id,message.userId,opponent.user_id).run();
 if(!created.meta.changes)return 'У одного из игроков уже есть незавершённая дуэль.';
 return '@'+opponent.login+', @'+message.login+' вызывает тебя на Monster-дуэль за '+stake+' W с каждого! !принять или !отказ (60 сек.).';
}
async function pending(channel:string,opponentId:string,now:number){
 return botDb().prepare("SELECT id,challenger_id,challenger_login,opponent_id,opponent_login,stake,expires FROM monster_duels WHERE channel=? AND opponent_id=? AND status='pending' AND expires>? ORDER BY created DESC LIMIT 1")
  .bind(channel,opponentId,now).first<Duel>();
}
async function decline(channel:string,message:FeedMessage){
 const now=Date.now(),duel=await pending(channel,message.userId,now);
 if(!duel)return '@'+message.login+', нет ожидающей дуэли.';
 const result=await botDb().prepare("UPDATE monster_duels SET status='declined' WHERE id=? AND status='pending' AND expires>? AND opponent_id=?")
  .bind(duel.id,now,message.userId).run();
 return result.meta.changes?'@'+message.login+' отказался от дуэли с @'+duel.challenger_login+'.':'Эта дуэль уже закрыта.';
}
async function accept(channel:string,message:FeedMessage){
 const db=botDb(),now=Date.now(),duel=await pending(channel,message.userId,now);
 if(!duel)return '@'+message.login+', нет ожидающей дуэли.';
 const fee=feeFor(duel.stake),payout=duel.stake*2-fee;
 const winnerIsChallenger=randomInt(2)===0;
 const winnerId=winnerIsChallenger?duel.challenger_id:duel.opponent_id;
 const winner=winnerIsChallenger?duel.challenger_login:duel.opponent_login;
 const loser=winnerIsChallenger?duel.opponent_login:duel.challenger_login;
 // D1 batch is atomic: either all debits + award + settlement commit, or none do.
 // All money updates are conditional on a fresh pending->settling transition.
 const changes=await db.batch([
  db.prepare("UPDATE monster_duels SET status='settling',winner_id=?,fee=? WHERE id=? AND status='pending' AND expires>? AND opponent_id=? AND EXISTS (SELECT 1 FROM monster_players WHERE channel=? AND user_id=? AND balance>=?) AND EXISTS (SELECT 1 FROM monster_players WHERE channel=? AND user_id=? AND balance>=?)")
   .bind(winnerId,fee,duel.id,now,message.userId,channel,duel.challenger_id,duel.stake,channel,duel.opponent_id,duel.stake),
  db.prepare("UPDATE monster_players SET balance=balance-? WHERE channel=? AND user_id=? AND EXISTS(SELECT 1 FROM monster_duels WHERE id=? AND status='settling')")
   .bind(duel.stake,channel,duel.challenger_id,duel.id),
  db.prepare("UPDATE monster_players SET balance=balance-? WHERE channel=? AND user_id=? AND EXISTS(SELECT 1 FROM monster_duels WHERE id=? AND status='settling')")
   .bind(duel.stake,channel,duel.opponent_id,duel.id),
  db.prepare("UPDATE monster_players SET balance=balance+? WHERE channel=? AND user_id=? AND EXISTS(SELECT 1 FROM monster_duels WHERE id=? AND status='settling')")
   .bind(payout,channel,winnerId,duel.id),
  db.prepare("UPDATE monster_duels SET status='settled',settled_at=? WHERE id=? AND status='settling'")
   .bind(now,duel.id),
 ]);
 if(!changes[0].meta.changes)return 'Дуэль не началась: у кого-то не хватает монет или время вышло.';
 return 'БАХ! У @'+loser+' взорвалась банка Monster! @'+winner+' забирает '+payout+' W (комиссия '+fee+' W).';
}

export async function answerMonsterCommand(connection:Connection,channel:string,lease:string,message:FeedMessage){
 const now=Date.now(),command=message.text.trim().toLowerCase();
 const recognized=command==='!холодос'||command==='!баланс'||command==='!магазин'||command==='!топмонет'||command==='!принять'||command==='!отказ'||/^!дуэль\s+@?[a-z0-9_]{1,25}\s+\d{1,8}$/i.test(command);
 if(!recognized||message.kind!=='message'||!message.id||message.id.length>200||!/^[a-z0-9_]{1,25}$/.test(channel)||(message.source&&message.source.toLowerCase()!==channel)||!/^[a-z0-9_]{1,25}$/i.test(message.login)||!(/^\d{1,30}$/.test(message.userId))||KNOWN_BOTS.has(message.login.toLowerCase())||!Number.isFinite(message.created)||message.created<now-45000||message.created>now+5000)return;
 const db=botDb();
 const gate=await db.prepare("SELECT 1 AS ok FROM twitch_bot_settings s JOIN chat_channels c ON c.channel=s.channel AND c.owner=s.owner WHERE s.channel=? AND s.owner=? AND s.enabled=1 AND c.collector_token=? AND c.collector_until>? AND EXISTS(SELECT 1 FROM chat_messages WHERE channel=? AND message_id=? AND user_id=? AND removed=0)")
  .bind(channel,connection.user,lease,now,channel,message.id,message.userId).first<{ok:number}>();
 if(!gate)return;
 await signup(channel,message);
 let response:string;
 if(command==='!холодос')response=await fridge(channel,message);
 else if(command==='!баланс')response=await balance(channel,message);
 else if(command==='!магазин')response='Магазин Вариуса: 240 VP — 18 000 W | 475 VP — 36 000 W | 1000 VP — 75 000 W. Баланс: !баланс';
 else if(command==='!топмонет')response=await top(channel);
 else if(command==='!принять')response=await accept(channel,message);
 else if(command==='!отказ')response=await decline(channel,message);
 else response=await challenge(channel,message,command);
 await queue(connection,channel,message,response);
}
