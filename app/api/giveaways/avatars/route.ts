import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {channelConnection} from '../../../../lib/twitch-bot/channels';
import {helix} from '../../../../lib/twitch-api';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const id=new URL(req.url).searchParams.get('id')??'',u=await getChatGPTUser(),db=env.DB!;
 const g=await db.prepare('SELECT owner,channel,status,hidden FROM giveaways WHERE id=?').bind(id).first<{owner:string;channel:string;status:string;hidden:number}>();
 if(!g||((g.hidden||g.status==='draft')&&g.owner!==u?.userId))return Response.json({error:'Розыгрыш не найден.'},{status:404});
 const rows=await db.prepare('SELECT user,name,avatar FROM entries WHERE giveaway=? ORDER BY winner DESC,created,user LIMIT 100').bind(id).all<{user:string;name:string;avatar:string|null}>();
 const missing=rows.results.filter(row=>!row.avatar&&/^twitch:\d+$/.test(row.user));
 if(missing.length){
  const connection=await channelConnection(g.owner,g.channel),query=new URLSearchParams();for(const row of missing)query.append('id',row.user.slice(7));
  const response=await helix(connection,'users?'+query),data=await response.json() as {data:{id:string;profile_image_url:string}[]};
  const statements=[];
  for(const profile of data.data??[]){const user='twitch:'+profile.id,row=rows.results.find(r=>r.user===user);let url:URL;try{url=new URL(profile.profile_image_url);}catch{continue;}
   if(!row||url.protocol!=='https:'||url.hostname!=='static-cdn.jtvnw.net')continue;
   row.avatar=url.toString();statements.push(db.prepare('UPDATE entries SET avatar=? WHERE giveaway=? AND user=?').bind(row.avatar,id,user));
  }
  if(statements.length)await db.batch(statements);
 }
 return Response.json({people:rows.results},{headers:{'Cache-Control':'private, max-age=60'}});
}catch{return Response.json({error:'Не удалось загрузить Twitch-аватарки. Показываем инициалы.'},{status:503});}}
