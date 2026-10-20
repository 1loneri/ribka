import {waitUntil} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {fishingIdentity,PLAYER_CONNECT_URL} from '../../../../lib/fishing/identity';
import {fishingAccessDenied} from '../../../../lib/fishing/access';
import {castFish,fishDb} from '../../../../lib/fishing/storage';
import {channelConnection} from '../../../../lib/twitch-bot/channels';
import {flushBot,finishBotReply} from '../../../../lib/twitch-bot/storage';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};
export async function POST(req:Request){
 try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Запрос отклонён.'},{status:403,headers});
  const user=await getChatGPTUser();if(!user)return Response.json({error:'Войди на сайт, чтобы ловить рыбку.'},{status:401,headers});
  const denied=await fishingAccessDenied(user);if(denied)return denied;
  const raw=await req.text();if(raw.length>512)return Response.json({error:'Некорректный заброс.'},{status:400,headers});
  let body:{channel?:unknown;requestId?:unknown};
  try{body=JSON.parse(raw);}catch{return Response.json({error:'Некорректный заброс.'},{status:400,headers});}
  if(!body||typeof body.channel!=='string'||!(/^[a-z0-9_]{1,25}$/.test(body.channel))||typeof body.requestId!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)))return Response.json({error:'Некорректный заброс.'},{status:400,headers});
  const identity=await fishingIdentity(user);if(!identity)return Response.json({error:'Привяжи Twitch, чтобы сохранять уловы в своём профиле.',connectUrl:PLAYER_CONNECT_URL},{status:409,headers});
  const id='site:'+body.channel+':'+identity.twitchId+':'+body.requestId.toLowerCase();
  const result=await castFish(body.channel,id,identity.username);
  if(result.kind==='cooldown')return Response.json({error:'Следующий заброс через '+Math.ceil((result.retryAt-Date.now())/1000)+' с.',retryAt:result.retryAt,player:result.player},{status:429,headers:{...headers,'Retry-After':String(Math.max(1,Math.ceil((result.retryAt-Date.now())/1000)))}});
  if(result.kind!=='saved')return Response.json({error:'Рыбалка сейчас недоступна. Обнови страницу или дождись запуска организатором.'},{status:409,headers});
  // Only the owning streamer's connection can deliver the generated reply.
  // A Twitch delivery error must not roll back an already saved catch.
  const messageId='fish:'+body.channel+':'+result.entry.id;
  try{
   const queued=await fishDb().prepare("SELECT id FROM twitch_bot_messages WHERE id=? AND status='queued' AND expires>? AND EXISTS (SELECT 1 FROM twitch_bot_settings WHERE channel=? AND owner=? AND enabled=1 AND fish_replies=1)").bind(messageId,Date.now(),body.channel,result.owner).first();
   if(queued){const owner=await channelConnection(result.owner,body.channel);await flushBot(owner,body.channel);waitUntil(finishBotReply(owner,messageId,body.channel).catch(()=>{}));}
  }catch{/* The durable outbox is also processed by the streamer's collector. */}
  return Response.json({entry:result.entry,player:result.player,username:identity.username,replayed:result.replayed},{headers});
 }catch{return Response.json({error:'Не удалось подтвердить заброс. Нажми ещё раз: повторный запрос не добавит второй улов.'},{status:503,headers});}
}
