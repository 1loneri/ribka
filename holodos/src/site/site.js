'use strict';
const $=id=>document.getElementById(id);
const routes=new Set(['/','/casino','/cases','/duels','/top','/chat','/profile','/shop','/help','/requests']);
const state={me:null,public:null,history:null,duels:null,busy:false,timer:null};
const fmt=n=>Number(n||0).toLocaleString('ru-RU');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const ruTime=t=>new Date(Number(t)).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
function notice(message){
 const el=$('toast');el.textContent=message;el.classList.add('visible');
 playNoticeTone();
 clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.classList.remove('visible'),3500);
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
function toggleSidebar(){applySidebarMode(sidebarMode==='expanded'?'icons':sidebarMode==='hidden'?'icons':'expanded');}
applySidebarMode(sidebarMode);
let sidebarClickTimer;
function sidebarClick(event){clearTimeout(sidebarClickTimer);if(event.detail>1)return;sidebarClickTimer=setTimeout(toggleSidebar,230);}
function sidebarDoubleClick(){clearTimeout(sidebarClickTimer);applySidebarMode(sidebarMode==='hidden'?'icons':'hidden');}
let routeTransition;
function navigate(path,replace=false){
 if(!routes.has(path))path='/';
 const update=()=>renderRoute(path,replace);
 if(!replace&&location.pathname!==path&&document.startViewTransition&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
  routeTransition?.skipTransition();routeTransition=document.startViewTransition(update);
 }else update();
}
function renderRoute(path,replace=false){
 if(!routes.has(path))path='/';
 if(replace)history.replaceState({warDepth:history.state?.warDepth||0},'',path);else if(location.pathname!==path)history.pushState({warDepth:(history.state?.warDepth||0)+1},'',path);
 document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.dataset.view===path));
 document.querySelectorAll('.nav-link').forEach(el=>{el.classList.toggle('active',el.getAttribute('href')===path);if(el.getAttribute('href')===path)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 $('main-nav').classList.remove('open');$('menu-btn').setAttribute('aria-expanded','false');
 document.body.classList.toggle('inner-page',path!=='/');
 document.querySelectorAll('.side-link[data-route]').forEach(el=>{el.classList.toggle('active',el.getAttribute('href')===path);if(el.getAttribute('href')===path)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
 applySidebarMode(sidebarMode);
 const titles={'/':'Главная','/casino':'Холодос','/cases':'Кейсы','/duels':'Дуэли','/top':'Топ игроков','/chat':'Топ чата','/profile':'Профиль','/shop':'Магазин','/help':'Помощь','/requests':'Запросы'};
 document.title=(titles[path]||'Главная')+' — War1ouss';
 window.scrollTo({top:0,behavior:'instant'});
 if(path==='/duels')refreshDuels();
 if(path==='/casino')refreshSpins();
 if(path==='/profile')renderProfile();
 if(path==='/requests')refreshRequests();
}
function chatBadgesHtml(row){
 let badges={};try{badges=JSON.parse(row.badges_json||'{}')}catch{}
 const labels={broadcaster:'Стример',moderator:'Модератор',vip:'VIP',subscriber:'Подписчик',founder:'Основатель',premium:'Prime'};
 return Object.entries(labels).filter(([k])=>badges[k]).map(([k,label])=>'<span class="chat-badge chat-badge--'+k+'" title="'+esc(label)+'">'+esc(label)+'</span>').join('');
}
function rankHtml(list,kind='balance'){
 if(!list||!list.length)return '<p class="muted">Пока нет данных. Рейтинг обновляется по мере активности игроков.</p>';
 return list.map((r,i)=>'<div class="rank-item '+(kind==='chat'&&['ice','rose','amber','violet'].includes(r.frame)?'chat-frame-'+r.frame:'')+'"><span class="rank-position">'+(i+1)+'</span><div class="rank-name"><span class="player-line">'+avatarHtml(r.login)+'<b>@'+esc(r.login)+'</b></span>'+(kind==='balance'?'<small>Открытий: '+fmt(r.opens)+'</small>':'<small>'+chatBadgesHtml(r)+(r.title?'<span class="chat-title">'+esc(r.title)+'</span>':'')+'</small><small>Сообщений с начала учёта</small>')+'</div><div class="rank-score">'+fmt(kind==='balance'?r.balance:r.message_count)+' '+(kind==='balance'?'W':'сообщ.')+'</div></div>').join('');
}
function winsHtml(list){
 if(!list||!list.length)return '<p class="muted">Реальные выигрыши появятся здесь после следующих открытий. Прошлые игры бота ещё не записывались в историю.</p>';
 return list.map(r=>'<div class="win-item"><span class="win-cans">'+historySymbolsHtml(r.cans)+'</span><div><span class="player-line">'+avatarHtml(r.login)+'<b>@'+esc(r.login)+'</b></span><small>'+esc(r.source==='chat'?'Twitch':'Сайт')+' · '+ruTime(r.created_at)+'</small></div><strong class="win-gain">+'+fmt(r.gain)+' W</strong></div>').join('');
}
function historySymbolsHtml(symbols){
 return '<span class="history-cans">'+(symbols||[]).map(symbol=>{
  const sprite=slotSprites[symbol];
  return sprite?'<img src="/assets/slot-'+sprite[0]+'.webp?v=14" alt="'+esc(sprite[1])+'" title="'+esc(sprite[1])+'" width="20" height="40">':esc(symbol);
 }).join('')+'</span>';
}
function historyHtml(list){
 if(!list||!list.length)return '<p class="muted">Открытий пока нет. История сохраняется с запуска сайта.</p>';
 return list.map(r=>'<div class="history-item"><strong class="player-line">'+avatarHtml(r.login)+'@'+esc(r.login)+'</strong>'+historySymbolsHtml(r.cans)+'<em>+'+fmt(r.gain)+' W</em><time>'+ruTime(r.created_at)+'</time></div>').join('');
}
function renderPublic(){
 const p=state.public;if(!p)return;
 $('home-top').innerHTML=rankHtml((p.top||[]).slice(0,5));
 $('home-wins').innerHTML=winsHtml(p.recent);
 $('top-list').innerHTML=rankHtml(p.top);
 $('chat-list').innerHTML=rankHtml(p.chat,'chat');hydrateAvatars();
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
 renderNotificationBadges();
 if(logged)refreshAccountNotifications();else{notificationUser='';notificationLastSeenId=0;$('account-notifications').hidden=true;$('account-notification-list').replaceChildren();}
 if(currentRoute()==='/requests'&&!selectedSupportTicket)refreshRequests();
}

function renderProfile(){
 const me=state.me;if(!me)return;
 if(!me.authenticated){
  $('profile-content').innerHTML='<h3>Войди через Twitch</h3><p class="muted">После входа здесь появятся твой реальный баланс, статистика «Холодоса» и магазинные заявки.</p><a class="button button-primary" href="/auth/twitch">Войти через Twitch ↗</a>';
  return;
 }
 const p=me.player,orders=me.orders||[];
 const avatar=safeAvatar(p.avatar);
 $('profile-content').innerHTML='<div class="profile-bell-container"><a class="button button-ghost profile-requests-button" href="/requests" data-route="/requests">Запросы <span class="support-count"></span></a><button class="profile-notifications-button" type="button" data-account-notifications aria-label="Уведомления аккаунта">'+bellSvg+'<span class="account-unread-count">'+(me.notification_unread||'')+'</span></button></div><div class="profile-card">'+(avatar?'<img class="profile-avatar" src="'+esc(avatar)+'" alt="Аватар Twitch">':'<span class="coin-icon" style="width:75px;height:75px;font-size:27px">W</span>')+'<div><div class="profile-name">@'+esc(p.display_name||p.login)+'</div><span class="profile-muted">Аккаунт Twitch · W-монеты синхронизированы с чатом</span></div></div>'
  +'<div class="stats-grid"><div class="stat"><strong>'+fmt(p.balance)+'</strong><span>Баланс W</span></div><div class="stat"><strong>'+fmt(p.opens)+'</strong><span>Открытий</span></div><div class="stat"><strong>'+fmt(p.wins)+'</strong><span>Выигрышей</span></div><div class="stat"><strong>'+fmt(p.jackpots)+'</strong><span>Суперджекпотов</span></div></div>'
  +'<div class="stat"><strong>'+fmt(p.message_count)+'</strong><span>Сообщений в чате с начала учёта</span></div>'+ '<div class="profile-orders"><h3>Заявки магазина</h3>'+(orders.length?orders.map(o=>'<div class="history-item"><strong>№'+o.id+' · '+o.vp+' VP</strong><span>'+esc(o.status==='pending'?'Ожидает выдачи':o.status==='fulfilled'?'Выдано':'Отменено')+'</span><em>'+fmt(o.price)+' W</em><time>'+ruTime(o.created_at)+'</time></div>').join(''):'<p class="muted">Пока нет заявок. Оформить можно через команду !купить в чате.</p>')+'</div>'
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
 try{const v=await api('/api/spins');state.history=v.spins;$('casino-history').innerHTML=historyHtml(v.spins);hydrateAvatars();}
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

// Decorative idle frost never captures input and clears on any activity.
(()=>{
 const frost=$('idle-edge-frost');if(!frost)return;
 const motion=window.matchMedia('(prefers-reduced-motion: reduce)');let idleTimer;
 const active=()=>{
  clearTimeout(idleTimer);frost.classList.remove('visible');
  if(!motion.matches&&document.visibilityState==='visible')idleTimer=setTimeout(()=>frost.classList.add('visible'),15000);
 };
 for(const event of ['pointermove','pointerdown','wheel','touchstart','scroll'])window.addEventListener(event,active,{passive:true});
 window.addEventListener('keydown',active);document.addEventListener('visibilitychange',active);motion.addEventListener('change',active);active();
})();

let selectedSupportTicket=null;
async function supportPost(path,data){return api(path,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me?.csrf||''},body:JSON.stringify(data)});}
function renderNotificationBadges(){
 const unread=Number(state.me?.support_unread||0),ready=!!state.me?.authenticated&&Date.now()>=Number(state.me.player.last_opened||0)+120000;
 const accountUnread=Number(state.me?.notification_unread||0);
 const text=[unread?unread+' ответов поддержки':'',accountUnread?accountUnread+' уведомлений аккаунта':''].filter(Boolean).join('. ');
 for(const el of document.querySelectorAll('#avatar-link,.side-link[href="/profile"]')){el.classList.toggle('has-notice',!!text);el.dataset.notice=text?'•':'';if(text)el.title=text;else el.removeAttribute('title');}
 for(const el of document.querySelectorAll('.side-link[href="/casino"]')){el.classList.toggle('has-notice',ready);el.dataset.notice=ready?'•':'';el.title=ready?'Холодос готов':'Казино';}
 for(const el of document.querySelectorAll('.support-count'))el.textContent=unread?'('+unread+')':'';
}
async function refreshRequests(){
 if(!state.me?.authenticated){$('support-list').innerHTML='<p>Войди через Twitch, чтобы посмотреть свои обращения.</p><a class="text-link" href="/auth/twitch">Войти ↗</a>';return;}
 try{const data=await api('/api/support');$('support-list').innerHTML=data.tickets.length?data.tickets.map(t=>'<button type="button" class="support-ticket" data-ticket="'+t.id+'"><strong>№'+t.id+(t.unread?' · Новый ответ':'')+'</strong><span>'+esc(t.subject)+'</span><small>'+ruTime(t.updated_at)+'</small></button>').join(''):'<p class="muted">Пока нет обращений.</p><a class="text-link" href="/help" data-route="/help">Задать вопрос ↗</a>';
 hydrateAvatars();
 for(const btn of $('support-list').querySelectorAll('[data-ticket]'))btn.addEventListener('click',()=>openSupportThread(Number(btn.dataset.ticket)));
 }catch(e){$('support-list').textContent=e.message;}
}
async function openSupportThread(id){
 try{const data=await api('/api/support/'+id);selectedSupportTicket=id;$('support-thread').innerHTML='<h2>Обращение №'+id+'</h2>'+data.messages.map(m=>'<article class="support-message support-message--'+esc(m.role)+'"><div><b class="player-line">'+(m.role!=='system'?avatarHtml(m.author):'')+esc(m.role==='system'?'Автоматическое сообщение':m.role==='admin'?'Администратор · '+m.author:m.author)+'</b><time>'+ruTime(m.created_at)+'</time></div><p>'+esc(m.body)+'</p></article>').join('');$('support-reply-form').hidden=false;hydrateAvatars();
 const maxId=data.messages.at(-1)?.id||0;await supportPost('/api/support/read',{id,maxId});await refreshMe();
 }catch(e){notice(e.message);}
}
$('support-form').addEventListener('submit',async e=>{e.preventDefault();if(!state.me?.authenticated){notice('Сначала войди через Twitch');return;}const button=e.submitter;button.disabled=true;try{const r=await supportPost('/api/support',{body:$('support-body').value});$('support-body').value='';navigate('/requests');await refreshRequests();await openSupportThread(r.id);}catch(err){notice(err.message)}finally{button.disabled=false}});
$('support-reply-form').addEventListener('submit',async e=>{e.preventDefault();if(!selectedSupportTicket)return;const button=e.submitter;button.disabled=true;try{await supportPost('/api/support/reply',{id:selectedSupportTicket,body:$('support-reply').value});$('support-reply').value='';await openSupportThread(selectedSupportTicket);await refreshRequests();}catch(err){notice(err.message)}finally{button.disabled=false}});
let cooldownAlerts=false,lastAlerted=0;
try{cooldownAlerts=localStorage.getItem('war1ouss-cooldown-alerts')==='on';lastAlerted=Number(localStorage.getItem('war1ouss-last-cooldown-alert')||0)}catch{}
const bellSvg='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5l-2 3zM10 20h4"/></svg>';
function updateBellButtons(){for(const b of document.querySelectorAll('.notify-toggle')){b.innerHTML=bellSvg;b.setAttribute('aria-pressed',String(cooldownAlerts));b.title=cooldownAlerts?'Уведомления о Холодосе включены':'Уведомить, когда Холодос готов';}}
for(const b of document.querySelectorAll('.notify-toggle'))b.addEventListener('click',async()=>{cooldownAlerts=!cooldownAlerts;try{localStorage.setItem('war1ouss-cooldown-alerts',cooldownAlerts?'on':'off')}catch{}updateBellButtons();notice(cooldownAlerts?'Уведомления включены. Они работают, пока сайт открыт.':'Уведомления выключены.');if(cooldownAlerts&&'Notification'in window&&Notification.permission==='default')try{await Notification.requestPermission()}catch{}});
updateBellButtons();
setInterval(()=>{
 renderNotificationBadges();const opened=Number(state.me?.player?.last_opened||0);
 if(!cooldownAlerts||!state.me?.authenticated||!opened||opened<=lastAlerted||Date.now()<opened+120000)return;
 lastAlerted=opened;try{localStorage.setItem('war1ouss-last-cooldown-alert',String(opened))}catch{}notice('Холодос снова готов к открытию!');
 if('Notification'in window&&Notification.permission==='granted')try{new Notification('Холодос готов',{body:'Можно снова открыть Холодос на War1ouss.',tag:'war1ouss-cooldown'})}catch{}
},1000);
setInterval(()=>{if(document.visibilityState==='visible'&&currentRoute()==='/requests'&&state.me?.authenticated){refreshRequests();if(selectedSupportTicket)openSupportThread(selectedSupportTicket);}},15000);

for(const button of document.querySelectorAll('.page-back-button'))button.addEventListener('click',()=>{if(Number(history.state?.warDepth||0)>0)history.back();else navigate(currentRoute()==='/requests'?'/help':'/');});

let noticeSoundEnabled=true,lastNoticeTone=0;
try{noticeSoundEnabled=localStorage.getItem('war1ouss-notification-sound')!=='off'}catch{}
const noticeAudio=new Audio('/assets/notification.mp3?v=47');noticeAudio.preload='auto';noticeAudio.volume=.6;
function unlockNoticeAudio(){/* Playback is requested by the notification after user interaction. */}
function playNoticeTone(){
 if(!noticeSoundEnabled||Date.now()-lastNoticeTone<1000)return;
 lastNoticeTone=Date.now();noticeAudio.currentTime=0;noticeAudio.volume=.6;noticeAudio.play().catch(()=>{});
}
let notificationLastSeenId=0,notificationUser='',notificationLoading=false;
async function refreshAccountNotifications(){
 if(notificationLoading||!state.me?.authenticated)return;notificationLoading=true;
 try{const user=String(state.me.player.id);if(notificationUser!==user){notificationUser=user;notificationLastSeenId=0;try{notificationLastSeenId=Number(localStorage.getItem('war1ouss-notification-last-'+user)||0)}catch{}}
 const {notifications}=await api('/api/notifications');if(!state.me?.authenticated||String(state.me.player.id)!==user)return;const latest=notifications[0]?.id||0;const newest=notifications.find(n=>n.unread&&n.id>notificationLastSeenId);
 if(newest&&notificationLastSeenId>0)notice(newest.title+': '+newest.body);
 notificationLastSeenId=Math.max(notificationLastSeenId,latest);try{localStorage.setItem('war1ouss-notification-last-'+user,String(notificationLastSeenId))}catch{}
 $('account-notification-list').innerHTML=notifications.length?notifications.map(n=>'<a class="account-notification '+(n.unread?'unread':'')+'" href="'+esc(/^\/(?:requests|profile|help|cases)\b/.test(n.url)?n.url:'/profile')+'" data-route="'+esc(n.url)+'"><strong>'+esc(n.title)+'</strong><p>'+esc(n.body)+'</p><time>'+ruTime(n.created_at)+'</time></a>').join(''):'<p class="muted">Пока нет уведомлений.</p>';
 if(!$('account-notifications').hidden&&latest){await supportPost('/api/notifications/read',{maxId:latest});state.me.notification_unread=0;for(const badge of document.querySelectorAll('.account-unread-count'))badge.textContent='';renderNotificationBadges();}
 }catch{}finally{notificationLoading=false}
}
document.addEventListener('click',async e=>{if(e.target.closest('[data-account-notifications]')){const panel=$('account-notifications');panel.hidden=!panel.hidden;if(!panel.hidden){await refreshAccountNotifications();$('notifications-close').focus();}}else if(e.target.closest('#notifications-close'))$('account-notifications').hidden=true;else if(e.target.closest('.account-notification'))$('account-notifications').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('account-notifications').hidden=true;});
$('notification-sound-toggle').textContent=noticeSoundEnabled?'Выключить звук':'Включить звук';
$('notification-sound-toggle').addEventListener('click',()=>{noticeSoundEnabled=!noticeSoundEnabled;try{localStorage.setItem('war1ouss-notification-sound',noticeSoundEnabled?'on':'off')}catch{}$('notification-sound-toggle').textContent=noticeSoundEnabled?'Выключить звук':'Включить звук';if(noticeSoundEnabled){unlockNoticeAudio();playNoticeTone();}});
function avatarHtml(login){const name=String(login||'').toLowerCase();if(!/^[a-z0-9_]{1,25}$/.test(name))return '';return '<span class="player-avatar" data-player-avatar="'+esc(name)+'" aria-hidden="true">'+esc(name[0].toUpperCase())+'</span>';}
let avatarHydrationBusy=false,avatarHydrationAgain=false;const avatarClientCache=new Map();
async function hydrateAvatars(){
 if(avatarHydrationBusy){avatarHydrationAgain=true;return;}avatarHydrationBusy=true;
 try{const nodes=[...document.querySelectorAll('[data-player-avatar]')],names=[...new Set(nodes.map(n=>n.dataset.playerAvatar))];const missing=names.filter(n=>!avatarClientCache.has(n)).slice(0,50);
 if(missing.length){const r=await api('/api/avatars?logins='+encodeURIComponent(missing.join(',')));for(const n of missing)avatarClientCache.set(n,safeAvatar(r.avatars?.[n])||'');}
 for(const node of nodes){const src=avatarClientCache.get(node.dataset.playerAvatar);if(src&&!node.querySelector('img')){const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';img.decoding='async';img.addEventListener('error',()=>node.replaceChildren(document.createTextNode(node.dataset.playerAvatar[0].toUpperCase())),{once:true});node.replaceChildren(img);}}
 }catch{}finally{avatarHydrationBusy=false;if(avatarHydrationAgain){avatarHydrationAgain=false;queueMicrotask(hydrateAvatars);}}
}
