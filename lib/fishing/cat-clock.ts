import {env} from 'cloudflare:workers';
import {channelConnection} from '../twitch-bot/channels';
import {helix} from '../twitch-api';
import type {Game} from './storage';
import type {Player} from './game';
export type CatClock={elapsed:number;checked:number;live:number;stream_id:string|null;lease_until:number};
// Count only intervals whose endpoints confirm the SAME stream. Unknown gaps
// never consume food. There is no offline catch-up or client supplied live flag.
export async function streamCatClock(g:Game):Promise<CatClock>{
 const db=env.DB!,now=Date.now();await db.prepare('INSERT OR IGNORE INTO fishing_cat_clocks(channel) VALUES(?)').bind(g.channel).run();
 const row=(await db.prepare('SELECT * FROM fishing_cat_clocks WHERE channel=?').bind(g.channel).first<CatClock>())!;
 if(row.checked>now-60000)return {...row,live:g.enabled?row.live:0};
 const lease=now+15000,claim=await db.prepare('UPDATE fishing_cat_clocks SET lease_until=? WHERE channel=? AND checked=? AND lease_until<=?').bind(lease,g.channel,row.checked,now).run();
 if(!claim.meta.changes)return {...row,live:0};
 let streamId:string|null=null;
 try{if(g.enabled){const connection=await channelConnection(g.owner,g.channel),response=await helix(connection,'streams?user_login='+encodeURIComponent(g.channel)),data=await response.json() as {data:{id:string;user_login:string;type:string}[]};streamId=data.data?.find(s=>s.type==='live'&&s.user_login.toLowerCase()===g.channel)?.id??null;}}catch{/* Freeze hunger when Twitch cannot confirm the stream. */}
 const elapsed=row.elapsed+(row.live&&streamId&&streamId===row.stream_id&&now-row.checked<=120000?Math.max(0,now-row.checked):0);
 await db.prepare('UPDATE fishing_cat_clocks SET elapsed=?,checked=?,live=?,stream_id=?,lease_until=0 WHERE channel=? AND checked=? AND lease_until=?').bind(elapsed,now,streamId?1:0,streamId,g.channel,row.checked,lease).run();
 return (await db.prepare('SELECT * FROM fishing_cat_clocks WHERE channel=?').bind(g.channel).first<CatClock>())!;
}
export function prepareCatClock(p:Player,clock:CatClock,now=Date.now()):boolean{
 const cat=p.cat;if(!cat)return false;let changed=false;
 if(cat.clockElapsed===undefined||cat.clockAt===undefined){
  // Migrate living legacy pets without charging unobserved offline time.
  if(cat.alive&&cat.active){const reserve=Math.max(0,Math.min(12*3600000,cat.fedUntil-cat.lastRun));cat.fedUntil=now+reserve;cat.lastRun=now;}
  cat.clockElapsed=clock.elapsed;cat.clockAt=now;changed=true;
 }else if(clock.elapsed>cat.clockElapsed){cat.clockAt+=clock.elapsed-cat.clockElapsed;cat.clockElapsed=clock.elapsed;changed=true;}
 const paused=!clock.live;if(cat.paused!==paused){cat.paused=paused;changed=true;}return changed;
}
