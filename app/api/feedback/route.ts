import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {getRole,ADMIN_TWITCH_LOGIN} from '../../../lib/streamer-auth';
import {fishingIdentity} from '../../../lib/fishing/identity';
import {canPublishFeedback} from '../../../lib/feedback/access';
import {FEEDBACK_CONNECT_URL,feedbackDateTimestamp,feedbackPostUrl,publicFeedback,type FeedbackRow} from '../../../lib/feedback/model';
import {FeedbackImageError,inspectFeedbackImage,readFeedbackImage} from '../../../lib/feedback/images';
import {validUuid} from '../../../lib/reviews/model';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const db=()=>{if(!env.DB)throw Error('Database unavailable');return env.DB;};
const publisherSql='COALESCE((SELECT lower(username) FROM fishing_accounts WHERE user=?),(SELECT lower(channel) FROM twitch_connections WHERE user=?))=?';

export async function GET(req:Request){try{
 const q=new URL(req.url).searchParams,after=q.get('after'),afterId=q.get('afterId');
 if(after!==null&&(!Number.isSafeInteger(Number(after))||Number(after)<0||!validUuid(afterId)))return reply({error:'Неверная страница.'},400);
 const user=await getChatGPTUser(),[role,identity]=await Promise.all([getRole(user),fishingIdentity(user)]);
 const rows=await (after===null?db().prepare('SELECT * FROM giveaway_feedback WHERE deleted=0 ORDER BY created DESC,id DESC LIMIT 25'):db().prepare('SELECT * FROM giveaway_feedback WHERE deleted=0 AND (created<? OR (created=? AND id<?)) ORDER BY created DESC,id DESC LIMIT 25').bind(Number(after),Number(after),afterId)).all<FeedbackRow>();
 const items=rows.results.slice(0,24),last=items.at(-1);
 return reply({items:items.map(publicFeedback),next:rows.results.length>24&&last?{at:last.created,id:last.id}:null,user:user?{name:user.displayName}:null,admin:role.admin,canStream:!!role.streamer,canUpload:identity?.username.toLowerCase()===ADMIN_TWITCH_LOGIN,linked:!!identity,connectUrl:FEEDBACK_CONNECT_URL});
}catch{return reply({error:'Не удалось загрузить отзывы. Попробуй ещё раз.'},503);}}

export async function POST(req:Request){let key:string|null=null;try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди в аккаунт lick0ver.',connectUrl:FEEDBACK_CONNECT_URL},401);
 if(!await canPublishFeedback(user))return reply({error:'Добавлять отзывы может только подтверждённый Twitch-аккаунт lick0ver.',connectUrl:FEEDBACK_CONNECT_URL},403);
 const id=new URL(req.url).searchParams.get('id');if(!validUuid(id))return reply({error:'Обнови форму загрузки.'},400);
 const declared=(req.headers.get('content-type')??'').split(';')[0].toLowerCase();
 if(!['image/png','image/jpeg','image/webp'].includes(declared))return reply({error:'Поддерживаются PNG, JPG и WebP.'},415);
 const bytes=await readFeedbackImage(req),info=inspectFeedbackImage(bytes);if(info.mime!==declared)return reply({error:'Формат файла не совпадает с изображением.'},415);
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 const previous=await db().prepare('SELECT * FROM giveaway_feedback WHERE id=?').bind(id).first<FeedbackRow>();
 if(previous){if(previous.deleted)return reply({error:'Это изображение удалено. Выбери файл заново.'},410);if(previous.digest!==digest)return reply({error:'Файл изменился. Выбери его заново.'},409);return reply({item:publicFeedback(previous),replayed:true});}
 if(!env.BUCKET)throw Error('Storage unavailable');
 key='giveaway-feedback/'+id+'/'+crypto.randomUUID()+'.'+info.extension;
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:info.mime}});
 const saved=await db().prepare(`INSERT OR IGNORE INTO giveaway_feedback(id,owner,image_key,mime,bytes,width,height,digest,created) SELECT ?,?,?,?,?,?,?,?,? WHERE ${publisherSql}`).bind(id,user.userId,key,info.mime,bytes.length,info.width,info.height,digest,Date.now(),user.userId,user.userId,ADMIN_TWITCH_LOGIN).run();
 const row=await db().prepare('SELECT * FROM giveaway_feedback WHERE id=?').bind(id).first<FeedbackRow>();
 if(row?.image_key!==key){await env.BUCKET.delete(key);key=null;}
 if(!saved.meta.changes&&!await canPublishFeedback(user))return reply({error:'Войди в подтверждённый Twitch-аккаунт lick0ver.'},403);
 if(!row)throw Error('Publication unavailable');
 if(row.deleted)return reply({error:'Изображение уже удалено.'},410);
 if(row.digest!==digest)return reply({error:'Этот запрос уже использован для другого изображения.'},409);
 return reply({item:publicFeedback(row),replayed:!saved.meta.changes},saved.meta.changes?201:200);
}catch(error){
 if(key&&env.BUCKET)try{const retained=await db().prepare('SELECT id FROM giveaway_feedback WHERE image_key=?').bind(key).first();if(!retained)await env.BUCKET.delete(key);}catch{}
 return reply({error:error instanceof FeedbackImageError?error.message:'Не удалось загрузить изображение. Можно повторить без дубликата.'},error instanceof FeedbackImageError?error.status:503);
}}

export async function PATCH(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди в аккаунт lick0ver.'},401);
 if(!await canPublishFeedback(user))return reply({error:'Изменять отзывы может только lick0ver.'},403);
 const id=new URL(req.url).searchParams.get('id');if(!validUuid(id))return reply({error:'Изображение не найдено.'},404);
 let body:unknown;try{body=await req.json();}catch{return reply({error:'Проверь дату и ссылку.'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body))return reply({error:'Проверь дату и ссылку.'},400);
 const fields=body as Record<string,unknown>,changes:string[]=[],values:(string|number|null)[]=[];
 if(Object.hasOwn(fields,'date')){const created=feedbackDateTimestamp(fields.date);if(created===null)return reply({error:'Выбери корректную дату.'},400);changes.push('created=?');values.push(created);}
 if(Object.hasOwn(fields,'postUrl')){const postUrl=feedbackPostUrl(fields.postUrl);if(postUrl===undefined)return reply({error:'Вставь полную ссылку на пост, начиная с https:// или http://.'},400);changes.push('post_url=?');values.push(postUrl);}
 if(!changes.length)return reply({error:'Укажи дату или ссылку.'},400);
 const saved=await db().prepare(`UPDATE giveaway_feedback SET ${changes.join(',')} WHERE id=? AND deleted=0 AND ${publisherSql} RETURNING *`).bind(...values,id,user.userId,user.userId,ADMIN_TWITCH_LOGIN).first<FeedbackRow>();
 if(!saved){if(!await canPublishFeedback(user))return reply({error:'Изменять отзывы может только lick0ver.'},403);return reply({error:'Изображение не найдено или удалено.'},404);}
 return reply({item:publicFeedback(saved)});
}catch{return reply({error:'Не удалось сохранить отзыв. Попробуй ещё раз.'},503);}}

export async function DELETE(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди в аккаунт lick0ver.'},401);
 if(!await canPublishFeedback(user))return reply({error:'Удалять отзывы может только lick0ver.'},403);
 const id=new URL(req.url).searchParams.get('id');if(!validUuid(id))return reply({error:'Изображение не найдено.'},404);
 const row=await db().prepare('SELECT image_key FROM giveaway_feedback WHERE id=?').bind(id).first<{image_key:string}>();if(!row)return reply({ok:true});
 const hidden=await db().prepare(`UPDATE giveaway_feedback SET deleted=1 WHERE id=? AND ${publisherSql}`).bind(id,user.userId,user.userId,ADMIN_TWITCH_LOGIN).run();
 if(!hidden.meta.changes)return reply({error:'Удалять отзывы может только lick0ver.'},403);
 if(!env.BUCKET)throw Error('Storage unavailable');await env.BUCKET.delete(row.image_key);
 return reply({ok:true});
}catch{return reply({error:'Отзыв скрыт. Повтори удаление, чтобы завершить удаление файла.'},503);}}
