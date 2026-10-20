'use client';
import {useEffect,useState} from 'react';

type Settings={channel:string;sender:string;friend:boolean;enabled:boolean;fishReplies:boolean;winnerAnnouncements:boolean;chatReplies:boolean;chatMode:'openai'|'basic';chatError:string;canSend:boolean;connected:boolean;fishingActive:boolean;lastSent:number;error:string;reconnect:boolean};
export default function TwitchBotControl({channel,maintainConnection=false}:{channel:string;maintainConnection?:boolean}) {
  const [settings,setSettings]=useState<Settings|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  async function load(signal?:AbortSignal) {
    const response=await fetch('/api/twitch/bot?channel='+encodeURIComponent(channel),{cache:'no-store',signal});
    const result=await response.json() as Settings;
    if(!response.ok)throw Error(result.error);
    if(result.channel===channel)setSettings(result);
  }
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=()=>load(controller.signal).catch(problem=>{if(!controller.signal.aborted)setError(problem.message);});
    void refresh();const timer=setInterval(refresh,5000);
    return()=>{controller.abort();clearInterval(timer);};
  },[channel]);
  useEffect(()=>{
    if(!maintainConnection||!settings?.enabled||!settings.canSend)return;
    let cancelled=false,active:EventSource|undefined,timer:ReturnType<typeof setTimeout>|undefined,attempts=0;
    const controller=new AbortController();
    const later=(delay= Math.min(15000,1500*2**Math.min(attempts++,3)))=>{if(!cancelled){clearTimeout(timer);timer=setTimeout(()=>void start(),delay);}};
    async function start(){
      try{
        const response=await fetch('/api/twitch/bot?channel='+encodeURIComponent(channel),{cache:'no-store',signal:controller.signal});
        const current=await response.json() as Settings;
        if(cancelled)return;
        if(!response.ok){later();return;}
        setSettings(current);
        if(!current.enabled||!current.canSend||current.channel!==channel)return;
        if(current.connected){later(8000);return;}
        const source=new EventSource('/api/twitch/feed/live?channel='+encodeURIComponent(channel)+'&fish=1');active=source;
        source.onmessage=event=>{
          if(cancelled||active!==source)return;
          const result=JSON.parse(event.data) as {status:string;reconnect?:boolean;message?:string};
          if(result.status==='ready'||result.status==='heartbeat'){attempts=0;setError('');}
          window.dispatchEvent(new CustomEvent('twitch-feed-update',{detail:{channel}}));
          if(result.status==='error'||result.status==='closed'){
            source.close();active=undefined;
            if(result.reconnect){setError(result.message??'Переподключи Twitch.');return;}
            later();
          }
        };
        source.onerror=()=>{if(cancelled||active!==source)return;source.close();active=undefined;later();};
      }catch{if(!cancelled)later();}
    }
    void start();
    return()=>{cancelled=true;controller.abort();clearTimeout(timer);active?.close();};
  },[channel,maintainConnection,settings?.enabled,settings?.canSend,retry]);
  async function change(patch:Partial<Pick<Settings,'enabled'|'fishReplies'|'winnerAnnouncements'|'chatReplies'>>){
    if(!settings)return;
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/twitch/bot?channel='+encodeURIComponent(channel),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,enabled:settings.enabled,fishReplies:settings.fishReplies,winnerAnnouncements:settings.winnerAnnouncements,chatReplies:settings.chatReplies,...patch})});
      const result=await response.json() as {error?:string};
      if(!response.ok)throw Error(result.error??'Не удалось сохранить настройки.');
      await load();
    }catch(problem){setError(problem instanceof Error?problem.message:'Не удалось сохранить настройки.');}
    finally{setBusy(false);}
  }
  return <section className="twitch-bot-control" aria-label="Бот Twitch">
    <div className="bot-heading"><div><h2>Бот Twitch</h2><p>Ответы от @{settings?.sender??channel}{settings?.friend?' в чате @'+channel:''}</p></div><button type="button" className={'bot-toggle'+(settings?.enabled?' is-on':'')} role="switch" aria-checked={!!settings?.enabled} aria-label="Включить бота Twitch" disabled={!settings||busy||!settings.canSend&&!settings.enabled} onClick={()=>void change({enabled:!settings?.enabled})}><span/>{settings?.enabled?'Включён':'Выключен'}</button></div>
    {settings?<>
      <div className="bot-options"><label><input type="checkbox" checked={settings.fishReplies} disabled={busy} onChange={event=>void change({fishReplies:event.target.checked})}/>Отвечать на команды рыбалки</label><label><input type="checkbox" checked={settings.winnerAnnouncements} disabled={busy} onChange={event=>void change({winnerAnnouncements:event.target.checked})}/>Объявлять победителей розыгрышей</label><label><input type="checkbox" checked={settings.chatReplies} disabled={busy} onChange={event=>void change({chatReplies:event.target.checked})}/>Отвечать на обращения «бот»</label></div>
      {settings.chatReplies&&<p className="bot-hint">{settings.chatMode==='openai'&&!settings.chatError?'Лёха · нейросеть. Помнит недавний разговор, шутит и отвечает без поиска.':'Лёха · готовые реплики и шуточные прогнозы.'} Пауза: 8 сек. в чате, 30 сек. на человека; до 200 ответов в сутки.</p>}
      {settings.enabled&&<p className="bot-status" role="status">{settings.connected?'Связь с Twitch установлена.':maintainConnection?'Подключаем Twitch…':'Для работы подключи команды Twitch выше.'}{settings.fishReplies&&!settings.fishingActive?' Рыбалка сейчас не принимает команды.':''}{settings.lastSent>0&&<> Последний ответ — {new Date(settings.lastSent).toLocaleTimeString('ru',{hour:'2-digit',minute:'2-digit'})}.</>}</p>}
      {(!settings.canSend||settings.reconnect)&&<a className="bot-reconnect" href={settings?.friend?'/api/twitch/connect?purpose=bot&return_to=/fishing':'/api/twitch/connect?return_to=/fishing'} target="_top">Переподключить Twitch и разрешить отправку</a>}
      <p className="bot-hint">Оставь «Рыбку» открытой и подключи команды Twitch. Напиши «привет бот» или «ботик скажи, что будет завтра?».</p>
      {(error||settings.error||settings.chatError)&&<p className="error" role="alert">{error||settings.error||settings.chatError}</p>}
      {settings.chatError&&<button type="button" className="secondary" disabled={busy} onClick={()=>void change({chatReplies:settings.chatReplies})}>Повторить подключение нейросети</button>}
      {settings.enabled&&maintainConnection&&!settings.connected&&<button type="button" className="secondary" onClick={()=>{setError('');setRetry(value=>value+1);}}>Повторить подключение</button>}
    </>:<p className="bot-hint" role="status">{error||'Загружаем настройки…'}</p>}
  </section>;
}
