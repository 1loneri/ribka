import {env} from 'cloudflare:workers';
import type {ChatGPTUser} from '../app/chatgpt-auth';
export const ADMIN_TWITCH_LOGIN='lick0ver';
export async function getRole(u:ChatGPTUser|null){
 if(!u)return {admin:false,streamer:null};
 // Only OAuth-verified account mappings grant Twitch-based administration.
 // Profile search, display names, and channels being watched never grant access.
 const linked=await env.DB!.prepare('SELECT username FROM fishing_accounts WHERE user=?').bind(u.userId).first<{username:string}>();
 const identity=linked??await env.DB!.prepare('SELECT channel AS username FROM twitch_connections WHERE user=?').bind(u.userId).first<{username:string}>();
 const admin=identity?.username.toLowerCase()===ADMIN_TWITCH_LOGIN||!!env.SITE_ADMIN_EMAIL&&u.email.toLowerCase()===env.SITE_ADMIN_EMAIL.toLowerCase();
 const streamer=await env.DB!.prepare('SELECT channel,name FROM streamers WHERE email=?').bind(u.email.toLowerCase()).first<{channel:string;name:string}>();
 return {admin,streamer};
}
