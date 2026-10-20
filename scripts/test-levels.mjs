import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {fixture} from './test-twitch-bot.mjs';
import './test-neural-bot.mjs';
const owner={userId:'owner',email:'owner@example.test',displayName:'Owner'};
const appearance={accent:'#ce3833',opacity:82,fontSize:18,messages:6,hideAfter:90};
const post=(body,origin='https://site.test')=>new Request('https://site.test/api/levels',{method:'POST',headers:{origin},body:JSON.stringify(body)});
async function setup(options={}){
 const f=await fixture(options),api=await f.load('app/api/levels/route.ts'),levels=await f.load('lib/levels/storage.ts');
 assert.equal((await api.POST(post({channel:'owner_channel',enabled:true,appearance}))).status,200);
 f.sql.prepare("INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,state) VALUES ('owner_channel','owner','level-lease',?,'ready','{}')").run(f.clock.now+86400000);
 await levels.refreshLevelStream(f.connection,'owner_channel');
 const message=(id,text='привет ребята',userId='777',login='viewer')=>({id,kind:'message',userId,login,name:login,color:'#aabbcc',badges:[],text,fragments:[{type:'text',text}],created:f.clock.now});
 const ingest=m=>levels.ingestLevelMessage(f.connection,'owner_channel','level-lease',m);
 return {...f,api,levels,message,ingest};
}
function historyPlayer(f,messages=785,{id='491647905',login='lick0ver',channel='war1ouss'}={}){
 f.sql.prepare('INSERT INTO level_channels(channel,owner,enabled,appearance,stream_id,stream_live,checked_at) VALUES(?,?,1,?, ?,1,?) ON CONFLICT(channel) DO NOTHING').run(channel,'owner','{}','history-stream',f.clock.now);
 f.sql.prepare('INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES(?,?,?,?,?,?)').run(channel,id,login,login,messages,messages);
 f.sql.prepare('INSERT INTO level_sessions(channel,stream_id,user_id,messages,earned) VALUES(?,?,?,20,20)').run(channel,'history-stream',id);
}
test('the owner requested history restores lick0ver to 7182 once, consistently across ranking, profile and XP',async()=>{
 const f=await setup();historyPlayer(f);const beforeSessions=JSON.stringify(f.sql.prepare('SELECT * FROM level_sessions').all()),snapshot=await f.levels.levelSnapshot('war1ouss','491647905');
 assert.equal(snapshot.me.messages,7182);assert.equal(snapshot.me.xp,7182);assert.equal(snapshot.me.streamMessages,20);assert.equal(snapshot.stats.messages,20);assert.equal(snapshot.stats.totalMessages,7182);assert.equal(snapshot.me.level,4);
 const profiles=await f.load('lib/levels/profiles.ts'),profile=await profiles.publicLevelProfile('491647905','war1ouss');assert.equal(profile.messages,7182);assert.equal(profile.progress.xp,7182);
 await f.levels.levelSnapshot('war1ouss');assert.equal(f.sql.prepare("SELECT messages FROM level_players WHERE channel='war1ouss' AND user_id='491647905'").get().messages,7182);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_message_adjustments').get().n,1);assert.equal(f.sql.prepare('SELECT amount FROM level_message_adjustments').get().amount,6397);
 assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM level_sessions').all()),beforeSessions);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_months').get().n,0);assert.equal(f.sent.length,0);
});
test('concurrent workers and restarts cannot import the historical messages twice or discard newer messages',async()=>{
 const f=await setup();historyPlayer(f,790);const other=await fixture();other.db.prepare=f.db.prepare.bind(f.db);other.db.batch=f.db.batch.bind(f.db);const worker=await other.load('lib/levels/message-history.ts');
 await Promise.all([f.levels.levelSnapshot('war1ouss'),worker.restoreMessageHistory('war1ouss')]);assert.equal(f.sql.prepare("SELECT messages FROM level_players WHERE user_id='491647905'").get().messages,7187);
 f.sql.prepare("UPDATE level_players SET messages=messages+1,xp=messages+1 WHERE user_id='491647905'").run();
 const restarted=await fixture();restarted.db.prepare=f.db.prepare.bind(f.db);restarted.db.batch=f.db.batch.bind(f.db);await (await restarted.load('lib/levels/message-history.ts')).restoreMessageHistory('war1ouss');assert.equal(f.sql.prepare("SELECT messages FROM level_players WHERE user_id='491647905'").get().messages,7188);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_message_adjustments').get().n,1);
});
test('a failed historical update rolls back its receipt and retries safely',async()=>{
 const f=await setup();historyPlayer(f);f.sql.exec("CREATE TRIGGER fail_history BEFORE UPDATE ON level_players WHEN NEW.messages>=7182 BEGIN SELECT RAISE(ABORT,'Retry'); END;");
 await assert.rejects(f.levels.levelSnapshot('war1ouss'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_message_adjustments').get().n,0);assert.equal(f.sql.prepare("SELECT messages FROM level_players WHERE user_id='491647905'").get().messages,785);
 f.sql.exec('DROP TRIGGER fail_history');assert.equal((await f.levels.levelSnapshot('war1ouss','491647905')).me.messages,7182);
});
test('the history correction is restricted to the verified Twitch ID and channel and cannot create another player',async()=>{
 const f=await setup();historyPlayer(f,785,{id:'777'});historyPlayer(f,785,{channel:'friend_channel'});await f.levels.levelSnapshot('war1ouss');await f.levels.levelSnapshot('friend_channel');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_message_adjustments').get().n,0);assert.equal(f.sql.prepare('SELECT SUM(messages) n FROM level_players').get().n,1570);
 f.sql.prepare('DELETE FROM level_sessions').run();f.sql.prepare('DELETE FROM level_players').run();await f.levels.levelSnapshot('war1ouss');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_players').get().n,0);
 historyPlayer(f);assert.equal((await f.levels.levelSnapshot('war1ouss','491647905')).me.messages,7182);
});
test('level thresholds grow and preserve exact progress at every boundary',async()=>{
 const f=await fixture(),{progressFor}=await f.load('lib/levels/rules.ts');
 for(const [xp,level,progress,needed] of [[0,1,0,1500],[1499,1,1499,1500],[1500,2,0,2250],[3749,2,2249,2250],[3750,3,0,3000],[6750,4,0,3750],[40500,10,0,8250]]){const p=progressFor(xp);assert.equal(p.level,level);assert.equal(p.progress,progress);assert.equal(p.needed,needed);assert.equal(p.remaining,needed-progress);}
 for(let steps=0;steps<1000;steps++){const xp=steps*1500+750*steps*(steps-1)/2;assert.equal(progressFor(xp).level,steps+1);assert.equal(progressFor(xp).progress,0);}
 assert.equal(progressFor(-5).xp,0);assert.equal(progressFor(NaN).level,1);
});
test('each distinct message awards immediately while duplicate deliveries cannot award twice',async()=>{
 const f=await setup();const first=f.message('first');await Promise.all([f.ingest(first),f.ingest(first),f.ingest(f.message('second','сегодня отличный стрим'))]);
 const row=f.sql.prepare('SELECT * FROM level_players').get();assert.equal(row.xp,2);assert.equal(row.messages,2);
 assert.equal(f.sql.prepare('SELECT SUM(earned) n FROM level_sessions').get().n,2);
 await f.ingest(f.message('third','продолжаем смотреть игру'));assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,3);
});
test('repeats, commands, emotes and short messages all earn XP while bots remain excluded',async()=>{
 const f=await setup();await f.ingest(f.message('a','Очень хороший момент!'));
 await f.ingest(f.message('b','Очень хороший момент!'));
 for(const [i,text] of ['!рыба','/me привет всем','аааааааа','hi','!!!'].entries())await f.ingest(f.message('text-'+i,text));
 const emote=f.message('emote','Kappa');emote.fragments=[{type:'emote',text:'Kappa'}];await f.ingest(emote);
 assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,8);
 await f.ingest(f.message('c','очень хороший момент'));assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,9);
 assert.equal(f.sql.prepare('SELECT messages FROM level_players').get().messages,9);
 await f.ingest(f.message('bot','привет всем ребята','888','streamelements'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_players').get().n,1);
});
test('historical messages restore experience consistently in rankings, profiles, OBS and later awards',async()=>{
 const f=await setup(),state=await f.levels.readLevelChannel('owner_channel'),{levelMonth}=await f.load('lib/levels/season.ts'),month=levelMonth(f.clock.now);
 for(const [id,name,xp,messages] of [['777','lick0ver',36,119],['888','xiaodmi',43,91]]){
  f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('owner_channel',?,?,?,?,?)").run(id,name,name,xp,messages);
  f.sql.prepare("INSERT INTO level_sessions(channel,stream_id,user_id,messages,earned) VALUES('owner_channel',?,?,?,?)").run(state.stream_id,id,messages,xp);
  f.sql.prepare("INSERT INTO level_months(channel,month,user_id,xp,messages,last_earned,first_seen) VALUES('owner_channel',?,?,?,?,?,?)").run(month,id,xp,messages,f.clock.now,f.clock.now);
 }
 const data=await f.levels.levelSnapshot('owner_channel','777');assert.deepEqual(data.leaders.map(p=>p.userId),['777','888']);assert.equal(data.me.xp,119);assert.equal(data.me.earned,119);assert.equal(data.stats.earned,210);
 const profiles=await f.load('app/api/levels/profile/route.ts'),profile=await (await profiles.GET(new Request('https://site.test/api/levels/profile?channel=owner_channel&id=777'))).json();assert.equal(profile.profile.progress.xp,119);assert.equal(profile.profile.earned,119);
 const feed=await f.load('lib/twitch-feed/storage.ts');await feed.appendMessage('owner_channel','level-lease',f.message('visible'));assert.equal((await f.levels.overlaySnapshot('owner_channel')).messages[0].xp,119);
 const seasons=await f.load('app/api/levels/season/route.ts'),season=await (await seasons.GET(new Request('https://site.test/api/levels/season?channel=owner_channel'))).json();assert.deepEqual(season.leaders.map(p=>p.userId),['777','888']);assert.equal(season.leaders[0].xp,119);assert.equal(season.stats.xp,210);
 const next=f.message('next','!рыба');await Promise.all([f.ingest(next),f.ingest(next)]);
 const updated=await f.levels.levelSnapshot('owner_channel','777');assert.equal(updated.me.xp,120);assert.equal(updated.me.earned,120);assert.equal(f.sql.prepare("SELECT xp FROM level_players WHERE user_id='777'").get().xp,120);assert.equal(f.sql.prepare("SELECT earned FROM level_sessions WHERE user_id='777'").get().earned,120);assert.equal(f.sql.prepare("SELECT xp FROM level_months WHERE user_id='777'").get().xp,120);
});
test('titles unlock from the recorded message total even before another chat message arrives',async()=>{
 const f=await setup();f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('owner_channel','777','viewer','Viewer',36,1500)").run();f.viewer('viewer','777');
 const api=await f.load('app/api/levels/profile/route.ts'),response=await api.POST(new Request('https://site.test/api/levels/profile?channel=owner_channel',{method:'POST',headers:{origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({revision:0,favorites:[],avatarId:'twitch',bannerId:'default',titleId:'on-air'})}));
 assert.equal(response.status,200,await response.clone().text());const body=await response.json();assert.equal(body.profile.progress.xp,1500);assert.equal(body.profile.title.name,'На связи');
});
test('offline and unavailable Twitch never generate XP or stream counters',async()=>{
 const f=await setup();f.clock.now+=46000;f.setStreamLive(false);await f.ingest(f.message('offline'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_events').get().n,0);
 f.clock.now+=46000;f.setStreamLive(true);f.setStreamError(true);await f.ingest(f.message('unknown'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_players').get().n,0);
 assert.match((await f.levels.readLevelChannel('owner_channel')).error,/проверить эфир/);
 f.clock.now+=46000;f.setStreamError(false);await f.ingest(f.message('live'));assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,1);
});
test('a new Twitch stream resets its message totals and keeps viewers XP',async()=>{
 const f=await setup();await f.ingest(f.message('old'));const old=await f.levels.levelSnapshot('owner_channel','777');assert.equal(old.stats.messages,1);assert.equal(old.stats.totalMessages,1);
 f.clock.now+=46000;f.setStreamId('new-stream');await f.levels.refreshLevelStream(f.connection,'owner_channel');
 const next=await f.levels.levelSnapshot('owner_channel','777');assert.equal(next.stats.messages,0);assert.equal(next.stats.totalMessages,1);assert.equal(next.me.xp,1);assert.equal(next.me.streamMessages,0);
 await f.ingest(f.message('new','новый эфир начался'));const current=await f.levels.levelSnapshot('owner_channel','777');assert.equal(current.stats.messages,1);assert.equal(current.stats.totalMessages,2);assert.equal(current.me.xp,2);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_sessions').get().n,2);
});
test('overall message statistics include viewers beyond the top 30 and stay separate from stream and other channel totals',async()=>{
 const f=await setup(),state=await f.levels.readLevelChannel('owner_channel');
 const empty=await f.levels.levelSnapshot('owner_channel');assert.equal(empty.stats.totalMessages,0);assert.equal(empty.stats.messages,0);
 for(let i=1;i<=35;i++)f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('owner_channel',?,?,?,0,?)").run(String(1000+i),'viewer_'+i,'Viewer '+i,i);
 f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('friend_channel','999','friend','Friend',0,900)").run();
 for(const [id,messages] of [['1001',3],['1002',4]])f.sql.prepare("INSERT INTO level_sessions(channel,stream_id,user_id,messages,earned) VALUES('owner_channel',?,?,?,?)").run(state.stream_id,id,messages,messages);
 f.setUser(null);const response=await f.api.GET(new Request('https://site.test/api/levels?channel=owner_channel'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.snapshot.leaders.length,30);assert.equal(data.snapshot.stats.totalMessages,630);assert.equal(data.snapshot.stats.messages,7);assert.equal(data.snapshot.stats.viewers,2);
});
test('only current approved collectors can award and stale packets are discarded',async()=>{
 const f=await setup();const old=f.message('old');old.created-=60001;await f.ingest(old);
 const future=f.message('future');future.created+=10001;await f.ingest(future);
 await f.levels.ingestLevelMessage(f.connection,'owner_channel','spoof',f.message('fake'));
 f.sql.exec('DELETE FROM streamers');await f.ingest(f.message('revoked'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_players').get().n,0);
});
test('online/offline events reject out of order updates and switch the real stream ID',async()=>{
 const f=await setup();await f.levels.levelStreamEvent('owner_channel','owner','stream.offline',{},f.clock.now);assert.equal((await f.levels.readLevelChannel('owner_channel')).stream_live,0);
 await f.levels.levelStreamEvent('owner_channel','owner','stream.online',{id:'old',type:'live'},f.clock.now-1);assert.equal((await f.levels.readLevelChannel('owner_channel')).stream_live,0);
 f.clock.now+=1000;await f.levels.levelStreamEvent('owner_channel','owner','stream.online',{id:'next',type:'live',started_at:new Date(f.clock.now).toISOString()},f.clock.now);
 const row=await f.levels.readLevelChannel('owner_channel');assert.equal(row.stream_id,'next');assert.equal(row.stream_live,1);assert.equal(row.sync_until,0);
 const before=f.message('before');before.created-=1000;await f.ingest(before);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_players').get().n,0);
 await f.ingest(f.message('after'));assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,1);
});
test('levels and overlay settings require channel ownership and reject XP writes',async()=>{
 const f=await setup(),body={channel:'owner_channel',enabled:true,appearance};
 assert.equal((await f.api.POST(post(body,'https://other.test'))).status,403);
 assert.equal((await f.api.POST(post({...body,xp:900}))).status,400);
 assert.equal((await f.api.POST(post({...body,appearance:{...appearance,accent:'red;display:none'}}))).status,400);
 f.viewer();assert.equal((await f.api.POST(post(body))).status,403);
 f.setUser(null);assert.equal((await f.api.POST(post(body))).status,401);
 const publicData=await (await f.api.GET(new Request('https://site.test/api/levels?channel=owner_channel'))).json();assert.equal(publicData.canManage,false);assert.equal(publicData.user,null);assert.deepEqual(publicData.managed,[]);assert.equal(publicData.error,null);
});
test('overlay fonts persist for guests, accept legacy settings and reject CSS or external URLs',async()=>{
 const f=await setup();assert.equal((await f.levels.overlaySnapshot('owner_channel')).appearance.fontFamily,'manrope');
 for(const fontFamily of ['manrope','rubik','oswald','jetbrains-mono']){
  assert.equal((await f.api.POST(post({channel:'owner_channel',enabled:true,appearance:{...appearance,fontFamily}}))).status,200);
  assert.equal(JSON.parse((await f.levels.readLevelChannel('owner_channel')).appearance).fontFamily,fontFamily);
  assert.equal((await f.levels.overlaySnapshot('owner_channel')).appearance.fontFamily,fontFamily);
 }
 for(const fontFamily of ['https://example.test/font.ttf','Arial;display:none','constructor','__proto__',null,{}])assert.equal((await f.api.POST(post({channel:'owner_channel',enabled:true,appearance:{...appearance,fontFamily}}))).status,400);
 assert.equal((await f.api.POST(post({channel:'owner_channel',enabled:true,appearance}))).status,200);
 f.setUser(null);const route=await f.load('app/api/levels/overlay/route.ts'),response=await route.GET(new Request('https://site.test/api/levels/overlay?channel=owner_channel'));assert.equal(response.status,200);assert.equal((await response.json()).appearance.fontFamily,'manrope');
});
test('linked viewers see their Twitch progress without access to fishing or organizer settings',async()=>{
 const f=await setup();await f.ingest(f.message('hello'));f.viewer('viewer','777');
 const response=await f.api.GET(new Request('https://site.test/api/levels?channel=owner_channel'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.snapshot.me.xp,1);assert.equal(data.identity.username,'viewer');assert.equal(data.canManage,false);
});
test('turning levels off preserves XP and makes the public OBS feed empty',async()=>{
 const f=await setup();await f.ingest(f.message('before'));assert.equal((await f.api.POST(post({channel:'owner_channel',enabled:false,appearance}))).status,200);f.clock.now+=30000;await f.ingest(f.message('after','ещё одно сообщение'));assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,1);assert.equal(await f.levels.overlaySnapshot('owner_channel'),null);
});
test('public OBS overlay respects moderation and exposes only public content',async()=>{
 const f=await setup(),feed=await f.load('lib/twitch-feed/storage.ts');const m=f.message('visible','<img src=x onerror=alert(1)>');await feed.appendMessage('owner_channel','level-lease',m);await f.ingest(m);
 const route=await f.load('app/api/levels/overlay/route.ts');f.setUser(null);const response=await route.GET(new Request('https://site.test/api/levels/overlay?channel=owner_channel'));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const data=await response.json();assert.equal(data.messages[0].text,m.text);assert.equal(data.messages[0].xp,1);
 assert.deepEqual(Object.keys(data).sort(),['appearance','channel','messages','now']);assert.ok(!JSON.stringify(data).includes('level-lease'));assert.ok(!Object.hasOwn(data,'error'));
 await feed.removeMessages('owner_channel','level-lease',{id:m.id});assert.equal((await f.levels.overlaySnapshot('owner_channel')).messages.length,0);
});
test('OBS roles come from Twitch badges, keep moderator priority and do not grant channel access',async()=>{
 const f=await setup(),feed=await f.load('lib/twitch-feed/storage.ts'),{chatMessage}=await f.load('lib/twitch-feed/types.ts');
 const cases=[['200',['subscriber'],'viewer'],['300',['vip'],'vip'],['400',['moderator'],'moderator'],['500',['vip','moderator'],'moderator']];
 for(const [id,badges] of cases){const entry=chatMessage({chatter_user_id:id,chatter_user_login:'viewer_'+id,chatter_user_name:'VIP Moderator',badges:badges.map(set_id=>({set_id})),message:{text:'привет'}},'role-'+id,f.clock.now);await feed.appendMessage('owner_channel','level-lease',entry);}
 const legacy=f.message('legacy','обычное сообщение','600','legacy');delete legacy.badges;await feed.appendMessage('owner_channel','level-lease',legacy);
 const route=await f.load('app/api/levels/overlay/route.ts');f.setUser(null);const response=await route.GET(new Request('https://site.test/api/levels/overlay?channel=owner_channel'));assert.equal(response.status,200);const data=await response.json();assert.deepEqual(data.messages.map(m=>m.role),[...cases.map(row=>row[2]),'viewer']);
 f.viewer('viewer_500','500');const settings=await (await f.api.GET(new Request('https://site.test/api/levels?channel=owner_channel'))).json();assert.equal(settings.canManage,false);
});
test('OBS publishes native Twitch emotes and clips fragments without exposing arbitrary image URLs',async()=>{
 const f=await setup(),feed=await f.load('lib/twitch-feed/storage.ts'),{chatMessage}=await f.load('lib/twitch-feed/types.ts'),{overlayFragments}=await f.load('lib/levels/emotes.ts');
 const entry=chatMessage({chatter_user_id:'777',chatter_user_login:'viewer',message:{text:'привет Kappa',fragments:[{type:'text',text:'привет '},{type:'emote',text:'Kappa',emote:{id:'25'}}]}},'native-emote',f.clock.now);await feed.appendMessage('owner_channel','level-lease',entry);f.setUser(null);
 const data=await f.levels.overlaySnapshot('owner_channel');assert.equal(JSON.stringify(data.messages[0].fragments),JSON.stringify([{type:'text',text:'привет '},{type:'emote',text:'Kappa',id:'25'}]));
 const clipped=overlayFragments('x'.repeat(498)+'Kappa',[{type:'text',text:'x'.repeat(498)},{type:'emote',text:'Kappa',id:'25'}]);assert.equal(clipped.map(p=>p.text).join(''),'x'.repeat(498)+'Ka');assert.ok(clipped.every(p=>p.type==='text'));
 for(const parts of [null,[{type:'emote',text:'wrong',id:'25'}],[{type:'emote',text:'Kappa',id:'../evil',url:'https://evil.test'}]]){const result=overlayFragments('Kappa',parts);assert.equal(result.map(p=>p.text).join(''),'Kappa');assert.ok(result.every(p=>p.type==='text'));assert.ok(!JSON.stringify(result).includes('evil'));}
});
test('standalone overlay is transparent, guest accessible and uses textContent for untrusted chat',async()=>{
 const f=await setup(),route=await f.load('app/overlay/levels/route.ts');f.setUser(null);const response=await route.GET(new Request('https://site.test/overlay/levels?channel=owner_channel'));assert.equal(response.status,200);const html=await response.text();assert.match(html,/background:transparent!important/);assert.ok(!html.includes('innerHTML'));assert.match(html,/document.createTextNode/);assert.ok(!html.includes('wl-progress-label'));assert.ok(!html.includes('wl-track'));assert.ok(!html.includes('site-navigation'));assert.ok(response.headers.get('Content-Security-Policy').includes("connect-src 'self'"));assert.ok(response.headers.get('Content-Security-Policy').includes("font-src 'self'"));assert.ok(response.headers.get('Content-Security-Policy').includes("img-src https://static-cdn.jtvnw.net"));new Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);assert.equal((await route.GET(new Request('https://site.test/overlay/levels?channel=%3Cscript%3E'))).status,400);
});
test('overlay renders safe text, animates a new level and removes moderated messages on the next poll',async()=>{
 const f=await fixture(),{overlayDocument}=await f.load('lib/levels/overlay.ts');
 class Element{
  constructor(tag){this.tag=tag;this.className='';this._text='';this.children=[];this.style={setProperty(key,value){this[key]=value;}};this.classList={add:name=>{this.className+=' '+name;},remove:name=>{this.className=this.className.split(' ').filter(x=>x!==name).join(' ');}};}
  get textContent(){return this._text+this.children.map(node=>node.textContent).join('');}
  set textContent(value){this._text=String(value);for(const node of this.children??[])node.parent=null;this.children=[];}
  replaceWith(node){if(!this.parent)return;const parent=this.parent,at=parent.children.indexOf(this);this.remove();node.remove();node.parent=parent;parent.children.splice(at,0,node);}
  append(...nodes){for(const node of nodes){node.remove();node.parent=this;this.children.push(node);}}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
  replaceChildren(...nodes){for(const node of [...this.children])node.remove();this.append(...nodes);}
  querySelector(selector){const cls=selector.slice(1);for(const node of this.children){if(node.className.split(' ').includes(cls))return node;const match=node.querySelector(selector);if(match)return match;}return null;}
 }
 const frame=new Element('section'),list=new Element('div');frame.append(list);let scheduled;
 const p={id:'one',userId:'777',name:'Viewer',text:'<script>alert(1)</script>',created:100000,...(await f.load('lib/levels/rules.ts')).progressFor(1499)};
 let payload={appearance:{...appearance,fontFamily:'rubik'},now:100000,messages:[p]};
 const script=new Script(overlayDocument('owner_channel').match(/<script>([\s\S]*)<\/script>/)[1]);script.runInNewContext({document:{getElementById:id=>id==='frame'?frame:list,createElement:tag=>new Element(tag),createTextNode:text=>{const node=new Element('#text');node.textContent=text;return node;}},fetch:async()=>({ok:true,json:async()=>payload}),setTimeout:callback=>{scheduled=callback;}});
 await new Promise(resolve=>setTimeout(resolve,0));assert.equal(frame.style.visibility,'visible');assert.equal(list.children.length,1);assert.equal(list.querySelector('.wl-text').textContent,p.text);assert.equal(list.querySelector('.wl-track'),null);assert.equal(list.querySelector('.wl-progress-label'),null);assert.match(frame.style['--wl-family'],/Wariouss Rubik/);
 assert.equal(list.querySelector('.wl-role-badge').textContent,'');
 const originalCard=list.children[0];payload={...payload,appearance:{...appearance,fontFamily:'oswald'},messages:[{...p,role:'vip'}]};await scheduled();assert.equal(list.children[0],originalCard);assert.match(frame.style['--wl-family'],/Wariouss Oswald/);assert.ok(originalCard.className.includes('wl-role-vip'));assert.equal(list.querySelector('.wl-role-badge').textContent,'VIP');
 payload={...payload,messages:[{...p,role:'moderator',...(await f.load('lib/levels/rules.ts')).progressFor(1500)}]};await scheduled();assert.equal(list.querySelector('.wl-badge').textContent,'LV 2');assert.ok(list.children[0].className.includes('wl-level-up'));assert.ok(originalCard.className.includes('wl-role-moderator'));assert.ok(!originalCard.className.includes('wl-role-vip'));assert.equal(list.querySelector('.wl-role-badge').textContent,'МОД');
 payload={...payload,messages:[{...p,role:'vip" onclick="alert(1)'}]};await scheduled();assert.equal(list.querySelector('.wl-role-badge').textContent,'');assert.ok(!originalCard.className.includes('wl-role-moderator'));assert.ok(!originalCard.className.includes('onclick'));assert.ok(originalCard.className.includes('wl-level-up'));
 const emoteMessage={...p,text:'привет Kappa',fragments:[{type:'text',text:'привет '},{type:'emote',text:'Kappa',id:'25'}]};
 payload={...payload,messages:[emoteMessage]};await scheduled();const image=list.querySelector('.wl-emote');assert.ok(image);assert.equal(image.src,'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0');assert.equal(image.alt,'Kappa');assert.equal(image.referrerPolicy,'no-referrer');
 payload={...payload,messages:[{...emoteMessage,...(await f.load('lib/levels/rules.ts')).progressFor(1501)}]};await scheduled();assert.equal(list.querySelector('.wl-emote'),image,'polling must not restart animated emotes');
 image.onerror();assert.equal(list.querySelector('.wl-emote'),null);assert.equal(list.querySelector('.wl-text').textContent,'привет Kappa');
 payload={...payload,messages:[{...p,text:'Kappa',fragments:[{type:'emote',text:'Kappa',id:'../evil?x=1',url:'https://evil.test/image'}]}]};await scheduled();assert.equal(list.querySelector('.wl-emote'),null);assert.equal(list.querySelector('.wl-text').textContent,'Kappa');
 payload={...payload,messages:[{...p,fragments:[{type:'emote',text:'not the real message',id:'25'}]}]};await scheduled();assert.equal(list.querySelector('.wl-text').textContent,p.text);assert.equal(list.querySelector('.wl-emote'),null);
 payload={...payload,messages:[]};await scheduled();assert.equal(list.children.length,0);assert.equal(frame.style.visibility,'hidden');
});
test('friend channel levels work with the operator account and stay separate from own channel',async()=>{
 const f=await setup();f.sql.prepare("INSERT INTO twitch_bot_channels(channel,owner,broadcaster) VALUES('friend_channel','owner','999')").run();assert.equal((await f.api.POST(post({channel:'friend_channel',enabled:true,appearance}))).status,200);
 f.sql.prepare("INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,state) VALUES('friend_channel','owner','friend-lease',?,'ready','{}')").run(f.clock.now+3600000);await f.levels.ingestLevelMessage(f.connection,'friend_channel','friend-lease',f.message('friend'));await f.ingest(f.message('own'));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_players').get().n,2);
 const data=await (await f.api.GET(new Request('https://site.test/api/levels?channel=friend_channel'))).json();assert.equal(data.canManage,true);assert.equal(data.snapshot.stats.messages,1);assert.ok(data.managed.includes('friend_channel'));
});
test('shared collector awards normal Twitch messages without enabling fishing',async()=>{
 const f=await fixture({realtime:true}),api=await f.load('app/api/levels/route.ts');assert.equal((await api.POST(post({channel:'owner_channel',enabled:true,appearance}))).status,200);const route=await f.load('app/api/twitch/feed/live/route.ts'),abort=new AbortController();
 const response=await route.GET(new Request('https://site.test/api/twitch/feed/live?channel=owner_channel',{signal:abort.signal}));assert.equal(response.status,200);const reader=response.body.getReader();
 try{let text='';for(let i=0;i<5&&!text.includes('"status":"ready"');i++){const next=await reader.read();text+=new TextDecoder().decode(next.value);}assert.match(text,/"status":"ready"/);
  const online=f.subscriptions.find(x=>x.type==='stream.online');assert.ok(online);assert.deepEqual(online.condition,{broadcaster_user_id:'123'});
  f.sockets[0].packet({metadata:{message_id:'packet-1',message_type:'notification',subscription_type:'channel.chat.message',message_timestamp:new Date(f.clock.now).toISOString()},payload:{event:{broadcaster_user_id:'123',chatter_user_id:'777',chatter_user_login:'viewer',chatter_user_name:'Viewer',message_id:'from-twitch',message:{text:'привет всем ребята'}}}});
  await new Promise(resolve=>setTimeout(resolve,40));await f.drainBackground();assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_players').get().n,0);assert.equal(f.sent.length,0);
 }finally{abort.abort();await reader.cancel().catch(()=>{});}
});
test('Twitch linking returns viewers to levels after verified OAuth',async()=>{
 const f=await fixture(),connect=await f.load('app/api/twitch/connect/route.ts');f.viewer();const response=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=player&return_to=/levels'));assert.equal(response.status,302);const url=new URL(response.headers.get('location'));assert.equal(url.searchParams.get('scope'),'openid');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/levels');
 const callback=await f.load('app/api/twitch/callback/route.ts'),result=await callback.GET(new Request('https://site.test/api/twitch/callback?state='+url.searchParams.get('state')+'&code=test-code'));assert.match(result.headers.get('location'),/\/levels\?twitch=player-connected$/);
});
