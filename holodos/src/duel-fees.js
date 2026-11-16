// record() joins the duel-resolution transaction. settle() owns a transaction.
export function createDuelFees(db,transaction){
 db.exec(`CREATE TABLE IF NOT EXISTS duel_fee_owner(id INTEGER PRIMARY KEY CHECK(id=1),player_id TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS duel_fee_credits(duel_id INTEGER PRIMARY KEY,amount INTEGER NOT NULL CHECK(amount>0),recipient_id TEXT,created_at INTEGER NOT NULL,credited_at INTEGER);`);
 function owner(){
  let id=db.prepare('SELECT player_id FROM duel_fee_owner WHERE id=1').get()?.player_id;
  if(id)return id;
  const hasAdmins=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='twitch_admin_accounts'").get();
  id=hasAdmins?db.prepare("SELECT player_id FROM twitch_admin_accounts WHERE login='war1ouss'").get()?.player_id:null;
  if(!id){const rows=db.prepare("SELECT id FROM players WHERE lower(login)='war1ouss' LIMIT 2").all();if(rows.length!==1)return null;id=rows[0].id;}
  db.prepare("INSERT OR IGNORE INTO players(id,login) VALUES(?,'war1ouss')").run(id);
  db.prepare('INSERT OR IGNORE INTO duel_fee_owner VALUES(1,?)').run(id);
  return db.prepare('SELECT player_id FROM duel_fee_owner WHERE id=1').get().player_id;
 }
 function flush(now){
  const amount=db.prepare('SELECT SUM(amount) amount FROM duel_fee_credits WHERE credited_at IS NULL').get().amount||0;if(!amount)return 0;
  const id=owner();if(!id)return 0;
  if(!db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(amount,id).changes)throw Error('Duel fee recipient missing');
  db.prepare('UPDATE duel_fee_credits SET recipient_id=?,credited_at=? WHERE credited_at IS NULL').run(id,now);
  return amount;
 }
 function record(duelId,now){const d=db.prepare("SELECT fee FROM duels WHERE id=? AND status='accepted'").get(duelId);if(!d||!Number.isSafeInteger(d.fee)||d.fee<=0)return 0;const inserted=db.prepare('INSERT OR IGNORE INTO duel_fee_credits(duel_id,amount,created_at) VALUES(?,?,?)').run(duelId,d.fee,now);return inserted.changes?flush(now):0;}
 function settle(now){if(!db.prepare('SELECT 1 FROM duel_fee_credits WHERE credited_at IS NULL LIMIT 1').get())return 0;return transaction(()=>flush(now));}
 return {record,settle};
}
