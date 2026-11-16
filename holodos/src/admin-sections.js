export const adminSections=[
 {key:'overview',path:'/admin',label:'Обзор',description:'Баланс сообщества и основные показатели.',ids:[]},
 {key:'settings',path:'/admin/settings',label:'Включения и награды',description:'Управление доступностью разделов, кейсов и дропа.',ids:['feature-control']},
 {key:'vp',path:'/admin/vp',label:'VP, VIP и магазин',description:'Заявки VP и VIP, призы VP из кейсов, цены и отзывы.',ids:['vp-stock','vp-manual','orders','case-vp-prizes','vip-shop','economy','reviews']},
 {key:'cases',path:'/admin/cases',label:'Кейсы',description:'Покупки, редактор кейсов и остальные призы.',ids:['case-management','case-purchases','case-prizes','cases-editor']},
 {key:'balances',path:'/admin/balances',label:'W-монеты игроков',description:'Поиск баланса, начисление и списание W.',ids:['balances']},
 {key:'cosmetics',path:'/admin/cosmetics',label:'Косметика',description:'Рамки, титулы, оформление ников, темы и банки.',ids:['asset-uploads','appearance','frames','cosmetics']},
 {key:'support',path:'/admin/support',label:'Обращения',description:'Вопросы игроков и ответы администрации.',ids:['support']},
 {key:'twitch',path:'/admin/twitch',label:'Twitch и бот',description:'Подключения, настройки канала и команды.',ids:['twitch-rewards','channel-status','channel-connections','bot-commands','settings']}
];
export function selectAdminContent(body,path='/admin'){
 if(!body.includes('id="overview"'))return body;
 const sections=new Map();let depth=0,start=0,id='',first=-1;
 for(const match of body.matchAll(/<\/?section\b[^>]*>/g)){
  if(match[0].startsWith('</')){if(--depth===0&&id)sections.set(id,body.slice(start,match.index+match[0].length));}
  else{if(depth===0){start=match.index;if(first<0)first=start;id=/\bid="([^"]+)"/.exec(match[0])?.[1]||'';}depth++;}
 }
 if(depth!==0)throw Error('Unbalanced admin sections');
 const group=adminSections.find(s=>s.path===path)||adminSections[0];
 if(group.key==='overview')return body.slice(0,first<0?body.length:first)+'<div class="admin-section-cards">'+adminSections.slice(1).map(s=>'<a href="'+s.path+'"><h2>'+s.label+'</h2><p>'+s.description+'</p><span>Открыть раздел ↗</span></a>').join('')+'</div>';
 return '<header class="admin-heading"><div><div class="admin-eyebrow">ПАНЕЛЬ УПРАВЛЕНИЯ</div><h1>'+group.label+'</h1><p>'+group.description+'</p></div></header>'+group.ids.map(id=>sections.get(id)||'').join('');
}
