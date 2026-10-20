import {env} from 'cloudflare:workers';
import {validUuid,type ReviewRow} from '../../../../lib/reviews/model';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRole} from '../../../../lib/streamer-auth';
export const dynamic='force-dynamic';
export function byteRange(value:string|null,size:number):{offset:number;length:number}|null{
 if(!value)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(value);if(!match||!match[1]&&!match[2])throw Error('Invalid range');
 let start:number,end:number;
 if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)throw Error('Invalid range');start=Math.max(0,size-suffix);end=size-1;}
 else{start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),size-1):size-1;}
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)throw Error('Invalid range');
 return {offset:start,length:end-start+1};
}
export async function serveReviewVideo(req:Request,head=false,forGame=false){try{
 const id=new URL(req.url).searchParams.get('id');if(!validUuid(id))return new Response(null,{status:404});
 const row=await env.DB!.prepare("SELECT video_key,video_size,purpose,owner FROM demo_reviews WHERE id=? AND status IN ('queued','reviewing','reviewed','declined') AND duration_ms>0 AND duration_ms<=120000").bind(id).first<Pick<ReviewRow,'video_key'|'video_size'|'purpose'|'owner'>>();
 if(!row?.video_key||!row.video_size||!env.BUCKET)return new Response(null,{status:404});
 if(row.purpose==='guess'&&!forGame){const user=await getChatGPTUser(),role=await getRole(user);if(!user||row.owner!==user.userId&&!role.admin&&!role.streamer)return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});}
 const metadata=await env.BUCKET.head(row.video_key);if(!metadata||metadata.size!==row.video_size)return new Response(null,{status:404});
 const headers=new Headers({'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':row.purpose==='guess'?'no-store':'private, max-age=60','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Disposition':'inline; filename="'+id+'.mp4"',ETag:metadata.httpEtag});
 let range;
 try{range=byteRange(req.headers.get('range'),metadata.size);}catch{headers.set('Content-Range','bytes */'+metadata.size);return new Response(null,{status:416,headers});}
 if(!range&&req.headers.get('if-none-match')===metadata.httpEtag)return new Response(null,{status:304,headers});
 headers.set('Content-Length',String(range?.length??metadata.size));if(range)headers.set('Content-Range','bytes '+range.offset+'-'+(range.offset+range.length-1)+'/'+metadata.size);
 if(head)return new Response(null,{status:range?206:200,headers});
 const object=await env.BUCKET.get(row.video_key,range?{range}:undefined);if(!object||!('body' in object))return new Response(null,{status:404});
 return new Response(object.body,{status:range?206:200,headers});
 }catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}}
export function GET(req:Request){return serveReviewVideo(req);}
export function HEAD(req:Request){return serveReviewVideo(req,true);}
