import {env} from 'cloudflare:workers';
import {getChatGPTUser,chatGPTSignInPath} from '../../../chatgpt-auth';
import {getRole} from '../../../../lib/streamer-auth';
import {getTwitchSecret} from '../../../../lib/twitch-secrets';
import {REDIRECT_URI,TWITCH_ORIGIN,stateHash} from '../../../../lib/twitch-api';
import {validCommunityReturn} from '../../../../lib/community/navigation';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const query=new URL(req.url).searchParams,player=query.get('purpose')==='player',bot=query.get('purpose')==='bot',chat=query.get('purpose')==='chat';
 const target=query.get('channel')??'',chatTarget=chat&&/^[a-z0-9_]{1,25}$/.test(target)?target:'';
 const requestedReturn=query.get('return_to')??'',giveawayReturn=/^\/(giveaways|studio)\/[a-zA-Z0-9_-]{1,100}$/.test(requestedReturn)?requestedReturn:'';
 const studioReturn=bot&&requestedReturn==='/studio';
 const reviewReturn=validCommunityReturn(requestedReturn)||/^\/reviews\/guess(?:\?channel=[a-z0-9_]{1,25})?$/.test(requestedReturn)||player&&['/reviews','/reviews/guess-form','/feedback'].includes(requestedReturn);
 const levelsReturn=requestedReturn==='/levels'||player&&requestedReturn==='/levels?tab=profile';
 const returnTo=levelsReturn?requestedReturn:reviewReturn?requestedReturn:studioReturn?'/studio':giveawayReturn?giveawayReturn:chatTarget?'/fishing?channel='+chatTarget:player||bot||chat||query.get('return_to')==='/fishing'?'/fishing':'/studio';
 const connectPath=levelsReturn?'/api/twitch/connect?'+new URLSearchParams({return_to:requestedReturn,...(player?{purpose:'player'}:bot?{purpose:'bot'}:chat?{purpose:'chat'}:{})}):reviewReturn?'/api/twitch/connect?'+new URLSearchParams({return_to:requestedReturn,...(player?{purpose:'player'}:bot?{purpose:'bot'}:chat?{purpose:'chat'}:{})}):giveawayReturn?'/api/twitch/connect?'+new URLSearchParams({return_to:giveawayReturn,...(chat?{purpose:'chat'}:{})}):'/api/twitch/connect'+(player?'?purpose=player&return_to=/fishing':bot?'?purpose=bot&return_to='+(studioReturn?'/studio':'/fishing'):chat?'?purpose=chat&return_to=/fishing'+(chatTarget?'&channel='+chatTarget:''):returnTo==='/fishing'?'?return_to=/fishing':'');
 const u=await getChatGPTUser();
 if(!u)return Response.redirect(TWITCH_ORIGIN+chatGPTSignInPath(connectPath),302);
 const role=await getRole(u);
 if(!player&&!chat&&!role.admin&&!role.streamer)return Response.json({error:'Подключать канал могут только стримеры с выданным доступом.'},{status:403});
 if(!env.TWITCH_CLIENT_ID||!await getTwitchSecret())return player||chat?Response.json({error:'Подключение Twitch пока не настроено владельцем сайта.'},{status:503}):Response.redirect(TWITCH_ORIGIN+'/admin?twitch=missing-settings',302);
 const state=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
 await env.DB!.batch([
  env.DB!.prepare('DELETE FROM twitch_states WHERE expires<? OR user=?').bind(Date.now(),u.userId),
  env.DB!.prepare('INSERT INTO twitch_states (id,user,email,expected,expires,return_to,purpose) VALUES (?,?,?,?,?,?,?)').bind(await stateHash(state),u.userId,u.email.toLowerCase(),player||bot||chat?null:role.streamer?.channel??null,Date.now()+600000,returnTo,player?'player':bot?'bot':chat?'chat':'streamer'),
 ]);
 const params=new URLSearchParams({client_id:env.TWITCH_CLIENT_ID,redirect_uri:REDIRECT_URI,response_type:'code',scope:player?'openid':chat?'user:write:chat':bot?'user:read:chat user:write:chat moderator:read:chat_messages moderator:read:blocked_terms':'user:read:chat user:write:chat channel:manage:redemptions moderator:read:chat_messages moderator:read:blocked_terms channel:read:predictions channel:read:polls',state,force_verify:'true'});
 return Response.redirect('https://id.twitch.tv/oauth2/authorize?'+params,302);
}catch{return Response.json({error:'Не удалось начать подключение Twitch. Попробуйте ещё раз.'},{status:503});}}
