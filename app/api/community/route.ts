import {getChatGPTUser} from '../../chatgpt-auth';
import {fishingIdentity} from '../../../lib/fishing/identity';
import {canOperateRoom} from '../../../lib/twitch-bot/channels';
import {communityContext,communityConnect} from '../../../lib/community/access';
import {ROOM_SLOTS,normalizeGuess,type RoomSlot} from '../../../lib/community/model';
import {roomSnapshot,startRoomPoll,roomVote,finishRoomPoll} from '../../../lib/community/room';
import {mysterySnapshot,startMystery,mysteryGuess,finishMystery} from '../../../lib/community/mystery';
import {validUuid} from '../../../lib/reviews/model';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const c=await communityContext(req),[room,mystery]=c.channel?await Promise.all([roomSnapshot(c.channel,c.identity?.twitchId),mysterySnapshot(c.channel,c.identity?.twitchId)]):[null,null];
 return reply({user:c.user?{name:c.user.displayName}:null,admin:c.role.admin,canStream:!!c.role.streamer,channel:c.channel,channels:c.channels,canManage:c.canManage,configured:c.configured,me:c.identity?{name:c.identity.username}:null,connectUrl:communityConnect(c.channel),room,mystery,now:Date.now()});
}catch{return reply({error:'Не удалось открыть сообщество. Попробуй ещё раз.'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди и подключи Twitch.',connectUrl:communityConnect()},401);
 const raw=await req.text();if(raw.length>2048)return reply({error:'Слишком большой запрос.'},413);
 let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{return reply({error:'Проверь действие.'},400);}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['channel','action','requestId','pollId','roundId','slot','choice','guess'].includes(k))||typeof b.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(b.channel))return reply({error:'Проверь параметры.'},400);
 const channel=b.channel;
 if(b.action==='room.vote'||b.action==='viewer.guess'){
  const identity=await fishingIdentity(user);if(!identity)return reply({error:'Подключи Twitch для участия.',connectUrl:communityConnect(channel)},409);
  const ok=b.action==='room.vote'?validUuid(b.pollId)&&typeof b.choice==='string'&&await roomVote(channel,b.pollId!,identity.twitchId,identity.username,b.choice):validUuid(b.roundId)&&!!normalizeGuess(b.guess)&&await mysteryGuess(channel,b.roundId!,identity.twitchId,identity.username,b.guess);
  return ok?reply({ok:true}):reply({error:b.action==='room.vote'?'Голосование уже закрыто.':'Ответ не принят: раунд закрыт, это твой раунд или закончились три попытки.'},409);
 }
 if(!await canOperateRoom(user,channel))return reply({error:'Управление доступно организатору канала.'},403);
 if(b.action==='room.start'){
  if(!validUuid(b.requestId)||typeof b.slot!=='string'||!Object.hasOwn(ROOM_SLOTS,b.slot))return reply({error:'Выбери, что меняем в комнате.'},400);
  return await startRoomPoll(channel,user.userId,b.requestId!,b.slot as RoomSlot,user.email)?reply({ok:true},201):reply({error:'Голосование уже идёт.'},409);
 }
 if(b.action==='room.finish')return validUuid(b.pollId)&&await finishRoomPoll(channel,user.userId,b.pollId!,user.email)?reply({ok:true}):reply({error:'Голосование уже закончено.'},409);
 if(b.action==='viewer.start'){
  if(!validUuid(b.requestId))return reply({error:'Обнови форму.'},400);
  try{await startMystery(channel,user.userId,b.requestId!,user.email);return reply({ok:true},201);}catch(e){return reply({error:e instanceof Error?e.message:'Не удалось начать раунд.'},409);}
 }
 if(['viewer.reveal','viewer.cancel'].includes(String(b.action)))return validUuid(b.roundId)&&await finishMystery(channel,user.userId,b.roundId!,b.action==='viewer.reveal',user.email)?reply({ok:true}):reply({error:'Раунд уже завершён.'},409);
 return reply({error:'Неизвестное действие.'},400);
}catch{return reply({error:'Не удалось сохранить действие. Попробуй ещё раз.'},503);}}
