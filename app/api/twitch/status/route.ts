import {env} from 'cloudflare:workers';
import {getChatGPTUser,chatGPTSignInPath} from '../../../chatgpt-auth';
import {getRole} from '../../../../lib/streamer-auth';
import {hasChatWriteScope} from '../../../../lib/twitch-chat';
export const dynamic='force-dynamic';
export async function GET(){try{const u=await getChatGPTUser();if(!u)return Response.json({authenticated:false,connected:false,canConnect:false,canSend:false,signInUrl:chatGPTSignInPath('/fishing')},{headers:{'Cache-Control':'no-store'}});const role=await getRole(u);const row=await env.DB!.prepare('SELECT channel,scopes FROM twitch_connections WHERE user=?').bind(u.userId).first<{channel:string;scopes:string}>();const canConnect=role.admin||!!role.streamer;return Response.json({authenticated:true,connected:!!row,channel:row?.channel,canConnect,canSend:canConnect&&!!row&&hasChatWriteScope(row.scopes)},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Не удалось проверить подключение.'},{status:503,headers:{'Cache-Control':'no-store'}});}}
