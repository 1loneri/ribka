import {getChatGPTUser} from '../../../../chatgpt-auth';
import {personalChatInfo} from '../../../../../lib/twitch-personal-chat';
import {CHAT_CONNECT_URL} from '../../../../../lib/twitch-chat';
export const dynamic='force-dynamic';
export async function GET(){try{
 const user=await getChatGPTUser(),info=user?await personalChatInfo(user.userId):null;
 return Response.json({authenticated:!!user,connected:!!info,canSend:!!info,channel:info?.channel??null,connectUrl:CHAT_CONNECT_URL},{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Не удалось проверить подключение Twitch.'},{status:503,headers:{'Cache-Control':'no-store'}});}}
