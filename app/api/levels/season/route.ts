import {getChatGPTUser} from '../../../chatgpt-auth';
import {fishingIdentity} from '../../../../lib/fishing/identity';
import {levelsDb} from '../../../../lib/levels/storage';
import {levelMonth,monthLabel} from '../../../../lib/levels/season';
import {levelTitle} from '../../../../lib/levels/titles';
import {progressFor} from '../../../../lib/levels/rules';
export const dynamic='force-dynamic';
type Row={user_id:string;login:string;name:string;xp:number;messages:number;total_xp:number;title_id:string|null;position:number};
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const q=new URL(req.url).searchParams,channel=q.get('channel')??'',current=levelMonth(),month=q.get('month')||current;
 if(!/^[a-z0-9_]{1,25}$/.test(channel)||!/^20\d\d-(0[1-9]|1[0-2])$/.test(month)||month>current)return reply({error:'Выбери канал и месяц.'},400);
 const db=levelsDb();
 const known=await db.prepare('SELECT channel FROM streamers WHERE channel=? UNION SELECT channel FROM twitch_bot_channels WHERE channel=? LIMIT 1').bind(channel,channel).first();
 if(!known)return reply({error:'Канал не добавлен на сайт.'},404);
 const user=await getChatGPTUser(),identity=await fishingIdentity(user);
 const ranked=`WITH ranked AS (SELECT m.user_id,p.login,p.name,m.messages AS xp,m.messages,p.messages AS total_xp,f.title_id,ROW_NUMBER() OVER (ORDER BY m.messages DESC,m.last_earned ASC,m.user_id ASC) AS position FROM level_months m JOIN level_players p ON p.channel=m.channel AND p.user_id=m.user_id LEFT JOIN level_profiles f ON f.twitch_id=m.user_id WHERE m.channel=? AND m.month=? AND m.messages>0) SELECT * FROM ranked`;
 const [leaders,me,months,stats]=await Promise.all([
  db.prepare(ranked+' ORDER BY position LIMIT 50').bind(channel,month).all<Row>(),
  identity?db.prepare(ranked+' WHERE user_id=?').bind(channel,month,identity.twitchId).first<Row>():null,
  db.prepare('SELECT DISTINCT month FROM level_months WHERE channel=? ORDER BY month DESC LIMIT 12').bind(channel).all<{month:string}>(),
  db.prepare('SELECT COUNT(CASE WHEN messages>0 THEN 1 END) AS participants,COALESCE(SUM(messages),0) AS xp,MIN(first_seen) AS since FROM level_months WHERE channel=? AND month=?').bind(channel,month).first<{participants:number;xp:number;since:number|null}>(),
 ]);
 const present=(row:Row)=>({userId:row.user_id,name:row.name,login:row.login,xp:row.xp,messages:row.messages,position:row.position,title:levelTitle(row.title_id,progressFor(row.total_xp).level)?.name??''});
 return reply({channel,month,label:monthLabel(month),current:month===current,months:[...new Set([current,...months.results.map(x=>x.month),month])].sort().reverse().map(id=>({id,label:monthLabel(id)})),leaders:leaders.results.map(present),me:me?present(me):null,stats:stats??{participants:0,xp:0,since:null},rewardsEnabled:false});
}catch{return reply({error:'Не удалось загрузить рейтинг месяца.'},503);}}
