import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './test-twitch-bot.mjs';
const host={userId:'owner',email:'owner@example.test',displayName:'Owner'};
const req=(path,body,origin='https://site.test')=>new Request('https://site.test'+path,{method:body===undefined?'GET':'POST',headers:{origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
async function guessSetup(options={}){
 const f=await fixture({admin:true,...options}),api=await f.load('app/api/reviews/guess/route.ts'),id=crypto.randomUUID();
 f.sql.prepare("INSERT INTO demo_reviews(id,owner,request_id,twitch_id,twitch_name,riot_id,rank,purpose,status,video_key,video_size,duration_ms,created,updated) VALUES(?,?,?,?,?,?,?,'guess','queued',?,100,1000,?,?)").run(id,'clip-owner',crypto.randomUUID(),'888','secret_author','Secret Player#EUW','gold-2','demo-videos/'+id+'.mp4',f.clock.now,f.clock.now);
 const start=async(extra={})=>{const requestId=crypto.randomUUID(),response=await api.POST(req('/api/reviews/guess',{action:'start',channel:'owner_channel',reviewId:id,requestId,...extra}));return {response,requestId};};
 const snapshot=async()=>{const response=await api.GET(req('/api/reviews/guess?channel=owner_channel'));assert.equal(response.status,200,await response.clone().text());return response.json();};
 return {...f,api,id,start,snapshot};
}
const message=(f,id='vote',text='!ранг 4',userId='777')=>({id,kind:'message',userId,login:'viewer',name:'Viewer',color:'',badges:[],text,fragments:[{type:'text',text}],created:f.clock.now});
test('rank game hides answers and source metadata until the organizer reveals them',async()=>{
 const f=await guessSetup(),created=await f.start();assert.equal(created.response.status,201,await created.response.clone().text());
 const replay=await f.api.POST(req('/api/reviews/guess',{action:'start',channel:'owner_channel',reviewId:f.id,requestId:created.requestId}));assert.equal(replay.status,200);
 f.setUser(null);let data=await f.snapshot();assert.equal(data.canManage,false);assert.equal(data.candidates.length,0);assert.equal(data.game.answer,null);assert.equal(data.game.author,null);assert.equal(data.game.results,null);for(const secret of [f.id,'Secret Player','secret_author','gold-2','clip-owner'])assert.ok(!JSON.stringify(data).includes(secret),secret);
 const reviews=await f.load('app/api/reviews/route.ts');assert.equal((await (await reviews.GET(req('/api/reviews?q=Secret'))).json()).items.length,0);
 f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('owner_channel','888','secret_author','Secret Author',1,1)").run();const profile=await f.load('app/api/levels/profile/route.ts');assert.equal((await (await profile.GET(req('/api/levels/profile?channel=owner_channel&id=888'))).json()).profile.rank,null);
 assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'reveal',channel:'owner_channel',gameId:created.requestId}))).status,401);
 f.viewer('viewer','777');assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'reveal',channel:'owner_channel',gameId:created.requestId}))).status,403);
 f.setUser(host);assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'reveal',channel:'owner_channel',gameId:created.requestId}))).status,200);
 f.setUser(null);data=await f.snapshot();assert.equal(data.game.answer.id,'gold-2');assert.equal(data.game.author.riotId,'Secret Player#EUW');assert.equal((await (await reviews.GET(req('/api/reviews?purpose=guess'))).json()).items.length,0);
});
test('rank game combines website and chat votes per verified Twitch ID and rejects stale leases and authors',async()=>{
 const f=await guessSetup(),created=await f.start();assert.equal(created.response.status,201);
 f.sql.prepare("INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,state) VALUES('owner_channel','owner','lease',?,'ready','{}')").run(f.clock.now+3600000);
 f.viewer('viewer','777');const vote=choice=>f.api.POST(req('/api/reviews/guess',{action:'vote',channel:'owner_channel',gameId:created.requestId,choice}));
 assert.equal((await vote('platinum')).status,200);assert.equal((await f.snapshot()).game.total,1);
 const storage=await f.load('lib/reviews/guess-storage.ts');f.clock.now+=100;
 assert.equal(await storage.ingestGuessVote('owner_channel','bad',message(f)),false);assert.equal(await storage.ingestGuessVote('owner_channel','lease',message(f)),true);
 assert.equal((await f.snapshot()).game.total,1);assert.equal((await f.snapshot()).game.mine,'gold');
 assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'vote',channel:'owner_channel',gameId:created.requestId,choice:'gold',userId:'999'}))).status,400);
 f.viewer('secret_author','888');assert.equal((await vote('gold')).status,409);assert.equal(await storage.ingestGuessVote('owner_channel','lease',message(f,'author','!ранг золото','888')),false);
 assert.equal(await storage.ingestGuessVote('owner_channel','lease',{...message(f,'bot'),login:'nightbot'}),false);
 assert.equal(await storage.ingestGuessVote('owner_channel','lease',{...message(f,'old'),created:f.clock.now-60001}),false);
 f.clock.now+=100;assert.equal(await storage.ingestGuessVote('owner_channel','lease',message(f,'second','!ранг 6','999')),true);
 f.setUser(host);assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'reveal',channel:'owner_channel',gameId:created.requestId}))).status,200);
 const data=await f.snapshot();assert.equal(data.game.total,2);assert.equal(data.game.correct,1);assert.equal(data.game.results.find(r=>r.id==='gold').count,1);
 f.viewer('viewer','777');assert.equal((await vote('diamond')).status,409);assert.equal(await storage.ingestGuessVote('owner_channel','lease',message(f,'late')),false);assert.equal(f.sent.length,0);
});
test('rank game starts once, rejects unpublished clips and stops voting at the deadline',async()=>{
 const f=await guessSetup();const results=await Promise.all([f.start(),f.start()]);assert.deepEqual(results.map(r=>r.response.status).sort(),[201,409]);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM rank_guess_games WHERE state='voting'").get().n,1);
 const game=(await f.snapshot()).game;
 f.clock.now+=180001;f.viewer('viewer','777');assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'vote',channel:'owner_channel',gameId:game.id,choice:'gold'}))).status,409);
 f.setUser(host);assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'cancel',channel:'owner_channel',gameId:game.id}))).status,200);
 f.sql.prepare("UPDATE demo_reviews SET status='uploading' WHERE id=?").run(f.id);assert.equal((await f.start()).response.status,400);
 assert.equal((await f.api.POST(req('/api/reviews/guess',{action:'start',channel:'owner_channel',reviewId:f.id,requestId:crypto.randomUUID()},'https://other.test'))).status,403);
});
test('rank game public video keeps byte ranges and never exposes the source ID in the filename',async()=>{
 const bytes=await readFile(new URL('./fixtures/review-valid.mp4',import.meta.url));const bucket={head:async()=>({size:bytes.length,httpEtag:'"video"'}),get:async(key,options)=>({body:new Response(options?.range?bytes.subarray(options.range.offset,options.range.offset+options.range.length):bytes).body})};
 const f=await guessSetup({bucket}),created=await f.start();f.sql.prepare('UPDATE demo_reviews SET video_size=? WHERE id=?').run(bytes.length,f.id);f.setUser(null);
 const api=await f.load('app/api/reviews/guess/video/route.ts'),response=await api.GET(new Request('https://site.test/api/reviews/guess/video?game='+created.requestId,{headers:{Range:'bytes=0-9'}}));assert.equal(response.status,206);assert.equal((await response.arrayBuffer()).byteLength,10);assert.ok(!response.headers.get('Content-Disposition').includes(f.id));assert.equal(response.headers.get('Cache-Control'),'no-store');
 f.sql.prepare("UPDATE demo_reviews SET status='deleted' WHERE id=?").run(f.id);assert.equal((await api.GET(req('/api/reviews/guess/video?game='+created.requestId))).status,404);
});
async function levelSetup(){
 const f=await fixture(),api=await f.load('app/api/levels/route.ts'),rules=await f.load('lib/levels/rules.ts'),levels=await f.load('lib/levels/storage.ts');
 assert.equal((await api.POST(req('/api/levels',{channel:'owner_channel',enabled:true,appearance:rules.DEFAULT_APPEARANCE}))).status,200);
 f.sql.prepare("INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,state) VALUES('owner_channel','owner','lease',?,'ready','{}')").run(f.clock.now+1000000);
 await levels.refreshLevelStream(f.connection,'owner_channel');return {...f,levels};
}
test('monthly ranking counts only newly earned XP once, splits Tallinn months and keeps total progress',async()=>{
 const f=await fixture();f.clock.now=Date.parse('2026-10-31T21:59:40Z');const api=await f.load('app/api/levels/route.ts'),rules=await f.load('lib/levels/rules.ts'),levels=await f.load('lib/levels/storage.ts');
 assert.equal((await api.POST(req('/api/levels',{channel:'owner_channel',enabled:true,appearance:rules.DEFAULT_APPEARANCE}))).status,200);
 f.sql.prepare("INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,state) VALUES('owner_channel','owner','lease',?,'ready','{}')").run(f.clock.now+1000000);await levels.refreshLevelStream(f.connection,'owner_channel');
 const first=message(f,'first','привет всем ребята');await Promise.all([levels.ingestLevelMessage(f.connection,'owner_channel','lease',first),levels.ingestLevelMessage(f.connection,'owner_channel','lease',first)]);
 f.clock.now+=30000;await levels.ingestLevelMessage(f.connection,'owner_channel','lease',message(f,'second','начался новый месяц'));
 assert.equal(f.sql.prepare('SELECT xp FROM level_players').get().xp,2);assert.deepEqual(f.sql.prepare('SELECT month,xp FROM level_months ORDER BY month').all().map(r=>({...r})),[{month:'2026-10',xp:1},{month:'2026-11',xp:1}]);
 await levels.ingestLevelMessage(f.connection,'owner_channel','lease',message(f,'spam','!рыба'));assert.equal(f.sql.prepare("SELECT xp FROM level_months WHERE month='2026-11'").get().xp,2);
 const season=await f.load('app/api/levels/season/route.ts');f.setUser(null);let response=await season.GET(req('/api/levels/season?channel=owner_channel&month=2026-10'));assert.equal(response.status,200);const data=await response.json();assert.equal(data.leaders[0].xp,1);assert.equal(data.rewardsEnabled,false);assert.equal(data.stats.participants,1);assert.equal(f.sent.length,0);
 assert.equal((await season.GET(req('/api/levels/season?channel=owner_channel&month=2026-12'))).status,400);
});
test('level titles require earned levels, persist on profiles and appear in the OBS feed',async()=>{
 const f=await levelSetup();f.viewer('viewer','777');const api=await f.load('app/api/levels/profile/route.ts');
 const settings={revision:0,favorites:[],avatarId:'twitch',bannerId:'default',titleId:'legend'};
 const post=b=>api.POST(req('/api/levels/profile?channel=owner_channel',b));assert.equal((await post(settings)).status,400);
 f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('owner_channel','777','viewer','Viewer',1500,1500)").run();
 const response=await post({...settings,titleId:'on-air'});assert.equal(response.status,200,await response.clone().text());const data=await response.json();assert.equal(data.profile.title.name,'На связи');assert.equal(data.profile.titleId,'on-air');
 const {titleId,...legacy}=settings;assert.equal((await post({...legacy,revision:1})).status,200);assert.equal((await (await api.GET(req('/api/levels/profile?channel=owner_channel'))).json()).profile.titleId,'on-air');
 const feed=await f.load('lib/twitch-feed/storage.ts');await feed.appendMessage('owner_channel','lease',message(f,'hello','приятно быть тут'));const overlay=await f.levels.overlaySnapshot('owner_channel');assert.equal(overlay.messages[0].title,'На связи');assert.equal((await f.levels.levelSnapshot('owner_channel')).leaders[0].title.name,'На связи');
 const other=await (await api.GET(req('/api/levels/profile?channel=other_channel'))).json();assert.equal(other.profile.title,null);
 assert.equal((await post({...settings,revision:2,titleId:'https://evil.test'})).status,400);assert.equal((await post({...settings,revision:0,titleId:'on-air'})).status,409);
});
test('rank game Twitch OAuth returns to the game page without broadening viewer scopes',async()=>{
 const f=await fixture();f.viewer();const connect=await f.load('app/api/twitch/connect/route.ts'),response=await connect.GET(req('/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:'/reviews/guess?channel=owner_channel'})));assert.equal(response.status,302);const url=new URL(response.headers.get('location'));assert.equal(url.searchParams.get('scope'),'openid');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/reviews/guess?channel=owner_channel');
 const callback=await f.load('app/api/twitch/callback/route.ts'),done=await callback.GET(req('/api/twitch/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'test-code'})));assert.equal(new URL(done.headers.get('location')).pathname,'/reviews/guess');assert.equal(new URL(done.headers.get('location')).searchParams.get('channel'),'owner_channel');
});
test('rank game receives real collector events without enabling fishing or sending bot messages',async()=>{
 const f=await guessSetup({realtime:true}),created=await f.start();assert.equal(created.response.status,201);
 const route=await f.load('app/api/twitch/feed/live/route.ts'),abort=new AbortController(),response=await route.GET(new Request('https://site.test/api/twitch/feed/live?channel=owner_channel',{signal:abort.signal}));assert.equal(response.status,200);const reader=response.body.getReader();
 try{let text='';for(let i=0;i<5&&!text.includes('"status":"ready"');i++){const next=await reader.read();text+=new TextDecoder().decode(next.value);}assert.match(text,/"status":"ready"/);
  f.sockets[0].packet({metadata:{message_id:'rank-event',message_type:'notification',subscription_type:'channel.chat.message',message_timestamp:new Date(f.clock.now).toISOString()},payload:{event:{broadcaster_user_id:'123',chatter_user_id:'777',chatter_user_login:'viewer',chatter_user_name:'Viewer',message_id:'rank-message',message:{text:'!ранг 4'}}}});
  await new Promise(resolve=>setTimeout(resolve,40));await f.drainBackground();assert.equal(f.sql.prepare('SELECT choice FROM rank_guess_votes').get().choice,'gold');assert.equal(f.sent.length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_players').get().n,0);
 }finally{abort.abort();await reader.cancel().catch(()=>{});}
});
test('monthly ranking has deterministic ties, separate channel scores and no prize operations',async()=>{
 const f=await levelSetup();await f.levels.ingestLevelMessage(f.connection,'owner_channel','lease',message(f,'one','первое сообщение','777'));
 f.clock.now+=10;await f.levels.ingestLevelMessage(f.connection,'owner_channel','lease',message(f,'two','второе сообщение','999'));
 const {levelMonth}=await f.load('lib/levels/season.ts'),month=levelMonth();f.sql.prepare("INSERT INTO twitch_bot_channels(channel,owner,broadcaster) VALUES('friend_channel','owner','999')").run();
 f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('friend_channel','777','viewer','Viewer',900,900)").run();f.sql.prepare("INSERT INTO level_months(channel,month,user_id,xp,messages,last_earned,first_seen) VALUES('friend_channel',?,'777',900,900,?,?)").run(month,f.clock.now,f.clock.now);
 const api=await f.load('app/api/levels/season/route.ts');f.viewer('viewer','999');const data=await (await api.GET(req('/api/levels/season?channel=owner_channel'))).json();assert.equal(data.me.position,2);assert.deepEqual(data.leaders.map(p=>p.userId),['777','999']);assert.equal(data.leaders[0].xp,1);assert.equal(data.rewardsEnabled,false);assert.equal(f.sent.length,0);const friend=await (await api.GET(req('/api/levels/season?channel=friend_channel'))).json();assert.equal(friend.leaders[0].xp,900);
});
