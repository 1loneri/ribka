import {env} from 'cloudflare:workers';
import {validUuid} from '../../../../lib/reviews/model';
import type {FeedbackRow} from '../../../../lib/feedback/model';
export const dynamic='force-dynamic';
const missing=()=>new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
async function serve(req:Request,head=false){try{
 const id=new URL(req.url).searchParams.get('id');if(!validUuid(id))return missing();
 const row=await env.DB!.prepare('SELECT * FROM giveaway_feedback WHERE id=? AND deleted=0').bind(id).first<FeedbackRow>();
 if(!row||!env.BUCKET||!['image/png','image/jpeg','image/webp'].includes(row.mime))return missing();
 const object=await env.BUCKET.head(row.image_key);if(!object||object.size!==row.bytes)return missing();
 const headers=new Headers({'Content-Type':row.mime,'Content-Length':String(row.bytes),'Cache-Control':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Content-Disposition':'inline; filename="feedback-'+id+'.'+(row.mime==='image/jpeg'?'jpg':row.mime.split('/')[1])+'"',ETag:object.httpEtag});
 if(req.headers.get('if-none-match')===object.httpEtag){headers.delete('Content-Length');return new Response(null,{status:304,headers});}
 if(head)return new Response(null,{headers});
 const stored=await env.BUCKET.get(row.image_key);if(!stored||!('body' in stored))return missing();
 return new Response(stored.body,{headers});
}catch{return new Response(null,{status:503,headers:{'Cache-Control':'no-store'}});}}
export const GET=(req:Request)=>serve(req);
export const HEAD=(req:Request)=>serve(req,true);
