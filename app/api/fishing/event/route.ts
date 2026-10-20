import {getChatGPTUser} from '../../../chatgpt-auth';
import {getRole} from '../../../../lib/streamer-auth';
import {fishingAccessDenied} from '../../../../lib/fishing/access';
import {fishDb,type Game} from '../../../../lib/fishing/storage';
import {launchHazard} from '../../../../lib/fishing/hazards';
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Запрос отклонён.'},{status:403});
 const user=await getChatGPTUser();if(!user)return Response.json({error:'Войди на сайт.'},{status:401});const denied=await fishingAccessDenied(user);if(denied)return denied;if(!(await getRole(user)).admin)return Response.json({error:'Только администратор может запускать событие.'},{status:403});
 const raw=await req.text();if(raw.length>1024)return Response.json({error:'Некорректный запрос.'},{status:400});const body=JSON.parse(raw) as {channel?:unknown;requestId?:unknown};
 if(typeof body.channel!=='string'||!/^[a-z0-9_]{1,25}$/.test(body.channel)||typeof body.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId))return Response.json({error:'Некорректный запрос.'},{status:400});
 const game=await fishDb().prepare('SELECT * FROM fishing_games WHERE channel=?').bind(body.channel).first<Game>();if(!game)return Response.json({error:'Выбери существующий канал рыбалки.'},{status:409});
 const result=await launchHazard(game,user.userId,'hazard:'+body.channel+':'+body.requestId);return result?Response.json(result,{headers:{'Cache-Control':'no-store'}}):Response.json({error:'Дождись окончания текущего опасного события.'},{status:409});
 }catch{return Response.json({error:'Ответ не подтверждён. Повтори тот же запрос.'},{status:503});}}
