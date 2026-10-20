import type {ChatGPTUser} from '../../app/chatgpt-auth';
import {fishingIdentity} from './identity';

// Use only an account verified by Twitch OAuth, never a display name,
// watched channel, streamer permission or the general site-admin role.
export async function hasFishingAccess(user:ChatGPTUser|null):Promise<boolean>{
 const identity=await fishingIdentity(user);
 return identity?.username.toLowerCase()==='lick0ver';
}

export async function fishingAccessDenied(user:ChatGPTUser|null):Promise<Response|null>{
 if(await hasFishingAccess(user))return null;
 return Response.json({error:'Рыбалка доступна только lick0ver.'},{status:user?403:401,headers:{'Cache-Control':'no-store'}});
}
