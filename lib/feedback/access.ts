import type {ChatGPTUser} from '../../app/chatgpt-auth';
import {fishingIdentity} from '../fishing/identity';
import {ADMIN_TWITCH_LOGIN} from '../streamer-auth';

export async function canPublishFeedback(user:ChatGPTUser|null){
 const identity=await fishingIdentity(user);
 return identity?.username.toLowerCase()===ADMIN_TWITCH_LOGIN;
}
