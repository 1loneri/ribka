'use client';
import {useEffect,useState} from 'react';
import {ArrowDownRight,ArrowRight,ArrowUpRight,ChartNoAxesColumnIncreasing,ChevronLeft,ChevronRight,Clapperboard,Eye,Fish,MessageCircle,MonitorPlay,Pause,Play,Star,UserRound} from 'lucide-react';
import SiteNavigation from '../components/site-navigation';
import {useFishingAccess} from '../components/fishing-access-context';
import './homepage.css';
type Props={user:{name:string}|null;admin:boolean;canStream:boolean};
const slides=[
 {id:'community',image:'',imageStyle:'objects',title:<>После катки<br/>не расходимся.</>,text:'Розыгрыши, моменты из Valorant и знакомые ники из чата. Всё в одном месте.',label:'В сообщество',href:'/community'},
 {id:'videos',image:'/profiles/banners/jett-stream.png',imageStyle:'video',title:<>Есть что<br/>пересмотреть.</>,text:'Отправь видео на разбор или дай чату угадать твой ранг. Иногда один раунд говорит больше целой игры.',label:'Смотреть видео',href:'/reviews'},
 {id:'giveaways',image:'/homepage/giveaway-monster-v2.webp',imageStyle:'prize',title:<>А вдруг<br/>твой дроп?</>,text:'Участвуй по слову в чате Twitch. Кейсы, гонки, рыбалка и автомат с Monster уже ждут в розыгрышах.',label:'К розыгрышам',href:'/giveaways'},
];
function ChromeStar({className=''}:{className?:string}){return <svg className={className} viewBox="0 0 100 100" fill="none" aria-hidden="true"><defs><linearGradient id="home-chrome" x1="18" y1="17" x2="80" y2="88"><stop stopColor="#faf7ec"/><stop offset=".26" stopColor="#777c7d"/><stop offset=".47" stopColor="#edf0e9"/><stop offset=".52" stopColor="#4c5053"/><stop offset=".75" stopColor="#cfd3ce"/><stop offset="1" stopColor="#686c6c"/></linearGradient></defs><path d="m50 4 10 33 35 13-35 12L50 97 39 62 5 50l34-13Z" fill="url(#home-chrome)"/><path d="m50 4-1 46 46 0M49 50 50 97M5 50h44" stroke="#e6e7df" strokeOpacity=".7"/><ellipse cx="50" cy="51" rx="46" ry="13" transform="rotate(-27 50 51)" stroke="#c2c5c1" strokeWidth="2"/></svg>;}
export default function HomepageApp({user,admin,canStream}:Props){
 const [slide,setSlide]=useState(0),canFish=useFishingAccess(),current=slides[slide];
 const [paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false),[visible,setVisible]=useState(true),[reducedMotion,setReducedMotion]=useState(true),[cycle,setCycle]=useState(0);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const syncMotion=()=>setReducedMotion(media.matches),syncVisibility=()=>setVisible(!document.hidden);
  syncMotion();syncVisibility();media.addEventListener('change',syncMotion);document.addEventListener('visibilitychange',syncVisibility);
  return()=>{media.removeEventListener('change',syncMotion);document.removeEventListener('visibilitychange',syncVisibility);};
 },[]);
 useEffect(()=>{
  if(paused||hovered||focused||reducedMotion||!visible)return;
  const timer=window.setTimeout(()=>setSlide(value=>(value+1)%slides.length),7000);
  return()=>window.clearTimeout(timer);
 },[slide,paused,hovered,focused,reducedMotion,visible,cycle]);
 const select=(index:number)=>{setSlide(index);setCycle(value=>value+1);};
 const move=(direction:number)=>{setSlide(value=>(value+direction+slides.length)%slides.length);setCycle(value=>value+1);};
 const quick=[
  {name:'Мой профиль',text:'Аватарка, агенты и титул',href:'/community?tab=profile',Icon:UserRound},
  {name:'Уровень и рейтинг',text:'Каждое сообщение в счёт',href:'/community?tab=levels',Icon:ChartNoAxesColumnIncreasing},
  {name:'Анкета на разбор',text:'Покажи свой момент',href:'/reviews?submit=1',Icon:Clapperboard},
  {name:'Угадай ранг',text:'Дай чату подумать',href:'/reviews/guess',Icon:Eye},
  ...(admin?[{name:'Моя студия',text:'Всё под твоим контролем',href:'/studio',Icon:MonitorPlay}]:[{name:'Оверлей для OBS',text:'Чат с уровнями на стриме',href:'/community?tab=levels&view=overlay',Icon:MonitorPlay}]),
 ];
 return <><SiteNavigation active="home" user={user} admin={admin} canStream={canStream}/><main className="war-home">
  <section className={'home-hero home-hero-'+slide} aria-label="Знакомство с wariouss" aria-roledescription="карусель" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setFocused(false);}} onKeyDown={event=>{if(event.target!==event.currentTarget)return;if(event.key==='ArrowLeft'){event.preventDefault();move(-1);}if(event.key==='ArrowRight'){event.preventDefault();move(1);}}} tabIndex={0}>
   <div className="home-hero-paper" aria-hidden="true"/><div className="home-hero-orbit" aria-hidden="true"/>
   <div key={current.id} className="home-hero-copy" aria-live={paused||focused?'polite':'off'} aria-atomic="true"><h1>{current.title}</h1><p>{current.text}</p><a className="home-hero-link" href={current.href}>{current.label}<ArrowUpRight size={17}/></a></div>
   <div className={'home-hero-art'+(slide===0?' is-empty':'')} aria-hidden="true"><span className="home-art-word">OFFLINE<br/>IS A MYTH.</span>{slides.map((item,index)=>item.image?<img key={item.id} className={'home-slide-image image-'+item.imageStyle+(index===slide?' is-active':'')} src={item.image} alt="" fetchPriority={index===0?'high':'auto'} width={900} height={1125}/>:null)}<ChromeStar className="home-hero-star"/></div>
   <button className="home-slide-arrow is-prev" aria-label="Предыдущий баннер" onClick={()=>move(-1)}><ChevronLeft size={28}/></button><button className="home-slide-arrow is-next" aria-label="Следующий баннер" onClick={()=>move(1)}><ChevronRight size={28}/></button>
   <div className="home-slide-controls" aria-label="Баннеры">{slides.map((item,index)=><button key={item.id} onClick={()=>select(index)} aria-label={'Баннер '+(index+1)+': '+item.label} aria-pressed={index===slide}><span/></button>)}<small>{String(slide+1).padStart(2,'0')} / 03</small><button className="home-autoplay-toggle" onClick={()=>setPaused(value=>!value)} aria-label={paused?'Включить автоперелистывание':'Приостановить автоперелистывание'} aria-pressed={paused}>{paused?<Play size={12}/>:<Pause size={12}/>}</button></div>
  </section>
  <div className="home-index"><span><ArrowDownRight size={17}/>Всё самое интересное ниже</span></div>
  <div className="home-directory">
   <section className="home-feature-section" aria-labelledby="home-feature-title"><div className="home-section-title"><h2 id="home-feature-title">Стрим</h2><ArrowUpRight size={18}/></div><div className="home-feature-pair">
    <a className="home-feature-card is-drop" href="/giveaways"><img src="/homepage/giveaway-monster-v2.webp" alt="" loading="lazy" width={450} height={600}/><span className="home-card-tag">01 / DROP</span><div><span>Пусть решит рандом</span><h3>Розыгрыши</h3><ArrowUpRight size={20}/></div></a>
    <a className="home-feature-card is-video" href="/reviews"><img src="/homepage/video-ace-v1.webp" alt="" loading="lazy" width={450} height={600}/><span className="home-card-tag">02 / REPLAY</span><span className="home-play-stamp" aria-hidden="true"><Play size={20} fill="currentColor"/></span><div><span>Моменты между катками</span><h3>Видео</h3><ArrowUpRight size={20}/></div></a>
   </div><a className="home-feature-bottom" href="/giveaways">Смотреть розыгрыши<ArrowRight size={17}/></a><p className="home-feature-note">Участие через чат Twitch.</p></section>
   <section className="home-quick-section" aria-labelledby="home-quick-title"><div className="home-section-title"><h2 id="home-quick-title">Для тебя</h2></div><div className="home-quick-links">{quick.map(({name,text,href,Icon},index)=><a key={name} className={'home-quick-link tone-'+index} href={href}><Icon size={18}/><span><strong>{name}</strong><small>{text}</small></span><ArrowUpRight size={16}/></a>)}</div></section>
   <section className="home-club-section" aria-labelledby="home-club-title"><div className="home-section-title"><h2 id="home-club-title">Для чатика</h2><MessageCircle size={18}/></div><div className="home-club-links">
    <a className="home-club-card" href="/community?tab=viewer"><div className="home-mystery-art" aria-hidden="true"><img src="/valorant/agents/yoru.webp" alt="" loading="lazy" width={80} height={100}/><span>?</span></div><div><h3>Тайный зритель</h3><p>Узнаешь чаттера<br/>по сообщениям?</p></div><ArrowUpRight size={15}/></a>
    <a className="home-club-card" href="/community?tab=room"><div className="home-room-art"><img src="/homepage/room-preview-v1.webp" alt="" loading="lazy" width={160} height={96}/></div><div><h3>Наша комната</h3><p>Выбираем детали.<br/>Обустраиваем вместе.</p></div><ArrowUpRight size={15}/></a>
    <a className="home-club-card" href="/feedback"><div className="home-feedback-art" aria-hidden="true"><Star size={29}/><small>THANK YOU</small></div><div><h3>Отзывы</h3><p>Кому уже<br/>улыбнулся рандом.</p></div><ArrowUpRight size={15}/></a>
   </div></section>
  </div>
  {canFish&&<a className="home-private-link" href="/fishing"><Fish size={17}/><span>Рыбалка</span><small>Твой закрытый уголок</small><ArrowUpRight size={15}/></a>}
  <div className="home-footer"><a href="/">wariouss<span>ON AIR, IN CHAT, AROUND HERE.</span></a><span>Сайт не связан с Riot Games</span><a href="https://www.twitch.tv/war1ouss" target="_blank" rel="noopener noreferrer">Twitch war1ouss<ArrowUpRight size={13}/></a></div>
 </main></>;
}
