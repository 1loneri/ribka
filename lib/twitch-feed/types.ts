export type ChatFragment={type:'text'|'emote'|'cheermote'|'mention'|'gif';text:string;id?:string;url?:string;bits?:number};
export type FeedMessage={id:string;seq?:number;kind:'message'|'notice'|'reward'|'fish';userId:string;login:string;name:string;color:string;badges:string[];text:string;fragments:ChatFragment[];created:number;replyTo?:string;source?:string;highlight?:boolean;bits?:number};
export type PinnedMessage={id:string;userId:string;name:string;text:string;fragments:ChatFragment[];endsAt:number|null};
export type Prediction={id:string;title:string;status:string;startedAt?:number;endsAt:number;finishedAt:number|null;winner:string|null;outcomes:{id:string;title:string;users:number;points:number;color:string}[]};
export type Poll={id:string;title:string;status:string;startedAt?:number;endsAt:number;finishedAt:number|null;choices:{id:string;title:string;votes:number}[]};
export type FeedState={pin?:PinnedMessage|null;prediction?:Prediction|null;poll?:Poll|null;settings?:{slow:number;followers:number|null;subscribers:boolean;emotes:boolean};capabilities?:{pin:boolean;prediction:boolean;poll:boolean};warnings?:string[];subscriptionWarnings?:string[];updated?:number};
export type FeedSnapshot={channel:string;messages:FeedMessage[];state:FeedState;live:boolean;status:string;error:string|null;canCollect:boolean;configured:boolean;needsPermissions:boolean;collectorUntil:number};
export type TwitchPacket={metadata:{message_id:string;message_type:string;subscription_type?:string;message_timestamp?:string};payload:{session?:{id:string;reconnect_url?:string};event?:Record<string,unknown>;subscription?:{type?:string}}};
export const EVENT_SCOPES=['moderator:read:chat_messages','channel:read:predictions','channel:read:polls'];
export const asText=(value:unknown,max=2000)=>typeof value==='string'?value.slice(0,max):'';
export const asCount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.floor(value)):0;
export const asTime=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))?Date.parse(value):0;
export function record(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}

export function fragments(message:unknown):ChatFragment[]{
 const source=record(message),text=asText(source.text);
 if(!Array.isArray(source.fragments))return [{type:'text',text}];
 const result=source.fragments.slice(0,100).map(value=>{
  const fragment=record(value),label=asText(fragment.text);
  if(fragment.type==='emote'&&/^[a-zA-Z0-9_-]+$/.test(asText(record(fragment.emote).id,200)))return {type:'emote' as const,text:label,id:asText(record(fragment.emote).id,200)};
  if(fragment.type==='cheermote')return {type:'cheermote' as const,text:label,bits:asCount(record(fragment.cheermote).bits)};
  if(fragment.type==='mention')return {type:'mention' as const,text:label};
  if(fragment.type==='gif'){
   const url=asText(record(fragment.gif).url,2048);
   try{if(new URL(url).protocol==='https:')return {type:'gif' as const,text:label,url};}catch{}
  }
  return {type:'text' as const,text:label};
 });
 return result.map(fragment=>fragment.text).join('')===text?result:[{type:'text',text}];
}

export function chatMessage(event:Record<string,unknown>,id:string,created:number,notice=false):FeedMessage{
 const message=record(event.message),system=notice?asText(event.system_message):'';
 const text=[system,asText(message.text)].filter(Boolean).join('\n');
 return {id,kind:notice?'notice':'message',userId:asText(event.chatter_user_id,100),login:asText(event.chatter_user_login,25),name:asText(event.chatter_user_name,100)||'Twitch',color:/^#[0-9a-f]{6}$/i.test(asText(event.color,7))?asText(event.color,7):'',badges:Array.isArray(event.badges)?event.badges.slice(0,12).map(b=>asText(record(b).set_id,50)):[],text,fragments:system?[{type:'text',text}]:fragments(message),created,replyTo:asText(record(event.reply).parent_user_name,100)||undefined,source:asText(event.source_broadcaster_user_login,25)||undefined,highlight:event.message_type==='channel_points_highlighted',bits:asCount(record(event.cheer).bits)||undefined};
}
export function pinnedMessage(value:unknown):PinnedMessage|null{
 const row=record(value);if(!row.message_id)return null;
 return {id:asText(row.message_id,200),userId:asText(row.sender_user_id,100),name:asText(row.sender_user_name,100)||asText(row.sender_user_login,25),text:asText(record(row.message).text),fragments:fragments(row.message),endsAt:asTime(row.ends_at)||null};
}
export function prediction(value:unknown,eventType?:string):Prediction|null{
 const row=record(value);if(!row.id)return null;
 const status=eventType?.endsWith('.begin')||eventType?.endsWith('.progress')?'ACTIVE':eventType?.endsWith('.lock')?'LOCKED':asText(row.status,30).toUpperCase();
 const startedAt=asTime(row.created_at)||asTime(row.started_at);
 return {id:asText(row.id,200),title:asText(row.title,200),status,startedAt,endsAt:asTime(row.locks_at)||(startedAt+asCount(row.prediction_window)*1000),finishedAt:asTime(row.ended_at)||null,winner:asText(row.winning_outcome_id,200)||null,outcomes:Array.isArray(row.outcomes)?row.outcomes.slice(0,10).map(value=>{const outcome=record(value);return {id:asText(outcome.id,200),title:asText(outcome.title,200),users:asCount(outcome.users),points:asCount(outcome.channel_points),color:asText(outcome.color,20)};}):[]};
}
export function poll(value:unknown,eventType?:string):Poll|null{
 const row=record(value);if(!row.id)return null;
 const status=eventType?.endsWith('.begin')||eventType?.endsWith('.progress')?'ACTIVE':asText(row.status,30).toUpperCase();
 return {id:asText(row.id,200),title:asText(row.title,200),status,startedAt:asTime(row.started_at),endsAt:asTime(row.ends_at)||asTime(row.started_at)+asCount(row.duration)*1000,finishedAt:asTime(row.ended_at)||null,choices:Array.isArray(row.choices)?row.choices.slice(0,10).map(value=>{const choice=record(value);return {id:asText(choice.id,200),title:asText(choice.title,200),votes:asCount(choice.votes)};}):[]};
}
