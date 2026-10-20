export const MAX_FEEDBACK_BYTES=10*1024*1024;
export const MAX_FEEDBACK_PIXELS=48_000_000;
export const MAX_FEEDBACK_POST_URL=2048;
export const FEEDBACK_CONNECT_URL='/api/twitch/connect?purpose=player&return_to=/feedback';
export const FEEDBACK_TIME_ZONE='Europe/Tallinn';
export const MIN_FEEDBACK_DATE='1970-01-01';
export const MAX_FEEDBACK_DATE='9999-12-31';
export function feedbackDateTimestamp(value:unknown):number|null{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<MIN_FEEDBACK_DATE||value>MAX_FEEDBACK_DATE)return null;
 // Noon UTC keeps the chosen calendar date in Tallinn during both summer and winter.
 const timestamp=Date.parse(value+'T12:00:00.000Z');
 return Number.isFinite(timestamp)&&new Date(timestamp).toISOString().slice(0,10)===value?timestamp:null;
}
export function feedbackDateValue(timestamp:number){
 const parts=new Intl.DateTimeFormat('en',{timeZone:FEEDBACK_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(timestamp));
 const part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
 return part('year')+'-'+part('month')+'-'+part('day');
}
export function feedbackPostUrl(value:unknown):string|null|undefined{
 if(value===null)return null;
 if(typeof value!=='string')return undefined;
 const input=value.trim();if(!input)return null;
 if(input.length>MAX_FEEDBACK_POST_URL||/[\u0000-\u0020\u007f]/.test(input)||!/^https?:\/\//i.test(input))return undefined;
 try{const url=new URL(input);if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.href.length>MAX_FEEDBACK_POST_URL)return undefined;return url.href;}catch{return undefined;}
}
export type FeedbackRow={id:string;owner:string;image_key:string;mime:string;bytes:number;width:number;height:number;digest:string;created:number;deleted:number;post_url:string|null};
export type FeedbackItem={id:string;url:string;width:number;height:number;created:number;postUrl:string|null};
export const publicFeedback=(row:FeedbackRow):FeedbackItem=>({id:row.id,url:'/api/feedback/image?id='+row.id,width:row.width,height:row.height,created:row.created,postUrl:feedbackPostUrl(row.post_url)??null});
