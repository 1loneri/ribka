import {env} from 'cloudflare:workers';
const encode=(b:Uint8Array)=>btoa(String.fromCharCode(...b));
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(){if(!env.TWITCH_CREDENTIAL_KEY)throw Error('Credential key unavailable');return crypto.subtle.importKey('raw',decode(env.TWITCH_CREDENTIAL_KEY),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function encryptSecret(value:string,purpose='twitch-client-secret'){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(purpose)},await key(),new TextEncoder().encode(value));return encode(iv)+'.'+encode(new Uint8Array(ciphertext));}
export async function getTwitchSecret(){const row=await env.DB!.prepare("SELECT encrypted FROM integration_secrets WHERE id='twitch-client-secret'").first<{encrypted:string}>();if(!row)return null;return decryptSecret(row.encrypted);}
export async function decryptSecret(encrypted:string,purpose='twitch-client-secret'){const [iv,body]=encrypted.split('.');const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(purpose)},await key(),decode(body));return new TextDecoder().decode(plain);}
