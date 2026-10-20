import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './test-twitch-bot.mjs';
const owner={userId:'owner',email:'owner@example.test',displayName:'Owner'},channel='owner_channel';
const png=await readFile(new URL('./fixtures/feedback-valid.png',import.meta.url));
const request=(body,origin='https://site.test')=>new Request('https://site.test/api/community',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({channel,...body})});
const snapshot=async f=>(await f.api.GET(new Request('https://site.test/api/community?channel='+channel))).json();
const message=(f,id,text,userId='777',login='alpha')=>({id,kind:'message',userId,login,name:login,color:'',badges:[],text,fragments:[{type:'text',text}],created:f.clock.now});
async function setup(){const f=await fixture({avatarImage:png});f.sql.prepare("INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,state) VALUES('owner_channel','owner','community-lease',?,'ready','{}')").run(f.clock.now+3600000);return {...f,api:await f.load('app/api/community/route.ts'),feed:await f.load('lib/twitch-feed/storage.ts'),mystery:await f.load('lib/community/mystery.ts')};}
async function seed(f){
 f.sql.prepare("INSERT INTO demo_profiles(twitch_id,login,avatar,updated) VALUES('777','alpha','https://static-cdn.jtvnw.net/jtv_user_pictures/alpha.png',?)").run(f.clock.now);
 for(const [id,text] of [['source-1','этот раунд надо было выигрывать'],['source-2','красивый момент получился'],['source-3','сегодня очень уютный стрим']])await f.feed.appendMessage(channel,'community-lease',message(f,id,text));
}
async function startMystery(f){const id=crypto.randomUUID(),response=await f.api.POST(request({action:'viewer.start',requestId:id}));assert.equal(response.status,201,await response.clone().text());return id;}
async function startPoll(f,slot='palette'){const id=crypto.randomUUID(),response=await f.api.POST(request({action:'room.start',requestId:id,slot}));assert.equal(response.status,201,await response.clone().text());return id;}
test('community is public, begins with a real default room and exposes no organizer credentials',async()=>{
 const f=await setup();f.setUser(null);const data=await snapshot(f);assert.equal(data.canManage,false);assert.equal(data.user,null);assert.equal(data.me,null);assert.equal(data.mystery,null);assert.deepEqual(data.room.layout,{palette:'ember',corner:'books',rug:'check'});assert.equal(data.room.poll,null);assert.ok(!JSON.stringify(data).includes('community-lease'));assert.ok(!JSON.stringify(data).includes('test-token'));
});
test('guests and ordinary Twitch viewers cannot manage either game or supply another player identity',async()=>{
 const f=await setup();
 for(const [user,status] of [[null,401],[f.viewer('ordinary','888'),403]]){f.setUser(user);for(const action of ['room.start','room.finish','viewer.start','viewer.reveal','viewer.cancel'])assert.equal((await f.api.POST(request({action,requestId:crypto.randomUUID(),pollId:crypto.randomUUID(),roundId:crypto.randomUUID(),slot:'palette'}))).status,status);}
 f.setUser(owner);assert.equal((await f.api.POST(request({action:'room.start',requestId:crypto.randomUUID(),slot:'palette'},'https://evil.test'))).status,403);assert.equal((await f.api.POST(request({action:'room.start',requestId:crypto.randomUUID(),slot:'palette',userId:'owner'}))).status,400);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM community_room_polls').get().n,0);
});
test('room votes use verified Twitch IDs, permit one current choice and persist the winning decoration for everyone',async()=>{
 const f=await setup(),id=await startPoll(f);assert.equal((await f.api.POST(request({action:'room.start',requestId:id,slot:'palette'}))).status,201);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM community_room_polls').get().n,1);
 f.viewer('first','888');assert.equal((await f.api.POST(request({action:'room.vote',pollId:id,choice:'night'}))).status,200);assert.equal((await f.api.POST(request({action:'room.vote',pollId:id,choice:'forest'}))).status,200);
 f.viewer('second','999');assert.equal((await f.api.POST(request({action:'room.vote',pollId:id,choice:'forest'}))).status,200);assert.equal((await f.api.POST(request({action:'room.vote',pollId:id,choice:'fake'}))).status,409);
 assert.equal((await snapshot(f)).room.poll.total,2);f.setUser(owner);assert.equal((await f.api.POST(request({action:'room.finish',pollId:id}))).status,200);
 f.setUser(null);const data=await snapshot(f);assert.equal(data.room.layout.palette,'forest');assert.equal(data.room.poll.winner,'forest');assert.equal(data.room.poll.state,'closed');assert.equal(data.room.revision,1);await snapshot(f);assert.equal((await snapshot(f)).room.revision,1);
});
test('room polls expire automatically, never overlap and reject stale votes and cross-channel operations',async()=>{
 const f=await setup();const results=await Promise.all([f.api.POST(request({action:'room.start',requestId:crypto.randomUUID(),slot:'corner'})),f.api.POST(request({action:'room.start',requestId:crypto.randomUUID(),slot:'rug'}))]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 const poll=(await snapshot(f)).room.poll;f.viewer('voter','888');const choice=poll.slot==='corner'?'arcade':'waves';assert.equal((await f.api.POST(request({action:'room.vote',pollId:poll.id,choice}))).status,200);f.clock.now+=91000;assert.equal((await f.api.POST(request({action:'room.vote',pollId:poll.id,choice}))).status,409);const data=await snapshot(f);assert.equal(data.room.layout[poll.slot],choice);assert.equal(data.room.poll.state,'closed');assert.equal((await f.api.POST(request({channel:'other_channel',action:'room.vote',pollId:poll.id,choice}))).status,409);
});
test('mystery uses real chat quotes and a Twitch avatar, hides the author until reveal and does not reuse the same person immediately',async()=>{
 const f=await setup();await seed(f);const id=await startMystery(f);f.setUser(null);const data=await snapshot(f),game=data.mystery;assert.equal(game.id,id);assert.equal(game.state,'playing');assert.equal(game.answer,null);assert.equal(game.quotes.length,3);assert.ok(game.portrait.startsWith('/api/community/portrait?round='));
 for(const field of ['target_id','target_login','target_name','owner','avatar','message_ids'])assert.ok(!Object.hasOwn(game,field));assert.ok(!JSON.stringify(game).includes('alpha'));assert.ok(!JSON.stringify(game).includes('jtv_user_pictures'));
 f.setUser(owner);assert.equal((await f.api.POST(request({action:'viewer.start',requestId:id}))).status,201);assert.equal((await f.api.POST(request({action:'viewer.start',requestId:crypto.randomUUID()}))).status,409);
 assert.equal((await f.api.POST(request({action:'viewer.reveal',roundId:id}))).status,200);assert.equal((await snapshot(f)).mystery.answer.login,'alpha');
 f.sql.prepare("INSERT INTO demo_profiles(twitch_id,login,avatar,updated) VALUES('888','beta','https://static-cdn.jtvnw.net/jtv_user_pictures/beta.png',?)").run(f.clock.now);
 for(const [i,text] of ['интересно чем закончится этот раунд','я тоже хочу такую аватарку'].entries())await f.feed.appendMessage(channel,'community-lease',message(f,'beta-'+i,text,'888','beta'));
 f.clock.now++;const next=await startMystery(f);assert.equal(f.sql.prepare('SELECT target_login FROM community_mystery_rounds WHERE id=?').get(next).target_login,'beta');
});
test('mystery accepts three guesses, excludes the author and keeps correctness hidden until the round ends',async()=>{
 const f=await setup();await seed(f);const id=await startMystery(f);f.viewer('alpha','777');assert.equal((await snapshot(f)).mystery.canGuess,false);assert.equal((await f.api.POST(request({action:'viewer.guess',roundId:id,guess:'alpha'}))).status,409);
 f.viewer('winner','888');assert.equal((await f.api.POST(request({action:'viewer.guess',roundId:id,guess:'someone'}))).status,200);assert.equal((await f.api.POST(request({action:'viewer.guess',roundId:id,guess:'@ALPHA'}))).status,200);assert.equal((await snapshot(f)).mystery.answer,null);assert.deepEqual((await snapshot(f)).mystery.winners,[]);
 assert.equal((await f.api.POST(request({action:'viewer.guess',roundId:id,guess:'last_try'}))).status,200);assert.equal((await snapshot(f)).mystery.mine.attempts,3);assert.ok(!Object.hasOwn((await snapshot(f)).mystery.mine,'correct_at'));
 f.viewer('loser','999');for(const guess of ['one','two','three'])assert.equal((await f.api.POST(request({action:'viewer.guess',roundId:id,guess}))).status,200);assert.equal((await f.api.POST(request({action:'viewer.guess',roundId:id,guess:'alpha'}))).status,409);
 f.clock.now+=91000;f.setUser(null);const data=await snapshot(f);assert.equal(data.mystery.state,'revealed');assert.equal(data.mystery.answer.login,'alpha');assert.deepEqual(data.mystery.winners,['winner']);
});
test('Twitch !кто uses the active collector, deduplicates delivery and rejects bots, stale messages and a different room',async()=>{
 const f=await setup();await seed(f);const id=await startMystery(f),m=message(f,'guess-1','!кто @alpha','888','winner');await f.feed.appendMessage(channel,'community-lease',m);assert.equal(await f.mystery.ingestMysteryGuess(channel,'community-lease',m),true);assert.equal(await f.mystery.ingestMysteryGuess(channel,'community-lease',m),false);assert.equal(f.sql.prepare('SELECT attempts FROM community_mystery_guesses').get().attempts,1);
 for(const [name,lease,extra] of [['wrong-lease','revoked',{}],['bot','community-lease',{login:'nightbot'}],['old','community-lease',{created:f.clock.now-61000}],['shared','community-lease',{source:'other_channel'}]]){const entry={...message(f,name,'!кто alpha','999','outsider'),...extra};await f.feed.appendMessage(channel,'community-lease',entry);assert.equal(await f.mystery.ingestMysteryGuess(channel,lease,entry),false);}
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM community_mystery_guesses WHERE round_id=?').get(id).n,1);assert.equal(f.sent.length,0);
});
test('a failed Twitch guess rolls back its delivery receipt and a retry still works',async()=>{
 const f=await setup();await seed(f);await startMystery(f);const m=message(f,'retry-guess','!кто alpha','888','winner');await f.feed.appendMessage(channel,'community-lease',m);f.sql.exec("CREATE TRIGGER fail_guess BEFORE INSERT ON community_mystery_guesses BEGIN SELECT RAISE(ABORT,'Retry'); END;");
 await assert.rejects(f.mystery.ingestMysteryGuess(channel,'community-lease',m));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM community_mystery_events').get().n,0);f.sql.exec('DROP TRIGGER fail_guess');assert.equal(await f.mystery.ingestMysteryGuess(channel,'community-lease',m),true);assert.equal(f.sql.prepare('SELECT attempts FROM community_mystery_guesses').get().attempts,1);
});
test('organizer approval is rechecked in the mystery publication after avatar preparation',async()=>{
 const f=await setup();await seed(f);const prepare=f.db.prepare.bind(f.db);f.db.prepare=query=>{if(query.startsWith('INSERT OR IGNORE INTO community_mystery_rounds'))f.sql.prepare('DELETE FROM streamers').run();return prepare(query);};
 assert.equal((await f.api.POST(request({action:'viewer.start',requestId:crypto.randomUUID()}))).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM community_mystery_rounds').get().n,0);
});
test('removed chat messages disappear from clues and an empty moderated round is cancelled without exposing an author',async()=>{
 const f=await setup();await seed(f);const id=await startMystery(f);await f.feed.removeMessages(channel,'community-lease',{id:'source-1'});assert.equal((await snapshot(f)).mystery.quotes.length,2);await f.feed.removeMessages(channel,'community-lease',{user:'777'});const data=await snapshot(f);assert.equal(data.mystery.state,'cancelled');assert.deepEqual(data.mystery.quotes,[]);assert.equal(data.mystery.answer,null);const portrait=await f.load('app/api/community/portrait/route.ts');assert.equal((await portrait.GET(new Request('https://site.test/api/community/portrait?round='+id))).status,404);
});
test('portrait is an opaque server-generated blurred clue; a query parameter cannot reveal it before the answer',async()=>{
 const f=await setup();await seed(f);const id=await startMystery(f),route=await f.load('app/api/community/portrait/route.ts'),get=()=>route.GET(new Request('https://site.test/api/community/portrait?round='+id+'&phase=answer'));f.setUser(null);let response=await get();assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'image/svg+xml');let body=await response.text();assert.match(body,/filter="url\(#blur\)"/);assert.ok(!body.includes('alpha'));assert.ok(!body.includes('jtv_user_pictures'));assert.equal(response.headers.get('Cache-Control'),'no-store');
 f.setUser(owner);await f.api.POST(request({action:'viewer.reveal',roundId:id}));response=await get();body=await response.text();assert.ok(!body.includes('filter="url(#blur)"'));
 f.sql.prepare("UPDATE community_mystery_rounds SET avatar='http://127.0.0.1/private' WHERE id=?").run(id);assert.equal((await get()).status,404);
});
test('community OAuth preserves room, profile and level tabs and refuses foreign or forged return paths',async()=>{
 const f=await setup();f.viewer();const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
 for(const returnTo of ['/community?channel=owner_channel','/community?tab=profile&channel=owner_channel','/community?tab=levels&channel=owner_channel&view=overlay']){
  const response=await connect.GET(new Request('https://site.test/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:returnTo})));assert.equal(response.status,302);const url=new URL(response.headers.get('location'));assert.equal(url.searchParams.get('scope'),'openid');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,returnTo);
  const done=await callback.GET(new Request('https://site.test/api/twitch/callback?state='+url.searchParams.get('state')+'&code=test-code')),target=new URL(done.headers.get('location')),expected=new URL(returnTo,'https://site.test');assert.equal(target.pathname,expected.pathname);for(const [key,value] of expected.searchParams)assert.equal(target.searchParams.get(key),value);assert.equal(target.searchParams.get('twitch'),'player-connected');
 }
 for(const returnTo of ['https://evil.test/community','//evil.test/community','/community?next=https://evil.test','/community?tab=profile&tab=room','/community?tab=levels&view=evil','/community?tab=room&profile=777','/community?tab=profile&profile=not_a_twitch_id','/community?channel=../../private']){
  const response=await connect.GET(new Request('https://site.test/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:returnTo})));assert.equal(response.status,302);assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/fishing');
 }
});
