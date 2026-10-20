import {env} from 'cloudflare:workers';
import {redirect} from 'next/navigation';
import {requireChatGPTUser} from '../../chatgpt-auth';
import {getRole} from '../../../lib/streamer-auth';
import Studio from '../../giveaways/[id]/studio';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ProtectedStudio id={id}/>;}
async function ProtectedStudio({id}:{id:string}){const user=await requireChatGPTUser('/studio/'+encodeURIComponent(id));const role=await getRole(user);if(!role.streamer)redirect('/studio');const own=await env.DB!.prepare('SELECT id FROM giveaways WHERE id=? AND owner=?').bind(id,user.userId).first();if(!own)redirect('/studio');return <Studio id={id} studioMode/>;}
