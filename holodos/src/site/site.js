'use strict';
const $=id=>document.getElementById(id);
const routes=new Set(['/','/casino','/cases','/duels','/top','/chat','/profile','/shop']);
const state={me:null,public:null,history:null,duels:null,busy:false,timer:null};
const fmt=n=>Number(n||0).toLocaleString('ru-RU');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const ruTime=t=>new Date(Number(t)).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
function notice(message){
 const el=$('toast');el.textContent=message;el.classList.add('visible');
 clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.classList.remove('visible'),4000);
}
async function api(path,options={}){
 let response;
 try{response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});}
 catch{throw Error('Нет связи с сервером. Попробуй ещё раз.');}
 let data;try{data=await response.json();}catch{throw Error('Сервер вернул неверный ответ.');}
 if(!response.ok)throw Object.assign(Error(data.error||'Не удалось выполнить запрос'),{status:response.status,remaining:data.remaining});
 return data;
}
function safeAvatar(src){
 return typeof src==='string'&&/^https:\/\/(static-cdn\.jtvnw\.net|.*\.twitch\.tv)\//i.test(src)?src:'';
}
function currentRoute(){return routes.has(location.pathname)?location.pathname:'/';}
let sidebarMode='icons';
try{const saved=localStorage.getItem('war1ouss-sidebar');if(['icons','expanded','hidden'].includes(saved))sidebarMode=saved;}catch{}
function applySidebarMode(mode){
 sidebarMode=mode;const side=$('side-navigation');
 side.classList.toggle('expanded',mode==='expanded');side.classList.toggle('fully-hidden',mode==='hidden');
 document.body.dataset.sidebar=mode;
 $('side-backdrop').hidden=mode!=='expanded'||!window.matchMedia('(max-width:780px)').matches;
 $('side-toggle').setAttribute('aria-expanded',String(mode==='expanded'));
 $('side-toggle').setAttribute('aria-label',mode==='expanded'?'Свернуть до иконок':'Открыть полные названия. Двойное нажатие — скрыть меню');
 $('side-links').inert=mode==='hidden';
 try{localStorage.setItem('war1ouss-sidebar',mode);}catch{}
}
function closeSidebar(){applySidebarMode('icons');}
function toggleSidebar(){applySidebarMode(sidebarMode==='expanded'?'icons':'expanded');}
applySidebarMode(sidebarMode);
let sidebarClickTimer;
function sidebarClick(event){clearTimeout(sidebarClickTimer);if(event.detail>1)return;sidebarClickTimer=setTimeout(toggleSidebar,230);}
function sidebarDoubleClick(){clearTimeout(sidebarClickTimer);applySidebarMode('hidden');}
function navigate(path,replace=false){
 if(!routes.has(path))path='/';
 if(replace)history.replaceState({},'',path);else if(location.pathname!==path)history.pushState({},'',path);
 document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.dataset.view===path));
 document.querySelectorAll('.nav-link').forEach(el=>{el.classList.toggle('active',el.getAttribute('href')===path);if(el.getAttribute('href')===path)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 $('main-nav').classList.remove('open');$('menu-btn').setAttribute('aria-expanded','false');
 document.body.classList.toggle('inner-page',path!=='/');
 document.querySelectorAll('.side-link[data-route]').forEach(el=>{el.classList.toggle('active',el.getAttribute('href')===path);if(el.getAttribute('href')===path)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 applySidebarMode(sidebarMode);
 const titles={'/':'Главная','/casino':'Холодос','/cases':'Кейсы','/duels':'Дуэли','/top':'Топ игроков','/chat':'Топ чата','/profile':'Профиль','/shop':'Магазин'};
 document.title=(titles[path]||'Главная')+' — War1ouss';
 window.scrollTo({top:0,behavior:'instant'});
 if(path==='/duels')refreshDuels();
 if(path==='/casino')refreshSpins();
 if(path==='/profile')renderProfile();
}
function rankHtml(list,kind='balance'){
 if(!list||!list.length)return '<p class="muted">Пока нет данных. Рейтинг обновляется по мере активности игроков.</p>';
 return list.map((r,i)=>'<div class="rank-item"><span class="rank-position">'+(i+1)+'</span><div class="rank-name"><b>@'+esc(r.login)+'</b>'+(kind==='balance'?'<small>Открытий: '+fmt(r.opens)+'</small>':'<small>Сообщений с начала учёта</small>')+'</div><div class="rank-score">'+fmt(kind==='balance'?r.balance:r.message_count)+' '+(kind==='balance'?'W':'сообщ.')+'</div></div>').join('');
}
function winsHtml(list){
 if(!list||!list.length)return '<p class="muted">Реальные выигрыши появятся здесь после следующих открытий. Прошлые игры бота ещё не записывались в историю.</p>';
 return list.map(r=>'<div class="win-item"><span class="win-cans">'+esc((r.cans||[]).join(' '))+'</span><div><b>@'+esc(r.login)+'</b><small>'+esc(r.source==='chat'?'Twitch':'Сайт')+' · '+ruTime(r.created_at)+'</small></div><strong class="win-gain">+'+fmt(r.gain)+' W</strong></div>').join('');
}
function historySymbolsHtml(symbols){
 return '<span class="history-cans">'+(symbols||[]).map(symbol=>{
  const sprite=slotSprites[symbol];
  return sprite?'<img src="/assets/slot-'+sprite[0]+'.webp?v=14" alt="'+esc(sprite[1])+'" title="'+esc(sprite[1])+'" width="20" height="40">':esc(symbol);
 }).join('')+'</span>';
}
function historyHtml(list){
 if(!list||!list.length)return '<p class="muted">Открытий пока нет. История сохраняется с запуска сайта.</p>';
 return list.map(r=>'<div class="history-item"><strong>@'+esc(r.login)+'</strong>'+historySymbolsHtml(r.cans)+'<em>+'+fmt(r.gain)+' W</em><time>'+ruTime(r.created_at)+'</time></div>').join('');
}
function renderPublic(){
 const p=state.public;if(!p)return;
 $('home-top').innerHTML=rankHtml((p.top||[]).slice(0,5));
 $('home-wins').innerHTML=winsHtml(p.recent);
 $('top-list').innerHTML=rankHtml(p.top);
 $('chat-list').innerHTML=rankHtml(p.chat,'chat');
}
function renderMe(){
 const me=state.me;
 const logged=!!(me&&me.authenticated);
 $('login-btn').hidden=logged;
 $('avatar-link').hidden=!logged;
 $('wallet-amount').textContent=logged?fmt(me.player.balance)+' W':'—';
 if($('case-site-balance'))$('case-site-balance').textContent=logged?fmt(me.player.balance)+' W':'—';
 if($('case-site-balance-hint'))$('case-site-balance-hint').textContent=logged?'Общий баланс сайта и бота':'Войди через Twitch';
 if($('side-balance'))$('side-balance').textContent=logged?fmt(me.player.balance)+' W':'W —';
 if($('side-login'))$('side-login').hidden=logged;
 if($('side-admin'))$('side-admin').hidden=!(logged&&me.is_admin);
 if(logged){
  $('top-name').textContent=me.player.display_name||me.player.login;
  const avatar=safeAvatar(me.player.avatar);
  if(avatar)$('top-avatar').src=avatar;else $('top-avatar').src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="100%25" height="100%25" fill="%23244056"/%3E%3Ctext x="50%25" y="58%25" font-size="35" text-anchor="middle" fill="white"%3EW%3C/text%3E%3C/svg%3E';
 }
 updateCooldown();
 renderProfile();
}
function renderProfile(){
 const me=state.me;if(!me)return;
 if(!me.authenticated){
  $('profile-content').innerHTML='<h3>Войди через Twitch</h3><p class="muted">После входа здесь появятся твой реальный баланс, статистика «Холодоса» и магазинные заявки.</p><a class="button button-primary" href="/auth/twitch">Войти через Twitch ↗</a>';
  return;
 }
 const p=me.player,orders=me.orders||[];
 const avatar=safeAvatar(p.avatar);
 $('profile-content').innerHTML='<div class="profile-card">'+(avatar?'<img class="profile-avatar" src="'+esc(avatar)+'" alt="Аватар Twitch">':'<span class="coin-icon" style="width:75px;height:75px;font-size:27px">W</span>')+'<div><div class="profile-name">@'+esc(p.display_name||p.login)+'</div><span class="profile-muted">Аккаунт Twitch · W-монеты синхронизированы с чатом</span></div></div>'
  +'<div class="stats-grid"><div class="stat"><strong>'+fmt(p.balance)+'</strong><span>Баланс W</span></div><div class="stat"><strong>'+fmt(p.opens)+'</strong><span>Открытий</span></div><div class="stat"><strong>'+fmt(p.wins)+'</strong><span>Выигрышей</span></div><div class="stat"><strong>'+fmt(p.jackpots)+'</strong><span>Суперджекпотов</span></div></div>'
  +'<div class="profile-orders"><h3>Заявки магазина</h3>'+(orders.length?orders.map(o=>'<div class="history-item"><strong>№'+o.id+' · '+o.vp+' VP</strong><span>'+esc(o.status==='pending'?'Ожидает выдачи':o.status==='fulfilled'?'Выдано':'Отменено')+'</span><em>'+fmt(o.price)+' W</em><time>'+ruTime(o.created_at)+'</time></div>').join(''):'<p class="muted">Пока нет заявок. Оформить можно через команду !купить в чате.</p>')+'</div>'
  +'<button type="button" class="logout-btn" id="logout-btn">Выйти из профиля</button>';
 $('logout-btn').addEventListener('click',logout);
}
async function logout(){
 try{await api('/api/logout',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me?.csrf||''},body:'{}'});state.me={authenticated:false};renderMe();notice('Ты вышел из профиля');navigate('/');}
 catch(e){notice(e.message);}
}
function updateCooldown(){
 const me=state.me,button=$('spin-button'),message=$('spin-result');
 if(state.busy)return;
 if(!me?.authenticated){
  button.disabled=false;button.textContent='Войти через Twitch ↗';
  return;
 }
 const remains=Math.max(0,Math.ceil((Number(me.player.last_opened||0)+120000-Date.now())/1000));
 button.disabled=remains>0;
 if(remains>0){
  const m=Math.floor(remains/60),s=String(remains%60).padStart(2,'0');
  button.textContent='Следующее открытие через '+m+':'+s;
 }else button.textContent='Открыть холодос ↗';
}

const slotSprites={
 '⚪':['white','Monster Zero Ultra'], '🟢':['green','Monster Ultra Paradise'],
 '🥭':['mango','Monster Mango Loco'], '🌸':['pink','Monster Ultra Rosa'],
 '🔵':['blue','Monster Ultra Blue'], '⚫':['black','Monster Original'],
 '🍉':['watermelon','Monster Watermelon'], '🟡':['yellow','Monster Ultra Gold'],
 '👑':['w-edition','W Edition']
};
function setReelSymbol(el,symbol){
 const sprite=slotSprites[symbol];
 if(!sprite){el.textContent=symbol;return;}
 let img=el.querySelector('img');
 if(!img){img=document.createElement('img');img.className='slot-symbol';img.draggable=false;el.replaceChildren(img);}
 img.src='/assets/slot-'+sprite[0]+'.webp?v=14';img.alt=sprite[1];
}
Object.values(slotSprites).forEach(([id])=>{const image=new Image();image.src='/assets/slot-'+id+'.webp?v=14';});
['reel-1','reel-2','reel-3'].forEach(id=>setReelSymbol($(id),$(id).textContent.trim()));
// Presentation only: emoji identifiers remain in markup and API/game data.
const symbolPattern=/⚪|🟢|🥭|🌸|🔵|⚫|🍉|🟡|👑/gu;
const oddsPanel=document.querySelector('#view-casino .odds-panel');
const textWalker=document.createTreeWalker(oddsPanel,NodeFilter.SHOW_TEXT);
const symbolNodes=[];
while(textWalker.nextNode())if(textWalker.currentNode.textContent.match(symbolPattern))symbolNodes.push(textWalker.currentNode);
for(const textNode of symbolNodes){
 const fragment=document.createDocumentFragment();
 for(const part of textNode.textContent.split(/(⚪|🟢|🥭|🌸|🔵|⚫|🍉|🟡|👑)/u)){
  if(slotSprites[part]){const span=document.createElement('span');span.className='odds-symbol';span.dataset.symbol=part;setReelSymbol(span,part);fragment.append(span);}
  else fragment.append(document.createTextNode(part));
 }
 textNode.replaceWith(fragment);
}


async function spin(){
 if(state.busy)return;
 if(!state.me?.authenticated){location.href='/auth/twitch';return;}
 state.busy=true;
 const reels=['reel-1','reel-2','reel-3'].map($);
 const chars=['⚪','🟢','🥭','🌸','🔵','⚫','🍉','🟡'];
 const reelFrame=$('view-casino').querySelector('.reels');
 reelFrame.classList.remove('win-flash','jackpot-flash','freeze-flash');
 const container=reelFrame.closest('.slot-game');
 container.classList.remove('container-freeze');
 reels.forEach(e=>e.classList.add('spinning'));
 $('spin-button').disabled=true;$('spin-button').textContent='Открываем…';
 $('spin-result').classList.remove('win');$('spin-result').textContent='Холодос открывается…';
 let cycling=setInterval(()=>reels.forEach(e=>{if(e.classList.contains('spinning'))setReelSymbol(e,chars[Math.floor(Math.random()*chars.length)]);}),80);
 const started=Date.now();
 try{
  const result=await api('/api/holodos',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({requestId:crypto.randomUUID()})});
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,(reduceMotion?0:1150)-(Date.now()-started))));
  // Settle one reel at a time; the result was already chosen and saved by the server.
  for(let i=0;i<reels.length;i++){
   reels[i].classList.remove('spinning');setReelSymbol(reels[i],result.cans[i]);
   if(!reduceMotion&&i<reels.length-1)await new Promise(resolve=>setTimeout(resolve,125));
  }
  clearInterval(cycling);
  if(result.gain>0){
   reelFrame.classList.add(result.gain===400?'jackpot-flash':'win-flash');
   setTimeout(()=>reelFrame.classList.remove('win-flash','jackpot-flash'),1300);
  }else if(!reduceMotion){
   // Visual-only frost on a real server-confirmed zero result.
   // Never changes the prize, cooldown, balances or request handling.
   reelFrame.classList.add('freeze-flash');
   container.classList.add('container-freeze');
   setTimeout(()=>container.classList.remove('container-freeze'),2100);
   setTimeout(()=>reelFrame.classList.remove('freeze-flash'),1450);
  }
  $('spin-result').textContent=result.description+' +'+fmt(result.gain)+' W';
  if(result.gain>0)$('spin-result').classList.add('win');
  state.me.player.balance=result.balance;state.me.player.last_opened=result.last_opened;state.me.player.opens++;state.me.player.wins+=result.gain>0?1:0;state.me.player.jackpots+=result.gain===400?1:0;
  renderMe();await Promise.all([refreshPublic(),refreshSpins()]);
 }catch(e){
  clearInterval(cycling);reels.forEach(el=>el.classList.remove('spinning'));
  $('spin-result').textContent=e.message;
  if(e.status===429)state.me.player.last_opened=Date.now()+(e.remaining||1)*1000-120000;
 }finally{state.busy=false;updateCooldown();}
}
async function refreshPublic(){
 try{state.public=await api('/api/public');renderPublic();}
 catch(e){const text='<p class="muted">'+esc(e.message)+'</p>';['home-top','home-wins','top-list','chat-list'].forEach(id=>$(id).innerHTML=text);}
}
async function refreshMe(){
 try{state.me=await api('/api/me');renderMe();}
 catch(e){state.me={authenticated:false};renderMe();notice(e.message);}
}
async function refreshSpins(){
 try{const v=await api('/api/spins');state.history=v.spins;$('casino-history').innerHTML=historyHtml(v.spins);}
 catch(e){$('casino-history').textContent=e.message;}
}
async function refreshDuels(){
 try{
  const data=await api('/api/duels');state.duels=data;
  const pending=data.pending||[],recent=data.recent||[],logged=state.me?.authenticated;
  $('pending-duels').innerHTML=pending.length?pending.map(d=>{
   const mine=logged&&d.opponent_login===state.me.player.login.toLowerCase();
   return '<div class="duel-item"><div><strong>@'+esc(d.initiator_login)+' → @'+esc(d.opponent_login)+'</strong><p>Банк '+fmt(d.wager*2)+' W · ставка '+fmt(d.wager)+' W · до '+new Date(d.expires_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'</p></div>'+(mine?'<div class="duel-actions"><button data-duel-answer="accept">Принять</button><button class="decline" data-duel-answer="decline">Отказ</button></div>':'')+'</div>';
  }).join(''):'<p class="muted">Активных вызовов пока нет. Создай первый!</p>';
  $('duel-history').innerHTML=recent.length?recent.map(d=>'<div class="history-item"><strong>@'+esc(d.initiator_login)+' ↔ @'+esc(d.opponent_login)+'</strong><span>'+esc(d.winner_login?'Победил @'+d.winner_login:d.status)+'</span><em>'+fmt(d.wager*2-d.fee)+' W</em><time>'+ruTime(d.resolved_at||d.created_at)+'</time></div>').join(''):'<p class="muted">Завершённых дуэлей пока нет.</p>';
 }catch(e){$('pending-duels').textContent=e.message;$('duel-history').textContent=e.message;}
}
async function duelAction(answer){
 if(!state.me?.authenticated){location.href='/auth/twitch';return;}
 try{
  const result=await api('/api/duels/respond',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({answer,requestId:crypto.randomUUID()})});
  notice(result.message||'Ответ отправлен');await Promise.all([refreshDuels(),refreshMe(),refreshPublic()]);
 }catch(e){notice(e.message);}
}
async function challenge(event){
 event.preventDefault();if(!state.me?.authenticated){location.href='/auth/twitch';return;}
 const target=$('duel-target').value.trim().replace(/^@/,'').toLowerCase();
 const wager=Number($('duel-wager').value);
 if(!/^[a-z0-9_]{1,25}$/.test(target)||!Number.isSafeInteger(wager)||wager<1||wager>100000000){$('duel-message').textContent='Укажи правильный Twitch-ник и ставку от 1 W.';return;}
 const btn=$('duel-form').querySelector('button');btn.disabled=true;
 try{
  const result=await api('/api/duels/challenge',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({target,wager,requestId:crypto.randomUUID()})});
  $('duel-message').textContent=result.message;await refreshDuels();
 }catch(e){$('duel-message').textContent=e.message;}
 finally{btn.disabled=false;}
}
document.addEventListener('click',e=>{
 const link=e.target.closest('a[data-route]');if(link){e.preventDefault();navigate(link.getAttribute('href'));return;}
 const action=e.target.closest('[data-duel-answer]');if(action)duelAction(action.dataset.duelAnswer);
});
window.addEventListener('popstate',()=>navigate(currentRoute(),true));
$('side-toggle').addEventListener('click',sidebarClick);
$('side-toggle').addEventListener('dblclick',sidebarDoubleClick);
$('side-backdrop').addEventListener('click',closeSidebar);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSidebar()});
$('menu-btn').addEventListener('click',()=>{const nav=$('main-nav');const open=nav.classList.toggle('open');$('menu-btn').setAttribute('aria-expanded',open?'true':'false');});
$('spin-button').addEventListener('click',spin);
$('duel-form').addEventListener('submit',challenge);
$('refresh-duels').addEventListener('click',refreshDuels);
navigate(currentRoute(),true);
Promise.all([refreshPublic(),refreshMe(),refreshSpins()]).then(()=>{if(currentRoute()==='/duels')refreshDuels();});
setInterval(updateCooldown,1000);
// Keep W coins, cooldown and chat ranks in sync with the same live SQLite-backed API.
// Poll only while the tab is visible; never invent a client-side balance.
setInterval(()=>{if(document.visibilityState==='visible'&&!state.busy)refreshMe();},12000);
setInterval(()=>{if(document.visibilityState==='visible'){refreshPublic();if(currentRoute()==='/duels')refreshDuels();}},20000);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&!state.busy){refreshMe();refreshPublic();if(currentRoute()==='/duels')refreshDuels();}
});
