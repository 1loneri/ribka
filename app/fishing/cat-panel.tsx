'use client';
import {useState,useEffect} from 'react';
import {Heart,Coins,Fish,Clock,Skull,ShieldAlert} from 'lucide-react';
import {items,rarities,type Player} from '../../lib/fishing/game';
import {catSkins,catUpgradePrices,catIntervals,catInterval,isCatFood} from '../../lib/fishing/cat';
import './cat-panel.css';
import atlasFrames from './cat-atlas-frames.json';
import CatRoomDecor from './cat-room-decor';
import {validateCatName} from '../../lib/fishing/cat-names';
function CatSprite({skin,walking=false}:{skin:string;walking?:boolean}){
 const chosen=catSkins.find(s=>s.id===skin)??catSkins[0],[frame,setFrame]=useState(0);
 useEffect(()=>{setFrame(0);if(!walking)return;const timer=setInterval(()=>setFrame(n=>(n+1)%3),300);return()=>clearInterval(timer);},[walking,skin]);
 return <span className="fishing-cat-sprite" style={{backgroundPosition:`-${(chosen.col+frame)*48}px -${chosen.row*48}px`}} aria-label={'Кот '+chosen.name}/>;
}
function AtlasFrame({kind,row,frame,className=''}:{kind:'details'|'sitting';row:number;frame:number;className?:string}){
 const atlas=atlasFrames[kind],[x,y,width,height]=atlas.frames[row][frame];
 const canvasWidth=kind==='sitting'?Math.max(...atlas.frames[row].map(f=>f[2])):width,canvasHeight=kind==='sitting'?Math.max(...atlas.frames[row].map(f=>f[3])):height;
 return <svg aria-hidden="true" className={'cat-atlas-frame '+className} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}><svg x={(canvasWidth-width)/2} y={canvasHeight-height} width={width} height={height} viewBox={`${x} ${y} ${width} ${height}`} style={{overflow:'hidden'}}><image href={kind==='details'?'/cat-details-v1.png':'/cat-sitting-yawn-v1.png'} width={atlas.width} height={atlas.height}/></svg></svg>;
}
function SittingCat({skin,animate=true}:{skin:string;animate?:boolean}){
 const row=Math.max(0,catSkins.findIndex(s=>s.id===skin)),name=catSkins[row].name;
 return <span role="img" aria-label={'Сидящий котик '+name} className={'fishing-cat-sprite cat-sitting-sprite'+(animate?' cat-sitting-animated':'')}>{[0,1,2,3].map(frame=><AtlasFrame key={frame} kind="sitting" row={row} frame={frame} className={'cat-sit-frame-'+frame}/>)}</span>;
}
function CatDetail({skin,part=0,className=''}:{skin:string;part?:0|1|2|3;className?:string}){
 const row=Math.max(0,catSkins.findIndex(s=>s.id===skin));
 return <span aria-hidden="true" className={'cat-detail-icon '+className}><AtlasFrame kind="details" row={row} frame={part}/></span>;
}
function CatPortrait({skin,happy=false}:{skin:string;happy?:boolean}){
 return <span className={'cat-detail-portrait'+(happy?' is-happy':'')}><CatDetail skin={skin} part={0} className="cat-face-neutral"/><CatDetail skin={skin} part={1} className="cat-face-happy"/></span>;
}
export default function CatPanel({player,channel,enabled,demo=false,onDemo,onUpdate}:{player:Player;channel:string;enabled:boolean;demo?:boolean;onDemo?:(command:string)=>void;onUpdate:(p:Player)=>void}){
 const [now,setNow]=useState(Date.now()),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[food,setFood]=useState(''),[nickname,setNickname]=useState('');
 const [pending,setPending]=useState<{id:string;command:string}|null>(null);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 const cat=player.cat,catNow=cat?.clockAt??now,alive=!!cat?.alive&&(!cat.active||cat.fedUntil>catNow),remaining=cat?.active?Math.max(0,cat.fedUntil-catNow):0;
 const fish=items.filter(i=>isCatFood(i.id)&&(player.inventory[i.id]??0)>0).sort((a,b)=>rarities.indexOf(a.rarity)-rarities.indexOf(b.rarity)||a.value-b.value);
 const chosenFood=fish.find(i=>i.id===food)??fish[0];
 useEffect(()=>setNickname(cat?.name??''),[cat?.name]);
 async function send(command:string,retry=false){
  if(busy)return;if(demo){onDemo?.(command);return;}if(!enabled)return;
  const request=retry&&pending?pending:{id:crypto.randomUUID(),command};setBusy(true);setFailed(false);setMessage('');setPending(request);
  try{const response=await fetch('/api/fishing/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,requestId:request.id,command:request.command}),signal:AbortSignal.timeout(15000)}),result=await response.json() as {player?:Player;message?:string;error?:string};if(!response.ok||!result.player)throw Error(result.error??'Не удалось подтвердить действие.');onUpdate(result.player);setMessage(result.message??'Готово');setPending(null);}
  catch(error){setFailed(true);setMessage(error instanceof Error&&error.name!=='TimeoutError'&&error.name!=='TypeError'?error.message:'Ответ не получен. Повтори этот же запрос, чтобы проверить результат.');}
  finally{setBusy(false);}
 }
 const hours=Math.floor(remaining/3600000),minutes=Math.floor(remaining%3600000/60000),status=!cat?'Найди своего котика':!alive?(cat.stolen?'Котик похищен':'Котик погиб от голода'):!cat.active?'Ждёт первого кормления':cat.paused?'Вне эфира · котик отдыхает':remaining<3600000?'Котик скоро проголодается':'Котик на рыбалке';
 const next=cat?.active&&alive?Math.max(0,Math.ceil((cat.lastRun+catInterval(cat.level)-catNow)/60000)):0;
 return <section className="fishing-cat-panel">
  <div className="cat-panel-title"><div><span>КОМПАНЬОН</span><h2>{cat?.name??'Мой котик'}</h2></div><span><Coins size={14}/>{player.coins.toLocaleString('ru')}</span></div>
  <div className={'cat-home'+(!alive&&cat?' cat-is-dead':'')}><div className="cat-sprite-room cat-furnished-room"><CatRoomDecor full={alive&&!!cat?.active&&remaining>0}/>{cat?.stolen?<ShieldAlert size={36}/>:<SittingCat skin={cat?.skin??'white'} animate={!cat||alive}/>}{cat&&!alive&&!cat.stolen&&<Skull className="cat-dead-icon" size={22}/>}</div><div className="cat-home-info"><div className="cat-personality-heading">{(!cat||alive)&&<CatPortrait skin={cat?.skin??'white'} happy={!!cat?.active&&alive&&remaining>=3600000}/>}<strong>{status}</strong></div><p>{!cat?'Купи расцветку ниже, затем покорми рыбой.':!alive?'Можно завести нового. Купленные расцветки сохранятся.':!cat.active?'Пока не покормлен впервые, не ловит и не голодает.':'Уловы добавляются в твой садок, штрафы списываются с монет.'}</p>{cat&&<span className="cat-level">Уровень {cat.level}/5 · {catSkins.find(s=>s.id===cat.skin)?.name}</span>}</div></div>
  {cat&&alive&&<><div className="cat-hunger"><div><span><Heart size={14}/>Сытость</span><strong>{cat.active?hours+' ч '+minutes+' мин':'Не активирован'}</strong></div><progress max={12*3600000} value={remaining}/><small>Одна рыба даёт 3–8 часов эфира, запас — до 12 часов. Вне стрима сытость и вылазки на паузе. Без еды во время эфира котик погибнет.</small></div><div className="cat-feed"><label htmlFor="cat-food">Рыба для кормления</label><select id="cat-food" value={chosenFood?.id??''} onChange={e=>setFood(e.target.value)} disabled={!fish.length||busy}>{fish.length?fish.map(i=><option key={i.id} value={i.id}>{i.name} ×{player.inventory[i.id]} · {i.rarity}</option>):<option value="">В садке нет рыбы</option>}</select><button className="fish-primary-button" disabled={!enabled||busy||!chosenFood||remaining>=12*3600000-1000} onClick={()=>void send('!кот корм '+chosenFood!.id)}>Покормить · 1 рыбка</button></div><div className="cat-activity-summary"><span><Clock size={14}/>{cat.active?cat.paused?'Вылазки возобновятся в эфире':'Следующая вылазка: '+next+' мин':'Вылазки после первого кормления'}</span><span><Fish size={14}/>{cat.finds} находок</span><span><Coins size={14}/>{cat.coinsFound??0} монет найдено</span></div><button className="fish-secondary-button cat-upgrade" disabled={!enabled||busy||cat.level>=5||player.coins<catUpgradePrices[cat.level]} onClick={()=>void send('!кот улучшить')}>{cat.level>=5?'Максимальный уровень':'Улучшить · '+catUpgradePrices[cat.level]+' монет'}</button><p className="cat-rule">Вылазка раз в {catIntervals[cat.level]} мин. Улучшение ускоряет вылазки и повышает шансы редких находок. Иногда приносит 1–3 монеты. Возможны мусор, пустые лапки и штраф 7–15 монет.</p></>}
  {cat&&!alive&&<button className="fish-primary-button" disabled={!enabled||busy||player.coins<100} onClick={()=>void send('!кот новый')}>Завести нового · 100 монет</button>}
  {cat&&alive&&<div className="cat-name-section">{cat.level>=5?<form onSubmit={e=>{e.preventDefault();const checked=validateCatName(nickname);if(checked.error){setMessage(checked.error);return;}void send('!кот '+checked.name);}}><label htmlFor="cat-nickname">Имя котика <span>5 уровень</span></label><div><input id="cat-nickname" value={nickname} maxLength={20} placeholder="Например, Мурка" onChange={e=>setNickname(e.target.value)} disabled={!enabled||busy}/><button className="fish-secondary-button" disabled={!enabled||busy||!nickname.trim()||nickname.trim()===cat.name}>Назвать</button></div><small>2–20 букв · без мата и запрещённых слов</small></form>:<p>Имя котика откроется на 5 уровне · сейчас {cat.level}/5</p>}</div>}
  <div className="cat-skins-heading"><h3>Расцветки</h3><span>Покупаются за монеты сайта</span></div><div className="cat-skin-shop">{catSkins.map(s=>{const owned=!!cat?.owned.includes(s.id),selected=cat?.skin===s.id;return <button key={s.id} className={selected?'selected':''} disabled={!enabled||busy||!!cat&&!alive||(!owned&&player.coins<s.price)} onClick={()=>void send('!купить кота '+s.name)}><CatPortrait skin={s.id} happy={selected&&alive}/><strong>{s.name}</strong><span className="cat-detail-pair"><span title="Лапка"><CatDetail skin={s.id} part={2}/></span><span title="Хвостик"><CatDetail skin={s.id} part={3}/></span></span><small>{selected?'Выбрана':owned?'Выбрать':s.price+' монет'}</small></button>;})}</div>
  {!!cat?.history.length&&<div className="cat-expeditions"><h3>Последние вылазки</h3>{cat.history.map((entry,i)=><div key={entry.at+':'+i} className={'cat-result-'+entry.type}><time>{new Date(entry.at).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}</time><span>{entry.text}</span></div>)}</div>}
  {!enabled&&!demo&&<p className="cat-rule">Подключи свой Twitch и выбери работающую рыбалку, чтобы покупать и кормить котика.</p>}
  <p className="cat-rule">Учитывается только подтверждённое время эфира. Если статус Twitch неизвестен, котик остаётся на паузе. Уловы котика не начисляют монеты за заброс и не увеличивают серию.</p>
  {message&&<p className={'cat-action-message'+(failed?' is-error':'')} role={failed?'alert':'status'}>{message}</p>}{failed&&pending&&<button className="fish-secondary-button" disabled={busy} onClick={()=>void send(pending.command,true)}>Проверить тот же запрос</button>}
 </section>;
}

export function CatReminder({player,now,onOpen}:{player:Player;now:number;onOpen:()=>void}){
 const cat=player.cat,catNow=cat?.clockAt??now,alive=!!cat?.alive&&(!cat.active||cat.fedUntil>catNow),left=cat?.active?Math.max(0,cat.fedUntil-catNow):0;
 const label=!cat?'Заведи котика':!alive?(cat.stolen?'Котик похищен':'Котик погиб'):!cat.active?'Первое кормление ждёт тебя':cat.paused?'Вне эфира · сытость на паузе':left<3600000?'Пора покормить':'Сыт ещё '+Math.floor(left/3600000)+' ч '+Math.floor(left%3600000/60000)+' мин';
 return <section className={'cat-reminder'+(cat?.active&&!cat.paused&&left<3600000?' cat-needs-food':'')} aria-label="Напоминание о котике"><div className="cat-reminder-heading"><strong>{cat?.name??'Мой котик'}</strong><span>{label}</span></div><div className="cat-reminder-track cat-furnished-room"><CatRoomDecor full={alive&&!!cat?.active&&left>0}/><div className={alive?'cat-reminder-walker':'cat-reminder-waiter'}>{cat?.stolen?<ShieldAlert size={28}/>:<CatSprite skin={cat?.skin??'white'} walking={alive}/>}</div>{(!cat||alive)&&<span className="cat-reminder-details"><CatDetail skin={cat?.skin??'white'} part={left>=3600000?1:0}/><CatDetail skin={cat?.skin??'white'} part={2}/><CatDetail skin={cat?.skin??'white'} part={3}/></span>}</div><div className="cat-reminder-bottom"><small>{!cat?'Покупка и расцветки за монеты':!alive?'Вылазки остановлены':!cat.active?'Пока не активирован':'Ур. '+cat.level+' · '+cat.finds+' находок'}</small><button className="fish-secondary-button" onClick={onOpen}>{alive?'Перейти покормить':'Открыть котика'}</button></div></section>;
}
