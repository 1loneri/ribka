import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {SourceTextModule,SyntheticModule,createContext} from 'node:vm';
import ts from 'typescript';

// Exercise production SQL and the Twitch delivery helper, with no network access.
export async function fixture({realtime=false,randomValues=[],admin=false,bucket,openAi,avatarImage}={}) {
  const sql=new DatabaseSync(':memory:');
  for(const name of (await readdir('drizzle')).filter(name=>name.endsWith('.sql')).sort())sql.exec(await readFile(resolve('drizzle',name),'utf8'));
  const clock={now:1800000000000},sent=[],connectionUsers=[],tokenRequests=[],background=[],sendTimes=[],delays=[],subscriptions=[],sockets=[],aiRequests=[];
  let streamLive=true,streamError=false,streamId=null,catBlockedTerms=[],moderationUnavailable=false;
  let user={userId:'owner',email:'owner@example.test',displayName:'Owner'},delivery='sent',chatRevoked=false,claims={client_id:'test-client',user_id:'456',login:'viewer',scopes:['openid']};
  class Clock extends Date {static now(){return clock.now;}}
  const db={prepare(query){const statement=sql.prepare(query);const bound=args=>({
    async first(){return statement.get(...args)??null;},
    async all(){return {results:statement.all(...args)};},
    async run(){return this.runSync();},
    runSync(){return {meta:{changes:Number(statement.run(...args).changes)}};},
  });return {...bound([]),bind(...args){return bound(args);}};},async batch(statements){sql.exec('BEGIN');try{const results=statements.map(statement=>statement.runSync());sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
  const connection={user:'owner',email:'owner@example.test',channel:'owner_channel',broadcaster:'123',token:'test-token',permissions:['user:read:chat','user:write:chat']};
  let botConnection=connection;
  class Socket extends EventTarget{constructor(){super();sockets.push(this);queueMicrotask(()=>this.packet({metadata:{message_type:'session_welcome'},payload:{session:{id:'test-session'}}}));}packet(value){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(value)}));}close(){this.dispatchEvent(new Event('close'));}}
  const context=createContext({Date:Clock,crypto:{randomUUID:()=>crypto.randomUUID(),subtle:crypto.subtle,getRandomValues(array){if(randomValues.length){array[0]=randomValues.shift();return array;}return crypto.getRandomValues(array);}},structuredClone,Headers,Response,Request,URL,URLSearchParams,TextEncoder,btoa,AbortSignal,AbortController,ReadableStream,WebSocket:Socket,console,setInterval,clearInterval,clearTimeout,
    setTimeout(callback,delay){if(realtime)return setTimeout(callback,delay);delays.push(delay);const at=clock.now+delay;return setTimeout(()=>{clock.now=Math.max(clock.now,at);callback();},0);},
    fetch:async(url,options)=>{
      if(typeof url==='string'&&url.startsWith('https://static-cdn.jtvnw.net/jtv_user_pictures/')){assert.ok(avatarImage,'Unexpected avatar asset request');return new Response(avatarImage,{headers:{'Content-Type':'image/png'}});}
      if(url==='https://api.openai.com/v1/responses'){
        assert.ok(openAi,'Unexpected OpenAI request');assert.equal(options.headers.Authorization,'Bearer test-ai-secret');
        const body=JSON.parse(options.body);aiRequests.push(body);
        if(openAi.respond)return openAi.respond(body);
        return Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:openAi.text??'шуточный прогноз: завтра заберёшь красивую катку и вкусный перекус 😎'}]}]});
      }
      if(url==='https://id.twitch.tv/oauth2/validate')return Response.json(claims);
      if(url.startsWith('https://api.twitch.tv/helix/users?id=')){const id=new URL(url).searchParams.get('id'),row=sql.prepare('SELECT username FROM fishing_accounts WHERE twitch_id=?').get(id);return Response.json({data:[{id,login:row?.username??'viewer',profile_image_url:'https://static-cdn.jtvnw.net/jtv_user_pictures/'+id+'.png'}]});}
      if(url==='https://api.twitch.tv/helix/users?login=friend_channel')return Response.json({data:[{id:'999',login:'friend_channel',display_name:'Friend'}]});
      if(url==='https://api.twitch.tv/helix/users?login=owner_channel')return Response.json({data:[{id:'123',login:'owner_channel',display_name:'Owner'}]});
      if(url.startsWith('https://api.twitch.tv/helix/chat/settings?'))return Response.json({data:[{}]});
      assert.equal(url,'https://api.twitch.tv/helix/chat/messages');
      sent.push(JSON.parse(options.body));
      sendTimes.push(clock.now);
      if(delivery==='uncertain')throw Error('Timed out');
      return Response.json({data:[{message_id:'sent-'+sent.length,is_sent:delivery==='sent',drop_reason:delivery==='sent'?null:{code:'automod_held'}}]});
    }});
  const modules=new Map();
  const synthetic=(id,exports)=>new SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context,identifier:id});
  modules.set('cloudflare:workers',synthetic('cloudflare:workers',{env:{DB:db,BUCKET:bucket,TWITCH_CLIENT_ID:'test-client',SITE_ADMIN_EMAIL:admin?'owner@example.test':'',...(openAi?{OPENAI_API_KEY:'test-ai-secret',OPENAI_MODEL:openAi.model??'gpt-6-luna'}:{})},waitUntil:promise=>background.push(promise)}));
  modules.set(resolve('app/chatgpt-auth.ts'),synthetic('auth',{getChatGPTUser:async()=>user,chatGPTSignInPath:path=>'/signin-with-chatgpt?return_to='+encodeURIComponent(path)}));
  modules.set(resolve('lib/twitch-api.ts'),synthetic('twitch-api',{
    getConnection:async id=>{connectionUsers.push(id);assert.equal(id,'owner');return connection;},
    getBotConnection:async id=>{connectionUsers.push(id);assert.equal(id,botConnection.user);return botConnection;},
    getChatConnection:async id=>{connectionUsers.push(id);if(chatRevoked)throw Error('Revoked');const row=sql.prepare('SELECT * FROM twitch_chat_connections WHERE user=?').get(id);assert.ok(row);return {...row,token:'personal-test-token',permissions:JSON.parse(row.scopes)};},
    helix:async(c,path,options)=>{
      if(path.startsWith('moderation/blocked_terms?')){if(moderationUnavailable)throw Error('Moderation unavailable');return Response.json({data:catBlockedTerms,pagination:{}});}
      if(path.startsWith('streams?user_login=')){if(streamError)throw Error('Twitch unavailable');const channel=new URLSearchParams(path.split('?')[1]).get('user_login');return Response.json({data:streamLive?[{id:streamId??'stream-'+channel,user_login:channel,type:'live',started_at:new Date(clock.now-3600000).toISOString()}]:[]});}
      if(path==='users?login=friend_channel')return Response.json({data:[{id:'999',login:'friend_channel',display_name:'Friend'}]});
      if(path.startsWith('users?id=')){const ids=new URLSearchParams(path.slice(6)).getAll('id');return Response.json({data:ids.map(id=>({id,profile_image_url:'https://static-cdn.jtvnw.net/jtv_user_pictures/'+id+'.png'}))});}
      if(path==='eventsub/subscriptions'){subscriptions.push(JSON.parse(options.body));return Response.json({data:[{id:'subscription-'+subscriptions.length}]});}
      throw Error('Unexpected Twitch operation: '+path);
    },rewardEnabled:async()=>{throw Error('Unexpected reward operation');},
    TWITCH_ORIGIN:'https://site.test',REDIRECT_URI:'https://site.test/api/twitch/callback',
    stateHash:async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join(''),
    tokenRequest:async value=>{tokenRequests.push(value);return {access_token:'viewer-token',refresh_token:'viewer-refresh',expires_in:3600};},
  }));
  modules.set(resolve('lib/twitch-secrets.ts'),synthetic('secrets',{getTwitchSecret:async()=>'test-secret',encryptSecret:async value=>'encrypted:'+value}));
  const pendingModules=new Map();
  function module(path){
    if(pendingModules.has(path))return pendingModules.get(path);
    const pending=buildModule(path);pendingModules.set(path,pending);return pending;
  }
  async function buildModule(path){
    if(modules.has(path))return modules.get(path);
    let value;
    if(path.endsWith('.json'))value=synthetic(path,{default:JSON.parse(await readFile(path,'utf8'))});
    else value=new SourceTextModule(ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,{context,identifier:path});
    modules.set(path,value);
    if(value instanceof SourceTextModule)await value.link(async(specifier,parent)=>{
      if(specifier==='cloudflare:workers')return modules.get(specifier);
      const target=resolve(dirname(parent.identifier),specifier);
      return module(/\.(ts|json)$/.test(target)?target:target+'.ts');
    });
    return value;
  }
  async function load(path){const value=await module(resolve(path));if(value.status!=='evaluated')await value.evaluate();return value.namespace;}
  sql.prepare('INSERT INTO streamers (email,channel,name) VALUES (?,?,?)').run(user.email,connection.channel,'Owner');
  sql.prepare('INSERT INTO twitch_connections (user,email,broadcaster,channel,access,refresh,expires,scopes) VALUES (?,?,?,?,?,?,?,?)').run(user.userId,user.email,'123',connection.channel,'unused','unused',clock.now+3600000,JSON.stringify(connection.permissions));
  sql.prepare('INSERT INTO twitch_bot_settings (channel,owner) VALUES (?,?)').run(connection.channel,user.userId);
  sql.prepare('INSERT INTO fishing_games (channel,owner,host,enabled,next_event,collector_token,collector_until) VALUES (?,?,?,1,?,?,?)').run(connection.channel,user.userId,'Owner',clock.now+3600000,'lease',clock.now+3600000);
  function queue(id,{expires=clock.now+45000,ready=clock.now,kind='fish'}={}){sql.prepare('INSERT INTO twitch_bot_messages (id,channel,kind,text,created,ready_at,expires) VALUES (?,?,?,?,?,?,?)').run(id,connection.channel,kind,'@viewer · Result',clock.now,ready,expires);}
  return {linkFishingOwner(){sql.prepare('INSERT INTO fishing_accounts (user,twitch_id,username,linked_at) VALUES (?,?,?,?) ON CONFLICT(user) DO UPDATE SET twitch_id=excluded.twitch_id,username=excluded.username').run(user.userId,'888','lick0ver',clock.now);},setCatBlockedTerms(value){catBlockedTerms=value;},setModerationUnavailable(value){moderationUnavailable=value;},setStreamLive(value){streamLive=value;},setStreamId(value){streamId=value;},setStreamError(value){streamError=value;},aiRequests,sql,clock,sent,sendTimes,delays,connection,subscriptions,sockets,connectionUsers,tokenRequests,load,queue,db,drainBackground:()=>Promise.all(background),setChatRevoked(value){chatRevoked=value;},setBotConnection(value){botConnection=value;},setUser(value){user=value;},setClaims(value){claims=value;},setDelivery(value){delivery=value;},enable(){sql.exec('UPDATE twitch_bot_settings SET enabled=1');},
    viewer(name='viewer',id='456'){user={userId:'site-'+id,email:name+'@example.test',displayName:name};sql.prepare('INSERT INTO fishing_accounts (user,twitch_id,username,linked_at) VALUES (?,?,?,?) ON CONFLICT(user) DO UPDATE SET twitch_id=excluded.twitch_id,username=excluded.username').run(user.userId,id,name,clock.now);return user;},
  };
}

test('private fishing access requires the verified lick0ver account, not names or general administrator rights',async()=>{
 const f=await fixture({admin:true}),access=await f.load('lib/fishing/access.ts'),roles=await f.load('lib/streamer-auth.ts');
 const owner={userId:'owner',email:'owner@example.test',displayName:'lick0ver'};
 assert.equal((await roles.getRole(owner)).admin,true);assert.equal(await access.hasFishingAccess(owner),false);assert.equal(await access.hasFishingAccess(null),false);
 f.sql.prepare("UPDATE streamers SET channel='lick0ver',name='lick0ver'").run();assert.equal(await access.hasFishingAccess(owner),false);
 const verified=f.viewer('LiCk0vEr','888');assert.equal(await access.hasFishingAccess(verified),true);
 f.sql.prepare("UPDATE fishing_accounts SET username='ordinary' WHERE user=?").run(verified.userId);assert.equal(await access.hasFishingAccess(verified),false);
 f.sql.prepare("UPDATE twitch_connections SET channel='lick0ver' WHERE user='owner'").run();assert.equal(await access.hasFishingAccess(owner),true);
 f.setUser(owner);f.viewer('ordinary','888');f.sql.prepare('INSERT INTO fishing_accounts(user,twitch_id,username,linked_at) VALUES(?,?,?,?)').run('owner','999','ordinary',f.clock.now);
 assert.equal(await access.hasFishingAccess(owner),false); // A newer verified account replaces the old identity.
});

test('all website fishing endpoints reject guests, ordinary users, streamers and general admins without changing the game',async()=>{
 const f=await fixture({admin:true});
 const endpoints=[
  ['app/api/fishing/route.ts','GET','/api/fishing?channel=owner_channel&user=lick0ver'],
  ['app/api/fishing/route.ts','POST','/api/fishing',{action:'disable',channel:'owner_channel'}],
  ['app/api/fishing/cast/route.ts','POST','/api/fishing/cast',{channel:'owner_channel',requestId:crypto.randomUUID(),username:'lick0ver'}],
  ['app/api/fishing/action/route.ts','POST','/api/fishing/action',{channel:'owner_channel',requestId:crypto.randomUUID(),command:'!приют',username:'lick0ver'}],
  ['app/api/fishing/event/route.ts','POST','/api/fishing/event',{channel:'owner_channel',requestId:crypto.randomUUID()}],
  ['app/api/fishing/live/route.ts','GET','/api/fishing/live'],
  ['app/api/twitch/feed/live/route.ts','GET','/api/twitch/feed/live?channel=owner_channel&fish=1'],
 ];
 const initial=JSON.stringify(f.sql.prepare('SELECT * FROM fishing_games').all());
 const ordinary=f.viewer('ordinary','999');
 for(const user of [null,{userId:'unlinked',email:'lick0ver@example.test',displayName:'lick0ver'},ordinary,{userId:'owner',email:'owner@example.test',displayName:'lick0ver'}]){
  f.setUser(user);
  for(const [file,method,path,body] of endpoints){
   const route=await f.load(file),request=new Request('https://site.test'+path,{method,headers:{origin:'https://site.test','Content-Type':'application/json','x-twitch-login':'lick0ver'},...(body?{body:JSON.stringify(body)}:{})});
   const response=await route[method](request);assert.equal(response.status,user?403:401,file+' '+method);
   const text=await response.text();assert.ok(!text.includes('collector_token'));assert.ok(!text.includes('inventory'));
  }
 }
 assert.equal(JSON.stringify(f.sql.prepare('SELECT * FROM fishing_games').all()),initial);
 for(const table of ['fishing_players','fishing_log','fishing_hazards','chat_channels','chat_messages','twitch_bot_messages'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,0,table);
 assert.equal(f.sent.length,0);assert.equal(f.connectionUsers.length,0);assert.equal(f.subscriptions.length,0);assert.equal(f.sockets.length,0);
});

test('lick0ver retains website controls and losing their verified identity immediately closes HTTP access',async()=>{
 const f=await fixture();f.linkFishingOwner();
 const game=await f.load('app/api/fishing/route.ts'),cast=await f.load('app/api/fishing/cast/route.ts'),action=await f.load('app/api/fishing/action/route.ts'),event=await f.load('app/api/fishing/event/route.ts'),live=await f.load('app/api/fishing/live/route.ts');
 const request=(path,body)=>new Request('https://site.test'+path,{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({channel:'owner_channel',requestId:crypto.randomUUID(),...body})});
 const get=()=>new Request('https://site.test/api/fishing?channel=owner_channel');
 const snapshot=await game.GET(get());assert.equal(snapshot.status,200);assert.equal(snapshot.headers.get('Cache-Control'),'no-store');const data=await snapshot.json();assert.equal(data.me.username,'lick0ver');assert.equal(data.canManage,true);
 assert.equal((await game.POST(request('/api/fishing',{action:'disable'}))).status,200);assert.equal((await game.POST(request('/api/fishing',{action:'enable'}))).status,200);
 assert.equal((await cast.POST(request('/api/fishing/cast',{}))).status,200);assert.equal((await action.POST(request('/api/fishing/action',{command:'!приют'}))).status,200);
 assert.equal((await event.POST(request('/api/fishing/event',{}))).status,200);
 assert.equal((await live.GET(new Request('https://site.test/api/fishing/live'))).status,409); // Existing collector, after successful authorization.
 const before=JSON.stringify(f.sql.prepare('SELECT state,rev FROM fishing_players').all());
 f.sql.prepare("UPDATE fishing_accounts SET username='other' WHERE user='owner'").run();
 assert.equal((await game.GET(get())).status,403);assert.equal((await cast.POST(request('/api/fishing/cast',{}))).status,403);assert.equal((await action.POST(request('/api/fishing/action',{command:'!кот'}))).status,403);
 assert.equal(JSON.stringify(f.sql.prepare('SELECT state,rev FROM fishing_players').all()),before);
});

test('hiding website fishing leaves public giveaways and Twitch chat readable',async()=>{
 const f=await fixture(),giveaways=await f.load('app/api/giveaways/route.ts'),feed=await f.load('app/api/twitch/feed/route.ts'),fishing=await f.load('app/api/fishing/route.ts');
 for(const user of [null,f.viewer('ordinary','999')]){
  f.setUser(user);assert.equal((await giveaways.GET(new Request('https://site.test/api/giveaways'))).status,200);
  assert.equal((await feed.GET(new Request('https://site.test/api/twitch/feed?channel=owner_channel'))).status,200);
  const denied=await fishing.GET(new Request('https://site.test/api/fishing?channel=owner_channel'));assert.equal(denied.status,user?403:401);assert.equal(denied.headers.get('Cache-Control'),'no-store');
 }
});

async function seedPatrolFisher(f,name='patrolfan',{coins=200,count=14}={}){
 const game=await f.load('lib/fishing/game.ts'),p=game.newPlayer();
 p.coins=coins;p.catches=count;p.inventory.lake_carp=count;p.lastCatch=f.clock.now-20000;
 // Keep legacy warning flags in stored profiles to verify they are ignored.
 p.patrol={recentCasts:Array.from({length:count},(_,i)=>f.clock.now-(count-i)*20000),limit:15,warned:count>=12,lastFineAt:0};
 f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,?,?,0)').run('owner_channel',name,JSON.stringify(p),coins,count);
 return p;
}

async function seedLicensedFisher(f,name='licensefan',{coins=200}={}){
 const game=await f.load('lib/fishing/game.ts'),p=game.newPlayer();p.coins=coins;p.lastCatch=f.clock.now-20000;p.license={until:f.clock.now-1,tier:1,trial:false};
 f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,?,0,0)').run('owner_channel',name,JSON.stringify(p),coins);
 return p;
}

test('a first cast starts forty-eight free hours and renewal charges exactly at expiry',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),license=await f.load('lib/fishing/license.ts'),initial=game.newPlayer();initial.coins=100;
 const first=game.play(initial,'!рыба',f.clock.now,null,()=>0);assert.ok(first.item);assert.equal(first.state.coins,102);assert.equal(initial.license,undefined);assert.equal(first.state.license.trial,true);assert.equal(first.state.license.until,f.clock.now+48*3600000);assert.match(first.message,/48 ч.*бесплатно/);
 const before=first.state.coins,until=first.state.license.until;assert.equal(license.ensureFishingLicense(first.state,until-1).ok,true);assert.equal(first.state.coins,before);
 const renewed=game.play(first.state,'!fish',until,null,()=>0);assert.ok(renewed.item);assert.equal(renewed.state.coins,before-50+renewed.item.value);assert.equal(renewed.state.license.trial,false);assert.equal(renewed.state.license.until,until+license.LICENSE_DURATION);assert.match(renewed.message,/Лицензия продлена: −50 монет/);
 const blocked=game.play(renewed.state,'!рыба',until+1,null,()=>0);assert.match(blocked.message,/Следующий заброс/);assert.equal(blocked.state.coins,renewed.state.coins);assert.equal(blocked.state.license.until,renewed.state.license.until);
});

test('licence tariffs rise by location, upgrades charge only the difference and downgrades do not charge',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),license=await f.load('lib/fishing/license.ts');assert.deepEqual(Array.from(license.licenseRates,r=>r.price),[50,100,150,200,250]);
 let p=game.newPlayer();p.rod=5;p.coins=1000;p.license={until:f.clock.now+6*3600000,tier:1,trial:false};const until=p.license.until;
 for(const [index,location] of ['sea','deep','ruins','void'].entries()){
  const now=f.clock.now+index*20000,selected=game.play(p,'!локация '+location,now,null,()=>0);assert.equal(selected.state.coins,p.coins);assert.equal(selected.state.location,location);
  const out=game.play(selected.state,'!рыба',now,null,()=>0);assert.ok(out.item);assert.equal(out.state.coins,p.coins-50+out.item.value);assert.match(out.message,/Доплата за локацию −50 монет/);assert.equal(out.state.license.until,until);assert.equal(out.state.license.tier,index+2);p=out.state;
 }
 for(const [index,location] of ['lake','void'].entries()){
  const now=f.clock.now+(index+4)*20000,selected=game.play(p,'!локация '+location,now,null,()=>0),out=game.play(selected.state,'!рыба',now,null,()=>0);assert.equal(out.state.coins,p.coins+out.item.value);assert.equal(out.state.license.tier,5);assert.equal(out.state.license.until,until);p=out.state;
 }
 const renewal=game.play(p,'!рыба',until,null,()=>0);assert.equal(renewal.state.coins,p.coins-250+renewal.item.value);assert.match(renewal.message,/Лицензия продлена: −250 монет/);
 const locked=game.play(game.newPlayer(),'!локация void',f.clock.now,null,()=>0);assert.equal(locked.state.location,'lake');assert.match(locked.message,/Нужна удочка/);assert.equal(locked.state.license,undefined);
});

test('an expired licence never accumulates absence debt and views or informational commands never renew it',async()=>{
 const f=await fixture(),p=await seedLicensedFisher(f,'lick0ver'),game=await f.load('lib/fishing/game.ts'),storage=await f.load('lib/fishing/storage.ts'),api=await f.load('app/api/fishing/route.ts');
 f.viewer('lick0ver','777');f.clock.now+=20*86400000;
 for(const command of ['!лицензия','!баланс','!локации']){const out=game.play(p,command,f.clock.now,null,()=>0);assert.equal(out.state.coins,200);assert.equal(out.state.license.until,p.license.until);}
 await storage.readPlayer('owner_channel','lick0ver');await api.GET(new Request('https://site.test/api/fishing?channel=owner_channel'));assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='lick0ver'").get().coins,200);
 const out=game.play(p,'!рыба',f.clock.now,null,()=>0);assert.ok(out.item);assert.equal(out.state.coins,200-50+out.item.value);assert.equal(out.state.license.until,f.clock.now+48*3600000);
});

test('insufficient licence funds preserve fish, bait and patrol and daily bonuses remain available',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts');let p=game.newPlayer();p.license={until:f.clock.now-1,tier:1,trial:false};p.bait=3;p.inventory={lake_carp:7};p.patrol={recentCasts:[f.clock.now-20000],limit:15,lastFineAt:0};
 const before=JSON.stringify(p),blocked=game.play(p,'!рыба',f.clock.now,null,()=>0);assert.equal(blocked.item,undefined);assert.match(blocked.message,/Продление — 50 монет/);assert.equal(blocked.state.coins,0);assert.equal(blocked.state.bait,3);assert.equal(blocked.state.catches,0);assert.equal(JSON.stringify(blocked.state.inventory),JSON.stringify(p.inventory));assert.equal(JSON.stringify(blocked.state.patrol),JSON.stringify(p.patrol));assert.equal(JSON.stringify(p),before);assert.equal(blocked.state.license.until,p.license.until);
 p=game.play(blocked.state,'!бонус',f.clock.now,null,()=>0).state;assert.equal(p.coins,25);assert.equal(game.play(p,'!рыба',f.clock.now,null,()=>0).item,undefined);
 f.clock.now+=86400000;p=game.play(p,'!бонус',f.clock.now,null,()=>0).state;const coins=p.coins,out=game.play(p,'!рыба',f.clock.now,null,()=>0);assert.ok(out.item);assert.equal(out.state.coins,coins-50+out.item.value);assert.equal(out.state.bait,2);
 const higher=game.newPlayer();higher.rod=5;higher.location='sea';higher.coins=49;higher.license={until:f.clock.now+3600000,tier:1,trial:false};const upgrade=game.play(higher,'!рыба',f.clock.now,null,()=>0);assert.equal(upgrade.item,undefined);assert.equal(upgrade.state.coins,49);assert.equal(upgrade.state.license.tier,1);assert.match(upgrade.message,/Доплата.*50 монет/);
});

test('website and chat share one licence, ignore supplied expiry and replay a paid renewal once',async()=>{
 const f=await fixture({randomValues:Array(30).fill(0)});await seedLicensedFisher(f,'lick0ver');f.viewer('lick0ver','777');f.enable();
 const api=await f.load('app/api/fishing/cast/route.ts'),storage=await f.load('lib/fishing/storage.ts'),id=crypto.randomUUID();
 const responses=await Promise.all([api.POST(castRequest(id,{license:{trial:true,tier:5,until:f.clock.now+999999999},location:'void'})),api.POST(castRequest(id))]);assert.deepEqual(responses.map(r=>r.status),[200,200]);const a=await responses[0].json(),b=await responses[1].json();assert.equal(a.entry.id,b.entry.id);assert.equal(a.player.coins,152);assert.equal(a.player.license.tier,1);assert.equal(a.player.license.trial,false);assert.equal(a.player.license.until,f.clock.now+48*3600000);assert.equal(f.sent.length,1);assert.match(f.sent[0].message,/Лицензия продлена: −50 монет/);
 const until=a.player.license.until;f.clock.now+=20000;const chat=await storage.ingestFish('owner_channel','lease','licensed-chat','lick0ver','!Рыба');assert.ok(chat.item_id);assert.ok(!chat.message.includes('Лицензия продлена'));const p=await storage.readPlayer('owner_channel','lick0ver');assert.equal(p.coins,154);assert.equal(p.license.until,until);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM fishing_log WHERE message LIKE '%Лицензия продлена%'").get().n,1);assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='lick0ver'").get().coins,p.coins);
});

test('simultaneous licence renewals charge once, stay in their room and can coexist with a patrol fine',async()=>{
 const f=await fixture({randomValues:Array(40).fill(0)}),p=await seedLicensedFisher(f),storage=await f.load('lib/fishing/storage.ts');
 f.sql.prepare('INSERT INTO fishing_games(channel,owner,host,enabled,next_event) VALUES(?,?,?,1,?)').run('other_room','owner','Other',f.clock.now+3600000);f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,200,0,0)').run('other_room','licensefan',JSON.stringify(p));
 await Promise.all([storage.castFish('owner_channel','license-race-a','licensefan'),storage.castFish('owner_channel','license-race-b','licensefan'),storage.ingestFish('owner_channel','lease','license-race-c','licensefan','!рыба')]);const saved=await storage.readPlayer('owner_channel','licensefan');assert.equal(saved.coins,152);assert.equal(saved.catches,1);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM fishing_log WHERE message LIKE '%Лицензия продлена%'").get().n,1);assert.equal((await storage.readPlayer('other_room','licensefan')).coins,200);assert.equal((await storage.readPlayer('other_room','licensefan')).license.until,p.license.until);
 const game=await f.load('lib/fishing/game.ts'),both=game.newPlayer();both.coins=50;both.license={until:f.clock.now-1,tier:1,trial:false};both.patrol={recentCasts:Array.from({length:14},(_,i)=>f.clock.now-(14-i)*20000),limit:15,lastFineAt:0};const out=game.play(both,'!рыба',f.clock.now,null,()=>0);assert.ok(out.item);assert.equal(out.state.coins,0);assert.match(out.message,/Лицензия продлена: −50 монет/);assert.match(out.message,/Штраф −2 монет/);
});

test('a failed licence transaction rolls back payment, expiry and catch before retry',async()=>{
 const f=await fixture({randomValues:Array(30).fill(0)}),p=await seedLicensedFisher(f);f.enable();const storage=await f.load('lib/fishing/storage.ts');
 f.sql.exec("CREATE TRIGGER reject_license BEFORE INSERT ON fishing_log WHEN NEW.message LIKE '%Лицензия продлена%' BEGIN SELECT RAISE(ABORT,'test licence rollback'); END;");await assert.rejects(storage.castFish('owner_channel','license-rollback','licensefan'));const failed=await storage.readPlayer('owner_channel','licensefan');assert.equal(failed.coins,200);assert.equal(failed.license.until,p.license.until);assert.equal(failed.catches,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,0);
 f.sql.exec('DROP TRIGGER reject_license');const retry=await storage.castFish('owner_channel','license-rollback','licensefan');assert.equal(retry.player.coins,152);assert.equal((await storage.castFish('owner_channel','license-rollback','licensefan')).replayed,true);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,1);
});

test('patrol stays silent before its quota, fines only completed casts and starts a fresh quota',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),initial=game.newPlayer();initial.coins=200;initial.bait=20;
 let p=initial;
 for(let i=1;i<=15;i++){
  const out=game.play(p,'!Рыба',f.clock.now+(i-1)*20000,null,()=>0);p=out.state;
  assert.ok(out.item);assert.equal(p.catches,i);
  if(i<15)assert.ok(!out.message.includes('Рыбнадзор'));
  else assert.match(out.message,/Штраф −23 монет/);
 }
 assert.equal(initial.patrol,undefined);assert.equal(initial.coins,200);
 assert.equal(p.coins,207);assert.equal(p.inventory.lake_carp,15);assert.equal(p.bait,5);
 assert.equal(p.patrol.recentCasts.length,0);assert.equal(p.patrol.limit,15);assert.equal(p.patrol.lastFineAt,p.lastCatch);
 const blocked=game.play(p,'!рыба',p.lastCatch+1000,null,()=>0);assert.match(blocked.message,/Следующий заброс/);assert.equal(JSON.stringify(blocked.state.patrol),JSON.stringify(p.patrol));assert.equal(blocked.state.coins,p.coins);assert.equal(blocked.state.catches,15);
 assert.equal(JSON.stringify(game.play(p,'!баланс',p.lastCatch+1000,null,()=>0).state.patrol),JSON.stringify(p.patrol));
});

test('patrol can assign every quota from fifteen to thirty and caps fines to the balance and thirty coins',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts');
 const limits=Array.from({length:16},(_,i)=>game.play(game.newPlayer(),'!рыба',f.clock.now,null,()=>i/16).state.patrol.limit);
 assert.deepEqual(limits,Array.from({length:16},(_,i)=>15+i));
 let p=game.newPlayer();p.coins=1000;
 for(let i=1;i<=30;i++){
  const before=p.coins,out=game.play(p,'!fish',f.clock.now+(i-1)*20000,null,()=>.999999);p=out.state;
  assert.equal(p.patrol.limit,30);
  if(i<30)assert.ok(!out.message.includes('Рыбнадзор'));
  else{assert.match(out.message,/Штраф −30 монет/);assert.equal(p.coins,before+out.item.value-30);}
 }
 for(const coins of [0,1,20,100,1000]){
  const poor=game.newPlayer();poor.coins=coins;poor.patrol={recentCasts:Array.from({length:14},(_,i)=>f.clock.now-(14-i)*20000),limit:15,warned:true,lastFineAt:0};
  const out=game.play(poor,'!рыбалка',f.clock.now,null,()=>0),balance=coins+out.item.value,fine=Math.min(balance,Math.max(5,Math.min(30,Math.floor(balance*.1))));
  assert.equal(out.state.coins,balance-fine);assert.ok(out.state.coins>=0);assert.ok(out.message.includes('Штраф −'+fine+' монет'));
 }
});

test('patrol expires old casts, respects the five-minute fine boundary and ignores cat catches',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),patrol=await f.load('lib/fishing/patrol.ts');
 let p=game.newPlayer();
 for(let i=0;i<14;i++)p=game.play(p,'!рыба',f.clock.now+i*20000,null,()=>0).state;
 assert.equal(p.patrol.recentCasts.length,14);
 const rested=game.play(p,'!рыба',p.lastCatch+600000,null,()=>.999999);assert.equal(rested.state.patrol.recentCasts.length,1);assert.equal(rested.state.patrol.limit,30);assert.ok(!rested.message.includes('Рыбнадзор'));
 let slow=game.newPlayer();for(let i=0;i<60;i++){const out=game.play(slow,'!рыба',f.clock.now+i*50000,null,()=>0);assert.ok(!out.message.includes('Рыбнадзор'));slow=out.state;assert.ok(slow.patrol.recentCasts.length<=12);}
 const guarded={coins:100,patrol:{recentCasts:Array.from({length:14},(_,i)=>f.clock.now-(14-i)*20000),limit:15,warned:true,lastFineAt:f.clock.now-299999}};
 assert.equal(patrol.recordPatrolCast(guarded,f.clock.now,()=>0),'');assert.equal(guarded.coins,100);
 assert.match(patrol.recordPatrolCast(guarded,f.clock.now+1,()=>0),/Штраф −10 монет/);assert.equal(guarded.coins,90);
 let cat=game.newPlayer();cat.coins=1000;cat.inventory={lake_carp:10};cat=game.play(cat,'!купить кота Белый',f.clock.now,null,()=>.5).state;cat=game.play(cat,'!кот корм',f.clock.now,null,()=>.5).state;cat.patrol=structuredClone(p.patrol);
 const before=JSON.stringify(cat.patrol),pets=await f.load('lib/fishing/cat.ts');pets.settleCat(cat,f.clock.now+2*3600000,()=>.5);
 assert.ok(cat.cat.history.length>0);assert.equal(JSON.stringify(cat.patrol),before);assert.equal(cat.catches,0);
});

test('website and Twitch share a silent patrol quota and fines, and replay cannot charge or announce twice',async()=>{
 const f=await fixture({randomValues:Array(40).fill(0)});await seedPatrolFisher(f,'lick0ver',{count:11});f.viewer('lick0ver','777');
 const storage=await f.load('lib/fishing/storage.ts'),api=await f.load('app/api/fishing/cast/route.ts');
 const quiet=await storage.castFish('owner_channel','patrol-site-12','lick0ver');assert.equal(quiet.kind,'saved');assert.ok(!quiet.entry.message.includes('Рыбнадзор'));
 f.clock.now+=20000;const chat=await storage.ingestFish('owner_channel','lease','patrol-chat-13','lick0ver','!Рыба');assert.ok(chat.item_id);assert.ok(!chat.message.includes('Рыбнадзор'));
 f.clock.now+=20000;assert.equal((await api.POST(castRequest())).status,200);
 f.clock.now+=20000;f.enable();const id=crypto.randomUUID(),responses=await Promise.all([api.POST(castRequest(id,{patrol:{limit:999,coins:999999}})),api.POST(castRequest(id))]);assert.deepEqual(responses.map(r=>r.status),[200,200]);
 const first=await responses[0].json(),second=await responses[1].json();assert.equal(first.entry.id,second.entry.id);assert.match(first.entry.message,/Штраф −20 монет/);assert.equal(first.player.coins,188);assert.equal(first.player.catches,15);
 const row=f.sql.prepare("SELECT * FROM fishing_players WHERE username='lick0ver'").get(),saved=JSON.parse(row.state);assert.equal(row.coins,188);assert.equal(saved.coins,row.coins);assert.equal(saved.patrol.recentCasts.length,0);assert.equal(row.catches,15);
 assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM fishing_log WHERE message LIKE '%Штраф%'").get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,1);assert.equal(f.sent.length,1);assert.ok(f.sent[0].message.includes(first.entry.message));
 const tooSoon=await storage.ingestFish('owner_channel','lease','patrol-chat-too-soon','lick0ver','!рыба');assert.equal(tooSoon.item_id,null);assert.ok(!tooSoon.message.includes('Рыбнадзор'));assert.equal((await api.POST(castRequest())).status,429);assert.equal((await storage.readPlayer('owner_channel','lick0ver')).coins,188);
});

test('simultaneous website and chat casts fine once and leave other fishers and rooms alone',async()=>{
 const f=await fixture({randomValues:Array(40).fill(0)}),p=await seedPatrolFisher(f,'patrolfan',{coins:100});await seedPatrolFisher(f,'other',{coins:80});
 f.sql.prepare('INSERT INTO fishing_games(channel,owner,host,enabled,next_event) VALUES(?,?,?,1,?)').run('other_room','owner','Other',f.clock.now+3600000);
 f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,100,14,0)').run('other_room','patrolfan',JSON.stringify(p));
 const storage=await f.load('lib/fishing/storage.ts');assert.equal(await storage.ingestFish('owner_channel','bad-lease','patrol-spoof','patrolfan','!рыба'),null);
 await Promise.all([storage.castFish('owner_channel','patrol-parallel-a','patrolfan'),storage.castFish('owner_channel','patrol-parallel-b','patrolfan'),storage.ingestFish('owner_channel','lease','patrol-parallel-c','patrolfan','!рыба')]);
 const saved=await storage.readPlayer('owner_channel','patrolfan');assert.equal(saved.coins,92);assert.equal(saved.catches,15);assert.equal(saved.patrol.recentCasts.length,0);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM fishing_log WHERE message LIKE '%Штраф%'").get().n,1);
 assert.equal((await storage.readPlayer('owner_channel','other')).coins,80);assert.equal(JSON.stringify((await storage.readPlayer('other_room','patrolfan')).patrol),JSON.stringify(p.patrol));
});

test('a failed patrol transaction rolls back the fine, quota and catch before a safe retry',async()=>{
 const f=await fixture({randomValues:Array(40).fill(0)}),p=await seedPatrolFisher(f,'patrolfan',{coins:100});f.enable();const storage=await f.load('lib/fishing/storage.ts');
 f.sql.exec("CREATE TRIGGER reject_patrol BEFORE INSERT ON fishing_log WHEN NEW.message LIKE '%Штраф%' BEGIN SELECT RAISE(ABORT,'test patrol rollback'); END;");
 await assert.rejects(storage.castFish('owner_channel','patrol-rollback','patrolfan'));
 const rolled=await storage.readPlayer('owner_channel','patrolfan');assert.equal(rolled.coins,100);assert.equal(rolled.catches,14);assert.equal(JSON.stringify(rolled.patrol),JSON.stringify(p.patrol));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM chat_messages').get().n,0);
 f.sql.exec('DROP TRIGGER reject_patrol');const retry=await storage.castFish('owner_channel','patrol-rollback','patrolfan');assert.equal(retry.player.coins,92);assert.match(retry.entry.message,/Штраф −10 монет/);assert.equal((await storage.castFish('owner_channel','patrol-rollback','patrolfan')).replayed,true);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,1);
});

test('fishing saves once and queues exactly its authoritative result; bot defaults off',async()=>{
  const f=await fixture(),{ingestFish}=await f.load('lib/fishing/storage.ts');
  const first=await ingestFish('owner_channel','lease','message-1','viewer','!рыба');
  assert.ok(first);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,0);
  f.enable();f.clock.now+=21000;
  const result=await ingestFish('owner_channel','lease','message-2','viewer','!рыба');
  const coins=f.sql.prepare('SELECT coins FROM fishing_players').get().coins;
  assert.equal(await ingestFish('owner_channel','lease','message-2','viewer','!рыба'),null);
  assert.equal(f.sql.prepare('SELECT coins FROM fishing_players').get().coins,coins);
  const messages=f.sql.prepare('SELECT text FROM twitch_bot_messages').all();
  assert.equal(messages.length,1);assert.equal(messages[0].text,'@viewer · '+result.message);
  assert.equal(await ingestFish('owner_channel','wrong-lease','message-3','viewer','!рыба'),null);
});
test('two collectors send once, honour rate limit, expiry, sender and revoked access',async()=>{
  const f=await fixture(),{flushBot}=await f.load('lib/twitch-bot/storage.ts');f.enable();f.queue('one');
  await Promise.all([flushBot(f.connection),flushBot(f.connection)]);
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].broadcaster_id,'123');assert.equal(f.sent[0].sender_id,'123');
  f.queue('two');await flushBot(f.connection);assert.equal(f.sent.length,1);
  f.clock.now+=3000;await flushBot(f.connection);assert.equal(f.sent.length,2);
  f.clock.now+=3000;f.queue('expired',{expires:f.clock.now-1});await flushBot(f.connection);assert.equal(f.sent.length,2);
  f.queue('three');await flushBot({...f.connection,user:'intruder'});assert.equal(f.sent.length,2);
  f.sql.exec('DELETE FROM streamers');await flushBot(f.connection);assert.equal(f.sent.length,2);
});
test('disabled replies and ambiguous or rejected deliveries never cause retries',async()=>{
  const f=await fixture(),{flushBot}=await f.load('lib/twitch-bot/storage.ts');f.queue('one');
  await flushBot(f.connection);assert.equal(f.sent.length,0);
  f.enable();f.sql.exec('UPDATE twitch_bot_settings SET fish_replies=0');await flushBot(f.connection);assert.equal(f.sent.length,0);
  f.sql.exec('UPDATE twitch_bot_settings SET fish_replies=1');f.clock.now+=3000;f.setDelivery('uncertain');
  await flushBot(f.connection);assert.equal(f.sent.length,1);assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_messages').get().status,'failed');
  f.clock.now+=60000;await flushBot(f.connection);assert.equal(f.sent.length,1);
  f.queue('rejected');f.setDelivery('rejected');await flushBot(f.connection);
  assert.match(f.sql.prepare('SELECT last_error FROM twitch_bot_settings').get().last_error,/модератором/);
  assert.equal(f.sql.prepare("SELECT status FROM twitch_bot_messages WHERE id='rejected'").get().status,'failed');
});
test('only the approved streamer may change settings; disabling cancels queued replies',async()=>{
  const f=await fixture(),route=await f.load('app/api/twitch/bot/route.ts');
  const request=(origin='https://site.test',body={enabled:true,fishReplies:true,winnerAnnouncements:true})=>new Request('https://site.test/api/twitch/bot',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await route.POST(request('https://other.test'))).status,403);
  f.setUser(null);assert.equal((await route.POST(request())).status,401);
  f.setUser({userId:'viewer',email:'viewer@example.test'});assert.equal((await route.POST(request())).status,403);
  f.setUser({userId:'owner',email:'owner@example.test'});
  assert.equal((await route.POST(request(undefined,{enabled:'true'}))).status,400);
  assert.equal((await route.POST(request())).status,200);f.queue('pending');
  assert.equal((await route.POST(request(undefined,{enabled:false,fishReplies:true,winnerAnnouncements:true}))).status,200);
  assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_messages').get().status,'cancelled');
  assert.equal((await (await route.GET()).json()).enabled,false);
});
test('replies preserve Unicode within 500 characters and delayed winners take priority',async()=>{
  const f=await fixture(),messages=await f.load('lib/twitch-bot/messages.ts'),{flushBot}=await f.load('lib/twitch-bot/storage.ts');
  assert.equal(Array.from(messages.chatText('🐟'.repeat(600))).length,500);
  assert.ok(!messages.chatText('a\nb\tc').includes('\n'));
  assert.match(messages.winnerReply('1 000 VP',['A','B']),/A, B/);
  f.enable();f.queue('fish');f.queue('winner',{kind:'winner',ready:f.clock.now+5000,expires:f.clock.now+120000});
  await flushBot(f.connection);assert.equal(f.sql.prepare("SELECT status FROM twitch_bot_messages WHERE id='winner'").get().status,'queued');
  f.clock.now+=6000;f.queue('fish-2');await flushBot(f.connection);
  assert.equal(f.sql.prepare("SELECT status FROM twitch_bot_messages WHERE id='winner'").get().status,'sent');
});
test('drawing queues the saved winners once and does not announce before the reel finishes',async()=>{
  const f=await fixture(),route=await f.load('app/api/giveaways/route.ts');f.enable();
  f.sql.prepare('INSERT INTO giveaways (id,owner,host,title,description,prize,slots,ends,created,channel,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('draw-1','owner','Owner','Test','Rules','1 000 VP',2,f.clock.now-1,f.clock.now-1000,'owner_channel','active');
  for(const name of ['Alice','Bob','Carol'])f.sql.prepare('INSERT INTO entries (giveaway,user,name,created) VALUES (?,?,?,?)').run('draw-1','twitch:'+name,name,f.clock.now-100);
  const request=()=>new Request('https://site.test/api/giveaways',{method:'POST',headers:{origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({action:'draw',id:'draw-1'})});
  const response=await route.POST(request());assert.equal(response.status,200);
  const result=await response.json(),saved=f.sql.prepare("SELECT name FROM entries WHERE giveaway='draw-1' AND winner=1").all();
  assert.deepEqual(result.winners.map(value=>value.name).sort(),saved.map(value=>value.name).sort());
  const announcement=f.sql.prepare('SELECT text,ready_at FROM twitch_bot_messages').get();
  for(const value of saved)assert.ok(announcement.text.includes(value.name));
  assert.equal(announcement.ready_at,f.clock.now+5000);
  assert.equal((await route.POST(request())).status,400);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,1);
});

const castRequest=(requestId=crypto.randomUUID(),extra={},origin='https://site.test')=>new Request('https://site.test/api/fishing/cast',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({channel:'owner_channel',requestId,...extra})});
test('lick0ver casts without streamer rights or an active collector; bot announces the saved catch as its owner',async()=>{
  const f=await fixture();f.viewer('lick0ver');f.enable();f.sql.exec('UPDATE fishing_games SET collector_until=0');
  const route=await f.load('app/api/fishing/cast/route.ts'),requestId=crypto.randomUUID();
  const response=await route.POST(castRequest(requestId));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.username,'lick0ver');assert.equal(result.player.catches,1);assert.ok(result.entry.item_id);
  assert.equal(result.player.inventory[result.entry.item_id],1);assert.equal(result.player.lastCatch,f.clock.now);
  const saved=f.sql.prepare('SELECT message,item_id FROM fishing_log').get();assert.equal(saved.message,result.entry.message);assert.equal(saved.item_id,result.entry.item_id);
  const announcement=f.sql.prepare('SELECT text,status FROM twitch_bot_messages').get();assert.equal(announcement.status,'sent');
  assert.equal(announcement.text,'@lick0ver · заброс на сайте · '+result.entry.message);
  assert.deepEqual(f.connectionUsers,['owner']);assert.equal(f.sent[0].sender_id,'123');assert.equal(f.sent[0].broadcaster_id,'123');assert.equal(f.sent[0].message,announcement.text);
  const mirrored=JSON.parse(f.sql.prepare('SELECT payload FROM chat_messages').get().payload);assert.equal(mirrored.kind,'fish');assert.equal(mirrored.text,announcement.text);
  const replay=await route.POST(castRequest(requestId));assert.equal(replay.status,200);assert.equal((await replay.json()).entry.id,result.entry.id);
  assert.equal(f.sql.prepare('SELECT catches FROM fishing_players').get().catches,1);
  for(const table of ['fishing_log','chat_messages','twitch_bot_messages'])assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM '+table).get().n,1);
  assert.equal(f.sent.length,1);
  const cooldown=await route.POST(castRequest());assert.equal(cooldown.status,429);assert.equal(cooldown.headers.get('Retry-After'),'20');
  assert.equal((await cooldown.json()).retryAt,f.clock.now+20000);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log').get().n,1);
  const snapshot=await f.load('app/api/fishing/route.ts'),own=await (await snapshot.GET(new Request('https://site.test/api/fishing?channel=owner_channel'))).json();
  assert.equal(own.username,'lick0ver');assert.equal(own.me.username,'lick0ver');assert.equal(own.player.catches,1);assert.equal(own.myPlayer.catches,1);assert.equal(own.canManage,false);assert.equal(own.streamer,null);
  const other=await (await snapshot.GET(new Request('https://site.test/api/fishing?channel=owner_channel&user=someone_else'))).json();assert.equal(other.player.catches,0);assert.equal(other.myPlayer.catches,1);
  f.sql.exec('UPDATE fishing_games SET enabled=0');assert.equal((await route.POST(castRequest())).status,409);assert.equal(f.sql.prepare('SELECT catches FROM fishing_players').get().catches,1);
});
test('website and !Рыба share inventory, coins, and a 20-second cooldown in both directions',async()=>{
  const f=await fixture();f.viewer('lick0ver');const route=await f.load('app/api/fishing/cast/route.ts'),{ingestFish}=await f.load('lib/fishing/storage.ts');
  assert.equal((await route.POST(castRequest())).status,200);
  const tooSoon=await ingestFish('owner_channel','lease','chat-too-soon','lick0ver','!Рыба');assert.equal(tooSoon.item_id,null);
  f.clock.now+=20000;const chatCatch=await ingestFish('owner_channel','lease','chat-catch','lick0ver','!Рыба');assert.ok(chatCatch.item_id);
  assert.equal((await route.POST(castRequest())).status,429);
  f.clock.now+=20000;assert.equal((await route.POST(castRequest())).status,200);
  const row=f.sql.prepare('SELECT state,coins,catches FROM fishing_players WHERE username=?').get('lick0ver'),state=JSON.parse(row.state);
  assert.equal(state.catches,3);assert.equal(row.catches,3);assert.equal(row.coins,state.coins);assert.equal(Object.values(state.inventory).reduce((a,b)=>a+b,0),3);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log WHERE item_id IS NOT NULL').get().n,3);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,0);
  assert.equal(await ingestFish('owner_channel','wrong-lease','spoof','lick0ver','!рыба'),null);
});
test('simultaneous website clicks and a chat command cannot award more than one catch',async()=>{
  const f=await fixture();f.viewer('lick0ver');const route=await f.load('app/api/fishing/cast/route.ts'),{ingestFish}=await f.load('lib/fishing/storage.ts');
  const responses=await Promise.all([route.POST(castRequest()),route.POST(castRequest()),ingestFish('owner_channel','lease','concurrent-chat','lick0ver','!рыба')]);
  for(const response of responses.slice(0,2))assert.ok([200,429].includes(response.status));
  const state=JSON.parse(f.sql.prepare('SELECT state FROM fishing_players WHERE username=?').get('lick0ver').state);
  assert.equal(state.catches,1);assert.equal(Object.values(state.inventory).reduce((a,b)=>a+b,0),1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log WHERE item_id IS NOT NULL').get().n,1);
  f.clock.now+=20000;const id=crypto.randomUUID(),duplicates=await Promise.all([route.POST(castRequest(id)),route.POST(castRequest(id))]);
  assert.deepEqual(duplicates.map(r=>r.status),[200,200]);assert.equal(f.sql.prepare('SELECT catches FROM fishing_players').get().catches,2);
});
test('casts require same-origin requests and a verified Twitch identity; supplied names and state are ignored',async()=>{
  const f=await fixture(),route=await f.load('app/api/fishing/cast/route.ts');
  assert.equal((await route.POST(castRequest(undefined,{},'https://other.test'))).status,403);
  f.setUser(null);assert.equal((await route.POST(castRequest())).status,401);
  f.setUser({userId:'unlinked',email:'unlinked@example.test'});assert.equal((await route.POST(castRequest())).status,403);
  f.viewer('lick0ver');for(const extra of [{channel:'../owner_channel'},{channel:'OWNER_CHANNEL'},{requestId:'not-a-uuid'},{channel:null}])assert.equal((await route.POST(castRequest(undefined,extra))).status,400);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log').get().n,0);
  const response=await route.POST(castRequest(undefined,{username:'owner_channel',coins:999999,player:{rod:5,coins:999999},item_id:'void_dragon'}));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.username,'lick0ver');assert.equal(result.player.rod,1);assert.notEqual(result.player.coins,999999);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM fishing_players WHERE username='owner_channel'").get().n,0);
});
test('a failed Twitch announcement preserves the catch and is not resent on an HTTP retry',async()=>{
  const f=await fixture();f.viewer('lick0ver');f.enable();f.setDelivery('uncertain');const route=await f.load('app/api/fishing/cast/route.ts'),id=crypto.randomUUID();
  assert.equal((await route.POST(castRequest(id))).status,200);assert.equal(f.sent.length,1);assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_messages').get().status,'failed');
  assert.equal((await route.POST(castRequest(id))).status,200);assert.equal(f.sent.length,1);assert.equal(f.sql.prepare('SELECT catches FROM fishing_players').get().catches,1);
});
test('website replies queued by the rate limit are sent in the background without a collector',async()=>{
  const f=await fixture();f.enable();f.sql.exec('UPDATE fishing_games SET collector_until=0');const route=await f.load('app/api/fishing/cast/route.ts');
  f.queue('preceding-reply');await (await f.load('lib/twitch-bot/storage.ts')).flushBot(f.connection);assert.equal(f.sent.length,1);
  f.viewer('lick0ver','789');assert.equal((await route.POST(castRequest())).status,200);await f.drainBackground();
  assert.equal(f.sent.length,2);assert.match(f.sent[1].message,/@lick0ver · заброс на сайте/);assert.ok(f.delays.includes(3000));assert.ok(f.sendTimes[1]-f.sendTimes[0]>=3000);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM twitch_bot_messages WHERE status='sent'").get().n,2);
});
test('viewer OAuth links only a fishing identity and cannot gain streamer rights or overwrite broadcaster tokens',async()=>{
  const f=await fixture();f.setUser({userId:'viewer-site',email:'viewer@example.test'});
  const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
  assert.equal((await connect.GET(new Request('https://site.test/api/twitch/connect'))).status,403);
  const response=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=player&return_to=/studio'));assert.equal(response.status,302);
  const auth=new URL(response.headers.get('location'));assert.equal(auth.searchParams.get('scope'),'openid');assert.equal(auth.searchParams.get('redirect_uri'),'https://site.test/api/twitch/callback');
  const state=auth.searchParams.get('state'),row=f.sql.prepare('SELECT purpose,return_to,expected FROM twitch_states').get();assert.equal(row.purpose,'player');assert.equal(row.return_to,'/fishing');assert.equal(row.expected,null);
  f.setUser({userId:'another-site',email:'another@example.test'});await callback.GET(new Request('https://site.test/api/twitch/callback?code=ok&state='+state));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_states').get().n,1);assert.equal(f.tokenRequests.length,0);
  f.setUser({userId:'viewer-site',email:'viewer@example.test'});
  const linked=await callback.GET(new Request('https://site.test/api/twitch/callback?purpose=streamer&code=ok&state='+state));assert.match(linked.headers.get('location'),/\/fishing\?twitch=player-connected$/);
  const identity=f.sql.prepare('SELECT twitch_id,username FROM fishing_accounts WHERE user=?').get('viewer-site');assert.equal(identity.twitch_id,'456');assert.equal(identity.username,'viewer');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM streamers').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_connections').get().n,1);assert.equal(f.sql.prepare("SELECT access FROM twitch_connections WHERE user='owner'").get().access,'unused');
  await callback.GET(new Request('https://site.test/api/twitch/callback?code=again&state='+state));assert.equal(f.tokenRequests.length,1);
  const ownerBefore=f.sql.prepare("SELECT access,refresh FROM twitch_connections WHERE user='owner'").get();f.setUser({userId:'owner',email:'owner@example.test'});
  const ownerFlow=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=player'));
  await callback.GET(new Request('https://site.test/api/twitch/callback?code=ok&state='+new URL(ownerFlow.headers.get('location')).searchParams.get('state')));
  assert.deepEqual(f.sql.prepare("SELECT access,refresh FROM twitch_connections WHERE user='owner'").get(),ownerBefore);
});
test('OAuth rejects an identity validated for a different app',async()=>{
  const f=await fixture();f.setUser({userId:'viewer-site',email:'viewer@example.test'});f.setClaims({client_id:'other-app',user_id:'456',login:'viewer',scopes:['openid']});
  const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
  const flow=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=player')),state=new URL(flow.headers.get('location')).searchParams.get('state');
  const response=await callback.GET(new Request('https://site.test/api/twitch/callback?code=ok&state='+state));assert.ok(!response.headers.get('location').includes('player-connected'));
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_accounts').get().n,0);
});

const friendRequest=()=>new Request('https://site.test/api/twitch/bot/channels',{method:'POST',headers:{origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({channel:'friend_channel'})});
test('a friend channel uses the operator account for replies and shares website/chat progress without friend OAuth',async()=>{
  const f=await fixture(),channels=await f.load('app/api/twitch/bot/channels/route.ts');
  assert.equal((await channels.POST(friendRequest())).status,200);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_connections').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM streamers').get().n,1);
  const room=f.sql.prepare("SELECT * FROM twitch_bot_channels WHERE channel='friend_channel'").get();assert.equal(room.owner,'owner');assert.equal(room.broadcaster,'999');
  const feed=await f.load('app/api/twitch/feed/route.ts'),snapshot=await (await feed.GET(new Request('https://site.test/api/twitch/feed?channel=friend_channel'))).json();
  assert.equal(snapshot.canCollect,true);assert.equal(snapshot.configured,true);assert.equal(snapshot.needsPermissions,false);
  f.linkFishingOwner();const game=await f.load('app/api/fishing/route.ts'),managed=await (await game.GET(new Request('https://site.test/api/fishing?channel=friend_channel'))).json();assert.equal(managed.canManage,true);assert.ok(managed.managedChannels.includes('friend_channel'));
  f.viewer('lick0ver','777');const cast=await f.load('app/api/fishing/cast/route.ts');
  const response=await cast.POST(castRequest(undefined,{channel:'friend_channel'}));assert.equal(response.status,200);const result=await response.json();assert.equal(result.entry.username,'lick0ver');
  assert.equal(f.sent.length,1);assert.equal(f.sent[0].broadcaster_id,'999');assert.equal(f.sent[0].sender_id,'123');assert.match(f.sent[0].message,/@lick0ver · заброс на сайте/);
  f.sql.prepare('UPDATE fishing_games SET collector_token=?,collector_until=? WHERE channel=?').run('friend-lease',f.clock.now+60000,'friend_channel');f.clock.now+=20000;
  const {ingestFish}=await f.load('lib/fishing/storage.ts'),entry=await ingestFish('friend_channel','friend-lease','friend-chat','lick0ver','!Рыба');assert.ok(entry.item_id);
  const {flushBot}=await f.load('lib/twitch-bot/storage.ts');await flushBot(f.connection);assert.equal(f.sent.length,1);
  await flushBot(f.connection,'friend_channel');assert.equal(f.sent.length,2);assert.equal(f.sent[1].broadcaster_id,'999');assert.equal(f.sent[1].sender_id,'123');
  const player=JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE channel='friend_channel' AND username='lick0ver'").get().state);assert.equal(player.catches,2);assert.equal(Object.values(player.inventory).reduce((a,b)=>a+b,0),2);
  assert.equal((await cast.POST(castRequest(undefined,{channel:'friend_channel'}))).status,429);
  f.sql.exec('DELETE FROM streamers');f.clock.now+=20000;await ingestFish('friend_channel','friend-lease','revoked','lick0ver','!рыба');await flushBot(f.connection,'friend_channel');assert.equal(f.sent.length,2);
});
test('friend settings are owned by the operator and cannot be taken over by another approved streamer',async()=>{
  const f=await fixture(),channels=await f.load('app/api/twitch/bot/channels/route.ts');assert.equal((await channels.POST(friendRequest())).status,200);
  f.sql.prepare('INSERT INTO streamers (email,channel,name) VALUES (?,?,?)').run('other@example.test','other_channel','Other');f.setUser({userId:'other',email:'other@example.test'});f.setBotConnection({...f.connection,user:'other',email:'other@example.test'});
  assert.equal((await channels.POST(friendRequest())).status,409);assert.equal(f.sql.prepare("SELECT owner FROM twitch_bot_channels WHERE channel='friend_channel'").get().owner,'owner');
  const settings=await f.load('app/api/twitch/bot/route.ts');assert.equal((await settings.GET(new Request('https://site.test/api/twitch/bot?channel=friend_channel'))).status,403);
  const fishing=await f.load('app/api/fishing/route.ts');assert.equal((await fishing.POST(new Request('https://site.test/api/fishing',{method:'POST',headers:{origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify({action:'disable',channel:'friend_channel'})}))).status,403);
  f.setUser({userId:'viewer',email:'viewer@example.test'});assert.equal((await channels.POST(friendRequest())).status,403);
  f.setUser(null);assert.equal((await channels.POST(friendRequest())).status,401);
  assert.equal((await channels.POST(new Request('https://site.test/api/twitch/bot/channels',{method:'POST',headers:{origin:'https://other.test'},body:'{}'}))).status,403);
});
test('bot OAuth accepts a separate sender without changing streamer access or its original credentials',async()=>{
  const f=await fixture();f.setClaims({client_id:'test-client',user_id:'456',login:'custom_bot',scopes:['user:read:chat','user:write:chat','moderator:read:chat_messages']});
  const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
  const start=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=bot'));assert.equal(start.status,302);
  const url=new URL(start.headers.get('location'));assert.ok(!url.searchParams.get('scope').includes('redemptions'));assert.equal(f.sql.prepare('SELECT purpose,expected FROM twitch_states').get().purpose,'bot');assert.equal(f.sql.prepare('SELECT expected FROM twitch_states').get().expected,null);
  const result=await callback.GET(new Request('https://site.test/api/twitch/callback?code=ok&state='+url.searchParams.get('state')));assert.match(result.headers.get('location'),/bot-connected$/);
  const bot=f.sql.prepare("SELECT broadcaster,channel FROM twitch_bot_connections WHERE user='owner'").get();assert.equal(bot.broadcaster,'456');assert.equal(bot.channel,'custom_bot');
  const original=f.sql.prepare("SELECT broadcaster,channel,access FROM twitch_connections WHERE user='owner'").get();assert.equal(original.broadcaster,'123');assert.equal(original.channel,'owner_channel');assert.equal(original.access,'unused');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM streamers').get().n,1);assert.equal(f.sql.prepare('SELECT channel FROM streamers').get().channel,'owner_channel');
});
test('the live collector subscribes to the friend room with the bot identity and ignores packets for other channels',{timeout:5000},async()=>{
  const f=await fixture({realtime:true}),channels=await f.load('app/api/twitch/bot/channels/route.ts');
  const bot={...f.connection,broadcaster:'456',channel:'custom_bot'};f.setBotConnection(bot);
  f.sql.prepare('INSERT INTO twitch_bot_connections (user,email,broadcaster,channel,access,refresh,expires,scopes) VALUES (?,?,?,?,?,?,?,?)').run('owner','owner@example.test','456','custom_bot','unused','unused',f.clock.now+60000,JSON.stringify(bot.permissions));
  assert.equal((await channels.POST(friendRequest())).status,200);
  f.linkFishingOwner();const live=await f.load('app/api/twitch/feed/live/route.ts'),abort=new AbortController(),response=await live.GET(new Request('https://site.test/api/twitch/feed/live?channel=friend_channel&fish=1',{signal:abort.signal}));assert.equal(response.status,200);
  const reader=response.body.getReader();
  async function until(status){for(let i=0;i<10;i++){let timer;try{const value=await Promise.race([reader.read(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Missing '+status)),1500);})]);const event=JSON.parse(new TextDecoder().decode(value.value).slice(6).trim());if(event.status===status)return event;if(event.status==='error')throw Error(event.message);}finally{clearTimeout(timer);}}throw Error('Missing '+status);}
  try{
    await until('ready');assert.ok(f.subscriptions.length>=5);
    for(const subscription of f.subscriptions){assert.equal(subscription.condition.broadcaster_user_id,'999');if(subscription.type.startsWith('channel.chat'))assert.equal(subscription.condition.user_id,'456');else assert.equal(subscription.condition.user_id,undefined);}
    const packet=id=>({metadata:{message_type:'notification',subscription_type:'channel.chat.message',message_id:'packet-'+id,message_timestamp:new Date(f.clock.now).toISOString()},payload:{event:{broadcaster_user_id:id,message_id:'message-'+id,chatter_user_id:'777',chatter_user_login:'fishfan',chatter_user_name:'Fishfan',badges:[],message:{text:'!Рыба',fragments:[{type:'text',text:'!Рыба'}]}}}});
    f.sockets[0].packet(packet('999'));const saved=await until('entry');assert.equal(saved.entry.username,'fishfan');assert.ok(saved.entry.item_id);
    f.sockets[0].packet(packet('123'));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log WHERE item_id IS NOT NULL').get().n,1);
    const {flushBot}=await f.load('lib/twitch-bot/storage.ts');await flushBot(bot,'friend_channel');assert.equal(f.sent[0].sender_id,'456');assert.equal(f.sent[0].broadcaster_id,'999');
    assert.equal(f.sql.prepare("SELECT catches FROM fishing_players WHERE channel='friend_channel'").get().catches,1);
  }finally{abort.abort();await reader.cancel().catch(()=>{});}
});

test('catch feed excludes command replies without hiding catches behind the page limit',async()=>{
  const f=await fixture(),{ingestFish}=await f.load('lib/fishing/storage.ts');f.enable();
  const first=await ingestFish('owner_channel','lease','real-catch-1','viewer','!рыба');f.clock.now+=20000;
  const second=await ingestFish('owner_channel','lease','real-catch-2','viewer','!рыба');
  for(let i=0;i<40;i++){f.clock.now++;const reply=await ingestFish('owner_channel','lease','odds-'+i,'viewer',i%2?'!баланс':'!шанс');assert.equal(reply.item_id,null);}
  f.linkFishingOwner();const route=await f.load('app/api/fishing/route.ts'),response=await route.GET(new Request('https://site.test/api/fishing?channel=owner_channel&user=viewer'));assert.equal(response.status,200);
  const snapshot=await response.json();assert.deepEqual(snapshot.log.map(e=>e.id),[second.id,first.id]);assert.ok(snapshot.log.every(e=>e.item_id));assert.equal(snapshot.player.catches,2);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log').get().n,42);
  assert.ok(f.sql.prepare("SELECT text FROM twitch_bot_messages WHERE id='fish:owner_channel:odds-0'").get().text.includes('%'));
});

test('odds pages show every item once, retain full-pool percentages and fit in a Twitch reply',async()=>{
  const f=await fixture(),game=await f.load('lib/fishing/game.ts'),{fishingReply}=await f.load('lib/twitch-bot/messages.ts');
  for(const location of game.locations)for(const event of [null,...game.events]){
    const player={...game.newPlayer(),location:location.id,rod:5},odds=game.probabilities(player,event),pages=Math.ceil(odds.length/4);
    assert.equal(game.play(player,'!шанс',f.clock.now,event).message,game.play(player,'!шанс 1',f.clock.now,event).message);
    for(let page=1;page<=pages;page++){
      const reply=game.play(player,'!Шанс '+page,f.clock.now,event);assert.equal(reply.changed,false);assert.equal(reply.state.coins,player.coins);assert.equal(reply.state.catches,player.catches);
      assert.ok(reply.message.includes('стр. '+page+'/'+pages));assert.ok(Array.from(fishingReply('x'.repeat(25),reply.message)).length<500);
      const pageItems=odds.slice((page-1)*4,page*4);assert.equal((reply.message.match(/%/g)??[]).length,pageItems.length);
      for(const value of pageItems)assert.ok(reply.message.includes(value.item.name+': '+value.chance.toFixed(2)+'%'));
      if(page<pages)assert.ok(reply.message.includes('!шанс '+(page+1)));
      assert.equal(game.play(player,'!odds '+page,f.clock.now,event).message,reply.message);
    }
    for(const argument of ['0','-1','1.5','abc','1 2',String(pages+1)])assert.ok(game.play(player,'!шанс '+argument,f.clock.now,event).message.includes('Доступны страницы'));
  }
});

const personalMessage=(body={channel:'friend_channel',message:'Привет!'},origin='https://site.test')=>new Request('https://site.test/api/twitch/chat',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
function linkPersonal(f,user='viewer-site',name='viewer',id='456'){
  f.sql.prepare('INSERT INTO twitch_chat_connections (user,email,broadcaster,channel,access,refresh,expires,scopes) VALUES (?,?,?,?,?,?,?,?)').run(user,name+'@example.test',id,name,'unused','unused',f.clock.now+60000,JSON.stringify(['user:write:chat']));
}
test('personal chat access works for ordinary viewers but does not reveal organizer controls',async()=>{
  const f=await fixture(),access=await f.load('app/api/twitch/chat/access/route.ts');f.setUser(null);
  const guest=await (await access.GET()).json();assert.equal(guest.canSend,false);assert.ok(guest.connectUrl.includes('purpose=chat'));
  f.setUser({userId:'viewer-site',email:'viewer@example.test'});assert.equal((await (await access.GET()).json()).canSend,false);
  linkPersonal(f);const connected=await (await access.GET()).json();assert.equal(connected.canSend,true);assert.equal(connected.channel,'viewer');assert.ok(!JSON.stringify(connected).includes('token'));
  const fishing=await f.load('app/api/fishing/route.ts');assert.equal((await fishing.GET(new Request('https://site.test/api/fishing?channel=owner_channel'))).status,403);
  const channels=await f.load('app/api/twitch/bot/channels/route.ts'),bot=await f.load('app/api/twitch/bot/route.ts');assert.equal((await channels.GET()).status,403);assert.equal((await bot.GET()).status,403);
  f.setUser({userId:'owner',email:'owner@example.test'});const owner=await (await access.GET()).json();assert.equal(owner.canSend,true);assert.equal(owner.channel,'owner_channel');
});
test('a viewer sends to the friend room only as their own verified account, never as the organizer bot',async()=>{
  const f=await fixture(),channels=await f.load('app/api/twitch/bot/channels/route.ts');assert.equal((await channels.POST(friendRequest())).status,200);
  f.setUser({userId:'viewer-site',email:'viewer@example.test'});linkPersonal(f);const route=await f.load('app/api/twitch/chat/route.ts');
  const response=await route.POST(personalMessage({channel:'friend_channel',message:'Привет!\n!рыба',sender:'owner',user:'owner',broadcaster:'123'}));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.sender,'viewer');assert.equal(f.sent[0].sender_id,'456');assert.equal(f.sent[0].broadcaster_id,'999');assert.equal(f.sent[0].message,'Привет! !рыба');
  assert.deepEqual(f.connectionUsers.slice(-1),['viewer-site']);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,0);
  const ownerMessage=await route.POST(personalMessage({channel:'owner_channel',message:'Привет владельцу'}));assert.equal(ownerMessage.status,200);assert.equal(f.sent[1].sender_id,'456');assert.equal(f.sent[1].broadcaster_id,'123');
});
test('personal chat rejects guests, missing permissions, arbitrary channels and invalid messages',async()=>{
  const f=await fixture(),route=await f.load('app/api/twitch/chat/route.ts');f.setUser(null);assert.equal((await route.POST(personalMessage())).status,401);
  assert.equal((await route.POST(personalMessage(undefined,'https://other.test'))).status,403);
  f.setUser({userId:'viewer-site',email:'viewer@example.test'});assert.equal((await route.POST(personalMessage({channel:'owner_channel',message:'Привет'}))).status,409);
  linkPersonal(f);for(const message of ['', 'x'.repeat(501)])assert.equal((await route.POST(personalMessage({channel:'owner_channel',message}))).status,400);
  assert.equal((await route.POST(personalMessage({channel:'not_configured',message:'Привет'}))).status,404);
  f.setChatRevoked(true);const revoked=await route.POST(personalMessage({channel:'owner_channel',message:'Привет'}));assert.equal(revoked.status,409);assert.equal((await revoked.json()).reconnect,true);assert.equal(f.sent.length,0);
});
test('personal chat OAuth preserves the selected room and cannot grant streamer or bot management access',async()=>{
  const f=await fixture();f.setUser({userId:'viewer-site',email:'viewer@example.test'});f.setClaims({client_id:'test-client',user_id:'456',login:'viewer',scopes:['user:write:chat']});
  const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
  const response=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=chat&channel=friend_channel'));assert.equal(response.status,302);
  const authorization=new URL(response.headers.get('location'));assert.equal(authorization.searchParams.get('scope'),'user:write:chat');assert.equal(f.sql.prepare('SELECT purpose,return_to FROM twitch_states').get().purpose,'chat');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/fishing?channel=friend_channel');
  const linked=await callback.GET(new Request('https://site.test/api/twitch/callback?purpose=bot&code=ok&state='+authorization.searchParams.get('state')));const back=new URL(linked.headers.get('location'));
  assert.equal(back.pathname,'/fishing');assert.equal(back.searchParams.get('channel'),'friend_channel');assert.equal(back.searchParams.get('twitch'),'chat-connected');
  assert.equal(f.sql.prepare("SELECT broadcaster FROM twitch_chat_connections WHERE user='viewer-site'").get().broadcaster,'456');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_connections').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_connections').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM streamers').get().n,1);
  assert.equal((await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=bot'))).status,403);
});

test('giveaway visibility hides public catalog, direct links and winners, while preserving owner data',async()=>{
 const f=await fixture(),route=await f.load('app/api/giveaways/route.ts');
 for(const [id,status] of [['done','completed'],['live','active'],['draft','draft']])f.sql.prepare('INSERT INTO giveaways (id,owner,host,title,description,prize,slots,ends,created,channel,status) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'owner','Owner','Title','Rules','VP',1,f.clock.now+60000,f.clock.now,'owner_channel',status);
 f.sql.prepare('INSERT INTO entries (giveaway,user,name,created,winner) VALUES (?,?,?,?,?)').run('done','twitch:1','Winner',f.clock.now,1);
 const post=(id,hidden,origin='https://site.test')=>route.POST(new Request('https://site.test/api/giveaways',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({action:'visibility',id,hidden})}));
 assert.equal((await post('done','yes')).status,400);assert.equal((await post('done',true,'https://other.test')).status,403);
 for(const id of ['done','live','draft'])assert.equal((await post(id,true)).status,200);
 assert.equal((await (await route.GET(new Request('https://site.test/api/giveaways?id=done'))).json()).item.hidden,1);
 assert.equal((await (await route.GET(new Request('https://site.test/api/giveaways'))).json()).items.length,3);
 f.setUser({userId:'viewer',email:'viewer@example.test'});
 const publicList=await (await route.GET(new Request('https://site.test/api/giveaways'))).json();assert.deepEqual(publicList.items,[]);assert.deepEqual(publicList.winners,[]);
 assert.equal((await route.GET(new Request('https://site.test/api/giveaways?id=done'))).status,404);
 assert.equal((await post('done',false)).status,403);
 assert.equal((await route.POST(new Request('https://site.test/api/giveaways',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({action:'join',id:'live'})}))).status,404);
 f.setUser(null);assert.equal((await post('done',false)).status,401);
 f.setUser({userId:'owner',email:'owner@example.test',displayName:'Owner'});
 for(const id of ['done','live','draft'])assert.equal((await post(id,false)).status,200);
 f.setUser(null);const restored=await (await route.GET(new Request('https://site.test/api/giveaways'))).json();assert.equal(restored.items.length,2);assert.equal(restored.winners[0].name,'Winner');
 assert.equal((await route.GET(new Request('https://site.test/api/giveaways?id=draft'))).status,404);
 assert.equal(f.sql.prepare('SELECT status FROM giveaways WHERE id=?').get('done').status,'completed');assert.equal(f.sql.prepare('SELECT winner FROM entries WHERE giveaway=?').get('done').winner,1);
});

test('chat Twitch connection returns to the giveaway after viewer authorization',async()=>{
 const f=await fixture();f.setUser({userId:'viewer-site',email:'viewer@example.test'});f.setClaims({client_id:'test-client',user_id:'456',login:'viewer',scopes:['user:write:chat']});
 const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
 const response=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=chat&return_to=/giveaways/done&channel=owner_channel'));
 assert.equal(response.status,302);const state=new URL(response.headers.get('location')).searchParams.get('state');
 const result=await callback.GET(new Request('https://site.test/api/twitch/callback?code=ok&state='+state));assert.equal(new URL(result.headers.get('location')).pathname,'/giveaways/done');
 assert.ok(f.sql.prepare('SELECT user FROM twitch_chat_connections WHERE user=?').get('viewer-site'));
});

test('giveaways allow only Twitch keywords while channel points and website joins are disabled',async()=>{
 const f=await fixture(),route=await f.load('app/api/giveaways/route.ts');
 const request=body=>new Request('https://site.test/api/giveaways',{method:'POST',headers:{origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify(body)});
 const body={action:'create',title:'Title',prize:'VP',description:'Rules',slots:1,ends:f.clock.now+120000,entryMode:'points',rewardTitle:'Entry',rewardCost:500};
 assert.equal((await route.POST(request(body))).status,400);
 assert.equal((await route.POST(request({...body,entryMode:'keyword',keyword:'!ТУТ'}))).status,400);
 const created=await route.POST(request({...body,entryMode:'keyword',keyword:'!drop'}));assert.equal(created.status,200);const {id}=await created.json();
 const row=f.sql.prepare('SELECT * FROM giveaways WHERE id=?').get(id);assert.equal(row.entry_mode,'keyword');assert.equal(row.reward_cost,null);
 assert.equal((await route.POST(request({action:'join',id}))).status,403);
 f.sql.prepare("UPDATE giveaways SET entry_mode='points' WHERE id=?").run(id);
 assert.equal((await route.POST(request({action:'activate',id}))).status,400);
 f.sql.prepare("UPDATE giveaways SET status='active',collector_token='lease',collector_until=? WHERE id=?").run(f.clock.now+120000,id);
 const {ingestEvent}=await f.load('lib/twitch-events.ts'),active={...row,entry_mode:'points',reward_id:'reward'};
 assert.equal((await ingestEvent(active,f.connection,'lease','channel.channel_points_custom_reward_redemption.add',{broadcaster_user_id:'123',user_id:'456',user_name:'Viewer',reward:{id:'reward'},status:'FULFILLED'},new Date(f.clock.now).toISOString())).accepted,false);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM entries WHERE giveaway=?').get(id).n,0);
 f.sql.prepare("UPDATE giveaways SET entry_mode='keyword' WHERE id=?").run(id);
 const event={broadcaster_user_id:'123',chatter_user_id:'456',chatter_user_name:'Viewer',message:{text:'!DROP'}};
 assert.equal((await ingestEvent(row,f.connection,'lease','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,true);
 assert.equal((await ingestEvent(row,f.connection,'lease','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,false);
});

test('giveaway deletion is owner-only, confirmed and removes entries and queued announcement',async()=>{
 const f=await fixture(),route=await f.load('app/api/giveaways/route.ts');
 f.sql.prepare('INSERT INTO giveaways (id,owner,host,title,description,prize,slots,ends,created,channel,status,hidden) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run('delete-me','owner','Owner','Title','Rules','VP',1,f.clock.now+60000,f.clock.now,'owner_channel','completed',1);
 f.sql.prepare('INSERT INTO entries (giveaway,user,name,created,winner) VALUES (?,?,?,?,?)').run('delete-me','twitch:1','Winner',f.clock.now,1);f.queue('winner:delete-me',{kind:'winner'});
 const request=(confirm=true,origin='https://site.test')=>new Request('https://site.test/api/giveaways',{method:'POST',headers:{origin},body:JSON.stringify({action:'delete',id:'delete-me',confirm})});
 assert.equal((await route.POST(request(false))).status,400);assert.equal((await route.POST(request(true,'https://other.test'))).status,403);
 f.setUser({userId:'viewer',email:'viewer@example.test'});assert.equal((await route.POST(request())).status,403);
 f.setUser({userId:'owner',email:'owner@example.test'});assert.equal((await route.POST(request())).status,200);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM giveaways').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM entries').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,0);
});

test('friend giveaway uses the operator bot to collect only the friend chat with ownership gates',async()=>{
 const f=await fixture({realtime:true}),channels=await f.load('app/api/twitch/bot/channels/route.ts');assert.equal((await channels.POST(friendRequest())).status,200);
 const route=await f.load('app/api/giveaways/route.ts');
 const request=body=>new Request('https://site.test/api/giveaways',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify(body)});
 const body={action:'create',title:'Friend giveaway',prize:'VP',description:'Rules',slots:1,ends:f.clock.now+120000,entryMode:'keyword',keyword:'!drop',channel:'friend_channel'};
 assert.equal((await route.POST(request({...body,channel:'unmanaged'}))).status,403);
 const created=await route.POST(request(body));assert.equal(created.status,200);const {id}=await created.json();assert.equal(f.sql.prepare('SELECT channel FROM giveaways WHERE id=?').get(id).channel,'friend_channel');
 assert.ok((await (await route.GET(new Request('https://site.test/api/giveaways'))).json()).managedChannels.includes('friend_channel'));
 assert.equal((await route.POST(request({action:'activate',id}))).status,200);
 const live=await f.load('app/api/twitch/live/route.ts'),abort=new AbortController(),stream=await live.GET(new Request('https://site.test/api/twitch/live?id='+id,{signal:abort.signal}));assert.equal(stream.status,200);
 try{
  const reader=stream.body.getReader();await reader.read();await new Promise(resolve=>setTimeout(resolve,15));
  assert.deepEqual(f.subscriptions.at(-1).condition,{broadcaster_user_id:'999',user_id:'123'});
  const packet=broadcaster=>({metadata:{message_type:'notification',message_id:'giveaway-'+broadcaster,subscription_type:'channel.chat.message',message_timestamp:new Date(f.clock.now).toISOString()},payload:{event:{broadcaster_user_id:broadcaster,chatter_user_id:'777',chatter_user_name:'Fan',message:{text:'!DROP'}}}});
  f.sockets[0].packet(packet('123'));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM entries WHERE giveaway=?').get(id).n,0);
  f.sockets[0].packet(packet('999'));await new Promise(resolve=>setTimeout(resolve,10));assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM entries WHERE giveaway=?').get(id).n,1);
 }finally{abort.abort();await new Promise(resolve=>setTimeout(resolve,5));}
 f.sql.prepare('INSERT INTO streamers (email,channel,name) VALUES (?,?,?)').run('other@example.test','other_channel','Other');f.setUser({userId:'other',email:'other@example.test'});
 assert.equal((await route.POST(request(body))).status,403);assert.equal((await route.POST(request({action:'delete',id,confirm:true}))).status,403);assert.equal((await live.GET(new Request('https://site.test/api/twitch/live?id='+id))).status,409);
});

test('studio bot connection returns to studio without changing streamer identity or friend channels',async()=>{
 const f=await fixture();f.setClaims({client_id:'test-client',user_id:'456',login:'my_mod_nick',scopes:['user:read:chat','user:write:chat','moderator:read:chat_messages']});
 const connect=await f.load('app/api/twitch/connect/route.ts'),callback=await f.load('app/api/twitch/callback/route.ts');
 const response=await connect.GET(new Request('https://site.test/api/twitch/connect?purpose=bot&return_to=/studio'));assert.equal(response.status,302);
 const state=new URL(response.headers.get('location')).searchParams.get('state');assert.equal(f.sql.prepare('SELECT return_to FROM twitch_states').get().return_to,'/studio');
 const result=await callback.GET(new Request('https://site.test/api/twitch/callback?code=ok&state='+state));assert.equal(new URL(result.headers.get('location')).pathname,'/studio');
 assert.equal(f.sql.prepare('SELECT channel FROM twitch_bot_connections').get().channel,'my_mod_nick');assert.equal(f.sql.prepare('SELECT channel FROM streamers').get().channel,'owner_channel');
});

const giveawayRequest=body=>new Request('https://site.test/api/giveaways',{method:'POST',headers:{origin:'https://site.test','Content-Type':'application/json'},body:JSON.stringify(body)});
function seedGiveaway(f,id='features',extra={}){
 f.sql.prepare('INSERT INTO giveaways(id,owner,host,title,description,prize,slots,ends,created,channel,status,entry_mode,keyword,collector_token,collector_until,presence_required,exclude_repeat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,'owner','Owner','Title','Rules','VP',1,f.clock.now-1,f.clock.now-10000,'owner_channel',extra.status??'active','keyword','!drop','lease',f.clock.now+180000,extra.presence??1,extra.excludeRepeat??0);
 for(const [user,name] of [['twitch:1','First'],['twitch:2','Second'],['twitch:3','Third']])f.sql.prepare('INSERT INTO entries(giveaway,user,name,created,winner) VALUES(?,?,?,?,0)').run(id,user,name,f.clock.now-5000);
 return f.sql.prepare('SELECT * FROM giveaways WHERE id=?').get(id);
}
test('presence requires the selected Twitch identity, current lease and an on-time !тут; history and paid state persist',async()=>{
 const f=await fixture(),g=seedGiveaway(f),route=await f.load('app/api/giveaways/route.ts');
 f.enable();assert.equal((await route.POST(giveawayRequest({action:'draw',id:g.id}))).status,200);
 const winner=f.sql.prepare('SELECT * FROM giveaway_winners').get();assert.equal(winner.state,'awaiting');assert.equal(winner.deadline,f.clock.now+65000);
 assert.equal((await route.POST(giveawayRequest({action:'paid',id:g.id,winnerId:winner.id,paid:true}))).status,409);
 const {ingestEvent}=await f.load('lib/twitch-events.ts'),event={broadcaster_user_id:'123',chatter_user_id:winner.user.slice(7),chatter_user_name:winner.name,message:{text:'!ТУТ'}};
 assert.equal((await ingestEvent(g,f.connection,'lease','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,false);
 f.clock.now+=6000;
 for(const patch of [{broadcaster_user_id:'999'},{chatter_user_id:'999'},{message:{text:'hello'}}])assert.equal((await ingestEvent(g,f.connection,'lease','channel.chat.message',{...event,...patch},new Date(f.clock.now).toISOString())).accepted,false);
 assert.equal((await ingestEvent(g,f.connection,'wrong','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,false);
 assert.equal((await ingestEvent(g,f.connection,'lease','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,true);
 assert.equal((await ingestEvent(g,f.connection,'lease','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,false);
 assert.equal((await route.POST(giveawayRequest({action:'reroll',id:g.id,winnerId:winner.id}))).status,409);
 assert.equal((await route.POST(giveawayRequest({action:'paid',id:g.id,winnerId:winner.id,paid:true}))).status,200);
 const history=await (await route.GET(new Request('https://site.test/api/giveaways?history=1&channel=owner_channel'))).json();assert.equal(history.history[0].paid,1);assert.equal(history.history[0].state,'confirmed');
 f.setUser({userId:'viewer',email:'viewer@example.test'});assert.equal((await route.GET(new Request('https://site.test/api/giveaways?history=1'))).status,403);assert.equal((await route.POST(giveawayRequest({action:'paid',id:g.id,winnerId:winner.id,paid:false}))).status,403);
});
test('expired presence can reroll exactly once and never selects an earlier attempt again',async()=>{
 const f=await fixture(),g=seedGiveaway(f),route=await f.load('app/api/giveaways/route.ts');
 await route.POST(giveawayRequest({action:'draw',id:g.id}));const winner=f.sql.prepare('SELECT * FROM giveaway_winners').get();
 assert.equal((await route.POST(giveawayRequest({action:'reroll',id:g.id,winnerId:winner.id}))).status,409);f.clock.now=winner.deadline+1;
 const {ingestEvent}=await f.load('lib/twitch-events.ts');assert.equal((await ingestEvent(g,f.connection,'lease','channel.chat.message',{broadcaster_user_id:'123',chatter_user_id:winner.user.slice(7),message:{text:'!тут'}},new Date(f.clock.now).toISOString())).accepted,false);
 const response=await route.POST(giveawayRequest({action:'reroll',id:g.id,winnerId:winner.id}));assert.equal(response.status,200);
 assert.equal((await route.POST(giveawayRequest({action:'reroll',id:g.id,winnerId:winner.id}))).status,409);
 const history=f.sql.prepare('SELECT * FROM giveaway_winners ORDER BY chosen_at').all();assert.equal(history.length,2);assert.equal(history[0].state,'replaced');assert.notEqual(history[1].user,history[0].user);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM entries WHERE winner=1').get().n,1);
});
test('manual exclusions restore without losing entries; repeat creates a clean draft and excludes recent winners by channel',async()=>{
 const f=await fixture(),g=seedGiveaway(f,'original',{presence:0}),route=await f.load('app/api/giveaways/route.ts');
 assert.equal((await route.POST(giveawayRequest({action:'exclude',id:g.id,user:'twitch:1',excluded:true,reason:''}))).status,400);
 for(const user of ['twitch:1','twitch:2'])assert.equal((await route.POST(giveawayRequest({action:'exclude',id:g.id,user,excluded:true,reason:'Account excluded'}))).status,200);
 assert.equal((await route.POST(giveawayRequest({action:'exclude',id:g.id,user:'twitch:1',excluded:false}))).status,200);
 await route.POST(giveawayRequest({action:'exclude',id:g.id,user:'twitch:1',excluded:true,reason:'Duplicate'}));
 const response=await route.POST(giveawayRequest({action:'draw',id:g.id}));assert.equal((await response.json()).winners[0].name,'Third');
 const repeated=await route.POST(giveawayRequest({action:'repeat',id:g.id}));assert.equal(repeated.status,200);const {id}=await repeated.json(),copy=f.sql.prepare('SELECT * FROM giveaways WHERE id=?').get(id);assert.equal(copy.status,'draft');assert.equal(copy.ends,f.clock.now+1800000);assert.equal(copy.title,g.title);assert.equal(copy.channel,g.channel);assert.equal(copy.draw_mode,'ordinary');assert.equal(copy.hidden,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM entries WHERE giveaway=?').get(id).n,0);
 const next=seedGiveaway(f,'next',{presence:0,excludeRepeat:1});f.sql.prepare("UPDATE entries SET excluded=1 WHERE giveaway=? AND user!='twitch:3'").run(next.id);
 assert.equal((await route.POST(giveawayRequest({action:'draw',id:next.id}))).status,400);
 f.clock.now+=86400001;assert.equal((await route.POST(giveawayRequest({action:'draw',id:next.id}))).status,200);
});

test('race avatars use Twitch identities, cache profiles and protect hidden giveaways',async()=>{
 const f=await fixture(),g=seedGiveaway(f),avatars=await f.load('app/api/giveaways/avatars/route.ts');
 const request=()=>new Request('https://site.test/api/giveaways/avatars?id='+g.id);
 const first=await avatars.GET(request());assert.equal(first.status,200);const data=await first.json();assert.equal(data.people.length,3);assert.equal(data.people[0].avatar,'https://static-cdn.jtvnw.net/jtv_user_pictures/1.png');
 assert.equal((await avatars.GET(request())).status,200);assert.equal(f.connectionUsers.length,1);
 f.sql.prepare('UPDATE giveaways SET hidden=1 WHERE id=?').run(g.id);f.setUser({userId:'viewer',email:'viewer@example.test'});assert.equal((await avatars.GET(request())).status,404);
});
test('fishing, race and vending keep server-selected winners and history, with exactly one result per draw',async()=>{
 for(const mode of ['fishing','race','vending']){
  const f=await fixture(),g=seedGiveaway(f,mode,{presence:0}),route=await f.load('app/api/giveaways/route.ts');
  assert.equal((await route.POST(giveawayRequest({action:'drawMode',id:g.id,drawMode:mode}))).status,200);
  const results=await Promise.all([route.POST(giveawayRequest({action:'draw',id:g.id})),route.POST(giveawayRequest({action:'draw',id:g.id}))]);assert.equal(results.filter(r=>r.status===200).length,1);
  const good=await results.find(r=>r.status===200).json();assert.equal(good.drawMode,mode);assert.equal(good.winners[0].name,f.sql.prepare('SELECT name FROM giveaway_winners').get().name);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM giveaway_winners').get().n,1);
 }
});
test('late exclusion or settings change cannot become a winner after candidate selection',async()=>{
 const f=await fixture(),g=seedGiveaway(f),route=await f.load('app/api/giveaways/route.ts'),batch=f.db.batch;
 f.db.batch=async statements=>{f.sql.prepare('UPDATE entries SET excluded=1 WHERE giveaway=?').run(g.id);return batch(statements);};
 assert.equal((await route.POST(giveawayRequest({action:'draw',id:g.id}))).status,409);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM giveaway_winners').get().n,0);assert.equal(f.sql.prepare('SELECT status FROM giveaways').get().status,'active');
});
test('presence collector continues after drawing and confirms the current winner through Twitch events',async()=>{
 const f=await fixture({realtime:true}),g=seedGiveaway(f),route=await f.load('app/api/giveaways/route.ts');await route.POST(giveawayRequest({action:'draw',id:g.id}));
 const winner=f.sql.prepare('SELECT * FROM giveaway_winners').get();f.clock.now+=6000;f.sql.prepare('UPDATE giveaways SET collector_until=NULL WHERE id=?').run(g.id);
 const live=await f.load('app/api/twitch/live/route.ts'),abort=new AbortController(),response=await live.GET(new Request('https://site.test/api/twitch/live?id='+g.id,{signal:abort.signal}));assert.equal(response.status,200);
 try{await response.body.getReader().read();await new Promise(resolve=>setTimeout(resolve,15));f.sockets[0].packet({metadata:{message_type:'notification',message_id:'presence',subscription_type:'channel.chat.message',message_timestamp:new Date(f.clock.now).toISOString()},payload:{event:{broadcaster_user_id:'123',chatter_user_id:winner.user.slice(7),message:{text:'!тут'}}}});await new Promise(resolve=>setTimeout(resolve,15));assert.equal(f.sql.prepare('SELECT state FROM giveaway_winners').get().state,'confirmed');}finally{abort.abort();await new Promise(resolve=>setTimeout(resolve,5));}
});

test('twelve-second fishing and vending reveal before the full presence window and bot announcement',async()=>{
 for(const mode of ['fishing','vending']){
  const f=await fixture(),g=seedGiveaway(f),route=await f.load('app/api/giveaways/route.ts');f.enable();
  await route.POST(giveawayRequest({action:'drawMode',id:g.id,drawMode:mode}));const start=f.clock.now;const result=await (await route.POST(giveawayRequest({action:'draw',id:g.id}))).json();assert.equal(result.drawStartedAt,start);
  const winner=f.sql.prepare('SELECT * FROM giveaway_winners').get(),message=f.sql.prepare('SELECT ready_at FROM twitch_bot_messages').get();assert.equal(winner.deadline,start+72500);assert.equal(message.ready_at,start+12500);
  const {ingestEvent}=await f.load('lib/twitch-events.ts'),event={broadcaster_user_id:'123',chatter_user_id:winner.user.slice(7),message:{text:'!тут'}};
  f.clock.now=start+12000;assert.equal((await ingestEvent(g,f.connection,'lease','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,false);
  f.clock.now=start+13000;assert.equal((await ingestEvent(g,f.connection,'lease','channel.chat.message',event,new Date(f.clock.now).toISOString())).accepted,true);
 }
});

test('Monster assignments survive display-name changes, pagination and reloads and cover all reference cans',async()=>{
 const f=await fixture(),catalog=await f.load('lib/monster-catalog.ts');
 assert.equal(catalog.MONSTER_VARIANTS.length,78);
 assert.equal(new Set(catalog.MONSTER_VARIANTS.map(v=>v.id)).size,78);
 const first=catalog.monsterForParticipant('giveaway-a',{user:'twitch:456',name:'OldName'});
 assert.equal(catalog.monsterForParticipant('giveaway-a',{user:'twitch:456',name:'NewName'}).id,first.id);
 const people=Array.from({length:2000},(_,i)=>({user:'twitch:'+i,name:'Player'+i}));
 const assigned=people.map(p=>catalog.monsterForParticipant('giveaway-a',p).id);
 assert.equal(new Set(assigned).size,78);
 assert.equal(catalog.monsterForParticipant('giveaway-a',people.slice(100)[51]).id,assigned[151]);
 const next=people.map(p=>catalog.monsterForParticipant('giveaway-b',p).id);
 assert.ok(next.some((id,i)=>id!==assigned[i]));
});

test('vending includes participants beyond the first loaded page and cannot be operated by viewers',async()=>{
 const f=await fixture(),g=seedGiveaway(f,'vending-paged',{presence:0}),route=await f.load('app/api/giveaways/route.ts');
 for(let i=4;i<=140;i++)f.sql.prepare('INSERT INTO entries(giveaway,user,name,created,winner) VALUES(?,?,?,?,0)').run(g.id,'twitch:'+i,'Player'+i,f.clock.now-4000+i);
 f.sql.prepare("UPDATE entries SET excluded=1 WHERE giveaway=? AND user!='twitch:140'").run(g.id);
 assert.equal((await route.POST(giveawayRequest({action:'drawMode',id:g.id,drawMode:'vending'}))).status,200);
 f.setUser(null);
 const preview=await (await route.GET(new Request('https://site.test/api/giveaways?id='+g.id))).json();assert.equal(preview.people.length,100);assert.equal(preview.item.participants,140);assert.ok(!preview.people.some(p=>p.user==='twitch:140'));
 assert.equal((await route.POST(giveawayRequest({action:'draw',id:g.id}))).status,401);
 f.setUser({userId:'viewer',email:'viewer@example.test'});
 assert.equal((await route.POST(giveawayRequest({action:'drawMode',id:g.id,drawMode:'vending'}))).status,403);
 assert.equal((await route.POST(giveawayRequest({action:'draw',id:g.id}))).status,403);
 f.setUser({userId:'owner',email:'owner@example.test'});
 const draw=await (await route.POST(giveawayRequest({action:'draw',id:g.id}))).json();assert.equal(draw.winners[0].user,'twitch:140');
 const result=await (await route.GET(new Request('https://site.test/api/giveaways?id='+g.id))).json();assert.equal(result.winners[0].user,'twitch:140');
 assert.equal((await route.POST(giveawayRequest({action:'drawMode',id:g.id,drawMode:'ordinary'}))).status,400);
});

async function duelFixture(options={}){const f=await fixture(options),game=await f.load('lib/fishing/game.ts');for(const [name,fish] of [['alice','lake_carp'],['bob','lake_pike'],['carol','lake_carp']]){const state=game.newPlayer();state.coins=31;state.inventory[fish]=2;f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,31,0,0)').run('owner_channel',name,JSON.stringify(state));}const {ingestFish}=await f.load('lib/fishing/storage.ts');return {...f,ingestFish,command:(id,name,text,channel='owner_channel',lease='lease')=>ingestFish(channel,lease,id,name,text)};}
test('fish duel transfers one losing fish exactly once while keeping coins and total inventory intact',async()=>{
 const f=await duelFixture();f.enable();const before=f.sql.prepare('SELECT username,state FROM fishing_players ORDER BY username').all();
 const challenge=await f.command('duel-invite','alice','!дуэль @bob');assert.match(challenge.message,/@bob.*!принять/);assert.equal(await f.command('duel-invite','alice','!дуэль @bob'),null);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_duel_locks').get().n,2);
 const answer=await f.command('duel-accept','bob','!принять');assert.match(answer.message,/Победил|Ничья/);assert.equal(await f.command('duel-accept','bob','!принять'),null);
 const duel=f.sql.prepare('SELECT * FROM fishing_duels').get();assert.equal(duel.status,'completed');assert.equal(duel.challenger_fish,'lake_carp');assert.equal(duel.opponent_fish,'lake_pike');assert.ok(duel.challenger_score>=10&&duel.challenger_score<=110);assert.ok(duel.opponent_score>=20&&duel.opponent_score<=120);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_duel_locks').get().n,0);
 const after=f.sql.prepare('SELECT username,state FROM fishing_players ORDER BY username').all();for(const row of after){const previous=JSON.parse(before.find(x=>x.username===row.username).state),current=JSON.parse(row.state);assert.equal(current.coins,previous.coins);if(duel.winner){const fish=duel.transferred_fish,loser=duel.winner==='alice'?'bob':'alice',delta=row.username===duel.winner?1:row.username===loser?-1:0;assert.equal(current.inventory[fish]??0,(previous.inventory[fish]??0)+delta);}else assert.deepEqual(current,previous);}assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM twitch_bot_messages').get().n,2);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_log WHERE item_id IS NOT NULL').get().n,0);assert.match((await f.command('duel-stats','alice','!дуэлистат')).message,/побед.*поражений.*ничьих/);
});
test('only the challenged viewer can accept; declines, cancellations and timeouts release participation',async()=>{
 const f=await duelFixture();await f.command('invite-a','alice','!duel @bob');assert.match((await f.command('wrong-accept','carol','!принять')).message,/Нет вызова/);assert.equal(f.sql.prepare('SELECT status FROM fishing_duels').get().status,'pending');
 assert.match((await f.command('decline','bob','!отказ')).message,/отклонена/);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_duel_locks').get().n,0);
 f.clock.now+=31000;await f.command('invite-b','alice','!дуэль @bob');assert.match((await f.command('cancel','alice','!отмена')).message,/отменена/);
 f.clock.now+=31000;await f.command('invite-c','alice','!дуэль @bob');f.clock.now+=60001;assert.match((await f.command('expired','bob','!принять')).message,/истёк/);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM fishing_duels WHERE status='completed'").get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_duel_locks').get().n,0);
 assert.ok(await f.command('invite-d','bob','!дуэль @carol'));
});
test('fish duel validates opponents and live collector lease, and rejects concurrent conflicting invitations',async()=>{
 const f=await duelFixture();assert.equal(await f.command('lease-bad','alice','!дуэль @bob','owner_channel','wrong'),null);assert.equal(await f.command('channel-bad','alice','!дуэль @bob','other_channel'),null);
 assert.match((await f.command('self','alice','!дуэль @alice')).message,/себя/);assert.match((await f.command('missing','alice','!дуэль @nobody')).message,/сначала должен|30 с/);f.clock.now+=31000;
 await Promise.all([f.command('parallel-1','alice','!дуэль @bob'),f.command('parallel-2','carol','!дуэль @bob')]);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_duels').get().n,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM fishing_duel_locks').get().n,2);
 const results=await Promise.all([f.command('accept-1','bob','!принять'),f.command('accept-2','bob','!принять')]);assert.equal(results.filter(r=>r&&/Дуэль!/.test(r.message)).length,1);assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM fishing_duels WHERE status='completed'").get().n,1);
});

test('fish duels stay in the friend room and bot replies there using the operator account',async()=>{
 const f=await duelFixture(),channels=await f.load('app/api/twitch/bot/channels/route.ts');await channels.POST(friendRequest());
 f.sql.prepare('UPDATE fishing_games SET collector_token=?,collector_until=? WHERE channel=?').run('friend-lease',f.clock.now+120000,'friend_channel');
 for(const row of f.sql.prepare('SELECT username,state FROM fishing_players WHERE channel=?').all('owner_channel'))f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,31,0,0)').run('friend_channel',row.username,row.state);
 const invite=await f.command('friend-duel','alice','!дуэль @bob','friend_channel','friend-lease');assert.ok(invite);assert.match((await f.command('wrong-room','bob','!принять')).message,/Нет вызова/);
 assert.ok(await f.command('friend-accept','bob','!принять','friend_channel','friend-lease'));assert.equal(f.sql.prepare('SELECT channel FROM fishing_duels').get().channel,'friend_channel');
 const {flushBot}=await f.load('lib/twitch-bot/storage.ts');await flushBot(f.connection,'friend_channel');assert.equal(f.sent[0].broadcaster_id,'999');assert.equal(f.sent[0].sender_id,'123');assert.match(f.sent[0].message,/дуэль/i);
});

test('fish stakes are frozen at invitation; wins transfer exactly one, and draws and refusals take nothing',async()=>{
 for(const [rolls,tie] of [[[100,0],false],[[10,0],true]]){
  const f=await duelFixture({randomValues:rolls});const invite=await f.command('stake-invite','alice','!дуэль @bob');assert.match(invite.message,/!принять \/ !отказ/);
  const stored=f.sql.prepare('SELECT * FROM fishing_duels').get();assert.equal(stored.opponent_fish,'lake_pike');
  f.sql.prepare("UPDATE fishing_players SET state=json_set(state,'$.inventory.void_boss',1) WHERE channel=? AND username=?").run('owner_channel','bob');
  const before=f.sql.prepare('SELECT username,state FROM fishing_players ORDER BY username').all();await f.command('stake-accept','bob','!принять');const duel=f.sql.prepare('SELECT * FROM fishing_duels').get();assert.equal(duel.opponent_fish,'lake_pike');
  if(tie){assert.equal(duel.winner,null);assert.equal(duel.transferred_fish,null);assert.deepEqual(f.sql.prepare('SELECT username,state FROM fishing_players ORDER BY username').all(),before);}
  else{assert.equal(duel.winner,'alice');assert.equal(duel.transferred_fish,'lake_pike');const a=JSON.parse(f.sql.prepare('SELECT state FROM fishing_players WHERE username=?').get('alice').state),b=JSON.parse(f.sql.prepare('SELECT state FROM fishing_players WHERE username=?').get('bob').state);assert.equal(a.inventory.lake_pike,1);assert.equal(b.inventory.lake_pike,1);assert.equal(b.inventory.void_boss,1);assert.equal(a.coins,31);assert.equal(b.coins,31);
   await f.command('stake-accept-retry','bob','!принять');assert.equal(JSON.parse(f.sql.prepare('SELECT state FROM fishing_players WHERE username=?').get('alice').state).inventory.lake_pike,1);}
 }
 const f=await duelFixture();const before=f.sql.prepare('SELECT username,state FROM fishing_players ORDER BY username').all();await f.command('refuse-invite','alice','!дуэль @bob');await f.command('refuse','bob','!отказ');assert.deepEqual(f.sql.prepare('SELECT username,state FROM fishing_players ORDER BY username').all(),before);
});
test('missing fish cancels the duel; concurrent catch state is preserved and transfer bumps revision',async()=>{
 const missing=await duelFixture();await missing.command('missing-invite','alice','!дуэль @bob');missing.sql.prepare("UPDATE fishing_players SET state=json_set(state,'$.inventory.lake_carp',0) WHERE username='alice'").run();const answer=await missing.command('missing-accept','bob','!принять');assert.match(answer.message,/отменена/);assert.equal(missing.sql.prepare('SELECT status FROM fishing_duels').get().status,'cancelled');assert.equal(missing.sql.prepare('SELECT COUNT(*) n FROM fishing_duel_locks').get().n,0);
 const f=await duelFixture({randomValues:[100,0]});await f.command('catch-invite','alice','!дуэль @bob');const batch=f.db.batch;
 f.db.batch=async statements=>{f.sql.prepare("UPDATE fishing_players SET state=json_set(state,'$.coins',99,'$.inventory.lake_carp',5,'$.lastCatch',?),coins=99,rev=rev+1 WHERE channel='owner_channel' AND username='alice'").run(f.clock.now);return batch(statements);};
 await f.command('catch-accept','bob','!принять');const row=f.sql.prepare("SELECT * FROM fishing_players WHERE username='alice'").get(),state=JSON.parse(row.state);assert.equal(row.rev,2);assert.equal(state.coins,99);assert.equal(state.inventory.lake_carp,5);assert.equal(state.inventory.lake_pike,1);assert.equal(state.lastCatch,f.clock.now);
});

test('losing the last copy removes it from the pond inventory and transfers it only once',async()=>{
 const f=await duelFixture({randomValues:[100,0]});f.sql.prepare("UPDATE fishing_players SET state=json_set(state,'$.inventory.lake_pike',1) WHERE username='bob'").run();await f.command('last-invite','alice','!дуэль @bob');await Promise.all([f.command('last-accept-1','bob','!принять'),f.command('last-accept-2','bob','!принять')]);
 const a=JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='alice'").get().state),b=JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='bob'").get().state);assert.equal(a.inventory.lake_pike,1);assert.equal('lake_pike' in b.inventory,false);assert.match((await f.command('empty-inventory','bob','!инвентарь')).message,/Садок пока пуст/);
});

test('bait consumes only ordinary fish and exactly one charge per successful cast',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),p=game.newPlayer();p.inventory={lake_carp:10,lake_pike:3,void_boss:2};
 const made=game.play(p,'!обменять наживку',f.clock.now,null,()=>.5);assert.equal(made.state.bait,1);assert.equal(made.state.inventory.lake_carp,5);assert.equal(made.state.inventory.void_boss,2);
 const plain=game.probabilities(p,null).filter(x=>game.rarities.indexOf(x.item.rarity)>=3).reduce((n,x)=>n+x.chance,0),boost=game.probabilities(made.state,null).filter(x=>game.rarities.indexOf(x.item.rarity)>=3).reduce((n,x)=>n+x.chance,0);assert.ok(boost>plain);
 const cooldown=game.play({...made.state,lastCatch:f.clock.now},'!рыба',f.clock.now,null,()=>.5);assert.equal(cooldown.state.bait,1);
 const caught=game.play(made.state,'!рыба',f.clock.now,null,()=>.5);assert.equal(caught.state.bait,0);assert.ok(caught.item);
 const empty=game.play({...p,inventory:{void_boss:2}},'!обменять наживку',f.clock.now,null,()=>.5);assert.equal(empty.state.bait,0);assert.equal(empty.state.inventory.void_boss,2);
});
test('cat stays dormant until first feed, settles offline trips only while alive, and retains purchased skins after death',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),pets=await f.load('lib/fishing/cat.ts');let p=game.newPlayer();p.coins=1000;p.inventory={lake_carp:10};
 p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;assert.equal(p.coins,900);assert.equal(p.cat.active,false);
 p=game.play(p,'!кот',f.clock.now+7*86400000,null,()=>.5).state;assert.equal(p.cat.alive,true);assert.equal(p.cat.finds,0);
 const start=f.clock.now+7*86400000;p=game.play(p,'!кот корм lake_carp',start,null,()=>.5).state;assert.equal(p.cat.active,true);assert.equal(p.inventory.lake_carp,9);assert.equal(p.cat.fedUntil,start+3*3600000);
 pets.settleCat(p,start+20*86400000,()=>.5);assert.equal(p.cat.alive,false);assert.equal(p.cat.finds,1);assert.equal(p.cat.history.length,1);const inventory=structuredClone(p.inventory);pets.settleCat(p,start+30*86400000,()=>.5);assert.deepEqual(p.inventory,inventory);
 const fedDead=game.play(p,'!кот корм',start+30*86400000,null,()=>.5);assert.equal(fedDead.state.cat.alive,false);assert.deepEqual(fedDead.state.inventory,p.inventory);
 p=game.play(p,'!кот новый',start+30*86400000,null,()=>.5).state;assert.equal(p.cat.active,false);assert.equal(p.cat.level,1);assert.ok(p.cat.owned.includes('white'));
});
test('cat fines never make balance negative; upgrades and feeding caps consume only their stated resources',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),pets=await f.load('lib/fishing/cat.ts');let p=game.newPlayer();p.coins=500;p.inventory={lake_carp:10};
 p=game.play(p,'!кот купить ginger',f.clock.now,null,()=>.5).state;assert.equal(p.coins,200);p=game.play(p,'!кот купить ginger',f.clock.now,null,()=>.5).state;assert.equal(p.coins,200);
 p=game.play(p,'!кот улучшить',f.clock.now,null,()=>.5).state;assert.equal(p.coins,100);assert.equal(p.cat.level,2);
 for(let i=0;i<4;i++)p=game.play(p,'!кот корм lake_carp',f.clock.now,null,()=>.5).state;assert.equal(p.cat.fedUntil,f.clock.now+12*3600000);const amount=p.inventory.lake_carp;
 p=game.play(p,'!кот корм lake_carp',f.clock.now,null,()=>.5).state;assert.equal(p.inventory.lake_carp,amount);
 p.coins=2;pets.settleCat(p,f.clock.now+90*60000,()=>0);assert.equal(p.coins,0);assert.equal(p.cat.fines,2);assert.equal(p.cat.finds,0);assert.equal(p.cat.history[0].type,'fine');
});
test('concurrent profile reads settle cat finds once and persist correct coins and revision',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),storage=await f.load('lib/fishing/storage.ts');let p=game.newPlayer();p.coins=500;p.inventory={lake_carp:2};p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;p=game.play(p,'!кот корм',f.clock.now,null,()=>.5).state;
 f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,400,0,0)').run('owner_channel','catfan',JSON.stringify(p));p.cat.clockElapsed=0;p.cat.clockAt=f.clock.now;p.cat.paused=false;f.sql.prepare("UPDATE fishing_players SET state=? WHERE username='catfan'").run(JSON.stringify(p));f.clock.now+=2*3600000;f.sql.prepare('INSERT INTO fishing_cat_clocks(channel,elapsed,checked,live,stream_id) VALUES(?, ?, ?, 1, ?)').run('owner_channel',2*3600000,f.clock.now,'stream-owner_channel');
 await Promise.all([storage.readPlayer('owner_channel','catfan'),storage.readPlayer('owner_channel','catfan')]);const row=f.sql.prepare("SELECT * FROM fishing_players WHERE username='catfan'").get(),saved=JSON.parse(row.state);assert.equal(row.rev,1);assert.equal(saved.cat.history.length,1);assert.equal(row.coins,saved.coins);await storage.readPlayer('owner_channel','catfan');assert.equal(f.sql.prepare("SELECT rev FROM fishing_players WHERE username='catfan'").get().rev,1);
});
test('website cat actions use only the authenticated Twitch profile and replay without a second purchase or feeding',async()=>{
 const f=await fixture();f.viewer('lick0ver','777');const game=await f.load('lib/fishing/game.ts'),p=game.newPlayer();p.coins=1000;p.inventory={lake_carp:10};
 for(const name of ['lick0ver','someone'])f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,1000,0,0)').run('owner_channel',name,JSON.stringify(p));
 const route=await f.load('app/api/fishing/action/route.ts'),request=(command,id=crypto.randomUUID(),origin='https://site.test')=>new Request('https://site.test/api/fishing/action',{method:'POST',headers:{origin},body:JSON.stringify({channel:'owner_channel',command,requestId:id,username:'someone',player:{coins:999999}})});
 assert.equal((await route.POST(request('!кот купить white',undefined,'https://other.test'))).status,403);assert.equal((await route.POST(request('!купить 5'))).status,400);
 const id=crypto.randomUUID();assert.equal((await route.POST(request('!кот купить white',id))).status,200);const retry=await route.POST(request('!кот купить white',id));assert.equal((await retry.json()).replayed,true);assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='lick0ver'").get().coins,900);assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='someone'").get().coins,1000);
 const feedId=crypto.randomUUID();await route.POST(request('!кот корм',feedId));await route.POST(request('!кот корм',feedId));assert.equal(JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='lick0ver'").get().state).inventory.lake_carp,9);
 f.setUser(null);assert.equal((await route.POST(request('!кот'))).status,401);
});
test('duel-staked fish cannot be consumed by bait or cat food, including a lock appearing during a command',async()=>{
 const f=await duelFixture(),game=await f.load('lib/fishing/game.ts');let p=game.newPlayer();p.coins=500;p.inventory={lake_carp:10};p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;
 f.sql.prepare("UPDATE fishing_players SET state=?,coins=? WHERE username='alice'").run(JSON.stringify(p),p.coins);await f.command('pet-duel-invite','alice','!дуэль @bob');const bait=await f.command('pet-locked-bait','alice','!обменять наживку');assert.match(bait.message,/закончи дуэль/);const feed=await f.command('pet-locked-feed','alice','!кот корм');assert.match(feed.message,/закончи дуэль/);assert.equal(JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='alice'").get().state).inventory.lake_carp,10);
 await f.command('pet-cancel','alice','!отмена');const batch=f.db.batch;let locked=false;
 f.db.batch=async statements=>{if(!locked){locked=true;f.sql.prepare('INSERT INTO fishing_duel_locks(channel,username,duel,expires) VALUES(?,?,?,?)').run('owner_channel','alice','late-duel',f.clock.now+60000);}return batch(statements);};
 const answer=await f.command('pet-racing-feed','alice','!кот корм');assert.match(answer.message,/закончи дуэль/);const saved=JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='alice'").get().state);assert.equal(saved.cat.active,false);assert.equal(saved.inventory.lake_carp,10);
});

test('cat food and bait accept fish, not coins, relics or other inedible loot',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts');let p=game.newPlayer();p.coins=500;p.inventory={ruins_coin:10,ruins_chain:10,lake_treasure:2};p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;
 const bait=game.play(p,'!обменять наживку',f.clock.now,null,()=>.5),feed=game.play(p,'!кот корм',f.clock.now,null,()=>.5);assert.equal(bait.state.bait,0);assert.deepEqual(bait.state.inventory,p.inventory);assert.equal(feed.state.cat.active,false);assert.deepEqual(feed.state.inventory,p.inventory);
});

test('bait purchases validate quantities and balance without consuming fish',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts');const p=game.newPlayer();p.coins=100;p.inventory={lake_carp:10};
 const bought=game.play(p,'!наживка купить 3',f.clock.now,null,()=>.5).state;assert.equal(bought.coins,40);assert.equal(bought.bait,3);assert.deepEqual(bought.inventory,p.inventory);
 for(const command of ['!наживка купить 0','!bait buy -1','!bait buy 1.5','!bait buy 21','!bait buy 2 extra','!bait buy 6']){const answer=game.play(p,command,f.clock.now,null,()=>.5).state;assert.equal(answer.coins,100);assert.equal(answer.bait,0);assert.deepEqual(answer.inventory,p.inventory);}
});
test('website bait purchase replay charges once and allows buying during a fish duel',async()=>{
 const f=await fixture();f.viewer('lick0ver','777');const game=await f.load('lib/fishing/game.ts'),p=game.newPlayer();p.coins=100;p.inventory={lake_carp:10};
 f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,100,0,0)').run('owner_channel','lick0ver',JSON.stringify(p));f.sql.prepare('INSERT INTO fishing_duel_locks(channel,username,duel,expires) VALUES(?,?,?,?)').run('owner_channel','lick0ver','active-duel',f.clock.now+60000);
 const route=await f.load('app/api/fishing/action/route.ts'),id=crypto.randomUUID(),request=()=>new Request('https://site.test/api/fishing/action',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({channel:'owner_channel',command:'!наживка купить 2',requestId:id})});
 assert.equal((await route.POST(request())).status,200);assert.equal((await (await route.POST(request())).json()).replayed,true);const saved=JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='lick0ver'").get().state);assert.equal(saved.coins,60);assert.equal(saved.bait,2);assert.equal(saved.inventory.lake_carp,10);
});

test('admin hazard endpoint rejects viewers, guests, cross origin, malformed channels and missing games',async()=>{
 const f=await fixture(),route=await f.load('app/api/fishing/event/route.ts');const request=(channel='owner_channel',origin='https://site.test')=>new Request('https://site.test/api/fishing/event',{method:'POST',headers:{origin},body:JSON.stringify({channel,requestId:crypto.randomUUID()})});assert.equal((await route.POST(request())).status,403);f.setUser(null);assert.equal((await route.POST(request())).status,401);
 const a=await fixture({admin:true}),adminRoute=await a.load('app/api/fishing/event/route.ts');a.linkFishingOwner();assert.equal((await adminRoute.POST(request('owner_channel','https://other.test'))).status,403);assert.equal((await adminRoute.POST(request('../owner'))).status,400);a.sql.exec('DELETE FROM fishing_games');assert.equal((await adminRoute.POST(request())).status,409);assert.equal(a.sql.prepare('SELECT COUNT(*) AS n FROM fishing_hazards').get().n,0);
});
test('seagulls steal only coins once and leave fish and other channels unchanged',async()=>{
 const f=await fixture({admin:true,randomValues:[0]}),game=await f.load('lib/fishing/game.ts'),hazards=await f.load('lib/fishing/hazards.ts');
 for(const [channel,name] of [['owner_channel','alice'],['friend_channel','carol']]){const p=game.newPlayer();p.coins=10;p.inventory={lake_carp:5,ruins_coin:5};f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,10,0,0)').run(channel,name,JSON.stringify(p));}
 const g=f.sql.prepare('SELECT * FROM fishing_games').get(),result=await hazards.launchHazard(g,'owner','test-seagulls');assert.equal(result.event,'seagulls');const alice=JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='alice'").get().state);assert.equal(alice.coins,9);assert.equal(alice.inventory.lake_carp,5);assert.equal(alice.inventory.ruins_coin,5);assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='carol'").get().coins,10);
 const retry=await hazards.launchHazard(g,'owner','test-seagulls');assert.equal(retry.replayed,true);assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='alice'").get().coins,9);assert.equal(await hazards.launchHazard(g,'owner','another-run'),null);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE message_id LIKE ?').get('hazard:%').n,1);
});
test('coin hazard updates inventory JSON and leaderboard atomically, never below zero, and concurrent starts charge once',async()=>{
 const f=await fixture({admin:true,randomValues:[3000000000,3000000000]}),game=await f.load('lib/fishing/game.ts'),hazards=await f.load('lib/fishing/hazards.ts');for(const [name,coins] of [['rich',1000],['poor',1],['zero',0]]){const p=game.newPlayer();p.coins=coins;p.inventory={lake_carp:2};f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,?,0,0)').run('owner_channel',name,JSON.stringify(p),coins);}
 const g=f.sql.prepare('SELECT * FROM fishing_games').get();await Promise.all([hazards.launchHazard(g,'owner','coins-a'),hazards.launchHazard(g,'owner','coins-b')]);assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM fishing_hazards').get().n,1);
 for(const [name,expected] of [['rich',975],['poor',0],['zero',0]]){const row=f.sql.prepare('SELECT * FROM fishing_players WHERE username=?').get(name),p=JSON.parse(row.state);assert.equal(row.coins,expected);assert.equal(p.coins,expected);assert.equal(p.inventory.lake_carp,2);}assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM fishing_hazard_losses').get().n,2);
});
test('failed hazard transaction rolls back every loss and run; automatic events never select a hazard',async()=>{
 const f=await fixture({randomValues:[4000000000]}),game=await f.load('lib/fishing/game.ts'),hazards=await f.load('lib/fishing/hazards.ts'),storage=await f.load('lib/fishing/storage.ts');const p=game.newPlayer();p.coins=100;f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,100,0,0)').run('owner_channel','alice',JSON.stringify(p));f.sql.exec("CREATE TRIGGER reject_hazard BEFORE INSERT ON chat_messages BEGIN SELECT RAISE(ABORT,'test rollback'); END;");const g=f.sql.prepare('SELECT * FROM fishing_games').get();await assert.rejects(hazards.launchHazard(g,'owner','rollback'));assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM fishing_hazards').get().n,0);assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='alice'").get().coins,100);
 f.sql.exec('UPDATE fishing_games SET next_event=0');const event=await storage.eventFor(f.sql.prepare('SELECT * FROM fishing_games').get());assert.ok(['storm','moon','void'].includes(event.id));
});

test('lick0ver gets administrator access only through their own verified Twitch identity',async()=>{
 const f=await fixture(),roles=await f.load('lib/streamer-auth.ts');f.viewer('lick0ver','888');let user={userId:'site-888',email:'viewer@example.test',displayName:'Viewer'};assert.equal((await roles.getRole(user)).admin,true);
 const route=await f.load('app/api/fishing/event/route.ts'),request=()=>new Request('https://site.test/api/fishing/event',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({channel:'owner_channel',requestId:crypto.randomUUID()})});assert.equal((await route.POST(request())).status,200);
 f.viewer('ordinary','999');user={userId:'site-999',email:'other@example.test',displayName:'lick0ver'};assert.equal((await roles.getRole(user)).admin,false);assert.equal((await route.POST(request())).status,403);assert.equal((await roles.getRole(null)).admin,false);
 f.sql.prepare("UPDATE fishing_accounts SET username='ordinary' WHERE user='site-888'").run();assert.equal((await roles.getRole({userId:'site-888',email:'viewer@example.test',displayName:'lick0ver'})).admin,false);
 f.sql.prepare("UPDATE twitch_connections SET channel='lick0ver' WHERE user='owner'").run();assert.equal((await roles.getRole({userId:'owner',email:'owner@example.test',displayName:'Owner'})).admin,true);
});

test('admin can launch a visible hazard in a disabled friend game without enabling fishing',async()=>{
 const f=await fixture({admin:true,randomValues:[0]}),route=await f.load('app/api/fishing/event/route.ts'),game=await f.load('lib/fishing/game.ts'),effects=await f.load('lib/fishing/effects.ts'),snapshot=await f.load('app/api/fishing/route.ts');f.linkFishingOwner();f.sql.exec("UPDATE fishing_games SET enabled=0,owner='friend-owner'");const p=game.newPlayer();p.inventory={lake_carp:1};f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,0,0,0)').run('owner_channel','friend',JSON.stringify(p));
 const request=new Request('https://site.test/api/fishing/event',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({channel:'owner_channel',requestId:crypto.randomUUID()})});assert.equal((await route.POST(request)).status,200);assert.equal(f.sql.prepare('SELECT enabled FROM fishing_games').get().enabled,0);assert.equal(JSON.parse(f.sql.prepare("SELECT state FROM fishing_players WHERE username='friend'").get().state).inventory.lake_carp,1);
 const data=await (await snapshot.GET(new Request('https://site.test/api/fishing?channel=owner_channel'))).json();assert.equal(data.event.id,'seagulls');assert.equal(effects.sceneEvent('live','calm',{event:data.event,enabled:false,activeUntil:data.game.activeUntil},f.clock.now).id,'seagulls');assert.equal(effects.sceneEvent('live','calm',{event:game.naturalEvents[0],enabled:false,activeUntil:f.clock.now+1000},f.clock.now),null);
});

test('very rare abductors steal coins and only one living cat, preserve skins and stop farming; replay does not steal again',async()=>{
 const f=await fixture({admin:true,randomValues:[4294000000]}),game=await f.load('lib/fishing/game.ts'),hazards=await f.load('lib/fishing/hazards.ts'),pets=await f.load('lib/fishing/cat.ts');
 for(const name of ['alice','bob','dead','empty']){let p=game.newPlayer();p.coins=1000;p.inventory={lake_carp:10};if(name!=='empty'){p=game.play(p,'!кот купить ginger',f.clock.now,null,()=>.5).state;p=game.play(p,'!кот корм',f.clock.now,null,()=>.5).state;if(name==='dead')p.cat.alive=false;}f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,?,0,0)').run('owner_channel',name,JSON.stringify(p),p.coins);}
 const g=f.sql.prepare('SELECT * FROM fishing_games').get(),result=await hazards.launchHazard(g,'owner','abduction');assert.equal(result.event,'abductors');const losses=f.sql.prepare("SELECT * FROM fishing_hazard_losses WHERE item='cat'").all();assert.equal(losses.length,1);assert.ok(['alice','bob'].includes(losses[0].username));const row=f.sql.prepare('SELECT * FROM fishing_players WHERE username=?').get(losses[0].username),p=JSON.parse(row.state);assert.equal(p.coins,675);assert.equal(p.cat.stolen,true);assert.equal(p.cat.alive,false);assert.equal(p.cat.active,false);assert.ok(p.cat.owned.includes('ginger'));assert.equal(p.inventory.lake_carp,9);assert.equal(pets.settleCat(p,f.clock.now+2*3600000,()=>.5),false);
 assert.match(game.play(p,'!кот',f.clock.now,null,()=>.5).message,/похищен/);const replacement=game.play(p,'!кот новый',f.clock.now,null,()=>.5).state;assert.equal(replacement.cat.alive,true);assert.equal(replacement.cat.stolen,undefined);assert.ok(replacement.cat.owned.includes('ginger'));
 await hazards.launchHazard(g,'owner','abduction');assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM fishing_hazard_losses WHERE item='cat'").get().n,1);assert.equal(f.sql.prepare('SELECT coins FROM fishing_players WHERE username=?').get(losses[0].username).coins,675);
});
test('rare hazard with no living cats still deducts only coins and records no cat loss',async()=>{
 const f=await fixture({randomValues:[4294000000]}),game=await f.load('lib/fishing/game.ts'),hazards=await f.load('lib/fishing/hazards.ts');const p=game.newPlayer();p.coins=1;f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,1,0,0)').run('owner_channel','alice',JSON.stringify(p));const r=await hazards.launchHazard(f.sql.prepare('SELECT * FROM fishing_games').get(),'owner','no-cat');assert.match(r.message,/не удалось похитить/);assert.equal(f.sql.prepare("SELECT coins FROM fishing_players WHERE username='alice'").get().coins,0);assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM fishing_hazard_losses WHERE item='cat'").get().n,0);
});

test('cat hunger and finds freeze offline for days, resume with confirmed live minutes, and freeze on Twitch errors',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),storage=await f.load('lib/fishing/storage.ts');f.setStreamLive(false);let p=game.newPlayer();p.coins=500;p.inventory={lake_carp:3};f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,500,0,0)').run('owner_channel','catfan',JSON.stringify(p));
 await storage.performFishCommand('owner_channel','pause-buy','catfan','!кот купить white');await storage.performFishCommand('owner_channel','pause-feed','catfan','!кот корм');p=await storage.readPlayer('owner_channel','catfan');const reserve=p.cat.fedUntil-p.cat.clockAt;assert.equal(reserve,3*3600000);assert.equal(p.cat.paused,true);
 f.clock.now+=10*86400000;p=await storage.readPlayer('owner_channel','catfan');assert.equal(p.cat.alive,true);assert.equal(p.cat.fedUntil-p.cat.clockAt,reserve);assert.equal(p.cat.finds,0);assert.equal(p.coins,400);
 f.setStreamLive(true);f.clock.now+=60001;p=await storage.readPlayer('owner_channel','catfan');assert.equal(p.cat.paused,false);assert.equal(p.cat.fedUntil-p.cat.clockAt,reserve);f.clock.now+=60001;p=await storage.readPlayer('owner_channel','catfan');assert.equal(p.cat.fedUntil-p.cat.clockAt,reserve-60001);
 f.setStreamLive(false);f.clock.now+=60001;p=await storage.readPlayer('owner_channel','catfan');const remaining=p.cat.fedUntil-p.cat.clockAt;assert.equal(p.cat.paused,true);f.setStreamError(true);f.setStreamLive(true);f.clock.now+=20*86400000;p=await storage.readPlayer('owner_channel','catfan');assert.equal(p.cat.alive,true);assert.equal(p.cat.fedUntil-p.cat.clockAt,remaining);assert.equal(p.cat.finds,0);
});
test('a short cat food reserve expires during confirmed live time but cannot expire offline',async()=>{
 for(const online of [true,false]){const f=await fixture(),game=await f.load('lib/fishing/game.ts'),storage=await f.load('lib/fishing/storage.ts');f.setStreamLive(online);let p=game.newPlayer();p.coins=1000;p.inventory={lake_carp:2};p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;p=game.play(p,'!кот корм',f.clock.now,null,()=>.5).state;p.cat.clockAt=f.clock.now;p.cat.clockElapsed=0;p.cat.paused=false;p.cat.fedUntil=f.clock.now+30000;
 f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,900,0,0)').run('owner_channel','catfan',JSON.stringify(p));f.sql.prepare('INSERT INTO fishing_cat_clocks(channel,elapsed,checked,live,stream_id) VALUES(?,0,?,1,?)').run('owner_channel',f.clock.now,'stream-owner_channel');f.clock.now+=60001;p=await storage.readPlayer('owner_channel','catfan');assert.equal(p.cat.alive,!online);}
});
test('cat coin finds award only one to three coins, preserve fish and human catch statistics, and stop while paused',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),pets=await f.load('lib/fishing/cat.ts');let p=game.newPlayer();p.coins=500;p.inventory={lake_carp:2};p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;p=game.play(p,'!кот корм',f.clock.now,null,()=>.5).state;
 const inventory=structuredClone(p.inventory),catches=p.catches;let rolls=[.3,.99];pets.settleCat(p,f.clock.now+2*3600000,()=>rolls.shift()??.5);assert.equal(p.coins,403);assert.equal(p.cat.coinsFound,3);assert.equal(p.cat.history[0].type,'coins');assert.deepEqual(p.inventory,inventory);assert.equal(p.catches,catches);assert.equal(p.cat.finds,0);p.cat.paused=true;assert.equal(pets.settleCat(p,f.clock.now+10*86400000,()=>.3),false);assert.equal(p.coins,403);assert.equal(p.cat.alive,true);
});

test('legacy living cats whose wall-clock food expired offline migrate safely without revival of dead pets',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),storage=await f.load('lib/fishing/storage.ts');f.setStreamLive(false);let p=game.newPlayer();p.coins=500;p.inventory={lake_carp:2};p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;p=game.play(p,'!кот корм',f.clock.now,null,()=>.5).state;
 for(const name of ['alive','dead']){const state=structuredClone(p);if(name==='dead'){state.cat.alive=false;state.cat.active=false;}f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,400,0,0)').run('owner_channel',name,JSON.stringify(state));}f.clock.now+=7*86400000;const alive=await storage.readPlayer('owner_channel','alive'),dead=await storage.readPlayer('owner_channel','dead');assert.equal(alive.cat.alive,true);assert.equal(alive.cat.paused,true);assert.equal(alive.cat.fedUntil-alive.cat.clockAt,3*3600000);assert.equal(alive.cat.finds,0);assert.equal(dead.cat.alive,false);
});

test('guests read public Twitch chat and events without receiving organizer capabilities or diagnostics',async()=>{
 const f=await fixture(),feed=await f.load('app/api/twitch/feed/route.ts');const state={pin:{id:'pin',userId:'123',name:'Streamer',text:'Закреп',fragments:[],endsAt:null},prediction:{id:'prediction',title:'Ставка',status:'ACTIVE',endsAt:f.clock.now+10000,finishedAt:null,winner:null,outcomes:[]},poll:{id:'poll',title:'Голосование',status:'ACTIVE',endsAt:f.clock.now+10000,finishedAt:null,choices:[]},capabilities:{pin:true,prediction:true,poll:true},warnings:['private collector diagnostic'],subscriptionWarnings:['private scope warning']};
 f.sql.prepare('INSERT INTO chat_channels(channel,owner,collector_token,collector_until,status,error,state) VALUES(?,?,?,?,?,?,?)').run('owner_channel','owner','secret-lease',f.clock.now+60000,'connected','private collector error',JSON.stringify(state));
 const message={id:'public-message',kind:'message',userId:'555',login:'viewer',name:'Viewer',color:'',badges:[],text:'Привет из Twitch',fragments:[],created:f.clock.now};f.sql.prepare('INSERT INTO chat_messages(channel,message_id,user_id,payload,created,removed) VALUES(?,?,?,?,?,0)').run('owner_channel',message.id,message.userId,JSON.stringify(message),f.clock.now);
 const req=channel=>new Request('https://site.test/api/twitch/feed?channel='+channel);let own=await (await feed.GET(req('owner_channel'))).json();assert.equal(own.canCollect,true);assert.equal(own.state.capabilities.pin,true);assert.equal(own.error,'private collector error');
 f.setUser(null);const response=await feed.GET(req('owner_channel'));assert.equal(response.status,200);const guest=await response.json();assert.equal(guest.messages[0].text,message.text);assert.equal(guest.state.pin.text,'Закреп');assert.equal(guest.state.prediction.title,'Ставка');assert.equal(guest.state.poll.title,'Голосование');assert.equal(guest.canCollect,false);assert.equal(guest.needsPermissions,false);assert.equal(guest.error,null);assert.equal(guest.state.capabilities,undefined);assert.equal(guest.state.warnings,undefined);assert.equal(guest.collector_token,undefined);assert.equal((await feed.GET(req('unknown_channel'))).status,404);
 const collector=await f.load('app/api/twitch/feed/live/route.ts');assert.equal((await collector.GET(new Request('https://site.test/api/twitch/feed/live?channel=owner_channel'))).status,401);
 const sender=await f.load('app/api/twitch/chat/route.ts');assert.equal((await sender.POST(new Request('https://site.test/api/twitch/chat',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({channel:'owner_channel',message:'guest message'})}))).status,401);
});

test('cat names unlock only at level five, preserve case, appear in status and reset for a new cat',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts');let p=game.newPlayer();p.coins=10000;p=game.play(p,'!купить кота Белый',f.clock.now,null,()=>.5).state;p.cat.level=4;let out=game.play(p,'!кот Мурка',f.clock.now,null,()=>.5);assert.equal(out.state.cat.name,undefined);assert.match(out.message,/5 уровне/);
 p=game.play(p,'!кот улучшить',f.clock.now,null,()=>.5).state;out=game.play(p,'!кот Мурка',f.clock.now,null,()=>.5);assert.equal(out.state.cat.name,'Мурка');assert.equal(out.state.coins,p.coins);p=out.state;assert.match(game.play(p,'!кот',f.clock.now,null,()=>.5).message,/«Мурка»/);p=game.play(p,'!купить кота Серый',f.clock.now,null,()=>.5).state;assert.equal(p.cat.name,'Мурка');p.cat.alive=false;p.cat.active=false;p=game.play(p,'!кот новый',f.clock.now,null,()=>.5).state;assert.equal(p.cat.name,undefined);assert.equal(p.cat.level,1);
});
test('cat name validation blocks profanity, mixed alphabet bypasses, links and mentions',async()=>{
 const f=await fixture(),names=await f.load('lib/fishing/cat-names.ts');for(const name of ['Мурка','Луна','Sir Kitty','Лёва','Барсик'])assert.equal(names.validateCatName(name).error,null,name);
 for(const name of ['fuck','FuCk','f-u-c-k','fuсk','пидор','@lick0ver','https://twitch.tv','<script>','1','Котик123','К'.repeat(21)])assert.ok(names.validateCatName(name).error,name);
 assert.equal(names.catNameCandidate('!кот корм'),null);assert.equal(names.catNameCandidate('!кот'),null);assert.equal(names.catNameCandidate('!кот Мурка'),'Мурка');assert.equal(names.catNameCandidate('!кот имя Луна'),'Луна');
});
test('verified channel blocked terms reject cat names and a failed scoped moderation check does not bypass the filter',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),storage=await f.load('lib/fishing/storage.ts');f.connection.permissions.push('moderator:read:blocked_terms');let p=game.newPlayer();p.coins=1000;p=game.play(p,'!кот купить white',f.clock.now,null,()=>.5).state;p.cat.level=5;p.cat.name='Мурка';f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,900,0,0)').run('owner_channel','catfan',JSON.stringify(p));f.setCatBlockedTerms([{text:'Запрет*',expires_at:null}]);const blocked=await storage.performFishCommand('owner_channel','blocked-name','catfan','!кот Запретный');assert.match(blocked.entry.message,/запрещено/);assert.equal(blocked.player.cat.name,'Мурка');assert.ok(!blocked.entry.message.includes('Запретный'));
 f.setCatBlockedTerms([{text:'Луна',expires_at:new Date(f.clock.now-1).toISOString()}]);const allowed=await storage.performFishCommand('owner_channel','allowed-name','catfan','!кот Луна');assert.equal(allowed.player.cat.name,'Луна');f.setModerationUnavailable(true);const failed=await storage.performFishCommand('owner_channel','failed-name','catfan','!кот Барсик');assert.match(failed.entry.message,/Не удалось проверить/);assert.equal(failed.player.cat.name,'Луна');f.sql.exec("UPDATE fishing_games SET owner='unavailable-owner'");const disconnected=await storage.performFishCommand('owner_channel','disconnected-name','catfan','!кот Барсик');assert.match(disconnected.entry.message,/Не удалось проверить подключение/);assert.equal(disconnected.player.cat.name,'Луна');
});
test('Russian shelter and bait commands work on the website with authoritative prices, inventory and replay protection',async()=>{
 const f=await fixture(),game=await f.load('lib/fishing/game.ts'),api=await f.load('app/api/fishing/action/route.ts');f.viewer('lick0ver','888');const p=game.newPlayer();p.coins=1000;p.inventory={lake_carp:20,lake_pike:3};f.sql.prepare('INSERT INTO fishing_players(channel,username,state,rev,coins,catches,streak) VALUES(?,?,?,0,1000,0,0)').run('owner_channel','lick0ver',JSON.stringify(p));
 const request=(command,id=crypto.randomUUID())=>new Request('https://site.test/api/fishing/action',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({channel:'owner_channel',requestId:id,command})});const shelter=await (await api.POST(request('!приют'))).json();for(const name of ['Белый','Смокинг','Чёрный','Песочный','Серый','Шоколадный','Рыжий','Оливковый'])assert.ok(shelter.message.includes(name));assert.equal(shelter.player.coins,1000);
 const buyId=crypto.randomUUID();await api.POST(request('!купить кота Смокинг',buyId));const repeat=await (await api.POST(request('!купить кота Смокинг',buyId))).json();assert.equal(repeat.replayed,true);assert.equal(repeat.player.coins,850);assert.equal(repeat.player.cat.skin,'tuxedo');
 const info=await (await api.POST(request('!наживка'))).json();assert.match(info.message,/!купить наживку/);assert.match(info.message,/!обменять наживку/);assert.equal(info.player.inventory.lake_carp,20);
 const bought=await (await api.POST(request('!купить наживку 2'))).json();assert.equal(bought.player.coins,810);assert.equal(bought.player.bait,2);const exchangeId=crypto.randomUUID();await api.POST(request('!обменять наживку 2',exchangeId));const exchanged=await (await api.POST(request('!обменять наживку 2',exchangeId))).json();assert.equal(exchanged.replayed,true);assert.equal(exchanged.player.bait,4);assert.equal(exchanged.player.inventory.lake_carp,10);assert.equal(exchanged.player.inventory.lake_pike,3);assert.equal(exchanged.player.coins,810);
});
