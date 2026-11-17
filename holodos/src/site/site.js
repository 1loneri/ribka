'use strict';
const $=id=>document.getElementById(id);
const routes=new Set(['/','/casino','/cases','/duels','/top','/chat','/profile','/shop','/help','/requests','/widget']);
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
function navigate(path,replace=false){renderRoute(routes.has(path)?path:'/',replace);}
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
 if(path==='/top')refreshTop();
 if(path==='/chat')refreshChatTop();
 window.scrollTo({top:0,behavior:'instant'});
 if(path==='/duels')refreshDuels();
 if(path==='/casino')refreshSpins();
 if(path==='/profile')renderProfile();
 if(path==='/requests')refreshRequests();
 if(path==='/shop'){refreshReviews();refreshVipShop();refreshVpShop();}
}
function chatBadgesHtml(row){
 let badges={};try{badges=JSON.parse(row.badges_json||'{}')}catch{}
 const labels={broadcaster:'Стример',moderator:'Модератор',vip:'VIP',subscriber:'Подписчик',premium:'Prime'};
 return Object.entries(labels).filter(([k])=>badges[k]).map(([k,label])=>'<span class="chat-badge chat-badge--'+k+'" title="'+esc(label)+'">'+esc(label)+'</span>').join('');
}
function rankHtml(list,kind='balance',offset=0){
 if(!list||!list.length)return '<p class="muted">Пока нет данных. Рейтинг обновляется по мере активности игроков.</p>';
 return list.map((r,i)=>'<div class="rank-item '+(kind==='chat'&&['ice','rose','amber','violet'].includes(r.frame)?'chat-frame-'+r.frame:'')+'"><span class="rank-position">'+(offset+i+1)+'</span><div class="rank-name"><span class="player-line">'+avatarHtml(r.login)+'<b>@'+esc(r.login)+'</b>'+(kind==='chat'?'<span class="player-extras">'+chatBadgesHtml(r)+(r.title?'<span class="player-cosmetic-title">'+esc(r.title)+'</span>':'')+'</span>':'')+'</span>'+(kind==='balance'?'<small>Открытий: '+fmt(r.opens)+'</small>':'')+'</div><div class="rank-score">'+fmt(kind==='balance'?r.balance:r.message_count)+' '+(kind==='balance'?'W':'сообщ.')+'</div></div>').join('');
}
function patchRanking(list,rows,kind,offset){const old=[...list.querySelectorAll('.rank-item')],keys=rows.map(r=>r.login.toLowerCase()),current=old.map(n=>n.querySelector('[data-player-avatar]')?.dataset.playerAvatar);if(JSON.stringify(keys)===JSON.stringify(current)&&old.length){rows.forEach((r,i)=>{old[i].querySelector('.rank-score').textContent=fmt(kind==='balance'?r.balance:r.message_count)+' '+(kind==='balance'?'W':'сообщ.');old[i].querySelector('.rank-position').textContent=offset+i+1;if(kind==='balance'&&old[i].querySelector('small'))old[i].querySelector('small').textContent='Открытий: '+fmt(r.opens);});return;}list.innerHTML=rankHtml(rows,kind,offset);}
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
 return list.map(r=>'<div class="history-item"><strong class="player-line">'+avatarHtml(r.login)+'<b>@'+esc(r.login)+'</b></strong>'+historySymbolsHtml(r.cans)+'<em>+'+fmt(r.gain)+' W</em><time>'+ruTime(r.created_at)+'</time></div>').join('');
}
function caseRewardClass(r){return ({vp:'reward-glow reward-glow--vp',vip:'reward-glow reward-glow--vip',physical:'reward-glow reward-glow--popmart',frame:'cosmetic-frame',title:'cosmetic-title',name:'cosmetic-name',theme:'cosmetic-theme',can:'cosmetic-can',case:'reward-glow reward-glow--case'})[r.symbol]||'';}
function applyCaseCatalog(catalog){for(const c of catalog){const card=document.querySelector('.collection-case--'+c.id);if(!card||card.dataset.configRevision===JSON.stringify([c.revision,c.enabled,c.rewards]))continue;card.dataset.configRevision=JSON.stringify([c.revision,c.enabled,c.rewards]);card.querySelector('h2').textContent=c.title;card.querySelector('.case-category').textContent=c.category;card.querySelector('.case-description').textContent=c.description;card.querySelector('.case-cost').textContent=c.priceText;
 const chips=new Map();for(const r of c.rewards){const cosmetic=['frame','title','name','theme','can','profile','highlight','effect'].includes(r.symbol);const label=r.symbol==='title'||r.id?.startsWith('title-')?'Титул':cosmetic?r.kind:r.label;chips.set(label,{label,css:caseRewardClass(r)});}
 card.querySelector('.case-hover-rewards').innerHTML='<span class="case-hover-label">МОЖЕТ ВЫПАСТЬ</span><div>'+[...chips.values()].map(r=>'<span class="'+r.css+'">'+esc(r.label)+'</span>').join('')+'</div>';
 card.querySelector('.case-reward-list').innerHTML=c.rewards.map(r=>'<div><span class="'+caseRewardClass(r)+'">'+esc(r.label)+'</span><strong>'+Number(r.weight).toLocaleString('ru-RU',{maximumFractionDigits:6})+'%</strong></div>').join('');
 casePreviewNames[c.id]=c.title;casePreviewPools[c.id]=c.rewards.map(r=>({...r}));}
}
async function refreshCases(){try{const r=await api('/api/cases');if(Array.isArray(r.cases))applyCaseCatalog(r.cases);}catch(error){console.warn('Не удалось обновить каталог кейсов:',error.message);}}

function pendingCaseKey(type='chat'){return 'war1ouss-'+type+'-case-request:'+state.me?.player?.id;}
function pendingCaseRequest(type='chat'){try{return sessionStorage.getItem(pendingCaseKey(type))||'';}catch{return '';}}
function renderChatCase(){
 const button=document.querySelector('[data-case-open="chat"]');if(!button)return;
 const me=state.me,p=me?.chatCase,logged=me?.authenticated;
 const recover=logged&&!!pendingCaseRequest('chat');button.disabled=!logged||!p?.enabled||(!recover&&(!p.available||!me.spin_allowed));
 button.textContent=!logged?'Войди через Twitch':recover?'Проверить открытие':p?.available?'Открыть · '+fmt(p.available)+' доступно':'Копи сообщения';
 button.title=!logged?'Войди, чтобы увидеть свой прогресс':!p?.enabled?'Для этого кейса нужна стоимость в сообщениях':!me.spin_allowed?'Открытия доступны во время стрима':'Каждое открытие расходует '+fmt(p.threshold)+' учтённых сообщений';
 let info=$('chat-case-progress');if(!info){info=document.createElement('p');info.id='chat-case-progress';info.className='muted chat-case-progress';button.before(info);}
 info.textContent=!logged?'Прогресс сохраняется за твоим Twitch-аккаунтом.':!p?.enabled?'Кейс временно недоступен.':fmt(p.progress)+' / '+fmt(p.threshold)+' до следующего кейса · Доступно: '+fmt(p.available);

}


function renderCoinCase(){
 const b=document.querySelector('[data-case-open="coins"]');if(!b)return;const me=state.me,p=me?.coinCase,logged=me?.authenticated,recover=logged&&!!pendingCaseRequest('coins');
 b.disabled=!logged||!p?.enabled||(!recover&&(!p.available||!me.spin_allowed));
 b.textContent=!logged?'Войди через Twitch':recover?'Проверить открытие':!p?.enabled?'Временно недоступен':!p.available?'Недостаточно W':'Открыть · '+fmt(p.cost)+' W';
 b.title=!logged?'Войди через Twitch':!me.spin_allowed?'Открытия доступны во время стрима':!p?.available?'На балансе '+fmt(me.player.balance)+' W':'При открытии спишется '+fmt(p.cost)+' W';
 let info=$('coin-case-progress');if(!info){info=document.createElement('p');info.id='coin-case-progress';info.className='muted chat-case-progress';b.before(info);}
 const balance=me?.player?.balance||0,missing=Math.max(0,(p?.cost||0)-balance);
 info.textContent=!logged?'Войди через Twitch, чтобы увидеть баланс.':!p?.enabled?'Кейс временно недоступен.':fmt(balance)+' / '+fmt(p.cost)+' W · '+(missing?'Не хватает '+fmt(missing)+' W':'Доступно: '+fmt(p.available));
}


function renderDonationCase(){
 const b=$('donation-case-spin');if(!b)return;const me=state.me,p=me?.donationCase,recover=me?.authenticated&&!!pendingCaseRequest('donation');
 b.hidden=!me?.authenticated||(!p?.available&&!recover);b.disabled=!me?.authenticated||(!recover&&(!p?.available||!me.spin_allowed));
 b.textContent=recover?'Проверить открытие':'Крутить · '+fmt(p?.available);
 b.title=!me?.spin_allowed?'Открытия доступны во время стрима':'Доступно подтверждённых кейсов: '+fmt(p?.available);
}

let vpShopPackages=[],vpShopBusy=false;
function renderVpShop(){for(const button of document.querySelectorAll('[data-vp-buy]')){const vp=Number(button.dataset.vpBuy),p=vpShopPackages.find(p=>p.vp===vp),me=state.me,missing=Math.max(0,(p?.price||0)-(me?.player?.balance||0));button.disabled=vpShopBusy||me===null||!p||!p.available||!!(me?.authenticated&&missing);button.textContent=vpShopBusy?'Оформляем…':!p?'Загрузка…':!p.available?'Нет в наличии':!me?.authenticated?'Войти через Twitch':missing?'Недостаточно W':'Купить · '+fmt(p.price)+' W';const hint=document.querySelector('[data-vp-status="'+vp+'"]');hint.textContent=!p?'':!p.available?'Коды закончились.':me?.authenticated&&missing?'Не хватает '+fmt(missing)+' W':'Код придёт в личное уведомление.';}}
async function refreshVpShop(){try{const r=await api('/api/shop/vp');vpShopPackages=r.packages;renderVpShop();}catch{}}
for(const button of document.querySelectorAll('[data-vp-buy]'))button.addEventListener('click',async()=>{if(!state.me?.authenticated){location.href='/auth/twitch';return;}if(vpShopBusy)return;const vp=Number(button.dataset.vpBuy),p=vpShopPackages.find(p=>p.vp===vp);if(!p)return;const key='vp-purchase-'+state.me.player.id+'-'+vp;let requestId;try{requestId=localStorage.getItem(key);if(!requestId){requestId=crypto.randomUUID();localStorage.setItem(key,requestId);}}catch{requestId=crypto.randomUUID();}vpShopBusy=true;renderVpShop();try{await api('/api/shop/vp',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({requestId,vp,expectedPrice:p.price})});try{localStorage.removeItem(key)}catch{}await refreshMe();$('account-notifications').hidden=false;await refreshAccountNotifications();}catch(error){notice(error.message);}finally{vpShopBusy=false;await Promise.all([refreshMe(),refreshVpShop()]);}});
function vpCodesHtml(list){return list.length?'<h3>Мои коды VP</h3>'+list.map(o=>'<div class="vp-code-receipt"><strong>'+o.vp+' VP · Заказ №'+o.order_id+'</strong><p>Вот твой код — <code>'+esc(o.code)+'</code></p><span class="muted">'+ruTime(o.created_at)+' · '+fmt(o.price)+' W</span></div>').join(''):'';}

let vipShopQuote={price:25000},vipShopBuying=false;
function renderVipShop(){
 renderVpShop();
 const button=$('vip-shop-buy');if(!button)return;const me=state.me,quote=me?.authenticated?me.vipShop:vipShopQuote;if(!quote)return;
 $('vip-shop-price').textContent=fmt(quote.price)+' W';const missing=Math.max(0,quote.price-(me?.player?.balance||0));
 button.disabled=vipShopBuying||state.me===null||!!(me?.authenticated&&(quote.active||quote.pending||missing));
 button.textContent=vipShopBuying?'Оформляем…':!me?.authenticated?'Войти через Twitch':quote.active?'VIP уже активен':quote.pending?'VIP ожидает выдачи':missing?'Недостаточно W':'Купить VIP · '+fmt(quote.price)+' W';
 $('vip-shop-status').textContent=!me?.authenticated?'Войди, чтобы купить VIP за W.':quote.active?'У тебя уже есть VIP на канале.':quote.pending?'Заявка сохранена. Администратор выдаст VIP вручную.':missing?'Баланс: '+fmt(me.player.balance)+' W · Не хватает '+fmt(missing)+' W':'Спишется '+fmt(quote.price)+' W. Выдача VIP — вручную.';
}
async function refreshVipShop(){try{vipShopQuote=await api('/api/shop/vip');renderVipShop();}catch{}}
$('vip-shop-buy').addEventListener('click',async()=>{
 if(!state.me?.authenticated){location.href='/auth/twitch';return;}if(vipShopBuying)return;vipShopBuying=true;renderVipShop();
 try{const r=await api('/api/shop/vip',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({requestId:crypto.randomUUID(),expectedPrice:state.me.vipShop.price})});notice('Заявка на VIP №'+r.orderId+' создана. Ожидает выдачи.');}
 catch(error){notice(error.message);}finally{vipShopBuying=false;await refreshMe();renderVipShop();}
});
function vipOrdersHtml(list){return list.map(o=>'<div class="history-item"><strong>VIP · №'+o.id+'</strong><span>'+esc(o.status==='pending'?'Ожидает выдачи':o.status==='fulfilled'?'VIP выдан':'Отменено · W возвращены')+'</span><em>'+fmt(o.price)+' W</em><time>'+ruTime(o.created_at)+'</time></div>').join('');}

function manualVpHtml(list){return list.map(o=>'<div class="history-item"><strong>'+o.vp+' VP · Выдача №'+o.id+'</strong><span>'+esc(o.status==='pending'?'Ожидает выдачи':o.status==='fulfilled'?'Выдано':'Выдача отменена')+'</span><time>'+ruTime(o.created_at)+'</time></div>').join('');}

function renderPublic(){
 const p=state.public;if(!p)return;
 patchRanking($('home-top'),(p.top||[]).slice(0,5),'balance',0);
 const winsKey=JSON.stringify(p.recent);if($('home-wins').dataset.content!==winsKey){$('home-wins').dataset.content=winsKey;$('home-wins').innerHTML=winsHtml(p.recent);}
 hydrateAvatars();
}
function canUseAdminDemo(){return state.me?.authenticated===true&&state.me?.is_admin===true;}
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
 for(const demo of document.querySelectorAll('.case-demo-entry'))demo.hidden=true;
 for(const demo of document.querySelectorAll('#duel-preview'))demo.hidden=true;
 for(const button of document.querySelectorAll('[data-case-preview]')){button.hidden=true;button.disabled=true;}
 if(!canUseAdminDemo()&&!caseRealMode&&document.querySelector('.case-demo')?.open)document.querySelector('.case-demo').close();
 if(logged){
  $('top-name').textContent=me.player.display_name||me.player.login;
  const avatar=safeAvatar(me.player.avatar);
  if(avatar)$('top-avatar').src=avatar;else $('top-avatar').src='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="80"%3E%3Crect width="100%25" height="100%25" fill="%23244056"/%3E%3Ctext x="50%25" y="58%25" font-size="35" text-anchor="middle" fill="white"%3EW%3C/text%3E%3C/svg%3E';
 }
 for(const center of document.querySelectorAll('.frame-preview-center')){const url=logged?safeAvatar(me.player.avatar):'';if(url){const img=document.createElement('img');img.src=url;img.alt='';center.replaceChildren(img);}else center.textContent='W';}
 renderChatCase();
 renderCoinCase();
 renderDonationCase();
 renderVipShop();
 updateCooldown();
 renderProfile();

 document.body.dataset.siteTheme=logged?(me.cosmetics?.active?.theme||''):'';
 for(const node of [$('top-name'),document.querySelector('.profile-name')])if(node)node.dataset.nameStyle=logged?(me.cosmetics?.active?.name_color||''):'';
 applyAvatarFrame($('top-avatar-frame'),logged?me.frames?.active:'');
 hydrateAvatars();
 renderNotificationBadges();
 if(currentRoute()==='/shop')refreshReviews();
 if(logged)refreshAccountNotifications();else{notificationUser='';notificationLastSeenId=0;$('account-notifications').hidden=true;$('account-notification-list').replaceChildren();}
 if(currentRoute()==='/requests'&&!selectedSupportTicket)refreshRequests();
 if(historyScope==='mine'&&currentRoute()==='/casino')refreshSpins();
}

function renderProfile(){
 const me=state.me;if(!me)return;
 if(!me.authenticated){
  $('profile-content').innerHTML='<h3>Войди через Twitch</h3><p class="muted">После входа здесь появятся твой реальный баланс, статистика «Холодоса» и магазинные заявки.</p><a class="button button-primary" href="/auth/twitch">Войти через Twitch ↗</a>';
  return;
 }
 const p=me.player,orders=me.orders||[],vipOrders=me.vipOrders||[],manualVp=me.manualVp||[];
 const avatar=safeAvatar(p.avatar),activeTitle=me.cosmetics?.catalog?.title?.[me.cosmetics?.active?.title]||'';
 $('profile-content').innerHTML='<div class="profile-bell-container"><a class="button button-ghost profile-requests-button" href="/requests" data-route="/requests">Запросы <span class="support-count"></span></a><button class="profile-notifications-button" type="button" data-account-notifications aria-label="Уведомления аккаунта">'+bellSvg+'<span class="account-unread-count">'+(me.notification_unread||'')+'</span></button></div><div class="profile-card">'+'<span class="profile-equipped-avatar">'+avatarHtml(p.login)+'</span>'+'<div><div class="profile-name-line"><div class="profile-name">@'+esc(p.display_name||p.login)+'</div>'+(activeTitle?'<span class="profile-equipped-title">'+esc(activeTitle)+'</span>':'')+'</div><span class="profile-muted">Аккаунт Twitch · W-монеты синхронизированы с чатом</span></div></div>'
  +'<div class="stats-grid"><div class="stat"><strong>'+fmt(p.balance)+'</strong><span>Баланс W</span></div><div class="stat"><strong>'+fmt(p.opens)+'</strong><span>Открытий</span></div><div class="stat"><strong>'+fmt(p.wins)+'</strong><span>Выигрышей</span></div><div class="stat"><strong>'+fmt(p.jackpots)+'</strong><span>Суперджекпотов</span></div></div>'
  +'<div class="stat"><strong>'+fmt(p.message_count)+'</strong><span>Сообщений в чате с начала учёта</span></div>'+ '<div class="profile-orders"><h3>Заявки и выдачи</h3>'+((orders.length||vipOrders.length||manualVp.length)?orders.map(o=>'<div class="history-item"><strong>№'+o.id+' · '+o.vp+' VP</strong><span>'+esc(o.status==='pending'?'Ожидает выдачи':o.status==='fulfilled'?'Выдано':'Отменено')+'</span><em>'+fmt(o.price)+' W</em><time>'+ruTime(o.created_at)+'</time></div>').join('')+vipOrdersHtml(vipOrders)+manualVpHtml(manualVp)+vpCodesHtml(me.vpCodes||[]):'<p class="muted">Пока нет заявок. Оформить можно через команду !купить в чате.</p>')+'</div>'
  +'<section class="chat-case-history" id="chat-case-history" aria-labelledby="case-history-heading"><h3 id="case-history-heading">Мои открытия</h3><div>'+((me.caseHistory||[]).map(o=>'<p><strong>'+esc(o.reward.label)+(o.reward.guaranteedW?' + '+fmt(o.reward.guaranteedW)+' W':'')+'</strong><small>'+esc(o.caseId==='coins'?'W-кейс':o.caseId==='donation'?'Донатный кейс':'За сообщения')+'</small><span>'+esc(o.claim_status==='fulfilled'?'Выдано':o.claim_status==='cancelled'?'Выдача отменена':o.claim_status==='pending'?'Ожидает выдачи':'Начислено')+'</span><time>'+ruTime(o.created_at)+'</time></p>').join('')||'<p class="muted">Открытий пока нет.</p>')+'</div></section>'
  +frameInventoryHtml(me.frames,me.cosmetics)+'<button type="button" class="logout-btn" id="logout-btn">Выйти из профиля</button>';
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
 if(!me.spin_allowed){message.dataset.streamLocked='true';button.disabled=true;button.textContent=me.stream?.known?'Открытия во время стрима':'Проверяем эфир';message.textContent=me.stream?.known?'Холодос доступен во время стрима. Вне эфира — только администраторам.':'Статус эфира временно недоступен.';return;}
 if(message.dataset.streamLocked){message.textContent='Холодос готов к открытию.';delete message.dataset.streamLocked;}
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
 if(!state.me.spin_allowed){notice('Открытия доступны во время стрима. Вне эфира — только администраторам.');return;}
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
 const stopSlotSound=startSlotIceSound();
 const started=Date.now();
 try{
  const result=await api('/api/holodos',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({requestId:crypto.randomUUID()})});
  const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  await new Promise(resolve=>setTimeout(resolve,Math.max(0,(reduceMotion?0:1150)-(Date.now()-started))));
  stopSlotSound();
  // Settle one reel at a time; the result was already chosen and saved by the server.
  for(let i=0;i<reels.length;i++){
   playIceStop(i);reels[i].classList.remove('spinning');setReelSymbol(reels[i],result.cans[i]);
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
  stopSlotSound();clearInterval(cycling);reels.forEach(el=>el.classList.remove('spinning'));
  $('spin-result').textContent=e.message;
  if(e.status===429)state.me.player.last_opened=Date.now()+(e.remaining||1)*1000-120000;
 }finally{state.busy=false;updateCooldown();}
}

const rankingPages={top:{page:1,pages:1,request:0,kind:'balance',endpoint:'/api/leaderboard'},chat:{page:1,pages:1,request:0,kind:'chat',endpoint:'/api/chat-leaderboard'}};
function refreshTop(page=rankingPages.top.page,fromNavigation=false){return refreshRanking('top',page,fromNavigation);}
function refreshChatTop(page=rankingPages.chat.page,fromNavigation=false){return refreshRanking('chat',page,fromNavigation);}
async function refreshRanking(type,page,fromNavigation=false){
 const ranking=rankingPages[type],request=++ranking.request;ranking.page=page;
 const list=$(type+'-list'),prev=$(type+'-prev'),next=$(type+'-next'),pages=$(type+'-pages'),info=$(type+'-page-info');list.setAttribute('aria-busy','true');prev.disabled=true;next.disabled=true;
 for(const b of pages.querySelectorAll('button'))b.disabled=true;
 try{
  const data=await api(ranking.endpoint+'?page='+page);if(request!==ranking.request)return;
  ranking.page=data.page;ranking.pages=data.pages;list.dataset.page=String(data.page);patchRanking(list,data.players,ranking.kind,data.offset);
  const visible=[...new Set([1,data.pages,...Array.from({length:5},(_,i)=>data.page+i-2).filter(p=>p>=1&&p<=data.pages)])].sort((a,b)=>a-b);
  pages.innerHTML=visible.map((p,i)=>(i&&p-visible[i-1]>1?'<span aria-hidden="true">…</span>':'')+'<button type="button" class="button button-ghost" data-rank-page="'+p+'" aria-label="Страница '+p+'" '+(p===data.page?'aria-current="page"':'')+'>'+p+'</button>').join('');
  info.textContent=data.total?'Места '+fmt(data.offset+1)+'–'+fmt(data.offset+data.players.length)+' из '+fmt(data.total)+' · Страница '+fmt(data.page)+' из '+fmt(data.pages):'Игроков пока нет';
  hydrateAvatars();if(fromNavigation)list.focus({preventScroll:true});
 }catch(error){if(request!==ranking.request)return;list.innerHTML='<p class="muted">'+esc(error.message)+'</p>';if(!pages.children.length)pages.innerHTML='<button type="button" class="button button-ghost" data-rank-page="'+ranking.page+'">Повторить</button>';info.textContent='Не удалось загрузить рейтинг. Нажми на номер страницы, чтобы повторить.';for(const b of pages.querySelectorAll('button'))b.disabled=false;}
 finally{if(request===ranking.request){list.removeAttribute('aria-busy');prev.disabled=ranking.page<=1;next.disabled=ranking.page>=ranking.pages;}}
}
for(const type of ['top','chat']){
 $(type+'-prev').addEventListener('click',()=>refreshRanking(type,Math.max(1,rankingPages[type].page-1),true));
 $(type+'-next').addEventListener('click',()=>refreshRanking(type,Math.min(rankingPages[type].pages,rankingPages[type].page+1),true));
 $(type+'-pages').addEventListener('click',event=>{const b=event.target.closest('[data-rank-page]');if(b&&!b.disabled)refreshRanking(type,Number(b.dataset.rankPage),true);});
}

async function refreshPublic(){
 try{state.public=await api('/api/public');renderPublic();}
 catch(e){const text='<p class="muted">'+esc(e.message)+'</p>';['home-top','home-wins'].forEach(id=>$(id).innerHTML=text);}
}
async function refreshMe(){
 try{state.me=await api('/api/me');renderMe();}
 catch(e){state.me={authenticated:false};renderMe();notice(e.message);}
}
let historyScope='recent';
function setHistoryScope(scope){historyScope=['recent','mine','jackpots','superjackpots'].includes(scope)?scope:'recent';for(const tab of document.querySelectorAll('[data-history-scope]')){const selected=tab.dataset.historyScope===historyScope;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;} $('casino-history').setAttribute('aria-labelledby','history-tab-'+historyScope);$('casino-history').scrollTop=0;$('casino-history').textContent='Загружаем историю…';refreshSpins();}
async function refreshSpins(){
 const scope=historyScope,userId=state.me?.player?.id;
 if(scope==='mine'&&!state.me?.authenticated){$('casino-history').innerHTML='<p class="muted">Войди через Twitch, чтобы увидеть свои 50 последних открытий.</p><a class="text-link" href="/auth/twitch">Войти через Twitch ↗</a>';return;}
 try{const v=await api('/api/spins'+(scope!=='recent'?'?scope='+scope:''));if(scope!==historyScope||(scope==='mine'&&(!state.me?.authenticated||state.me.player.id!==userId)))return;state.history=v.spins;$('casino-history').innerHTML=historyHtml(v.spins);hydrateAvatars();}
 catch(e){if(scope===historyScope)$('casino-history').textContent=e.message;}
}
document.addEventListener('click',e=>{const tab=e.target.closest('[data-history-scope]');if(tab)setHistoryScope(tab.dataset.historyScope);});
document.addEventListener('keydown',e=>{const tab=e.target.closest('[data-history-scope]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const scopes=['recent','mine','jackpots','superjackpots'],scope=e.key==='Home'?scopes[0]:e.key==='End'?scopes.at(-1):scopes[(scopes.indexOf(historyScope)+(e.key==='ArrowRight'?1:-1)+scopes.length)%scopes.length];setHistoryScope(scope);$('history-tab-'+scope).focus();});
let duelRefreshBusy=false;
async function refreshDuels(){
 if(duelRefreshBusy)return;duelRefreshBusy=true;
 try{
  const data=await api('/api/duels');state.duels=data;
  const pending=data.pending||[],recent=data.recent||[],logged=state.me?.authenticated;
  const pendingKey=JSON.stringify(pending);if($('pending-duels').dataset.content!==pendingKey){$('pending-duels').dataset.content=pendingKey;$('pending-duels').innerHTML=pending.length?pending.map(d=>{
   const mine=logged&&d.opponent_login===state.me.player.login.toLowerCase();
   return '<div class="duel-item"><div class="duel-mini-cans">'+duelCanImage(d.leftCan)+duelCanImage(d.rightCan)+'</div><div><strong>@'+esc(d.initiator_login)+' → @'+esc(d.opponent_login)+'</strong><p>Банк '+fmt(d.wager*2)+' W · ставка '+fmt(d.wager)+' W · до '+new Date(d.expires_at).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})+'</p></div>'+(mine?'<div class="duel-actions"><button data-duel-answer="accept">Принять</button><button class="decline" data-duel-answer="decline">Отказ</button></div>':'')+'</div>';
  }).join(''):'<p class="muted">Активных вызовов пока нет. Создай первый!</p>';} 
  await maybeAnimateDuel(recent);
  const historyKey=JSON.stringify(recent);if($('duel-history').dataset.content!==historyKey){$('duel-history').dataset.content=historyKey;$('duel-history').innerHTML=recent.length?recent.map(d=>'<div class="history-item"><strong>@'+esc(d.initiator_login)+' ↔ @'+esc(d.opponent_login)+'</strong><span>'+esc(d.winner_login?'Победил @'+d.winner_login:d.status)+'</span><em>'+fmt(d.wager*2-d.fee)+' W</em><time>'+ruTime(d.resolved_at||d.created_at)+'</time></div>').join(''):'<p class="muted">Завершённых дуэлей пока нет.</p>';} 
 }catch(e){$('pending-duels').textContent=e.message;$('duel-history').textContent=e.message;}finally{duelRefreshBusy=false;}
}
async function duelAction(answer){
 if(!state.me?.authenticated){location.href='/auth/twitch';return;}
 try{
  const result=await api('/api/duels/respond',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({answer,requestId:crypto.randomUUID()})});
  await refreshDuels();notice(result.message||'Ответ отправлен');await Promise.all([refreshMe(),refreshPublic()]);
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
Promise.all([refreshPublic(),refreshMe(),refreshSpins(),refreshCases(),refreshVipShop(),refreshVpShop()]).then(()=>{if(currentRoute()==='/duels')refreshDuels();});
setInterval(updateCooldown,1000);
// Keep W coins, cooldown and chat ranks in sync with the same live SQLite-backed API.
// Poll only while the tab is visible; never invent a client-side balance.
setInterval(()=>{if(document.visibilityState==='visible'&&!state.busy)refreshMe();},12000);
setInterval(()=>{if(document.visibilityState==='visible'){refreshPublic();if(currentRoute()==='/top')refreshTop();if(currentRoute()==='/chat')refreshChatTop();if(currentRoute()==='/cases')refreshCases();if(currentRoute()==='/duels')refreshDuels();}},20000);
document.addEventListener('visibilitychange',()=>{
 if(document.visibilityState==='visible'&&!state.busy){refreshMe();refreshPublic();if(currentRoute()==='/top')refreshTop();if(currentRoute()==='/chat')refreshChatTop();if(currentRoute()==='/cases')refreshCases();if(currentRoute()==='/duels')refreshDuels();}
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
 const unread=Number(state.me?.support_unread||0),ready=!!state.me?.authenticated&&!!state.me?.spin_allowed&&Date.now()>=Number(state.me.player.last_opened||0)+120000;
 const accountUnread=Number(state.me?.notification_unread||0);
 const text=[unread?unread+' ответов поддержки':'',accountUnread?accountUnread+' уведомлений аккаунта':''].filter(Boolean).join('. ');
 for(const el of document.querySelectorAll('#avatar-link,.side-link[href="/profile"]')){el.classList.toggle('has-notice',!!text);el.dataset.notice=text?'•':'';if(text)el.title=text;else el.removeAttribute('title');}
 for(const el of document.querySelectorAll('.side-link[href="/casino"]')){el.classList.toggle('has-notice',ready);el.dataset.notice=ready?'•':'';el.title=ready?'Холодос готов':'Холодос';}
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
function updateBellButtons(){for(const b of document.querySelectorAll('.notify-toggle')){b.innerHTML=bellSvg;b.setAttribute('aria-pressed',String(cooldownAlerts));const label=cooldownAlerts?'Выключить уведомление о готовности открытия':'Уведомить, когда Холодос готов к открытию';b.title=label;b.setAttribute('aria-label',label);}}
for(const b of document.querySelectorAll('.notify-toggle'))b.addEventListener('click',async()=>{cooldownAlerts=!cooldownAlerts;try{localStorage.setItem('war1ouss-cooldown-alerts',cooldownAlerts?'on':'off')}catch{}updateBellButtons();notice(cooldownAlerts?'Уведомления включены. Они работают, пока сайт открыт.':'Уведомления выключены.');if(cooldownAlerts&&'Notification'in window&&Notification.permission==='default')try{await Notification.requestPermission()}catch{}});
updateBellButtons();
setInterval(()=>{
 renderNotificationBadges();const opened=Number(state.me?.player?.last_opened||0);
 if(!cooldownAlerts||!state.me?.authenticated||!state.me?.spin_allowed||!opened||opened<=Number(localStorageSafeRead('war1ouss-last-cooldown-alert-'+state.me.player.id))||Date.now()<opened+120000)return;
 lastAlerted=opened;try{localStorage.setItem('war1ouss-last-cooldown-alert-'+state.me.player.id,String(opened))}catch{}notice('Холодос снова готов к открытию!');
 if('Notification'in window&&Notification.permission==='granted')try{new Notification('Холодос готов',{body:'Можно снова открыть Холодос на War1ouss.',tag:'war1ouss-cooldown'})}catch{}
},1000);
setInterval(()=>{if(document.visibilityState==='visible'&&currentRoute()==='/requests'&&state.me?.authenticated){refreshRequests();if(selectedSupportTicket)openSupportThread(selectedSupportTicket);}},15000);

for(const button of document.querySelectorAll('.page-back-button'))button.addEventListener('click',()=>{if(Number(history.state?.warDepth||0)>0)history.back();else navigate(currentRoute()==='/requests'?'/help':'/');});

let noticeSoundEnabled=true,lastNoticeTone=0;
try{noticeSoundEnabled=localStorage.getItem('war1ouss-notification-sound')!=='off'}catch{}
const noticeAudio=new Audio('/assets/notification.mp3?v=47');noticeAudio.preload='auto';noticeAudio.volume=.1;
let noticeAudioContext=null,noticeBuffer=null,noticeBufferLoading=null;
function unlockNoticeAudio(){
 try{const AC=window.AudioContext||window.webkitAudioContext;if(!noticeAudioContext&&AC)noticeAudioContext=new AC();if(noticeAudioContext?.state==='suspended')noticeAudioContext.resume().catch(()=>{});if(noticeAudioContext&&!noticeBufferLoading)noticeBufferLoading=fetch('/assets/notification.mp3?v=47').then(r=>{if(!r.ok)throw Error('audio');return r.arrayBuffer()}).then(b=>noticeAudioContext.decodeAudioData(b)).then(b=>noticeBuffer=b).catch(()=>{noticeBufferLoading=null;});}catch{}
}
window.addEventListener('pointerdown',unlockNoticeAudio,{passive:true});window.addEventListener('keydown',unlockNoticeAudio);
async function playNoticeTone(){
 if(!noticeSoundEnabled||Date.now()-lastNoticeTone<1000)return;lastNoticeTone=Date.now();unlockNoticeAudio();
 try{if(noticeAudioContext){await noticeAudioContext.resume();if(noticeBufferLoading)await noticeBufferLoading;if(noticeBuffer&&noticeAudioContext.state==='running'){const source=noticeAudioContext.createBufferSource(),gain=noticeAudioContext.createGain();source.buffer=noticeBuffer;gain.gain.value=.1;source.connect(gain);gain.connect(noticeAudioContext.destination);source.start();return;}}noticeAudio.currentTime=0;noticeAudio.volume=.1;await noticeAudio.play();}catch{}
}
let notificationLastSeenId=0,notificationUser='',notificationLoading=false;
async function refreshAccountNotifications(){
 if(notificationLoading||!state.me?.authenticated)return;notificationLoading=true;
 try{const user=String(state.me.player.id);if(notificationUser!==user){notificationUser=user;notificationLastSeenId=0;try{notificationLastSeenId=Number(localStorage.getItem('war1ouss-notification-last-'+user)||0)}catch{}}
 const {notifications}=await api('/api/notifications');if(!state.me?.authenticated||String(state.me.player.id)!==user)return;const latest=notifications[0]?.id||0;const newest=notifications.find(n=>n.unread&&n.id>notificationLastSeenId);
 if(newest){notice(newest.title+': '+newest.body);if(document.visibilityState==='hidden'&&'Notification' in window&&Notification.permission==='granted')try{new Notification(newest.title,{body:newest.kind==='vp-code'?'Код VP доступен в личном кабинете.':newest.body,tag:'account-'+newest.id})}catch{}}
 notificationLastSeenId=Math.max(notificationLastSeenId,latest);try{localStorage.setItem('war1ouss-notification-last-'+user,String(notificationLastSeenId))}catch{}
 $('account-notification-list').innerHTML=notifications.length?notifications.map(n=>'<a class="account-notification '+(n.unread?'unread':'')+'" href="'+esc(/^\/(?:requests|profile|help|cases|duels)\b/.test(n.url)?n.url:'/profile')+'" data-route="'+esc(n.url)+'"><strong>'+esc(n.title)+'</strong><p>'+esc(n.body)+'</p><time>'+ruTime(n.created_at)+'</time></a>').join(''):'<p class="muted">Пока нет уведомлений.</p>';
 if(!$('account-notifications').hidden&&latest){await supportPost('/api/notifications/read',{maxId:latest});state.me.notification_unread=0;for(const badge of document.querySelectorAll('.account-unread-count'))badge.textContent='';renderNotificationBadges();}
 }catch{}finally{notificationLoading=false}
}
document.addEventListener('click',async e=>{if(e.target.closest('[data-account-notifications]')){const panel=$('account-notifications');panel.hidden=!panel.hidden;if(!panel.hidden){await refreshAccountNotifications();$('notifications-close').focus();}}else if(e.target.closest('#notifications-close'))$('account-notifications').hidden=true;else if(e.target.closest('.account-notification'))$('account-notifications').hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('account-notifications').hidden=true;});
$('notification-sound-toggle').textContent=noticeSoundEnabled?'Выключить звук':'Включить звук';
$('notification-sound-toggle').addEventListener('click',()=>{noticeSoundEnabled=!noticeSoundEnabled;try{localStorage.setItem('war1ouss-notification-sound',noticeSoundEnabled?'on':'off')}catch{}$('notification-sound-toggle').textContent=noticeSoundEnabled?'Выключить звук':'Включить звук';if(noticeSoundEnabled){unlockNoticeAudio();playNoticeTone();}});
function avatarHtml(login){const name=String(login||'').toLowerCase();if(!/^[a-z0-9_]{1,25}$/.test(name))return '';const own=state.me?.authenticated&&String(state.me.player.login).toLowerCase()===name;const src=own?safeAvatar(state.me.player.avatar):(avatarClientCache.get(name)||'');return '<span class="player-avatar equipped-avatar" data-player-avatar="'+esc(name)+'" data-equipped-frame="'+esc(own?(state.me.frames?.active||''):(avatarFrameCache.get(name)||''))+'" aria-hidden="true">'+(src?'<img src="'+esc(src)+'" alt="" decoding="async">':esc(name[0].toUpperCase()))+'</span>';}
let avatarHydrationBusy=false,avatarHydrationAgain=false;const avatarClientCache=new Map(),avatarFrameCache=new Map();
async function hydrateAvatars(root=document){
 if(avatarHydrationBusy){avatarHydrationAgain=true;return;}avatarHydrationBusy=true;
 try{
 const nodes=[...root.querySelectorAll('[data-player-avatar]')],names=[...new Set(nodes.map(n=>n.dataset.playerAvatar))];
 const me=state.me;if(me?.authenticated){const src=safeAvatar(me.player.avatar);if(src)avatarClientCache.set(String(me.player.login).toLowerCase(),src);}
 const paint=()=>{for(const node of nodes){const src=avatarClientCache.get(node.dataset.playerAvatar);if(src&&!node.querySelector('img')){const img=document.createElement('img');img.src=src;img.alt='';img.decoding='async';img.addEventListener('error',()=>{avatarClientCache.delete(node.dataset.playerAvatar);node.replaceChildren(document.createTextNode(node.dataset.playerAvatar[0].toUpperCase()));},{once:true});node.replaceChildren(img);}}};
 paint();
 const missing=names.filter(n=>!avatarClientCache.has(n));
 await Promise.allSettled([
 (async()=>{for(let i=0;i<missing.length;i+=50){const batch=missing.slice(i,i+50),r=await api('/api/avatars?logins='+encodeURIComponent(batch.join(',')));for(const n of batch){const src=safeAvatar(r.avatars?.[n]);if(src)avatarClientCache.set(n,src);}paint();}})(),
 (async()=>{for(let i=0;i<names.length;i+=50){const batch=names.slice(i,i+50),r=await api('/api/frames?logins='+encodeURIComponent(batch.join(',')));for(const node of nodes)if(batch.includes(node.dataset.playerAvatar)){avatarFrameCache.set(node.dataset.playerAvatar,r.frames?.[node.dataset.playerAvatar]||'');applyAvatarFrame(node,r.frames?.[node.dataset.playerAvatar]);applyPlayerCosmetics(node,r.cosmetics?.[node.dataset.playerAvatar]);}}})()
 ]);
 }finally{avatarHydrationBusy=false;if(avatarHydrationAgain){avatarHydrationAgain=false;queueMicrotask(hydrateAvatars);}}
}

async function refreshReviews(){
 try{
  const data=await api('/api/reviews');
  $('shop-review-list').innerHTML=data.reviews.length?data.reviews.map(r=>'<article class="shop-review"><div class="review-heading"><span class="player-line">'+(r.login?avatarHtml(r.login):'')+'<strong>'+esc(r.author_name)+'</strong></span><span class="review-rating" aria-label="'+r.rating+' из 5">'+('★'.repeat(r.rating))+'<span>'+('☆'.repeat(5-r.rating))+'</span></span></div><p>'+esc(r.body)+'</p><div class="review-meta"><span class="'+(r.source==='verified'?'review-verified':'')+'">'+(r.source==='verified'?'✓ VP получены на сайте':'Добавлено администрацией')+'</span><time>'+ruTime(r.created_at)+'</time></div></article>').join(''):'<p class="muted">Пока нет отзывов. Получи VP и поделись впечатлениями.</p>';
  hydrateAvatars();
  if(document.activeElement?.closest('#review-form'))return;
  $('shop-review-form').innerHTML=!state.me?.authenticated?'<p class="muted">Войди через Twitch, чтобы оставить отзыв после получения VP.</p>':data.eligibleOrders.length?'<form id="review-form"><h4>Оставить отзыв</h4><div class="review-fields"><label>Полученная заявка<select name="orderId">'+data.eligibleOrders.map(o=>'<option value="'+o.id+'">№'+o.id+' · '+o.vp+' VP</option>').join('')+'</select></label><label>Оценка<select name="rating"><option value="5">5 из 5</option><option value="4">4 из 5</option><option value="3">3 из 5</option><option value="2">2 из 5</option><option value="1">1 из 5</option></select></label></div><label for="review-body">Твой отзыв</label><textarea id="review-body" name="body" rows="3" minlength="5" maxlength="1200" required placeholder="Расскажи о получении VP"></textarea><button class="button button-ghost" type="submit">Опубликовать отзыв</button><p class="muted">Один отзыв на выданную заявку. Ник и текст будут видны на сайте.</p></form>':'<p class="muted">Отзыв можно оставить после выдачи VP по твоей заявке. Для каждой полученной заявки доступен один отзыв.</p>';
 }catch(e){$('shop-review-list').textContent=e.message;}
}
document.addEventListener('submit',async e=>{
 if(e.target.id!=='review-form')return;e.preventDefault();const btn=e.submitter;btn.disabled=true;
 try{const form=new FormData(e.target);await supportPost('/api/reviews',{orderId:Number(form.get('orderId')),rating:Number(form.get('rating')),body:form.get('body')});e.target.reset();$('shop-review-form').replaceChildren();notice('Спасибо! Твой отзыв опубликован.');await refreshReviews();}
 catch(err){notice(err.message);}finally{btn.disabled=false;}
});
const cosmeticDuelIds=['pipeline','pacific','khaotic','violet','badapple'];
const normalDuelIds=['white','green','mango','pink','blue','black','watermelon','yellow','w-edition'];
function canImageSource(id){return '/assets/'+(['pipeline','pacific','khaotic','violet','badapple'].includes(id)?'duel-can-':'slot-')+id+'.webp';}
function duelCanImage(can){const src=can?.src||canImageSource(can?.id||'black');return '<img src="'+esc(/^\/(assets\/[a-z0-9_-]+\.(webp|png|svg)|api\/cosmetic-assets\/custom_[a-f0-9]{16})$/.test(src)?src:'/assets/slot-black.webp')+'" alt="'+esc(can?.label||'Monster')+'" width="80" height="160">';}
let duelAnimationBusy=false;
function duelFighterHtml(login,can){return '<div data-can="'+esc(can?.id||'black')+'" class="duel-fighter '+(can?.cosmetic?'duel-fighter--cosmetic':'')+'"><div class="duel-can-wrap">'+duelCanImage(can)+'<span class="duel-soda" aria-hidden="true"><svg class="soda-stream" viewBox="0 0 200 170" fill="none"><path pathLength="1" d="M100 90 C86 51 43 35 24 65 C12 84 19 111 32 130"/><path pathLength="1" d="M100 90 C112 48 151 30 170 66 C182 89 174 109 165 121"/><path pathLength="1" d="M100 90 C96 58 77 34 60 42 C45 49 45 67 49 78"/></svg><i class="soda-drop soda-drop--0"></i><i class="soda-drop soda-drop--1"></i><i class="soda-drop soda-drop--2"></i><i class="soda-drop soda-drop--3"></i><i class="soda-drop soda-drop--4"></i><i class="soda-drop soda-drop--5"></i><i class="soda-drop soda-drop--6"></i><i class="soda-drop soda-drop--7"></i><i class="soda-drop soda-drop--8"></i><i class="soda-drop soda-drop--9"></i><i class="soda-drop soda-drop--10"></i><i class="soda-drop soda-drop--11"></i><i class="soda-foam"></i></span></div><span class="player-line">'+avatarHtml(login)+'<b>@'+esc(login)+'</b></span></div>';}
async function animateDuel(d,demo=false){
 if(!demo&&state.me?.authenticated&&d.opponent_login?.toLowerCase()===state.me.player.login.toLowerCase())d={...d,initiator_login:d.opponent_login,opponent_login:d.initiator_login,leftCan:d.rightCan,rightCan:d.leftCan};
 if(demo&&!canUseAdminDemo())return;
 if(duelAnimationBusy)return;duelAnimationBusy=true;const arena=$('duel-arena');
 try{arena.className='duel-arena';arena.innerHTML='<p class="duel-arena-label">'+(demo?'Демонстрация оформления':'Дуэль №'+Number(d.id))+'</p><div class="duel-fighters">'+duelFighterHtml(d.initiator_login,d.leftCan)+'<span class="duel-versus">VS</span>'+duelFighterHtml(d.opponent_login,d.rightCan)+'</div><p class="duel-arena-result" aria-live="polite">Встряхиваем банки…</p>';hydrateAvatars();
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!reduced){if(currentRoute()==='/duels')playDuelShake();arena.classList.add('duel-arena--charging');await new Promise(r=>setTimeout(r,650));}
 arena.classList.remove('duel-arena--charging');
 const leftWon=d.winner_login===d.initiator_login;const fighters=arena.querySelectorAll('.duel-fighter');fighters[leftWon?0:1].classList.add('duel-fighter--winner');fighters[leftWon?1:0].classList.add('duel-fighter--lost');arena.classList.add('duel-arena--resolved');if(currentRoute()==='/duels')playDuelFizz();
 arena.querySelector('.duel-arena-result').textContent=demo?'Пшш! Косметическая банка выпускает радужную газировку':'Победил @'+d.winner_login+' · '+fmt(d.wager*2-d.fee)+' W';
 if(!reduced)await new Promise(r=>setTimeout(r,850));if(currentRoute()==='/duels')playIceStop(1);
 }finally{duelAnimationBusy=false;}
}
async function maybeAnimateDuel(recent){
 if(duelAnimationBusy||currentRoute()!=='/duels'||!state.me?.authenticated)return;
 const login=state.me.player.login.toLowerCase();const d=recent.find(x=>(x.initiator_login===login||x.opponent_login===login)&&Date.now()-x.resolved_at<180000);
 if(!d)return;const key='war1ouss-duel-seen-'+login+'-'+d.id;try{if(localStorage.getItem(key))return;localStorage.setItem(key,'1')}catch{}
 await animateDuel(d);
}
$('duel-preview').addEventListener('click',()=>{if(!canUseAdminDemo())return;const cosmetic=cosmeticDuelIds[Math.floor(Math.random()*cosmeticDuelIds.length)],normal=normalDuelIds[Math.floor(Math.random()*normalDuelIds.length)];animateDuel({id:0,initiator_login:'cosmetic',opponent_login:'monster',leftCan:{id:cosmetic,cosmetic:true},rightCan:{id:normal,cosmetic:false},winner_login:'monster',wager:0,fee:0},true);});
setInterval(()=>{if(currentRoute()==='/duels'&&document.visibilityState==='visible')refreshDuels();},3000);

function localStorageSafeRead(key){try{return localStorage.getItem(key)||0}catch{return 0}}
document.addEventListener('click',e=>{if(e.target.closest('[data-notification-test]')){unlockNoticeAudio();notice(noticeSoundEnabled?'Уведомления работают. Громкость звука — 10%.':'Уведомления работают. Звук сейчас отключён в настройках.');}});

for(const event of ['contextmenu','dragstart'])document.addEventListener(event,e=>{if(e.target.closest('.frame-preview'))e.preventDefault();});

function applyAvatarFrame(node,id){if(!node)return;node.classList.add('equipped-avatar');node.dataset.equippedFrame=['ultra','original','mango','thorn','assault','ears','jett','clove','shy','fish'].includes(id)?id:'';}
function frameArt(id){return '/assets/frame-'+id+'.png';}
function frameInventoryHtml(data,cosmetics){const owned=data?.owned||[];const frames=(owned.length?'<div class="owned-frame-list"><button class="button button-ghost" data-equip-frame="" aria-pressed="'+(!data.active)+'">Без рамки</button>'+owned.map(id=>'<button class="button button-ghost owned-frame" data-equip-frame="'+esc(id)+'" aria-pressed="'+(data.active===id)+'"><img src="'+frameArt(id)+'" alt="" width="48" height="48">'+esc(data.catalog[id])+(data.active===id?' · Надета':'')+'<small class="frame-rarity">'+esc(data.rarity?.[id]?.label||'')+'</small>'+'</button>').join('')+'</div>':'<p class="muted">Здесь появятся полученные рамки.</p>');const ids=['frames','title','name_color','theme','profile','highlight','effect','cans'];const active=ids.includes(localStorageSafeRead('war1ouss-cosmetic-tab'))?localStorageSafeRead('war1ouss-cosmetic-tab'):'frames';return '<section class="profile-frames"><h3>Моя косметика</h3><div class="cosmetic-tabs" role="tablist" aria-label="Моя косметика">'+[['frames','Рамки'],['title','Титулы'],['name_color','Ник'],['theme','Темы'],['profile','Профиль'],['highlight','Выделение'],['effect','Эффекты'],['cans','Банки']].map(([id,label])=>'<button type="button" role="tab" id="cosmetic-tab-'+id+'" aria-controls="cosmetic-panel-'+id+'" aria-selected="'+(active===id)+'" tabindex="'+(active===id?'0':'-1')+'" data-cosmetic-tab="'+id+'">'+label+'</button>').join('')+'</div><div role="tabpanel" id="cosmetic-panel-frames" aria-labelledby="cosmetic-tab-frames" tabindex="0" '+(active==='frames'?'':'hidden')+'>'+frames+'</div>'+cosmeticInventoryHtml(cosmetics,active)+'</section>';}

document.addEventListener('click',async e=>{const button=e.target.closest('[data-equip-frame]');if(!button||button.disabled)return;button.disabled=true;try{await api('/api/frames/equip',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me?.csrf||''},body:JSON.stringify({frame:button.dataset.equipFrame})});await refreshMe();await hydrateAvatars();notice('Рамка обновлена');}catch(error){notice(error.message);}finally{button.disabled=false;}});

// Shared animation: demos use samples; the message case uses a persisted server result.
const caseDemo=$('case-demo'),caseDemoStage=$('case-demo-stage'),caseDemoTrack=$('case-demo-track');let caseWinIndex=24,caseStopOffset=0;let caseDemoAnimation=null,caseDemoRun=0,caseDemoEnd=0,caseDemoLidTimer,caseDemoType='subscriber',caseDemoTrigger=null,caseDemoResult=null;let caseRealMode=false,caseOpenPending=false;
const demoPrizes=[{id:'ultra',label:'Ultra Frost',kind:'Рамка'},{id:'original',label:'Original Splash',kind:'Рамка'},{id:'mango',label:'Mango Loco',kind:'Рамка'},{id:'title',label:'Ледяной',kind:'Титул'},{id:'name',label:'Перелив',kind:'Оформление ника'},{id:'can',label:'Ultra Violet',kind:'Банка для дуэлей'},{id:'theme',label:'Arctic Blue',kind:'Цвет сайта'}];
const previewW=amount=>({id:'w-'+amount,label:amount.toLocaleString('ru-RU')+' W',kind:'W-монеты',symbol:'w'});
const previewVp={id:'vp',label:'240 VP',kind:'Пример награды',symbol:'vp'};
const previewVip={id:'vip-month',label:'VIP на месяц',kind:'VIP канала',symbol:'vip'};
const casePreviewPools={twitch:[500,1000,2000,5000].map(previewW).concat(previewVp),chat:[100,250,1000,3000,8000].map(previewW).concat(previewVp,previewVip),vip:[50,100,500,2000,5000,10000].map(previewW).concat(previewVp),coins:demoPrizes.concat(previewVp),subscriber:demoPrizes,donation:[3000,5000,10000,15000].map(previewW).concat(previewVp,{id:'vp-475',label:'475 VP',kind:'VP',symbol:'vp'},{id:'vp-1000',label:'1000 VP',kind:'VP',symbol:'vp'},{id:'popmart',label:'Фигурка POP MART',kind:'Фигурка',symbol:'physical'})};
function demoPrizeArt(p){
 const frameId=p.frame||(['ultra','original','mango'].includes(p.id)?p.id:'');if(frameId)return '<img src="'+frameArt(frameId)+'" alt="">';
 if(p.can||p.id==='can')return '<img src="'+esc(p.src||canImageSource(p.can||'violet'))+'" alt="">';if(p.symbol==='case')return '<img src="/assets/case-donation.webp" alt="">';
 const icon=p.symbol==='vip'?'<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="m10 20 12 11 10-19 10 19 12-11-6 29H16l-6-29Z"/><path d="M17 55h30"/></svg>':p.symbol==='w'?'<span class="demo-w-coin">W</span>':p.symbol==='vp'?'VP':p.symbol==='physical'?'✧':(p.symbol==='name'||p.id==='name')?'W':(p.symbol==='title'||p.id==='title')?'✦':'◈';
 return '<span class="demo-symbol demo-symbol--'+(p.symbol||p.id)+'">'+icon+'</span>';
}
function demoPrizeHtml(p){return '<div class="demo-prize demo-prize--'+(p.symbol||p.id)+'">'+demoPrizeArt(p)+'<strong>'+esc(p.label)+'</strong><small>'+esc(p.kind)+'</small></div>';}
function renderDemoResult(){const p=caseDemoResult||casePreviewPools[caseDemoType][0],frame=p.frame||(['ultra','original','mango'].includes(p.id)?p.id:''),src=safeAvatar(state.me?.player?.avatar);caseDemoStage.querySelector('.case-demo-reward').innerHTML=(frame?'<div class="case-demo-avatar" data-demo-frame="'+esc(frame)+'"><span>'+(src?'<img src="'+esc(src)+'" alt="Твоя аватарка">':'W')+'</span><picture><img src="'+frameArt(frame)+'" alt="'+esc(p.label)+'" width="176" height="176"></picture></div>':'<div class="case-demo-sample">'+demoPrizeArt(p)+'</div>')+'<h3>'+esc(p.label)+'</h3><p>'+esc(p.kind)+'</p>';}
function buildDemoReel(){const pool=casePreviewPools[caseDemoType];const count=42+Math.floor(Math.random()*13);caseWinIndex=count-7;caseStopOffset=(Math.random()-.5)*.55;caseDemoTrack.innerHTML=Array.from({length:count},(_,i)=>demoPrizeHtml(i===caseWinIndex?(caseDemoResult||pool[0]):pool[Math.floor(Math.random()*pool.length)])).join('');renderDemoResult();}
function resetCaseDemo(){stopAllGameSound();$('case-demo-odds').hidden=true;$('case-demo-odds-toggle').setAttribute('aria-expanded','false');clearTimeout(caseDemoLidTimer);caseDemoRun++;caseDemoAnimation?.cancel();caseDemoAnimation=null;caseDemoStage.dataset.phase='ready';caseDemoStage.querySelector('.case-demo-reward').setAttribute('aria-hidden','true');$('case-demo-start').hidden=false;for(const id of ['case-demo-skip','case-demo-again','case-demo-done'])$(id).hidden=true;$('case-demo-title').textContent='Прокрутка: '+casePreviewNames[caseDemoType];$('case-demo-caption').textContent=caseRealMode?(caseDemoType==='donation'?'Открытие подтверждённого кейса. Спишется одно доступное открытие.':['twitch','vip','subscriber'].includes(caseDemoType)?'Открытие полученного кейса. Спишется одно доступное открытие.':caseDemoType==='coins'?'Открытие за '+fmt(state.me?.coinCase?.cost)+' W. Повторная косметика — компенсация 1 000 W.':'Открытие за '+fmt(state.me?.chatCase?.threshold)+' учтённых сообщений. W начисляются сразу; VP и VIP выдаёт администрация.'):'Предпросмотр состава кейса. Награды не начисляются.';$('case-demo-start').textContent=caseRealMode?(caseDemoType==='donation'?'Крутить':'Открыть кейс'):'Открыть · демо';$('case-demo-status').textContent='';buildDemoReel();caseDemoTrack.style.transform='translateX(-732px)';}
function revealCaseDemo(skip=false){stopCaseIceSound();clearTimeout(caseDemoLidTimer);caseDemoRun++;const run=caseDemoRun;caseDemoAnimation?.cancel();caseDemoAnimation=null;caseDemoTrack.style.transform='translateX('+caseDemoEnd+'px)';$('case-demo-skip').hidden=true;caseDemoStage.dataset.phase='unsealing';playIceStop(0);$('case-demo-caption').textContent='Кейс раскрывается…';const finish=()=>{if(run!==caseDemoRun||!caseDemo.open)return;caseDemoStage.dataset.phase='revealed';caseDemoStage.querySelector('.case-demo-reward').removeAttribute('aria-hidden');$('case-demo-title').textContent=caseDemoResult.label;$('case-demo-caption').textContent=caseRealMode?[caseDemoResult.note,caseDemoResult.delivery==='manual'?'Приз сохранён. Заявка ожидает ручной выдачи администрацией.':'Награда начислена на твой аккаунт.'].filter(Boolean).join(' '):'Пример результата анимации. Награда не выдана.';$('case-demo-again').hidden=caseRealMode;$('case-demo-done').hidden=false;$('case-demo-status').textContent=caseRealMode?'Получено: '+caseDemoResult.label: 'Демонстрация: '+caseDemoResult.label+'. Приз не выдаётся.';};if(skip||matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else caseDemoLidTimer=setTimeout(finish,850);}

async function startCaseDemo(){
 if(caseOpenPending)return;
 if(caseRealMode){
  if(!state.me?.authenticated)return;caseOpenPending=true;$('case-demo-start').disabled=true;$('case-demo-caption').textContent='Сохраняем открытие…';
  try{
   const requestId=pendingCaseRequest(caseDemoType)||crypto.randomUUID();try{sessionStorage.setItem(pendingCaseKey(caseDemoType),requestId);}catch{}
   const result=await api('/api/cases/'+caseDemoType+'/open',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me.csrf},body:JSON.stringify({requestId,...(caseDemoType==='coins'?{expectedCost:state.me.coinCase.cost}:{})})});
   caseDemoResult=result.reward;try{sessionStorage.removeItem(pendingCaseKey(caseDemoType));}catch{}
   await refreshMe();if(!caseDemo.open)return;
  }catch(error){if(error.status===400||error.status===409){try{sessionStorage.removeItem(pendingCaseKey(caseDemoType));}catch{}}notice(error.message);$('case-demo-caption').textContent=error.message;await refreshMe();return;}
  finally{caseOpenPending=false;$('case-demo-start').disabled=false;}
 }else{if(!canUseAdminDemo())return;const pool=casePreviewPools[caseDemoType];caseDemoResult=pool[Math.floor(Math.random()*pool.length)];}
 resetCaseDemo();const run=caseDemoRun;const cards=caseDemoTrack.children,start=-(cards[5].offsetLeft+cards[5].offsetWidth/2);caseDemoEnd=-(cards[caseWinIndex].offsetLeft+cards[caseWinIndex].offsetWidth/2)+caseStopOffset*cards[caseWinIndex].offsetWidth;$('case-demo-start').hidden=true;$('case-demo-skip').hidden=false;$('case-demo-skip').focus();caseDemoStage.dataset.phase='opening';$('case-demo-caption').textContent='Лента замедляется. Награда остановится под указателем.';if(matchMedia('(prefers-reduced-motion: reduce)').matches){revealCaseDemo();return;}caseDemoAnimation=caseDemoTrack.animate([{transform:'translateX('+start+'px)'},{transform:'translateX('+caseDemoEnd+'px)'}],{duration:10500+Math.floor(Math.random()*3000),easing:['cubic-bezier(.08,.55,.12,1)','cubic-bezier(.06,.7,.15,1)','cubic-bezier(.11,.48,.15,1)'][Math.floor(Math.random()*3)],fill:'forwards'});startCaseIceSound(caseDemoAnimation,Math.abs(caseDemoEnd-start),cards[0].offsetWidth+10);caseDemoAnimation.finished.then(()=>{if(run===caseDemoRun&&caseDemo.open)revealCaseDemo();}).catch(()=>{});}
const casePreviewNames={donation:'Подарочный',twitch:'Баллы Twitch',chat:'За сообщения',vip:'VIP',coins:'За W-монеты',subscriber:'За подписку'};
function openCasePreview(type='subscriber',trigger=$('case-demo-launch'),real=false){
 if(caseOpenPending||!Object.hasOwn(casePreviewNames,type))return;
 if(real){if(!['chat','coins','donation','twitch','vip','subscriber'].includes(type)||!state.me?.authenticated)return;}else if(!canUseAdminDemo())return;
 caseRealMode=real;
 caseDemoType=type;caseDemoResult=casePreviewPools[type][0];caseDemoTrigger=trigger;caseDemo.dataset.caseType=type;
 const art=caseArtSource(type);caseDemo.querySelector('.case-demo-closed').src=art;
 for(const node of caseDemo.querySelectorAll('.case-demo-open-body,.case-demo-open-lid'))node.src=type==='subscriber'?'/assets/case-subscriber-open.webp?v=64':art;
 resetCaseDemo();
 const card=document.querySelector?.('.collection-case--'+type),odds=$('case-demo-selected-odds');if(card&&odds)odds.innerHTML='<h4>'+esc(casePreviewNames[type])+'</h4><p>Шансы показаны для состава кейса. Предпросмотр не выдаёт награды.</p>'+card.querySelector('.case-reward-list').outerHTML;
 caseDemo.querySelector('.case-demo-label').textContent=real?'ОТКРЫТИЕ КЕЙСА':'ПРЕДПРОСМОТР ОТКРЫТИЯ';$('case-demo-close').setAttribute('aria-label','Закрыть открытие');if(real&&odds)odds.innerHTML=odds.innerHTML.replace('Предпросмотр не выдаёт награды.','W и косметика начисляются автоматически; VP и VIP — вручную.');
 caseDemo.showModal();const first=caseDemoTrack.children[5];caseDemoTrack.style.transform='translateX('+(-(first.offsetLeft+first.offsetWidth/2))+'px)';$('case-demo-start').focus();
}
$('case-demo-launch').addEventListener('click',()=>openCasePreview());
for(const button of document.querySelectorAll('[data-case-preview]'))button.addEventListener('click',()=>openCasePreview(button.dataset.casePreview,button));
for(const button of document.querySelectorAll('[data-case-open]'))button.addEventListener('click',event=>openCasePreview(button.dataset.caseOpen,event.currentTarget,true));
$('case-demo-start').addEventListener('click',startCaseDemo);$('case-demo-again').addEventListener('click',startCaseDemo);$('case-demo-skip').addEventListener('click',()=>revealCaseDemo(true));for(const id of ['case-demo-close','case-demo-done'])$(id).addEventListener('click',()=>caseDemo.close());caseDemo.addEventListener('close',()=>{resetCaseDemo();if(canUseAdminDemo())(caseDemoTrigger||$('case-demo-launch')).focus();});window.addEventListener('resize',()=>{if(caseDemo.open&&caseDemoStage.dataset.phase==='opening'){const card=caseDemoTrack.children[caseWinIndex];caseDemoEnd=-(card.offsetLeft+card.offsetWidth/2);revealCaseDemo();}});

function applyPlayerCosmetics(avatar,look){const line=avatar.closest('.player-line');if(!line)return;line.dataset.nameStyle=['ice','rose','amber','white','aurora'].includes(look?.name_color)?look.name_color:'';let badge=line.querySelector('.player-cosmetic-title');if(look?.title){let extras=line.querySelector('.player-extras');if(!extras){extras=document.createElement('span');extras.className='player-extras';line.append(extras);}if(!badge){badge=document.createElement('span');badge.className='player-cosmetic-title';}extras.append(badge);badge.textContent=look.title;}else badge?.remove();}
function cosmeticInventoryHtml(data,active='frames'){if(!data)return '';const labels={title:'Титулы',name_color:'Оформление ника',theme:'Темы сайта',profile:'Оформление профиля',highlight:'Выделение',effect:'Эффекты сайта'};return Object.entries(labels).map(([kind,label])=>'<div class="cosmetic-category" role="tabpanel" id="cosmetic-panel-'+kind+'" aria-labelledby="cosmetic-tab-'+kind+'" tabindex="0" '+(active===kind?'':'hidden')+'><h4>'+label+'</h4>'+((data.owned?.[kind]||[]).length?'<div class="owned-frame-list"><button class="button button-ghost" data-equip-cosmetic="'+kind+'" data-cosmetic-item="" aria-pressed="'+(!data.active[kind])+'">Стандартное</button>'+data.owned[kind].map(id=>'<button class="button button-ghost cosmetic-choice" data-equip-cosmetic="'+kind+'" data-cosmetic-item="'+esc(id)+'" aria-pressed="'+(data.active[kind]===id)+'"><span '+(kind==='name_color'?'data-name-style="'+esc(id)+'"':kind==='theme'?'class="theme-swatch theme-swatch--'+esc(id)+'"':'')+'>'+esc(data.catalog[kind][id])+'</span></button>').join('')+'</div>':'<p class="muted">Полученные награды появятся здесь.</p>')+'</div>').join('')+'<div class="cosmetic-category" role="tabpanel" id="cosmetic-panel-cans" aria-labelledby="cosmetic-tab-cans" tabindex="0" '+(active==='cans'?'':'hidden')+'><h4>Банки для дуэлей</h4>'+((data.duel_cans||[]).length?'<div class="owned-frame-list">'+data.duel_cans.map(can=>'<span class="owned-duel-can"><img src="'+esc(can.src||canImageSource(can.id))+'" alt="" width="32" height="64"><b>'+esc(can.label)+'</b></span>').join('')+'</div><p class="muted">Выбранную банку можно сменить на странице дуэлей.</p>':'<p class="muted">Полученные банки появятся здесь.</p>')+'</div>';}
document.addEventListener('click',async e=>{const button=e.target.closest('[data-equip-cosmetic]');if(!button||button.disabled)return;button.disabled=true;try{await api('/api/cosmetics/equip',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':state.me?.csrf||''},body:JSON.stringify({kind:button.dataset.equipCosmetic,item:button.dataset.cosmeticItem})});await refreshMe();await refreshPublic();await hydrateAvatars();notice('Оформление сохранено');}catch(error){notice(error.message);}finally{button.disabled=false;}});

$('case-demo-odds-toggle').addEventListener('click',()=>{const panel=$('case-demo-odds');panel.hidden=!panel.hidden;$('case-demo-odds-toggle').setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)panel.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
$('case-demo-odds-close').addEventListener('click',()=>{$('case-demo-odds').hidden=true;$('case-demo-odds-toggle').setAttribute('aria-expanded','false');$('case-demo-odds-toggle').focus();});

function selectCosmeticTab(id,focus=false){const tabs=[...document.querySelectorAll('[data-cosmetic-tab]')];if(!tabs.some(t=>t.dataset.cosmeticTab===id))return;for(const tab of tabs){const selected=tab.dataset.cosmeticTab===id;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;const panel=$('cosmetic-panel-'+tab.dataset.cosmeticTab);if(panel)panel.hidden=!selected;if(selected&&focus)tab.focus();}try{localStorage.setItem('war1ouss-cosmetic-tab',id)}catch{}}
document.addEventListener('click',e=>{const tab=e.target.closest('[data-cosmetic-tab]');if(tab)selectCosmeticTab(tab.dataset.cosmeticTab);});
document.addEventListener('keydown',e=>{const tab=e.target.closest('[data-cosmetic-tab]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-cosmetic-tab]')],i=tabs.indexOf(tab),target=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectCosmeticTab(tabs[target].dataset.cosmeticTab,true);});

// Soft, original procedural ice foley. No autoplay and no external audio request.
let gameSoundEnabled=true,gameAudio=null,gameNoise=null,caseIceFrame=0;const gameSources=new Set(),gameSoundTimers=new Set();
try{gameSoundEnabled=localStorage.getItem('war1ouss-game-sound')!=='off'}catch{}
function gameAudioReady(){if(!gameSoundEnabled||document.visibilityState==='hidden')return null;try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!gameAudio)gameAudio=new AC();if(gameAudio.state==='suspended')gameAudio.resume().catch(()=>{});if(!gameNoise){gameNoise=gameAudio.createBuffer(1,Math.floor(gameAudio.sampleRate*.055),gameAudio.sampleRate);const d=gameNoise.getChannelData(0);let previous=0;for(let i=0;i<d.length;i++){const n=Math.random()*2-1;d[i]=(n-previous)*.5;previous=n;}}return gameAudio;}catch{return null;}}
function iceTick(soft=1){const ctx=gameAudioReady();if(!ctx)return;try{const t=ctx.currentTime,source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=gameNoise;source.playbackRate.value=.85+Math.random()*.25;filter.type='bandpass';filter.frequency.value=1700+Math.random()*650;filter.Q.value=.7;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.032*soft,t+.003);gain.gain.exponentialRampToValueAtTime(.0001,t+.045);source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start(t);source.stop(t+.06);gameSources.add(source);source.onended=()=>{gameSources.delete(source);source.disconnect();filter.disconnect();gain.disconnect();};}catch{}}
function playIceStop(index=0){iceTick(1.25);const ctx=gameAudioReady();if(!ctx)return;try{const t=ctx.currentTime,osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime([784,988,1175][index%3],t);osc.frequency.exponentialRampToValueAtTime([740,932,1109][index%3],t+.12);gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.018,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.21);osc.connect(gain);gain.connect(ctx.destination);osc.start(t);osc.stop(t+.23);gameSources.add(osc);osc.onended=()=>{gameSources.delete(osc);osc.disconnect();gain.disconnect();};}catch{}}
function stopCaseIceSound(){cancelAnimationFrame(caseIceFrame);caseIceFrame=0;}
function startCaseIceSound(animation,distance,step){stopCaseIceSound();let last=-1,lastAt=0;const frame=()=>{if(!caseDemo.open||caseDemoStage.dataset.phase!=='opening')return;const progress=animation.effect?.getComputedTiming().progress??0,index=Math.floor(progress*distance/step);if(index!==last&&performance.now()-lastAt>45){iceTick(.8);lastAt=performance.now();last=index;}if(progress<1)caseIceFrame=requestAnimationFrame(frame);};caseIceFrame=requestAnimationFrame(frame);}
function startSlotIceSound(){gameAudioReady();let stopped=false,timer=0,count=0;const loop=()=>{gameSoundTimers.delete(timer);if(stopped)return;iceTick(count++%3===0?.75:.4);timer=setTimeout(loop,85+Math.random()*25);gameSoundTimers.add(timer);};loop();return()=>{stopped=true;clearTimeout(timer);gameSoundTimers.delete(timer);};}
function stopAllGameSound(){stopCaseIceSound();for(const timer of gameSoundTimers)clearTimeout(timer);gameSoundTimers.clear();for(const source of gameSources)try{source.stop()}catch{}gameSources.clear();}
function renderGameSound(){for(const b of document.querySelectorAll('[data-game-sound-toggle]')){b.innerHTML=gameSoundEnabled?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 6 6m0-6-6 6"/></svg>';const label=gameSoundEnabled?'Выключить звук игры':'Включить звук игры';b.setAttribute('aria-label',label);b.title=label+' · слоты, кейсы и дуэли';b.setAttribute('aria-pressed',String(gameSoundEnabled));}}
renderGameSound();
document.addEventListener('click',e=>{const toggle=e.target.closest('[data-game-sound-toggle]');if(toggle){gameSoundEnabled=!gameSoundEnabled;try{localStorage.setItem('war1ouss-game-sound',gameSoundEnabled?'on':'off')}catch{}if(!gameSoundEnabled)stopAllGameSound();else gameAudioReady();renderGameSound();}const preview=e.target.closest('[data-game-sound-preview]');if(preview){stopAllGameSound();if(!gameSoundEnabled){notice('Включи звук, чтобы послушать пример.');return;}gameAudioReady();const times=preview.dataset.gameSoundPreview==='case'?[0,70,160,290,480,780,1250]:[0,90,180,270,360,450,540,650,780,920];for(const ms of times){const timer=setTimeout(()=>{gameSoundTimers.delete(timer);iceTick(.8);},ms);gameSoundTimers.add(timer);}const end=setTimeout(()=>{gameSoundTimers.delete(end);playIceStop(1);},preview.dataset.gameSoundPreview==='case'?1600:1100);gameSoundTimers.add(end);}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stopAllGameSound();});caseDemo.addEventListener('close',stopAllGameSound);

function playDuelShake(){
 iceTick(.35);
 for(const ms of [110,230,360,490]){const timer=setTimeout(()=>{gameSoundTimers.delete(timer);if(currentRoute()==='/duels')iceTick(.3);},ms);gameSoundTimers.add(timer);}
}
function playDuelFizz(){
 const ctx=gameAudioReady();if(!ctx)return;
 try{const t=ctx.currentTime,source=ctx.createBufferSource(),high=ctx.createBiquadFilter(),low=ctx.createBiquadFilter(),gain=ctx.createGain();
 const noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.4),ctx.sampleRate),data=noise.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
 source.buffer=noise;high.type='highpass';high.frequency.value=700;low.type='lowpass';low.frequency.setValueAtTime(4200,t);low.frequency.exponentialRampToValueAtTime(1300,t+.38);
 gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.022,t+.018);gain.gain.exponentialRampToValueAtTime(.0001,t+.39);
 source.connect(high);high.connect(low);low.connect(gain);gain.connect(ctx.destination);source.start(t);source.stop(t+.4);gameSources.add(source);source.onended=()=>{gameSources.delete(source);source.disconnect();high.disconnect();low.disconnect();gain.disconnect();};
 }catch{}
}
