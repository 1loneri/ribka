import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRole} from '../../../../lib/streamer-auth';
import {encryptSecret} from '../../../../lib/twitch-secrets';
import {REDIRECT_URI,TWITCH_ORIGIN,stateHash,tokenRequest} from '../../../../lib/twitch-api';
import {validCommunityReturn} from '../../../../lib/community/navigation';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 let returnTo='/studio';
 const back=(reason:string)=>{const target=new URL(returnTo,TWITCH_ORIGIN);target.searchParams.set('twitch',reason);return Response.redirect(target.toString(),302);};
 try{
  const u=await getChatGPTUser();if(!u)return back('Требуется вход в исходный аккаунт сайта.');
  const q=new URL(req.url).searchParams,state=q.get('state')??'';
  if(!/^[a-f0-9]{64}$/.test(state))return back('Недействительное состояние авторизации.');
  const row=await env.DB!.prepare('DELETE FROM twitch_states WHERE id=? AND user=? AND expires>? RETURNING email,expected,return_to,purpose').bind(await stateHash(state),u.userId,Date.now()).first<{email:string;expected:string|null;return_to:string;purpose:string}>();
  if(!row)return back('Ссылка устарела или уже использована. Подключите канал ещё раз.');
  if(validCommunityReturn(row.return_to)||/^\/(giveaways|studio)\/[a-zA-Z0-9_-]{1,100}$/.test(row.return_to)||['/reviews','/reviews/guess-form','/feedback'].includes(row.return_to)||/^\/reviews\/guess(?:\?channel=[a-z0-9_]{1,25})?$/.test(row.return_to)||row.return_to==='/levels'||row.return_to==='/levels?tab=profile'||row.return_to==='/fishing'||/^\/fishing\?channel=[a-z0-9_]{1,25}$/.test(row.return_to))returnTo=row.return_to;
  const player=row.purpose==='player',bot=row.purpose==='bot',chat=row.purpose==='chat',role=await getRole(u);
  if(!player&&!chat&&!role.admin&&!role.streamer)return back('Нет доступа стримера.');
  if(q.get('error'))return back('Подключение Twitch отменено.');
  const code=q.get('code');if(!code)return back('Twitch не вернул код авторизации.');
  const t=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:REDIRECT_URI});
  const valid=await fetch('https://id.twitch.tv/oauth2/validate',{headers:{Authorization:'OAuth '+t.access_token},signal:AbortSignal.timeout(10000)});
  if(!valid.ok)return back('Twitch не подтвердил токен.');
  const v=await valid.json() as {client_id:string;user_id:string;login:string;scopes:string[]};
  if(v.client_id!==env.TWITCH_CLIENT_ID||!/^\d+$/.test(v.user_id??'')||!(/^[a-z0-9_]{1,25}$/i.test(v.login??'')))return back('Не удалось подтвердить Twitch-профиль.');
  if(!player&&!(chat?['user:write:chat']:bot?['user:read:chat','user:write:chat']:['user:read:chat','user:write:chat','channel:manage:redemptions']).every(scope=>v.scopes.includes(scope)))return back('Не получены необходимые разрешения Twitch.');
  if(row.expected&&v.login.toLowerCase()!==row.expected.toLowerCase())return back('Подключён другой Twitch-канал. Войдите в назначенный канал.');
  const link=env.DB!.prepare('INSERT INTO fishing_accounts (user,twitch_id,username,linked_at) VALUES (?,?,?,?) ON CONFLICT(user) DO UPDATE SET twitch_id=excluded.twitch_id,username=excluded.username,linked_at=excluded.linked_at').bind(u.userId,v.user_id,v.login.toLowerCase(),Date.now());
  if(player){await link.run();return back('player-connected');}
  if(chat){
   const access=await encryptSecret(t.access_token,'chat-access:'+u.userId),refresh=await encryptSecret(t.refresh_token,'chat-refresh:'+u.userId);
   await env.DB!.batch([env.DB!.prepare('INSERT INTO twitch_chat_connections (user,email,broadcaster,channel,access,refresh,expires,scopes) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user) DO UPDATE SET email=excluded.email,broadcaster=excluded.broadcaster,channel=excluded.channel,access=excluded.access,refresh=excluded.refresh,expires=excluded.expires,scopes=excluded.scopes').bind(u.userId,row.email,v.user_id,v.login.toLowerCase(),access,refresh,Date.now()+t.expires_in*1000,JSON.stringify(v.scopes)),link]);
   return back('chat-connected');
  }
  if(bot){
   const access=await encryptSecret(t.access_token,'bot-access:'+u.userId),refresh=await encryptSecret(t.refresh_token,'bot-refresh:'+u.userId);
   await env.DB!.batch([env.DB!.prepare('INSERT INTO twitch_bot_connections (user,email,broadcaster,channel,access,refresh,expires,scopes) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user) DO UPDATE SET email=excluded.email,broadcaster=excluded.broadcaster,channel=excluded.channel,access=excluded.access,refresh=excluded.refresh,expires=excluded.expires,scopes=excluded.scopes').bind(u.userId,row.email,v.user_id,v.login.toLowerCase(),access,refresh,Date.now()+t.expires_in*1000,JSON.stringify(v.scopes)),link]);
   return back('bot-connected');
  }
  const access=await encryptSecret(t.access_token,'access:'+u.userId),refresh=await encryptSecret(t.refresh_token,'refresh:'+u.userId);
  const statements=[env.DB!.prepare('INSERT INTO twitch_connections (user,email,broadcaster,channel,access,refresh,expires,scopes) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(user) DO UPDATE SET email=excluded.email,broadcaster=excluded.broadcaster,channel=excluded.channel,access=excluded.access,refresh=excluded.refresh,expires=excluded.expires,scopes=excluded.scopes').bind(u.userId,row.email,v.user_id,v.login.toLowerCase(),access,refresh,Date.now()+t.expires_in*1000,JSON.stringify(v.scopes))];
  statements.push(link);
  if(role.admin&&!role.streamer)statements.push(env.DB!.prepare('INSERT INTO streamers (email,channel,name) VALUES (?,?,?) ON CONFLICT(email) DO UPDATE SET channel=excluded.channel,name=excluded.name').bind(row.email,v.login.toLowerCase(),v.login));
  await env.DB!.batch(statements);
  return back('connected');
 }catch{return back('Не удалось завершить подключение Twitch. Попробуйте ещё раз.');}
}
