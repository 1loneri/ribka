import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRole} from '../../../../lib/streamer-auth';
import {fishingIdentity} from '../../../../lib/fishing/identity';
import {canOperateRoom,storedChannelConnection} from '../../../../lib/twitch-bot/channels';
import {guessDb,guessSnapshot,type GuessGameRow} from '../../../../lib/reviews/guess-storage';
import {GUESS_RANKS,guessAnswer} from '../../../../lib/reviews/guess-model';
import {validUuid} from '../../../../lib/reviews/model';
export const dynamic='force-dynamic';
const connectUrl=(channel='')=>'/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:'/reviews/guess'+(channel?'?channel='+channel:'')});
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const db=guessDb(),user=await getChatGPTUser(),role=await getRole(user),identity=await fishingIdentity(user);
 const [registered,friends]=await Promise.all([db.prepare('SELECT channel,name FROM streamers ORDER BY name').all<{channel:string;name:string}>(),db.prepare('SELECT channel,owner FROM twitch_bot_channels ORDER BY channel').all<{channel:string;owner:string}>()]);
 const channels=[...new Map([...registered.results,...friends.results.map(f=>({channel:f.channel,name:f.channel}))].map(c=>[c.channel,c])).values()],managed=role.streamer&&user?[role.streamer.channel,...friends.results.filter(f=>f.owner===user.userId).map(f=>f.channel)]:[];
 const channel=new URL(req.url).searchParams.get('channel')??managed[0]??channels[0]?.channel??'';
 if(channel&&!channels.some(c=>c.channel===channel))return reply({error:'Канал не добавлен на сайт.'},404);
 const canManage=!!user&&!!channel&&await canOperateRoom(user,channel),connection=canManage?await storedChannelConnection(user!.userId,channel):null;
 let scopes:string[]=[];try{scopes=JSON.parse(connection?.scopes??'[]');}catch{}
 const candidates=canManage?await db.prepare("SELECT id,riot_id,rank,duration_ms FROM demo_reviews WHERE purpose='guess' AND status IN ('queued','reviewing','reviewed','declined') AND rank!='unrated' AND video_key IS NOT NULL AND duration_ms>0 AND duration_ms<=120000 ORDER BY created DESC,id DESC LIMIT 100").all<{id:string;riot_id:string;rank:string;duration_ms:number}>():{results:[]};
 return reply({user:user?{name:user.displayName??user.email}:null,admin:role.admin,canStream:!!role.streamer,channel,channels,canManage,configured:!!connection&&scopes.includes('user:read:chat'),ownChannel:role.streamer?.channel===channel,me:identity?{name:identity.username}:null,connectUrl:connectUrl(channel),candidates:candidates.results.map(r=>({id:r.id,name:r.riot_id,rank:guessAnswer(r.rank)?.label??'',duration:r.duration_ms/1000})),game:channel?await guessSnapshot(channel,identity?.twitchId):null,now:Date.now()});
}catch{return reply({error:'Не удалось загрузить игру.'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Подключи Twitch, чтобы голосовать на сайте.',connectUrl:connectUrl()},401);
 const raw=await req.text();if(raw.length>2048)return reply({error:'Слишком большой запрос.'},413);
 let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['channel','action','gameId','reviewId','requestId','choice'].includes(k))||typeof b.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(b.channel))return reply({error:'Проверь параметры игры.'},400);
 const db=guessDb(),now=Date.now();
 if(b.action==='vote'){
  const identity=await fishingIdentity(user);if(!identity)return reply({error:'Сначала подключи Twitch.',connectUrl:connectUrl(b.channel)},409);
  if(!validUuid(b.gameId)||!GUESS_RANKS.some(r=>r.id===b.choice))return reply({error:'Выбери ранг.'},400);
  const saved=await db.prepare(`INSERT INTO rank_guess_votes(game_id,user_id,name,choice,updated) SELECT g.id,?,?,?,? FROM rank_guess_games g JOIN demo_reviews r ON r.id=g.review_id WHERE g.id=? AND g.channel=? AND g.state='voting' AND g.vote_ends>? AND g.expires>? AND r.twitch_id!=? AND r.status IN ('queued','reviewing','reviewed','declined') ON CONFLICT(game_id,user_id) DO UPDATE SET name=excluded.name,choice=excluded.choice,updated=excluded.updated WHERE excluded.updated>=rank_guess_votes.updated`).bind(identity.twitchId,identity.username,b.choice,now,b.gameId,b.channel,now,now,identity.twitchId).run();
  if(!saved.meta.changes)return reply({error:'Голосование закрыто или это твой клип.'},409);
  return reply({ok:true,game:await guessSnapshot(b.channel,identity.twitchId)});
 }
 if(!await canOperateRoom(user,b.channel))return reply({error:'Управление доступно организатору канала.'},403);
 if(b.action==='start'){
  if(!validUuid(b.reviewId)||!validUuid(b.requestId))return reply({error:'Выбери клип.'},400);
  const replay=await db.prepare('SELECT * FROM rank_guess_games WHERE id=?').bind(b.requestId).first<GuessGameRow>();
  if(replay)return replay.owner===user.userId&&replay.channel===b.channel&&replay.review_id===b.reviewId?reply({ok:true,replayed:true}):reply({error:'Обнови список клипов.'},409);
  const source=await db.prepare("SELECT rank FROM demo_reviews WHERE id=? AND purpose='guess' AND status IN ('queued','reviewing','reviewed','declined') AND video_key IS NOT NULL AND duration_ms>0 AND duration_ms<=120000").bind(b.reviewId).first<{rank:string}>();
  if(!source||!guessAnswer(source.rank))return reply({error:'Нужен опубликованный клип с указанным рангом.'},400);
  const result=await db.batch([
   db.prepare("UPDATE rank_guess_games SET state='cancelled' WHERE channel=? AND owner=? AND state='voting' AND (expires<=? OR NOT EXISTS(SELECT 1 FROM demo_reviews r WHERE r.id=rank_guess_games.review_id AND r.status IN ('queued','reviewing','reviewed','declined')))").bind(b.channel,user.userId,now),
   db.prepare("INSERT INTO rank_guess_games(id,channel,owner,review_id,answer,state,created,vote_ends,expires) SELECT ?,?,?,?,?,'voting',?,?,? WHERE NOT EXISTS(SELECT 1 FROM rank_guess_games WHERE channel=? AND state='voting')").bind(b.requestId,b.channel,user.userId,b.reviewId,source.rank,now,now+180000,now+7200000,b.channel),
  ]);
  return result[1].meta.changes?reply({ok:true},201):reply({error:'Сначала открой ответ или отмени текущий раунд.'},409);
 }
 if(!validUuid(b.gameId)||!['reveal','cancel'].includes(String(b.action)))return reply({error:'Неизвестное действие.'},400);
 const result=await db.prepare("UPDATE rank_guess_games SET state=?,revealed_at=? WHERE id=? AND channel=? AND owner=? AND state='voting'").bind(b.action==='reveal'?'revealed':'cancelled',b.action==='reveal'?now:null,b.gameId,b.channel,user.userId).run();
 if(result.meta.changes&&b.action==='reveal')await db.prepare("UPDATE demo_reviews SET status='reviewed',updated=? WHERE purpose='guess' AND status IN ('queued','reviewing') AND id=(SELECT review_id FROM rank_guess_games WHERE id=? AND state='revealed')").bind(now,b.gameId).run();
 return result.meta.changes?reply({ok:true}):reply({error:'Раунд уже завершён. Обнови страницу.'},409);
}catch{return reply({error:'Не удалось сохранить действие. Обнови игру и повтори.'},503);}}
