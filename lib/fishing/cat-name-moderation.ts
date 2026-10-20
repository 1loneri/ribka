import {channelConnection,botRoom} from '../twitch-bot/channels';
import {helix} from '../twitch-api';
import {compactCatName,validateCatName} from './cat-names';
import type {Game} from './storage';
export async function moderateCatName(g:Game,candidate:string):Promise<string|null>{
 const local=validateCatName(candidate);if(local.error)return local.error;
 let connection:Awaited<ReturnType<typeof channelConnection>>;
 try{connection=await channelConnection(g.owner,g.channel);}catch{return 'Не удалось проверить подключение Twitch. Попробуй позже.';}
 if(!connection.permissions.some(p=>p==='moderator:read:blocked_terms'||p==='moderator:manage:blocked_terms'))return null;
 try{
  const room=await botRoom(g.channel),broadcaster=room?.broadcaster??connection.broadcaster;let cursor='';
  for(let page=0;page<20;page++){
   const params=new URLSearchParams({broadcaster_id:broadcaster,moderator_id:connection.broadcaster,first:'100',...(cursor?{after:cursor}:{})});
   const response=await helix(connection,'moderation/blocked_terms?'+params),body=await response.json() as {data:{text:string;expires_at:string|null}[];pagination?:{cursor?:string}};
   if(body.data.some(t=>(!t.expires_at||Date.parse(t.expires_at)>Date.now())&&compactCatName(local.name).includes(compactCatName(t.text.replace(/\*/g,'')))))return 'Имя запрещено в чате этого канала. Выбери другое.';
   cursor=body.pagination?.cursor??'';if(!cursor)return null;
  }
  return 'Не удалось полностью проверить словарь канала. Попробуй позже.';
 }catch{return 'Не удалось проверить имя в Twitch. Попробуй позже.';}
}
