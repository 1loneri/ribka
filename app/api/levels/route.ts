import {getChatGPTUser} from '../../chatgpt-auth';
import {getRole} from '../../../lib/streamer-auth';
import {fishingIdentity} from '../../../lib/fishing/identity';
import {canOperateRoom,storedChannelConnection} from '../../../lib/twitch-bot/channels';
import {levelSnapshot,levelsDb,readLevelChannel} from '../../../lib/levels/storage';
import {appearanceFor,LEVEL_RULES} from '../../../lib/levels/rules';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const user=await getChatGPTUser(),role=await getRole(user),db=levelsDb();
 const [registered,friends,identity]=await Promise.all([
  db.prepare('SELECT channel,name FROM streamers ORDER BY name').all<{channel:string;name:string}>(),
  db.prepare('SELECT channel,owner FROM twitch_bot_channels ORDER BY channel').all<{channel:string;owner:string}>(),
  fishingIdentity(user),
 ]);
 const channels=[...new Map([...registered.results,...friends.results.map(x=>({channel:x.channel,name:x.channel}))].map(x=>[x.channel,x])).values()];
 const managed=role.streamer&&user?[role.streamer.channel,...friends.results.filter(x=>x.owner===user.userId).map(x=>x.channel)]:[];
 const requested=new URL(req.url).searchParams.get('channel'),channel=requested??managed[0]??channels[0]?.channel??'';
 if(channel&&!channels.some(x=>x.channel===channel))return reply({error:'Канал не добавлен на сайт.'},404);
 const canManage=!!user&&managed.includes(channel)&&await canOperateRoom(user,channel),state=channel?await readLevelChannel(channel):null;
 const connection=canManage?await storedChannelConnection(user!.userId,channel):null;
 let scopes:string[]=[];try{scopes=JSON.parse(connection?.scopes??'[]');}catch{}
 const snapshot=channel?await levelSnapshot(channel,identity?.twitchId):null;
 return reply({user:user?{name:user.displayName??user.email}:null,admin:role.admin,canStream:!!role.streamer,channels,managed,channel,canManage,configured:!!connection&&scopes.includes('user:read:chat'),identity:identity?{username:identity.username}:null,snapshot,rules:LEVEL_RULES,error:canManage?state?.error??null:null});
}catch{return reply({error:'Не удалось загрузить уровни. Попробуй ещё раз.'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Требуется вход.'},401);
 const raw=await req.text();if(raw.length>2048)return reply({error:'Слишком большой запрос.'},413);
 let body:unknown;try{body=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Некорректный запрос.'},400);
 const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['channel','enabled','appearance'].includes(k))||typeof b.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(b.channel)||typeof b.enabled!=='boolean')return reply({error:'Проверь настройки.'},400);
 if(!await canOperateRoom(user,b.channel))return reply({error:'Настройки доступны организатору канала.'},403);
 const a=b.appearance;if(!a||typeof a!=='object'||Array.isArray(a))return reply({error:'Проверь оформление оверлея.'},400);
 const appearance=appearanceFor(a),input=a as Record<string,unknown>;
 if(Object.keys(input).some(k=>!Object.keys(appearance).includes(k))||Object.keys(appearance).some(k=>!(k==='fontFamily'&&!Object.hasOwn(input,k))&&input[k]!==appearance[k as keyof typeof appearance]))return reply({error:'Проверь параметры оверлея.'},400);
 if(b.enabled){
  const c=await storedChannelConnection(user.userId,b.channel);let scopes:string[]=[];try{scopes=JSON.parse(c?.scopes??'[]');}catch{}
  if(!c||!scopes.includes('user:read:chat'))return reply({error:'Подключи Twitch с доступом к чтению чата.',reconnect:true},409);
 }
 const saved=await levelsDb().prepare(`INSERT INTO level_channels (channel,owner,enabled,appearance) VALUES (?,?,?,?) ON CONFLICT(channel) DO UPDATE SET enabled=excluded.enabled,appearance=excluded.appearance,checked_at=CASE WHEN level_channels.enabled=0 AND excluded.enabled=1 THEN 0 ELSE level_channels.checked_at END,stream_live=CASE WHEN excluded.enabled=0 THEN 0 ELSE level_channels.stream_live END,error=NULL WHERE level_channels.owner=excluded.owner`).bind(b.channel,user.userId,Number(b.enabled),JSON.stringify(appearance)).run();
 if(!saved.meta.changes)return reply({error:'Этот канал настроен другим организатором.'},403);
 return reply({ok:true});
}catch{return reply({error:'Не удалось сохранить настройки.'},503);}}
