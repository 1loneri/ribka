import {randomInt} from 'node:crypto';
import {caseRewardOptions} from './case-catalog.js';
export function createChatCases({db,transaction,cases,player,random=randomInt}){
 db.exec(`CREATE TABLE IF NOT EXISTS chat_case_spending(player_id TEXT PRIMARY KEY,messages INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS case_openings(id INTEGER PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,player_id TEXT NOT NULL,login TEXT NOT NULL,case_id TEXT NOT NULL,cost INTEGER NOT NULL,revision INTEGER NOT NULL,reward_json TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS case_openings_player ON case_openings(player_id,id DESC);
 CREATE TABLE IF NOT EXISTS case_prize_claims(id INTEGER PRIMARY KEY,opening_id INTEGER NOT NULL UNIQUE,player_id TEXT NOT NULL,login TEXT NOT NULL,reward_id TEXT NOT NULL,label TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,fulfilled_at INTEGER,fulfilled_by TEXT);
 CREATE TABLE IF NOT EXISTS chat_counted_messages(message_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);`);
 db.exec("UPDATE account_notifications SET url='/profile' WHERE url='/cases' AND (event_key GLOB 'case:[0-9]*' OR event_key GLOB 'case-fulfilled:[0-9]*')");
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 const config=(id='chat')=>cases.list().find(c=>c.id===id);
 function progress(id){const c=config(),count=db.prepare('SELECT message_count FROM chat_stats WHERE player_id=?').get(id)?.message_count||0,spent=db.prepare('SELECT messages FROM chat_case_spending WHERE player_id=?').get(id)?.messages||0;
 const enabled=c.priceUnit==='messages'&&Number.isSafeInteger(c.priceAmount)&&c.priceAmount>0,remaining=Math.max(0,count-spent);
 return {enabled,total:count,spent,threshold:c.priceAmount,available:enabled?Math.floor(remaining/c.priceAmount):0,progress:enabled?remaining%c.priceAmount:0};}
 function coinStatus(id){const c=config('coins'),balance=db.prepare('SELECT balance FROM players WHERE id=?').get(id)?.balance||0,enabled=c.priceUnit==='w'&&Number.isSafeInteger(c.priceAmount)&&c.priceAmount>0;return {enabled,cost:c.priceAmount,available:enabled?Math.floor(balance/c.priceAmount):0};}
 function history(id){return db.prepare(`SELECT o.id,o.case_id,o.reward_json,o.created_at,c.status AS claim_status FROM case_openings o LEFT JOIN case_prize_claims c ON c.opening_id=o.id WHERE o.player_id=? ORDER BY o.id DESC LIMIT 10`).all(id).map(r=>({id:r.id,caseId:r.case_id,reward:JSON.parse(r.reward_json),created_at:r.created_at,claim_status:r.claim_status}));}
 function open(session,requestId,allowed,caseId='chat',expectedCost){if(!['chat','coins'].includes(caseId))fail('Неизвестный кейс.');return transaction(()=>{
  const previous=db.prepare('SELECT * FROM case_openings WHERE request_id=?').get(requestId);
  if(previous){if(previous.player_id!==session.player_id)fail('Этот запрос принадлежит другому игроку.',409);if(previous.case_id!==caseId)fail('Этот запрос относится к другому кейсу.',409);return {ok:true,openingId:previous.id,reward:JSON.parse(previous.reward_json),replayed:true};}
  if(!allowed)fail('Кейсы доступны во время стрима. Вне эфира — только администраторам.',403);
  const c=config(caseId),p=caseId==='chat'?progress(session.player_id):coinStatus(session.player_id),cost=caseId==='chat'?p.threshold:p.cost;if(caseId==='coins'&&expectedCost!==undefined&&expectedCost!==cost)fail('Цена кейса изменилась. Обнови страницу перед открытием.',409);if(!p.enabled)fail('Кейс временно недоступен.',409);if(!p.available)fail(caseId==='chat'?'Пока недостаточно сообщений для открытия.':'Недостаточно W-монет для открытия.',409);
  player(session.player_id,session.login);
  const rows=c.rewards.map(r=>({...r,units:Math.round(r.weight*1e6)})),total=rows.reduce((s,r)=>s+r.units,0);
  if(!Number.isSafeInteger(total)||total<=0||rows.some(r=>!caseRewardOptions[r.id]||r.units<=0))fail('Проверь состав кейса в админ-панели.',409);
  let ticket=random(total),selected;for(const r of rows){ticket-=r.units;if(ticket<0){selected=r;break;}}
  if(!selected)throw Error('Invalid random result');
  const now=Date.now();let reward={...caseRewardOptions[selected.id],id:selected.id};let gain=0,claim=false;
  if(reward.id==='vip-month'){
   const badges=JSON.parse(db.prepare('SELECT badges_json FROM chat_stats WHERE player_id=?').get(session.player_id)?.badges_json||'{}');
   const priorVip=db.prepare("SELECT 1 FROM case_prize_claims WHERE player_id=? AND reward_id='vip-month' AND (status='pending' OR fulfilled_at>?)").get(session.player_id,now-30*86400000);
   if(badges.vip||badges.broadcaster||priorVip)reward={...caseRewardOptions['w-3000'],id:'w-3000',originalId:'vip-month',note:'VIP уже активен или ожидает выдачи: замена на 3 000 W.'};
  }
  if(reward.id.startsWith('w-'))gain=Number(reward.id.slice(2));
  else if(['vp','vip','physical'].includes(reward.symbol))claim=true;
  else {
   let changes=0;const actor=caseId+'-case';
   if(reward.frame)changes=db.prepare('INSERT OR IGNORE INTO frame_inventory VALUES(?,?,?,?)').run(session.player_id,reward.frame,actor,now).changes;
   else if(reward.can)changes=db.prepare('INSERT OR IGNORE INTO duel_can_inventory VALUES(?,?,?,?)').run(session.player_id,reward.can,actor,now).changes;
   else {const kind=reward.id.startsWith('name_color-')?'name_color':reward.id.split('-')[0],item=reward.id.slice(kind.length+1);changes=db.prepare('INSERT OR IGNORE INTO cosmetic_inventory VALUES(?,?,?,?,?)').run(session.player_id,kind,item,actor,now).changes;}
   if(!changes){gain=1000;reward={...caseRewardOptions['w-1000'],id:'w-1000',originalId:reward.id,note:'Повторная косметика: компенсация 1 000 W.'};}
  }
  reward.delivery=claim?'manual':'credited';const delta=gain-(caseId==='coins'?cost:0);if(delta)db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(delta,session.player_id);
  if(caseId==='chat')db.prepare('INSERT INTO chat_case_spending VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET messages=messages+excluded.messages').run(session.player_id,p.threshold);
  const o=db.prepare("INSERT INTO case_openings(request_id,player_id,login,case_id,cost,revision,reward_json,created_at) VALUES(?,?,?,?,?,?,?,?)").run(requestId,session.player_id,session.login,caseId,cost,c.revision,JSON.stringify(reward),now);
  const openingId=Number(o.lastInsertRowid);
  if(claim)db.prepare('INSERT INTO case_prize_claims(opening_id,player_id,login,reward_id,label,created_at) VALUES(?,?,?,?,?,?)').run(openingId,session.player_id,session.login,reward.id,reward.label,now);
  db.prepare("INSERT INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES(?,?,'prize','Награда из кейса',?,'/profile',?)").run('case:'+openingId,session.player_id,reward.label+(claim?' — заявка создана, ожидает ручной выдачи администрацией.':' — начислено.'),now);
  return {ok:true,openingId,reward};
 });}
 function fulfill(id,actor){if(!Number.isSafeInteger(Number(id))||Number(id)<=0)fail('Неверная заявка.');return transaction(()=>{const row=db.prepare('SELECT * FROM case_prize_claims WHERE id=?').get(Number(id));if(!row)fail('Заявка не найдена.',404);if(row.status==='fulfilled')return {ok:true};const now=Date.now();db.prepare("UPDATE case_prize_claims SET status='fulfilled',fulfilled_at=?,fulfilled_by=? WHERE id=? AND status='pending'").run(now,String(actor),row.id);db.prepare("INSERT OR IGNORE INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES(?,?,'prize','Приз выдан',?,'/profile',?)").run('case-fulfilled:'+row.id,row.player_id,'Администратор отметил выдачу: '+row.label,now);return {ok:true};});}
 function renderAdmin(escape,csrf){const rows=db.prepare("SELECT * FROM case_prize_claims WHERE status='pending' ORDER BY id LIMIT 100").all();return '<section class="admin-panel" id="case-prizes"><h2>Призы из кейсов</h2><p class="admin-note">VP, VIP и физические призы выдаются вручную. Отмечай выдачу только после передачи приза игроку. W и косметика начисляются автоматически.</p>'+(!rows.length?'<p>Нет призов, ожидающих выдачи.</p>':rows.map(r=>'<article class="admin-order"><b>№'+r.id+' · @'+escape(r.login)+' · '+escape(r.label)+'</b><form method="post" action="/case-prize-fulfill"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><input type="hidden" name="claim_id" value="'+r.id+'"><button type="submit">Приз выдан</button></form></article>').join(''))+'</section>';}
 return {progress,coinStatus,history,open,openCoins:(session,requestId,allowed,expectedCost)=>open(session,requestId,allowed,'coins',expectedCost),fulfill,renderAdmin};
}
