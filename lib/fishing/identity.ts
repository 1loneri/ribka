import type {ChatGPTUser} from '../../app/chatgpt-auth';
import {fishDb} from './storage';

export const PLAYER_CONNECT_URL='/api/twitch/connect?purpose=player&return_to=/fishing';
export type FishingIdentity={twitchId:string;username:string};
export async function fishingIdentity(user:ChatGPTUser|null):Promise<FishingIdentity|null>{
  if(!user)return null;
  const db=fishDb();
  const linked=await db.prepare('SELECT twitch_id AS twitchId,username FROM fishing_accounts WHERE user=?').bind(user.userId).first<FishingIdentity>();
  if(linked)return linked;
  // Streamers who connected Twitch earlier can play without another OAuth flow.
  return db.prepare('SELECT broadcaster AS twitchId,channel AS username FROM twitch_connections WHERE user=?').bind(user.userId).first<FishingIdentity>();
}
