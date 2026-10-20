import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../../chatgpt-auth';
import {fishingIdentity} from '../../../../lib/fishing/identity';
import {MAX_VIDEO_BYTES,publicReview,validUuid,type ReviewRow} from '../../../../lib/reviews/model';
import {inspectMP4} from '../../../../lib/reviews/video';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function PUT(req:Request){
 let locked:ReviewRow|null=null;
 try{
  if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
  const user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт.'},401);
  const id=new URL(req.url).searchParams.get('id');if(!validUuid(id))return reply({error:'Анкета не найдена.'},404);
  const db=env.DB!,bucket=env.BUCKET;if(!bucket)return reply({error:'Хранилище видео недоступно.'},503);
  const row=await db.prepare('SELECT * FROM demo_reviews WHERE id=? AND owner=?').bind(id,user.userId).first<ReviewRow>();if(!row)return reply({error:'Анкета не найдена.'},404);
  const identity=await fishingIdentity(user);if(!identity||identity.twitchId!==row.twitch_id)return reply({error:'Войди в Twitch-аккаунт, от которого подана анкета.'},403);
  if(['queued','reviewing','reviewed','declined'].includes(row.status))return reply({item:publicReview(row,user.userId),replayed:true});
  if(row.status!=='uploading'||!row.video_key||row.updated<Date.now()-3600000)return reply({error:'Загрузка занята или устарела. Обнови список своих анкет.'},409);
  const length=Number(req.headers.get('content-length'));
  if(!Number.isSafeInteger(length)||length<32||length>MAX_VIDEO_BYTES||length!==row.video_size||!req.body)return reply({error:'Размер файла изменился или превышает 80 МБ. Выбери исходный MP4.'},413);
  const claim=await db.prepare("UPDATE demo_reviews SET status='validating',updated=? WHERE id=? AND owner=? AND status='uploading'").bind(Date.now(),id,user.userId).run();if(!claim.meta.changes)return reply({error:'Видео уже загружается.'},409);
  locked=row;
  // Stream the HTTP body directly into R2: an 80 MB upload never becomes an 80 MB Worker buffer.
  const object=await bucket.put(row.video_key,req.body,{httpMetadata:{contentType:'video/mp4'}});
  if(!object||object.size!==length)throw Error('Файл загрузился не полностью. Повтори загрузку.');
  const duration=await inspectMP4({size:object.size,async read(offset,length){
   const part=await bucket.get(row.video_key!,{range:{offset,length}});if(!part||!('arrayBuffer' in part))throw Error('Не удалось проверить видео.');return new Uint8Array(await part.arrayBuffer());
  }});
  const saved=await db.prepare("UPDATE demo_reviews SET status='queued',duration_ms=?,updated=? WHERE id=? AND owner=? AND status='validating'").bind(Math.min(120000,Math.ceil(duration*1000)),Date.now(),id,user.userId).run();if(!saved.meta.changes)throw Error('Не удалось подтвердить загрузку.');
  locked=null;const ready=await db.prepare('SELECT * FROM demo_reviews WHERE id=?').bind(id).first<ReviewRow>();return reply({item:publicReview(ready!,user.userId)});
 }catch(error){
  if(locked){
   try{await env.BUCKET!.delete(locked.video_key!);await env.DB!.prepare("UPDATE demo_reviews SET status='uploading',updated=? WHERE id=? AND status='validating'").bind(Date.now(),locked.id).run();}catch{/* A failed cleanup remains unpublished and is removed with abandoned uploads. */}
   return reply({error:error instanceof Error?error.message:'Не удалось проверить видео.'},422);
  }
  return reply({error:'Не удалось загрузить видео. Анкета не опубликована, можно повторить попытку.'},503);
 }
}
