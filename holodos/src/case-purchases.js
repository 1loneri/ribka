export function createCasePurchases(db,transaction){
 db.exec(`CREATE TABLE IF NOT EXISTS case_purchase_inventory(player_id TEXT PRIMARY KEY,available INTEGER NOT NULL DEFAULT 0 CHECK(available>=0));
 CREATE TABLE IF NOT EXISTS case_purchase_grants(request_id TEXT PRIMARY KEY,player_id TEXT NOT NULL,login TEXT NOT NULL,receipt TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS case_purchase_receipts ON case_purchase_grants(receipt) WHERE receipt<>'';`);
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status})};
 function status(id){return {enabled:true,available:db.prepare('SELECT available FROM case_purchase_inventory WHERE player_id=?').get(id)?.available||0};}
 function grant(rawLogin,rawReceipt,requestId,actor){
  const login=String(rawLogin||'').trim().replace(/^@/,'').toLowerCase(),receipt=String(rawReceipt||'').trim();
  if(!/^[a-z0-9_]{1,25}$/.test(login)||!/^[a-f0-9]{32}$/.test(String(requestId))||receipt.length>80||/[\u0000-\u001f\u007f]/.test(receipt))fail('Проверь Twitch-ник и номер доната.');
  return transaction(()=>{
   const existing=db.prepare('SELECT * FROM case_purchase_grants WHERE request_id=?').get(requestId)||(receipt?db.prepare('SELECT * FROM case_purchase_grants WHERE receipt=?').get(receipt):null);
   if(existing){if(existing.login!==login||existing.receipt!==receipt)fail('Этот донат или подтверждение уже использованы для другого игрока.',409);return {ok:true,replayed:true};}
   const ids=new Set(db.prepare('SELECT id FROM players WHERE lower(login)=? UNION SELECT player_id AS id FROM chat_stats WHERE lower(login)=?').all(login,login).map(p=>p.id));
   if(ids.size!==1)fail('Игрок не найден однозначно. Попроси его войти на сайт через Twitch, затем повтори подтверждение.',404);
   const id=[...ids][0],now=Date.now();
   db.prepare('INSERT OR IGNORE INTO players(id,login) VALUES(?,?)').run(id,login);
   db.prepare('INSERT INTO case_purchase_grants VALUES(?,?,?,?,?,?)').run(requestId,id,login,receipt,String(actor),now);
   db.prepare('INSERT INTO case_purchase_inventory VALUES(?,1) ON CONFLICT(player_id) DO UPDATE SET available=available+1').run(id);
   db.prepare("INSERT INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES(?,?,'prize','Покупка подтверждена','Тебе доступно одно открытие донатного кейса. Кнопка «Крутить» появилась рядом с «Купить».','/cases',?)").run('case-purchase:'+requestId,id,now);
   return {ok:true,playerId:id};
  });
 }
 function consume(id){if(!db.prepare('UPDATE case_purchase_inventory SET available=available-1 WHERE player_id=? AND available>0').run(id).changes)fail('Нет подтверждённых покупок для открытия.',409);}
 function renderAdmin(escape,csrf,requestId){const rows=db.prepare('SELECT login,receipt,created_at FROM case_purchase_grants ORDER BY created_at DESC,request_id DESC LIMIT 20').all();return '<section class="admin-panel" id="case-purchases"><h2>Покупки донатного кейса</h2><p class="admin-note">Проверь донат на DonationAlerts и подтверди Twitch-ник покупателя. Одно подтверждение даёт одно открытие. Номер доната необязателен; если указать его, одну покупку нельзя подтвердить повторно.</p><form method="post" action="/case-purchase-confirm"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><input type="hidden" name="request_id" value="'+escape(requestId)+'"><label>Twitch-ник покупателя<input name="login" maxlength="26" required placeholder="@ник"></label><label>Номер доната (если есть)<input name="receipt" maxlength="80" placeholder="ID из DonationAlerts"></label><button type="submit">Подтвердить покупку · 1 кейс</button></form><h3>Последние подтверждения</h3>'+(!rows.length?'<p class="admin-note">Пока нет подтверждённых покупок.</p>':rows.map(r=>'<div class="admin-row"><b>@'+escape(r.login)+'</b><span>1 кейс'+(r.receipt?' · №'+escape(r.receipt):'')+' · '+escape(new Date(r.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Tallinn'}))+'</span></div>').join(''))+'</section>';}
 return {status,grant,consume,renderAdmin};
}
