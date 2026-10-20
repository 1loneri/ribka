import catalog from './items.json';
import type {Player} from './game';
import {validateCatName} from './cat-names';
export type CatResult={at:number;type:'fish'|'coins'|'fine'|'empty';text:string;itemId?:string};
export type FishingCat={name?:string;clockElapsed?:number;clockAt?:number;paused?:boolean;stolen?:boolean;skin:string;owned:string[];level:number;alive:boolean;active:boolean;fedUntil:number;lastRun:number;finds:number;coinsFound?:number;fines:number;history:CatResult[]};
export const catSkins=[{id:'white',name:'Белый',price:100,col:0,row:0},{id:'tuxedo',name:'Смокинг',price:150,col:3,row:0},{id:'black',name:'Чёрный',price:200,col:0,row:1},{id:'sand',name:'Песочный',price:250,col:3,row:1},{id:'gray',name:'Серый',price:150,col:0,row:2},{id:'brown',name:'Шоколадный',price:250,col:3,row:2},{id:'ginger',name:'Рыжий',price:300,col:0,row:3},{id:'olive',name:'Оливковый',price:400,col:3,row:3}];
export const catUpgradePrices=[0,100,250,500,1000];
export const catIntervals=[0,120,90,60,45,30];
const tiers=['мусор','обычная','необычная','редкая','эпическая','легендарная','мифическая'];
const hour=3600000;
export function catInterval(level:number){return (catIntervals[level]??120)*60000;}
export function settleCat(p:Player,now:number,rng:()=>number,observedAt?:number){
 const cat=p.cat;if(!cat||!cat.alive||!cat.active||cat.paused)return false;
 let changed=false;const stop=Math.min(now,cat.fedUntil),interval=catInterval(cat.level);
 for(let tick=0;tick<24&&cat.lastRun+interval<=stop;tick++){
  const at=cat.lastRun+interval;cat.lastRun=at;changed=true;let result:CatResult;
  const roll=rng();
  if(roll<.08){const amount=Math.min(p.coins,5+cat.level*2);p.coins-=amount;cat.fines+=amount;result={at,type:'fine',text:'Штраф за проказы: −'+amount+' монет'};}
  else if(roll<.22)result={at,type:'empty',text:'Вернулся с пустыми лапками'};
  else if(roll<.34){const amount=1+Math.min(2,Math.floor(rng()*3));p.coins+=amount;cat.coinsFound=(cat.coinsFound??0)+amount;result={at,type:'coins',text:'Нашёл '+amount+' монет'};}
  else{const pool=catalog.filter(i=>i.id.startsWith(p.location+'_')).map(i=>({item:i,weight:i.weight*(tiers.indexOf(i.rarity)>=3?1+cat.level*.3:1)}));const total=pool.reduce((sum,x)=>sum+x.weight,0);let value=rng()*total;const item=pool.find(x=>(value-=x.weight)<0)?.item??pool.at(-1)?.item;
   if(!item)result={at,type:'empty',text:'Не нашёл места для рыбалки'};
   else{p.inventory[item.id]=(p.inventory[item.id]??0)+1;cat.finds++;result={at,type:'fish',itemId:item.id,text:'Принёс '+item.name};}
  }
  cat.history=[observedAt===undefined?result:{...result,at:observedAt},...cat.history].slice(0,8);
 }
 if(now>=cat.fedUntil){cat.alive=false;cat.active=false;changed=true;}
 return changed;
}
const inedible=new Set(['lake_treasure','lake_swan','lake_mermaid','lake_relic','sea_pearl','sea_anchor','sea_mermaid_pearl','deep_crystal','deep_eye','deep_skeleton','deep_artifact','void_artifact','void_star','void_core','void_eye']);
export const isCatFood=(id:string)=>!id.startsWith('ruins_')&&!inedible.has(id)&&catalog.some(i=>i.id===id&&i.rarity!=='мусор');
const availableFish=(p:Player)=>catalog.filter(i=>isCatFood(i.id)&&(p.inventory[i.id]??0)>0).sort((a,b)=>tiers.indexOf(a.rarity)-tiers.indexOf(b.rarity)||a.value-b.value);
function consume(p:Player,id:string,count:number){const left=(p.inventory[id]??0)-count;if(left>0)p.inventory[id]=left;else delete p.inventory[id];}
export const baitPrice=20;
export function baitCommand(p:Player,arg:string):string{
 const parts=arg.trim().toLowerCase().split(/\s+/),buy=['купить','buy'].includes(parts[0]);
 if(buy){
  const count=Number(parts[1]||1);if(parts.length>2||!Number.isInteger(count)||count<1||count>20)return 'Покупка: !наживка купить [1–20].';
  const cost=count*baitPrice;if(p.coins<cost)return 'Нужно '+cost+' монет.';
  p.coins-=cost;p.bait=(p.bait??0)+count;return 'Наживка +'+count+' · −'+cost+' монет · запас '+p.bait+'.';
 }
 const count=Number(arg||1);if(!Number.isInteger(count)||count<1||count>20)return 'Наживка: !наживка [1–20]. На штуку нужно 5 обычных/необычных рыб.';
 const fish=availableFish(p).filter(i=>tiers.indexOf(i.rarity)<=2),need=count*5,total=fish.reduce((n,i)=>n+(p.inventory[i.id]??0),0);
 if(total<need)return 'Нужно '+need+' обычных/необычных рыб. У тебя '+total+'.';
 let remaining=need;for(const item of fish){const used=Math.min(remaining,p.inventory[item.id]??0);consume(p,item.id,used);remaining-=used;if(!remaining)break;}
 p.bait=(p.bait??0)+count;return 'Наживка +'+count+' · запас '+p.bait+'. Следующий заброс усилен.';
}
export function catCommand(p:Player,arg:string,now:number):string{
 const [action,value]=arg.trim().toLowerCase().split(/\s+/);const cat=p.cat;
 if(!action){if(!cat)return 'Котика нет. !приют · !купить кота Белый · 100 монет.';if(!cat.alive)return (cat.name?'Кот «'+cat.name+'»':'Котик')+(cat.stolen?' похищен.':' погиб от голода.')+' Новый: !кот новый · 100 монет.';return 'Кот '+(cat.name?'«'+cat.name+'»':catSkins.find(s=>s.id===cat.skin)?.name)+' · ур. '+cat.level+' · '+(cat.active?(cat.paused?'вне эфира · пауза · запас ':'сыт ещё ')+Math.ceil((cat.fedUntil-now)/60000)+' мин':'ждёт первого кормления')+' · !кот корм';}
 if(action==='купить'||action==='buy'){
  const skin=catSkins.find(s=>s.id===value||s.name.toLowerCase().replace(/ё/g,'е')===value?.replace(/ё/g,'е'));if(!skin)return 'Расцветки: '+catSkins.map(s=>s.name).join(', ')+'. !приют';
  if(cat&&!cat.alive)return (cat.stolen?'Котик похищен.':'Котик погиб.')+' Сначала !кот новый · 100 монет.';
  const price=cat?.owned.includes(skin.id)?0:skin.price;if(p.coins<price)return 'Нужно '+price+' монет.';
  p.coins-=price;if(!cat)p.cat={skin:skin.id,owned:[skin.id],level:1,alive:true,active:false,fedUntil:0,lastRun:0,finds:0,coinsFound:0,fines:0,history:[]};else{cat.skin=skin.id;if(!cat.owned.includes(skin.id))cat.owned.push(skin.id);}
  return 'Кот '+skin.name+(price?' · −'+price+' монет':' · расцветка выбрана')+'.'+(!cat?' Активируй: !кот корм.':'');
 }
 if(action==='новый'||action==='new'){
  if(cat?.alive)return 'У тебя уже есть живой котик.';if(p.coins<100)return 'Нужно 100 монет.';p.coins-=100;
  p.cat={skin:cat?.skin??'white',owned:cat?.owned??['white'],level:1,alive:true,active:false,fedUntil:0,lastRun:0,finds:0,coinsFound:0,fines:0,history:[]};return 'Новый котик · −100 монет. Первое кормление: !кот корм.';
 }
 if(!cat)return 'Сначала купи котика: !приют · !купить кота Белый.';
 if(!cat.alive)return (cat.stolen?'Котик похищен.':'Котик погиб.')+' Новый: !кот новый · 100 монет.';
 if(action==='корм'||action==='feed'){
  const fish=availableFish(p),item=value?fish.find(i=>i.id===value):fish[0];if(!item)return 'В садке нет подходящей рыбы. Мусором кормить нельзя.';
  if(cat.active&&cat.fedUntil>=now+12*hour-1000)return 'Котик сыт на 12 часов. Кормить пока не нужно.';
  const nutrition=Math.min(8,3+Math.max(0,tiers.indexOf(item.rarity)-1))*hour;consume(p,item.id,1);
  if(!cat.active){cat.active=true;cat.lastRun=now;}cat.fedUntil=Math.min(now+12*hour,Math.max(now,cat.fedUntil)+nutrition);
  return 'Котик съел '+item.name+' · сыт ещё '+Math.ceil((cat.fedUntil-now)/hour)+' ч.';
 }
 if(action==='улучшить'||action==='upgrade'){
  if(cat.level>=5)return 'Котик уже максимального уровня.';const price=catUpgradePrices[cat.level];if(p.coins<price)return 'Нужно '+price+' монет.';
  p.coins-=price;cat.level++;if(cat.active)cat.lastRun=now;return 'Котик ур. '+cat.level+' · −'+price+' монет. Вылазки каждые '+catIntervals[cat.level]+' мин.';
 }
 if(cat.level<5)return 'Имя открывается на 5 уровне. Улучшение: !кот улучшить.';
 const candidate=action==='имя'?arg.trim().split(/\s+/).slice(1).join(' '):arg;const checked=validateCatName(candidate);if(checked.error)return checked.error;cat.name=checked.name;return 'Котика теперь зовут «'+cat.name+'».';
}
