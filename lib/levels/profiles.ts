import {levelsDb} from './storage';
import {restoreMessageHistory} from './message-history';
import {progressFor} from './rules';
import {levelTitle} from './titles';
import {ranks,trackerUrl} from '../reviews/model';
import {PROFILE_AVATARS,PROFILE_BANNERS,DEFAULT_AVATAR,DEFAULT_BANNER} from './profile-catalog';
export type LevelProfileRow={twitch_id:string;login:string;favorites:string;banner_id:string;avatar_id:string;title_id:string;revision:number;updated:number};
export const readProfileRow=(id:string)=>levelsDb().prepare('SELECT * FROM level_profiles WHERE twitch_id=?').bind(id).first<LevelProfileRow>();
export async function publicLevelProfile(id:string,channel:string){
 await restoreMessageHistory(channel);
 const db=levelsDb();
 const [row,cached,player,review]=await Promise.all([
  readProfileRow(id),
  db.prepare('SELECT login,avatar FROM demo_profiles WHERE twitch_id=?').bind(id).first<{login:string;avatar:string}>(),
  db.prepare(`SELECT p.login,p.name,p.messages AS xp,p.messages,COALESCE(s.messages,0) AS streamMessages,COALESCE(s.messages,0) AS earned FROM level_players p LEFT JOIN level_channels c ON c.channel=p.channel LEFT JOIN level_sessions s ON s.channel=p.channel AND s.user_id=p.user_id AND s.stream_id=c.stream_id WHERE p.channel=? AND p.user_id=?`).bind(channel,id).first<{login:string;name:string;xp:number;messages:number;streamMessages:number;earned:number}>(),
  db.prepare("SELECT id,riot_id,rank,rank_verified_at,twitch_name,avatar FROM demo_reviews WHERE twitch_id=? AND (purpose='review' OR EXISTS (SELECT 1 FROM rank_guess_games shown WHERE shown.review_id=demo_reviews.id AND shown.state='revealed')) AND status IN ('queued','reviewing','reviewed','declined') AND NOT EXISTS (SELECT 1 FROM rank_guess_games g JOIN demo_reviews secret ON secret.id=g.review_id WHERE secret.twitch_id=demo_reviews.twitch_id AND g.state='voting' AND g.expires>?) ORDER BY created DESC,id DESC LIMIT 1").bind(id,Date.now()).first<{id:string;riot_id:string;rank:string;rank_verified_at:number|null;twitch_name:string;avatar:string|null}>(),
 ]);
 if(!row&&!cached&&!player&&!review)return null;
 let favorites:string[]=[];try{const f:unknown=JSON.parse(row?.favorites??'[]');if(Array.isArray(f))favorites=f.filter((x):x is string=>typeof x==='string').slice(0,3);}catch{}
 const rank=review?ranks.find(x=>x.id===review.rank):null;
 const customAvatar=PROFILE_AVATARS.find(x=>x.id===row?.avatar_id),banner=PROFILE_BANNERS.find(x=>x.id===row?.banner_id);
 return {id,login:cached?.login??row?.login??player?.login??review!.twitch_name,name:cached?.login??row?.login??player?.name??review!.twitch_name,avatar:customAvatar?.image??cached?.avatar??review?.avatar??null,twitchAvatar:cached?.avatar??review?.avatar??null,avatarPosition:customAvatar?.position??'50% 50%',avatarId:customAvatar?.id??DEFAULT_AVATAR,banner:banner?.image??null,bannerPosition:banner?.position??'50% 50%',bannerId:banner?.id??DEFAULT_BANNER,favorites,titleId:levelTitle(row?.title_id,progressFor(player?.xp??0).level)?.id??'none',title:levelTitle(row?.title_id,progressFor(player?.xp??0).level),revision:row?.revision??0,progress:progressFor(player?.xp??0),messages:player?.messages??0,streamMessages:player?.streamMessages??0,earned:player?.earned??0,channel,rank:review&&rank?{id:rank.id,label:rank.label,color:rank.color,image:rank.image,verified:!!review.rank_verified_at,riotId:review.riot_id,trackerUrl:trackerUrl(review.riot_id)}:null};
}
export type PublicLevelProfile=NonNullable<Awaited<ReturnType<typeof publicLevelProfile>>>;
