import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-twitch-bot.mjs';
import './test-levels.mjs';
const url='https://site.test/api/levels/profile?channel=owner_channel';
const settings={revision:0,favorites:['clove','jett'],avatarId:'twitch',bannerId:'default'};
const request=(body=settings,origin='https://site.test')=>new Request(url,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
async function setup(){const f=await fixture();f.viewer('alice','777');return {...f,api:await f.load('app/api/levels/profile/route.ts')};}
function review(f,{twitchId='777',rank='gold-2',verified=false,status='queued',created=f.clock.now,owner='site-777'}={}){f.sql.prepare('INSERT INTO demo_reviews(id,owner,request_id,twitch_id,twitch_name,riot_id,rank,rank_verified_at,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),owner,crypto.randomUUID(),twitchId,'alice','Alice#EUW',rank,verified?created:null,status,created,created);}
test('a profile uses the linked Twitch avatar and persists favorite agents across site sessions',async()=>{
 const f=await setup();const first=await f.api.GET(new Request(url));assert.equal(first.status,200);const before=await first.json();assert.equal(before.profile.id,'777');assert.equal(before.canEdit,true);assert.match(before.profile.avatar,/777.png$/);assert.equal(before.profile.progress.level,1);
 const saved=await f.api.POST(request());assert.equal(saved.status,200);assert.deepEqual((await saved.json()).profile.favorites,['clove','jett']);
 f.setUser(null);const data=await (await f.api.GET(new Request(url+'&id=777'))).json();assert.equal(data.canEdit,false);assert.equal(data.profile.revision,1);assert.deepEqual(data.profile.favorites,['clove','jett']);assert.ok(!JSON.stringify(data).includes('example.test'));
});
test('profile image uploads and arbitrary image URLs are rejected for every viewer',async()=>{
 const f=await setup();const multipart=new Request(url,{method:'POST',headers:{origin:'https://site.test','Content-Type':'multipart/form-data; boundary=test'},body:'--test--'});assert.equal((await f.api.POST(multipart)).status,415);
 for(const extra of [{avatarId:'https://example.test/photo.png'},{bannerId:'../../not-approved'},{avatar:'data:image/svg+xml,<svg/>'},{banner:'https://example.test/image.webp'}])assert.equal((await f.api.POST(request({...settings,...extra}))).status,400);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_profiles').get().n,0);
});
test('only artwork IDs in the owner catalogue can be saved and selecting Twitch resets the avatar',async()=>{
 const f=await setup(),catalog=await f.load('lib/levels/profile-catalog.ts');catalog.PROFILE_AVATARS.push({id:'owner-approved-avatar',name:'Owner selection',image:'/profiles/approved-avatar.webp'});catalog.PROFILE_BANNERS.push({id:'owner-approved-banner',name:'Owner selection',image:'/profiles/approved-banner.webp'});
 const saved=await f.api.POST(request({...settings,avatarId:'owner-approved-avatar',bannerId:'owner-approved-banner'}));assert.equal(saved.status,200);const data=await saved.json();assert.equal(data.profile.avatar,'/profiles/approved-avatar.webp');assert.equal(data.profile.banner,'/profiles/approved-banner.webp');
 const reset=await f.api.POST(request({...settings,revision:1}));assert.equal(reset.status,200);const next=await reset.json();assert.equal(next.profile.avatarId,'twitch');assert.equal(next.profile.banner,null);
});
test('profile writes enforce identity, origin and the whitelist without changing another viewer',async()=>{
 const f=await setup();assert.equal((await f.api.POST(request(settings,'https://other.test'))).status,403);assert.equal((await f.api.POST(request({...settings,id:'123'}))).status,400);assert.equal((await f.api.POST(request({...settings,xp:9999,rank:'radiant'}))).status,400);
 f.setUser(null);assert.equal((await f.api.POST(request())).status,401);
 f.setUser({userId:'unlinked',email:'other@example.test',displayName:'alice'});assert.equal((await f.api.POST(request())).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_profiles').get().n,0);
});
test('favorite agents are bounded, unique and drawn from the real roster',async()=>{
 const f=await setup();for(const favorites of [['clove','jett','reyna','miks'],['clove','clove'],['unknown'],['https://example.test'],null,'clove'])assert.equal((await f.api.POST(request({...settings,favorites}))).status,400);
 assert.equal((await f.api.POST(request({...settings,favorites:['miks','veto','waylay']}))).status,200);
});
test('simultaneous profile edits use revisions and never overwrite a newer save',async()=>{
 const f=await setup();assert.equal((await f.api.POST(request())).status,200);const results=await Promise.all([f.api.POST(request({...settings,revision:1,favorites:['reyna']})),f.api.POST(request({...settings,revision:1,favorites:['omen']}))]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT revision FROM level_profiles').get().revision,2);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM level_profiles').get().n,1);
});
test('rank follows public demo forms for the exact Twitch identity and distinguishes verification',async()=>{
 const f=await setup();review(f,{twitchId:'999',rank:'radiant',verified:true});review(f,{rank:'diamond-2',verified:true});
 let data=await (await f.api.GET(new Request(url))).json();assert.equal(data.profile.rank.id,'diamond-2');assert.equal(data.profile.rank.verified,true);assert.equal(data.profile.rank.riotId,'Alice#EUW');
 review(f,{rank:'ascendant-1',created:f.clock.now+1000});data=await (await f.api.GET(new Request(url))).json();assert.equal(data.profile.rank.id,'ascendant-1');assert.equal(data.profile.rank.verified,false);assert.ok(!JSON.stringify(data).includes('rank_verified_by'));
});
test('deleted forms and unpublished uploads cannot leak a Valorant rank into public profiles',async()=>{
 const f=await setup();for(const status of ['uploading','validating','deleted'])review(f,{rank:'radiant',verified:true,status});const data=await (await f.api.GET(new Request(url))).json();assert.equal(data.profile.rank,null);
 review(f,{rank:'silver-1',status:'reviewed'});const next=await (await f.api.GET(new Request(url))).json();assert.equal(next.profile.rank.id,'silver-1');
});
test('profile progression stays per channel and cannot be edited through profile settings',async()=>{
 const f=await setup();f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('owner_channel','777','alice','Alice',300,2250)").run();f.sql.prepare("INSERT INTO level_players(channel,user_id,login,name,xp,messages) VALUES('friend_channel','777','alice','Alice',15,19)").run();
 const own=await (await f.api.GET(new Request(url))).json();assert.equal(own.profile.progress.level,2);assert.equal(own.profile.progress.xp,2250);assert.equal(own.profile.messages,2250);const friend=await (await f.api.GET(new Request('https://site.test/api/levels/profile?channel=friend_channel'))).json();assert.equal(friend.profile.progress.level,1);assert.equal(friend.profile.progress.xp,19);
 assert.equal((await f.api.POST(request({...settings,progress:{xp:9999}}))).status,400);assert.equal(f.sql.prepare("SELECT xp FROM level_players WHERE channel='owner_channel'").get().xp,300);
});
test('unknown public profiles and malformed identifiers are rejected without Twitch lookups',async()=>{
 const f=await setup();f.setUser(null);for(const id of ['999','<script>','../../owner']){const response=await f.api.GET(new Request(url+'&id='+encodeURIComponent(id)));assert.equal(response.status,404);}assert.equal(f.tokenRequests.length,0);
});
test('linking Twitch from a profile returns to that tab and preserves verified identity',async()=>{
 const f=await setup(),connect=await f.load('app/api/twitch/connect/route.ts');const response=await connect.GET(new Request('https://site.test/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:'/levels?tab=profile'})));assert.equal(response.status,302);const authorization=new URL(response.headers.get('location'));assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/levels?tab=profile');
 const callback=await f.load('app/api/twitch/callback/route.ts'),done=await callback.GET(new Request('https://site.test/api/twitch/callback?'+new URLSearchParams({state:authorization.searchParams.get('state'),code:'test-code'})));const target=new URL(done.headers.get('location'));assert.equal(target.pathname,'/levels');assert.equal(target.searchParams.get('tab'),'profile');assert.equal(target.searchParams.get('twitch'),'player-connected');
});
