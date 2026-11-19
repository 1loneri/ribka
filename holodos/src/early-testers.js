// Legacy entry point retained for existing startup imports; automatic titles are retired.
export function freezeEarlyTesters(db){
 db.exec("CREATE TABLE IF NOT EXISTS early_testers(player_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS site_migrations(key TEXT PRIMARY KEY,created_at INTEGER NOT NULL)");
 db.exec('BEGIN IMMEDIATE');
 try{
  db.prepare("UPDATE cosmetic_profiles SET title='' WHERE title IN ('Подписчик','Тестер')").run();
  db.prepare("DELETE FROM cosmetic_equipped WHERE kind='title' AND item_id IN ('tester','subscriber')").run();
  db.prepare("DELETE FROM cosmetic_inventory WHERE kind='title' AND item_id IN ('tester','subscriber')").run();
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
