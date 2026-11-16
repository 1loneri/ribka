export function createLeaderboard(db){
 db.exec('CREATE INDEX IF NOT EXISTS players_leaderboard ON players(balance DESC,login ASC,id ASC)');
 return function leaderboard(rawPage){
  const pageSize=10,total=db.prepare('SELECT COUNT(*) n FROM players').get().n,pages=Math.max(1,Math.ceil(total/pageSize));
  const value=String(rawPage??'1'),requested=/^[1-9]\d{0,8}$/.test(value)?Number(value):1,page=Math.min(requested,pages),offset=(page-1)*pageSize;
  const players=db.prepare('SELECT login,balance,opens FROM players ORDER BY balance DESC,login ASC,id ASC LIMIT ? OFFSET ?').all(pageSize,offset);
  return {players,total,page,pages,pageSize,offset};
 };
}
