import {getChatGPTUser} from '../../../chatgpt-auth';
import {decodeState,feedDb,readMessages,type FeedChannel} from '../../../../lib/twitch-feed/storage';
import {EVENT_SCOPES} from '../../../../lib/twitch-feed/types';
import {botRoom,canOperateRoom,storedChannelConnection} from '../../../../lib/twitch-bot/channels';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const user=await getChatGPTUser();
 const channel=(new URL(req.url).searchParams.get('channel')??'').toLowerCase();if(!/^[a-z0-9_]{3,25}$/.test(channel))return reply({error:'Выбери канал.'},400);
 const db=feedDb(),room=await botRoom(channel),target=await db.prepare('SELECT email FROM streamers WHERE channel=?').bind(channel).first<{email:string}>();if(!target&&!room)return reply({error:'Канал не добавлен на сайт.'},404);
 const regular=target?await db.prepare('SELECT user,scopes FROM twitch_connections WHERE channel=? AND email=?').bind(channel,target.email).first<{user:string;scopes:string}>():null;
 const connection=room?await storedChannelConnection(room.owner,channel):regular;
 let permissions:string[]=[];try{const value:unknown=JSON.parse(connection?.scopes??'[]');if(Array.isArray(value))permissions=value.filter(x=>typeof x==='string');}catch{}
 const configured=!!connection&&permissions.includes('user:read:chat'),canCollect=!!user&&configured&&await canOperateRoom(user,channel)&&(room?room.owner===user.userId:regular?.user===user.userId);
 const row=await db.prepare('SELECT * FROM chat_channels WHERE channel=?').bind(channel).first<FeedChannel>();
 const live=!!row?.collector_until&&row.collector_until>Date.now(),state=decodeState(row?.state);
 // Viewers receive public Twitch content; collector diagnostics are organizer-only.
 const visibleState=canCollect?state:{pin:state.pin??null,prediction:state.prediction??null,poll:state.poll??null,settings:state.settings,updated:state.updated};
 return reply({channel,messages:await readMessages(channel),state:visibleState,live,status:live?row?.status:'idle',error:canCollect?row?.error??null:null,canCollect,configured,needsPermissions:canCollect&&!room&&!!connection&&!EVENT_SCOPES.every(scope=>permissions.includes(scope)),collectorUntil:row?.collector_until??0});
}catch{return reply({error:'Не удалось обновить чат. Попробуй ещё раз.'},503);}}
