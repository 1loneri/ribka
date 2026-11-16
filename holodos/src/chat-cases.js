import {createCasePurchases} from './case-purchases.js';
import {randomInt} from 'node:crypto';
import {caseRewardOptions} from './case-catalog.js';
export function createChatCases({db,transaction,cases,player,random=randomInt,vipStatus=()=>null,tickets=null,controls=null}){
 db.exec(`CREATE TABLE IF NOT EXISTS chat_case_spending(player_id TEXT PRIMARY KEY,messages INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS case_openings(id INTEGER PRIMARY KEY,request_id TEXT NOT NULL UNIQUE,player_id TEXT NOT NULL,login TEXT NOT NULL,case_id TEXT NOT NULL,cost INTEGER NOT NULL,revision INTEGER NOT NULL,reward_json TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS case_openings_player ON case_openings(player_id,id DESC);
 CREATE TABLE IF NOT EXISTS case_prize_claims(id INTEGER PRIMARY KEY,opening_id INTEGER NOT NULL UNIQUE,player_id TEXT NOT NULL,login TEXT NOT NULL,reward_id TEXT NOT NULL,label TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at INTEGER NOT NULL,fulfilled_at INTEGER,fulfilled_by TEXT);
 CREATE TABLE IF NOT EXISTS chat_counted_messages(message_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);`);
 db.exec("UPDATE account_notifications SET url='/profile' WHERE url='/cases' AND (event_key GLOB 'case:[0-9]*' OR event_key GLOB 'case-fulfilled:[0-9]*')");
 for(const name of ['cancelled_at','cancelled_by'])if(!db.prepare('PRAGMA table_info(case_prize_claims)').all().some(c=>c.name===name))db.exec('ALTER TABLE case_prize_claims ADD COLUMN '+name+(name==='cancelled_at'?' INTEGER':' TEXT'));
 const purchases=createCasePurchases(db,transaction);
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 const config=(id='chat')=>cases.list().find(c=>c.id===id);
 function progress(id){const c=config(),count=db.prepare('SELECT message_count FROM chat_stats WHERE player_id=?').get(id)?.message_count||0,spent=db.prepare('SELECT messages FROM chat_case_spending WHERE player_id=?').get(id)?.messages||0;
 const enabled=c.priceUnit==='messages'&&Number.isSafeInteger(c.priceAmount)&&c.priceAmount>0,remaining=Math.max(0,count-spent);
 return {enabled,total:count,spent,threshold:c.priceAmount,available:enabled?Math.floor(remaining/c.priceAmount):0,progress:enabled?remaining%c.priceAmount:0};}
 function coinStatus(id){const c=config('coins'),balance=db.prepare('SELECT balance FROM players WHERE id=?').get(id)?.balance||0,enabled=c.priceUnit==='w'&&Number.isSafeInteger(c.priceAmount)&&c.priceAmount>0;return {enabled,cost:c.priceAmount,available:enabled?Math.floor(balance/c.priceAmount):0};}
 function history(id){return db.prepare(`SELECT o.id,o.case_id,o.reward_json,o.created_at,c.status AS claim_status FROM case_openings o LEFT JOIN case_prize_claims c ON c.opening_id=o.id WHERE o.player_id=? ORDER BY o.id DESC LIMIT 10`).all(id).map(r=>({id:r.id,caseId:r.case_id,reward:JSON.parse(r.reward_json),created_at:r.created_at,claim_status:r.claim_status}));}
 function open(session,requestId,allowed,caseId='chat',expectedCost){if(!['chat','coins','donation','twitch','vip','subscriber'].includes(caseId))fail('Неизвестный кейс.');return transaction(()=>{
  const previous=db.prepare('SELECT * FROM case_openings WHERE request_id=?').get(requestId);
  if(previous){if(previous.player_id!==session.player_id)fail('Этот запрос принадлежит другому игроку.',409);if(previous.case_id!==caseId)fail('Этот запрос относится к другому кейсу.',409);return {ok:true,openingId:previous.id,reward:JSON.parse(previous.reward_json),replayed:true};}
  if(!allowed)fail('Кейсы доступны во время стрима. Вне эфира — только администраторам.',403);
  controls?.requireEnabled('case:'+caseId);
  const c=config(caseId),p=caseId==='chat'?progress(session.player_id):caseId==='coins'?coinStatus(session.player_id):caseId==='donation'?purchases.status(session.player_id):tickets.status(session.player_id)[caseId],cost=caseId==='chat'?p.threshold:caseId==='coins'?p.cost:1;if(caseId==='coins'&&expectedCost!==undefined&&expectedCost!==cost)fail('Цена кейса изменилась. Обнови страницу перед открытием.',409);if(!p.enabled)fail('Кейс временно недоступен.',409);if(!p.available)fail(caseId==='chat'?'Пока недостаточно сообщений для открытия.':caseId==='coins'?'Недостаточно W-монет для открытия.':'Нет подтверждённых покупок для открытия.',409);
  player(session.player_id,session.login);
  const rows=c.rewards.filter(r=>!controls||controls.enabled('reward:'+r.id)).map(r=>({...r,units:Math.round(r.weight*1e6)})),total=rows.reduce((s,r)=>s+r.units,0);
  if(!Number.isSafeInteger(total)||total<=0||rows.some(r=>!caseRewardOptions[r.id]||r.units<=0))fail('Проверь состав кейса в админ-панели.',409);
  let ticket=random(total),selected;for(const r of rows){ticket-=r.units;if(ticket<0){selected=r;break;}}
  if(!selected)throw Error('Invalid random result');
  const now=Date.now();let reward={...caseRewardOptions[selected.id],id:selected.id};let gain=0,claim=false;
  if(reward.id==='vip-month'){
   const badges=JSON.parse(db.prepare('SELECT badges_json FROM chat_stats WHERE player_id=?').get(session.player_id)?.badges_json||'{}');
   const priorVip=db.prepare("SELECT 1 FROM case_prize_claims WHERE player_id=? AND reward_id='vip-month' AND (status='pending' OR fulfilled_at>?)").get(session.player_id,now-30*86400000);
   if(badges.vip||badges.broadcaster||priorVip||vipStatus(session.player_id)?.active||vipStatus(session.player_id)?.pending)reward={...caseRewardOptions['w-3000'],id:'w-3000',originalId:'vip-month',note:'VIP уже активен или ожидает выдачи: замена на 3 000 W.'};
  }
  if(reward.id.startsWith('w-'))gain=Number(reward.id.slice(2));
  else if(reward.id==='case-donation'){db.prepare('INSERT INTO case_purchase_inventory VALUES(?,1) ON CONFLICT(player_id) DO UPDATE SET available=available+1').run(session.player_id);reward.note='Одно открытие покупного кейса добавлено на аккаунт.';}
  else if(['vp','vip','physical'].includes(reward.symbol))claim=true;
  else {
   let changes=0;const actor=caseId+'-case';
   if(reward.frame)changes=db.prepare('INSERT OR IGNORE INTO frame_inventory VALUES(?,?,?,?)').run(session.player_id,reward.frame,actor,now).changes;
   else if(reward.can)changes=db.prepare('INSERT OR IGNORE INTO duel_can_inventory VALUES(?,?,?,?)').run(session.player_id,reward.can,actor,now).changes;
   else {const kind=reward.id.startsWith('name_color-')?'name_color':reward.id.split('-')[0],item=reward.id.slice(kind.length+1);changes=db.prepare('INSERT OR IGNORE INTO cosmetic_inventory VALUES(?,?,?,?,?)').run(session.player_id,kind,item,actor,now).changes;}
   if(!changes){gain=1000;reward={...caseRewardOptions['w-1000'],id:'w-1000',originalId:reward.id,note:'Повторная косметика: компенсация 1 000 W.'};}
  }
  if(caseId==='donation'){const guaranteed=Number(c.guaranteedW||0);if(!Number.isSafeInteger(guaranteed)||guaranteed<0||guaranteed>10000000)throw Error('Invalid guaranteed reward');gain+=guaranteed;if(guaranteed){reward.guaranteedW=guaranteed;reward.note=[reward.note,'Дополнительно начислено '+guaranteed.toLocaleString('ru-RU')+' W.'].filter(Boolean).join(' ');}purchases.consume(session.player_id);}
  if(['twitch','vip','subscriber'].includes(caseId))tickets.consume(session.player_id,caseId);
  reward.delivery=claim?'manual':'credited';const delta=gain-(caseId==='coins'?cost:0);if(delta)db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(delta,session.player_id);
  if(caseId==='chat')db.prepare('INSERT INTO chat_case_spending VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET messages=messages+excluded.messages').run(session.player_id,p.threshold);
  const o=db.prepare("INSERT INTO case_openings(request_id,player_id,login,case_id,cost,revision,reward_json,created_at) VALUES(?,?,?,?,?,?,?,?)").run(requestId,session.player_id,session.login,caseId,cost,c.revision,JSON.stringify(reward),now);
  const openingId=Number(o.lastInsertRowid);
  if(claim)db.prepare('INSERT INTO case_prize_claims(opening_id,player_id,login,reward_id,label,created_at) VALUES(?,?,?,?,?,?)').run(openingId,session.player_id,session.login,reward.id,reward.label,now);
  db.prepare("INSERT INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES(?,?,'prize','Награда из кейса',?,'/profile',?)").run('case:'+openingId,session.player_id,reward.label+(reward.guaranteedW?' + '+reward.guaranteedW.toLocaleString('ru-RU')+' W':'')+(claim?' — заявка создана, ожидает ручной выдачи администрацией.':' — начислено.'),now);
  return {ok:true,openingId,reward};
 });}
 function fulfill(id,actor){if(!Number.isSafeInteger(Number(id))||Number(id)<=0)fail('Неверная заявка.');return transaction(()=>{const row=db.prepare('SELECT * FROM case_prize_claims WHERE id=?').get(Number(id));if(!row)fail('Заявка не найдена.',404);if(row.status==='fulfilled')return {ok:true};if(row.status!=='pending')fail('Выдача этого приза уже отменена.',409);const now=Date.now();db.prepare("UPDATE case_prize_claims SET status='fulfilled',fulfilled_at=?,fulfilled_by=? WHERE id=? AND status='pending'").run(now,String(actor),row.id);db.prepare("INSERT OR IGNORE INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES(?,?,'prize','Приз выдан',?,'/profile',?)").run('case-fulfilled:'+row.id,row.player_id,'Администратор отметил выдачу: '+row.label,now);return {ok:true};});}
 function cancel(id,actor){if(!Number.isSafeInteger(Number(id))||Number(id)<=0)fail('Неверная заявка.');return transaction(()=>{const row=db.prepare('SELECT * FROM case_prize_claims WHERE id=?').get(Number(id));if(!row)fail('Заявка не найдена.',404);if(row.status==='cancelled')return {ok:true};if(row.status!=='pending')fail('Уже выданный приз нельзя отменить этой кнопкой.',409);const now=Date.now();db.prepare("UPDATE case_prize_claims SET status='cancelled',cancelled_at=?,cancelled_by=? WHERE id=? AND status='pending'").run(now,String(actor),row.id);db.prepare("INSERT OR IGNORE INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES(?,?,'prize','Выдача отменена',?,'/profile',?)").run('case-cancelled:'+row.id,row.player_id,'Администратор отменил выдачу: '+row.label,now);return {ok:true};});}
 function renderAdmin(escape,csrf,filter='all'){
  const condition=filter==='vp'?" AND reward_id LIKE 'vp-%'":filter==='other'?" AND reward_id NOT LIKE 'vp-%'":'',group=filter==='vp'?'vp':'cases',id=filter==='vp'?'case-vp-prizes':'case-prizes';
  const rows=db.prepare("SELECT * FROM case_prize_claims WHERE status='pending'"+condition+' ORDER BY id LIMIT 100').all(),history=db.prepare("SELECT * FROM case_prize_claims WHERE status<>'pending'"+condition+' ORDER BY COALESCE(cancelled_at,fulfilled_at,created_at) DESC,id DESC LIMIT 20').all();
  const form=(r,action,label,danger=false)=>'<form method="post" action="/case-prize-'+action+'"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><input type="hidden" name="claim_id" value="'+r.id+'"><input type="hidden" name="return_section" value="'+group+'"><button type="submit" '+(danger?'class="danger"':'')+'>'+label+'</button></form>';
  return '<section class="admin-panel" id="'+id+'"><h2>'+(filter==='vp'?'VP из кейсов':'Призы из кейсов')+'</h2><p class="admin-note">Отмечай выдачу только после передачи приза. Ожидающую выдачу можно отменить; игрок увидит этот статус в профиле. W и косметика начисляются автоматически.</p>'+(filter==='other'?'<p><a href="/admin/vp#case-vp-prizes">Выдачи VP из кейсов →</a></p>':'')+(!rows.length?'<p>Нет призов, ожидающих выдачи.</p>':rows.map(r=>'<article class="admin-order"><b>№'+r.id+' · @'+escape(r.login)+' · '+escape(r.label)+'</b><div class="admin-actions">'+form(r,'fulfill','Приз выдан')+form(r,'cancel','Отменить выдачу',true)+'</div></article>').join(''))+(history.length?'<details class="admin-claim-history"><summary>История выдач</summary>'+history.map(r=>'<div class="admin-row"><span>№'+r.id+' · @'+escape(r.login)+' · '+escape(r.label)+'</span><b>'+(r.status==='cancelled'?'Выдача отменена':'Выдано')+'</b></div>').join('')+'</details>':'')+'</section>';
 }

 return {progress,coinStatus,purchases,history,open,openDonation:(session,requestId,allowed)=>open(session,requestId,allowed,'donation'),openCoins:(session,requestId,allowed,expectedCost)=>open(session,requestId,allowed,'coins',expectedCost),fulfill,cancel,renderAdmin};
}
