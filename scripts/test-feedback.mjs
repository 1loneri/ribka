import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixture} from './test-twitch-bot.mjs';

const images=await Promise.all(['png','jpg','webp'].map(ext=>readFile(new URL('./fixtures/feedback-valid.'+ext,import.meta.url))));
function storageFixture(){
 const files=new Map(),calls={puts:0,deletes:0};let onPut=async()=>{},failDelete=false;
 const meta=(key,bytes)=>({key,size:bytes.length,httpEtag:'"'+key+'"'});
 return {files,calls,hold(callback){onPut=callback;},failDelete(value){failDelete=value;},bucket:{
  async put(key,body){calls.puts++;await onPut();const bytes=new Uint8Array(await new Response(body).arrayBuffer());files.set(key,bytes);return meta(key,bytes);},
  async head(key){const bytes=files.get(key);return bytes?meta(key,bytes):null;},
  async get(key){const bytes=files.get(key);return bytes?{...meta(key,bytes),body:new Response(bytes).body}:null;},
  async delete(key){calls.deletes++;if(failDelete)throw Error('Storage unavailable');files.delete(key);},
 }};
}
async function setup(){const storage=storageFixture(),f=await fixture({admin:true,bucket:storage.bucket});return {...f,storage,api:await f.load('app/api/feedback/route.ts'),image:await f.load('app/api/feedback/image/route.ts')};}
const request=(id,method='POST',bytes=images[0],mime='image/png',origin='https://site.test')=>new Request('https://site.test/api/feedback?id='+id,{method,headers:{origin,'content-type':mime},...(method==='POST'?{body:bytes}:{})});
const get=id=>new Request('https://site.test/api/feedback/image?id='+id);
async function create(f,id=crypto.randomUUID(),bytes=images[0],mime='image/png'){const response=await f.api.POST(request(id,'POST',bytes,mime));assert.equal(response.status,201,await response.clone().text());return {id,...await response.json()};}
const dateRequest=(id,date,origin='https://site.test')=>new Request('https://site.test/api/feedback?id='+id,{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify({date})});
const linkRequest=(id,fields,origin='https://site.test')=>new Request('https://site.test/api/feedback?id='+id,{method:'PATCH',headers:{origin,'content-type':'application/json'},body:JSON.stringify(fields)});

test('a post link becomes public without changing the image or its date, can be replaced and can be removed',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const {id}=await create(f),before=f.sql.prepare('SELECT * FROM giveaway_feedback WHERE id=?').get(id),puts=f.storage.calls.puts;
 assert.equal(before.post_url,null);const target='https://t.me/wariouss/123?single#post';let response=await f.api.PATCH(linkRequest(id,{postUrl:' '+target+' '}));assert.equal(response.status,200);assert.equal((await response.json()).item.postUrl,target);
 const stored=f.sql.prepare('SELECT * FROM giveaway_feedback WHERE id=?').get(id);assert.deepEqual({...stored,post_url:before.post_url},{...before});assert.equal(f.storage.calls.puts,puts);assert.equal(f.storage.calls.deletes,0);
 f.setUser(null);assert.equal((await (await f.api.GET(new Request('https://site.test/api/feedback'))).json()).items[0].postUrl,target);assert.equal((await f.image.GET(get(id))).status,200);
 f.viewer('lick0ver','777');response=await f.api.PATCH(linkRequest(id,{postUrl:'https://www.twitch.tv/lick0ver/clip/example'}));assert.equal(response.status,200);assert.match((await response.json()).item.postUrl,/twitch\.tv/);
 await f.api.PATCH(dateRequest(id,'2024-02-29'));assert.match(f.sql.prepare('SELECT post_url FROM giveaway_feedback WHERE id=?').get(id).post_url,/twitch\.tv/);
 for(const value of ['',null]){response=await f.api.PATCH(linkRequest(id,{postUrl:value}));assert.equal(response.status,200);assert.equal((await response.json()).item.postUrl,null);}
 assert.equal(f.storage.files.size,1);assert.equal(f.sent.length,0);assert.equal(f.aiRequests.length,0);
});
test('post link validation blocks script URLs and invalid input and saves combined date and link edits atomically',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const {id}=await create(f),before=f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created;
 for(const postUrl of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','//evil.test/post','/local/post','https://','https://user:password@evil.test/post','https://evil.test/line\nbreak','https://evil.test/'+ 'a'.repeat(2048),{},12]){const response=await f.api.PATCH(linkRequest(id,{postUrl,date:'2024-01-01'}));assert.equal(response.status,400,String(postUrl));assert.equal(f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created,before);}
 assert.equal((await f.api.PATCH(linkRequest(id,{}))).status,400);
 const response=await f.api.PATCH(linkRequest(id,{date:'2024-01-02',postUrl:'https://t.me/wariouss/456',owner:'evil',image_key:'evil'}));assert.equal(response.status,200);const item=(await response.json()).item;assert.equal(item.created,Date.parse('2024-01-02T12:00:00Z'));assert.equal(item.postUrl,'https://t.me/wariouss/456');assert.equal(f.sql.prepare('SELECT owner FROM giveaway_feedback WHERE id=?').get(id).owner,'site-777');
 const model=await f.load('lib/feedback/model.ts');assert.equal(model.publicFeedback({...f.sql.prepare('SELECT * FROM giveaway_feedback WHERE id=?').get(id),post_url:'javascript:alert(1)'}).postUrl,null);
});
test('only verified lick0ver can edit post links, including when identity is revoked before the database update',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const {id}=await create(f);
 for(const [user,status] of [[null,401],[{userId:'owner',email:'owner@example.test',displayName:'lick0ver'},403],[f.viewer('ordinary','999'),403]]){f.setUser(user);assert.equal((await f.api.PATCH(linkRequest(id,{postUrl:'https://t.me/test/1'}))).status,status);}
 const user=f.viewer('lick0ver','777');assert.equal((await f.api.PATCH(linkRequest(id,{postUrl:'https://t.me/test/1'},'https://evil.test'))).status,403);
 const prepare=f.db.prepare.bind(f.db);f.db.prepare=query=>{if(query.startsWith('UPDATE giveaway_feedback SET post_url='))f.sql.prepare("UPDATE fishing_accounts SET username='ordinary' WHERE user=?").run(user.userId);return prepare(query);};assert.equal((await f.api.PATCH(linkRequest(id,{postUrl:'https://t.me/test/1'}))).status,403);assert.equal(f.sql.prepare('SELECT post_url FROM giveaway_feedback WHERE id=?').get(id).post_url,null);
});

test('editing a feedback date changes its public date and sort order without replacing or exposing image data',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const first=await create(f),second=await create(f);const before=f.sql.prepare('SELECT * FROM giveaway_feedback WHERE id=?').get(first.id),puts=f.storage.calls.puts;
 const changed=await f.api.PATCH(dateRequest(first.id,'2024-02-29'));assert.equal(changed.status,200);const data=await changed.json();assert.equal(data.item.created,Date.parse('2024-02-29T12:00:00Z'));assert.equal(data.item.url,first.item.url);
 const after=f.sql.prepare('SELECT * FROM giveaway_feedback WHERE id=?').get(first.id);assert.deepEqual({...after,created:before.created},{...before});assert.equal(f.storage.calls.puts,puts);assert.equal(f.storage.calls.deletes,0);
 f.setUser(null);const page=await (await f.api.GET(new Request('https://site.test/api/feedback'))).json();assert.deepEqual(page.items.map(item=>item.id),[second.id,first.id]);assert.equal(page.items[1].created,data.item.created);assert.equal((await f.image.GET(get(first.id))).status,200);
 for(const field of ['owner','image_key','digest'])assert.ok(!Object.hasOwn(data.item,field));
});
test('date editing rejects guests, ordinary viewers, impersonated owner names and cross-origin requests',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const {id}=await create(f),before=f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created;
 for(const [user,status] of [[null,401],[{userId:'owner',email:'owner@example.test',displayName:'lick0ver'},403],[f.viewer('ordinary','999'),403]]){f.setUser(user);assert.equal((await f.api.PATCH(dateRequest(id,'2024-01-02'))).status,status);}
 f.viewer('lick0ver','777');assert.equal((await f.api.PATCH(dateRequest(id,'2024-01-02','https://evil.test'))).status,403);assert.equal(f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created,before);
});
test('date editing validates real calendar days and never revives deleted or missing feedback',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const {id}=await create(f),before=f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created;
 for(const date of ['2025-02-29','2024-02-31','2024-13-01','2024-00-10','1969-12-31','10000-01-01','2024-1-1','2024-01-01T00:00:00Z','',null,{},42])assert.equal((await f.api.PATCH(dateRequest(id,date))).status,400,String(date));
 assert.equal((await f.api.PATCH(new Request('https://site.test/api/feedback?id='+id,{method:'PATCH',headers:{origin:'https://site.test'},body:'{invalid'}))).status,400);assert.equal(f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created,before);
 assert.equal((await f.api.PATCH(dateRequest(crypto.randomUUID(),'2024-01-02'))).status,404);assert.equal((await f.api.PATCH(dateRequest('invalid','2024-01-02'))).status,404);await f.api.DELETE(request(id,'DELETE'));assert.equal((await f.api.PATCH(dateRequest(id,'2024-01-02'))).status,404);assert.equal(f.storage.files.size,0);
});
test('date values remain the same calendar day in Tallinn through winter, summer and DST transitions',async()=>{
 const f=await setup(),model=await f.load('lib/feedback/model.ts');
 for(const date of ['1970-01-01','2024-02-29','2026-03-29','2026-06-20','2026-10-25','2026-12-31','9999-12-31'])assert.equal(model.feedbackDateValue(model.feedbackDateTimestamp(date)),date);
 assert.equal(model.feedbackDateValue(Date.parse('2026-10-19T22:30:00Z')),'2026-10-20');
});
test('revoking the verified identity before the date update atomically blocks the mutation',async()=>{
 const f=await setup(),user=f.viewer('lick0ver','777'),{id}=await create(f),before=f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created,prepare=f.db.prepare.bind(f.db);
 f.db.prepare=query=>{if(query.startsWith('UPDATE giveaway_feedback SET created='))f.sql.prepare("UPDATE fishing_accounts SET username='ordinary' WHERE user=?").run(user.userId);return prepare(query);};
 assert.equal((await f.api.PATCH(dateRequest(id,'2024-01-02'))).status,403);assert.equal(f.sql.prepare('SELECT created FROM giveaway_feedback WHERE id=?').get(id).created,before);
});

test('feedback migration preserves old data and guests see a public gallery without upload permission',async()=>{
 const f=await setup();f.setUser(null);const response=await f.api.GET(new Request('https://site.test/api/feedback'));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const data=await response.json();assert.deepEqual(data.items,[]);assert.equal(data.canUpload,false);assert.equal(data.user,null);assert.equal(data.next,null);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM streamers').get().n,1);
});
test('only verified lick0ver may publish or delete, even a general administrator cannot impersonate the nickname',async()=>{
 const f=await setup(),id=crypto.randomUUID();
 for(const [user,status] of [[null,401],[{userId:'owner',email:'owner@example.test',displayName:'lick0ver'},403],[f.viewer('ordinary','999'),403]]){
  f.setUser(user);assert.equal((await f.api.POST(request(id))).status,status);assert.equal((await f.api.DELETE(request(id,'DELETE'))).status,status);
 }
 assert.equal(f.storage.calls.puts,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM giveaway_feedback').get().n,0);
 f.viewer('LiCk0VeR','777');assert.equal((await (await f.api.GET(new Request('https://site.test/api/feedback'))).json()).canUpload,true);await create(f,id);assert.equal(f.storage.files.size,1);
 assert.equal((await f.api.POST(request(crypto.randomUUID(),'POST',images[0],'image/png','https://evil.test'))).status,403);assert.equal((await f.api.DELETE(request(id,'DELETE',undefined,undefined,'https://evil.test'))).status,403);
});
test('real PNG, JPEG and WebP become public images with exact bytes, dimensions, safe headers and HEAD support',async()=>{
 const f=await setup();f.viewer('lick0ver','777');
 for(const [index,mime] of ['image/png','image/jpeg','image/webp'].entries()){
  const item=await create(f,crypto.randomUUID(),images[index],mime);assert.equal(item.item.width,8);assert.equal(item.item.height,6);assert.deepEqual(Object.keys(item.item).sort(),['created','height','id','postUrl','url','width']);f.setUser(null);
  const response=await f.image.GET(get(item.id));assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.match(response.headers.get('content-security-policy'),/sandbox/);assert.match(response.headers.get('cache-control'),/must-revalidate/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),images[index]);
  const head=await f.image.HEAD(get(item.id));assert.equal(head.status,200);assert.equal(head.body,null);assert.equal(Number(head.headers.get('content-length')),images[index].length);
  const conditional=await f.image.GET(new Request(get(item.id),{headers:{'if-none-match':response.headers.get('etag')}}));assert.equal(conditional.status,304);
  const data=await (await f.api.GET(new Request('https://site.test/api/feedback'))).json();assert.equal(data.canUpload,false);for(const field of ['image_key','digest','owner','email'])assert.ok(!JSON.stringify(data).includes('"'+field+'"'));
  f.viewer('lick0ver','777');
 }
 assert.equal(f.storage.files.size,3);assert.equal(f.sent.length,0);assert.equal(f.aiRequests.length,0);
});
test('invalid formats, mismatched MIME, truncated images and excessive dimensions are rejected before storage',async()=>{
 const f=await setup();f.viewer('lick0ver','777');
 for(const [bytes,mime] of [[Buffer.from('<svg onload="alert(1)"></svg>'),'image/png'],[Buffer.from('<html>no</html>'),'image/jpeg'],[images[0],'image/jpeg'],[images[0],'image/svg+xml'],[images[0].subarray(0,images[0].length-2),'image/png'],[images[1].subarray(0,images[1].length-2),'image/jpeg'],[images[2].subarray(0,images[2].length-2),'image/webp']])assert.equal((await f.api.POST(request(crypto.randomUUID(),'POST',bytes,mime))).status,415);
 const large=Buffer.from(images[0]);large.writeUInt32BE(13000,16);assert.equal((await f.api.POST(request(crypto.randomUUID(),'POST',large))).status,413);assert.equal(f.storage.calls.puts,0);
});
test('actual streamed upload size is enforced with missing or dishonest content-length and cancels the reader',async()=>{
 const f=await setup();f.viewer('lick0ver','777');
 for(const declared of [null,'1',String(11*1024*1024)]){
  let cancelled=false;const stream=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}}),headers={origin:'https://site.test','content-type':'image/png'};if(declared!==null)headers['content-length']=declared;
  const response=await f.api.POST(new Request('https://site.test/api/feedback?id='+crypto.randomUUID(),{method:'POST',headers,body:stream,duplex:'half'}));assert.equal(response.status,413);if(declared!==String(11*1024*1024))assert.equal(cancelled,true);
 }
 assert.equal(f.storage.calls.puts,0);
});
test('retries and concurrent identical uploads create one public image and discard only losing storage objects',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const id=crypto.randomUUID();let release;const hold=new Promise(resolve=>{release=resolve;});let entered=0,ready;const waiting=new Promise(resolve=>{ready=resolve;});f.storage.hold(async()=>{if(++entered===2)ready();await hold;});
 const a=f.api.POST(request(id)),b=f.api.POST(request(id));await waiting;release();const results=await Promise.all([a,b]);assert.deepEqual(results.map(x=>x.status).sort(),[200,201]);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM giveaway_feedback').get().n,1);assert.equal(f.storage.files.size,1);
 const puts=f.storage.calls.puts;const replay=await f.api.POST(request(id));assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true);assert.equal(f.storage.calls.puts,puts);
 assert.equal((await f.api.POST(request(id,'POST',images[1],'image/jpeg'))).status,409);assert.equal(f.storage.files.size,1);
});
test('revoking Twitch identity during a pending upload cannot publish and cleans up the orphan file',async()=>{
 const f=await setup(),user=f.viewer('lick0ver','777');f.storage.hold(async()=>{f.sql.prepare("UPDATE fishing_accounts SET username='ordinary' WHERE user=?").run(user.userId);});
 assert.equal((await f.api.POST(request(crypto.randomUUID()))).status,403);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM giveaway_feedback').get().n,0);assert.equal(f.storage.files.size,0);
});
test('failed database publication never exposes a partial upload and removes its stored image',async()=>{
 const f=await setup();f.viewer('lick0ver','777');f.sql.exec("CREATE TRIGGER fail_feedback BEFORE INSERT ON giveaway_feedback BEGIN SELECT RAISE(ABORT,'Unavailable'); END;");assert.equal((await f.api.POST(request(crypto.randomUUID()))).status,503);assert.equal(f.storage.files.size,0);f.setUser(null);assert.equal((await (await f.api.GET(new Request('https://site.test/api/feedback'))).json()).items.length,0);
});
test('owner deletion hides feedback immediately, retries clean storage and the old upload ID cannot resurrect it',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const {id}=await create(f),etag=(await f.image.HEAD(get(id))).headers.get('etag');f.storage.failDelete(true);assert.equal((await f.api.DELETE(request(id,'DELETE'))).status,503);
 f.setUser(null);assert.equal((await f.image.GET(new Request(get(id),{headers:{'if-none-match':etag}}))).status,404);assert.equal((await (await f.api.GET(new Request('https://site.test/api/feedback'))).json()).items.length,0);assert.equal(f.storage.files.size,1);
 f.viewer('lick0ver','777');f.storage.failDelete(false);assert.equal((await f.api.DELETE(request(id,'DELETE'))).status,200);assert.equal((await f.api.DELETE(request(id,'DELETE'))).status,200);assert.equal(f.storage.files.size,0);assert.equal((await f.api.POST(request(id))).status,410);
});
test('feedback pagination is stable when images share a timestamp and rejects invalid cursors',async()=>{
 const f=await setup();for(let i=0;i<27;i++)f.sql.prepare("INSERT INTO giveaway_feedback(id,owner,image_key,mime,bytes,width,height,digest,created) VALUES(?,'owner',?,'image/png',1,8,6,'digest',?)").run(crypto.randomUUID(),'test-'+i,f.clock.now);
 f.setUser(null);const first=await (await f.api.GET(new Request('https://site.test/api/feedback'))).json();assert.equal(first.items.length,24);assert.ok(first.next);
 const second=await (await f.api.GET(new Request('https://site.test/api/feedback?after='+first.next.at+'&afterId='+first.next.id))).json();assert.equal(second.items.length,3);assert.equal(second.next,null);assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,27);
 for(const query of ['after=-1&afterId='+crypto.randomUUID(),'after=NaN','after=100&afterId=wrong'])assert.equal((await f.api.GET(new Request('https://site.test/api/feedback?'+query))).status,400);
 assert.equal((await f.image.GET(get('invalid'))).status,404);assert.equal((await f.image.GET(get(crypto.randomUUID()))).status,404);
});
test('verified Twitch linking returns the owner to feedback without requesting chat write permissions',async()=>{
 const f=await setup();f.viewer('lick0ver','777');const connect=await f.load('app/api/twitch/connect/route.ts'),response=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=player&return_to=/feedback'));assert.equal(response.status,302);const target=new URL(response.headers.get('location'));assert.equal(target.searchParams.get('scope'),'openid');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/feedback');
 const callback=await f.load('app/api/twitch/callback/route.ts'),result=await callback.GET(new Request('https://site.test/api/twitch/callback?state='+target.searchParams.get('state')+'&code=test-code'));assert.match(result.headers.get('location'),/\/feedback\?twitch=player-connected$/);
});
