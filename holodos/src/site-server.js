import {createCustomAssets} from './custom-assets.js';
import {createFeatureControl} from './feature-control.js';
import {freezeEarlyTesters} from './early-testers.js';
import {createCaseTickets} from './case-tickets.js';
import {createTwitchRewards} from './twitch-rewards.js';
import {caseRewardOptions} from './case-catalog.js';
import {canArt} from './duel-visuals.js';
import {createCaseManagement} from './case-management.js';
import {createVpShop} from './vp-shop.js';
import {createManualVp} from './manual-vp.js';
import {createVipShop} from './vip-shop.js';
import {createAdminWallet} from './admin-wallet.js';
import {createLeaderboard,createChatLeaderboard} from './leaderboard.js';
import {createChatCases} from './chat-cases.js';
import {shouldCountChatMessage} from './chat-statistics.js';
import {createCaseCatalog} from './case-catalog.js';
import {createCosmetics} from './cosmetics.js';
import {createFrames} from './frames.js';
import {createReviews} from './reviews.js';
import {createDuelVisuals} from './duel-visuals.js';
import {createNotifications} from './notifications.js';
import {createAvatars} from './avatars.js';
import {createSupport} from './support.js';
import {readFileSync,existsSync} from 'node:fs';
import {createHash,randomBytes,createHmac,timingSafeEqual} from 'node:crypto';

export function createSite({db,publicUrl,app,tokenRequest,validate,player,transaction,draw,cans,duelChallenge,duelRespond,say,channel,duelsEnabled,states,secret,channelConnections={helix:async()=>{throw Object.assign(Error('Подключи Twitch от владельца канала.'),{status:409})}},streamStatus={get:async()=>({live:false,known:false,checked_at:0})}}){
 const uploads=createCustomAssets(db,transaction);
 const cases=createCaseCatalog(db,transaction);
 const controls=createFeatureControl(db,transaction,()=>[['shop:vp','Магазин VP'],['shop:vip','Магазин VIP'],['sync:points','Twitch · баллы и выдача кейсов'],['sync:vip','Twitch · VIP-кейсы'],['sync:subscriber','Twitch · кейсы за подписку'],...cases.list().map(c=>['case:'+c.id,'Кейс · '+c.title]),...Object.entries(caseRewardOptions).map(([id,r])=>['reward:'+id,'Награда · '+r.label])]);
 const leaderboard=createLeaderboard(db);
 const support=createSupport(db,transaction);
 const reviews=createReviews(db,transaction);
 const duelVisuals=createDuelVisuals(db);
 db.exec("CREATE TABLE IF NOT EXISTS cosmetic_profiles(player_id TEXT PRIMARY KEY,frame TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',name_color TEXT NOT NULL DEFAULT '');");
 const frames=createFrames(db,transaction);
 const cosmetics=createCosmetics(db,transaction);
 const siteKey=createHash('sha256').update('war1ouss-web:'+secret).digest();
 const sitePages=new Set(['/','/casino','/cases','/duels','/top','/chat','/shop','/profile','/help','/requests','/widget']);
 const assetFiles={
 '/assets/twitch-panel.zip':{file:new URL('./site/twitch-panel.zip',import.meta.url),type:'application/zip'},
  '/assets/site.css':{file:new URL('./site/site.css',import.meta.url),type:'text/css; charset=utf-8'},
  '/assets/site.js':{file:new URL('./site/site.js',import.meta.url),type:'text/javascript; charset=utf-8'},
  '/assets/holodos-frame-2026.webp':{file:new URL('./site/holodos-frame-2026.webp',import.meta.url),type:'image/webp'},
  '/assets/hero-ultra-2026.webp':{file:new URL('./site/hero-ultra-2026.webp',import.meta.url),type:'image/webp'},
  '/assets/hero-main-2026.webp':{file:new URL('./site/hero-main-2026.webp',import.meta.url),type:'image/webp'},
  '/assets/casino-main-2026.webp':{file:new URL('./site/casino-main-2026.webp',import.meta.url),type:'image/webp'},
  '/assets/cases-main-2026.webp':{file:new URL('./site/cases-main-2026.webp',import.meta.url),type:'image/webp'},
  '/assets/duels-main-2026.webp':{file:new URL('./site/duels-main-2026.webp',import.meta.url),type:'image/webp'}
 };
 for(const id of ['white','green','mango','pink','blue','black','watermelon','yellow','w-edition']){
  assetFiles['/assets/slot-'+id+'.webp']={file:new URL('./site/slot-'+id+'.webp',import.meta.url),type:'image/webp'};
 }
 for(const id of ['donation','twitch','chat','vip','coins','subscriber'])assetFiles['/assets/case-'+id+'.webp']={file:new URL('./site/case-'+id+'.webp',import.meta.url),type:'image/webp'};
 assetFiles['/assets/frost-edge.webp']={file:new URL('./site/frost-edge.webp',import.meta.url),type:'image/webp'};
 for(const id of ['ultra','original','mango','thorn'])for(const ext of ['png','gif'])assetFiles['/assets/frame-'+id+'.'+ext]={file:new URL('./site/frame-'+id+'.'+ext,import.meta.url),type:'image/'+ext};
 assetFiles['/assets/frame-assault.png']={file:new URL('./site/frame-assault.png',import.meta.url),type:'image/png'};
 assetFiles['/assets/case-subscriber-open.webp']={file:new URL('./site/case-subscriber-open.webp',import.meta.url),type:'image/webp'};
 assetFiles['/assets/notification.mp3']={file:new URL('./site/notification.mp3',import.meta.url),type:'audio/mpeg'};
 for(const id of ['pipeline','pacific','khaotic','violet','badapple'])assetFiles['/assets/duel-can-'+id+'.webp']={file:new URL('./site/duel-can-'+id+'.webp',import.meta.url),type:'image/webp'};
 assetFiles['/assets/dela-gothic-one.woff']={file:new URL('./site/dela-gothic-one.woff',import.meta.url),type:'font/woff'};
 assetFiles['/assets/dela-gothic-one.ttf']={file:new URL('./site/dela-gothic-one.ttf',import.meta.url),type:'font/ttf'};
 for(const id of ['ears','jett','clove'])assetFiles['/assets/frame-'+id+'.png']={file:new URL('./site/frame-'+id+'.png',import.meta.url),type:'image/png'};
 assetFiles['/assets/site-features.js']={file:new URL('./site/site-features.js',import.meta.url),type:'text/javascript; charset=utf-8'};
 for(const id of ['cat','roses'])assetFiles['/assets/profile-'+id+'.svg']={file:new URL('./site/profile-'+id+'.svg',import.meta.url),type:'image/svg+xml'};
 const shell=readFileSync(new URL('./site/index.html',import.meta.url));
 const staticAssets={};
 for(const [name,info] of Object.entries(assetFiles)){
  try{staticAssets[name]={bytes:readFileSync(info.file),type:info.type};}catch(error){console.warn('War1ouss asset missing:',name,error.message);}
 }

 db.exec("CREATE TABLE IF NOT EXISTS web_sessions(token_hash TEXT PRIMARY KEY,player_id TEXT NOT NULL,login TEXT NOT NULL,display_name TEXT NOT NULL,avatar TEXT NOT NULL DEFAULT '',expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL);");
 db.exec("CREATE INDEX IF NOT EXISTS idx_web_sessions_expires ON web_sessions(expires_at);");
 db.exec("CREATE TABLE IF NOT EXISTS fridge_spins(id INTEGER PRIMARY KEY AUTOINCREMENT,request_id TEXT UNIQUE NOT NULL,player_id TEXT NOT NULL,login TEXT NOT NULL,cans_json TEXT NOT NULL,gain INTEGER NOT NULL,description TEXT NOT NULL,source TEXT NOT NULL CHECK(source IN ('chat','web')),created_at INTEGER NOT NULL);");
 db.exec("CREATE INDEX IF NOT EXISTS idx_fridge_spins_recent ON fridge_spins(id DESC);");
 db.exec("CREATE INDEX IF NOT EXISTS idx_fridge_spins_player ON fridge_spins(player_id,id DESC);");
 db.exec("CREATE TABLE IF NOT EXISTS chat_stats(player_id TEXT PRIMARY KEY,login TEXT NOT NULL,message_count INTEGER NOT NULL DEFAULT 0,last_seen INTEGER NOT NULL DEFAULT 0);");
 if(!db.prepare('PRAGMA table_info(chat_stats)').all().some(c=>c.name==='badges_json'))db.exec("ALTER TABLE chat_stats ADD COLUMN badges_json TEXT NOT NULL DEFAULT '{}'");
 const chatLeaderboard=createChatLeaderboard(db);
 const adminWallet=createAdminWallet(db,transaction);
 freezeEarlyTesters(db);
 const notifications=createNotifications(db);
 const tickets=createCaseTickets(db,transaction);
 const twitchRewards=createTwitchRewards({db,transaction,connections:channelConnections,tickets,controls});
 const vpShop=createVpShop(db,transaction,secret);
 const manualVp=createManualVp(db,transaction,adminWallet.lookup);
 const vipShop=createVipShop(db,transaction);
 const chatCases=createChatCases({db,transaction,cases,player,vipStatus:id=>vipShop.status(id),tickets,controls});
 const caseManagement=createCaseManagement(db,transaction,adminWallet.lookup,chatCases,tickets);
 const avatars=createAvatars(db,app,tokenRequest);
 db.prepare("DELETE FROM web_sessions WHERE expires_at<?").run(Date.now());

 function publicCases(){return cases.list().map(c=>{const rewards=c.rewards.filter(r=>controls.enabled('reward:'+r.id)),sum=rewards.reduce((s,r)=>s+r.weight,0);return {...c,enabled:controls.enabled('case:'+c.id)&&sum>0,art:uploads.list().find(a=>a.enabled&&a.kind==='case'&&a.target===c.id)?.src||'/assets/case-'+c.id+'.webp',rewards:rewards.map(r=>({...r,weight:sum?r.weight*100/sum:0,src:r.can?canArt(r.can):r.src}))};});}
 const secure=publicUrl.startsWith('https:')?'; Secure':'';
 const baseCookies='; Path=/; HttpOnly; SameSite=Lax'+secure;
 const securityHeaders={
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://static-cdn.jtvnw.net; connect-src 'self'; media-src 'self'; form-action 'self'; base-uri 'none'; frame-src 'self' https://player.twitch.tv; frame-ancestors 'none'"
 };
 function send(res,status,body,type='application/json; charset=utf-8',headers={}){
  res.writeHead(status,{...securityHeaders,'Content-Type':type,'Cache-Control':'no-store',...headers});
  res.end(body);
 }
 function json(res,status,data,headers={}){
  send(res,status,JSON.stringify(data),'application/json; charset=utf-8',headers);
 }
 function cookie(req,name){
  const found=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
  return found?found.slice(name.length+1):'';
 }
 function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
 function hash(token){return createHash('sha256').update(token).digest('hex');}
 function constantTime(a,b){
  const x=Buffer.from(String(a)),y=Buffer.from(String(b));
  return x.length===y.length&&timingSafeEqual(x,y);
 }
 function getSession(req){
  const token=cookie(req,'war_session');
  if(!/^[A-Za-z0-9_-]{40,60}$/.test(token))return null;
  const row=db.prepare("SELECT * FROM web_sessions WHERE token_hash=? AND expires_at>?").get(hash(token),Date.now());
  return row||null;
 }
 function csrf(session){
  return createHmac('sha256',siteKey).update('csrf:site:'+session.token_hash).digest('base64url');
 }
 function sameOrigin(req){
  const origin=String(req.headers.origin||'');
  const expected=new URL(publicUrl).origin;
  return origin===expected&&(!req.headers['sec-fetch-site']||req.headers['sec-fetch-site']==='same-origin');
 }
 async function readJson(req){
  if(!String(req.headers['content-type']||'').startsWith('application/json'))throw Error('Нужен JSON-запрос');
  let text='';
  for await(const part of req){
   text+=part;
   if(text.length>3000)throw Error('Слишком большой запрос');
  }
  const data=JSON.parse(text||'{}');
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('Неверный формат запроса');
  return data;
 }
 function actionId(data){
  const value=String(data.requestId||'');
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))throw Error('Неверный идентификатор запроса');
  return value.toLowerCase();
 }
 const adminLogins=new Set(['lick0ver','war1ouss','bot_lehaai']);
 db.exec("CREATE TABLE IF NOT EXISTS twitch_admin_accounts(login TEXT PRIMARY KEY,player_id TEXT NOT NULL UNIQUE,bound_at INTEGER NOT NULL);");
 function isAdminSession(session){
  if(!session)return false;
  if(db.prepare('SELECT 1 FROM twitch_admin_accounts WHERE player_id=?').get(session.player_id))return true;
  const login=String(session.login||'').toLowerCase();
  if(!adminLogins.has(login))return false;
  // Bind once to the Twitch-verified immutable user ID. Reused logins cannot take over.
  db.prepare('INSERT OR IGNORE INTO twitch_admin_accounts(login,player_id,bound_at) VALUES(?,?,?)').run(login,session.player_id,Date.now());
  return !!db.prepare('SELECT 1 FROM twitch_admin_accounts WHERE player_id=?').get(session.player_id);
 }
 function isAdminRequest(req){return isAdminSession(getSession(req));}
 function userMe(session,stream){
  if(!session)return {authenticated:false};
  const p=player(session.player_id,session.login);
  const orders=db.prepare('SELECT id,vp,price,status,created_at FROM shop_orders WHERE player_id=? ORDER BY id DESC LIMIT 10').all(session.player_id);
  return {authenticated:true,is_admin:isAdminSession(session),stream,spin_allowed:isAdminSession(session)||stream?.live===true,support_unread:support.unread(session),notification_unread:notifications.unread(session),csrf:csrf(session),chatCase:chatCases.progress(p.id),coinCase:chatCases.coinStatus(p.id),donationCase:chatCases.purchases.status(p.id),entitlements:tickets.status(p.id),memberships:twitchRewards.eligibility(p.id),features:Object.fromEntries(controls.list().map(f=>[f.key,f.enabled])),vipShop:vipShop.status(p.id),vipOrders:vipShop.orders(p.id),manualVp:manualVp.list(p.id),vpCodes:vpShop.list(p.id),caseHistory:chatCases.history(p.id),cosmetics:{...cosmetics.summary(p.id),duel_cans:db.prepare('SELECT can_id FROM duel_can_inventory WHERE player_id=? ORDER BY can_id').all(p.id).map(r=>({id:r.can_id,label:duelVisuals.catalog[r.can_id],src:canArt(r.can_id)})).filter(r=>r.label)},frames:{catalog:frames.catalog,rarity:frames.rarity,owned:frames.owned(p.id),active:frames.active(p.id)},player:{id:p.id,login:p.login,display_name:session.display_name,avatar:session.avatar,balance:p.balance,opens:p.opens,wins:p.wins,jackpots:p.jackpots,last_opened:p.last_opened,message_count:db.prepare('SELECT message_count FROM chat_stats WHERE player_id=?').get(session.player_id)?.message_count||0},orders};
 }
 function spinsQuery(sql,...params){
  return db.prepare(sql).all(...params).map(x=>({login:x.login,cans:JSON.parse(x.cans_json),gain:x.gain,description:x.description,source:x.source,created_at:x.created_at}));
 }
 function recordSpin(id,login,d,now,requestId,source){
  const display=d.cans.map(i=>cans[i]);
  db.prepare('INSERT OR IGNORE INTO fridge_spins(request_id,player_id,login,cans_json,gain,description,source,created_at) VALUES(?,?,?,?,?,?,?,?)').run(requestId,id,login,JSON.stringify(display),d.gain,d.description,source,now);
 }
 function trackChat(id,login,now,tags={},message){
  if(!shouldCountChatMessage(message))return false;
  return transaction(()=>{
  if(tags.id&&!db.prepare('INSERT OR IGNORE INTO chat_counted_messages VALUES(?,?)').run(String(tags.id),now).changes)return false;
  db.prepare('INSERT INTO chat_stats(player_id,login,message_count,last_seen) VALUES(?,?,1,?) ON CONFLICT(player_id) DO UPDATE SET login=excluded.login,message_count=message_count+1,last_seen=excluded.last_seen').run(id,login,now);
  const badges=tags.badges||{};const safe={};for(const k of ['broadcaster','moderator','vip','subscriber','founder','premium'])if(badges[k])safe[k]=String(badges[k]).slice(0,12);
  db.prepare('UPDATE chat_stats SET badges_json=? WHERE player_id=?').run(JSON.stringify(safe),id);
  return true;
  });
 }
 async function oauthCallback(req,res,url,stateKey,meta){
  if(!meta||meta.type!=='site'||meta.until<Date.now())return send(res,403,'Авторизация истекла.','text/plain; charset=utf-8');
  const actual=cookie(req,'war_oauth');
  if(!constantTime(actual,stateKey))return send(res,403,'Проверка входа не пройдена.','text/plain; charset=utf-8');
  if(url.searchParams.has('error'))return send(res,400,'Вход через Twitch отменён.','text/plain; charset=utf-8');
  try{
   const code=url.searchParams.get('code')||'';
   if(!code||code.length>2000)throw Error('Twitch не вернул код');
   const token=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:publicUrl+'/oauth/callback'});
   const info=await validate(token.access_token),config=app();
   if(!config||info.client_id!==config.id||!/^\d+$/.test(String(info.user_id))||!/^[a-z0-9_]{1,25}$/.test(String(info.login||'')))throw Error('Не удалось проверить Twitch-аккаунт');
   const login=String(info.login).toLowerCase();
   let displayName=String(info.login),avatar='';
   try{
    const r=await fetch('https://api.twitch.tv/helix/users',{headers:{Authorization:'Bearer '+token.access_token,'Client-Id':config.id},signal:AbortSignal.timeout(9000)});
    if(r.ok){
     const u=(await r.json()).data?.[0];
     if(u&&String(u.id)===String(info.user_id)){
      displayName=String(u.display_name||login).slice(0,50);
      const image=String(u.profile_image_url||'');
      if(/^https:\/\/static-cdn\.jtvnw\.net\//.test(image))avatar=image.slice(0,600);
     }
    }
   }catch(e){console.warn('Twitch avatar request:',e.message);}
   const value=randomBytes(32).toString('base64url'),h=hash(value),now=Date.now(),expires=now+7*86400000;
   transaction(()=>{
    player(String(info.user_id),login);
    db.prepare('INSERT INTO web_sessions(token_hash,player_id,login,display_name,avatar,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').run(h,String(info.user_id),login,displayName,avatar,expires,now);
   });
   res.writeHead(303,{Location:'/profile','Cache-Control':'no-store','Set-Cookie':['war_session='+value+baseCookies+'; Max-Age=604800','war_oauth=; Path=/oauth/callback; HttpOnly; SameSite=Lax'+secure+'; Max-Age=0']});
   res.end();
  }catch(error){
   console.error('Website Twitch login:',error.message);
   send(res,400,'Ошибка входа через Twitch. Повтори попытку с главной страницы.','text/plain; charset=utf-8');
  }
 }
 async function handle(req,res,url){
  const path=url.pathname,method=req.method||'GET';
  if(path.startsWith('/api/cosmetic-assets/')&&(method==='GET'||method==='HEAD')){const id=path.split('/').pop();if(!/^custom_[a-f0-9]{16}$/.test(id))return false;const media=uploads.media(id);if(!media){send(res,404,'Файл недоступен.','text/plain; charset=utf-8');return true;}send(res,200,method==='HEAD'?'':media.data,media.mime,media.mime.startsWith('text/html')?{'X-Frame-Options':'SAMEORIGIN','Content-Security-Policy':"sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'"}:{});return true;}
  if(path in staticAssets){
   if(method!=='GET'&&method!=='HEAD')return json(res,405,{error:'Метод не поддерживается'}),true;
   const asset=staticAssets[path];
   send(res,200,method==='HEAD'?'':asset.bytes,asset.type,{'Cache-Control':'public, max-age=300'});
   return true;
  }
  if(path==='/auth/twitch'&&method==='GET'){
   const config=app();
   if(!config){send(res,503,'Вход через Twitch пока не настроен.','text/plain; charset=utf-8');return true;}
   const state=randomBytes(24).toString('hex');
   states.set(state,{type:'site',until:Date.now()+600000});
   for(const [k,v] of states){const expiration=typeof v==='number'?v:v?.until;if(!expiration||expiration<Date.now())states.delete(k);}
   const target=new URL('https://id.twitch.tv/oauth2/authorize');
   target.search=new URLSearchParams({client_id:config.id,redirect_uri:publicUrl+'/oauth/callback',response_type:'code',scope:'openid',state}).toString();
   res.writeHead(302,{'Location':target.toString(),'Cache-Control':'no-store','Set-Cookie':'war_oauth='+state+'; Path=/oauth/callback; HttpOnly; SameSite=Lax'+secure+'; Max-Age=600'});res.end();
   return true;
  }
  if(path.startsWith('/api/')){
   if(method==='GET'){
    if(path==='/api/site-features'){json(res,200,{features:Object.fromEntries(controls.list().map(f=>[f.key,f.enabled])),assets:uploads.list().filter(a=>a.enabled),cans:Object.fromEntries(Object.entries(duelVisuals.catalog).map(([id,label])=>[id,{label,src:canArt(id)}]))});return true;}
    if(path==='/api/case-history'){const page=Math.max(1,Math.min(100000,parseInt(url.searchParams.get('page'))||1)),rows=db.prepare('SELECT id,login,case_id,reward_json,created_at FROM case_openings ORDER BY id DESC LIMIT 10 OFFSET ?').all((page-1)*10),total=db.prepare('SELECT COUNT(*) n FROM case_openings').get().n;json(res,200,{page,pages:Math.max(1,Math.ceil(total/10)),openings:rows.map(r=>({id:r.id,login:r.login,caseId:r.case_id,reward:JSON.parse(r.reward_json),created_at:r.created_at}))});return true;}
    if(path==='/api/player'){const login=String(url.searchParams.get('login')||'').toLowerCase();if(!/^[a-z0-9_]{1,25}$/.test(login)){json(res,400,{error:'Неверный ник'});return true;}const p=db.prepare('SELECT id,login,balance,opens,wins FROM players WHERE lower(login)=?').get(login);if(!p){json(res,404,{error:'Игрок не найден'});return true;}const {id,...profile}=p;json(res,200,{player:profile,messages:db.prepare('SELECT message_count FROM chat_stats WHERE player_id=?').get(id)?.message_count||0,frame:frames.active(id),look:cosmetics.publicLooks([login])[login]||{}});return true;}
    if(path==='/api/shop/vp'){json(res,200,{packages:vpShop.catalog()});return true;}
    if(path==='/api/shop/vip'){json(res,200,vipShop.settings());return true;}
    if(path==='/api/chat-leaderboard'){json(res,200,chatLeaderboard(url.searchParams.get('page')));return true;}
    if(path==='/api/leaderboard'){json(res,200,leaderboard(url.searchParams.get('page')));return true;}
    if(path==='/api/cases'){json(res,200,{cases:publicCases(),previewOnly:false,activeCaseIds:['chat','coins','donation','twitch','vip','subscriber']});return true;}
    if(path==='/api/reviews'){const session=getSession(req);json(res,200,{reviews:reviews.list(),eligibleOrders:reviews.eligible(session)});return true;}
    if(path==='/api/frames'){json(res,200,{frames:frames.publicFrames((url.searchParams.get('logins')||'').toLowerCase().split(',')),cosmetics:cosmetics.publicLooks((url.searchParams.get('logins')||'').toLowerCase().split(','))});return true;}
    if(path==='/api/avatars'){const names=(url.searchParams.get('logins')||'').split(',').slice(0,50);json(res,200,{avatars:await avatars.get(names)});return true;}
    if(path==='/api/notifications'){const session=getSession(req);if(!session){json(res,401,{error:'Сначала войди через Twitch'});return true;}json(res,200,{notifications:vpShop.decorate(session,notifications.list(session))});return true;}
    if(path==='/api/support'||path.startsWith('/api/support/')){
     const session=getSession(req);if(!session){json(res,401,{error:'Сначала войди через Twitch'});return true;}
     try{json(res,200,path==='/api/support'?{tickets:support.list(session)}:support.thread(path.split('/').pop(),session));}catch(e){json(res,e.status||400,{error:e.message})}return true;
    }
    if(path==='/api/me'){const session=getSession(req);json(res,200,userMe(session,session?await streamStatus.get():null));return true;}
    if(path==='/api/public'){
     const top=db.prepare('SELECT login,balance,opens FROM players ORDER BY balance DESC,login ASC LIMIT 15').all();
     const chat=db.prepare("SELECT c.login,c.message_count,c.badges_json,COALESCE(p.frame,'') AS frame,COALESCE(p.title,'') AS title,COALESCE(p.name_color,'') AS name_color FROM chat_stats c LEFT JOIN cosmetic_profiles p ON p.player_id=c.player_id ORDER BY c.message_count DESC,c.login ASC LIMIT 15").all();
     const recent=spinsQuery('SELECT login,cans_json,gain,description,source,created_at FROM fridge_spins WHERE gain>0 ORDER BY id DESC LIMIT 8');
     json(res,200,{top,chat,recent});return true;
    }
    if(path==='/api/spins'){
     const scope=url.searchParams.get('scope'),mine=scope==='mine',session=mine?getSession(req):null;if(mine&&!session){json(res,401,{error:'Войди через Twitch, чтобы посмотреть свои открытия.'});return true;}
     const jackpotFilter=scope==='jackpots'?' WHERE gain IN (20,100)':scope==='superjackpots'?' WHERE gain=400':'';
     const spins=mine?spinsQuery('SELECT login,cans_json,gain,description,source,created_at FROM fridge_spins WHERE player_id=? ORDER BY id DESC LIMIT 50',session.player_id):spinsQuery('SELECT login,cans_json,gain,description,source,created_at FROM fridge_spins'+jackpotFilter+' ORDER BY id DESC LIMIT '+(jackpotFilter?'50':'10'));
     json(res,200,{spins,scope:mine?'mine':'recent'});return true;
    }
    if(path==='/api/duels'){
     const now=Date.now();
     const pending=db.prepare("SELECT id,initiator_id,opponent_id,initiator_login,opponent_login,wager,expires_at FROM duels WHERE status='pending' AND expires_at>? ORDER BY id DESC LIMIT 25").all(now).map(duelVisuals.present);
     const recent=db.prepare("SELECT d.id,d.initiator_id,d.opponent_id,d.initiator_login,d.opponent_login,d.wager,d.fee,d.status,d.resolved_at,d.created_at,p.login AS winner_login FROM duels d LEFT JOIN players p ON p.id=d.winner_id WHERE d.status='accepted' ORDER BY d.id DESC LIMIT 25").all().map(duelVisuals.present);
     json(res,200,{pending,recent,enabled:duelsEnabled});return true;
    }
    json(res,404,{error:'Раздел не найден'});return true;
   }
   if(method!=='POST'){json(res,405,{error:'Метод не поддерживается'});return true;}
   const session=getSession(req);
   if(!session){json(res,401,{error:'Сначала войди через Twitch'});return true;}
   if(!sameOrigin(req)){json(res,403,{error:'Недопустимый источник запроса'});return true;}
   if(!constantTime(String(req.headers['x-csrf-token']||''),csrf(session))){json(res,403,{error:'Сессия устарела. Обнови страницу.'});return true;}
   try{
    const data=await readJson(req);
    if(path==='/api/twitch/refresh'){const result=await twitchRewards.syncAll(false);json(res,200,{...result,memberships:twitchRewards.eligibility(session.player_id)});return true;}
    if(path==='/api/twitch/claim'){json(res,200,await twitchRewards.claim(session,String(data.kind||'')));return true;}
    if(/^\/api\/cases\/(twitch|vip|subscriber)\/open$/.test(path)){const id=path.split('/')[3],rid=actionId(data),status=await streamStatus.get();json(res,200,chatCases.open(session,rid,isAdminSession(session)||status.live===true,id));return true;}
    if(path==='/api/shop/vp'){controls.requireEnabled('shop:vp');const rid=actionId(data);if(!Number.isSafeInteger(data.vp)||!Number.isSafeInteger(data.expectedPrice))throw Error('Неверный пакет VP');json(res,200,vpShop.buy(session,rid,data.vp,data.expectedPrice));return true;}
    if(path==='/api/shop/vip'){controls.requireEnabled('shop:vip');const rid=actionId(data);if(!Number.isSafeInteger(data.expectedPrice)||data.expectedPrice<1)throw Error('Неверная цена VIP');json(res,200,vipShop.buy(session,rid,data.expectedPrice));return true;}
    if(path==='/api/cases/donation/open'){const rid=actionId(data),status=await streamStatus.get();json(res,200,chatCases.openDonation(session,rid,isAdminSession(session)||status.live===true));return true;}
    if(path==='/api/cases/coins/open'){if(!Number.isSafeInteger(data.expectedCost)||data.expectedCost<=0)throw Error('Неверная цена');const rid=actionId(data),status=await streamStatus.get();json(res,200,chatCases.openCoins(session,rid,isAdminSession(session)||status.live===true,data.expectedCost));return true;}
    if(path==='/api/cases/chat/open'){const rid=actionId(data),status=await streamStatus.get();json(res,200,chatCases.open(session,rid,isAdminSession(session)||status.live===true));return true;}
    if(path==='/api/cosmetics/equip'){json(res,200,cosmetics.equip(session.player_id,String(data.kind||''),String(data.item||'')));return true;}
    if(path==='/api/frames/equip'){json(res,200,frames.equip(session.player_id,String(data.frame||'')));return true;}
    if(path==='/api/reviews'){json(res,200,reviews.create(session,data));return true;}
    if(path==='/api/notifications/read'){json(res,200,notifications.read(session,data.maxId));return true;}
    if(path==='/api/support'){json(res,200,support.create(session,data.body));return true;}
    if(path==='/api/support/reply'){json(res,200,support.reply(session,data.id,data.body));return true;}
    if(path==='/api/support/read'){json(res,200,support.read(session,data.id,data.maxId));return true;}
    if(path==='/api/logout'){
     db.prepare('DELETE FROM web_sessions WHERE token_hash=?').run(session.token_hash);
     json(res,200,{ok:true},{'Set-Cookie':'war_session=;'+baseCookies.slice(1)+'; Max-Age=0'});return true;
    }
    if(path==='/api/holodos'){
     if(!isAdminSession(session)){const status=await streamStatus.get();if(!status.live){json(res,status.known?403:503,{error:status.known?'Открытия доступны во время стрима. Вне эфира — только администраторам.':'Не удалось проверить эфир Twitch. Попробуй позже.'});return true;}}
     const rid=actionId(data),now=Date.now();
     const outcome=transaction(()=>{
      const previous=db.prepare('SELECT * FROM fridge_spins WHERE request_id=?').get('web:'+rid);
      if(previous){
       if(previous.player_id!==session.player_id)throw Error('Этот запрос принадлежит другому игроку');
       return {cans:JSON.parse(previous.cans_json),gain:previous.gain,description:previous.description,balance:player(session.player_id,session.login).balance,last_opened:previous.created_at};
      }
      const p=player(session.player_id,session.login);
      const left=120000-(now-p.last_opened);
      if(left>0)return {cooldown:Math.ceil(left/1000)};
      const d=draw();
      db.prepare('UPDATE players SET last_opened=?,balance=balance+?,opens=opens+1,wins=wins+?,jackpots=jackpots+? WHERE id=?').run(now,d.gain,Number(d.gain>0),Number(d.gain===400),session.player_id);
      recordSpin(session.player_id,session.login,d,now,'web:'+rid,'web');
      return {cans:d.cans.map(i=>cans[i]),gain:d.gain,description:d.description,balance:p.balance+d.gain,last_opened:now};
     });
     if(outcome.cooldown){json(res,429,{error:'Холодос ещё охлаждается. Подожди '+outcome.cooldown+' сек.',remaining:outcome.cooldown});return true;}
     json(res,200,{ok:true,...outcome});return true;
    }
    if(path==='/api/duels/challenge'){
     if(!duelsEnabled){json(res,503,{error:'Дуэли временно отключены'});return true;}
     const rid=actionId(data),target=String(data.target||'').replace(/^@/,'').toLowerCase(),wager=Number(data.wager);
     if(!/^[a-z0-9_]{1,25}$/.test(target)||!Number.isSafeInteger(wager)||wager<1||wager>100000000)throw Error('Неверный ник или сумма ставки');
     const output=duelChallenge(session.login,session.player_id,target,wager,'web:'+rid,Date.now());
     if(output&&output.includes('тебя вызывает'))say(output);
     json(res,200,{ok:true,message:output||'Этот запрос уже обработан'});return true;
    }
    if(path==='/api/duels/respond'){
     if(!duelsEnabled){json(res,503,{error:'Дуэли временно отключены'});return true;}
     const rid=actionId(data),choice=data.answer;
     if(choice!=='accept'&&choice!=='decline')throw Error('Неверный ответ');
     const output=duelRespond(session.login,session.player_id,choice==='accept'?'!принять':'!отказ','web:'+rid,Date.now());
     if(output)say(output);
     json(res,200,{ok:true,message:output||'Нет активного вызова или запрос уже обработан'});return true;
    }
    json(res,404,{error:'Команда не найдена'});return true;
   }catch(error){
    console.error('War1ouss API:',error.message);
    json(res,error.status||400,{error:error.status?error.message:'Не получилось выполнить операцию. Проверь данные и попробуй снова.'});
    return true;
   }
  }
  if(sitePages.has(path)&&(method==='GET'||method==='HEAD')){
   send(res,200,method==='HEAD'?'':shell,'text/html; charset=utf-8');
   return true;
  }
  return false;
 }
 return {handle,oauthCallback,recordSpin,trackChat,isAdminRequest,cases,chatCases,adminWallet,vipShop,manualVp,vpShop,caseManagement,uploads,controls,twitchRewards,support,reviews,duelVisuals,frames,cosmetics,isAdminIdentity:isAdminSession,adminIdentity:req=>{const s=getSession(req);return s&&isAdminSession(s)?s:{player_id:'admin-panel',login:'Администратор'};}};
}
