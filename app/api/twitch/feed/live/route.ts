import {getChatGPTUser} from '../../../../chatgpt-auth';
import {botRoom,canOperateRoom,channelConnection} from '../../../../../lib/twitch-bot/channels';
import {connectFeed} from '../../../../../lib/twitch-feed/collector';
import {fishingAccessDenied} from '../../../../../lib/fishing/access';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 if(req.headers.get('sec-fetch-site')==='cross-site'||req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Запрос отклонён.'},{status:403});
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Требуется вход.'},{status:401});
 const fishWanted=new URL(req.url).searchParams.get('fish')==='1';
 if(fishWanted){const denied=await fishingAccessDenied(user);if(denied)return denied;}
 const channel=new URL(req.url).searchParams.get('channel')??'';
 if(!/^[a-z0-9_]{1,25}$/.test(channel)||!await canOperateRoom(user,channel))return Response.json({error:'Нет доступа к выбранному каналу.'},{status:403});
 const connection=await channelConnection(user.userId,channel);if(!connection.permissions.includes('user:read:chat'))return Response.json({error:'Подключи свой аккаунт бота с доступом к чату.'},{status:403});
 return await connectFeed(req,user,connection,fishWanted,await botRoom(channel)??undefined);
}catch{return Response.json({error:'Не удалось подключить чат. Переподключи Twitch.'},{status:503});}}
