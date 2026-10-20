import {overlaySnapshot} from '../../../../lib/levels/storage';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const channel=new URL(req.url).searchParams.get('channel')??'';
 if(!/^[a-z0-9_]{1,25}$/.test(channel))return Response.json({error:'Не указан канал.'},{status:400});
 try{return Response.json(await overlaySnapshot(channel),{headers:{'Cache-Control':'no-store'}});}
 catch{return Response.json({error:'Чат временно недоступен.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
