import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-twitch-bot.mjs';
const viewerMessage=(f,{id=crypto.randomUUID(),userId='777',login='viewer',text='!вирт',...rest}={})=>({id,kind:'message',userId,login,name:login,color:'',badges:[],text,fragments:[{type:'text',text}],created:f.clock.now,...rest});
async function setup(options={}){
 const f=await fixture(options);f.enable();f.sql.prepare("INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,state) VALUES('owner_channel','owner','chat-lease',?,'ready','{}')").run(f.clock.now+3600000);
 const feed=await f.load('lib/twitch-feed/storage.ts'),commands=await f.load('lib/twitch-bot/commands.ts');
 const add=async(extra={},channel='owner_channel',lease='chat-lease')=>{const m=viewerMessage(f,extra);await feed.appendMessage(channel,lease,m);return m;};
 const run=async(extra={})=>{const m=await add(extra);await commands.answerChatCommand(f.connection,'owner_channel','chat-lease',m);return m;};
 return {...f,feed,commands,add,run};
}
test('virt chooses each real chatter once and excludes the author, bots, other channels and removed messages',async()=>{
 const f=await setup({randomValues:[1]});
 await f.add({userId:'200',login:'alice',text:'привет'});for(let i=0;i<8;i++)await f.add({userId:'300',login:'bob',text:'ещё сообщение'});
 for(const [userId,login,extra] of [['800','nightbot',{}],['123','owner_channel',{}],['900','foreign',{source:'another_channel'}],['901','notification',{kind:'notice'}],['902','old',{created:f.clock.now-3*3600000}]])await f.add({userId,login,text:'привет',...extra});
 const deleted=await f.add({userId:'903',login:'deleted',text:'привет'});await f.feed.removeMessages('owner_channel','chat-lease',{id:deleted.id});
 const m=await f.run({text:'  !ВИРТ  '});assert.equal(f.sent.length,1);assert.equal(f.sent[0].message,'@viewer секретненько виртит с @bob');assert.equal(f.sent[0].reply_parent_message_id,m.id);assert.equal(f.aiRequests.length,0);
});
test('virt can use earlier participants from the current stream and works for the broadcaster too',async()=>{
 const f=await setup();f.sql.prepare("INSERT INTO level_channels(channel,owner,enabled,stream_id,stream_started,stream_live,checked_at) VALUES('owner_channel','owner',1,'today',?,1,?)").run(f.clock.now-3600000,f.clock.now);
 for(const [userId,login,stream] of [['200','earlier','today'],['300','yesterday','previous']]){f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('owner_channel',?,?,?,3,3)").run(userId,login,login);f.sql.prepare("INSERT INTO level_sessions(channel,stream_id,user_id,messages,earned) VALUES('owner_channel',?,?,3,3)").run(stream,userId);}
 await f.run({userId:'123',login:'owner_channel'});assert.equal(f.sent[0].message,'@owner_channel секретненько виртит с @earlier');
});
test('sex command accepts exactly ten of one hundred unbiased outcomes and preserves the emote text',async()=>{
 const f=await setup({randomValues:Array.from({length:100},(_,i)=>i)});await f.add({userId:'200',login:'alice',text:'привет'});
 for(let i=0;i<100;i++){await f.run({text:'  !СЕКС  '});f.clock.now+=3000;}
 assert.equal(f.sent.length,100);assert.equal(f.sent.filter(m=>m.message==='@viewer в сексе разрешено с @alice').length,10);assert.equal(f.sent.filter(m=>m.message==='@viewer в сексе отказано war1ouBase').length,90);assert.equal(f.aiRequests.length,0);
});
test('sex command excludes bots and the author, rejects biased random values, and does not invent a partner',async()=>{
 const f=await setup({randomValues:[4294967295,0,1]});await f.add({userId:'200',login:'alice',text:'привет'});await f.add({userId:'300',login:'bob',text:'привет'});await f.add({userId:'800',login:'nightbot',text:'привет'});await f.add({userId:'123',login:'owner_channel',text:'привет'});
 await f.run({text:'!секс'});assert.equal(f.sent[0].message,'@viewer в сексе разрешено с @bob');
 const alone=await setup({randomValues:[0]});await alone.run({text:'!секс'});assert.equal(alone.sent[0].message,'@viewer в сексе отказано war1ouBase');
 for(const text of ['!секс @alice','!сексик','привет !секс'])await alone.run({text});assert.equal(alone.sent.length,1);
});
test('sex command persists one result and never rerolls or resends a duplicate delivery',async()=>{
 const f=await setup({randomValues:[99,0]});await f.add({userId:'200',login:'alice',text:'привет'});const m=await f.add({text:'!секс'});
 await Promise.all([f.commands.answerChatCommand(f.connection,'owner_channel','chat-lease',m),f.commands.answerChatCommand(f.connection,'owner_channel','chat-lease',m)]);assert.equal(f.sent.length,1);assert.equal(f.sent[0].message,'@viewer в сексе отказано war1ouBase');
 f.clock.now+=10000;await f.commands.answerChatCommand(f.connection,'owner_channel','chat-lease',m);assert.equal(f.sent.length,1);assert.equal(f.sql.prepare("SELECT text FROM twitch_bot_messages WHERE kind='command'").get().text,f.sent[0].message);
});
test('virt gives a friendly empty-pool reply and only recognizes the exact command',async()=>{
 const f=await setup();await f.run();assert.equal(f.sent[0].message,'@viewer, пока не с кем. Ждём ещё одного чаттера.');
 for(const text of ['!виртуальный','!вирт @alice','привет !вирт','бот вирт','/me !вирт'])await f.run({text});assert.equal(f.sent.length,1);
});
test('virt delivery is durable and concurrent copies cannot send twice',async()=>{
 const f=await setup();await f.add({userId:'200',login:'alice',text:'привет'});const m=await f.add();
 await Promise.all([f.commands.answerChatCommand(f.connection,'owner_channel','chat-lease',m),f.commands.answerChatCommand(f.connection,'owner_channel','chat-lease',m)]);assert.equal(f.sent.length,1);
 f.clock.now+=10000;await f.commands.answerChatCommand(f.connection,'owner_channel','chat-lease',m);assert.equal(f.sent.length,1);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM twitch_bot_messages WHERE kind='command'").get().n,1);
});
test('virt rejects disabled bots, expired collectors, removed commands, stale or forged senders and revoked owners',async()=>{
 const f=await setup();await f.add({userId:'200',login:'alice',text:'привет'});const m=await f.add();const call=(msg=m,lease='chat-lease',connection=f.connection)=>f.commands.answerChatCommand(connection,'owner_channel',lease,msg);
 await call(m,'wrong');await call({...m,created:f.clock.now-45001});await call({...m,created:f.clock.now+5001});await call({...m,userId:'invalid'});await call({...m,login:'nightbot'});await call({...m,source:'other_channel'});await call(m,'chat-lease',{...f.connection,user:'intruder'});
 f.sql.exec('UPDATE twitch_bot_settings SET enabled=0');await call();f.sql.exec('UPDATE twitch_bot_settings SET enabled=1; UPDATE chat_channels SET collector_until=0');await call();f.sql.prepare('UPDATE chat_channels SET collector_until=?').run(f.clock.now+60000);
 await f.feed.removeMessages('owner_channel','chat-lease',{id:m.id});await call();f.sql.exec('UPDATE chat_messages SET removed=0; DELETE FROM streamers');await call();assert.equal(f.sent.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,0);
});
test('virt works without fishing, levels or AI and never retries uncertain delivery',async()=>{
 const f=await setup();f.sql.exec('UPDATE fishing_games SET enabled=0; UPDATE twitch_bot_settings SET ai_replies=0,fish_replies=0,winner_announcements=0');await f.add({userId:'200',login:'alice',text:'привет'});f.setDelivery('uncertain');const m=await f.run();assert.equal(f.sent.length,1);assert.equal(f.sql.prepare("SELECT status FROM twitch_bot_messages WHERE kind='command'").get().status,'failed');
 f.clock.now+=60000;f.setDelivery('sent');await f.commands.answerChatCommand(f.connection,'owner_channel','chat-lease',{...m,created:f.clock.now});await (await f.load('lib/twitch-bot/storage.ts')).flushBot(f.connection);assert.equal(f.sent.length,1);assert.equal(f.aiRequests.length,0);
});
test('the Twitch collector routes virt to the correct own or friend channel without enabling fishing',{timeout:8000},async()=>{
 for(const friend of [false,true]){
  const f=await fixture({realtime:true});f.enable();f.sql.exec('UPDATE fishing_games SET enabled=0; UPDATE twitch_bot_settings SET ai_replies=0');const channel=friend?'friend_channel':'owner_channel',broadcaster=friend?'999':'123',bot=friend?{...f.connection,broadcaster:'456',channel:'custom_bot'}:f.connection;
  if(friend){f.setBotConnection(bot);f.sql.prepare("INSERT INTO twitch_bot_channels(channel,owner,broadcaster) VALUES('friend_channel','owner','999')").run();f.sql.prepare("INSERT INTO twitch_bot_settings(channel,owner,enabled,ai_replies) VALUES('friend_channel','owner',1,0)").run();}
  const {connectFeed}=await f.load('lib/twitch-feed/collector.ts'),abort=new AbortController(),response=await connectFeed(new Request('https://site.test/api/twitch/feed/live',{signal:abort.signal}),{userId:'owner',email:'owner@example.test'},bot,false,friend?{channel,owner:'owner',broadcaster}:undefined),reader=response.body.getReader();
  const packet=(id,userId,login,text,extra={})=>({metadata:{message_id:'event-'+id,message_type:'notification',subscription_type:'channel.chat.message',message_timestamp:new Date(f.clock.now).toISOString()},payload:{event:{broadcaster_user_id:broadcaster,chatter_user_id:userId,chatter_user_login:login,chatter_user_name:login,message_id:id,message:{text},...extra}}});
  try{let text='';for(let i=0;i<6&&!text.includes('"status":"ready"');i++){const row=await reader.read();text+=new TextDecoder().decode(row.value);}assert.match(text,/"status":"ready"/);
   f.sockets[0].packet(packet('chatter','200','alice','привет'));f.sockets[0].packet(packet('command','777','viewer','!вирт'));await new Promise(resolve=>setTimeout(resolve,50));await f.drainBackground();assert.equal(f.sent.length,1);assert.equal(f.sent[0].message,'@viewer секретненько виртит с @alice');assert.equal(f.sent[0].sender_id,bot.broadcaster);assert.equal(f.sent[0].broadcaster_id,broadcaster);
   f.sockets[0].packet({...packet('command','777','viewer','!вирт'),metadata:{...packet('command').metadata,message_id:'copy'}});f.sockets[0].packet(packet('shared','777','viewer','!вирт',{source_broadcaster_user_id:'outside',source_broadcaster_user_login:'outside'}));await new Promise(resolve=>setTimeout(resolve,30));await f.drainBackground();assert.equal(f.sent.length,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_players').get().n,0);assert.equal(f.aiRequests.length,0);
  }finally{abort.abort();await reader.cancel().catch(()=>{});}
 }
});
