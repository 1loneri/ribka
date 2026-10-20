import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {getRole} from '../../../lib/streamer-auth';
import {fishingIdentity} from '../../../lib/fishing/identity';
import {reviewTwitchProfile} from '../../../lib/reviews/twitch-profile';
import {MAX_VIDEO_BYTES,REVIEW_CONNECT_URL,reviewConnectUrl,normalizeRiotId,publicReview,ranks,validUuid,type ReviewRow,type ReviewPurpose} from '../../../lib/reviews/model';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const db=()=>{if(!env.DB)throw Error('Database unavailable');return env.DB;};

export async function GET(req:Request){try{
 const user=await getChatGPTUser(),role=await getRole(user),q=new URL(req.url).searchParams,section=q.get('view')??'queue';
 if(!['queue','done','mine'].includes(section))return reply({error:'Неизвестный раздел.'},400);
 if(section==='mine'&&!user)return reply({error:'Войди, чтобы увидеть свои анкеты.'},401);
 const identity=await fishingIdentity(user);
 let profile=null,profileError='';
 if(identity)try{profile=await reviewTwitchProfile(identity);}catch{profileError='Не удалось загрузить аватарку Twitch. Попробуй обновить страницу.';}
 const search=(q.get('q')??'').trim().slice(0,60),at=q.get('after'),afterId=q.get('afterId');
 if(at!==null&&(!Number.isSafeInteger(Number(at))||Number(at)<0||!validUuid(afterId)))return reply({error:'Неверная страница.'},400);
 const purpose=q.get('purpose')??'review';
 if(!['review','guess'].includes(purpose))return reply({error:'Неизвестный тип анкеты.'},400);
 const where=section==='mine'?"owner=? AND status!='deleted'":section==='done'?"status IN ('reviewed','declined')":"status IN ('queued','reviewing')";
 const values:unknown[]=section==='mine'?[user!.userId]:[];
 let filter=where+' AND purpose=?';values.push(purpose);
 // Guessing submissions are private to their author and approved organizers.
 if(purpose==='guess'&&!role.admin&&!role.streamer&&section!=='mine'){filter+=' AND owner=?';values.push(user?.userId??'');}
 if(!role.admin&&section!=='mine'){filter+=" AND NOT EXISTS (SELECT 1 FROM rank_guess_games g WHERE g.review_id=demo_reviews.id AND g.state='voting' AND g.expires>?)";values.push(Date.now());}
 if(search){filter+=' AND (riot_id LIKE ? OR twitch_name LIKE ?)';values.push('%'+search+'%','%'+search+'%');}
 if(at!==null){filter+=' AND (created>? OR (created=? AND id>?))';values.push(Number(at),Number(at),afterId);}
 const rows=await db().prepare('SELECT * FROM demo_reviews WHERE '+filter+' ORDER BY created,id LIMIT 25').bind(...values).all<ReviewRow>(),page=rows.results.slice(0,24),last=page.at(-1);
 const stats=await db().prepare("SELECT SUM(CASE WHEN status IN ('queued','reviewing') THEN 1 ELSE 0 END) queued,SUM(CASE WHEN status='reviewed' THEN 1 ELSE 0 END) reviewed FROM demo_reviews WHERE purpose=?").bind(purpose).first<{queued:number|null;reviewed:number|null}>();
 return reply({items:page.map(row=>publicReview(row,user?.userId)),next:rows.results.length>24&&last?{at:last.created,id:last.id}:null,stats:{queued:stats?.queued??0,reviewed:stats?.reviewed??0},user:user?{name:user.displayName}:null,canManage:role.admin,canStream:!!role.streamer,me:identity?{username:profile?.login??identity.username,avatar:profile?.avatar??null}:null,profileError,connectUrl:reviewConnectUrl(purpose as ReviewPurpose)});
 }catch{return reply({error:'Не удалось загрузить анкеты. Попробуй ещё раз.'},503);}}

export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт, чтобы подать анкету.',connectUrl:REVIEW_CONNECT_URL},401);
 const raw=await req.text();if(raw.length>4096)return reply({error:'Анкета слишком большая.'},413);
 let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{return reply({error:'Не удалось прочитать анкету.'},400);}
 if(!body||!validUuid(body.requestId))return reply({error:'Обнови форму и попробуй ещё раз.'},400);
 const riotId=normalizeRiotId(body.riotId),rank=ranks.find(r=>r.id===body.rank),question=typeof body.question==='string'?body.question.trim():'';
 if(!riotId)return reply({error:'Укажи Riot ID в формате Ник#TAG: ник от 3 до 16 символов, тег от 3 до 5 букв или цифр.'},400);
 if(!rank||question.length>1000||body.publish!==true)return reply({error:'Проверь ранг, описание и согласие на публикацию анкеты.'},400);
 const hasVideo=body.videoSize!==undefined&&body.videoSize!==null;
 const purpose=body.purpose??'review';
 if(purpose!=='review'&&purpose!=='guess')return reply({error:'Выбери тип анкеты.'},400);
 if(purpose==='guess'&&(!hasVideo||rank.id==='unrated'))return reply({error:'Для «Угадай ранг» нужны видео и указанный ранг.'},400);
 if(hasVideo&&(!Number.isSafeInteger(body.videoSize)||Number(body.videoSize)<32||Number(body.videoSize)>MAX_VIDEO_BYTES||typeof body.videoName!=='string'||!body.videoName.toLowerCase().endsWith('.mp4')||body.videoName.length>180))return reply({error:'Прикрепи MP4 размером до 80 МБ.'},400);
 if(hasVideo&&!env.BUCKET)return reply({error:'Хранилище видео пока недоступно. Попробуй позже.'},503);
 const identity=await fishingIdentity(user);if(!identity)return reply({error:'Подключи Twitch: ник и аватарка добавятся автоматически.',connectUrl:reviewConnectUrl(purpose)},409);
 const requestId=body.requestId.toLowerCase(),previous=await db().prepare('SELECT * FROM demo_reviews WHERE owner=? AND request_id=?').bind(user.userId,requestId).first<ReviewRow>();
 if(previous){
  if(previous.status==='deleted')return reply({error:'Эта анкета удалена. Отправь новую.'},410);
  if(previous.purpose!==purpose||previous.riot_id!==riotId||previous.rank!==rank.id||previous.question!==question||previous.video_size!==(hasVideo?Number(body.videoSize):null))return reply({error:'Форма изменилась. Отправь её как новую анкету.'},409);
  return reply({item:publicReview(previous,user.userId),uploadUrl:previous.status==='uploading'?'/api/reviews/upload?id='+previous.id:null,replayed:true});
 }
 // Remove abandoned uploads belonging to this account, never somebody else's files.
 const expired=await db().prepare("SELECT id,video_key FROM demo_reviews WHERE owner=? AND status IN ('uploading','validating') AND updated<? LIMIT 10").bind(user.userId,Date.now()-3600000).all<{id:string;video_key:string|null}>();
 for(const row of expired.results){if(row.video_key){if(!env.BUCKET)throw Error('Storage unavailable');await env.BUCKET.delete(row.video_key);}await db().prepare("UPDATE demo_reviews SET status='deleted',video_key=NULL WHERE id=? AND status IN ('uploading','validating') AND updated<?").bind(row.id,Date.now()-3600000).run();}
 const profile=await reviewTwitchProfile(identity),id=crypto.randomUUID(),now=Date.now(),key=hasVideo?'demo-videos/'+id+'.mp4':null;
 const saved=await db().prepare("INSERT INTO demo_reviews(id,owner,request_id,twitch_id,twitch_name,avatar,riot_id,rank,question,status,video_key,video_size,created,updated,purpose) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM demo_reviews WHERE twitch_id=? AND status IN ('queued','reviewing','uploading','validating'))<3 AND (SELECT COUNT(*) FROM demo_reviews WHERE twitch_id=? AND created>?)<5 ON CONFLICT(owner,request_id) DO NOTHING").bind(id,user.userId,requestId,profile.id,profile.login,profile.avatar,riotId,rank.id,question,hasVideo?'uploading':'queued',key,hasVideo?Number(body.videoSize):null,now,now,purpose,profile.id,profile.id,now-86400000).run();
 const row=await db().prepare('SELECT * FROM demo_reviews WHERE owner=? AND request_id=?').bind(user.userId,requestId).first<ReviewRow>();
 if(!row)return reply({error:'Можно держать до трёх анкет в очереди и подавать до пяти за сутки. Дождись разбора или удали лишнюю.'},429);
 if(row.purpose!==purpose||row.riot_id!==riotId||row.rank!==rank.id||row.question!==question||row.video_size!==(hasVideo?Number(body.videoSize):null))return reply({error:'Форма изменилась. Отправь её как новую анкету.'},409);
 return reply({item:publicReview(row,user.userId),uploadUrl:row.status==='uploading'?'/api/reviews/upload?id='+row.id:null,replayed:!saved.meta.changes},saved.meta.changes?201:200);
 }catch{return reply({error:'Не удалось сохранить анкету. Повтори отправку: дубликат не появится.'},503);}}

export async function PATCH(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт.'},401);
 if(!(await getRole(user)).admin)return reply({error:'Управлять очередью может только владелец сайта.'},403);
 const raw=await req.text();if(raw.length>4096)return reply({error:'Запрос слишком большой.'},413);
 let body:{id:unknown;action:unknown;rank:unknown;status:unknown;note:unknown};try{body=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}if(!body||typeof body!=='object')return reply({error:'Некорректный запрос.'},400);
 if(!validUuid(body.id))return reply({error:'Анкета не найдена.'},404);
 let result;
 if(body.action==='verify-rank'){
  if(await db().prepare("SELECT id FROM rank_guess_games WHERE review_id=? AND state='voting' AND expires>? LIMIT 1").bind(body.id,Date.now()).first())return reply({error:'Сначала заверши раунд «Угадай ранг» с этим клипом.'},409);
  const rank=ranks.find(r=>r.id===body.rank);if(!rank)return reply({error:'Выбери ранг.'},400);
  result=await db().prepare("UPDATE demo_reviews SET rank=?,rank_verified_by=?,rank_verified_at=?,updated=? WHERE id=? AND status IN ('queued','reviewing','reviewed','declined')").bind(rank.id,user.userId,Date.now(),Date.now(),body.id).run();
 }else if(body.action==='status'){
  if(typeof body.status!=='string'||!['queued','reviewing','reviewed','declined'].includes(body.status)||typeof body.note!=='string'||body.note.length>1000)return reply({error:'Проверь статус и комментарий (до 1000 символов).'},400);
  result=await db().prepare("UPDATE demo_reviews SET status=?,note=?,updated=? WHERE id=? AND status IN ('queued','reviewing','reviewed','declined')").bind(body.status,body.note.trim(),Date.now(),body.id).run();
 }else return reply({error:'Неизвестное действие.'},400);
 if(!result.meta.changes)return reply({error:'Анкета ещё загружается или уже удалена.'},409);
 const row=await db().prepare('SELECT * FROM demo_reviews WHERE id=?').bind(body.id).first<ReviewRow>();return reply({item:publicReview(row!,user.userId)});
 }catch{return reply({error:'Не удалось обновить анкету.'},503);}}

export async function DELETE(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт.'},401);
 const id=new URL(req.url).searchParams.get('id');if(!validUuid(id))return reply({error:'Анкета не найдена.'},404);
 const row=await db().prepare('SELECT * FROM demo_reviews WHERE id=?').bind(id).first<ReviewRow>();if(!row)return reply({ok:true});
 if(row.owner!==user.userId&&!(await getRole(user)).admin)return reply({error:'Удалить анкету может её автор или владелец сайта.'},403);
 if(row.status==='validating')return reply({error:'Дождись завершения загрузки и повтори удаление.'},409);
 await db().prepare("UPDATE demo_reviews SET status='deleted',updated=? WHERE id=?").bind(Date.now(),id).run();
 if(row.video_key){if(!env.BUCKET)throw Error('Storage unavailable');await env.BUCKET.delete(row.video_key);await db().prepare('UPDATE demo_reviews SET video_key=NULL WHERE id=?').bind(id).run();}
 return reply({ok:true});
 }catch{return reply({error:'Удаление ещё не завершено. Повтори запрос.'},503);}}
