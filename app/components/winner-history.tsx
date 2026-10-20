'use client';
import {useEffect,useState} from 'react';
export type WinnerRecord={id:string;giveaway:string;channel:string;title:string;prize:string;name:string;chosen_at:number;deadline:number|null;confirmed_at:number|null;state:string;display_state:string;paid:number};
export function WinnerRows({rows,manage=false,busy=false,allowReroll=true,onAction}:{rows:WinnerRecord[];manage?:boolean;busy?:boolean;allowReroll?:boolean;onAction?:(body:Record<string,unknown>)=>void}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
 return <div className="winner-records">{rows.length?rows.map(row=>{
  const state=row.state==='awaiting'&&row.deadline&&row.deadline<=now?'expired':row.state;
  const label=state==='awaiting'?'Ждём !тут · '+Math.min(60,Math.max(0,Math.ceil(((row.deadline??now)-now)/1000)))+' с':state==='confirmed'?'Присутствие подтверждено':state==='expired'?'Не ответил вовремя':state==='replaced'?'Перевыбран':'Победитель';
  return <article className={'winner-record record-'+state} key={row.id}><div><a href={'/giveaways/'+row.giveaway}><strong>{row.name}</strong></a><span>{row.prize} · @{row.channel}</span><small>{new Date(row.chosen_at).toLocaleString('ru-RU')} · {row.title}</small><p role={state==='awaiting'?'status':undefined}>{label}{!!row.paid&&' · Приз выдан'}</p></div>{manage&&onAction&&<div className="winner-record-actions">{state==='expired'&&!allowReroll&&<a className="secondary" href={'/studio/'+row.giveaway}>Открыть пульт</a>}{state==='expired'&&allowReroll&&<button className="secondary" disabled={busy} onClick={()=>{if(window.confirm('Победитель не написал !тут вовремя. Выбрать другого участника?'))onAction({action:'reroll',id:row.giveaway,winnerId:row.id});}}>Перевыбрать</button>}{(state==='selected'||state==='confirmed')&&<button className="secondary" disabled={busy} onClick={()=>onAction({action:'paid',id:row.giveaway,winnerId:row.id,paid:!row.paid})}>{row.paid?'Отменить отметку':'Приз выдан'}</button>}</div>}</article>;
 }):<p className="winner-history-empty">Победителей пока нет. Здесь появятся результаты розыгрышей.</p>}</div>;
}
export default function WinnerHistory({channel}:{channel:string}){
 const [rows,setRows]=useState<WinnerRecord[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){const response=await fetch('/api/giveaways?history=1&channel='+encodeURIComponent(channel),{cache:'no-store'}),data=await response.json() as {history:WinnerRecord[];error?:string};if(!response.ok)throw Error(data.error);setRows(data.history);}
 useEffect(()=>{let alive=true;setRows([]);setError('');const refresh=()=>load().catch(e=>{if(alive)setError(e.message);});void refresh();const timer=setInterval(refresh,10000);return()=>{alive=false;clearInterval(timer);};},[channel]);
 async function act(body:Record<string,unknown>){setBusy(true);setError('');try{const response=await fetch('/api/giveaways',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json() as {error?:string};if(!response.ok)throw Error(data.error);await load();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="winner-history"><h2>История победителей</h2><p className="field-hint">Последние 500 результатов выбранного канала. Отмечай выданные призы здесь.</p>{error&&<p className="error" role="alert">{error}</p>}<WinnerRows rows={rows} manage busy={busy} allowReroll={false} onAction={body=>void act(body)}/></section>;
}
