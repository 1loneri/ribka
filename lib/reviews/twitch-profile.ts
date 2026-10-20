import {env} from 'cloudflare:workers';
import {tokenRequest} from '../twitch-api';
import type {FishingIdentity} from '../fishing/identity';

type Profile={id:string;login:string;avatar:string;updated:number};
let appToken:{value:string;until:number}|null=null;
let tokenPending:Promise<string>|null=null;
async function token():Promise<string>{
 if(appToken&&appToken.until>Date.now()+60000)return appToken.value;
 if(!tokenPending)tokenPending=tokenRequest({grant_type:'client_credentials'}).then(result=>{
  if(!result.access_token||!result.expires_in)throw Error('Twitch не выдал доступ к аватаркам.');
  appToken={value:result.access_token,until:Date.now()+result.expires_in*1000};return result.access_token;
 }).finally(()=>{tokenPending=null;});
 return tokenPending;
}
export async function reviewTwitchProfile(identity:FishingIdentity):Promise<Profile>{
 const cached=await env.DB!.prepare('SELECT twitch_id AS id,login,avatar,updated FROM demo_profiles WHERE twitch_id=?').bind(identity.twitchId).first<Profile>();
 if(cached&&cached.updated>Date.now()-86400000)return cached;
 try{
  let response=await fetch('https://api.twitch.tv/helix/users?id='+encodeURIComponent(identity.twitchId),{headers:{'Client-Id':env.TWITCH_CLIENT_ID!,Authorization:'Bearer '+await token()},signal:AbortSignal.timeout(10000)});
  if(response.status===401){appToken=null;response=await fetch('https://api.twitch.tv/helix/users?id='+encodeURIComponent(identity.twitchId),{headers:{'Client-Id':env.TWITCH_CLIENT_ID!,Authorization:'Bearer '+await token()},signal:AbortSignal.timeout(10000)});}
  if(!response.ok)throw Error('Не удалось загрузить профиль Twitch.');
  const data=await response.json() as {data:{id:string;login:string;profile_image_url:string}[]},profile=data.data?.find(p=>p.id===identity.twitchId);
  if(!profile||!/^[a-z0-9_]{1,25}$/i.test(profile.login))throw Error('Профиль Twitch не найден.');
  const avatar=new URL(profile.profile_image_url);
  if(avatar.protocol!=='https:'||avatar.hostname!=='static-cdn.jtvnw.net'||avatar.port||profile.profile_image_url.length>1000)throw Error('Twitch не вернул аватарку.');
  const result={id:profile.id,login:profile.login.toLowerCase(),avatar:avatar.toString(),updated:Date.now()};
  await env.DB!.prepare('INSERT INTO demo_profiles(twitch_id,login,avatar,updated) VALUES(?,?,?,?) ON CONFLICT(twitch_id) DO UPDATE SET login=excluded.login,avatar=excluded.avatar,updated=excluded.updated').bind(result.id,result.login,result.avatar,result.updated).run();
  return result;
 }catch(error){if(cached)return cached;throw error;}
}
