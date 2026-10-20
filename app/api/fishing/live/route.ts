import {getChatGPTUser} from '../../../chatgpt-auth';
import {waitUntil} from 'cloudflare:workers';
import {answerBotQuestion} from '../../../../lib/twitch-bot/conversation';
import {getRole} from '../../../../lib/streamer-auth';
import {fishingAccessDenied,hasFishingAccess} from '../../../../lib/fishing/access';
import {getConnection,helix} from '../../../../lib/twitch-api';
import {fishDb,ingestFish,type Game} from '../../../../lib/fishing/storage';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Запрос отклонён.'},{status:403});
 const u=await getChatGPTUser();if(!u)return Response.json({error:'Требуется вход.'},{status:401});const denied=await fishingAccessDenied(u);if(denied)return denied;const role=await getRole(u);if(!role.streamer)return Response.json({error:'Требуется доступ стримера.'},{status:403});
 const c=await getConnection(u.userId),db=fishDb();if(c.channel!==role.streamer.channel||!c.permissions.includes('user:read:chat'))return Response.json({error:'Подключи свой Twitch с разрешением на чтение чата.'},{status:403});
 const g=await db.prepare('SELECT * FROM fishing_games WHERE channel=? AND owner=? AND enabled=1').bind(c.channel,u.userId).first<Game>();if(!g)return Response.json({error:'Сначала включи рыбалку.'},{status:409});
 const lease=crypto.randomUUID(),claim=await db.prepare('UPDATE fishing_games SET collector_token=?,collector_until=? WHERE channel=? AND enabled=1 AND (collector_until IS NULL OR collector_until<?)').bind(lease,Date.now()+45000,g.channel,Date.now()).run();if(!claim.meta.changes)return Response.json({error:'Рыбалка уже подключена в другой вкладке. Подожди до 45 секунд после её закрытия.'},{status:409});
 let controller:ReadableStreamDefaultController<Uint8Array>,closed=false,ready=false,current:WebSocket|undefined,watchdog:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,serial=Promise.resolve();const sockets=new Set<WebSocket>();
 const send=(status:string,message?:string,entry?:unknown)=>{if(!closed)try{controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({status,message,entry})+'\n\n'));}catch{void stop();}};
 async function stop(){if(closed)return;closed=true;clearTimeout(watchdog);clearInterval(heartbeat);for(const socket of sockets)try{socket.close(1000,'Fishing disconnected');}catch{}await db.prepare('UPDATE fishing_games SET collector_token=NULL,collector_until=NULL WHERE channel=? AND collector_token=?').bind(g!.channel,lease).run().catch(()=>{});try{controller.close();}catch{}}
 const fail=(message:string)=>{send('error',message);void stop();};
 async function connect(url='wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30',reconnect=false){
  const target=new URL(url);if(target.protocol!=='wss:'||target.hostname!=='eventsub.wss.twitch.tv'||(target.port&&target.port!=='443'))throw Error('Некорректное переподключение Twitch.');const socket=new WebSocket(url);sockets.add(socket);
  socket.addEventListener('message',ev=>{serial=serial.then(async()=>{if(closed)return;const p=JSON.parse(String(ev.data)) as {metadata:{message_id:string;message_type:string;subscription_type?:string;message_timestamp?:string};payload:{session?:{id:string;reconnect_url:string};event?:{broadcaster_user_id:string;source_broadcaster_user_id?:string;chatter_user_id:string;chatter_user_login:string;message_id:string;message:{text:string}}}};clearTimeout(watchdog);watchdog=setTimeout(()=>fail('Twitch перестал отвечать. Подключись ещё раз.'),45000);
   if(p.metadata.message_type==='session_welcome'){
    if(!reconnect)await helix(c,'eventsub/subscriptions',{method:'POST',body:JSON.stringify({type:'channel.chat.message',version:'1',condition:{broadcaster_user_id:c.broadcaster,user_id:c.broadcaster},transport:{method:'websocket',session_id:p.payload.session!.id}})});
    const previous=current;current=socket;if(previous&&previous!==socket)previous.close(1000,'Reconnected');ready=true;send('ready','Команды Twitch подключены.');
   }else if(p.metadata.message_type==='session_reconnect'){send('connecting','Переподключаем Twitch…');await connect(p.payload.session!.reconnect_url,true);
   }else if(p.metadata.message_type==='revocation'){fail('Twitch отозвал разрешение. Подключи канал заново.');
   }else if(p.metadata.message_type==='notification'&&p.metadata.subscription_type==='channel.chat.message'&&p.payload.event?.broadcaster_user_id===c.broadcaster){
    const e=p.payload.event;
    if(!e.source_broadcaster_user_id||e.source_broadcaster_user_id===c.broadcaster)waitUntil(answerBotQuestion(c,g!.channel,lease,{id:e.message_id||p.metadata.message_id,userId:e.chatter_user_id,login:e.chatter_user_login,text:e.message.text,created:p.metadata.message_timestamp?Date.parse(p.metadata.message_timestamp):Date.now()}).catch(()=>{}));
    const result=await ingestFish(g!.channel,lease,e.message_id||p.metadata.message_id,e.chatter_user_login,e.message.text);if(result)send('entry',undefined,result);
   }
  }).catch(()=>fail('Не удалось обработать Twitch-команду. Подключись ещё раз.'));});
  socket.addEventListener('close',()=>{sockets.delete(socket);if(!closed&&(current===socket||!current&&!reconnect))fail('Twitch отключён. Подключись ещё раз.');});socket.addEventListener('error',()=>{if(!closed&&(!current||current===socket))fail('Ошибка подключения Twitch.');});
 }
 const stream=new ReadableStream<Uint8Array>({start(ctrl){controller=ctrl;send('connecting','Подключаем Twitch…');watchdog=setTimeout(()=>fail('Twitch не ответил. Попробуй ещё раз.'),15000);heartbeat=setInterval(()=>{void(async()=>{if(closed)return;if(!await hasFishingAccess(u)||!(await getRole(u)).streamer){fail('Доступ к рыбалке отозван.');return;}const r=await db.prepare('UPDATE fishing_games SET collector_until=? WHERE channel=? AND owner=? AND collector_token=? AND enabled=1').bind(Date.now()+45000,g!.channel,u.userId,lease).run();if(!r.meta.changes){send('closed','Рыбалка выключена.');await stop();return;}send(ready?'heartbeat':'connecting');})().catch(()=>fail('Не удалось поддержать подключение.'));},15000);req.signal.addEventListener('abort',()=>void stop(),{once:true});void connect().catch(()=>fail('Не удалось подключить Twitch.'));},cancel(){return stop();}});
 return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Accel-Buffering':'no'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось подключить рыбалку.'},{status:503});}}
