import {env} from 'cloudflare:workers';
import {getConnection} from './twitch-api';
export type ActiveGiveaway={id:string;owner:string;channel:string;entry_mode:string;keyword:string|null;reward_id:string|null;created:number};
export type TwitchEvent={broadcaster_user_id?:string;chatter_user_id?:string;chatter_user_name?:string;chatter_user_login?:string;message?:{text?:string};user_id?:string;user_name?:string;user_login?:string;id?:string;status?:string;reward?:{id?:string}};
export async function ingestEvent(g:ActiveGiveaway,c:Awaited<ReturnType<typeof getConnection>>,lease:string,type:string,event:TwitchEvent,timestamp:string){
 if(g.entry_mode!=='keyword'||type!=='channel.chat.message'||event.broadcaster_user_id!==c.broadcaster)return {accepted:false};
 const eventTime=Date.parse(timestamp);
 if(!Number.isFinite(eventTime)||eventTime<g.created||eventTime>Date.now()+60000)return {accepted:false};
 const text=(event.message?.text??'').trim().toLocaleLowerCase();
 if(text==='!тут'){
  const now=Date.now(),user=event.chatter_user_id??'';
  if(!/^\d+$/.test(user))return {accepted:false};
  const result=await env.DB!.prepare("UPDATE giveaway_winners SET state='confirmed',confirmed_at=? WHERE giveaway=? AND user=? AND state='awaiting' AND deadline-60000<=? AND deadline>=? AND deadline>? AND EXISTS(SELECT 1 FROM giveaways WHERE id=? AND status='completed' AND collector_token=? AND collector_until>?)").bind(now,g.id,'twitch:'+user,eventTime,eventTime,now,g.id,lease,now).run();
  return {accepted:!!result.meta.changes,needsReview:false};
 }
 if(text!==(g.keyword??'').toLocaleLowerCase())return {accepted:false};
 const user=event.chatter_user_id??'',name=event.chatter_user_name??event.chatter_user_login??'';
 if(!/^\d+$/.test(user)||!name||name.length>100)return {accepted:false};
 const now=Date.now();
 const result=await env.DB!.prepare("INSERT OR IGNORE INTO entries (giveaway,user,name,created,winner) SELECT id,?,?,?,0 FROM giveaways WHERE id=? AND entry_mode='keyword' AND status='active' AND ends>? AND created<=? AND collector_token=? AND collector_until>?").bind('twitch:'+user,name,now,g.id,now,eventTime,lease,now).run();
 return {accepted:!!result.meta.changes,needsReview:false};
}
