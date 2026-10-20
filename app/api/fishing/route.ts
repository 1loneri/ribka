import {getChatGPTUser} from '../../chatgpt-auth';
import {getRole} from '../../../lib/streamer-auth';
import {fishDb,eventFor,interval,readPlayer,cleanUsername,type Game} from '../../../lib/fishing/storage';
import {fishingIdentity} from '../../../lib/fishing/identity';
import {fishingAccessDenied} from '../../../lib/fishing/access';
import {canOperateRoom,channelConnection} from '../../../lib/twitch-bot/channels';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const u=await getChatGPTUser(),denied=await fishingAccessDenied(u);if(denied)return denied;
 const db=fishDb(),role=await getRole(u),url=new URL(req.url);const games=await db.prepare('SELECT channel,host,enabled,collector_until FROM fishing_games ORDER BY host').all();
 const requested=cleanUsername(url.searchParams.get('channel')??role.streamer?.channel??'');const g=requested?await db.prepare('SELECT * FROM fishing_games WHERE channel=?').bind(requested).first<Game>():null;
 const me=await fishingIdentity(u),username=cleanUsername(url.searchParams.get('user')??'')||me?.username||'';const event=g&&(g.enabled||(['seagulls','thieves','abductors'].includes(g.event_id??'')&&g.active_until>Date.now()))?await eventFor(g):null;
 const log=g?await db.prepare('SELECT id,username,message,item_id,chance,created FROM fishing_log WHERE channel=? AND item_id IS NOT NULL ORDER BY created DESC LIMIT 30').bind(g.channel).all():{results:[]};
 const top=g?await db.prepare('SELECT username,coins,catches,streak FROM fishing_players WHERE channel=? ORDER BY coins DESC,username LIMIT 10').bind(g.channel).all():{results:[]};
 const player=username&&g?await readPlayer(g.channel,username):null,myPlayer=me&&g?username===me.username?player:await readPlayer(g.channel,me.username):null;
 const managed=u&&role.streamer?await db.prepare('SELECT channel FROM fishing_games WHERE owner=? ORDER BY channel').bind(u.userId).all<{channel:string}>():{results:[]};
 const loss=me&&g?await db.prepare('SELECT SUM(CASE WHEN l.item IS NULL THEN l.amount ELSE 0 END) AS amount,MAX(CASE WHEN l.item=\'cat\' THEN 1 ELSE 0 END) AS catStolen,r.event,r.created FROM fishing_hazard_losses l JOIN fishing_hazards r ON r.id=l.run WHERE l.channel=? AND l.username=? AND r.created>? GROUP BY r.id ORDER BY r.created DESC LIMIT 1').bind(g.channel,me.username,Date.now()-600000).first():null;
 return Response.json({canLaunchEvent:role.admin,hazardLoss:loss,channels:games.results,managedChannels:managed.results.map(x=>x.channel),game:g?{channel:g.channel,host:g.host,enabled:g.enabled,collecting:!!g.collector_until&&g.collector_until>Date.now(),collectorUntil:g.collector_until??0,activeUntil:g.active_until,nextEvent:g.next_event}:null,event,log:log.results,top:top.results,player,myPlayer,me,username,canManage:!!u&&!!g&&g.owner===u.userId&&await canOperateRoom(u,g.channel),streamer:role.streamer,user:u?{name:u.displayName,id:u.userId}:null},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'Не удалось загрузить рыбалку. Попробуй ещё раз.'},{status:503});}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Запрос отклонён.'},{status:403});
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Войди, чтобы управлять рыбалкой.'},{status:401});const denied=await fishingAccessDenied(u);if(denied)return denied;const role=await getRole(u);if(!role.streamer)return Response.json({error:'Управлять рыбалкой могут только стримеры.'},{status:403});
 const b=await req.json() as {action:string;channel?:string};if(!['enable','disable'].includes(b.action))return Response.json({error:'Неизвестное действие.'},{status:400});
 const channel=b.channel??role.streamer.channel;if(typeof channel!=='string'||!await canOperateRoom(u,channel))return Response.json({error:'Нет доступа к выбранной рыбалке.'},{status:403});
 if(b.action==='enable'){const c=await channelConnection(u.userId,channel);if(!c.permissions.includes('user:read:chat'))return Response.json({error:'Подключи аккаунт бота с доступом к чату.'},{status:403});}
 const db=fishDb();await db.prepare('INSERT OR IGNORE INTO fishing_games (channel,owner,host,enabled,next_event) VALUES (?,?,?,1,?)').bind(channel,u.userId,role.streamer.name,Date.now()+interval()).run();
 const r=await db.prepare('UPDATE fishing_games SET enabled=? WHERE channel=? AND owner=?').bind(b.action==='enable'?1:0,channel,u.userId).run();if(!r.meta.changes)return Response.json({error:'Этот канал принадлежит другому организатору.'},{status:403});return Response.json({ok:true,channel});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось изменить рыбалку.'},{status:503});}}
