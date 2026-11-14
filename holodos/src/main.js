import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync,readFileSync} from 'node:fs';
import {createSite} from './site-server.js';
import {renderAdminPage} from './admin-page.js';
import {dirname} from 'node:path';
import {randomInt,randomBytes,scryptSync,createCipheriv,createDecipheriv,createHmac,timingSafeEqual} from 'node:crypto';
import tmi from 'tmi.js';

const channel=(process.env.TWITCH_CHANNEL||'war1ouss').toLowerCase();
const botLogin=(process.env.BOT_USERNAME||'bot_leha_ai').toLowerCase();
const publicUrl=(process.env.PUBLIC_URL||'http://localhost:3000').replace(/\/$/,'');
const port=Number(process.env.PORT||3000);
const pass=process.env.ADMIN_PASSWORD||'';
const secret=process.env.APP_SECRET||'';
const dbPath=process.env.DB_PATH||'/data/leha.sqlite';
const duelsEnabled=process.env.ENABLE_DUELS==='true';
const ECONOMY=JSON.parse(readFileSync(new URL('./economy-v1.1.json',import.meta.url),'utf8'));
const SHOP_PRICES=Object.freeze(ECONOMY.shopPricesW);
const invalidConfig=[];
if(!/^[a-z0-9_]{1,25}$/.test(channel))invalidConfig.push('TWITCH_CHANNEL');
if(!/^[a-z0-9_]{1,25}$/.test(botLogin))invalidConfig.push('BOT_USERNAME');
if(pass.length<16)invalidConfig.push('ADMIN_PASSWORD length must be >= 16');
if(secret.length<32)invalidConfig.push('APP_SECRET length must be >= 32');
if(!Number.isInteger(port)||port<1||port>65535)invalidConfig.push('PORT');
if(!/^https:\/\//.test(publicUrl)&&!/^http:\/\/localhost(?::\d+)?$/.test(publicUrl))invalidConfig.push('PUBLIC_URL needs HTTPS');
if(invalidConfig.length)throw Error('Invalid startup setting(s): '+invalidConfig.join(', '));
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
db.exec("CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,login TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0,last_opened INTEGER NOT NULL DEFAULT 0,opens INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,jackpots INTEGER NOT NULL DEFAULT 0);");
db.exec("CREATE TABLE IF NOT EXISTS seen(message_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);");
db.exec("CREATE TABLE IF NOT EXISTS duels(id INTEGER PRIMARY KEY AUTOINCREMENT,initiator_id TEXT NOT NULL,initiator_login TEXT NOT NULL,opponent_login TEXT NOT NULL,opponent_id TEXT,wager INTEGER NOT NULL CHECK(wager>0),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired','cancelled')),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,resolved_at INTEGER,winner_id TEXT,fee INTEGER NOT NULL DEFAULT 0);");
db.exec("CREATE INDEX IF NOT EXISTS idx_duels_pending ON duels(status,opponent_login,expires_at);");
db.exec("CREATE TABLE IF NOT EXISTS shop_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,player_id TEXT NOT NULL,login TEXT NOT NULL,vp INTEGER NOT NULL CHECK(vp IN (240,475,1000)),price INTEGER NOT NULL CHECK(price>0),status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','fulfilled','cancelled')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);");
db.exec("CREATE INDEX IF NOT EXISTS idx_shop_user_orders ON shop_orders(player_id,id DESC);");
db.exec("CREATE INDEX IF NOT EXISTS idx_shop_pending ON shop_orders(status,id);");
db.exec("CREATE TABLE IF NOT EXISTS twitch_app(id INTEGER PRIMARY KEY CHECK(id=1),client_id TEXT NOT NULL,client_secret TEXT NOT NULL);");
db.exec("CREATE TABLE IF NOT EXISTS twitch_token(id INTEGER PRIMARY KEY CHECK(id=1),login TEXT NOT NULL,user_id TEXT NOT NULL,access TEXT NOT NULL,refresh TEXT NOT NULL,expires_at INTEGER NOT NULL);");
const key=scryptSync(secret,'leha-holodos-v1',32);
function encrypt(str){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);const enc=Buffer.concat([cipher.update(str,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),enc]).toString('base64');}
function decrypt(str){const b=Buffer.from(str,'base64'),dec=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));dec.setAuthTag(b.subarray(12,28));return Buffer.concat([dec.update(b.subarray(28)),dec.final()]).toString('utf8');}
function app(){const r=db.prepare('SELECT * FROM twitch_app WHERE id=1').get();return r?{id:r.client_id,secret:decrypt(r.client_secret)}:null;}
function current(){const r=db.prepare('SELECT * FROM twitch_token WHERE id=1').get();return r?{...r,access:decrypt(r.access),refresh:decrypt(r.refresh)}:null;}
function saveToken(data,user){db.prepare('INSERT INTO twitch_token(id,login,user_id,access,refresh,expires_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,user_id=excluded.user_id,access=excluded.access,refresh=excluded.refresh,expires_at=excluded.expires_at').run(user.login,user.user_id,encrypt(data.access_token),encrypt(data.refresh_token),Date.now()+Number(data.expires_in)*1000);}
async function tokenRequest(values){const a=app();if(!a)throw Error('Twitch-приложение ещё не настроено');const r=await fetch('https://id.twitch.tv/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:a.id,client_secret:a.secret,...values}),signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Twitch OAuth: '+r.status);return r.json();}
async function validate(access){const r=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+access},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Twitch отклонил токен: '+r.status);return r.json();}
async function refresh(){const old=current();if(!old)return null;const data=await tokenRequest({grant_type:'refresh_token',refresh_token:old.refresh});const user=await validate(data.access_token);if(user.user_id!==old.user_id||user.login.toLowerCase()!==botLogin)throw Error('Токен от другого Twitch-аккаунта');saveToken(data,user);return data.access_token;}
async function access(){const r=current();if(!r)return null;return r.expires_at<Date.now()+30*60*1000?refresh():r.access;}
function transaction(fn){db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}}
function seen(msg,now){return db.prepare('INSERT OR IGNORE INTO seen(message_id,created_at) VALUES(?,?)').run(msg,now).changes===1;}
function player(id,login){db.prepare('INSERT OR IGNORE INTO players(id,login) VALUES(?,?)').run(id,login);db.prepare('UPDATE players SET login=? WHERE id=? AND login<>?').run(login,id,login);return db.prepare('SELECT * FROM players WHERE id=?').get(id);}
const regularCans=['⚪','🟢','🥭','🌸','🔵','⚫','🍉','🟡'];
const cans=[...regularCans,'👑'];
const wEditionIndex=cans.length-1;
function randomRegularCan(){return randomInt(regularCans.length);}
function chooseExcluding(excluded){const a=regularCans.map((_,i)=>i).filter(i=>!excluded.includes(i));return a[randomInt(a.length)];}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function draw(){
 // Exactly 2000 equally likely outcomes:
 // 1 rare W jackpot (0.05%), 10 standard jackpots (0.5%),
 // 540 pairs (27%), 1449 three-different (72.45%).
 // W Edition never appears in ordinary outcomes.
 const n=randomInt(2000);
 if(n===0)return {cans:[wEditionIndex,wEditionIndex,wEditionIndex],gain:400,description:'W EDITION! РЕДКИЙ ДЖЕКПОТ!'};
 if(n<11){const c=randomRegularCan();return {cans:[c,c,c],gain:20,description:'ДЖЕКПОТ!'};}
 if(n<551){const c=randomRegularCan();return {cans:shuffle([c,c,chooseExcluding([c])]),gain:5,description:'ПАРА!'};}
 const a=randomRegularCan(),b=chooseExcluding([a]),c=chooseExcluding([a,b]);
 return {cans:shuffle([a,b,c]),gain:0,description:'не повезло.'};
}
let client=null,connected=false,starting=false,ending=false,sending=false;
const queue=[];
function say(text){if(!text||queue.length>=25)return;queue.push(text.slice(0,450));void drain();}
async function drain(){if(sending||!connected||!client)return;sending=true;try{while(queue.length&&connected&&client){const message=queue.shift();try{await client.say('#'+channel,message);}catch(e){console.error('chat send:',e.message);}if(queue.length)await new Promise(r=>setTimeout(r,3100));}}finally{sending=false;}}

const DUEL_COOLDOWN_MS=150*1000;
function duelCooldownMs(playerId,now){
 const result=db.prepare("SELECT MAX(resolved_at) AS last_finished FROM duels WHERE status='accepted' AND (initiator_id=? OR opponent_id=?)").get(playerId,playerId);
 return result?.last_finished?Math.max(0,result.last_finished+DUEL_COOLDOWN_MS-now):0;
}
function duelCooldownByLogin(login,now){
 const target=db.prepare("SELECT id FROM players WHERE login=? LIMIT 1").get(login);
 return target?duelCooldownMs(target.id,now):0;
}
function duelCooldownTime(ms){
 const seconds=Math.ceil(ms/1000);
 return Math.floor(seconds/60)+' мин '+(seconds%60)+' сек.';
}
function duelFee(wager){
 const rate=wager<100?2:wager<500?5:wager<2000?8:12;
 return Math.floor(wager*2*rate/100);
}
function expireDuels(now,announce=false){
 if(!duelsEnabled)return;
 const rows=db.prepare("UPDATE duels SET status='expired',resolved_at=? WHERE status='pending' AND expires_at<=? RETURNING initiator_login,opponent_login,wager").all(now,now);
 if(announce)for(const d of rows)say('@'+d.initiator_login+', дуэль с @'+d.opponent_login+' на '+d.wager+' W отменена: время вышло.');
}
function duelChallenge(login,id,target,wager,mid,now){
 return transaction(()=>{
  if(!seen(mid,now))return null;
  expireDuels(now);
  if(target===login)return '@'+login+', нельзя вызвать себя.';
  if(target===botLogin)return '@'+login+', Лёха в дуэли не участвует.';
  if(!Number.isSafeInteger(wager)||wager<1||wager>100000000)return '@'+login+', ставка должна быть от 1 до 100 000 000 W.';
  const sender=player(id,login);
  const ownCooldown=duelCooldownMs(id,now);
  if(ownCooldown>0)return '@'+login+', после дуэли подожди ещё '+duelCooldownTime(ownCooldown)+'.';
  const opponentCooldown=duelCooldownByLogin(target,now);
  if(opponentCooldown>0)return '@'+login+', у @'+target+' кулдаун после дуэли ещё '+duelCooldownTime(opponentCooldown)+'.';
  if(sender.balance<wager)return '@'+login+', не хватает W-монет: у тебя '+sender.balance+' W.';
  const active=db.prepare("SELECT id FROM duels WHERE status='pending' AND expires_at>? AND (initiator_id=? OR initiator_login=? OR opponent_login=? OR opponent_login=?) LIMIT 1").get(now,id,login,login,target);
  if(active)return '@'+login+', у тебя или у @'+target+' уже есть незавершённая дуэль.';
  db.prepare("INSERT INTO duels(initiator_id,initiator_login,opponent_login,wager,created_at,expires_at) VALUES(?,?,?,?,?,?)").run(id,login,target,wager,now,now+60000);
  return '@'+target+', тебя вызывает @'+login+' на дуэль: '+wager+' W! Напиши !принять или !отказ за 60 сек.';
 });
}
function duelRespond(login,id,answer,mid,now){
 return transaction(()=>{
  if(!seen(mid,now))return null;
  expireDuels(now);
  const d=db.prepare("SELECT * FROM duels WHERE status='pending' AND opponent_login=? AND expires_at>? ORDER BY created_at LIMIT 1").get(login,now);
  if(!d)return null;
  if(answer==='!отказ'){
   db.prepare("UPDATE duels SET status='declined',resolved_at=?,opponent_id=? WHERE id=? AND status='pending'").run(now,id,d.id);
   return '@'+login+' отказался от дуэли с @'+d.initiator_login+'.';
  }
  const challenger=db.prepare('SELECT * FROM players WHERE id=?').get(d.initiator_id);
  const recipient=player(id,login);
  const challengerCooldown=duelCooldownMs(d.initiator_id,now);
  const recipientCooldown=duelCooldownMs(id,now);
  if(challengerCooldown>0||recipientCooldown>0){
   db.prepare("UPDATE duels SET status='cancelled',resolved_at=?,opponent_id=? WHERE id=? AND status='pending'").run(now,id,d.id);
   const who=challengerCooldown>0?'@'+d.initiator_login:'@'+login;
   return 'Дуэль отменена: у '+who+' кулдаун ещё '+duelCooldownTime(Math.max(challengerCooldown,recipientCooldown))+'.';
  }
  if(!challenger||challenger.balance<d.wager||recipient.balance<d.wager){
   db.prepare("UPDATE duels SET status='cancelled',resolved_at=?,opponent_id=? WHERE id=? AND status='pending'").run(now,id,d.id);
   return 'Дуэль @'+d.initiator_login+' и @'+login+' отменена: кому-то не хватает W-монет.';
  }
  const winner=randomInt(2)===0?d.initiator_id:id;
  const winnerName=winner===id?login:d.initiator_login;
  const loserName=winner===id?d.initiator_login:login;
  const pot=d.wager*2,fee=duelFee(d.wager);
  db.prepare('UPDATE players SET balance=balance-? WHERE id=?').run(d.wager,d.initiator_id);
  db.prepare('UPDATE players SET balance=balance-? WHERE id=?').run(d.wager,id);
  db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(pot-fee,winner);
  db.prepare("UPDATE duels SET status='accepted',resolved_at=?,opponent_id=?,winner_id=?,fee=? WHERE id=? AND status='pending'").run(now,id,winner,fee,d.id);
  return '💥 Банка @'+loserName+' взорвалась, он проиграл! Победил @'+winnerName+' — выигрыш '+(pot-fee).toLocaleString('ru-RU')+' W (банк '+pot.toLocaleString('ru-RU')+' W, комиссия '+fee.toLocaleString('ru-RU')+' W).';
 });
}


function shopText(){
 return 'Магазин VP: 240 VP - 25 000 W; 475 VP - 55 000 W; 1000 VP - 115 000 W. Заказать: !купить 240. Проверить: !заказ.';
}
function buyVp(login,id,vp,mid,now){
 return transaction(()=>{
  if(!seen(mid,now))return null;
  const price=SHOP_PRICES[vp];
  if(!price)return '@'+login+', доступны 240, 475 и 1000 VP. Напиши !магазин.';
  const playerRow=player(id,login);
  const prior=db.prepare("SELECT id,vp FROM shop_orders WHERE player_id=? AND status='pending' LIMIT 1").get(id);
  if(prior)return '@'+login+', у тебя уже есть заявка №'+prior.id+' на '+prior.vp+' VP. Статус: !заказ.';
  if(playerRow.balance<price)return '@'+login+', не хватает W: '+vp+' VP стоят '+price.toLocaleString('ru-RU')+' W, у тебя '+playerRow.balance.toLocaleString('ru-RU')+' W.';
  const debit=db.prepare('UPDATE players SET balance=balance-? WHERE id=? AND balance>=?').run(price,id,price);
  if(debit.changes!==1)throw Error('Не получилось списать W');
  const order=db.prepare("INSERT INTO shop_orders(player_id,login,vp,price,status,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?)").run(id,login,vp,price,now,now);
  return '@'+login+', заявка №'+order.lastInsertRowid+' на '+vp+' VP принята. Списано '+price.toLocaleString('ru-RU')+' W. VP выдаются вручную, статус: !заказ.';
 });
}
function orderStatus(login,id,mid,now){
 return transaction(()=>{
  if(!seen(mid,now))return null;
  const order=db.prepare('SELECT id,vp,price,status FROM shop_orders WHERE player_id=? ORDER BY id DESC LIMIT 1').get(id);
  if(!order)return '@'+login+', у тебя ещё нет заказов. Напиши !магазин.';
  const state={pending:'ожидает ручной выдачи',fulfilled:'выдан вручную',cancelled:'отменён, W возвращены'}[order.status]||'неизвестен';
  return '@'+login+', заказ №'+order.id+': '+order.vp+' VP, '+order.price.toLocaleString('ru-RU')+' W. Статус: '+state+'.';
 });
}
function resolveOrder(orderId,action,now){
 return transaction(()=>{
  const order=db.prepare("SELECT * FROM shop_orders WHERE id=? AND status='pending'").get(orderId);
  if(!order)throw Error('Заявка уже обработана или не найдена');
  if(action!=='fulfilled'&&action!=='cancelled')throw Error('Неверная операция');
  if(action==='cancelled'){
   const refund=db.prepare('UPDATE players SET balance=balance+? WHERE id=?').run(order.price,order.player_id);
   if(refund.changes!==1)throw Error('Не получилось вернуть W');
  }
  db.prepare("UPDATE shop_orders SET status=?,updated_at=? WHERE id=? AND status='pending'").run(action,now,order.id);
  return order;
 });
}

function handle(login,id,msg,mid,now){
 const cmd=msg.trim().toLowerCase();let output=null;
 if(duelsEnabled&&(cmd==='!принять'||cmd==='!отказ'))output=duelRespond(login,id,cmd,mid,now);
 else if(duelsEnabled&&/^!дуэль\s+@?[a-z0-9_]{1,25}\s+[1-9]\d{0,8}$/.test(cmd)){
  const [,target,amount]=/^!дуэль\s+@?([a-z0-9_]{1,25})\s+([1-9]\d{0,8})$/.exec(cmd);
  output=duelChallenge(login,id,target,Number(amount),mid,now);
 }
 else if(cmd==='!холодос')output=transaction(()=>{
  if(!seen(mid,now))return null;
  const p=player(id,login);
  if(now-p.last_opened<120000)return '@'+login+', холодос можно открыть через '+Math.ceil((120000-now+p.last_opened)/1000)+' сек.';
  const d=draw();
  db.prepare('UPDATE players SET last_opened=?,balance=balance+?,opens=opens+1,wins=wins+?,jackpots=jackpots+? WHERE id=?').run(now,d.gain,Number(d.gain>0),Number(d.gain===400),id);
  site.recordSpin(id,login,d,now,'chat:'+mid,'chat');
  return '@'+login+' открыл холодос: '+d.cans.map(i=>cans[i]).join(' ')+' - '+d.description+' +'+d.gain+' W';
 });
 else if(cmd==='!баланс')output=transaction(()=>seen(mid,now)?'@'+login+', у тебя '+player(id,login).balance.toLocaleString('ru-RU')+' W-монет.':null);
 else if(cmd==='!топмонет')output=transaction(()=>{
  if(!seen(mid,now))return null;
  const top=db.prepare('SELECT login,balance FROM players ORDER BY balance DESC,login ASC LIMIT 5').all();
  return top.length?'Топ W-монет: '+top.map((p,i)=>(i+1)+'. @'+p.login+' '+p.balance+' W').join(' · '):'Топ W-монет пуст. Открой !холодос.';
 });
 else if(cmd==='!статмонет')output=transaction(()=>{
  if(!seen(mid,now))return null;
  const p=player(id,login);
  return '@'+login+': открытий '+p.opens+', выигрышей '+p.wins+', W-джекпотов '+p.jackpots+', баланс '+p.balance+' W.';
 });
 else if(cmd==='!магазин')output=transaction(()=>seen(mid,now)?shopText():null);
 else if(/^!купить\s+(240|475|1000)(?:\s*vp)?$/.test(cmd)){
  const vp=Number(/^!купить\s+(240|475|1000)/.exec(cmd)[1]);
  output=buyVp(login,id,vp,mid,now);
 }
 else if(cmd==='!заказ'||cmd==='!заказы')output=orderStatus(login,id,mid,now);
 if(output)say(output);
}
async function stop(){if(!client)return;const old=client;client=null;connected=false;try{await old.disconnect();}catch{}}
async function start(){
 if(starting||ending||!app()||!current())return;
 starting=true;
 try{
  await stop();const token=await access();if(!token)return;
  const conn=new tmi.Client({options:{skipMembership:true},connection:{reconnect:true,secure:true},identity:{username:botLogin,password:'oauth:'+token},channels:[channel]});
  client=conn;
  conn.on('connected',()=>{connected=true;console.log('Connected to #'+channel+' as '+botLogin);void drain();});
  conn.on('disconnected',reason=>{connected=false;console.warn('Twitch IRC disconnected:',reason);});
  conn.on('message',(_room,tags,msg,self)=>{
   if(self||!msg.trim())return;
   const login=String(tags.username||'').toLowerCase(),id=String(tags['user-id']||''),mid=String(tags.id||'');
   if(login===botLogin||!/^[a-z0-9_]{1,25}$/.test(login)||!/^\d+$/.test(id)||!mid||mid.length>200)return;
   try{const now=Date.now();site.trackChat(id,login,now,tags);if(msg.trim().startsWith('!'))handle(login,id,msg,mid,now);}catch(e){console.error('chat message:',e.message);}
  });
  await conn.connect();
 }catch(e){connected=false;console.error('Could not connect to Twitch:',e.message);}finally{starting=false;}
}
const states=new Map();
// Keep a consistent pre-site snapshot of the existing W balances on the persistent volume.
const siteBackupPath=dirname(dbPath)+'/leha-pre-war1ouss-site.sqlite';
if(!existsSync(siteBackupPath)){
 db.prepare('VACUUM INTO ?').run(siteBackupPath);
 console.log('Pre-website SQLite backup created on persistent volume');
}
const site=createSite({db,publicUrl,app,tokenRequest,validate,player,transaction,draw,cans,duelChallenge,duelRespond,say,channel,duelsEnabled,states,secret});
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function page(body){return renderAdminPage(body);}
async function formData(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>16384)throw Error('Слишком большая форма');}return new URLSearchParams(text);}
function setupForm(token){
 const a=app();
 return '<form method="post" action="/configure"><input type="hidden" name="csrf" value="'+token+'"><label>Client ID<input name="client_id" required maxlength="100" autocomplete="off" value="'+escape(a?.id||'')+'"></label><label>Client Secret<input type="password" name="client_secret" required maxlength="200" autocomplete="off" placeholder="Secret из Twitch Developer Console"></label><p><button type="submit">Сохранить настройки Twitch</button></p></form>';
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const html=(status,body)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"});res.end(page(body));};
 const redirect=()=>{res.writeHead(303,{Location:'/admin',"Cache-Control":"no-store"});res.end();};
 if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,twitch_connected:connected}));return;}
 if(url.pathname==='/oauth/callback'){
  const state=url.searchParams.get('state')||'',until=states.get(state);states.delete(state);
  if(until&&typeof until==='object'&&until.type==='site'){await site.oauthCallback(req,res,url,state,until);return;}
  if(!until||until<Date.now()){html(403,'Подключение истекло. Начни заново в панели.');return;}
  if(url.searchParams.has('error')){html(400,'Twitch отменил подключение.');return;}
  try{
   const data=await tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:publicUrl+'/oauth/callback'});
   const user=await validate(data.access_token),a=app();
   if(user.client_id!==a.id||user.login.toLowerCase()!==botLogin)throw Error('Войти нужно именно в аккаунт @'+botLogin);
   if(!user.scopes?.includes('chat:read')||!user.scopes?.includes('chat:edit'))throw Error('Не получены разрешения Twitch chat:read и chat:edit');
   saveToken(data,user);await start();
   html(200,'<h2>Аккаунт @'+escape(user.login)+' авторизован!</h2><p>Бот подключается к #'+escape(channel)+'.</p><a href="/admin">Панель</a>');
  }catch(e){html(400,'Ошибка Twitch: '+escape(e.message));}
  return;
 }
 if(await site.handle(req,res,url))return;
 // A normal HTML sign-in works in Twitch's and ChatGPT's in-app browsers; Basic Auth prompts often do not.
 const cookieName='leha_admin';
 const authAge=7*24*60*60*1000;
 const signed=(expiry)=>createHmac('sha256',key).update('admin-session:'+expiry).digest('base64url');
 const authenticated=()=>{
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  if(!token)return false;
  const [expiry,signature]=token.split('.');
  if(!/^\d{13}$/.test(expiry||'')||!signature||Number(expiry)<Date.now()||Number(expiry)>Date.now()+authAge)return false;
  return equal(signature,signed(expiry));
 };
 let basicPassword='';
 try{const hdr=req.headers.authorization||'';if(hdr.startsWith('Basic '))basicPassword=Buffer.from(hdr.slice(6),'base64').toString('utf8').split(':').slice(1).join(':');}catch{}
 const isAdmin=site.isAdminRequest(req)||authenticated()||(basicPassword.length>0&&equal(basicPassword,pass));
 // Signed, form-specific CSRF tokens work even when a browser or proxy omits Origin.
 const csrf=(purpose)=>{
  const session=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('war_session='))?.slice('war_session='.length)||'';
  return createHmac('sha256',key).update('csrf:v3:'+purpose+':'+(purpose==='login'?'guest':session)).digest('base64url');
 };
 const validCsrf=(form,purpose)=>equal(String(form.get('csrf')||''),csrf(purpose));
 const loginPage=(error='')=>'<h2>Вход в Холодос</h2><p>Панель работает. Для настройки Twitch нужен пароль администратора.</p>'+(error?'<p style="color:#ffb9b9">'+escape(error)+'</p>':'')+'<form action="/login" method="post"><input type="hidden" name="csrf" value="'+csrf('login')+'"><label>Пароль панели<input type="password" name="password" required autocomplete="current-password"></label><p><button type="submit">Войти</button></p></form><p><small>Пароль находится в Railway: holodos-bot → Variables → ADMIN_PASSWORD. Не присылай его в чат.</small></p>';
 if(!isAdmin){
  if(req.method==='POST'&&url.pathname==='/login'){
   try{
    const form=await formData(req),candidate=String(form.get('password')||'');
    if(!validCsrf(form,'login')){html(403,loginPage('Обнови страницу и попробуй ещё раз.'));return;}
    if(candidate.length>1024||!equal(candidate,pass)){html(401,loginPage('Неверный пароль.'));return;}
    const expiry=String(Date.now()+authAge),value=expiry+'.'+signed(expiry);
    res.writeHead(303,{Location:'/admin',"Cache-Control":"no-store",'Set-Cookie':cookieName+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800'});res.end();
   }catch{html(400,loginPage('Не получилось обработать форму.'));}
   return;
  }
  html(req.method==='GET'&&url.pathname==='/admin'?200:401,loginPage()+'<p><a href="/auth/twitch">Войти через Twitch</a></p>');return;
 }
 if(req.method==='POST'&&url.pathname==='/logout'){
  const form=await formData(req);
  if(!validCsrf(form,'disconnect')){html(403,'Форма устарела, обнови страницу.');return;}
  res.writeHead(303,{Location:'/',"Cache-Control":"no-store",'Set-Cookie':cookieName+'=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'});res.end();return;
 }
 if(req.method==='POST'){
  if(url.pathname==='/duel-cosmetic'){
   try{const f=await formData(req);if(!validCsrf(f,'duel-cosmetic')){html(403,'Форма устарела. Обнови страницу.');return;}site.duelVisuals.grant(f.get('login'),f.get('can'),site.adminIdentity(req).player_id);res.writeHead(303,{Location:'/admin#cosmetics','Cache-Control':'no-store'});res.end();}
   catch(e){html(e.status||400,'<h2>Банка не выдана</h2><p>'+escape(e.message)+'</p><a href="/admin#cosmetics">Вернуться</a>');}return;
  }
  if(url.pathname==='/review-add'){
   try{const f=await formData(req);if(!validCsrf(f,'reviews')){html(403,'Форма устарела. Обнови страницу.');return;}
    site.reviews.addByAdmin({author:f.get('author'),rating:f.get('rating'),body:f.get('body')});res.writeHead(303,{Location:'/admin#reviews','Cache-Control':'no-store'});res.end();
   }catch(e){html(e.status||400,'<h2>Отзыв не добавлен</h2><p>'+escape(e.message)+'</p><a href="/admin#reviews">Вернуться</a>');}return;
  }
  if(url.pathname==='/support-reply'){
   try{const f=await formData(req);if(!validCsrf(f,'support')){html(403,'Форма устарела. Обнови страницу.');return;}
    const actor=site.adminIdentity(req);site.support.reply(actor,f.get('ticket_id'),f.get('body'),true);res.writeHead(303,{Location:'/admin#support','Cache-Control':'no-store'});res.end();
   }catch(e){html(e.status||400,'Не удалось отправить ответ: '+escape(e.message));}return;
  }
  if(url.pathname==='/order'){
   try{
    const f=await formData(req);
    if(!validCsrf(f,'shop-order')){html(403,'Форма устарела, обнови страницу.');return;}
    const id=String(f.get('order_id')||'');
    const action=String(f.get('action')||'');
    if(!/^\d{1,12}$/.test(id)||!['fulfilled','cancelled'].includes(action)){html(400,'Неверный заказ или действие.');return;}
    resolveOrder(Number(id),action,Date.now());
    redirect();
   }catch(err){html(400,'Не удалось обработать заказ: '+escape(err.message));}
   return;
  }
  if(url.pathname==='/configure'){
   try{
    const f=await formData(req);
    if(!validCsrf(f,'configure')){html(403,'Форма устарела, обнови страницу.');return;}
    const id=(f.get('client_id')||'').trim(),s=(f.get('client_secret')||'').trim();
    if(!/^[a-z0-9]{10,100}$/i.test(id)||s.length<10||s.length>200)throw Error('Неверный Client ID или Secret');
    await stop();
    db.prepare('DELETE FROM twitch_token WHERE id=1').run();
    db.prepare('INSERT INTO twitch_app(id,client_id,client_secret) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET client_id=excluded.client_id,client_secret=excluded.client_secret').run(id,encrypt(s));
    redirect();
   }catch(e){html(400,'Не получилось сохранить: '+escape(e.message));}
   return;
  }
  if(url.pathname==='/disconnect'){await stop();db.prepare('DELETE FROM twitch_token WHERE id=1').run();redirect();return;}
  html(404,'Не найдено');return;
 }
 if(url.pathname==='/connect'){
  const a=app();if(!a){html(400,'Сначала сохрани Twitch Client ID и Secret.');return;}
  const state=randomBytes(24).toString('hex');states.set(state,Date.now()+10*60*1000);
  for(const [k,v] of states)if(v<Date.now())states.delete(k);
  const u=new URL('https://id.twitch.tv/oauth2/authorize');
  u.search=new URLSearchParams({client_id:a.id,redirect_uri:publicUrl+'/oauth/callback',response_type:'code',scope:'chat:read chat:edit',state,force_verify:'true'}).toString();
  res.writeHead(302,{Location:u.toString(),'Cache-Control':'no-store'});res.end();return;
 }
 if(url.pathname!=='/admin'){html(404,'Не найдено');return;}
 const a=app(),linked=current();
 const stats=db.prepare('SELECT COUNT(*) AS users,COALESCE(SUM(balance),0) AS balance,COALESCE(SUM(opens),0) AS opens FROM players').get();
 const orders=db.prepare("SELECT id,login,vp,price,created_at FROM shop_orders WHERE status='pending' ORDER BY id ASC LIMIT 40").all();
 const pendingCount=db.prepare("SELECT COUNT(*) AS n FROM shop_orders WHERE status='pending'").get().n;
 const number=n=>Number(n||0).toLocaleString('ru-RU');
 let content='<header class="admin-heading" id="overview"><div><div class="admin-eyebrow">WAR1OUSS / ПАНЕЛЬ УПРАВЛЕНИЯ</div><h1>Всё под контролем.</h1><p>Баланс сообщества, заявки и подключение Twitch.</p></div><span class="admin-badge '+(connected?'online':'')+'">'+(connected?'● Бот в сети':'○ Бот не подключён')+'</span></header>';
 content+='<div class="admin-kpis"><div class="admin-stat"><span>ИГРОКИ</span><strong>'+number(stats.users)+'</strong><small>В общей базе</small></div><div class="admin-stat"><span>W В ОБРАЩЕНИИ</span><strong>'+number(stats.balance)+'</strong><small>Сумма текущих балансов</small></div><div class="admin-stat"><span>ОТКРЫТИЯ ХОЛОДОСА</span><strong>'+number(stats.opens)+'</strong><small>Сайт и Twitch</small></div><div class="admin-stat"><span>ОЖИДАЮТ ВЫДАЧИ</span><strong>'+number(pendingCount)+'</strong><small>Заявки магазина VP</small></div></div>';
 content+='<section class="admin-panel" id="orders"><h2>Заявки на VP</h2><p class="admin-note">W уже списаны при заказе. Отмечай выдачу только после передачи кода игроку. Отмена возвращает W.</p>';
 if(!orders.length)content+='<div class="admin-empty">Все заявки обработаны. Новые заказы появятся здесь.</div>';
 for(const o of orders){
  content+='<article class="admin-order"><div class="admin-order-head"><b>№'+o.id+' · @'+escape(o.login)+'</b><strong>'+o.vp+' VP</strong></div><small>'+number(o.price)+' W · '+escape(new Date(o.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Tallinn'}))+'</small><div class="admin-actions">'+
   '<form method="post" action="/order"><input type="hidden" name="csrf" value="'+csrf('shop-order')+'"><input type="hidden" name="order_id" value="'+o.id+'"><input type="hidden" name="action" value="fulfilled"><button type="submit">Код выдан</button></form>'+
   '<form method="post" action="/order"><input type="hidden" name="csrf" value="'+csrf('shop-order')+'"><input type="hidden" name="order_id" value="'+o.id+'"><input type="hidden" name="action" value="cancelled"><button class="danger" type="submit">Отменить и вернуть W</button></form></div></article>';
 }
 content+='</section><div class="admin-grid"><section class="admin-panel" id="economy"><h2>Экономика</h2><p class="admin-note">Текущие цены магазина. Уже созданные заявки сохраняют свою стоимость.</p>';
 for(const [vp,price] of Object.entries(SHOP_PRICES))content+='<div class="admin-row"><span>'+vp+' VP</span><b>'+number(price)+' W</b></div>';
 content+='<div class="admin-row"><span>Версия настроек</span><b>'+escape(ECONOMY.version)+'</b></div><div class="admin-row"><span>Кейсы</span><b>Открытия отключены</b></div><p><a class="link" href="/cases">Посмотреть коллекцию ↗</a></p></section>';
 content+='<section class="admin-panel"><h2>Twitch-канал</h2><div class="admin-row"><span>Канал</span><b>#'+escape(channel)+'</b></div><div class="admin-row"><span>Аккаунт бота</span><b>@'+escape(linked?.login||botLogin)+'</b></div><div class="admin-row"><span>Подключение</span><b>'+(linked?'Авторизован':'Требуется вход')+'</b></div><p class="admin-note">Команды: !холодос · !баланс · !магазин · !заказ</p></section></div>';
 content+='<section class="admin-panel" id="settings"><h2>Настройки Twitch</h2>';
 if(!a)content+='<p>Создай приложение в <a class="link" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener">Twitch Developer Console</a>. OAuth Redirect URL:</p><p><code>'+escape(publicUrl)+'/oauth/callback</code></p>'+setupForm(csrf('configure'));
 else{
  content+=linked?'<p>Бот авторизован. Отключение остановит его работу в чате.</p><form method="post" action="/disconnect"><input type="hidden" name="csrf" value="'+csrf('disconnect')+'"><button type="submit">Отключить бота</button></form>':'<p>Авторизуй аккаунт @'+escape(botLogin)+', чтобы бот мог работать в чате.</p><a class="admin-button" href="/connect">Подключить Twitch</a>';
  content+='<details style="margin-top:20px"><summary>Изменить Client ID и Client Secret</summary><p class="admin-note">OAuth Redirect: <code>'+escape(publicUrl)+'/oauth/callback</code></p>'+setupForm(csrf('configure'))+'</details>';
 }
 content+='</section>';
 content+='<section class="admin-panel" id="support"><h2>Обращения пользователей</h2><p class="admin-note">Последние 30 обращений. Время указано по Таллину.</p>';
 const tickets=db.prepare('SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 30').all();
 if(!tickets.length)content+='<p>Новых обращений пока нет.</p>';
 for(const t of tickets){content+='<details class="admin-order"><summary>№'+t.id+' · @'+escape(t.login)+' · '+escape(new Date(t.updated_at).toLocaleString('ru-RU',{timeZone:'Europe/Tallinn'}))+'</summary>';
 const messages=db.prepare('SELECT * FROM (SELECT * FROM support_messages WHERE ticket_id=? ORDER BY id DESC LIMIT 100) ORDER BY id').all(t.id);
 for(const m of messages)content+='<article class="admin-support-message"><b>'+escape(m.role==='system'?'Автоматическое сообщение':m.role==='admin'?'Администратор · '+m.author:m.author)+'</b> <small>'+escape(new Date(m.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Tallinn'}))+'</small><p>'+escape(m.body)+'</p></article>';
 content+='<form method="post" action="/support-reply"><input type="hidden" name="csrf" value="'+csrf('support')+'"><input type="hidden" name="ticket_id" value="'+t.id+'"><label>Ответ пользователю<textarea name="body" rows="4" minlength="2" maxlength="2000" required></textarea></label><button type="submit">Отправить ответ</button></form></details>';
 }content+='</section>';
 content+='<section class="admin-panel" id="reviews"><h2>Отзывы магазина</h2><p class="admin-note">Отзывы пользователей доступны после выдачи VP. Внесённые вручную отзывы помечаются как добавленные администрацией.</p><form method="post" action="/review-add"><input type="hidden" name="csrf" value="'+csrf('reviews')+'"><label>Имя автора<input name="author" minlength="2" maxlength="60" required></label><label>Оценка<select name="rating"><option value="5">5 из 5</option><option value="4">4 из 5</option><option value="3">3 из 5</option><option value="2">2 из 5</option><option value="1">1 из 5</option></select></label><label>Текст отзыва<textarea name="body" minlength="5" maxlength="1200" rows="4" required></textarea></label><button type="submit">Добавить отзыв</button></form>';
 for(const r of site.reviews.list())content+='<article class="admin-support-message"><b>'+escape(r.author_name)+'</b> · '+r.rating+'/5 <small>'+escape(r.source==='verified'?'VP получены на сайте':'Добавлено администрацией')+' · '+escape(new Date(r.created_at).toLocaleString('ru-RU',{timeZone:'Europe/Tallinn'}))+'</small><p>'+escape(r.body)+'</p></article>';
 content+='</section>';
 content+='<section class="admin-panel" id="cosmetics"><h2>Банки для дуэлей</h2><p class="admin-note">Ручная выдача косметики существующему игроку. Не меняет баланс и шансы победы. Открытия кейса за подписку пока отключены.</p><form method="post" action="/duel-cosmetic"><input type="hidden" name="csrf" value="'+csrf('duel-cosmetic')+'"><label>Twitch-ник<input name="login" maxlength="26" required placeholder="@игрок"></label><label>Косметическая банка<select name="can">'+Object.entries(site.duelVisuals.catalog).map(([id,label])=>'<option value="'+id+'">'+escape(label)+'</option>').join('')+'</select></label><button type="submit">Выдать косметическую банку</button></form></section>';
 html(200,content);
});
server.listen(port,'0.0.0.0',()=>console.log('Holodos panel listening on '+port+' for #'+channel));
if(current()&&app())void start();
const duelTimer=setInterval(()=>{try{expireDuels(Date.now(),true);}catch(e){console.error('Duel expiration:',e.message);}},5000);
const heartbeat=setInterval(async()=>{if(ending||starting)return;try{if(!current()||!app())return;if(current().expires_at<Date.now()+30*60*1000){await refresh();await start();}else if(!connected)await start();db.prepare('DELETE FROM seen WHERE created_at<?').run(Date.now()-7*86400000);}catch(e){console.error('Twitch heartbeat:',e.message);}},60000);
async function shutdown(){ending=true;clearInterval(heartbeat);clearInterval(duelTimer);await stop();server.close();db.close();}
process.once('SIGINT',()=>void shutdown().then(()=>process.exit(0)));
process.once('SIGTERM',()=>void shutdown().then(()=>process.exit(0)));
