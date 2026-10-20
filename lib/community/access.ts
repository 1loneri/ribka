import {getChatGPTUser} from '../../app/chatgpt-auth';
import {getRole} from '../streamer-auth';
import {fishingIdentity} from '../fishing/identity';
import {canOperateRoom,storedChannelConnection} from '../twitch-bot/channels';
import {env} from 'cloudflare:workers';
export const communityDb=()=>{if(!env.DB)throw Error('Сообщество временно недоступно.');return env.DB;};
export const communityOperatorSql='EXISTS(SELECT 1 FROM streamers WHERE email=? AND (channel=? OR EXISTS(SELECT 1 FROM twitch_bot_channels WHERE channel=? AND owner=?)))';
export const communityConnect=(channel='')=>'/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:'/community'+(channel?'?channel='+channel:'')});
export async function communityContext(req:Request){
 const db=communityDb(),user=await getChatGPTUser(),role=await getRole(user),identity=await fishingIdentity(user);
 const [registered,friends]=await Promise.all([db.prepare('SELECT channel,name FROM streamers ORDER BY name').all<{channel:string;name:string}>(),db.prepare('SELECT channel,owner FROM twitch_bot_channels ORDER BY channel').all<{channel:string;owner:string}>()]);
 const channels=[...new Map([...registered.results,...friends.results.map(x=>({channel:x.channel,name:x.channel}))].map(x=>[x.channel,x])).values()];
 const managed=role.streamer&&user?[role.streamer.channel,...friends.results.filter(x=>x.owner===user.userId).map(x=>x.channel)]:[];
 const channel=new URL(req.url).searchParams.get('channel')??managed[0]??channels[0]?.channel??'';
 if(channel&&!channels.some(x=>x.channel===channel))throw Error('Канал не добавлен на сайт.');
 const canManage=!!user&&!!channel&&await canOperateRoom(user,channel),connection=canManage?await storedChannelConnection(user!.userId,channel):null;
 let permissions:string[]=[];try{permissions=JSON.parse(connection?.scopes??'[]');}catch{}
 return {user,role,identity,channel,channels,canManage,configured:!!connection&&permissions.includes('user:read:chat')};
}
