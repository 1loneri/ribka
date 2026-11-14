export function createNotifications(db){
 db.exec(`CREATE TABLE IF NOT EXISTS account_notifications(id INTEGER PRIMARY KEY,event_key TEXT NOT NULL UNIQUE,owner_id TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,url TEXT NOT NULL,created_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS notification_reads(player_id TEXT PRIMARY KEY,last_id INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS notifications_owner ON account_notifications(owner_id,id);
 CREATE TRIGGER IF NOT EXISTS notify_support_answer AFTER INSERT ON support_messages WHEN NEW.role='admin' BEGIN
 INSERT OR IGNORE INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) SELECT 'support:'||NEW.id,t.owner_id,'support','Ответ администрации','В обращении №'||t.id||' появилось новое сообщение.','/requests',NEW.created_at FROM support_tickets t WHERE t.id=NEW.ticket_id; END;
 CREATE TRIGGER IF NOT EXISTS notify_order_fulfilled AFTER UPDATE OF status ON shop_orders WHEN NEW.status='fulfilled' AND OLD.status<>'fulfilled' BEGIN
 INSERT OR IGNORE INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES('order:'||NEW.id,NEW.player_id,'prize','Приз выдан','Заявка №'||NEW.id||' на '||NEW.vp||' VP отмечена как выданная.','/profile',CAST(strftime('%s','now') AS INTEGER)*1000);END;`);
 db.prepare('INSERT OR IGNORE INTO account_notifications(event_key,owner_id,kind,title,body,url,created_at) VALUES(?,?,?,?,?,?,?)').run('release:soda51','*','update','Обновлены дуэли и уведомления','В дуэлях добавлены косметические банки. Уведомления получили проверку звука и более тихий сигнал.','/duels',Date.now());
 const last=s=>db.prepare('SELECT last_id FROM notification_reads WHERE player_id=?').get(s.player_id)?.last_id||0;
 function unread(s){return db.prepare("SELECT COUNT(*) AS n FROM account_notifications WHERE (owner_id=? OR owner_id='*') AND id>?").get(s.player_id,last(s)).n}
 function list(s){const seen=last(s);return db.prepare("SELECT id,kind,title,body,url,created_at FROM account_notifications WHERE owner_id=? OR owner_id='*' ORDER BY id DESC LIMIT 60").all(s.player_id).map(n=>({...n,unread:n.id>seen}))}
 function read(s,maxId){if(!Number.isSafeInteger(Number(maxId))||Number(maxId)<0)throw Object.assign(Error('Неверный номер уведомления'),{status:400});const id=db.prepare("SELECT MAX(id) AS id FROM account_notifications WHERE (owner_id=? OR owner_id='*') AND id<=?").get(s.player_id,Number(maxId)).id||0;db.prepare('INSERT INTO notification_reads(player_id,last_id) VALUES(?,?) ON CONFLICT(player_id) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)').run(s.player_id,id);return {ok:true}}
 return {list,read,unread};
}
