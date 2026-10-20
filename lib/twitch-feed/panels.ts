import {env} from 'cloudflare:workers';
import type {getConnection} from '../twitch-api';
import {asCount,asText,pinnedMessage,poll,prediction,record,type FeedState,type Prediction,type Poll} from './types';
import {appendMessage,decodeState,feedDb,updateFeedState} from './storage';
type Connection=Awaited<ReturnType<typeof getConnection>>;
function mayReplace(previous:Prediction|Poll|null|undefined,next:Prediction|Poll|null){
 if(!previous||!next)return true;
 if(previous.startedAt&&next.startedAt&&next.startedAt<previous.startedAt)return false;
 if(previous.id!==next.id)return true;
 if(previous.status!=='ACTIVE'&&next.status==='ACTIVE')return false;
 return !(previous.status!=='ACTIVE'&&previous.status!=='LOCKED'&&next.status==='LOCKED');
}
export function capabilities(connection:Connection,broadcaster=connection.broadcaster){
 const own=broadcaster===connection.broadcaster,scopes=connection.permissions;
 return {pin:scopes.includes('moderator:read:chat_messages')||scopes.includes('moderator:manage:chat_messages'),prediction:own&&(scopes.includes('channel:read:predictions')||scopes.includes('channel:manage:predictions')),poll:own&&(scopes.includes('channel:read:polls')||scopes.includes('channel:manage:polls'))};
}
export function subscriptionPlan(connection:Connection,broadcaster=connection.broadcaster){
 const chat=['channel.chat.message','channel.chat.message_delete','channel.chat.clear','channel.chat.clear_user_messages','channel.chat.notification'].map(type=>({type,required:true,condition:{broadcaster_user_id:broadcaster,user_id:connection.broadcaster}}));
 const result=[...chat,{type:'channel.chat_settings.update',required:false,condition:{broadcaster_user_id:broadcaster,user_id:connection.broadcaster}}];
 const available=capabilities(connection,broadcaster);
 const channelTypes=[...(available.prediction?['channel.prediction.begin','channel.prediction.progress','channel.prediction.lock','channel.prediction.end']:[]),...(available.poll?['channel.poll.begin','channel.poll.progress','channel.poll.end']:[]),...(broadcaster===connection.broadcaster&&(connection.permissions.includes('channel:manage:redemptions')||connection.permissions.includes('channel:read:redemptions'))?['channel.channel_points_custom_reward_redemption.add']:[])];
 return [...result,...['stream.online','stream.offline',...channelTypes].map(type=>({type,required:false,condition:{broadcaster_user_id:broadcaster}}))];
}
async function getPanel(connection:Connection,path:string){
 const response=await fetch('https://api.twitch.tv/helix/'+path,{headers:{'Client-Id':env.TWITCH_CLIENT_ID!,Authorization:'Bearer '+connection.token},signal:AbortSignal.timeout(8000)});
 if(response.status===401)throw Error('Twitch отозвал доступ. Переподключи свой аккаунт.');
 if(!response.ok)throw Error('Twitch не вернул данные.');
 const body=await response.json() as {data?:unknown[]};return body.data?.[0]??null;
}
export async function refreshPanels(channel:string,lease:string,connection:Connection,broadcaster=connection.broadcaster){
 const available=capabilities(connection,broadcaster),patch:FeedState={capabilities:available,updated:Date.now()},warnings:string[]=[];
 const requests:{key:'pin'|'prediction'|'poll'|'settings';label:string;read:()=>Promise<unknown>}[]=[{key:'settings',label:'Настройки чата',read:()=>getPanel(connection,'chat/settings?broadcaster_id='+broadcaster)}];
 if(available.pin)requests.push({key:'pin',label:'Закреп',read:()=>getPanel(connection,'chat/pins?broadcaster_id='+broadcaster+'&moderator_id='+connection.broadcaster)});
 if(available.prediction)requests.push({key:'prediction',label:'Ставки',read:()=>getPanel(connection,'predictions?broadcaster_id='+broadcaster+'&first=1')});
 if(available.poll)requests.push({key:'poll',label:'Голосования',read:()=>getPanel(connection,'polls?broadcaster_id='+broadcaster+'&first=1')});
 const results=await Promise.allSettled(requests.map(request=>request.read()));
 for(let index=0;index<results.length;index++){
  const result=results[index],request=requests[index];
  if(result.status==='rejected'){warnings.push(request.label+': временно нет данных от Twitch.');continue;}
  if(request.key==='pin')patch.pin=pinnedMessage(result.value);
  else if(request.key==='prediction')patch.prediction=prediction(result.value);
  else if(request.key==='poll')patch.poll=poll(result.value);
  else{const row=record(result.value);patch.settings={slow:row.slow_mode?asCount(row.slow_mode_wait_time):0,followers:row.follower_mode?asCount(row.follower_mode_duration):null,subscribers:!!row.subscriber_mode,emotes:!!row.emote_mode};}
 }
 const current=await feedDb().prepare('SELECT state FROM chat_channels WHERE channel=? AND collector_token=?').bind(channel,lease).first<{state:string}>(),previous=decodeState(current?.state);
 if(patch.prediction!==undefined&&!mayReplace(previous.prediction,patch.prediction))delete patch.prediction;
 if(patch.poll!==undefined&&!mayReplace(previous.poll,patch.poll))delete patch.poll;
 if(patch.pin&&await feedDb().prepare('SELECT seq FROM chat_messages WHERE channel=? AND message_id=? AND removed=1').bind(channel,patch.pin.id).first())patch.pin=null;
 patch.warnings=warnings;await updateFeedState(channel,lease,patch);
}
export async function applyActivity(channel:string,lease:string,type:string,event:Record<string,unknown>,id:string,created:number){
 if(type==='channel.chat_settings.update'){
  await updateFeedState(channel,lease,{settings:{slow:event.slow_mode?asCount(event.slow_mode_wait_time_seconds):0,followers:event.follower_mode?asCount(event.follower_mode_duration_minutes):null,subscribers:!!event.subscriber_mode,emotes:!!event.emote_mode}});return;
 }
 if(type.startsWith('channel.prediction.')||type.startsWith('channel.poll.')){
  const row=await feedDb().prepare('SELECT state FROM chat_channels WHERE channel=? AND collector_token=?').bind(channel,lease).first<{state:string}>();
  const state=decodeState(row?.state),isPrediction=type.startsWith('channel.prediction.'),activity=isPrediction?prediction(event,type):poll(event,type);
  if(!activity)return;
  const previous=isPrediction?state.prediction:state.poll;
  if(!mayReplace(previous,activity))return;
  await updateFeedState(channel,lease,isPrediction?{prediction:activity as ReturnType<typeof prediction>}:{poll:activity as ReturnType<typeof poll>});
  if(type.endsWith('.progress'))return;
  const label=isPrediction?'Ставка':'Голосование',verb=type.endsWith('.begin')?'началось':type.endsWith('.lock')?'приём завершён':'завершено';
  await appendMessage(channel,lease,{id:type+':'+activity.id,kind:'notice',userId:'',login:'twitch',name:'Twitch',color:'',badges:[],text:label+': '+activity.title+' — '+verb,fragments:[],created});return;
 }
 if(type==='channel.channel_points_custom_reward_redemption.add'){
  const name=asText(event.user_name,100)||asText(event.user_login,25),reward=record(event.reward),input=asText(event.user_input,500);
  await appendMessage(channel,lease,{id:'reward:'+(asText(event.id,200)||id),kind:'reward',userId:asText(event.user_id,100),login:asText(event.user_login,25),name,color:'',badges:[],text:'Получена награда «'+asText(reward.title,200)+'» за '+asCount(reward.cost).toLocaleString('ru')+' баллов'+(input?' · '+input:''),fragments:[],created});
 }
}
