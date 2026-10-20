import {env} from 'cloudflare:workers';
import {items,rarities,type Player} from './game';
import {chatText} from '../twitch-bot/messages';
import type {Game,FishingEntry} from './storage';
export const duelCommands=['!дуэль','!duel','!принять','!accept','!отказ','!decline','!отмена','!cancel','!дуэлистат'];
type Duel={id:string;channel:string;challenger:string;opponent:string;challenger_fish:string;opponent_fish:string|null;expires:number;status:string};
function strongest(state:string|null){if(!state)return null;const p=JSON.parse(state) as Player;return items.filter(i=>i.rarity!=='мусор'&&(p.inventory[i.id]??0)>0).sort((a,b)=>rarities.indexOf(b.rarity)-rarities.indexOf(a.rarity)||b.value-a.value||a.id.localeCompare(b.id))[0]??null;}
function roll(){const limit=Math.floor(4294967296/101)*101;let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);return n%101;}
export async function ingestDuel(g:Game,lease:string,id:string,name:string,text:string):Promise<FishingEntry|null>{
 const db=env.DB!,now=Date.now(),parts=text.trim().toLowerCase().split(/\s+/),cmd=parts[0];
 if(!duelCommands.includes(cmd)||await db.prepare('SELECT id FROM fishing_duel_commands WHERE id=?').bind(id).first())return null;
 await db.prepare('DELETE FROM fishing_duel_locks WHERE channel=? AND expires<=?').bind(g.channel,now).run();
 const challenger=cmd==='!дуэль'||cmd==='!duel',accept=cmd==='!принять'||cmd==='!accept',decline=cmd==='!отказ'||cmd==='!decline',cancel=cmd==='!отмена'||cmd==='!cancel';
 let message='',duel:Duel|null=null,opponent='',aFish:typeof items[number]|null=null,bFish:typeof items[number]|null=null,aScore=0,bScore=0,winner:string|null=null,operation='reply';
 if(challenger){
  opponent=(parts[1]??'').replace(/^@/,'');
  if(parts.length!==2||!/^[a-z0-9_]{1,25}$/.test(opponent))message='Вызов: !дуэль @ник. Принятие: !принять, отказ: !отказ.';
  else if(opponent===name)message='Нельзя вызвать себя на дуэль.';
  else if(await db.prepare('SELECT id FROM fishing_duel_commands WHERE channel=? AND username=? AND command IN (?,?) AND created>?').bind(g.channel,name,'!дуэль','!duel',now-30000).first())message='Подожди 30 с перед новым вызовом.';
  else if(await db.prepare('SELECT username FROM fishing_duel_locks WHERE channel=? AND username IN (?,?)').bind(g.channel,name,opponent).first())message='Ты или соперник уже в дуэли.';
  else{
   const a=await db.prepare('SELECT state FROM fishing_players WHERE channel=? AND username=?').bind(g.channel,name).first<{state:string}>(),b=await db.prepare('SELECT state FROM fishing_players WHERE channel=? AND username=?').bind(g.channel,opponent).first<{state:string}>();
   aFish=strongest(a?.state??null);bFish=strongest(b?.state??null);
   if(!aFish)message='Сначала поймай рыбу: !рыба. Мусор не подходит.';
   else if(!bFish)message='@'+opponent+' сначала должен поймать рыбу в этом канале.';
   else{operation='challenge';duel={id:crypto.randomUUID(),channel:g.channel,challenger:name,opponent,challenger_fish:aFish.id,opponent_fish:bFish.id,expires:now+60000,status:'pending'};message='@'+opponent+', дуэль от @'+name+': '+aFish.name+' vs '+bFish.name+'. !принять / !отказ · 60 с.';}
  }
 }else if(accept||decline||cancel){
  duel=await db.prepare('SELECT * FROM fishing_duels WHERE channel=? AND '+(cancel?'challenger':'opponent')+"=? AND status='pending' AND expires>? ORDER BY created DESC LIMIT 1").bind(g.channel,name,now).first<Duel>();
  if(!duel)message=cancel?'Нет вызова для отмены.':'Нет вызова для тебя: отсутствует или срок истёк.';
  else if(cancel||decline){operation=cancel?'cancel':'decline';message='Дуэль @'+duel.challenger+' и @'+duel.opponent+(cancel?' отменена организатором вызова.':' отклонена соперником.');}
  else{
   aFish=items.find(i=>i.id===duel!.challenger_fish)??null;
   bFish=items.find(i=>i.id===duel!.opponent_fish)??null;
   const a=await db.prepare('SELECT state FROM fishing_players WHERE channel=? AND username=?').bind(g.channel,duel.challenger).first<{state:string}>(),b=await db.prepare('SELECT state FROM fishing_players WHERE channel=? AND username=?').bind(g.channel,name).first<{state:string}>();
   const owns=(row:{state:string}|null,fish:typeof items[number]|null)=>!!row&&!!fish&&((JSON.parse(row.state) as Player).inventory[fish.id]??0)>0;
   if(!owns(a,aFish)||!owns(b,bFish)){
    operation='cancel';message='Дуэль отменена: рыбы нет в садке.';
   }else{operation='accept';aScore=rarities.indexOf(aFish!.rarity)*10+roll();bScore=rarities.indexOf(bFish!.rarity)*10+roll();winner=aScore===bScore?null:aScore>bScore?duel.challenger:duel.opponent;
    const lostFish=winner===duel.challenger?bFish!:aFish!,loser=winner===duel.challenger?duel.opponent:duel.challenger;
    message=winner?'Дуэль! Победил @'+winner+' ('+(winner===duel.challenger?aScore:bScore)+':'+(winner===duel.challenger?bScore:aScore)+'). +1 '+lostFish.name+' от @'+loser+'.':'Дуэль! Ничья ('+aScore+':'+bScore+'). Рыбы остаются у владельцев.';}
  }
 }else if(cmd==='!дуэлистат'){
  const row=await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN winner=? THEN 1 ELSE 0 END) wins,SUM(CASE WHEN winner IS NULL THEN 1 ELSE 0 END) draws FROM fishing_duels WHERE channel=? AND status='completed' AND (challenger=? OR opponent=?)").bind(name,g.channel,name,name).first<{total:number;wins:number|null;draws:number|null}>();
  const wins=row?.wins??0,draws=row?.draws??0,total=row?.total??0;message='Дуэли: '+wins+' побед, '+(total-wins-draws)+' поражений, '+draws+' ничьих. Вызов: !дуэль @ник.';
 }
 if(!message)return null;
 const nonce=crypto.randomUUID(),guard='EXISTS(SELECT 1 FROM fishing_duel_commands WHERE id=? AND nonce=?)',base="EXISTS(SELECT 1 FROM fishing_games WHERE channel=? AND owner=? AND enabled=1 AND collector_token=? AND collector_until>?)";
 let condition=base,args:unknown[]=[g.channel,g.owner,lease,now];
 if(operation==='challenge'){condition+=" AND NOT EXISTS(SELECT 1 FROM fishing_duel_locks WHERE channel=? AND username IN (?,?)) AND NOT EXISTS(SELECT 1 FROM fishing_duel_commands WHERE channel=? AND username=? AND command IN ('!дуэль','!duel') AND created>?)";args.push(g.channel,name,opponent,g.channel,name,now-30000);}
 else if(operation!=='reply'){condition+=" AND EXISTS(SELECT 1 FROM fishing_duels WHERE id=? AND channel=? AND status='pending' AND expires>? AND "+(cancel?'challenger':'opponent')+'=?)';args.push(duel!.id,g.channel,now,name);}
 if(operation==='accept'||operation==='challenge'){condition+=" AND EXISTS(SELECT 1 FROM fishing_players WHERE channel=? AND username=? AND COALESCE(json_extract(state,?),0)>0) AND EXISTS(SELECT 1 FROM fishing_players WHERE channel=? AND username=? AND COALESCE(json_extract(state,?),0)>0)";args.push(g.channel,duel!.challenger,'$.inventory.'+aFish!.id,g.channel,duel!.opponent,'$.inventory.'+bFish!.id);}
 const statements=[db.prepare('INSERT OR IGNORE INTO fishing_duel_commands(id,channel,username,command,nonce,message,created) SELECT ?,?,?,?,?,?,? WHERE '+condition).bind(id,g.channel,name,challenger&&operation==='reply'?cmd+':error':cmd,nonce,message,now,...args)];
 if(operation==='challenge'){
  statements.push(db.prepare('INSERT INTO fishing_duels(id,channel,challenger,opponent,challenger_fish,opponent_fish,created,expires) SELECT ?,?,?,?,?,?,?,? WHERE '+guard).bind(duel!.id,g.channel,name,opponent,aFish!.id,bFish!.id,now,now+60000,id,nonce));
  for(const username of [name,opponent])statements.push(db.prepare('INSERT INTO fishing_duel_locks(channel,username,duel,expires) SELECT ?,?,?,? WHERE '+guard).bind(g.channel,username,duel!.id,now+60000,id,nonce));
 }else if(operation!=='reply'){
  statements.push(db.prepare('UPDATE fishing_duels SET status=?,resolved=?,opponent_fish=?,challenger_score=?,opponent_score=?,winner=?,transferred_fish=? WHERE id=? AND '+guard).bind(operation==='accept'?'completed':operation==='cancel'?'cancelled':'declined',now,bFish?.id??null,operation==='accept'?aScore:null,operation==='accept'?bScore:null,winner,operation==='accept'&&winner?(winner===duel!.challenger?bFish!.id:aFish!.id):null,duel!.id,id,nonce));
  if(operation==='accept'&&winner){
   const loser=winner===duel!.challenger?duel!.opponent:duel!.challenger,fish=winner===duel!.challenger?bFish!:aFish!,path='$.inventory.'+fish.id;
   statements.push(db.prepare('UPDATE fishing_players SET state=CASE WHEN json_extract(state,?)=1 THEN json_remove(state,?) ELSE json_set(state,?,COALESCE(json_extract(state,?),0)-1) END,rev=rev+1 WHERE channel=? AND username=? AND '+guard).bind(path,path,path,path,g.channel,loser,id,nonce));
   statements.push(db.prepare('UPDATE fishing_players SET state=json_set(state,?,COALESCE(json_extract(state,?),0)+1),rev=rev+1 WHERE channel=? AND username=? AND '+guard).bind(path,path,g.channel,winner,id,nonce));
  }
  statements.push(db.prepare('DELETE FROM fishing_duel_locks WHERE channel=? AND duel=? AND '+guard).bind(g.channel,duel!.id,id,nonce));
 }
 statements.push(db.prepare('INSERT OR IGNORE INTO fishing_log(id,channel,username,message,item_id,chance,created) SELECT ?,?,?,?,NULL,NULL,? WHERE '+guard).bind(id,g.channel,name,message,now,id,nonce));
 statements.push(db.prepare("INSERT OR IGNORE INTO twitch_bot_messages(id,channel,kind,text,created,ready_at,expires) SELECT ?,?,'fish',?,?,?,? WHERE "+guard+" AND EXISTS(SELECT 1 FROM twitch_bot_settings WHERE channel=? AND owner=? AND enabled=1 AND fish_replies=1) AND (SELECT COUNT(*) FROM twitch_bot_messages WHERE channel=? AND status='queued' AND expires>?)<100").bind('fish:'+g.channel+':'+id,g.channel,chatText(message),now,now,now+45000,id,nonce,g.channel,g.owner,g.channel,now));
 const results=await db.batch(statements);return results[0].meta.changes?{id,username:name,message,item_id:null,chance:null,created:now}:null;
}
