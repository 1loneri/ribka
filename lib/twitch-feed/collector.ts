import type {ChatGPTUser} from '../../app/chatgpt-auth';
import {waitUntil} from 'cloudflare:workers';
import {canOperateRoom,type BotRoom} from '../twitch-bot/channels';
import {getConnection,getBotConnection,helix} from '../twitch-api';
import {ingestFish,type Game} from '../fishing/storage';
import {hasFishingAccess} from '../fishing/access';
import {appendMessage,feedDb,pruneMessages,removeMessages,updateFeedState} from './storage';
import {applyActivity,capabilities,refreshPanels,subscriptionPlan} from './panels';
import {asText,asTime,chatMessage,type TwitchPacket} from './types';
import {flushBot} from '../twitch-bot/storage';
import {answerBotQuestion} from '../twitch-bot/conversation';
import {answerChatCommand} from '../twitch-bot/commands';
import {BOT_INTERVAL} from '../twitch-bot/messages';
import {ingestLevelMessage,levelStreamEvent,refreshLevelStream} from '../levels/storage';
import {ingestGuessVote} from '../reviews/guess-storage';
import {ingestMysteryGuess} from '../community/mystery';
type Connection=Awaited<ReturnType<typeof getConnection>>;

export async function connectFeed(req:Request,user:ChatGPTUser,initial:Connection,fishWanted:boolean,room?:BotRoom){
 const db=feedDb(),channel=room?.channel??initial.channel,broadcaster=room?.broadcaster??initial.broadcaster,lease=crypto.randomUUID();
 await db.prepare('INSERT OR IGNORE INTO chat_channels (channel,owner,status,state) VALUES (?,?,?,?)').bind(channel,user.userId,'idle','{}').run();
 const claim=await db.prepare('UPDATE chat_channels SET owner=?,collector_token=?,collector_until=?,status=?,error=NULL WHERE channel=? AND (collector_until IS NULL OR collector_until<?)').bind(user.userId,lease,Date.now()+45000,'connecting',channel,Date.now()).run();
 if(!claim.meta.changes)return Response.json({error:'Чат подключён в другой вкладке. Здесь доступна его синхронизированная лента.'},{status:409});
 let connection=initial,controller:ReadableStreamDefaultController<Uint8Array>,closed=false,ready=false,current:WebSocket|undefined;
 let watchdog:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,botTimer:ReturnType<typeof setInterval>|undefined,serial=Promise.resolve(),panelsAt=0,tokenAt=Date.now();
 const sockets=new Set<WebSocket>(),seen=new Set<string>();
 const send=(status:string,body:Record<string,unknown>={})=>{if(!closed)try{controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({status,channel,...body})+'\n\n'));}catch{void stop();}};
 async function stop(status='idle',error:string|null=null){
  if(closed)return;closed=true;clearTimeout(watchdog);clearInterval(heartbeat);clearInterval(botTimer);
  for(const socket of sockets)try{socket.close(1000,'Chat disconnected');}catch{}
  await db.batch([
   db.prepare('UPDATE chat_channels SET collector_token=NULL,collector_until=NULL,status=?,error=? WHERE channel=? AND collector_token=?').bind(status,error,channel,lease),
   db.prepare('UPDATE fishing_games SET collector_token=NULL,collector_until=NULL WHERE channel=? AND collector_token=?').bind(channel,lease),
  ]).catch(()=>{});
  try{controller.close();}catch{}
 }
 const fail=(message:string,reconnect=false)=>{send('error',{message,reconnect,fishReady:false});void stop('error',message);};
 async function fishLease(){
  if(closed||!fishWanted)return {active:false,until:0,ours:false};
  if(!await hasFishingAccess(user)){
   await db.prepare('UPDATE fishing_games SET collector_token=NULL,collector_until=NULL WHERE channel=? AND collector_token=?').bind(channel,lease).run();
   return {active:false,until:0,ours:false};
  }
  const game=await db.prepare('SELECT * FROM fishing_games WHERE channel=? AND owner=? AND enabled=1').bind(channel,user.userId).first<Game>();
  if(!game)return {active:false,until:0,ours:false};
  await db.prepare('UPDATE fishing_games SET collector_token=?,collector_until=? WHERE channel=? AND owner=? AND enabled=1 AND (collector_token=? OR collector_until IS NULL OR collector_until<?) AND EXISTS (SELECT 1 FROM chat_channels WHERE channel=? AND collector_token=? AND collector_until>?)').bind(lease,Date.now()+45000,channel,user.userId,lease,Date.now(),channel,lease,Date.now()).run();
  const latest=await db.prepare('SELECT collector_token,collector_until,enabled FROM fishing_games WHERE channel=? AND owner=?').bind(channel,user.userId).first<Game>();
  return {active:!!latest?.enabled&&!!latest.collector_until&&latest.collector_until>Date.now(),until:latest?.collector_until??0,ours:latest?.collector_token===lease};
 }
 async function subscribe(session:string){
  const plan=subscriptionPlan(connection,broadcaster);
  const create=(subscription:ReturnType<typeof subscriptionPlan>[number])=>helix(connection,'eventsub/subscriptions',{method:'POST',body:JSON.stringify({type:subscription.type,version:'1',condition:subscription.condition,transport:{method:'websocket',session_id:session}})});
  await create(plan[0]);
  const results=await Promise.allSettled(plan.slice(1).map(create)),warnings:string[]=[];
  for(let index=0;index<results.length;index++)if(results[index].status==='rejected'){
   const subscription=plan[index+1];if(subscription.required)throw Error('Не удалось синхронизировать сообщения и модерацию Twitch.');
   const label=subscription.type.includes('prediction')?'Ставки':subscription.type.includes('poll')?'Голосования':subscription.type.includes('redemption')?'Награды':'Режим чата';
   warnings.push(label+': события Twitch пока недоступны.');
  }
  await updateFeedState(channel,lease,{capabilities:capabilities(connection,broadcaster),subscriptionWarnings:[...new Set(warnings)]});
 }
 async function notify(packet:TwitchPacket){
  const event=packet.payload.event,type=packet.metadata.subscription_type??packet.payload.subscription?.type??'';
  if(!event||event.broadcaster_user_id!==broadcaster)return;
  const timestamp=asTime(packet.metadata.message_timestamp);if(timestamp&&timestamp>Date.now()+60000)return;
  const eventId=asText(packet.metadata.message_id,200);if(eventId&&seen.has(eventId))return;
  if(eventId){seen.add(eventId);if(seen.size>2000)seen.delete(seen.values().next().value!);}
  const created=timestamp||Date.now();
  if(type==='channel.chat.message'||type==='channel.chat.notification'){
   const message=chatMessage(event,asText(event.message_id,200)||eventId,created,type==='channel.chat.notification');
   const fresh=await appendMessage(channel,lease,message);
   if(type==='channel.chat.message'&&fresh&&(!event.source_broadcaster_user_id||event.source_broadcaster_user_id===broadcaster)){waitUntil(ingestLevelMessage(connection,channel,lease,message).catch(()=>{}));waitUntil(ingestGuessVote(channel,lease,message).catch(()=>{}));waitUntil(ingestMysteryGuess(channel,lease,message).catch(()=>{}));waitUntil(answerChatCommand(connection,channel,lease,message).catch(()=>{}));}
   if(type==='channel.chat.message'&&fresh&&fishWanted&&(!event.source_broadcaster_user_id||event.source_broadcaster_user_id===broadcaster)){
    waitUntil(answerBotQuestion(connection,channel,lease,message).catch(()=>{}));
    const entry=await ingestFish(channel,lease,message.id,message.login,message.text);
    if(entry){
     await appendMessage(channel,lease,{id:'fish:'+entry.id,kind:'fish',userId:'',login:'ribka',name:'Рыбка',color:'',badges:[],text:'@'+entry.username+' · '+entry.message,fragments:[],created:entry.created});
     send('entry',{entry});
    }
   }
  }else if(type==='channel.chat.message_delete'&&asText(event.message_id,200))await removeMessages(channel,lease,{id:asText(event.message_id,200)});
  else if(type==='channel.chat.clear_user_messages'&&asText(event.target_user_id,100))await removeMessages(channel,lease,{user:asText(event.target_user_id,100)});
  else if(type==='channel.chat.clear')await removeMessages(channel,lease);
  else if(type==='stream.online'||type==='stream.offline')await levelStreamEvent(channel,user.userId,type,event,created).catch(()=>{});
  else await applyActivity(channel,lease,type,event,eventId,created);
  send('update');
 }
 async function connect(url='wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30',reconnect=false){
  const target=new URL(url);if(target.protocol!=='wss:'||target.hostname!=='eventsub.wss.twitch.tv'||(target.port&&target.port!=='443'))throw Error('Некорректное переподключение Twitch.');
  if(closed)return;const socket=new WebSocket(url);sockets.add(socket);
  socket.addEventListener('message',event=>{
   serial=serial.then(async()=>{
    if(closed)return;const packet=JSON.parse(String(event.data)) as TwitchPacket;
    clearTimeout(watchdog);watchdog=setTimeout(()=>fail('Twitch перестал отвечать. Переподключаем чат…'),45000);
    if(packet.metadata.message_type==='session_welcome'){
     if(!packet.payload.session?.id)throw Error();
     if(!reconnect)await subscribe(packet.payload.session.id);
     const previous=current;current=socket;if(previous&&previous!==socket)previous.close(1000,'Reconnected');
     ready=true;const fish=await fishLease();
     await db.prepare("UPDATE chat_channels SET status='ready',error=NULL WHERE channel=? AND collector_token=?").bind(channel,lease).run();
     send('ready',{message:fish.active?'Чат и команды Twitch подключены.':'Чат Twitch подключён.',fishReady:fish.active,collectorUntil:fish.until});
     await refreshLevelStream(connection,channel).catch(()=>{});
     await refreshPanels(channel,lease,connection,broadcaster);panelsAt=Date.now();
    }else if(packet.metadata.message_type==='session_reconnect'){
     send('connecting',{message:'Переподключаем Twitch…'});await connect(packet.payload.session?.reconnect_url??'',true);
    }else if(packet.metadata.message_type==='revocation')fail('Twitch отозвал доступ. Переподключи свой аккаунт.',true);
    else if(packet.metadata.message_type==='notification')await notify(packet);
   }).catch(()=>fail('Не удалось обновить чат Twitch. Переподключаемся…'));
  });
  socket.addEventListener('close',()=>{sockets.delete(socket);if(!closed&&(current===socket||!current&&!reconnect))fail('Связь с Twitch прервалась. Переподключаемся…');});
  socket.addEventListener('error',()=>{if(!closed&&(!current||current===socket))fail('Ошибка подключения Twitch. Переподключаемся…');});
 }
 const stream=new ReadableStream<Uint8Array>({
  start(ctrl){
   controller=ctrl;send('connecting',{message:'Подключаем чат Twitch…',fishReady:false});
   botTimer=setInterval(()=>{if(!closed&&ready)void flushBot(connection,channel).catch(()=>{});},BOT_INTERVAL);
   watchdog=setTimeout(()=>fail('Twitch не ответил. Переподключаем чат…'),15000);
   heartbeat=setInterval(()=>{serial=serial.then(async()=>{
    if(closed)return;
    if(!await canOperateRoom(user,channel)){fail('Доступ к каналу отозван.',true);return;}
    const leaseResult=await db.prepare('UPDATE chat_channels SET collector_until=? WHERE channel=? AND owner=? AND collector_token=?').bind(Date.now()+45000,channel,user.userId,lease).run();
    if(!leaseResult.meta.changes){send('closed');await stop();return;}
    if(Date.now()-tokenAt>300000){connection=await (room?getBotConnection(user.userId):getConnection(user.userId));tokenAt=Date.now();if(connection.broadcaster!==initial.broadcaster||!connection.permissions.includes('user:read:chat')){fail('Переподключи Twitch с доступом к чату.',true);return;}}
    const fish=await fishLease();send(ready?'heartbeat':'connecting',{fishReady:ready&&fish.active,collectorUntil:fish.until});
    if(ready)waitUntil(refreshLevelStream(connection,channel).catch(()=>{}));
    if(ready&&Date.now()-panelsAt>=15000){await refreshPanels(channel,lease,connection,broadcaster);panelsAt=Date.now();await pruneMessages(channel,lease);}
   }).catch(()=>fail('Не удалось поддержать подключение Twitch.'));},15000);
   req.signal.addEventListener('abort',()=>void stop(),{once:true});
   if(req.signal.aborted)void stop();else void connect().catch(()=>fail('Не удалось подключить Twitch.'));
  },cancel(){return stop();},
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
}
