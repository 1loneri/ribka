/* Public, visual-only cosmetic samples. Inventory/equip actions stay in the profile. */
(()=>{
 'use strict';
 const categories=[['frames','Рамки'],['profile','Фоны профиля'],['theme','Фоны сайта'],['title','Титулы'],['name_color','Оформление ника'],['cans','Банки'],['highlight','Выделение'],['effect','Эффекты']];
 const host=document.getElementById('cosmetic-gallery');if(!host)return;
 let selected='frames',lastKey='';const themeCache=new Map();
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function avatar(frame=''){const url=safeAvatar(state.me?.player?.avatar);return '<span class="gallery-avatar equipped-avatar" data-equipped-frame="'+escape(frame)+'">'+(url?'<img src="'+escape(url)+'" alt="">':'<span>W</span>')+'</span>';}
 function sample(kind,id,label){const escaped=escape(id),asset=(siteFeatures.assets||[]).find(a=>a.enabled&&a.id===id),caption='<figcaption>'+escape(label)+'</figcaption>';let visual='';
  if(kind==='frames')visual='<div class="cosmetic-visual cosmetic-visual--frame">'+avatar(id)+'</div>';
  if(kind==='profile')visual='<div class="cosmetic-visual cosmetic-profile-preview" data-profile="'+escaped+'">'+(asset?.kind==='profile'?(asset.mime?.startsWith('text/html')?'<iframe sandbox loading="lazy" src="'+escape(asset.src)+'" title="'+escape(label)+'"></iframe>':'<img class="sample-background" loading="lazy" src="'+escape(asset.src)+'" alt="">'):'')+'<span class="sample-avatar"></span><span class="sample-lines"><i></i><i></i></span><span class="sample-stats"><i></i><i></i><i></i></span></div>';
  if(kind==='theme')visual='<div class="cosmetic-visual cosmetic-site-preview" data-theme="'+escaped+'"><span class="sample-site-nav"><i></i><i></i><i></i></span><span class="sample-site-body"><b>W.</b><i></i><i></i></span></div>';
  if(kind==='title')visual='<div class="cosmetic-visual cosmetic-title-preview"><b data-title-name="'+escaped+'">@'+escape(state.me?.player?.login||'Игрок')+'</b><span class="player-cosmetic-title" data-title="'+escaped+'">'+escape(label)+'</span></div>';
  if(kind==='name_color')visual='<div class="cosmetic-visual cosmetic-name-preview" data-name-style="'+escaped+'"><b>@'+escape(state.me?.player?.login||'Игрок')+'</b><span class="sample-underline"></span></div>';
  if(kind==='cans')visual='<div class="cosmetic-visual cosmetic-can-preview"><img loading="lazy" '+(id==='w-edition'?'style="transform:scaleX(1.15)" ':'')+'src="'+escape(siteFeatures.cans[id]?.src||'')+'" alt=""></div>';
  if(kind==='highlight')visual='<div class="cosmetic-visual cosmetic-highlight-preview"><span class="history-item" data-highlight="'+escaped+'">'+avatar()+'<b>@'+escape(state.me?.player?.login||'Игрок')+'</b></span></div>';
  if(kind==='effect')visual='<div class="cosmetic-visual cosmetic-effect-preview"><span class="snowfall-preview" role="img" aria-label="Падающий снег">'+Array.from({length:16},()=>'<i aria-hidden="true"></i>').join('')+'</span></div>';
  if(kind==='profile'){
   return '<figure class="cosmetic-example" style="position:relative">'+visual+caption+
    '<button type="button" data-preview-profile="'+escaped+'" aria-label="Примерить фон '+escape(label)+'" title="Примерить фон" style="position:absolute;inset:0;width:100%;border:0;border-radius:inherit;background:transparent;z-index:2"></button></figure>';
  }
  return '<figure class="cosmetic-example" aria-label="'+escape(label)+'">'+visual+caption+'</figure>';
 }
 function paintThemeAssets(){if(selected!=='theme')return;for(const asset of siteFeatures.assets||[]){if(!asset.enabled||asset.kind!=='theme')continue;const node=[...host.querySelectorAll('[data-theme]')].find(n=>n.dataset.theme===asset.id);if(!node)continue;if(!themeCache.has(asset.id))themeCache.set(asset.id,api(asset.src).catch(()=>null));themeCache.get(asset.id).then(theme=>{if(!node.isConnected||!theme?.colors?.length||!theme.colors.every(c=>/^#[a-f0-9]{6}$/i.test(c)))return;node.style.backgroundImage='linear-gradient('+(Number(theme.angle)||135)+'deg,'+theme.colors.join(',')+')';});}}
 function render(focus=false){const history=document.querySelector('.global-case-history');if(history&&history.nextElementSibling!==host)history.after(host);const catalog=siteFeatures.cosmetics||{},entries=selected==='frames'?Object.entries(siteFeatures.frames||{}):selected==='cans'?Object.entries(siteFeatures.cans||{}).filter(([id])=>siteFeatures.features?.['reward:can-'+id]!==false).map(([id,c])=>[id,c.label]):Object.entries(catalog[selected]||{}).filter(([id])=>selected!=='title'||!['moderator','administrator'].includes(id));const key=JSON.stringify([selected,entries,siteFeatures.assets,state.me?.player?.avatar,state.me?.player?.login]);if(key===lastKey)return;lastKey=key;host.innerHTML='<div class="panel-header"><h2 id="cosmetic-gallery-title">'+escape(categories.find(c=>c[0]===selected)[1])+'</h2></div><div class="cosmetic-example-tabs" role="tablist" aria-label="Разделы косметики">'+categories.map(([id,label])=>'<button type="button" role="tab" id="sample-tab-'+id+'" data-sample-category="'+id+'" aria-controls="cosmetic-examples-grid" aria-selected="'+(selected===id)+'" tabindex="'+(selected===id?'0':'-1')+'">'+label+'</button>').join('')+'</div><div class="cosmetic-examples-grid" id="cosmetic-examples-grid" role="tabpanel" aria-labelledby="sample-tab-'+selected+'" tabindex="0">'+entries.map(([id,label])=>sample(selected,id,label)).join('')+'</div>';paintThemeAssets();if(focus)host.querySelector('[aria-selected="true"]').focus({preventScroll:true});}
 host.addEventListener('click',event=>{
  const preview=event.target.closest('[data-preview-profile]');
  if(preview?.dataset.previewProfile){
   const login=state.me?.player?.login;
   if(login)void openPlayer(login,preview.dataset.previewProfile);
   else notice('Войди через Twitch, чтобы примерить фон на свой профиль.');
   return;
  }
  const tab=event.target.closest('[data-sample-category]');if(!tab)return;selected=tab.dataset.sampleCategory;render(true);});
 host.addEventListener('keydown',event=>{const tab=event.target.closest('[data-sample-category]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const i=categories.findIndex(c=>c[0]===selected);selected=categories[event.key==='Home'?0:event.key==='End'?categories.length-1:(i+(event.key==='ArrowRight'?1:-1)+categories.length)%categories.length][0];render(true);});
 globalThis.renderCosmeticGallery=()=>render();render();
})();
