export function createLeaderboard(db){
 db.exec('CREATE INDEX IF NOT EXISTS players_leaderboard ON players(balance DESC,login ASC,id ASC)');
 return function leaderboard(rawPage){
  const pageSize=10,total=db.prepare('SELECT COUNT(*) n FROM players').get().n,pages=Math.max(1,Math.ceil(total/pageSize));
  const value=String(rawPage??'1'),requested=/^[1-9]\d{0,8}$/.test(value)?Number(value):1,page=Math.min(requested,pages),offset=(page-1)*pageSize;
  const players=db.prepare('SELECT login,balance,opens FROM players ORDER BY balance DESC,login ASC,id ASC LIMIT ? OFFSET ?').all(pageSize,offset);
  return {players,total,page,pages,pageSize,offset};
 };
}

export function createChatLeaderboard(db){
 db.exec('CREATE INDEX IF NOT EXISTS chat_stats_leaderboard ON chat_stats(message_count DESC,login ASC,player_id ASC)');
 return function chatLeaderboard(rawPage){
  const pageSize=10,total=db.prepare('SELECT COUNT(*) n FROM chat_stats WHERE message_count>0').get().n,pages=Math.max(1,Math.ceil(total/pageSize));
  const value=String(rawPage??'1'),requested=/^[1-9]\d{0,8}$/.test(value)?Number(value):1,page=Math.min(requested,pages),offset=(page-1)*pageSize;
  const players=db.prepare("SELECT c.login,c.message_count,c.badges_json,COALESCE(p.frame,'') AS frame,COALESCE(p.title,'') AS title,COALESCE(p.name_color,'') AS name_color FROM chat_stats c LEFT JOIN cosmetic_profiles p ON p.player_id=c.player_id WHERE c.message_count>0 ORDER BY c.message_count DESC,c.login ASC,c.player_id ASC LIMIT ? OFFSET ?").all(pageSize,offset);
  return {players,total,page,pages,pageSize,offset};
 };
}
