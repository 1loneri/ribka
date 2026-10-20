export const MAX_VIDEO_BYTES=80*1024*1024;
export const MAX_VIDEO_SECONDS=120;
export type ReviewPurpose='review'|'guess';
export const reviewConnectUrl=(purpose:ReviewPurpose)=>purpose==='guess'?'/api/twitch/connect?purpose=player&return_to=/reviews/guess-form':REVIEW_CONNECT_URL;
export const REVIEW_CONNECT_URL='/api/twitch/connect?purpose=player&return_to=/reviews';
export const rankGroups=[['iron','Железо','#93989a'],['bronze','Бронза','#c58d68'],['silver','Серебро','#bbc8ce'],['gold','Золото','#d6b676'],['platinum','Платина','#79c8c2'],['diamond','Алмаз','#b597e0'],['ascendant','Ascendant','#71c8a0'],['immortal','Бессмертный','#df7b87']] as const;
export const ranks=[{id:'unrated',label:'Без ранга',color:'#92908e',image:null},...rankGroups.flatMap(([id,label,color])=>[1,2,3].map(level=>({id:id+'-'+level,label:label+' '+level,color,image:'/valorant/ranks/'+id+'-'+level+'.png'}))),{id:'radiant',label:'Радиант',color:'#f0dea0',image:'/valorant/ranks/radiant.png'}];
export const statuses={uploading:'Загрузка видео',validating:'Проверка видео',queued:'В очереди',reviewing:'На разборе',reviewed:'Разобрано',declined:'Возвращено',deleted:'Удалено'};
export type ReviewStatus=keyof typeof statuses;
export type ReviewItem={purpose:ReviewPurpose;id:string;twitchName:string;avatar:string|null;riotId:string;trackerUrl:string;rank:string;rankVerified:boolean;question:string;note:string;status:ReviewStatus;created:number;updated:number;duration:number|null;videoUrl:string|null;videoSize:number|null;mine:boolean};
export function trackerUrl(riotId:string){return 'https://tracker.gg/valorant/profile/riot/'+encodeURIComponent(riotId)+'/overview';}
export function validUuid(value:unknown):value is string{return typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);}
export function normalizeRiotId(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const [name,tag,...extra]=value.trim().normalize('NFC').split('#');
 if(extra.length||!tag||Array.from(name).length<3||Array.from(name).length>16||name!==name.trim()||/[\u0000-\u001f\u007f<>/\\:?]/.test(name)||!(/^[a-z0-9]{3,5}$/i.test(tag)))return null;
 return name+'#'+tag;
}

export type ReviewRow={purpose:ReviewPurpose;id:string;owner:string;request_id:string;twitch_id:string;twitch_name:string;avatar:string|null;riot_id:string;rank:string;rank_verified_by:string|null;rank_verified_at:number|null;question:string;note:string;status:ReviewStatus;video_key:string|null;video_size:number|null;duration_ms:number|null;created:number;updated:number};
export function publicReview(row:ReviewRow,userId?:string):ReviewItem{
 return {purpose:row.purpose,id:row.id,twitchName:row.twitch_name,avatar:row.avatar,riotId:row.riot_id,trackerUrl:trackerUrl(row.riot_id),rank:row.rank,rankVerified:!!row.rank_verified_at,question:row.question,note:row.note,status:row.status,created:row.created,updated:row.updated,duration:row.duration_ms===null?null:row.duration_ms/1000,videoUrl:row.video_key&&['queued','reviewing','reviewed','declined'].includes(row.status)?'/api/reviews/video?id='+row.id:null,videoSize:row.video_size,mine:row.owner===userId};
}
