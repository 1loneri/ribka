import {readFileSync} from 'node:fs';
import {frameCatalog,frameRarity} from './frames.js';
import {cosmeticCatalog} from './cosmetics.js';
import {duelCanCatalog} from './duel-visuals.js';
const economy=JSON.parse(readFileSync(new URL('./economy-v1.1.json',import.meta.url),'utf8'));
export const casePriceUnits={free:'Бесплатно',donation:'За донат',w:'W-монеты',points:'Баллы канала',messages:'Сообщения',subscriber:'За подписку',vip:'Для VIP-еров'};
export const caseRewardOptions={};
for(const amount of [50,100,250,500,1000,2000,3000,5000,8000,10000,15000])caseRewardOptions['w-'+amount]={label:amount.toLocaleString('ru-RU')+' W',kind:'W-монеты',symbol:'w'};
for(const amount of [240,475,1000])caseRewardOptions['vp-'+amount]={label:amount+' VP',kind:'VP',symbol:'vp'};
caseRewardOptions['vip-month']={label:'VIP на месяц',kind:'VIP канала',symbol:'vip'};
caseRewardOptions.popmart={label:'Фигурка POP MART',kind:'Фигурка',symbol:'physical'};
for(const [id,label] of Object.entries(frameCatalog))caseRewardOptions['frame-'+id]={label,kind:'Рамка',symbol:'frame',frame:id};
for(const [kind,catalog] of Object.entries(cosmeticCatalog))for(const [id,label] of Object.entries(catalog))caseRewardOptions[kind+'-'+id]={label,kind:({title:'Титул',name_color:'Оформление ника',theme:'Цвет сайта'})[kind],symbol:({title:'title',name_color:'name',theme:'theme'})[kind]};
for(const [id,label] of Object.entries(duelCanCatalog))caseRewardOptions['can-'+id]={label,kind:'Банка для дуэлей',symbol:'can',can:id};
const round=n=>Math.round(n*1e6)/1e6;
function moneyRewards(rows){return rows.map(r=>({id:r.kind==='physical'?'popmart':r.kind==='vip'?'vip-month':r.w?'w-'+r.w:'vp-'+parseInt(r.label),weight:round(r.probability*100)}));}
function cosmetics(weights){const mappings={frame_effect:Object.entries(frameRarity).map(([id,r])=>['frame-'+id,r.weight/100]),title:Object.keys(cosmeticCatalog.title).map(id=>['title-'+id,1/8]),nickname_style:Object.keys(cosmeticCatalog.name_color).map(id=>['name_color-'+id,1/5]),site_theme:Object.keys(cosmeticCatalog.theme).map(id=>['theme-'+id,1/3]),duel_can:Object.keys(duelCanCatalog).map(id=>['can-'+id,1/5])};return Object.entries(weights).flatMap(([kind,probability])=>mappings[kind].map(([id,share])=>({id,weight:round(probability*100*share)})));}
function exact(rows){const total=rows.reduce((s,r)=>s+r.weight,0);rows.at(-1).weight=round(rows.at(-1).weight+100-total);return rows;}
export const defaultCases={
 donation:{title:'Подарочный',category:'Подарок',description:'Гарантированные 2 000 W дополнительно к случайной награде: W-монетам, коду VP или фигурке POP MART.',priceAmount:0,priceUnit:'free',guaranteedW:2000,rewards:moneyRewards(economy.caseRewards.donation)},
 twitch:{title:'Баллы Twitch',category:'За баллы канала',description:'Кейс за 10 000 баллов канала. Предпросмотр наград.',priceAmount:10000,priceUnit:'points',rewards:moneyRewards(economy.twitch.theoreticalRewards)},
 chat:{title:'За сообщения',category:'За активность',description:'Общайся в чате. Прогресс копится между стримами. Если VIP уже активен, вместо VIP-награды — 3 000 W.',priceAmount:1500,priceUnit:'messages',rewards:moneyRewards(economy.caseRewards.chat)},
 vip:{title:'VIP',category:'Раз в неделю',description:'Особый кейс для обладателей VIP-значка Twitch. Предпросмотр наград.',priceAmount:0,priceUnit:'vip',rewards:[{id:'w-50',weight:20},{id:'w-100',weight:20},...moneyRewards(economy.caseRewards.vip).map(r=>({...r,weight:round(r.weight*.6)}))]},
 coins:{title:'За W-монеты',category:'За валюту сайта',description:'Косметика и шанс получить 240 VP. За повторную косметику — 1 000 W.',priceAmount:5000,priceUnit:'w',rewards:exact([...cosmetics(economy.coins.cosmeticProbabilities),{id:'vp-240',weight:.1}])},
 subscriber:{title:'За подписку',category:'За подписку Twitch',description:'Каждый месяц подписки: уровень 1 даёт 1 кейс, уровень 2 даёт 2, уровень 3 даёт 3.',priceAmount:0,priceUnit:'subscriber',rewards:exact(cosmetics(economy.subscriber.probabilities))}
};
export function casePriceText(c){if(c.priceUnit==='donation')return c.donationPriceText||'За донат';return ({free:'Бесплатно',donation:'За донат',subscriber:'1 / 2 / 3 кейса в месяц',vip:'Для VIP-еров'})[c.priceUnit]||c.priceAmount.toLocaleString('ru-RU')+' '+({w:'W',points:'баллов',messages:'сообщений'})[c.priceUnit];}
export function createCaseCatalog(db,transaction){
 db.exec(`CREATE TABLE IF NOT EXISTS case_settings(id TEXT PRIMARY KEY,config_json TEXT NOT NULL,revision INTEGER NOT NULL,updated_at INTEGER NOT NULL,updated_by TEXT NOT NULL);CREATE TABLE IF NOT EXISTS case_settings_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,case_id TEXT NOT NULL,revision INTEGER NOT NULL,old_json TEXT NOT NULL,new_json TEXT NOT NULL,actor TEXT NOT NULL,created_at INTEGER NOT NULL);`);
 const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
 function config(id){if(!Object.hasOwn(defaultCases,id))fail('Неизвестный кейс.');const row=db.prepare('SELECT * FROM case_settings WHERE id=?').get(id);return {id,...structuredClone(defaultCases[id]),...(row?JSON.parse(row.config_json):{}),revision:row?.revision||0};}
 function list(){return Object.keys(defaultCases).map(id=>{const c=config(id);return {...c,priceText:casePriceText(c),rewards:c.rewards.map(r=>({...caseRewardOptions[r.id],...r}))};});}
 function save(form,actor){const id=String(form.get('case_id')||'');if(!Object.hasOwn(defaultCases,id))fail('Неизвестный кейс.');const clean=(key,max)=>{const value=String(form.get(key)||'').trim();if(!value||value.length>max||/[\u0000-\u0008\u000b-\u001f]/.test(value))fail('Проверь поле «'+({title:'Название',description:'Описание',category:'Метка'})[key]+'».');return value;};
 const title=clean('title',60),description=clean('description',600),category=clean('category',40),priceUnit=String(form.get('price_unit')),rawPrice=String(form.get('price_amount')??'').trim(),priceAmount=priceUnit==='donation'?0:Number(rawPrice),revision=Number(form.get('revision'));
 if(!Object.hasOwn(casePriceUnits,priceUnit)||!Number.isSafeInteger(priceAmount)||priceAmount<0||priceAmount>10000000||!Number.isSafeInteger(revision)||revision<0)fail('Проверь цену и единицу стоимости.');
 if(priceUnit==='donation'&&(rawPrice.length>40||/[\u0000-\u001f\u007f]/.test(rawPrice)))fail('Подпись цены должна быть не длиннее 40 символов и без переносов строк.');
 const rewards=[];for(const key of form.keys())if(key.startsWith('reward_enabled_')){const rewardId=key.slice(15);if(!Object.hasOwn(caseRewardOptions,rewardId)||rewards.some(r=>r.id===rewardId))fail('Неизвестная или повторяющаяся награда.');const weight=Number(form.get('reward_weight_'+rewardId));if(!Number.isFinite(weight)||weight<=0||weight>100||Math.abs(weight-round(weight))>1e-9)fail('Шанс награды должен быть больше 0 и не больше 100%.');rewards.push({id:rewardId,weight});}
 if(!rewards.length||Math.abs(rewards.reduce((sum,r)=>sum+r.weight,0)-100)>1e-6)fail('Сумма шансов включённых наград должна быть 100%.');
 const value={title,description,category,priceUnit,donationPriceText:priceUnit==='donation'?rawPrice:'',priceAmount:['free','donation','subscriber','vip'].includes(priceUnit)?0:priceAmount,rewards};
 return transaction(()=>{const old=config(id);if(old.revision!==revision)fail('Кейс уже изменён другим администратором. Обнови страницу.',409);const next=revision+1,now=Date.now();db.prepare('INSERT INTO case_settings VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET config_json=excluded.config_json,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(id,JSON.stringify(value),next,now,String(actor));db.prepare('INSERT INTO case_settings_audit(case_id,revision,old_json,new_json,actor,created_at) VALUES(?,?,?,?,?,?)').run(id,next,JSON.stringify(old),JSON.stringify(value),String(actor),now);return {ok:true,revision:next};});
 }
 return {list,save,rewardOptions:caseRewardOptions,priceUnits:casePriceUnits};
}
