import {winnerRevealDelay} from './giveaway-animation-timing';
import {env} from 'cloudflare:workers';
import type {ChatGPTUser} from '../app/chatgpt-auth';
import {getRole} from './streamer-auth';
import {canOperateRoom} from './twitch-bot/channels';
import {winnerReply,chatText} from './twitch-bot/messages';

const fail=(error:string,status=400)=>Response.json({error},{status});
export async function winnerHistory(owner:string,channel:string){
 return (await env.DB!.prepare(`SELECT *,CASE WHEN state='awaiting' AND deadline<=? THEN 'expired' ELSE state END display_state FROM giveaway_winners WHERE owner=? AND (?='' OR channel=?) ORDER BY chosen_at DESC,id LIMIT 500`).bind(Date.now(),owner,channel,channel).all()).results;
}
export async function featureAction(b:Record<string,unknown>,g:any,u:ChatGPTUser):Promise<Response|null>{
 if(!['settings','exclude','paid','repeat','draw','reroll'].includes(String(b.action)))return null;
 if(!(await getRole(u)).streamer||g.owner!==u.userId)return fail('Доступ только организатору.',403);
 const db=env.DB!,now=Date.now();
 if(b.action==='settings'){
  if(g.status!=='draft'&&g.status!=='active')return fail('Настройки завершённого розыгрыша менять нельзя.');
  if(typeof b.presenceRequired!=='boolean'||typeof b.excludeRepeat!=='boolean')return fail('Проверь настройки.');
  const result=await db.prepare("UPDATE giveaways SET presence_required=?,exclude_repeat=? WHERE id=? AND status IN ('draft','active')").bind(b.presenceRequired?1:0,b.excludeRepeat?1:0,g.id).run();
  return result.meta.changes?Response.json({ok:true}):fail('Розыгрыш уже завершён.',409);
 }
 if(b.action==='exclude'){
  if(typeof b.excluded!=='boolean'||typeof b.user!=='string')return fail('Выбери участника.');
  const reason=String(b.reason??'').trim();if(reason.length>200||b.excluded&&!reason)return fail('Укажи причину исключения (до 200 символов).');
  const result=await db.prepare("UPDATE entries SET excluded=?,exclusion_reason=? WHERE giveaway=? AND user=? AND winner=0 AND EXISTS (SELECT 1 FROM giveaways WHERE id=? AND status IN ('draft','active'))").bind(b.excluded?1:0,b.excluded?reason:null,g.id,b.user,g.id).run();
  return result.meta.changes?Response.json({ok:true}):fail('Участника нельзя изменить после выбора победителей.',409);
 }
 if(b.action==='paid'){
  if(typeof b.paid!=='boolean'||typeof b.winnerId!=='string')return fail('Выбери победителя.');
  const result=await db.prepare("UPDATE giveaway_winners SET paid=?,paid_at=? WHERE id=? AND giveaway=? AND owner=? AND state IN ('selected','confirmed')").bind(b.paid?1:0,b.paid?now:null,b.winnerId,g.id,u.userId).run();
  return result.meta.changes?Response.json({ok:true}):fail('Сначала победитель должен подтвердить присутствие.',409);
 }
 if(b.action==='repeat'){
  if(!await canOperateRoom(u,g.channel))return fail('Нет доступа к каналу.',403);
  if(g.entry_mode!=='keyword')return fail('Повтор доступен для розыгрышей по слову в чате.');
  const id=crypto.randomUUID();
  await db.prepare(`INSERT INTO giveaways(id,owner,host,title,description,prize,slots,ends,created,channel,entry_mode,keyword,status,draw_mode,presence_required,exclude_repeat) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,u.userId,g.host,g.title,g.description,g.prize,g.slots,now+30*60000,now,g.channel,'keyword',g.keyword,'draft','ordinary',g.presence_required,g.exclude_repeat).run();
  return Response.json({ok:true,id,draft:true});
 }
 const reroll=b.action==='reroll';
 let previous:any=null;
 if(reroll){
  if(g.status!=='completed'||typeof b.winnerId!=='string')return fail('Выбери победителя для перевыбора.');
  previous=await db.prepare("SELECT * FROM giveaway_winners WHERE id=? AND giveaway=? AND owner=? AND state='awaiting' AND deadline<=? AND paid=0").bind(b.winnerId,g.id,u.userId,now).first();
  if(!previous)return fail('Перевыбор доступен только после истечения времени без ответа.',409);
 }else{
  if(g.status!=='active')return fail('Победители уже выбраны.');
  if(g.ends>now)return fail('Дождись закрытия набора.');
 }
 const rows=await db.prepare(`SELECT e.user,e.name,e.avatar FROM entries e WHERE e.giveaway=? AND e.excluded=0 AND e.winner=0
  AND NOT EXISTS(SELECT 1 FROM giveaway_winners w WHERE w.giveaway=e.giveaway AND w.user=e.user)
  AND (?=0 OR NOT EXISTS(SELECT 1 FROM giveaway_winners w WHERE w.owner=? AND w.channel=? AND w.user=e.user AND w.chosen_at>=? AND w.state!='replaced'))`).bind(g.id,g.exclude_repeat,u.userId,g.channel,now-86400000).all<{user:string;name:string;avatar:string|null}>();
 if(!rows.results.length)return fail('Нет подходящих участников. Проверь исключения и повторных победителей.');
 const shuffled=[...rows.results];
 for(let i=shuffled.length-1;i>0;i--){const range=i+1,limit=Math.floor(4294967296/range)*range;let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0];}while(n>=limit);const j=n%range;[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
 const colors:{user:string;name:string;hue:number;brightness:number}[]=[];
 if(g.draw_mode==='colors'){const used=new Set<number>();for(const p of shuffled){let brightness;do{brightness=crypto.getRandomValues(new Uint32Array(1))[0];}while(used.has(brightness));used.add(brightness);colors.push({...p,hue:crypto.getRandomValues(new Uint32Array(1))[0]%360,brightness});}colors.sort((a,b)=>b.brightness-a.brightness);}
 const revealDelay=winnerRevealDelay(g.draw_mode);
 const chosen=(g.draw_mode==='colors'?colors:shuffled).slice(0,reroll?1:g.slots),token=crypto.randomUUID();
 const guard="EXISTS(SELECT 1 FROM giveaways WHERE id=? AND draw_token=?)";
 const users=chosen.map(p=>p.user),marks=users.map(()=>'?').join(',');
 const eligibility=" AND presence_required=? AND exclude_repeat=? AND (SELECT COUNT(*) FROM entries WHERE giveaway=? AND user IN ("+marks+") AND excluded=0 AND winner=0) = ? AND NOT EXISTS(SELECT 1 FROM giveaway_winners WHERE giveaway=? AND user IN ("+marks+")) AND (?=0 OR NOT EXISTS(SELECT 1 FROM giveaway_winners WHERE owner=? AND channel=? AND user IN ("+marks+") AND chosen_at>=? AND state!='replaced'))";
 const eligibleArgs=[g.presence_required,g.exclude_repeat,g.id,...users,users.length,g.id,...users,g.exclude_repeat,u.userId,g.channel,...users,now-86400000];
 const statements=[reroll?
  db.prepare("UPDATE giveaways SET draw_token=? WHERE id=? AND status='completed' AND EXISTS(SELECT 1 FROM giveaway_winners WHERE id=? AND giveaway=? AND state='awaiting' AND deadline<=? AND paid=0)"+eligibility).bind(token,g.id,previous.id,g.id,now,...eligibleArgs):
  db.prepare("UPDATE giveaways SET status='completed',draw_token=? WHERE id=? AND status='active' AND ends<=?"+eligibility).bind(token,g.id,now,...eligibleArgs)];
 if(previous){statements.push(db.prepare("UPDATE giveaway_winners SET state='replaced' WHERE id=? AND "+guard).bind(previous.id,g.id,token),db.prepare('UPDATE entries SET winner=0 WHERE giveaway=? AND user=? AND '+guard).bind(g.id,previous.user,g.id,token));}
 for(let i=0;i<colors.length;i+=10){const chunk=colors.slice(i,i+10),cases=chunk.map(()=>"WHEN ? THEN ?").join(' ');statements.push(db.prepare('UPDATE entries SET hue=CASE user '+cases+' ELSE hue END,brightness=CASE user '+cases+' ELSE brightness END WHERE giveaway=? AND user IN ('+chunk.map(()=>'?').join(',')+') AND '+guard).bind(...chunk.flatMap(p=>[p.user,p.hue]),...chunk.flatMap(p=>[p.user,p.brightness]),g.id,...chunk.map(p=>p.user),g.id,token));}
 for(const p of chosen){
  statements.push(db.prepare('UPDATE entries SET winner=1 WHERE giveaway=? AND user=? AND '+guard).bind(g.id,p.user,g.id,token));
  statements.push(db.prepare('INSERT INTO giveaway_winners(id,giveaway,owner,channel,title,prize,user,name,chosen_at,deadline,state) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE '+guard).bind(crypto.randomUUID(),g.id,u.userId,g.channel??'',g.title,g.prize,p.user,p.name,now,g.presence_required?now+revealDelay+60000:null,g.presence_required?'awaiting':'selected',g.id,token));
 }
 const text=chatText(winnerReply(g.prize,chosen.map(p=>p.name))+(g.presence_required?' Напишите !тут в течение 60 секунд.':''));
 statements.push(db.prepare("INSERT OR IGNORE INTO twitch_bot_messages(id,channel,kind,text,created,ready_at,expires) SELECT ?,?,'winner',?,?,?,? WHERE "+guard+" AND EXISTS(SELECT 1 FROM twitch_bot_settings WHERE channel=? AND owner=? AND enabled=1 AND (winner_announcements=1 OR ?=1))").bind(reroll?'winner:'+g.id+':'+token:'winner:'+g.id,g.channel,text,now,now+revealDelay,now+120000,g.id,token,g.channel,u.userId,g.presence_required));
 const results=await db.batch(statements);
 if(!results[0].meta.changes)return fail('Результат уже изменился. Обнови страницу.',409);
 return Response.json({ok:true,winners:chosen.map(p=>({name:p.name,user:p.user,avatar:shuffled.find(e=>e.user===p.user)?.avatar??null})),drawMode:g.draw_mode,drawStartedAt:now});
}
