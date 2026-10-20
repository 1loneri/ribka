import {getChatGPTUser} from '../../../chatgpt-auth';
import {fishingIdentity} from '../../../../lib/fishing/identity';
import {reviewTwitchProfile} from '../../../../lib/reviews/twitch-profile';
import {publicLevelProfile,readProfileRow} from '../../../../lib/levels/profiles';
import {PROFILE_AVATARS,PROFILE_BANNERS,DEFAULT_AVATAR,DEFAULT_BANNER} from '../../../../lib/levels/profile-catalog';
import {progressFor} from '../../../../lib/levels/rules';
import {levelTitle} from '../../../../lib/levels/titles';
import {levelsDb} from '../../../../lib/levels/storage';
import agents from '../../../../lib/levels/agents.json';
import {communityHref} from '../../../../lib/community/navigation';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const profileConnect=(req:Request)=>'/api/twitch/connect?'+new URLSearchParams({purpose:'player',return_to:communityHref('profile',new URL(req.url).searchParams.get('channel')??'')});
export async function GET(req:Request){try{
 const connectUrl=profileConnect(req),user=await getChatGPTUser(),identity=await fishingIdentity(user),q=new URL(req.url).searchParams,id=q.get('id')??identity?.twitchId,channel=q.get('channel')??'';
 if(!id)return reply({error:'Подключи Twitch, чтобы открыть свой профиль.',connectUrl},409);
 if(!/^\d{1,30}$/.test(id)||!/^[a-z0-9_]{1,25}$/.test(channel))return reply({error:'Профиль не найден.'},404);
 const canEdit=identity?.twitchId===id;
 if(canEdit)try{await reviewTwitchProfile(identity!);}catch{}
 let profile=await publicLevelProfile(id,channel);
 if(!profile&&canEdit)profile={id,login:identity!.username,name:identity!.username,avatar:null,twitchAvatar:null,avatarPosition:'50% 50%',avatarId:DEFAULT_AVATAR,banner:null,bannerPosition:'50% 50%',bannerId:DEFAULT_BANNER,favorites:[],titleId:'none',title:null,revision:0,progress:progressFor(0),messages:0,streamMessages:0,earned:0,channel,rank:null};
 return profile?reply({profile,canEdit}):reply({error:'Этот зритель ещё не появился на сайте.'},404);
}catch{return reply({error:'Не удалось загрузить профиль.'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'Запрос отклонён.'},403);
 const connectUrl=profileConnect(req),user=await getChatGPTUser();if(!user)return reply({error:'Войди на сайт.',connectUrl},401);
 const identity=await fishingIdentity(user);if(!identity)return reply({error:'Подключи Twitch.',connectUrl},409);
 const channel=new URL(req.url).searchParams.get('channel')??'';if(!/^[a-z0-9_]{1,25}$/.test(channel))return reply({error:'Выбери канал.'},400);
 if(!req.headers.get('content-type')?.startsWith('application/json'))return reply({error:'Загрузка файлов в профиль недоступна.'},415);
 if(Number(req.headers.get('content-length')??0)>2048)return reply({error:'Запрос слишком большой.'},413);
 const raw=await req.text();if(raw.length>2048)return reply({error:'Запрос слишком большой.'},413);
 let b:Record<string,unknown>;try{b=JSON.parse(raw);}catch{return reply({error:'Не удалось прочитать настройки.'},400);}
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['revision','favorites','avatarId','bannerId','titleId'].includes(k)))return reply({error:'Проверь поля профиля.'},400);
 if(!Number.isSafeInteger(b.revision)||Number(b.revision)<0||!Array.isArray(b.favorites)||b.favorites.length>3||new Set(b.favorites).size!==b.favorites.length||b.favorites.some(x=>typeof x!=='string'||!agents.some(a=>a.id===x)))return reply({error:'Выбери до трёх любимых агентов.'},400);
 if(b.avatarId!==DEFAULT_AVATAR&&!PROFILE_AVATARS.some(x=>x.id===b.avatarId)||b.bannerId!==DEFAULT_BANNER&&!PROFILE_BANNERS.some(x=>x.id===b.bannerId))return reply({error:'Выбирай картинки из коллекции сайта.'},400);
 const revision=Number(b.revision),previous=await readProfileRow(identity.twitchId);if((previous?.revision??0)!==revision)return reply({error:'Профиль изменился в другой вкладке. Обнови страницу.'},409);
 const player=await levelsDb().prepare('SELECT messages AS xp FROM level_players WHERE channel=? AND user_id=?').bind(channel,identity.twitchId).first<{xp:number}>();
 const titleId=Object.hasOwn(b,'titleId')?b.titleId:previous?.title_id??'none';
 if(titleId!=='none'&&!levelTitle(titleId,progressFor(player?.xp??0).level))return reply({error:'Этот титул ещё не открыт на выбранном канале.'},400);
 const saved=await levelsDb().prepare(`INSERT INTO level_profiles(twitch_id,login,favorites,banner_id,avatar_id,title_id,revision,updated) SELECT ?,?,?,?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM level_profiles WHERE twitch_id=? AND revision=?) ON CONFLICT(twitch_id) DO UPDATE SET login=excluded.login,favorites=excluded.favorites,banner_id=excluded.banner_id,avatar_id=excluded.avatar_id,title_id=excluded.title_id,revision=excluded.revision,updated=excluded.updated WHERE level_profiles.revision=?`).bind(identity.twitchId,identity.username,JSON.stringify(b.favorites),b.bannerId,b.avatarId,titleId,revision+1,Date.now(),revision,identity.twitchId,revision,revision).run();
 if(!saved.meta.changes)return reply({error:'Профиль изменился. Обнови страницу и повтори сохранение.'},409);
 return reply({profile:await publicLevelProfile(identity.twitchId,channel),canEdit:true});
}catch{return reply({error:'Не удалось сохранить профиль. Попробуй ещё раз.'},503);}}
