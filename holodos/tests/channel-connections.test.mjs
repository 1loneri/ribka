import {DatabaseSync} from 'node:sqlite';import assert from 'node:assert/strict';import {createChannelConnections,channelFeatures} from '../src/channel-connections.js';
const db=new DatabaseSync(':memory:'),states=new Map();let identity={client_id:'app',login:'war1ouss',user_id:'123',scopes:[]},calls=[],httpStatus=200,refreshes=0,tokenSerial=0;
const encrypt=s=>'encrypted:'+Buffer.from(s).toString('base64'),decrypt=s=>Buffer.from(s.slice(10),'base64').toString();
const c=createChannelConnections({db,states,app:()=>({id:'app'}),channel:'war1ouss',publicUrl:'https://example.test',encrypt,decrypt,validate:async()=>identity,tokenRequest:async args=>{if(args.grant_type==='refresh_token')refreshes++;return{access_token:'access-secret-'+(++tokenSerial),refresh_token:'refresh-secret-'+tokenSerial,expires_in:3600}},fetcher:async(url)=>{calls.push(String(url));const status=httpStatus;httpStatus=200;return{status,ok:status===200,json:async()=>({data:[]})}}});
assert.equal(c.list().length,3);assert.throws(()=>c.begin('bad'),{status:400});
function flow(id){const r=c.begin(id),u=new URL(r.url),state=u.searchParams.get('state');return {r,record:states.get(state),url:new URL('https://example.test/oauth/callback?code=test&state='+state),req:{headers:{cookie:r.cookie.split(';')[0]}}};}
const denied=flow('vips');await assert.rejects(()=>c.callback({headers:{}},denied.url,denied.record),{status:403});identity.scopes=['channel:read:vips'];identity.login='other';await assert.rejects(()=>c.callback(denied.req,denied.url,denied.record),{status:403});assert.equal(db.prepare('SELECT count(*) n FROM channel_connections').get().n,0);identity.login='war1ouss';identity.scopes=[];await assert.rejects(()=>c.callback(denied.req,denied.url,denied.record),{status:403});
for(const [id,f] of Object.entries(channelFeatures)){const x=flow(id);assert.equal(new URL(x.r.url).searchParams.get('scope'),f.scope);identity.scopes=[f.scope];assert.equal((await c.callback(x.req,x.url,x.record)).ok,true);assert.equal(c.list().find(r=>r.id===id).status,'ready');assert.ok(!JSON.stringify(c.list()).includes('access-secret'));assert.ok(!db.prepare('SELECT access FROM channel_connections WHERE feature=?').get(id).access.includes('access-secret'));}
assert.ok(calls.some(x=>x.includes('/subscriptions?broadcaster_id=123')));assert.ok(calls.some(x=>x.includes('/channels/vips?broadcaster_id=123')));assert.ok(calls.some(x=>x.includes('/channel_points/custom_rewards?broadcaster_id=123')));
identity.scopes=['channel:read:vips'];httpStatus=401;assert.equal((await c.check('vips')).ok,true);assert.equal(refreshes,1);httpStatus=403;assert.equal((await c.check('vips')).ok,false);assert.equal(c.list().find(r=>r.id==='vips').status,'error');c.disconnect('vips');assert.equal(c.list().find(r=>r.id==='vips').status,'disconnected');await assert.rejects(()=>c.check('vips'),{status:409});
const expired=flow('points');expired.record.until=Date.now()-1;await assert.rejects(()=>c.callback(expired.req,expired.url,expired.record),{status:403});console.log('PASS: feature scopes, OAuth cookie binding, expiry, owner identity, missing permissions, encrypted storage, safe status output, API probes, 401 refresh, error/disconnect states');

// A unified flow asks for exactly the three existing permissions and saves atomically.
const combined=flow('all');const scopes=Object.values(channelFeatures).map(f=>f.scope);
assert.deepEqual(new URL(combined.r.url).searchParams.get('scope').split(' '),scopes);
identity.scopes=scopes.slice(0,2);const before=db.prepare('SELECT * FROM channel_connections ORDER BY feature').all();
await assert.rejects(()=>c.callback(combined.req,combined.url,combined.record),{status:403});
assert.deepEqual(db.prepare('SELECT * FROM channel_connections ORDER BY feature').all(),before);
identity.scopes=scopes;assert.equal((await c.callback(combined.req,combined.url,combined.record)).ok,true);
assert.ok(c.list().every(r=>r.status==='ready'));
const n=refreshes;db.prepare('UPDATE channel_connections SET expires_at=0').run();
assert.equal((await c.check('all')).ok,true);assert.equal(refreshes,n+1);
assert.equal(new Set(db.prepare('SELECT refresh FROM channel_connections').all().map(r=>decrypt(r.refresh))).size,1);
c.disconnect('all');assert.ok(c.list().every(r=>r.status==='disconnected'));
console.log('PASS: unified permissions, atomic rejection, shared token refresh, combined check and disconnect');
// A completed POST renders a new document before leaving the origin, avoiding
// form-action redirect blocking while retaining the nonce cookie and strict CSP.
const {readFileSync}=await import('node:fs');const vm=await import('node:vm');
const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const branch=mainSource.match(/if\(url.pathname==='\/channel-connect'\)\{([\s\S]*?)\}if\(url.pathname==='\/channel-check'/);assert.ok(branch);
let rendered;const testFlow={url:'https://id.twitch.tv/oauth2/authorize?client_id=test&scope=channel%3Aread%3Avips&state=fixture',cookie:'war_channel_oauth=fixture; Path=/oauth/callback; HttpOnly; Secure; SameSite=Lax'};
vm.runInNewContext('(function(){'+branch[1]+'})();',{id:'all',channel:'war1ouss',channelConnections:{begin:()=>testFlow},escape:s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;'),html:(status,body,headers)=>{rendered={status,body,headers}}});
assert.equal(rendered.status,200);assert.match(rendered.body,/http-equiv="refresh"/);assert.match(rendered.body,/&amp;scope=/);assert.match(rendered.body,/Перейти в Twitch/);assert.equal(rendered.headers['Set-Cookie'],testFlow.cookie);
assert.ok(mainSource.includes("form-action 'self'; base-uri 'none'"));console.log('PASS: OAuth document transition, fallback link, escaped URL, nonce cookie and unchanged form CSP');
