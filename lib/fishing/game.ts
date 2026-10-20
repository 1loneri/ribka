import {settleCat,catCommand,baitCommand,catSkins,baitPrice,type FishingCat} from './cat';
import {recordPatrolCast,type FishingPatrol} from './patrol';
import {ensureFishingLicense,fishingLicenseReply,licensePrice,type FishingLicense} from './license';
import itemData from './items.json';
import locationData from './locations.json';
import questData from './quests.json';
export const COIN_DIVISOR=10;
export const coinReward=(value:number)=>Math.max(1,Math.floor(value/COIN_DIVISOR));
export const items=itemData.map(item=>({...item,value:coinReward(item.value)}));
export const locations=locationData;
export const quests=questData.map(quest=>({...quest,reward:coinReward(quest.reward)}));
export const rarities=['мусор','обычная','необычная','редкая','эпическая','легендарная','мифическая'];
export const rods=[{level:1,name:'Старая удочка',price:0},{level:2,name:'Улучшенная удочка',price:100},{level:3,name:'Серебряная удочка',price:500},{level:4,name:'Золотая удочка',price:5000},{level:5,name:'VOID-удочка',price:10000}];
export const titles=[{number:6,name:'Легенда морей',price:1000000},{number:7,name:'Покоритель VOID',price:5000000}];
export const naturalEvents=[{id:'storm',name:'Шторм',text:'Редкая рыба встречается чаще',rarity:'редкая',multiplier:1.8},{id:'moon',name:'Лунная ночь',text:'Эпическая рыба встречается чаще',rarity:'эпическая',multiplier:1.8},{id:'void',name:'VOID-разлом',text:'Мифическая рыба встречается чаще',rarity:'мифическая',multiplier:3}];
export const hazardEvents=[{id:'seagulls',name:'Налёт чаек',text:'Чайки утащили 10% монет, от 1 до 25. Рыбы остаются в садке.',rarity:'',multiplier:1},{id:'thieves',name:'Воришки на берегу',text:'Украдено 10% монет, от 1 до 25. Потери списаны один раз.',rarity:'',multiplier:1},{id:'abductors',name:'Живодёры на берегу',text:'Очень редкий налёт: украдены монеты, один живой котик может быть похищен.',rarity:'',multiplier:1}];
export const events=[...naturalEvents,...hazardEvents];
export type FishItem=typeof items[number];
export type FishEvent=typeof events[number];
export type Player={cat?:FishingCat|null;bait?:number;patrol?:FishingPatrol;license?:FishingLicense;coins:number;catches:number;streak:number;lastCatch:number;rod:number;location:string;dailyClaim:number;dailyStreak:number;title:string;inventory:Record<string,number>;questDay:string;progress:Record<string,number>;claimed:string[]};
export const newPlayer=():Player=>({cat:null,bait:0,coins:0,catches:0,streak:0,lastCatch:0,rod:1,location:'lake',dailyClaim:0,dailyStreak:0,title:'',inventory:{},questDay:'',progress:{},claimed:[]});
export function random(){return crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;}
export function probabilities(p:Player,event:FishEvent|null){const l=locations.find(x=>x.id===p.location)??locations[0];const weighted=items.filter(x=>x.id.startsWith(l.id+'_')).map(x=>{const rarity=rarities.indexOf(x.rarity);let weight=x.weight;if(rarity>=3)weight*=1+(l.multiplier-1)*(rarity-2)*.55;else weight/=l.multiplier;if(rarity>=3)weight*=1+([0,0,.15,.35,.60,1][p.rod]??0);if(event?.rarity===x.rarity)weight*=event.multiplier;if((p.bait??0)>0&&rarity>=3)weight*=1.7;return {item:x,weight};});const total=weighted.reduce((s,x)=>s+x.weight,0);return weighted.map(x=>({...x,chance:x.weight/total*100}));}
export type Outcome={state:Player;message:string;changed:boolean;item?:FishItem;chance?:number};
export function play(state:Player,command:string,now=Date.now(),event:FishEvent|null=null,rng:()=>number=random):Outcome{
 const p=structuredClone(state),parts=command.trim().split(/\s+/),cmd=parts[0].toLowerCase(),arg=parts.slice(1).join(' ');const answer=(message:string,changed=false,item?:FishItem,chance?:number)=>({state:p,message,changed,item,chance});
 settleCat(p,p.cat?.clockAt??now,rng,p.cat?.clockAt===undefined?undefined:now);
 if(cmd==='!наживка'||cmd==='!bait')return answer(arg?baitCommand(p,arg):'Наживка: '+(p.bait??0)+' шт. · !купить наживку [1–20] ('+baitPrice+' монет/шт.) · !обменять наживку [1–20] (5 обычных/необычных рыб за штуку).',!!arg);
 if(cmd==='!приют')return answer('Котики: '+catSkins.map(s=>s.name+' — '+s.price).join(' | ')+' монет. Купить: !купить кота Белый.');
 if(['!купить','!buy'].includes(cmd)&&/^наживку(?:\s|$)/i.test(arg))return answer(baitCommand(p,'купить '+arg.trim().split(/\s+/).slice(1).join(' ')),true);
 if(cmd==='!обменять'&&/^наживку(?:\s|$)/i.test(arg))return answer(baitCommand(p,arg.trim().split(/\s+/).slice(1).join(' ')),true);
 if(['!купить','!buy'].includes(cmd)&&/^кота(?:\s|$)/i.test(arg))return answer(catCommand(p,'купить '+arg.trim().split(/\s+/).slice(1).join(' '),p.cat?.clockAt??now),true);
 if(cmd==='!кот'||cmd==='!cat')return answer(catCommand(p,arg,p.cat?.clockAt??now),true);
 const day=new Date(now).toISOString().slice(0,10);if(p.questDay!==day){p.questDay=day;p.progress={};p.claimed=[];}
 if(['!рыба','!рыбалка','!fish'].includes(cmd)){
  if(p.lastCatch&&now-p.lastCatch<20000)return answer('Следующий заброс через '+Math.ceil((20000-now+p.lastCatch)/1000)+' сек.');
  const license=ensureFishingLicense(p,now);if(!license.ok)return answer(license.message);
  const odds=probabilities(p,event);let roll=rng()*100;const pick=odds.find(x=>(roll-=x.chance)<0)??odds[odds.length-1];const baited=(p.bait??0)>0;if(baited)p.bait=(p.bait??0)-1;p.streak=p.lastCatch&&now-p.lastCatch<=120000?p.streak+1:1;p.lastCatch=now;p.catches++;p.coins+=pick.item.value;p.inventory[pick.item.id]=(p.inventory[pick.item.id]??0)+1;
  for(const q of quests)if(q.type==='catches'||q.rarity===pick.item.rarity)p.progress[q.id]=Math.min(q.target,(p.progress[q.id]??0)+1);
  const patrolMessage=recordPatrolCast(p,now,rng);
  return answer('Поймал '+pick.item.name+' · +'+pick.item.value+' монет'+(baited?' · наживка использована':'')+(license.message?' · '+license.message:'')+(patrolMessage?' · '+patrolMessage:''),true,pick.item,pick.chance);
 }
 if(['!купить','!buy'].includes(cmd)){
  const number=Number(arg),rod=rods.find(x=>x.level===number&&x.level>1),title=titles.find(x=>x.number===number);if(title){if(p.title===title.name)return answer('Этот титул уже есть.');if(p.coins<title.price)return answer('Нужно '+title.price+' монет.');p.coins-=title.price;p.title=title.name;return answer('Получен титул «'+title.name+'».',true);}
  if(!rod)return answer('Используй !купить 2–5 для удочек, 6–7 для титулов.');if(p.rod>=rod.level)return answer('Такая удочка или лучше уже есть.');if(rod.level!==p.rod+1)return answer('Сначала купи удочку уровня '+(p.rod+1)+'.');if(p.coins<rod.price)return answer('Нужно '+rod.price+' монет, у тебя '+p.coins+'.');p.coins-=rod.price;p.rod=rod.level;return answer('Куплена '+rod.name+'.',true);
 }
 if(['!локация','!location'].includes(cmd)){
  const aliases:Record<string,string>={'озеро':'lake','море':'sea','глубина':'deep','глубины':'deep','руины':'ruins','затонувшие руины':'ruins','войд':'void'};const l=locations.find(x=>x.id===(aliases[arg.toLowerCase()]??arg.toLowerCase())||x.name.toLowerCase()===arg.toLowerCase());if(!arg)return answer('Твоя локация: '+locations.find(x=>x.id===p.location)?.name);if(!l)return answer('Такой локации нет.');if(p.rod<l.min_rod)return answer('Нужна удочка уровня '+l.min_rod+'.');p.location=l.id;return answer('Локация: '+l.name+'.',true);
 }
 if(['!бонус','!bonus'].includes(cmd)){
  if(p.dailyClaim&&now-p.dailyClaim<86400000)return answer('Следующий бонус через '+Math.ceil((86400000-now+p.dailyClaim)/3600000)+' ч.');p.dailyStreak=p.dailyClaim&&now-p.dailyClaim<=172800000?p.dailyStreak+1:1;const reward=coinReward(Math.min(250+(p.dailyStreak-1)*50,1000));p.coins+=reward;p.dailyClaim=now;return answer('Ежедневный бонус +'+reward+' монет · день '+p.dailyStreak+'.',true);
 }
 if(['!награда','!claim'].includes(cmd)){
  const q=quests.find(x=>x.id===arg);if(!q)return answer('Укажи ID задания: !награда catch_10.');if((p.progress[q.id]??0)<q.target)return answer('Задание ещё не выполнено.');if(p.claimed.includes(q.id))return answer('Награда уже получена.');p.claimed.push(q.id);p.coins+=q.reward;return answer('Награда за задание +'+q.reward+' монет.',true);
 }
 if(['!баланс','!balance'].includes(cmd))return answer(p.coins+' монет · '+p.catches+' уловов · серия '+p.streak+'.');
 if(cmd==='!лицензия')return answer(fishingLicenseReply(p,now));
 if(['!удочка','!rod'].includes(cmd))return answer(rods.find(x=>x.level===p.rod)!.name+' · уровень '+p.rod+'.');
 if(['!инвентарь','!inventory'].includes(cmd))return answer(Object.entries(p.inventory).filter(([,n])=>n>0).slice(0,8).map(([id,n])=>(items.find(x=>x.id===id)?.name??id)+' ×'+n).join(' | ')||'Садок пока пуст.');
 if(['!квесты','!quests'].includes(cmd))return answer(quests.map(q=>q.text+' '+(p.progress[q.id]??0)+'/'+q.target).join(' | '));
 if(['!магазин','!shop'].includes(cmd))return answer(rods.slice(1).map(r=>r.level+'. '+r.name+' — '+r.price).join(' | '));
 if(['!локации','!locations'].includes(cmd))return answer(locations.map(l=>l.name+' · удочка '+l.min_rod+'+ · '+licensePrice(l.id)+' монет / 48 ч.').join(' | '));
 if(['!шанс','!odds'].includes(cmd)){
  const odds=probabilities(p,event),pageSize=4,pages=Math.max(1,Math.ceil(odds.length/pageSize)),page=Number(arg||'1');
  if(arg&&!/^[1-9]\d*$/.test(arg)||!Number.isSafeInteger(page)||page<1||page>pages)return answer('Доступны страницы 1–'+pages+'. Напиши !шанс 1.');
  const location=locations.find(x=>x.id===p.location)??locations[0],rows=odds.slice((page-1)*pageSize,page*pageSize);
  return answer('Шансы · '+location.name+' · стр. '+page+'/'+pages+': '+rows.map(x=>x.item.name+': '+x.chance.toFixed(2)+'%').join(' | ')+(page<pages?' · дальше: !шанс '+(page+1):''));
 }
 if(['!событие','!event'].includes(cmd))return answer(event?event.name+' · '+event.text:'Сейчас событий нет.');
 return answer('');
}
export const commands=['!лицензия','!приют','!обменять','!наживка','!bait','!кот','!cat','!дуэль','!duel','!принять','!accept','!отказ','!decline','!отмена','!cancel','!дуэлистат','!рыба','!рыбалка','!fish','!купить','!buy','!локация','!location','!бонус','!bonus','!награда','!claim','!баланс','!balance','!удочка','!rod','!инвентарь','!inventory','!квесты','!quests','!магазин','!shop','!локации','!locations','!шанс','!odds','!событие','!event','!топ','!top','!титулы','!titles'];
