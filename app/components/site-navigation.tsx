'use client';

import {ShieldCheck,UserRound} from 'lucide-react';
import {useSiteViewer} from './site-viewer-context';
import {useEffect,useRef,useState} from 'react';
import {useFishingAccess} from './fishing-access-context';

type Props = {
  active: 'home' | 'giveaways' | 'studio' | 'fishing' | 'reviews' | 'feedback' | 'community' | 'admin';
  user?: {name: string} | null;
  canStream?: boolean;
  admin?: boolean;
  onAccountClick?: () => void;
  returnTo?: string;
};

export default function SiteNavigation({active, user, canStream = false, admin = false, onAccountClick, returnTo}: Props) {
  const canFish=useFishingAccess(),viewer=useSiteViewer();
  const header=useRef<HTMLElement>(null),[hidden,setHidden]=useState(false);
  useEffect(()=>{
    const scrollY=()=>Math.max(0,Math.min(window.scrollY,Math.max(0,document.documentElement.scrollHeight-window.innerHeight)));
    let last=scrollY(),direction=0,travel=0,frame=0;
    const update=()=>{
      frame=0;
      const y=scrollY(),delta=y-last;last=y;
      if(y<=8){direction=0;travel=0;setHidden(false);return;}
      // Keep keyboard navigation visible, including when Tab enters a hidden header.
      const focused=document.activeElement;
      if(focused&&header.current?.contains(focused)&&focused.matches(':focus-visible')){setHidden(false);direction=0;travel=0;return;}
      if(!delta)return;
      const nextDirection=delta>0?1:-1;
      if(direction!==nextDirection){direction=nextDirection;travel=0;}
      travel+=Math.abs(delta);
      if(direction<0&&travel>=4)setHidden(false);
      else if(direction>0&&y>24&&travel>=10)setHidden(true);
    };
    const onScroll=()=>{if(!frame)frame=requestAnimationFrame(update);};
    window.addEventListener('scroll',onScroll,{passive:true});
    return()=>{window.removeEventListener('scroll',onScroll);if(frame)cancelAnimationFrame(frame);};
  },[]);
  const links = [
    {id: 'home', href: '/', label: 'Главная'},
    {id: 'giveaways', href: '/giveaways', label: 'Розыгрыши'},
    {id: 'feedback', href: '/feedback', label: 'Отзывы'},
    {id: 'reviews', href: '/reviews', label: 'Видео'},
    {id: 'community', href: '/community', label: 'Сообщество'},
    ...(canFish ? [{id: 'fishing', href: '/fishing', label: 'Рыбка'}] : []),
    ...(canStream || admin ? [{id: 'studio', href: '/studio', label: 'Моя студия'}] : []),
    ...(admin ? [{id: 'admin', href: '/admin', label: 'Доступ стримерам'}] : []),
  ];


  return <header ref={header} className={'site-navigation'+(hidden?' is-scroll-hidden':'')} onFocusCapture={()=>setHidden(false)}>
    <a className="site-brand" href="/" aria-label="wariouss — главная"><span>war<span className="brand-accent">iouss</span></span></a>
    <nav className="site-nav" aria-label="Основная навигация">{links.map(({id, href, label}) => <a key={id} href={href} className={'site-nav-link' + (active === id ? ' is-current' : '')} aria-label={label} aria-current={active === id ? 'page' : undefined}><span>{label}</span></a>)}</nav>
    <div className="site-nav-bottom">
      {admin?<a className="site-account site-admin-account" href="/admin"><span className="site-account-avatar"><ShieldCheck size={17}/></span><span className="site-account-name"><strong>Админ-панель</strong><small>Управление сайтом</small></span></a>:viewer?<a className="site-account" href="/community?tab=profile" aria-label={'Профиль Twitch: '+viewer.login}><span className="site-account-avatar">{viewer.avatar?<img src={viewer.avatar} alt="" width={32} height={32}/>:<UserRound size={16}/>}</span><span className="site-account-name"><strong>{viewer.login}</strong><small>Профиль Twitch</small></span></a>:<a className="site-login" href="/api/twitch/connect?purpose=player&return_to=%2Fcommunity%3Ftab%3Dprofile" target="_top"><UserRound size={17}/><span>Подключить Twitch</span></a>}
    </div>
  </header>;
}
