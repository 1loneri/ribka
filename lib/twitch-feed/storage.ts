import {env} from 'cloudflare:workers';
import type {FeedMessage,FeedState} from './types';
export type FeedChannel={channel:string;owner:string;collector_token:string|null;collector_until:number|null;status:string;error:string|null;state:string};
export const feedDb=()=>{if(!env.DB)throw Error('Чат временно недоступен.');return env.DB;};
export function decodeState(value:string|undefined):FeedState{try{return value?JSON.parse(value) as FeedState:{};}catch{return {};}}
export async function updateFeedState(channel:string,lease:string,patch:Partial<FeedState>){
 const db=feedDb();
 for(let attempt=0;attempt<3;attempt++){
  const row=await db.prepare('SELECT state FROM chat_channels WHERE channel=? AND collector_token=? AND collector_until>?').bind(channel,lease,Date.now()).first<{state:string}>();if(!row)return false;
  const result=await db.prepare('UPDATE chat_channels SET state=? WHERE channel=? AND collector_token=? AND collector_until>? AND state=?').bind(JSON.stringify({...decodeState(row.state),...patch}),channel,lease,Date.now(),row.state).run();
  if(result.meta.changes)return true;
 }
 return false;
}
export async function appendMessage(channel:string,lease:string,message:FeedMessage){
 if(!message.id||!message.text)return false;
 const result=await feedDb().prepare('INSERT OR IGNORE INTO chat_messages (channel,message_id,user_id,payload,created,removed) SELECT ?,?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM chat_channels WHERE channel=? AND collector_token=? AND collector_until>?)').bind(channel,message.id,message.userId,JSON.stringify(message),message.created,channel,lease,Date.now()).run();
 return !!result.meta.changes;
}
export async function readMessages(channel:string){
 const rows=await feedDb().prepare('SELECT seq,payload FROM chat_messages WHERE channel=? AND removed=0 ORDER BY seq DESC LIMIT 150').bind(channel).all<{seq:number;payload:string}>();
 return rows.results.reverse().flatMap(row=>{try{return [{...JSON.parse(row.payload) as FeedMessage,seq:row.seq}];}catch{return [];}});
}
export async function removeMessages(channel:string,lease:string,target?:{id?:string;user?:string}){
 if(target&&!target.id&&!target.user)return;
 const db=feedDb(),restriction=target?.id?' AND message_id=?':target?.user?' AND user_id=?':'';
 const args:[string,...string[]]=[channel];if(target?.id)args.push(target.id);else if(target?.user)args.push(target.user);
 await db.prepare('UPDATE chat_messages SET removed=1 WHERE channel=?'+restriction+' AND EXISTS (SELECT 1 FROM chat_channels WHERE channel=? AND collector_token=? AND collector_until>?)').bind(...args,channel,lease,Date.now()).run();
 const row=await db.prepare('SELECT state FROM chat_channels WHERE channel=? AND collector_token=?').bind(channel,lease).first<{state:string}>();
 const pin=decodeState(row?.state).pin;
 const pinnedDeleted=pin&&(!target||target.id===pin.id||target.user===pin.userId);
 const removedId=target?.id||(pinnedDeleted?pin.id:'');
 if(removedId)await db.prepare('INSERT OR IGNORE INTO chat_messages (channel,message_id,user_id,payload,created,removed) SELECT ?,?,?,?,?,1 WHERE EXISTS (SELECT 1 FROM chat_channels WHERE channel=? AND collector_token=? AND collector_until>?)').bind(channel,removedId,'','{}',Date.now(),channel,lease,Date.now()).run();
 if(pinnedDeleted)await updateFeedState(channel,lease,{pin:null});
}
export async function pruneMessages(channel:string,lease:string){await feedDb().prepare('DELETE FROM chat_messages WHERE channel=? AND seq NOT IN (SELECT seq FROM chat_messages WHERE channel=? ORDER BY seq DESC LIMIT 300) AND EXISTS (SELECT 1 FROM chat_channels WHERE channel=? AND collector_token=?)').bind(channel,channel,channel,lease).run();}
