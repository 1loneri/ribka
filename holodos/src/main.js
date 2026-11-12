import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomInt,randomBytes,scryptSync,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import tmi from 'tmi.js';

const channel=(process.env.TWITCH_CHANNEL||'war1ouss').toLowerCase();
const botLogin=(process.env.BOT_USERNAME||'bot_leha_ai').toLowerCase();
const publicUrl=(process.env.PUBLIC_URL||'http://localhost:3000').replace(/\/$/,'');
const port=Number(process.env.PORT||3000);
const pass=process.env.ADMIN_PASSWORD||'';
const secret=process.env.APP_SECRET||'';
const dbPath=process.env.DB_PATH||'/data/leha.sqlite';
if(!/^[a-z0-9_]{1,25}$/.test(channel)||!/^[a-z0-9_]{1,25}$/.test(botLogin)||pass.length<16||secret.length<32||!Number.isInteger(port)||port<1||port>65535||(!/^https:\/\//.test(publicUrl)&&!/^http:\/\/localhost(?::\d+)?$/.test(publicUrl)))throw Error('Set BOT_USERNAME, TWITCH_CHANNEL, PUBLIC_URL (HTTPS), ADMIN_PASSWORD (16+), APP_SECRET (32+)');
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
db.exec("CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY,login TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0,last_opened INTEGER NOT NULL DEFAULT 0,opens INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,jackpots INTEGER NOT NULL DEFAULT 0);");
db.exec("CREATE TABLE IF NOT EXISTS seen(message_id TEXT PRIMARY KEY,created_at INTEGER NOT NULL);");
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
const cans=['⚪','🟢','🥭','🌸','🔵','⚫','ⓦ'];
function chooseExcluding(excluded){const a=cans.map((_,i)=>i).filter(i=>!excluded.includes(i));return a[randomInt(a.length)];}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
function draw(){
 const n=randomInt(100);
 if(n===0)return {cans:[6,6,6],gain:100,description:'W EDITION! РЕДКИЙ ДЖЕКПОТ!'};
 if(n<8){const c=randomInt(6);return {cans:[c,c,c],gain:20,description:'три одинаковые банки! ДЖЕКПОТ!'};}
 if(n<35){const c=randomInt(20)===0?6:randomInt(6);return {cans:shuffle([c,c,chooseExcluding([c])]),gain:5,description:'две одинаковые банки!'};}
 const a=randomInt(12)===0?6:randomInt(6),b=chooseExcluding([a]),c=chooseExcluding([a,b]);return {cans:shuffle([a,b,c]),gain:0,description:'три разные банки.'};
}
let client=null,connected=false,starting=false,ending=false,sending=false;
const queue=[];
function say(text){if(!text||queue.length>=25)return;queue.push(text.slice(0,450));void drain();}
async function drain(){if(sending||!connected||!client)return;sending=true;try{while(queue.length&&connected&&client){const message=queue.shift();try{await client.say('#'+channel,message);}catch(e){console.error('chat send:',e.message);}if(queue.length)await new Promise(r=>setTimeout(r,3100));}}finally{sending=false;}}
function handle(login,id,msg,mid,now){
 const cmd=msg.trim().toLowerCase();let output=null;
 if(cmd==='!холодос')output=transaction(()=>{
  if(!seen(mid,now))return null;
  const p=player(id,login);
  if(now-p.last_opened<90000)return '@'+login+', холодос можно открыть через '+Math.ceil((90000-now+p.last_opened)/1000)+' сек.';
  const d=draw();
  db.prepare('UPDATE players SET last_opened=?,balance=balance+?,opens=opens+1,wins=wins+?,jackpots=jackpots+? WHERE id=?').run(now,d.gain,Number(d.gain>0),Number(d.gain===100),id);
  return '@'+login+' открыл холодос: '+d.cans.map(i=>cans[i]).join(' | ')+' — '+d.description+' +'+d.gain+' W';
 });
 else if(cmd==='!баланс')output=transaction(()=>seen(mid,now)?'@'+login+', у тебя '+player(id,login).balance.toLocaleString('ru-RU')+' W-монет.':null);
 else if(cmd==='!топмонет')output=transaction(()=>{
  if(!seen(mid,now))return null;
  const top=db.prepare('SELECT login,balance FROM players ORDER BY balance DESC,login ASC LIMIT 5').all();
  return top.length?'Топ W-монет: '+top.map((p,i)=>(i+1)+'. @'+p.login+' '+p.balance+' W').join(' | '):'Топ W-монет пуст. Открой !холодос.';
 });
 else if(cmd==='!статмонет')output=transaction(()=>{
  if(!seen(mid,now))return null;
  const p=player(id,login);
  return '@'+login+': открытий '+p.opens+', выигрышей '+p.wins+', W-джекпотов '+p.jackpots+', баланс '+p.balance+' W.';
 });
 else if(cmd==='!магазин')output=transaction(()=>seen(mid,now)?'Магазин (только справка): 240 VP = 18 000 W. Обмен и выдача VP пока не включены.':null);
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
   if(self||!msg.trim().startsWith('!'))return;
   const login=String(tags.username||'').toLowerCase(),id=String(tags['user-id']||''),mid=String(tags.id||'');
   if(login===botLogin||!/^[a-z0-9_]{1,25}$/.test(login)||!/^\d+$/.test(id)||!mid||mid.length>200)return;
   try{handle(login,id,msg,mid,Date.now());}catch(e){console.error('command:',e.message);}
  });
  await conn.connect();
 }catch(e){connected=false;console.error('Could not connect to Twitch:',e.message);}finally{starting=false;}
}
const states=new Map();
function equal(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function page(body){
 return '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Лёха · Холодос</title><style>body{background:#0e100e;color:#eee;font:16px system-ui;margin:0;padding:9vh 18px}main{max-width:690px;margin:auto}h1{font-size:44px}h1 b{color:#9aea42}section{background:#1b201a;border:1px solid #3b4b35;padding:25px;border-radius:16px}p{line-height:1.6}a,button{background:#9aea42;border:0;color:#14240e;padding:13px 19px;border-radius:9px;font-weight:bold;text-decoration:none;cursor:pointer;display:inline-block}a.link{background:transparent;color:#9aea42;padding:0;text-decoration:underline}label{display:block;margin:13px 0 5px}input{box-sizing:border-box;padding:12px;background:#111;color:white;border:1px solid #666;border-radius:8px;display:block;width:100%;margin-top:5px}code{color:#9aea42;overflow-wrap:anywhere}small{color:#bbb}summary{cursor:pointer}</style><main><h1>ЛЁХА<b>.</b></h1><section>'+body+'</section><p><small>Отдельный бот команд, не связанный со старым сайтом. W-монеты сохраняются на сервере.</small></p></main></html>';
}
async function formData(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>4096)throw Error('Слишком большая форма');}return new URLSearchParams(text);}
function setupForm(){
 const a=app();
 return '<form method="post" action="/configure"><label>Client ID<input name="client_id" required maxlength="100" autocomplete="off" value="'+escape(a?.id||'')+'"></label><label>Client Secret<input type="password" name="client_secret" required maxlength="200" autocomplete="off" placeholder="Secret из Twitch Developer Console"></label><p><button type="submit">Сохранить настройки Twitch</button></p></form>';
}
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const html=(status,body)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'"});res.end(page(body));};
 const redirect=()=>{res.writeHead(303,{Location:'/',"Cache-Control":"no-store"});res.end();};
 if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,twitch_connected:connected}));return;}
 if(url.pathname==='/oauth/callback'){
  const state=url.searchParams.get('state')||'',until=states.get(state);states.delete(state);
  if(!until||until<Date.now()){html(403,'Подключение истекло. Начни заново в панели.');return;}
  if(url.searchParams.has('error')){html(400,'Twitch отменил подключение.');return;}
  try{
   const data=await tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:publicUrl+'/oauth/callback'});
   const user=await validate(data.access_token),a=app();
   if(user.client_id!==a.id||user.login.toLowerCase()!==botLogin)throw Error('Войти нужно именно в аккаунт @'+botLogin);
   if(!user.scopes?.includes('chat:read')||!user.scopes?.includes('chat:edit'))throw Error('Не получены разрешения Twitch chat:read и chat:edit');
   saveToken(data,user);await start();
   html(200,'<h2>Аккаунт @'+escape(user.login)+' авторизован!</h2><p>Бот подключается к #'+escape(channel)+'.</p><a href="/">Панель</a>');
  }catch(e){html(400,'Ошибка Twitch: '+escape(e.message));}
  return;
 }
 let password='';
 try{const hdr=req.headers.authorization||'';if(hdr.startsWith('Basic '))password=Buffer.from(hdr.slice(6),'base64').toString('utf8').split(':').slice(1).join(':');}catch{}
 if(!equal(password,pass)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="Holodos admin"','Cache-Control':'no-store'});res.end('Введите пароль панели');return;}
 if(req.method==='POST'){
  if(req.headers.origin!==publicUrl){html(403,'Неверный адрес запроса');return;}
  if(url.pathname==='/configure'){
   try{
    const f=await formData(req),id=(f.get('client_id')||'').trim(),s=(f.get('client_secret')||'').trim();
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
 if(url.pathname!=='/'){html(404,'Не найдено');return;}
 const a=app(),linked=current();
 let content='<h2>'+ (linked?'@'+escape(linked.login)+' авторизован':a?'Twitch-приложение настроено':'Подключение Twitch')+'</h2><p>Канал: <code>#'+escape(channel)+'</code> · '+(connected?'Бот в чате':'Бот не в чате')+'</p><p>Команды: <code>!холодос</code>, <code>!баланс</code>, <code>!топмонет</code>, <code>!статмонет</code>, <code>!магазин</code>.</p>';
 if(!a)content+='<h3>Шаг 1. Создай Twitch-приложение</h3><p>Открой <a class="link" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noopener">Twitch Developer Console</a> и зарегистрируй приложение типа Confidential. В OAuth Redirect URLs добавь:</p><p><code>'+escape(publicUrl)+'/oauth/callback</code></p><p>Нажми Manage → New Secret и введи ID и Secret ниже (не отправляй секрет в чат ChatGPT).</p>'+setupForm();
 else{
  content+=linked?'<form method="post" action="/disconnect"><button type="submit">Отключить Twitch</button></form>':'<h3>Шаг 2. Войди как @'+escape(botLogin)+'</h3><p>Авторизуй именно аккаунт бота, чтобы он писал команды в чате.</p><a href="/connect">Подключить Twitch</a>';
  content+='<details style="margin-top:30px"><summary>Изменить Twitch Client ID / Secret</summary><p>Адрес OAuth Redirect: <code>'+escape(publicUrl)+'/oauth/callback</code></p>'+setupForm()+'</details>';
 }
 html(200,content);
});
server.listen(port,'0.0.0.0',()=>console.log('Holodos panel listening on '+port+' for #'+channel));
if(current()&&app())void start();
const heartbeat=setInterval(async()=>{if(ending||starting)return;try{if(!current()||!app())return;if(current().expires_at<Date.now()+30*60*1000){await refresh();await start();}else if(!connected)await start();db.prepare('DELETE FROM seen WHERE created_at<?').run(Date.now()-7*86400000);}catch(e){console.error('Twitch heartbeat:',e.message);}},60000);
async function shutdown(){ending=true;clearInterval(heartbeat);await stop();server.close();db.close();}
process.once('SIGINT',()=>void shutdown().then(()=>process.exit(0)));
process.once('SIGTERM',()=>void shutdown().then(()=>process.exit(0)));
