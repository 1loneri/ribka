import {env} from 'cloudflare:workers';
import type {ChatGPTUser} from '../../app/chatgpt-auth';
import {getRole} from '../streamer-auth';
import {getBotConnection,getConnection} from '../twitch-api';
export const BOT_CONNECT_URL='/api/twitch/connect?purpose=bot&return_to=/fishing';
export type BotRoom={channel:string;owner:string;broadcaster:string};
export async function botRoom(channel:string){return env.DB!.prepare('SELECT * FROM twitch_bot_channels WHERE channel=?').bind(channel).first<BotRoom>();}
export async function canOperateRoom(user:ChatGPTUser,channel:string){
 const role=await getRole(user);if(!role.streamer)return false;
 const room=await botRoom(channel);
 return room?room.owner===user.userId:role.streamer.channel===channel;
}
export async function channelConnection(owner:string,channel:string){
 const room=await botRoom(channel);
 if(room){if(room.owner!==owner)throw Error('Этот канал настроен другим организатором.');return getBotConnection(owner);}
 const connection=await getConnection(owner);if(connection.channel!==channel)throw Error('Нет доступа к этому каналу.');return connection;
}
export async function storedChannelConnection(owner:string,channel:string){
 const room=await botRoom(channel);if(room&&room.owner!==owner)return null;
 if(room){const bot=await env.DB!.prepare('SELECT channel,scopes FROM twitch_bot_connections WHERE user=?').bind(owner).first<{channel:string;scopes:string}>();if(bot)return bot;}
 const connection=await env.DB!.prepare('SELECT channel,scopes FROM twitch_connections WHERE user=?').bind(owner).first<{channel:string;scopes:string}>();
 return room||connection?.channel===channel?connection:null;
}
