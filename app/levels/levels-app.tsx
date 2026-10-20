'use client';
import {useCallback,useEffect,useRef,useState,type CSSProperties} from 'react';
import {ArrowUpRight,Check,Copy,MessageSquare,MonitorPlay,Settings2} from 'lucide-react';
import {communityHref,type LevelView} from '../../lib/community/navigation';
import LevelProfile from './level-profile';
import LevelSeason from './level-season';
import {DEFAULT_APPEARANCE,LEVEL_RULES,progressFor,type LevelAppearance,type LevelProgress} from '../../lib/levels/rules';
import {overlayStyles} from '../../lib/levels/overlay';
import {OVERLAY_ROLES} from '../../lib/levels/roles';
import {OVERLAY_FONTS,overlayFontFor} from '../../lib/levels/fonts';
import './levels.css';
type Viewer=LevelProgress&{title:{id:string;name:string;level:number}|null;userId:string;login:string;name:string;messages:number;streamMessages:number;earned:number};
type Snapshot={enabled:boolean;appearance:LevelAppearance;streamLive:boolean;connected:boolean;collectorUntil:number;streamId:string;leaders:Viewer[];me:Viewer|null;stats:{viewers:number;messages:number;totalMessages:number}};
type Data={user:{name:string}|null;admin:boolean;canStream:boolean;channels:{channel:string;name:string}[];managed:string[];channel:string;canManage:boolean;configured:boolean;identity:{username:string}|null;snapshot:Snapshot|null;error:string|null};
const count=(n:number)=>n.toLocaleString('ru-RU');
function Progress({value,large=false}:{value:LevelProgress;large?:boolean}){return <div className={'level-progress'+(large?' is-large':'')}><div className="level-progress-label"><span>Уровень {value.level}</span><span>{count(value.progress)} <i>/ {count(value.needed)}</i></span></div><div className="level-progress-track" role="progressbar" aria-label="Прогресс до следующего уровня" aria-valuemin={0} aria-valuemax={value.needed} aria-valuenow={value.progress}><span style={{width:value.percent+'%'}}/></div></div>;}
function DemoEmote(){const [failed,setFailed]=useState(false);return failed?<>Kappa</>:<img className="wl-emote" src="https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0" alt="Kappa" title="Kappa" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;}
function DemoChat({appearance,channel,compact=false}:{appearance:LevelAppearance;channel:string;compact?:boolean}){
 const [promoted,setPromoted]=useState(false);
 const messages=[{name:'kira',text:'этот момент надо было видеть',xp:1900,role:'viewer' as const},{name:'neon',text:'я тут с самого начала стрима',xp:740,role:'moderator' as const},{name:'danya',text:promoted?'ну всё, новый уровень':'ещё одно сообщение до второго уровня',xp:promoted?LEVEL_RULES.first:LEVEL_RULES.first-1,role:'vip' as const}];
 return <><div className="wl-root" style={{'--wl-accent':appearance.accent,'--wl-opacity':appearance.opacity/100,'--wl-font':(compact?Math.min(appearance.fontSize,17):appearance.fontSize)+'px','--wl-family':overlayFontFor(appearance.fontFamily).family} as CSSProperties}><header className="wl-heading"><span>ЧАТ</span><strong>@{channel||'твой_канал'}</strong></header><div className="wl-messages">{messages.slice(compact?-2:-appearance.messages).map(m=>{const p=progressFor(m.xp);return <article key={m.name+String(promoted)} className={'wl-message wl-role-'+m.role+(promoted&&m.name==='danya'?' wl-level-up':'')}><div className="wl-message-head"><span className="wl-badge">LV {p.level}</span><strong className="wl-name">{m.name}</strong>{m.role!=='viewer'&&<span className="wl-role-badge" title={OVERLAY_ROLES[m.role].name}>{OVERLAY_ROLES[m.role].label}</span>}</div><p className="wl-text">{m.text}{m.name==='neon'&&<> <DemoEmote/></>}</p></article>;})}</div></div><button type="button" className="level-preview-trigger" onClick={()=>setPromoted(x=>!x)}>{promoted?'Вернуть пример':'Показать повышение уровня'} <ArrowUpRight size={13}/></button></>;
}
type Props={channel:string;view:LevelView|'profile';profileId:string;onNavigate:(view:LevelView|'profile',id?:string)=>void};
export default function LevelsApp({channel,view:tab,profileId:viewedProfile,onNavigate}:Props){
 const [data,setData]=useState<Data|null>(null),[appearance,setAppearance]=useState<LevelAppearance>(DEFAULT_APPEARANCE),[dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[mode,setMode]=useState<'demo'|'live'>('demo'),[origin,setOrigin]=useState(''),[copied,setCopied]=useState(false);
 const dirtyRef=useRef(false),request=useRef(0);
 const load=useCallback(async(signal?:AbortSignal)=>{
  const revision=++request.current,response=await fetch('/api/levels'+(channel?'?channel='+encodeURIComponent(channel):''),{cache:'no-store',signal});const next=await response.json() as Data;if(!response.ok)throw Error(next.error||'Не удалось загрузить уровни.');if(revision!==request.current)return;setData(next);setError('');if(!dirtyRef.current)setAppearance(next.snapshot?.appearance??DEFAULT_APPEARANCE);
 },[channel]);
 useEffect(()=>{setOrigin(window.location.origin);},[]);
 useEffect(()=>{const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;let stopped=false;async function poll(){try{await load(abort.signal);}catch(e){if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Не удалось обновить данные.');}if(!stopped)timer=setTimeout(poll,5000);}void poll();return()=>{stopped=true;abort.abort();clearTimeout(timer);};},[load]);
 const selected=data?.channel??channel,snapshot=data?.snapshot;
 function changeAppearance(next:LevelAppearance){dirtyRef.current=true;setDirty(true);setAppearance(next);setNotice('');}
 async function save(enabled:boolean){if(!selected||busy)return;setBusy(true);setError('');setNotice('');try{const response=await fetch('/api/levels',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:selected,enabled,appearance})}),body=await response.json() as {error?:string};if(!response.ok)throw Error(body.error||'Не удалось сохранить.');dirtyRef.current=false;setDirty(false);await load();setNotice(enabled?'Настройки сохранены.':'Учёт сообщений выключен. Прогресс сохранён.');}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить.');}finally{setBusy(false);}}
 const overlayPath='/overlay/levels?channel='+encodeURIComponent(selected),overlayUrl=selected&&origin?origin+overlayPath:'';
 async function copy(){try{await navigator.clipboard.writeText(overlayUrl);setCopied(true);setTimeout(()=>setCopied(false),2200);}catch{setError('Не удалось скопировать. Выдели ссылку и скопируй её вручную.');}}
 const own=snapshot?.me??progressFor(0);
 function selectTab(next:LevelView|'profile',id=''){onNavigate(next,id);}
 const status=!snapshot?.enabled?'Уровни выключены':!snapshot.connected?'Подключаем чат':snapshot.streamLive?'В эфире':'Эфир не идёт';
 return <>
  <style>{overlayStyles}</style>
  <div className="levels-page community-levels">
   {tab!=='profile'&&<div className="levels-toolbar">
    <div className="levels-tabs" role="tablist" aria-label="Раздел уровней">
     <button role="tab" aria-selected={tab==='overview'} aria-controls="level-overview" id="tab-overview" onClick={()=>selectTab('overview')}>Прогресс</button>
     <button role="tab" aria-selected={tab==='overlay'} aria-controls="level-overlay" id="tab-overlay" onClick={()=>selectTab('overlay')}>Оверлей OBS <ArrowUpRight size={14}/></button>
     <button role="tab" aria-selected={tab==='season'} aria-controls="level-season" id="tab-season" onClick={()=>selectTab('season')}>Топ месяца</button>
    </div>
    {data&&selected&&<div className="level-connection-controls">
     <span className="level-status"><i className={snapshot?.connected&&snapshot.enabled?'is-on':''}/>{status}</span>
     {data.canManage&&(!data.configured?<a className="level-action" href={'/api/twitch/connect?'+new URLSearchParams({return_to:communityHref('levels',selected,tab),...(data.managed[0]!==selected?{purpose:'bot'}:{})})}>Подключить Twitch <ArrowUpRight size={14}/></a>:<button className={'level-action'+(!snapshot?.enabled?' is-primary':'')} disabled={busy} aria-pressed={!!snapshot?.enabled} onClick={()=>void save(!snapshot?.enabled)}>{busy?'Сохраняем…':snapshot?.enabled?'Выключить учёт':'Включить уровни'}</button>)}
    </div>}
   </div>}
   {error&&<p role="alert" className="level-notice is-error">{error}</p>}
   {notice&&<p role="status" className="level-notice">{notice}</p>}
   {data?.canManage&&data.error&&<p className="level-notice is-error" role="alert">{data.error}</p>}
   {!data&&!error&&<div className="levels-loading" role="status">Загружаем уровни…</div>}
   {data&&!selected&&<div className="levels-empty">Пока нет подключённых каналов.</div>}
   {data&&selected&&<>
    {tab!=='profile'&&data.canManage&&snapshot?.enabled&&<p className="level-collector-hint">Оставь вкладку открытой во время эфира для учёта сообщений.</p>}
    {tab==='season'?<section role="tabpanel" id="level-season" aria-labelledby="tab-season"><LevelSeason key={selected} channel={selected} onProfile={id=>selectTab('profile',id)}/></section>:tab==='profile'?<section role="tabpanel" id="level-profile" aria-labelledby="community-tab-profile"><LevelProfile channel={selected} viewerId={viewedProfile} onOwnProfile={()=>selectTab('profile')}/></section>:tab==='overview'?<section role="tabpanel" id="level-overview" aria-labelledby="tab-overview">
     <div className="level-summary">
      <div className="level-personal">
       <div className="level-personal-badge"><strong>{String(own.level).padStart(2,'0')}</strong><span>уровень</span></div>
       <div className="level-personal-body">
        <div className="level-personal-title"><div><span className="levels-kicker">ТВОЙ ПРОГРЕСС</span><h2><button className="level-open-profile" onClick={()=>selectTab('profile')}>{data.identity?'@'+data.identity.username:'Твой Twitch'} <ArrowUpRight size={13}/></button></h2></div><span className="level-next">Далее LV {own.level+1}</span></div>
        <Progress value={own} large/>
        {data.identity?<p className="level-remaining">Ещё <strong>{count(own.remaining)}</strong> опыта до повышения.</p>:<a className="level-connect" href={'/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:communityHref('levels',selected)})} target="_top">Подключи Twitch, чтобы увидеть свой прогресс <ArrowUpRight size={13}/></a>}
       </div>
      </div>
      <div className="level-stream-stats" aria-label="Статистика сообщений чата">
       <div><span>Всего сообщений</span><strong>{count(snapshot?.stats.totalMessages??0)}</strong><small>за всё время</small></div>
       <div><span>Сообщений за стрим</span><strong>{count(snapshot?.stats.messages??0)}</strong><small>{snapshot?.streamId?snapshot.streamLive?'текущий эфир':'последний эфир':'эфир ещё не начался'}</small></div>
      </div>
     </div>
     <div className="level-rules-bar"><span><b>1</b> сообщение = 1 опыт</span><details><summary>Как растёт уровень</summary><p>Для первого повышения нужно {count(LEVEL_RULES.first)} опыта, для каждого следующего на {count(LEVEL_RULES.step)} больше. Каждое сообщение зрителя во время эфира даёт 1 опыт, включая команды, повторы и эмоуты. Сообщения ботов не учитываются. Уровень сохраняется между стримами.</p></details></div>
     <div className="levels-overview">
      <div className="level-community">
       <div className="level-section-heading"><h2>Зрители</h2><span>{snapshot?.leaders.length?count(snapshot.leaders.length)+' в топе':'Рейтинг канала'}</span></div>
       <div className="level-table-head"><span>Зритель</span><span>Сообщения</span><span>Уровень</span></div>
       {snapshot?.leaders.length?<ol className="level-leaderboard">{snapshot.leaders.map((p,i)=><li key={p.userId}><span className="level-rank">{String(i+1).padStart(2,'0')}</span><div className="level-viewer"><a href={communityHref('profile',selected,'overview',p.userId)} onClick={e=>{e.preventDefault();selectTab('profile',p.userId);}}>{p.name}</a>{p.title&&<span className="level-title-tag">{p.title.name}</span>}<Progress value={p}/></div><span className="level-stream-count" title="Всего сообщений">{count(p.messages)}<small>{count(p.streamMessages)} за стрим</small></span><span className="level-number">{String(p.level).padStart(2,'0')}</span></li>)}</ol>:<div className="level-leaders-empty"><span className="level-empty-icon"><MessageSquare size={25} strokeWidth={1.3}/></span><h3>{snapshot?.enabled?'Ждём первые сообщения':'Зрителей пока нет'}</h3><p>{snapshot?.enabled?'Участники появятся здесь, когда начнут писать в чате во время эфира.':data.canManage?'Включи уровни. Во время эфира сообщения из Twitch начнут заполнять рейтинг.':'Организатор ещё не включил уровни на этом канале.'}</p>{data.canManage&&data.configured&&!snapshot?.enabled&&<button className="level-empty-action" disabled={busy} onClick={()=>void save(true)}>Включить уровни <ArrowUpRight size={14}/></button>}</div>}
      </div>
      <aside className="level-quick-overlay" aria-label="Пример чата для OBS">
       <div className="level-section-heading"><h2>Чат для OBS</h2><span className="level-demo-label">Пример</span></div>
       <div className="level-preview-stage is-compact"><DemoChat appearance={appearance} channel={selected} compact/></div>
       <div className="level-quick-actions"><button onClick={()=>selectTab('overlay')}>{data.canManage?'Настроить оверлей':'Открыть оверлей'} <ArrowUpRight size={14}/></button><button onClick={()=>void copy()} disabled={!overlayUrl} aria-label={copied?'Ссылка скопирована':'Скопировать ссылку для OBS'}>{copied?<Check size={16}/>:<Copy size={16}/>}</button></div>
       <p className="level-preview-caption">Сообщения в примере вымышлены.</p>
      </aside>
     </div>
    </section>:<section className="levels-overlay" role="tabpanel" id="level-overlay" aria-labelledby="tab-overlay">
     <div className="level-preview-panel">
      <div className="level-preview-heading"><div><h2>Так выглядит чат</h2><span>Прозрачный фон · 480 × 720</span></div><div className="level-preview-switch"><button className={mode==='demo'?'is-active':''} onClick={()=>setMode('demo')}>Пример</button><button className={mode==='live'?'is-active':''} onClick={()=>setMode('live')}>Живой чат</button></div></div>
      <div className="level-preview-stage">{mode==='demo'?<DemoChat appearance={appearance} channel={selected}/>:snapshot?.enabled?<iframe src={overlayPath} title="Предпросмотр живого чата Twitch"/>:<p className="level-preview-empty">Включи уровни, чтобы увидеть живой чат.</p>}</div>
      <p className="level-preview-caption">{mode==='demo'?'Вымышленные сообщения. Нажми на пример повышения, чтобы увидеть анимацию.':'Сообщения из Twitch. В тишине оверлей скрывается согласно настройкам.'}</p>
     </div>
     <div className="level-overlay-controls">
      <div className="level-obs-link"><div className="level-form-heading"><MonitorPlay size={18}/><h2>Добавить в OBS</h2></div><p>Источники → Браузер. Вставь ссылку и укажи размер <strong>480 × 720</strong>.</p><div className="level-url-field"><input readOnly aria-label="Ссылка оверлея для OBS" value={overlayUrl} onFocus={e=>e.target.select()}/><button onClick={()=>void copy()} aria-label={copied?'Скопировано':'Скопировать ссылку'} disabled={!overlayUrl}>{copied?<Check size={17}/>:<Copy size={17}/>}</button></div><span className="level-link-hint">Доступен без входа на сайт.</span>{!snapshot?.enabled&&<small>Живой чат появится после включения уровней.</small>}</div>
      {data.canManage?<div className="level-appearance-section"><div className="level-form-heading"><Settings2 size={17}/><h2>Оформление</h2></div><div className="level-appearance-form"><fieldset className="level-font-setting"><legend>Шрифт</legend><div className="level-font-options">{OVERLAY_FONTS.map(font=><button type="button" key={font.id} disabled={busy} className={appearance.fontFamily===font.id?'is-selected':''} aria-pressed={appearance.fontFamily===font.id} onClick={()=>{changeAppearance({...appearance,fontFamily:font.id});setMode('demo');}}><span>{font.name}</span><b style={{fontFamily:font.family}}>Привет, чат</b>{appearance.fontFamily===font.id&&<Check size={12}/>}</button>)}</div></fieldset><label className="level-color-setting"><span>Цвет шкалы</span><div><span>{appearance.accent.toUpperCase()}</span><input type="color" aria-label="Цвет акцента" value={appearance.accent} onChange={e=>changeAppearance({...appearance,accent:e.target.value})}/></div></label>{([{key:'opacity',name:'Плотность фона',min:0,max:100,unit:'%'},{key:'fontSize',name:'Размер текста',min:14,max:26,unit:' px'},{key:'messages',name:'Сообщений в кадре',min:3,max:10,unit:''},{key:'hideAfter',name:'Скрывать через',min:0,max:600,unit:' с'}] as const).map(field=><label className="level-range-setting" key={field.key}><span>{field.name}<strong>{field.key==='hideAfter'&&appearance.hideAfter===0?'Всегда видны':appearance[field.key]+field.unit}</strong></span><input type="range" min={field.min} max={field.max} step={field.key==='hideAfter'?10:1} value={appearance[field.key]} onChange={e=>changeAppearance({...appearance,[field.key]:Number(e.target.value)})}/></label>)}</div><button className="level-save" disabled={!dirty||busy} onClick={()=>void save(!!snapshot?.enabled)}>{busy?'Сохраняем…':dirty?'Сохранить оформление':'Изменения сохранены'}{!dirty&&!busy&&<Check size={15}/>}</button></div>:<p className="level-viewer-hint">Оформление настраивает организатор канала.</p>}
     </div>
    </section>}
   </>}
  </div>
 </>;
}
