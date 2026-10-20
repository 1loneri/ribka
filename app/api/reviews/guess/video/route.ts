import {guessDb} from '../../../../../lib/reviews/guess-storage';
import {validUuid} from '../../../../../lib/reviews/model';
import {serveReviewVideo} from '../../video/route';
export const dynamic='force-dynamic';
async function serve(req:Request,head=false){try{
 const game=new URL(req.url).searchParams.get('game');if(!validUuid(game))return new Response(null,{status:404});
 const row=await guessDb().prepare("SELECT review_id FROM rank_guess_games WHERE id=? AND state!='cancelled' AND (state='revealed' OR expires>?)").bind(game,Date.now()).first<{review_id:string}>();
 if(!row)return new Response(null,{status:404});
 const url=new URL(req.url);url.search='';url.pathname='/api/reviews/video';url.searchParams.set('id',row.review_id);
 const response=await serveReviewVideo(new Request(url,{method:head?'HEAD':'GET',headers:req.headers}),head,true);
 const headers=new Headers(response.headers);headers.set('Content-Disposition','inline; filename="round-'+game+'.mp4"');headers.set('Cache-Control','no-store');
 return new Response(response.body,{status:response.status,headers});
}catch{return new Response(null,{status:503});}}
export const GET=(req:Request)=>serve(req);
export const HEAD=(req:Request)=>serve(req,true);
