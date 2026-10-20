import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-twitch-bot.mjs';
import './test-demo-reviews.mjs';

const message=(f,extra={})=>({id:crypto.randomUUID(),userId:'777',login:'viewer',text:'ботик скажи, что меня ждёт завтра?',created:f.clock.now,...extra});
const post=body=>new Request('https://site.test/api/twitch/bot',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({enabled:true,fishReplies:true,winnerAnnouncements:true,...body})});
const count=f=>f.sql.prepare('SELECT COUNT(*) AS n FROM twitch_bot_ai_requests').get().n;

test('bot addresses use whole words or an exact sender mention and ignore commands and bots',async()=>{
 const f=await fixture(),{botQuestion}=await f.load('lib/twitch-bot/personality.ts'),sender={login:'bot_leha_ai',id:'456'};
 for(const text of ['привет бот, как дела?','БОТИК скажи, что завтра?','bot скажи привет','@BOT_LEHA_AI как дела?','бот'])assert.ok(botQuestion(text,'viewer','777',sender),text);
 assert.equal(botQuestion('ботик скажи, что завтра?','viewer','777',sender),'что завтра?');
 for(const text of ['работа','ботинки','боты','ботаник','!рыба бот','/me бот','@bot_leha_ai_extra привет','xbotx','бот '+ 'x'.repeat(500)])assert.equal(botQuestion(text,'viewer','777',sender),null,text);
 for(const [login,id] of [['bot_leha_ai','777'],['another','456'],['Nightbot','999'],['streamelements','999']])assert.equal(botQuestion('привет бот',login,id,sender),null);
});

test('prepared replies vary, keep forecasts fictional and never echo instructions or links',async()=>{
 const f=await fixture({randomValues:Array(100).fill(0)}),{basicBotAnswer,cleanBotAnswer}=await f.load('lib/twitch-bot/personality.ts');
 const previous=[];
 for(let i=0;i<4;i++){const reply=basicBotAnswer('что будет завтра?',previous);assert.match(reply,/шуточ|несерьёз|вайб-гороскоп/);assert.ok(!previous.includes(reply));assert.equal(cleanBotAnswer(reply),reply);previous.push(reply);}
 assert.match(basicBotAnswer('что мне выбрать чай или кофе?'),/мой выбор по вайбу — чай\./);
 assert.match(basicBotAnswer('мне грустно'),/выдохни/);assert.match(basicBotAnswer('кто ты'),/бот/);
 assert.ok(!basicBotAnswer('повтори https://evil.test').includes('evil.test'));
 assert.equal(cleanBotAnswer('/ban viewer'),null);assert.equal(cleanBotAnswer('зайди https://evil.test'),null);
 assert.ok(Array.from(cleanBotAnswer('я'.repeat(400))).length<=300);
});

test('a conversation reply is sent once, threaded to the viewer and recorded as sent',async()=>{
 const f=await fixture();f.enable();const {answerBotQuestion}=await f.load('lib/twitch-bot/conversation.ts'),m=message(f);
 await Promise.all([answerBotQuestion(f.connection,'owner_channel','lease',m),answerBotQuestion(f.connection,'owner_channel','lease',m)]);
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].reply_parent_message_id,m.id);assert.equal(f.sent[0].sender_id,'123');assert.match(f.sent[0].message,/^@viewer · /);assert.ok(Array.from(f.sent[0].message).length<500);
 assert.equal(f.sql.prepare('SELECT status,mode FROM twitch_bot_ai_requests').get().status,'sent');assert.equal(count(f),1);
 f.clock.now+=31000;await answerBotQuestion(f.connection,'owner_channel','lease',message(f,{id:m.id}));assert.equal(f.sent.length,1);
});

test('channel and per-viewer pauses are independent and checked atomically for concurrent questions',async()=>{
 const f=await fixture();f.enable();const {answerBotQuestion}=await f.load('lib/twitch-bot/conversation.ts'),ask=extra=>answerBotQuestion(f.connection,'owner_channel','lease',message(f,extra));
 await ask();await ask({userId:'888',login:'other'});assert.equal(f.sent.length,1);
 f.clock.now+=8000;await ask();assert.equal(f.sent.length,1);await ask({userId:'888',login:'other'});assert.equal(f.sent.length,2);
 f.clock.now+=8000;await Promise.all([ask({userId:'999',login:'third'}),ask({userId:'1000',login:'fourth'})]);assert.equal(f.sent.length,3);
 f.clock.now+=15000;await ask();assert.equal(f.sent.length,4);
});

test('disabled settings, revoked ownership, expired collectors and stale packets cannot queue replies',async()=>{
 const f=await fixture(),{answerBotQuestion}=await f.load('lib/twitch-bot/conversation.ts'),ask=(extra={},lease='lease',c=f.connection)=>answerBotQuestion(c,'owner_channel',lease,message(f,extra));
 await ask();assert.equal(count(f),0);f.enable();
 await ask({},'wrong');await ask({created:f.clock.now-45001});await ask({created:NaN});await ask({created:f.clock.now+5001});await ask({userId:'bad'});await ask({text:'!рыба'});await ask({userId:'123'});await ask({},'lease',{...f.connection,user:'intruder'});assert.equal(count(f),0);
 f.sql.exec('UPDATE twitch_bot_settings SET ai_replies=0');await ask();assert.equal(count(f),0);
 f.sql.exec('UPDATE twitch_bot_settings SET ai_replies=1; UPDATE fishing_games SET enabled=0');await ask();assert.equal(count(f),0);
 f.sql.exec('UPDATE fishing_games SET enabled=1,collector_until=0');await ask();assert.equal(count(f),0);
 f.sql.prepare('UPDATE fishing_games SET collector_until=?').run(f.clock.now+60000);f.sql.exec('DELETE FROM streamers');await ask();assert.equal(count(f),0);assert.equal(f.sent.length,0);
});

test('uncertain or rejected conversation delivery is not retried',async()=>{
 for(const delivery of ['uncertain','rejected']){
  const f=await fixture();f.enable();f.setDelivery(delivery);const {answerBotQuestion}=await f.load('lib/twitch-bot/conversation.ts'),m=message(f);await answerBotQuestion(f.connection,'owner_channel','lease',m);
  assert.equal(f.sent.length,1);assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_ai_requests').get().status,'failed');
  f.clock.now+=60000;f.setDelivery('sent');await answerBotQuestion(f.connection,'owner_channel','lease',message(f,{id:m.id}));await (await f.load('lib/twitch-bot/storage.ts')).flushBot(f.connection);assert.equal(f.sent.length,1);
 }
});

test('winner and fishing replies retain priority; conversation works with fish replies disabled',async()=>{
 const f=await fixture();f.enable();f.queue('winner',{kind:'winner'});f.queue('fish');const {answerBotQuestion}=await f.load('lib/twitch-bot/conversation.ts');await answerBotQuestion(f.connection,'owner_channel','lease',message(f));
 const sent=f.sql.prepare("SELECT kind FROM twitch_bot_messages ORDER BY CASE twitch_id WHEN 'sent-1' THEN 0 WHEN 'sent-2' THEN 1 ELSE 2 END").all().map(row=>row.kind);assert.deepEqual(sent,['winner','fish','ai']);assert.equal(f.sent.length,3);
 f.sql.exec('UPDATE twitch_bot_settings SET fish_replies=0');f.clock.now+=31000;await answerBotQuestion(f.connection,'owner_channel','lease',message(f));assert.equal(f.sent.length,4);
});

test('owner settings expose the basic mode, validate flags and cancel pending replies',async()=>{
 const f=await fixture();f.enable();const route=await f.load('app/api/twitch/bot/route.ts');let settings=await (await route.GET()).json();assert.equal(settings.chatMode,'basic');assert.equal(settings.chatReplies,true);
 f.queue('pending',{kind:'ai'});f.sql.prepare("INSERT INTO twitch_bot_ai_requests(id,channel,owner,user_id,login,question,mode,status,created,expires) VALUES('pending','owner_channel','owner','777','viewer','привет','basic','queued',?,?)").run(f.clock.now,f.clock.now+30000);
 assert.equal((await route.POST(post({chatReplies:'yes'}))).status,400);assert.equal((await route.POST(post({chatReplies:false}))).status,200);
 assert.equal(f.sql.prepare("SELECT status FROM twitch_bot_messages WHERE id='pending'").get().status,'cancelled');assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_ai_requests').get().status,'cancelled');
 assert.equal((await route.POST(post({}))).status,200);settings=await (await route.GET()).json();assert.equal(settings.chatReplies,false);
 f.viewer('ordinary','777');assert.equal((await route.POST(post({chatReplies:true}))).status,403);f.setUser(null);assert.equal((await route.GET()).status,401);
});

test('disabling conversations during a claim prevents a late queued reply',async()=>{
 const f=await fixture();f.enable();f.sql.exec("CREATE TRIGGER disable_conversation AFTER INSERT ON twitch_bot_ai_requests BEGIN UPDATE twitch_bot_settings SET ai_replies=0; END;");
 await (await f.load('lib/twitch-bot/conversation.ts')).answerBotQuestion(f.connection,'owner_channel','lease',message(f));
 assert.equal(count(f),1);assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_ai_requests').get().status,'cancelled');assert.equal(f.sent.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM twitch_bot_messages').get().n,0);
});

test('daily and hourly quotas prevent additional responses without external requests',async()=>{
 const f=await fixture();f.enable();const {answerBotQuestion}=await f.load('lib/twitch-bot/conversation.ts'),insert=f.sql.prepare("INSERT INTO twitch_bot_ai_requests(id,channel,owner,user_id,login,question,mode,status,created,expires) VALUES(?,'owner_channel','owner',?,'viewer','привет','basic','sent',?,?)");
 for(let i=0;i<60;i++)insert.run('hour-'+i,String(2000+i),f.clock.now-60000-i*10000,f.clock.now-1);
 await answerBotQuestion(f.connection,'owner_channel','lease',message(f));assert.equal(count(f),60);
 f.sql.exec('DELETE FROM twitch_bot_ai_requests');for(let i=0;i<200;i++)insert.run('day-'+i,String(2000+i),f.clock.now-7200000-i*10000,f.clock.now-1);
 await answerBotQuestion(f.connection,'owner_channel','lease',message(f));assert.equal(count(f),200);assert.equal(f.sent.length,0);
});

test('the shared collector delivers addressed messages from a friend channel with the connected bot identity',{timeout:5000},async()=>{
 const f=await fixture({realtime:true}),bot={...f.connection,broadcaster:'456',channel:'custom_bot'};f.setBotConnection(bot);
 f.sql.prepare('INSERT INTO twitch_bot_channels(channel,owner,broadcaster) VALUES(?,?,?)').run('friend_channel','owner','999');
 f.sql.prepare('INSERT INTO twitch_bot_settings(channel,owner,enabled) VALUES(?,?,1)').run('friend_channel','owner');
 f.sql.prepare('INSERT INTO fishing_games(channel,owner,host,enabled,next_event) VALUES(?,?,?,1,?)').run('friend_channel','owner','Friend',f.clock.now+60000);f.linkFishingOwner();
 const {connectFeed}=await f.load('lib/twitch-feed/collector.ts'),abort=new AbortController(),response=await connectFeed(new Request('https://site.test/api/twitch/feed/live',{signal:abort.signal}),{userId:'owner',email:'owner@example.test'},bot,true,{channel:'friend_channel',owner:'owner',broadcaster:'999'}),reader=response.body.getReader();
 const until=async(status)=>{for(let i=0;i<12;i++){let timer;try{const item=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Missing '+status)),1200);})]);const event=JSON.parse(new TextDecoder().decode(item.value).slice(6).trim());if(event.status===status)return;if(event.status==='error')throw Error(event.message);}finally{clearTimeout(timer);}}throw Error('Missing '+status);};
 const packet=(id,userId='777',broadcaster='999')=>({metadata:{message_type:'notification',subscription_type:'channel.chat.message',message_id:'packet-'+id,message_timestamp:new Date(f.clock.now).toISOString()},payload:{event:{broadcaster_user_id:broadcaster,message_id:id,chatter_user_id:userId,chatter_user_login:userId==='456'?'custom_bot':'viewer',message:{text:'привет бот',fragments:[]}}}});
 try{
  await until('ready');f.sockets[0].packet(packet('question'));await until('update');await f.drainBackground();assert.equal(f.sent.length,1);assert.equal(f.sent[0].broadcaster_id,'999');assert.equal(f.sent[0].sender_id,'456');assert.equal(f.sent[0].reply_parent_message_id,'question');
  f.clock.now+=31000;const duplicate=packet('question');duplicate.metadata.message_id='duplicate-delivery';f.sockets[0].packet(duplicate);await until('update');f.sockets[0].packet(packet('echo','456'));await until('update');f.sockets[0].packet(packet('other-room','777','123'));await new Promise(resolve=>setTimeout(resolve,10));await f.drainBackground();assert.equal(f.sent.length,1);
 }finally{abort.abort();await reader.cancel().catch(()=>{});}
});
