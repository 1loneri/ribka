import {getChatGPTUser} from '../../../chatgpt-auth';
import {fishingIdentity} from '../../../../lib/fishing/identity';
import {fishingAccessDenied} from '../../../../lib/fishing/access';
import {performFishCommand} from '../../../../lib/fishing/storage';
export const dynamic='force-dynamic';
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт.'},401);
 const denied=await fishingAccessDenied(user);if(denied)return denied;
 const raw=await req.text();if(raw.length>1024)return reply({error:'Запрос слишком большой.'},413);
 let body:{channel?:unknown;requestId?:unknown;command?:unknown};try{body=JSON.parse(raw);}catch{return reply({error:'Некорректный запрос.'},400);}
 if(!body||typeof body.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(body.channel)||typeof body.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)||typeof body.command!=='string'||body.command.length>100||!(/^!(кот|cat|приют|наживка|bait)(\s|$)/i.test(body.command)||/^!купить\s+(кота|наживку)(\s|$)/i.test(body.command)||/^!обменять\s+наживку(\s|$)/i.test(body.command)))return reply({error:'Некорректное действие.'},400);
 const me=await fishingIdentity(user);if(!me)return reply({error:'Подключи Twitch для личного котика.'},409);
 const result=await performFishCommand(body.channel,'pet:'+body.channel+':'+me.twitchId+':'+body.requestId.toLowerCase(),me.username,body.command);
 if(result.kind!=='saved')return reply({error:'Рыбалка пока недоступна.'},409);
 return reply({player:result.player,message:result.entry.message,replayed:result.replayed});
}catch{return reply({error:'Не удалось подтвердить действие. Повтори с тем же запросом.'},503);}}
