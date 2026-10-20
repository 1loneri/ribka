import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test-twitch-bot.mjs';
import './test-bot-conversation.mjs';

const question=(f,extra={})=>({id:crypto.randomUUID(),userId:'777',login:'viewer',text:'бот, что меня ждёт завтра?',created:f.clock.now,...extra});
const completed=text=>Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text}]}]});
async function ready(openAi={}){const f=await fixture({openAi});f.enable();return {...f,ai:await f.load('lib/twitch-bot/ai.ts'),chat:await f.load('lib/twitch-bot/conversation.ts')};}
const ask=(f,extra={})=>f.chat.answerBotQuestion(f.connection,'owner_channel','lease',question(f,extra));
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

test('neural replies use the Responses API once, with no tools, bounded output and server-owned instructions',async()=>{
 const f=await ready();await ask(f);
 assert.equal(f.aiRequests.length,1);assert.equal(f.sent.length,1);const req=f.aiRequests[0];
 assert.equal(req.model,'gpt-6-luna');assert.equal(req.store,false);assert.deepEqual(req.tools,[]);assert.equal(req.max_output_tokens,200);assert.equal(req.reasoning.effort,'none');assert.equal(req.text.verbosity,'low');
 assert.match(req.instructions,/бот с характером 19-летнего парня/);assert.match(req.instructions,/Длинные тире не используй/);assert.match(req.instructions,/Без смайликов, эмодзи и мата/);assert.equal(req.input.at(-1).content,'что меня ждёт завтра?');
 assert.ok(!JSON.stringify(req).includes('test-ai-secret'));assert.equal(f.sql.prepare('SELECT mode,status FROM twitch_bot_ai_requests').get().mode,'openai');
 const settings=await (await (await f.load('app/api/twitch/bot/route.ts')).GET()).json();assert.equal(settings.chatMode,'openai');assert.equal(settings.chatError,'');assert.ok(!JSON.stringify(settings).includes('test-ai-secret'));
});

test('neural conversation memory is limited to the same viewer and channel, recent sent turns, in order',async()=>{
 const f=await ready({text:'да всё чилл, держим прицел ровно 😎'}),insert=f.sql.prepare("INSERT INTO twitch_bot_ai_requests(id,channel,owner,user_id,login,question,answer,mode,status,created,expires) VALUES(?,?,'owner',?,'viewer',?,?,'openai',?,?,?)");
 const seed=(id,channel,user,status,age)=>insert.run(id,channel,user,'вопрос '+id,'ответ '+id,status,f.clock.now-age,f.clock.now-age+30000);
 for(let i=1;i<=4;i++)seed('own-'+i,'owner_channel','777','sent',(6-i)*31000);
 seed('stranger','owner_channel','888','sent',10000);seed('other-room','friend_channel','777','sent',11000);seed('old','owner_channel','777','sent',610000);seed('failed','owner_channel','777','failed',10000);
 f.clock.now+=31000;await ask(f);const input=f.aiRequests[0].input;
 assert.deepEqual(input.slice(0,-1).map(item=>item.content),['вопрос own-2','ответ own-2','вопрос own-3','ответ own-3','вопрос own-4','ответ own-4']);
 for(const hidden of ['stranger','other-room','old','failed'])assert.ok(!JSON.stringify(input).includes(hidden));
});

test('disabled bot, invalid lease, stale questions and viewer commands do not incur AI requests',async()=>{
 const f=await ready();f.sql.exec('UPDATE twitch_bot_settings SET enabled=0');await ask(f);f.enable();
 await f.chat.answerBotQuestion(f.connection,'owner_channel','wrong',question(f));await ask(f,{created:f.clock.now-50000});await ask(f,{text:'!рыба'});await ask(f,{userId:'123'});
 f.sql.exec('UPDATE twitch_bot_settings SET ai_replies=0');await ask(f);
 assert.equal(f.aiRequests.length,0);assert.equal(f.sent.length,0);
});

test('a duplicate Twitch event never makes a second paid request, including after the pause',async()=>{
 const f=await ready(),m=question(f);await Promise.all([f.chat.answerBotQuestion(f.connection,'owner_channel','lease',m),f.chat.answerBotQuestion(f.connection,'owner_channel','lease',m)]);
 f.clock.now+=31000;await f.chat.answerBotQuestion(f.connection,'owner_channel','lease',{...m,created:f.clock.now});assert.equal(f.aiRequests.length,1);assert.equal(f.sent.length,1);
});

test('OpenAI failures fall back, expose only safe diagnostics, back off and recover',async()=>{
 const cases=[
  [429,'insufficient_quota',/баланс и оплату/,300000],
  [401,'invalid_api_key',/отклонил доступ/,300000],
  [403,'forbidden',/отклонил доступ/,300000],
  [404,'model_not_found',/модель недоступна/,300000],
  [429,'rate_limit_exceeded',/Лимит запросов/,60000],
  [503,'unavailable',/временно недоступен/,60000],
 ];
 for(const [status,code,label,backoff] of cases){
  let healthy=false;const f=await ready({respond:()=>healthy?completed('всё, снова на связи 😎'):Response.json({error:{code,message:'secret diagnostic sk-test-must-not-escape'}},{status})});
  await ask(f);let state=f.sql.prepare('SELECT ai_error,ai_retry_after FROM twitch_bot_settings').get();assert.match(state.ai_error,label);assert.equal(state.ai_retry_after,f.clock.now+backoff);assert.equal(f.sent.length,1);assert.equal(f.sql.prepare('SELECT mode FROM twitch_bot_ai_requests').get().mode,'basic');assert.ok(!JSON.stringify(state).includes('sk-test'));
  f.clock.now+=31000;await ask(f);assert.equal(f.aiRequests.length,1);assert.equal(f.sent.length,2);
  healthy=true;f.clock.now+=backoff;await ask(f);assert.equal(f.aiRequests.length,2);state=f.sql.prepare('SELECT ai_error,ai_retry_after FROM twitch_bot_settings').get();assert.equal(state.ai_error,null);assert.equal(state.ai_retry_after,0);assert.match(f.sent.at(-1).message,/снова на связи/);
 }
});

test('network errors, malformed JSON and incomplete responses never leak errors or stop the Twitch bot',async()=>{
 for(const respond of [()=>{throw Error('private key or network failure');},()=>new Response('not-json'),()=>Response.json({status:'incomplete',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'обрезанный ответ'}]}]})]){
  const f=await ready({respond});await ask(f);assert.equal(f.sent.length,1);assert.equal(f.sql.prepare('SELECT mode FROM twitch_bot_ai_requests').get().mode,'basic');assert.ok(!f.sent[0].message.includes('обрезанный'));assert.ok(!f.sql.prepare('SELECT ai_error FROM twitch_bot_settings').get().ai_error.includes('private key'));
 }
});

test('unsafe model outputs cannot become links, commands, key strings or profanity in Twitch',async()=>{
 for(const text of ['/ban viewer','!рыба','https://evil.test','sk-this-is-a-forged-secret-key','иди нахуй']){
  const f=await ready({text});await ask(f);assert.equal(f.sent.length,1);assert.ok(!f.sent[0].message.includes(text));assert.equal(f.sql.prepare('SELECT mode FROM twitch_bot_ai_requests').get().mode,'basic');
 }
 const f=await ready({text:'очень '.repeat(100)});await ask(f);assert.ok(Array.from(f.sent[0].message).length<=Array.from('@viewer · ').length+300);
});

test('the in-flight channel claim prevents parallel AI calls even after the normal channel pause',async()=>{
 let resolveResponse;const f=await ready({respond:()=>new Promise(resolve=>{resolveResponse=resolve;})}),pending=ask(f);
 while(!f.aiRequests.length)await pause();f.clock.now+=9000;await ask(f,{userId:'888',login:'other'});assert.equal(f.aiRequests.length,1);
 resolveResponse(completed('да всё чилл 😎'));await pending;assert.equal(f.sent.length,1);
});

test('disabling conversations or revoking ownership during generation prevents a late answer',async()=>{
 for(const change of ["UPDATE twitch_bot_settings SET ai_replies=0","UPDATE fishing_games SET collector_token='other'","DELETE FROM streamers"]){
  let resolveResponse;const f=await ready({respond:()=>new Promise(resolve=>{resolveResponse=resolve;})}),pending=ask(f);while(!f.aiRequests.length)await pause();
  f.sql.exec(change);resolveResponse(completed('этот ответ не должен уйти'));await pending;assert.equal(f.sent.length,0);assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_ai_requests').get().status,'cancelled');
 }
});

test('an expired generation is cancelled; a provider-supplied tool or nonassistant message is ignored',async()=>{
 const f=await ready({respond:()=>{f.clock.now+=31000;return completed('слишком поздно');}});await ask(f);assert.equal(f.sent.length,0);assert.equal(f.sql.prepare('SELECT status FROM twitch_bot_ai_requests').get().status,'cancelled');
 const g=await ready({respond:()=>Response.json({status:'completed',output:[{type:'function_call',arguments:'secret'},{type:'message',role:'user',content:[{type:'output_text',text:'spoof'}]},{type:'message',role:'assistant',content:[{type:'refusal',refusal:'no'}]}]})});await ask(g);assert.equal(g.sent.length,1);assert.equal(g.sql.prepare('SELECT mode FROM twitch_bot_ai_requests').get().mode,'basic');
});

test('the owner can retry AI after fixing billing without exposing or changing the key',async()=>{
 const f=await ready({respond:()=>Response.json({error:{code:'insufficient_quota'}},{status:429})});await ask(f);const route=await f.load('app/api/twitch/bot/route.ts');
 const response=await route.POST(new Request('https://site.test/api/twitch/bot',{method:'POST',headers:{origin:'https://site.test'},body:JSON.stringify({enabled:true,fishReplies:true,winnerAnnouncements:true,chatReplies:true})}));assert.equal(response.status,200);
 const state=f.sql.prepare('SELECT ai_error,ai_retry_after FROM twitch_bot_settings').get();assert.equal(state.ai_error,null);assert.equal(state.ai_retry_after,0);
});
