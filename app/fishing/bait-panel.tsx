'use client';
import {useState} from 'react';
import {Coins} from 'lucide-react';
import {items,rarities,type Player} from '../../lib/fishing/game';
import {baitPrice,isCatFood} from '../../lib/fishing/cat';
import './bait-panel.css';
export default function BaitPanel({player,channel,enabled,demo=false,onDemo,onUpdate}:{player:Player;channel:string;enabled:boolean;demo?:boolean;onDemo?:(command:string)=>void;onUpdate:(p:Player)=>void}){
 const [quantity,setQuantity]=useState(1),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[pending,setPending]=useState<{id:string;command:string}|null>(null);
 const available=items.filter(i=>isCatFood(i.id)&&rarities.indexOf(i.rarity)<=2).reduce((n,i)=>n+(player.inventory[i.id]??0),0);
 async function send(command:string,retry=false){
  if(busy||!enabled)return;if(demo){onDemo?.(command);return;}
  const request=retry&&pending?pending:{id:crypto.randomUUID(),command};setBusy(true);setFailed(false);setMessage('');setPending(request);
  try{const response=await fetch('/api/fishing/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,requestId:request.id,command:request.command}),signal:AbortSignal.timeout(15000)}),result=await response.json() as {player?:Player;message?:string;error?:string};if(!response.ok||!result.player)throw Error(result.error??'Не удалось подтвердить покупку.');onUpdate(result.player);setMessage(result.message??'Готово');setPending(null);}
  catch(error){setFailed(true);setMessage(error instanceof Error&&error.name!=='TimeoutError'&&error.name!=='TypeError'?error.message:'Ответ не получен. Проверь тот же запрос, чтобы не оплатить дважды.');}finally{setBusy(false);}
 }
 return <section className="bait-panel"><header><div><span>ДЛЯ СЛЕДУЮЩЕГО ЗАБРОСА</span><h2>Наживка</h2></div><span className="bait-wallet"><Coins size={16}/>{player.coins.toLocaleString('ru')}</span></header>
 <div className="bait-stock"><img src="/fishing-bait.png" alt="Пиксельная коробочка с наживкой"/><div><span>В твоём запасе</span><strong>{player.bait??0}<small>шт.</small></strong><p>Одна наживка — один усиленный заброс.</p></div></div>
 <div className="bait-quantity"><label htmlFor="bait-quantity">Количество</label><div><button aria-label="Уменьшить количество" disabled={busy||quantity<=1} onClick={()=>setQuantity(n=>n-1)}>−</button><input id="bait-quantity" type="number" min={1} max={20} value={quantity} disabled={busy} onChange={e=>setQuantity(Math.max(1,Math.min(20,Math.trunc(Number(e.target.value)||1))))}/><button aria-label="Увеличить количество" disabled={busy||quantity>=20} onClick={()=>setQuantity(n=>n+1)}>+</button></div><nav aria-label="Быстро выбрать количество">{[1,5,10,20].map(n=><button key={n} aria-pressed={quantity===n} disabled={busy} onClick={()=>setQuantity(n)}>{n} шт.</button>)}</nav></div>
 <div className="bait-options"><article><img src="/fishing-bait.png" alt=""/><span>ЗА МОНЕТЫ</span><h3>Купить готовую</h3><p>{baitPrice} монет за штуку</p><strong>{quantity*baitPrice} <small>монет</small></strong><button className="fish-primary-button" disabled={!enabled||busy||player.coins<quantity*baitPrice} onClick={()=>void send('!купить наживку '+quantity)}>Купить {quantity} шт.</button><small>{player.coins<quantity*baitPrice?'Не хватает '+(quantity*baitPrice-player.coins)+' монет':'Рыбы останутся в садке'}</small></article>
 <article><img src="/fishing-bait.png" alt=""/><span>ИЗ ТВОЕГО САДКА</span><h3>Сделать из рыб</h3><p>5 обычных или необычных за штуку</p><strong>{quantity*5} <small>рыб</small></strong><button className="fish-secondary-button" disabled={!enabled||busy||available<quantity*5} onClick={()=>void send('!обменять наживку '+quantity)}>Обменять на {quantity} шт.</button><small>Подходит {available} рыб · редкие сохранятся</small></article></div>
 <p className="bait-note">Используется автоматически при успешном забросе. Повышает вес редких находок в 1,7 раза, без гарантии редкой рыбы.</p>{!enabled&&<p className="bait-note">Подключи Twitch и выбери работающую рыбалку для покупки.</p>}{message&&<p role={failed?'alert':'status'} className="bait-note">{message}</p>}{failed&&pending&&<button className="fish-secondary-button" disabled={busy} onClick={()=>void send(pending.command,true)}>Проверить тот же запрос</button>}
 </section>;
}
