'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {MonitorPlay} from 'lucide-react';
import TwitchChatRoom from './twitch-chat-room';

export default function TwitchDock({channel,parent,accepting,enabled,catchFeed}:{channel:string;parent:string;accepting:boolean;enabled:boolean;catchFeed?:ReactNode}){
 const frame=useRef<HTMLDivElement>(null),[playerFits,setPlayerFits]=useState<boolean|null>(null);
 useEffect(()=>{
  const target=frame.current;if(!target)return;
  const measure=()=>setPlayerFits(target.getBoundingClientRect().width>=400);
  measure();if(typeof ResizeObserver==='undefined'){window.addEventListener('resize',measure);return()=>window.removeEventListener('resize',measure);}
  const observer=new ResizeObserver(measure);observer.observe(target);
  return()=>observer.disconnect();
 },[]);
 const parents=new URLSearchParams();if(parent)parents.append('parent',parent);if(parent!=='chatgpt.com')parents.append('parent','chatgpt.com');
 const playerUrl='https://player.twitch.tv/?'+new URLSearchParams({channel,autoplay:'false',muted:'false'})+'&'+parents;
 const channelUrl='https://www.twitch.tv/'+encodeURIComponent(channel);
 return <div className="fish-live-dock">
  <div className="fish-stream-stack">
  <section className="fish-stream-panel" aria-label={'Стрим '+channel}>
   <div className="fish-media-heading"><div><MonitorPlay size={18}/><h2>Стрим <span>@{channel}</span></h2></div><a href={channelUrl} target="_blank" rel="noreferrer">Twitch</a></div>
   <div className="fish-player-frame" ref={frame}>{parent&&playerFits===true?<iframe key={channel} className="fish-twitch-player" title={'Трансляция Twitch — '+channel} src={playerUrl} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen/>:playerFits===false?<div className="fish-player-fallback"><MonitorPlay size={30}/><p>Смотри стрим в Twitch и возвращайся к рыбалке.</p><a className="fish-secondary-button" href={channelUrl} target="_blank" rel="noreferrer">Смотреть @{channel}</a></div>:<div className="fish-media-loading" role="status">Загружаем плеер…</div>}</div>
   <p className="fish-stream-caption">{accepting?<>На сайте нажми на рыбку, в чате @{channel} напиши <code>!рыба</code>.</>:enabled?<>Лови кликом на рыбку. Приём команд <code>!рыба</code> в чате пока остановлен.</>:<>Дождись запуска рыбалки, чтобы ловить на сайте или в чате.</>}</p>
  </section>
  {catchFeed}
  </div>
  <TwitchChatRoom key={channel} channel={channel} showHeader={false}/>
 </div>;
}
