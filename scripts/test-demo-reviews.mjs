import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './test-twitch-bot.mjs'; // Runs the existing fishing / giveaway regressions too.

const valid=await readFile(new URL('./fixtures/review-valid.mp4',import.meta.url));
const long=await readFile(new URL('./fixtures/review-long.mp4',import.meta.url));
const boundary=await readFile(new URL('./fixtures/review-boundary.mp4',import.meta.url));
const audio=await readFile(new URL('./fixtures/review-audio.mp4',import.meta.url));
function bucketFixture(){
 const files=new Map(),calls={puts:0,gets:0,deletes:0};let hold=null;
 const meta=(key,file)=>({key,size:file.bytes.length,httpEtag:'"'+file.bytes.length+'-'+file.version+'"'});
 const bucket={
  async put(key,body){calls.puts++;if(hold)await hold;const file={bytes:new Uint8Array(await new Response(body).arrayBuffer()),version:calls.puts};files.set(key,file);return meta(key,file);},
  async get(key,options){calls.gets++;const file=files.get(key);if(!file)return null;const range=options?.range,bytes=range?file.bytes.slice(range.offset,range.offset+range.length):file.bytes;return {...meta(key,file),body:new Response(bytes).body,async arrayBuffer(){return bytes.slice().buffer;}};},
  async head(key){const file=files.get(key);return file?meta(key,file):null;},
  async delete(key){calls.deletes++;files.delete(key);},
 };
 return {bucket,files,calls,hold(value){hold=value;}};
}
const request=(path,method='GET',body,origin='https://site.test')=>new Request('https://site.test'+path,{method,headers:{origin,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
const form=(extra={})=>({requestId:crypto.randomUUID(),riotId:'My Player#EUW',rank:'gold-2',question:'Как сыграть этот раунд?',publish:true,...extra});
const upload=(id,bytes=valid,extra={})=>new Request('https://site.test/api/reviews/upload?id='+id,{method:'PUT',headers:{origin:'https://site.test','Content-Type':'video/mp4','Content-Length':String(bytes.length),...extra},body:bytes});
async function setup(){const storage=bucketFixture(),f=await fixture({bucket:storage.bucket});f.viewer('clipfan','777');return {...f,storage,api:await f.load('app/api/reviews/route.ts'),uploadApi:await f.load('app/api/reviews/upload/route.ts'),videoApi:await f.load('app/api/reviews/video/route.ts')};}
async function create(f,body=form()){const response=await f.api.POST(request('/api/reviews','POST',body));assert.equal(response.status,201,await response.clone().text());return {body,...await response.json()};}

test('Riot IDs and Tracker links preserve Unicode and never turn submitted text into an arbitrary URL',async()=>{
 const f=await fixture(),model=await f.load('lib/reviews/model.ts');
 assert.equal(model.normalizeRiotId('  Рыбка#EUW  '),'Рыбка#EUW');assert.equal(model.normalizeRiotId('My Player#123'),'My Player#123');
 for(const value of ['aa#123','Player#x','Name#TAG#123','https://evil.test/#AAA','x\nxx#ABC','<img>#ABC',null,{},'Name#123456'])assert.equal(model.normalizeRiotId(value),null);
 assert.equal(model.trackerUrl('Рыбка#EUW'),'https://tracker.gg/valorant/profile/riot/'+encodeURIComponent('Рыбка#EUW')+'/overview');
});

test('a real MP4 is checked from its sample timeline; an over-two-minute file and forged duration headers are rejected',async()=>{
 const f=await fixture(),parser=await f.load('lib/reviews/video.ts'),read=bytes=>({size:bytes.length,read:async(offset,length)=>new Uint8Array(bytes.subarray(offset,offset+length))});
 assert.ok(Math.abs(await parser.inspectMP4(read(valid))-1)<.01);
 assert.equal(await parser.inspectMP4(read(boundary)),120);
 assert.equal(await parser.inspectMP4(read(audio)),120); // AAC priming is trimmed by the actual presentation edits.
 await assert.rejects(parser.inspectMP4(read(long)),/длиннее двух минут/);
 const forged=Buffer.from(long);
 for(const name of ['mvhd','mdhd']){const at=forged.indexOf(name);assert.ok(at>0);const body=at+4,scale=forged.readUInt32BE(body+12);forged.writeUInt32BE(scale*60,body+16);}
 const track=forged.indexOf('tkhd')+4,movie=forged.indexOf('mvhd')+4;forged.writeUInt32BE(forged.readUInt32BE(movie+12)*60,track+20);
 forged.write('free',forged.indexOf('edts')); // With no presentation edits, the full sample timeline must still fit.
 await assert.rejects(parser.inspectMP4(read(forged)),/длиннее двух минут/);
 for(const bytes of [Buffer.from('<html>not a video</html>'),valid.subarray(0,valid.length-5),Buffer.concat([valid,Buffer.from('garbage')])])await assert.rejects(parser.inspectMP4(read(bytes)));
 assert.ok(valid.length<10000&&long.length<20000);
});

test('forms use the linked Twitch identity and real avatar, ignore client ownership and verification, and replay only once',async()=>{
 const f=await setup(),body=form({twitchName:'lick0ver',avatar:'https://evil.test/x',owner:'owner',rankVerified:true,rank_verified_by:'owner'});
 const created=await create(f,body);assert.equal(created.item.twitchName,'clipfan');assert.equal(created.item.avatar,'https://static-cdn.jtvnw.net/jtv_user_pictures/777.png');assert.equal(created.item.rankVerified,false);assert.equal(created.item.mine,true);
 const replay=await f.api.POST(request('/api/reviews','POST',body));assert.equal(replay.status,200);assert.equal((await replay.json()).item.id,created.item.id);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM demo_reviews').get().n,1);
 assert.equal(f.tokenRequests.length,1);assert.equal(f.tokenRequests[0].grant_type,'client_credentials');
 const changed=await f.api.POST(request('/api/reviews','POST',{...body,riotId:'Different#EUW'}));assert.equal(changed.status,409);
 f.setUser(null);const list=await (await f.api.GET(request('/api/reviews'))).json();assert.equal(list.items.length,1);assert.equal(list.items[0].mine,false);assert.equal(list.items[0].videoUrl,null);
 for(const name of ['owner','request_id','twitch_id','video_key','email'])assert.ok(!(name in list.items[0]),name);
});

test('unpublished video drafts cannot be listed or played by guests; a validated MP4 becomes public and replay cannot overwrite it',async()=>{
 const f=await setup(),created=await create(f,form({videoName:'round.mp4',videoSize:valid.length,duration:1})),id=created.item.id;
 assert.equal(created.item.status,'uploading');assert.equal(created.item.videoUrl,null);
 f.setUser(null);assert.equal((await (await f.api.GET(request('/api/reviews'))).json()).items.length,0);assert.equal((await f.videoApi.GET(request('/api/reviews/video?id='+id))).status,404);
 f.viewer('other','999');assert.equal((await f.uploadApi.PUT(upload(id))).status,404);assert.equal(f.storage.calls.puts,0);
 f.viewer('clipfan','777');const response=await f.uploadApi.PUT(upload(id));assert.equal(response.status,200,await response.clone().text());const ready=await response.json();assert.equal(ready.item.status,'queued');assert.equal(ready.item.duration,1);assert.equal(ready.item.videoUrl,'/api/reviews/video?id='+id);
 assert.equal(f.storage.calls.puts,1);assert.equal((await f.uploadApi.PUT(upload(id,long))).status,200);assert.equal(f.storage.calls.puts,1);
 f.setUser(null);assert.equal((await (await f.api.GET(request('/api/reviews'))).json()).items.length,1);assert.equal((await f.videoApi.GET(request('/api/reviews/video?id='+id))).status,200);
});

test('server rejects a long MP4 even when the client claims one second, deletes the object and leaves the draft unpublished for retry',async()=>{
 const f=await setup(),created=await create(f,form({videoName:'long.mp4',videoSize:long.length,duration:1})),id=created.item.id;
 const response=await f.uploadApi.PUT(upload(id,long));assert.equal(response.status,422);assert.match((await response.json()).error,/двух минут/);assert.equal(f.storage.files.size,0);assert.equal(f.sql.prepare('SELECT status FROM demo_reviews').get().status,'uploading');assert.equal(f.sql.prepare('SELECT duration_ms FROM demo_reviews').get().duration_ms,null);
 assert.equal((await f.videoApi.GET(request('/api/reviews/video?id='+id))).status,404);
 const bad=Buffer.alloc(long.length,0);assert.equal((await f.uploadApi.PUT(upload(id,bad))).status,422);assert.equal(f.storage.files.size,0);
});

test('uploads are claimed once, enforce the real byte count and reject cross-origin requests without touching R2',async()=>{
 const f=await setup(),created=await create(f,form({videoName:'round.mp4',videoSize:valid.length})),id=created.item.id;
 assert.equal((await f.uploadApi.PUT(upload(id,valid,{origin:'https://other.test'}))).status,403);
 assert.equal((await f.uploadApi.PUT(upload(id,valid,{'Content-Length':'800000000'}))).status,413);
 assert.equal((await f.uploadApi.PUT(upload(id,valid,{'Content-Length':'30'}))).status,413);assert.equal(f.storage.calls.puts,0);
 let release;f.storage.hold(new Promise(resolve=>{release=resolve;}));const first=f.uploadApi.PUT(upload(id));
 for(let i=0;i<50&&f.storage.calls.puts===0;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(f.storage.calls.puts,1);
 assert.equal((await f.uploadApi.PUT(upload(id))).status,409);release();assert.equal((await first).status,200);assert.equal(f.storage.calls.puts,1);
});

test('native video playback supports full responses, HEAD, byte ranges, suffixes and invalid-range responses',async()=>{
 const f=await setup(),created=await create(f,form({videoName:'round.mp4',videoSize:valid.length}));assert.equal((await f.uploadApi.PUT(upload(created.item.id))).status,200);
 const url='https://site.test/api/reviews/video?id='+created.item.id;
 const first=await f.videoApi.GET(new Request(url,{headers:{Range:'bytes=0-31'}}));assert.equal(first.status,206);assert.equal(first.headers.get('Content-Range'),'bytes 0-31/'+valid.length);assert.equal(first.headers.get('Content-Length'),'32');assert.deepEqual(Buffer.from(await first.arrayBuffer()),valid.subarray(0,32));assert.equal(first.headers.get('X-Content-Type-Options'),'nosniff');
 const suffix=await f.videoApi.GET(new Request(url,{headers:{Range:'bytes=-16'}}));assert.equal(suffix.status,206);assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),valid.subarray(valid.length-16));
 const head=await f.videoApi.HEAD(new Request(url));assert.equal(head.status,200);assert.equal(head.headers.get('Content-Length'),String(valid.length));assert.equal((await head.arrayBuffer()).byteLength,0);
 for(const value of ['bytes=9999999-','bytes=3-1','bytes=0-1,4-6','bytes=-0','bytes='])assert.equal((await f.videoApi.GET(new Request(url,{headers:{Range:value}}))).status,416,value);
 assert.equal((await f.videoApi.GET(new Request(url,{headers:{'If-None-Match':head.headers.get('ETag')}}))).status,304);
});

test('owners can remove their submissions and files while other viewers cannot moderate or delete them',async()=>{
 const f=await setup(),created=await create(f,form({videoName:'round.mp4',videoSize:valid.length})),id=created.item.id;await f.uploadApi.PUT(upload(id));
 f.viewer('other','999');assert.equal((await f.api.DELETE(request('/api/reviews?id='+id,'DELETE'))).status,403);assert.equal((await f.api.PATCH(request('/api/reviews','PATCH',{id,action:'status',status:'reviewed',note:''}))).status,403);assert.equal(f.storage.files.size,1);
 f.viewer('clipfan','777');assert.equal((await f.api.DELETE(request('/api/reviews?id='+id,'DELETE'))).status,200);assert.equal(f.storage.files.size,0);assert.equal((await f.videoApi.GET(request('/api/reviews/video?id='+id))).status,404);
 assert.equal((await f.api.DELETE(request('/api/reviews?id='+id,'DELETE'))).status,200);assert.equal((await f.api.POST(request('/api/reviews','POST',created.body))).status,410);
});

test('verified lick0ver can check a rank and move a submission through the review queue without making client claims official',async()=>{
 const f=await setup(),created=await create(f),id=created.item.id;f.viewer('lick0ver','888');
 const verified=await f.api.PATCH(request('/api/reviews','PATCH',{id,action:'verify-rank',rank:'diamond-2'}));assert.equal(verified.status,200);assert.equal((await verified.json()).item.rankVerified,true);assert.equal(f.sql.prepare('SELECT rank_verified_by FROM demo_reviews').get().rank_verified_by,'site-888');
 assert.equal((await f.api.PATCH(request('/api/reviews','PATCH',{id,action:'status',status:'reviewing',note:'Смотрим позицию.'}))).status,200);
 assert.equal((await f.api.PATCH(request('/api/reviews','PATCH',{id,action:'status',status:'reviewed',note:'Обрати внимание на прицел.'}))).status,200);
 f.setUser(null);assert.equal((await (await f.api.GET(request('/api/reviews'))).json()).items.length,0);const done=await (await f.api.GET(request('/api/reviews?view=done'))).json();assert.equal(done.items[0].rank,'diamond-2');assert.equal(done.items[0].note,'Обрати внимание на прицел.');assert.equal(done.stats.reviewed,1);
});

test('auth, upload limits, rank validation and per-Twitch submission quotas are enforced atomically',async()=>{
 const f=await setup();f.setUser(null);assert.equal((await f.api.POST(request('/api/reviews','POST',form()))).status,401);assert.equal((await f.api.GET(request('/api/reviews?view=mine'))).status,401);
 f.setUser({userId:'unlinked',email:'unlinked@test'});assert.equal((await f.api.POST(request('/api/reviews','POST',form()))).status,409);
 f.viewer('clipfan','777');for(const extra of [{rank:'immortal-99'},{riotId:'x'},{publish:false},{videoName:'x.html',videoSize:500},{videoName:'huge.mp4',videoSize:81*1024*1024},{question:'x'.repeat(1001)}])assert.equal((await f.api.POST(request('/api/reviews','POST',form(extra)))).status,400);
 assert.equal((await f.api.POST(request('/api/reviews','POST',form(),'https://other.test'))).status,403);
 const replies=await Promise.all(Array.from({length:5},()=>f.api.POST(request('/api/reviews','POST',form()))));assert.equal(replies.filter(r=>r.status===201).length,3);assert.equal(replies.filter(r=>r.status===429).length,2);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM demo_reviews').get().n,3);
 f.sql.prepare('INSERT INTO fishing_accounts(user,twitch_id,username,linked_at) VALUES(?,?,?,?)').run('another-site-user','777','clipfan',f.clock.now);f.setUser({userId:'another-site-user',email:'same@test'});assert.equal((await f.api.POST(request('/api/reviews','POST',form()))).status,429);
});

test('Twitch linking returns to the reviews tab and cannot use an external redirect or expose private fishing',async()=>{
 const f=await fixture();f.setUser({userId:'review-user',email:'review@test'});const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
 const start=await connect.GET(request('/api/twitch/connect?purpose=player&return_to=/reviews'));assert.equal(start.status,302);const auth=new URL(start.headers.get('Location'));assert.equal(auth.searchParams.get('scope'),'openid');const state=auth.searchParams.get('state');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/reviews');
 const result=await callback.GET(request('/api/twitch/callback?code=ok&state='+state));assert.equal(result.status,302);assert.equal(result.headers.get('Location'),'https://site.test/reviews?twitch=player-connected');
 const fishing=await f.load('app/api/fishing/route.ts');assert.equal((await fishing.GET(request('/api/fishing'))).status,403);
});

test('queue pagination has no duplicated or missing forms and search does not reveal unpublished drafts',async()=>{
 const f=await setup();const first=await create(f),row=f.sql.prepare('SELECT * FROM demo_reviews').get();
 const insert=f.sql.prepare('INSERT INTO demo_reviews(id,owner,request_id,twitch_id,twitch_name,avatar,riot_id,rank,question,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
 for(let i=0;i<26;i++)insert.run(crypto.randomUUID(),'another-user',crypto.randomUUID(),'456','another','https://static-cdn.jtvnw.net/a.png','Player'+i+'#TAG','unrated','',i===25?'uploading':'queued',f.clock.now+i+1,f.clock.now+i+1);
 f.setUser(null);const page=await (await f.api.GET(request('/api/reviews'))).json();assert.equal(page.items.length,24);assert.ok(page.next);assert.equal(page.items[0].id,first.item.id);
 const rest=await (await f.api.GET(request('/api/reviews?after='+page.next.at+'&afterId='+page.next.id))).json();assert.equal(rest.items.length,2);assert.equal(rest.next,null);assert.equal(new Set([...page.items,...rest.items].map(row=>row.id)).size,26);
 const hidden=await (await f.api.GET(request('/api/reviews?q=Player25'))).json();assert.equal(hidden.items.length,0);
 const found=await (await f.api.GET(request('/api/reviews?q=Player24'))).json();assert.equal(found.items.length,1);assert.equal(found.items[0].riotId,'Player24#TAG');
 assert.equal((await f.api.GET(request('/api/reviews?after=-1&afterId=no'))).status,400);
});

test('abandoned upload cleanup removes only the requesting account files and exact two-minute clips remain playable',async()=>{
 const f=await setup(),pending=await create(f,form({videoName:'old.mp4',videoSize:valid.length}));const old=f.sql.prepare('SELECT * FROM demo_reviews').get();
 await f.storage.bucket.put(old.video_key,valid);f.sql.prepare('UPDATE demo_reviews SET updated=? WHERE id=?').run(f.clock.now-3600001,pending.item.id);
 f.viewer('other','999');const other=await create(f,form({videoName:'other.mp4',videoSize:valid.length}));const otherRow=f.sql.prepare('SELECT * FROM demo_reviews WHERE id=?').get(other.item.id);await f.storage.bucket.put(otherRow.video_key,valid);f.sql.prepare('UPDATE demo_reviews SET updated=? WHERE id=?').run(f.clock.now-3600001,other.item.id);
 f.viewer('clipfan','777');const next=await create(f,form({videoName:'exact.mp4',videoSize:boundary.length}));assert.equal(f.storage.files.has(old.video_key),false);assert.equal(f.storage.files.has(otherRow.video_key),true);assert.equal(f.sql.prepare('SELECT status FROM demo_reviews WHERE id=?').get(other.item.id).status,'uploading');
 const uploaded=await f.uploadApi.PUT(upload(next.item.id,boundary));assert.equal(uploaded.status,200);assert.equal((await uploaded.json()).item.duration,120);assert.equal((await f.videoApi.GET(request('/api/reviews/video?id='+next.item.id))).status,200);
});

test('video forms keep review and rank-game submissions separate and hide game answers from viewers',async()=>{
 const f=await setup(),review=await create(f),guess=await create(f,form({purpose:'guess',rank:'radiant',videoName:'guess.mp4',videoSize:valid.length}));
 assert.equal(guess.item.purpose,'guess');assert.equal((await f.uploadApi.PUT(upload(guess.item.id))).status,200);
 const list=async(path='/api/reviews')=>(await (await f.api.GET(request(path))).json());
 assert.deepEqual((await list()).items.map(x=>x.id),[review.item.id]);assert.deepEqual((await list('/api/reviews?purpose=guess')).items.map(x=>x.id),[guess.item.id]);
 assert.equal((await list()).stats.queued,1);assert.equal((await list('/api/reviews?purpose=guess')).stats.queued,1);
 const profileApi=await f.load('app/api/levels/profile/route.ts');f.setUser(null);
 assert.equal((await list('/api/reviews?purpose=guess')).items.length,0);assert.equal((await f.videoApi.GET(request('/api/reviews/video?id='+guess.item.id))).status,404);assert.equal((await f.videoApi.HEAD(request('/api/reviews/video?id='+guess.item.id))).status,404);
 const profile=await (await profileApi.GET(request('/api/levels/profile?channel=owner_channel&id=777'))).json();assert.equal(profile.profile.rank.id,'gold-2');
 f.viewer('another_viewer','999');assert.equal((await list('/api/reviews?purpose=guess&view=mine')).items.length,0);assert.equal((await f.videoApi.GET(request('/api/reviews/video?id='+guess.item.id))).status,404);
 f.setUser({userId:'owner',email:'owner@example.test',displayName:'Owner'});const gameApi=await f.load('app/api/reviews/guess/route.ts');
 const available=await (await gameApi.GET(request('/api/reviews/guess?channel=owner_channel'))).json();assert.deepEqual(available.candidates.map(x=>x.id),[guess.item.id]);
 assert.equal((await gameApi.POST(request('/api/reviews/guess','POST',{action:'start',channel:'owner_channel',reviewId:review.item.id,requestId:crypto.randomUUID()}))).status,400);
 const round=crypto.randomUUID();assert.equal((await gameApi.POST(request('/api/reviews/guess','POST',{action:'start',channel:'owner_channel',reviewId:guess.item.id,requestId:round}))).status,201);
 f.setUser(null);const gameVideo=await f.load('app/api/reviews/guess/video/route.ts');assert.equal((await gameVideo.GET(request('/api/reviews/guess/video?game='+round))).status,200);assert.equal((await (await gameApi.GET(request('/api/reviews/guess?channel=owner_channel'))).json()).game.answer,null);
 f.setUser({userId:'owner',email:'owner@example.test',displayName:'Owner'});assert.equal((await gameApi.POST(request('/api/reviews/guess','POST',{action:'reveal',channel:'owner_channel',gameId:round}))).status,200);
 assert.deepEqual((await list('/api/reviews?purpose=guess&view=done')).items.map(x=>x.id),[guess.item.id]);assert.equal((await list()).items[0].id,review.item.id);assert.equal(f.sent.length,0);
});

test('rank-game form requires a clip and rank, preserves retries, and keeps its OAuth return path',async()=>{
 const f=await setup();
 for(const extra of [{purpose:'unknown'},{purpose:'guess'},{purpose:'guess',rank:'unrated',videoName:'guess.mp4',videoSize:valid.length}])assert.equal((await f.api.POST(request('/api/reviews','POST',form(extra)))).status,400);
 const created=await create(f,form({purpose:'guess',videoName:'guess.mp4',videoSize:valid.length}));
 assert.equal((await f.api.POST(request('/api/reviews','POST',created.body))).status,200);assert.equal((await f.api.POST(request('/api/reviews','POST',{...created.body,purpose:'review'}))).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM demo_reviews').get().n,1);
 const connect=await f.load('app/api/twitch/connect/route.ts'),response=await connect.GET(request('/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:'/reviews/guess-form'})));assert.equal(response.status,302);
 const url=new URL(response.headers.get('location'));assert.equal(url.searchParams.get('scope'),'openid');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/reviews/guess-form');
 const callback=await f.load('app/api/twitch/callback/route.ts'),done=await callback.GET(request('/api/twitch/callback?'+new URLSearchParams({state:url.searchParams.get('state'),code:'test-code'})));assert.equal(new URL(done.headers.get('location')).pathname,'/reviews/guess-form');
});
