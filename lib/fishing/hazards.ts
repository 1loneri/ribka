import {fishDb,type Game} from './storage';
import {random,hazardEvents} from './game';
import type {FeedMessage} from '../twitch-feed/types';
export type HazardRun={id:string;channel:string;owner:string;event:string;created:number;message:string};
export async function launchHazard(g:Game,actor:string,id:string){
 const db=fishDb(),existing=await db.prepare('SELECT * FROM fishing_hazards WHERE id=? AND channel=? AND owner=?').bind(id,g.channel,actor).first<HazardRun>();if(existing)return {...existing,replayed:true};
 const roll=random(),event=hazardEvents[roll>=.99?2:roll<.495?0:1],now=Date.now(),nonce=crypto.randomUUID(),until=now+600000;
 const gate='EXISTS(SELECT 1 FROM fishing_hazards WHERE id=? AND nonce=?)',gateArgs=[id,nonce];
 const statements=[db.prepare("INSERT OR IGNORE INTO fishing_hazards(id,channel,owner,nonce,event,created) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM fishing_games WHERE channel=? AND NOT(event_id IN ('seagulls','thieves','abductors') AND active_until>?))").bind(id,g.channel,actor,nonce,event.id,now,g.channel,now),
 db.prepare('UPDATE fishing_games SET event_id=?,active_until=?,next_event=? WHERE channel=? AND '+gate).bind(event.id,until,until+1800000,g.channel,...gateArgs)];
 statements.push(db.prepare("INSERT INTO fishing_hazard_losses(id,run,channel,username,item,amount) SELECT ?||':'||username,?,channel,username,NULL,MIN(coins,MAX(1,MIN(25,CAST(coins*.1 AS INTEGER)))) FROM fishing_players WHERE channel=? AND coins>0 AND "+gate).bind(id,id,g.channel,...gateArgs));
 const loss='(SELECT amount FROM fishing_hazard_losses WHERE run=? AND item IS NULL AND channel=fishing_players.channel AND username=fishing_players.username)';
 statements.push(db.prepare("UPDATE fishing_players SET state=json_set(state,'$.coins',MAX(0,coins-"+loss+")),coins=MAX(0,coins-"+loss+"),rev=rev+1 WHERE channel=? AND "+gate+' AND EXISTS(SELECT 1 FROM fishing_hazard_losses WHERE run=? AND item IS NULL AND channel=fishing_players.channel AND username=fishing_players.username)').bind(id,id,g.channel,...gateArgs,id));
 if(event.id==='abductors'){
  statements.push(db.prepare("INSERT INTO fishing_hazard_losses(id,run,channel,username,item,amount) SELECT ?||':'||username||':cat',?,channel,username,'cat',1 FROM fishing_players WHERE channel=? AND json_extract(state,'$.cat.alive')=1 AND (json_extract(state,'$.cat.active')=0 OR json_extract(state,'$.cat.fedUntil')>COALESCE(json_extract(state,'$.cat.clockAt'),?)) AND "+gate+' ORDER BY random() LIMIT 1').bind(id,id,g.channel,now,...gateArgs));
  statements.push(db.prepare("UPDATE fishing_players SET state=json_set(state,'$.cat.alive',json('false'),'$.cat.active',json('false'),'$.cat.stolen',json('true')),rev=rev+1 WHERE channel=? AND "+gate+" AND EXISTS(SELECT 1 FROM fishing_hazard_losses WHERE run=? AND item='cat' AND channel=fishing_players.channel AND username=fishing_players.username)").bind(g.channel,...gateArgs,id));
 }
 const tail=event.id==='abductors'?"||COALESCE((SELECT ' Котик похищен у @'||username||'.' FROM fishing_hazard_losses WHERE run=? AND item='cat'),' Котиков не удалось похитить.')":'';
 statements.push(db.prepare("UPDATE fishing_hazards SET message=?||'Украдено '||COALESCE((SELECT SUM(amount) FROM fishing_hazard_losses WHERE run=? AND item IS NULL),0)||' монет.'"+tail+' WHERE id=? AND nonce=?').bind(event.name+': ',id,...(event.id==='abductors'?[id]:[]),id,nonce));
 const payload:FeedMessage={id:'hazard:'+id,kind:'notice',userId:'',login:'ribka',name:'Рыбка',color:'',badges:[],text:'',fragments:[],created:now};
 statements.push(db.prepare("INSERT OR IGNORE INTO chat_messages(channel,message_id,user_id,payload,created,removed) SELECT ?,?,'',json_set(?,'$.text',message),?,0 FROM fishing_hazards WHERE id=? AND nonce=?").bind(g.channel,payload.id,JSON.stringify(payload),now,id,nonce));
 statements.push(db.prepare("INSERT OR IGNORE INTO twitch_bot_messages(id,channel,kind,text,created,ready_at,expires) SELECT ?,?,'fish',message,?,?,? FROM fishing_hazards WHERE id=? AND nonce=? AND EXISTS(SELECT 1 FROM twitch_bot_settings WHERE channel=? AND owner=? AND enabled=1 AND fish_replies=1)").bind('hazard:'+id,g.channel,now,now,now+45000,id,nonce,g.channel,g.owner));
 await db.batch(statements);
 const saved=await db.prepare('SELECT * FROM fishing_hazards WHERE id=? AND channel=? AND owner=?').bind(id,g.channel,actor).first<HazardRun>();return saved?{...saved,replayed:false}:null;
}
