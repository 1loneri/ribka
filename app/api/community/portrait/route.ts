import {communityDb} from '../../../../lib/community/access';
import {currentMystery,type MysteryRound} from '../../../../lib/community/mystery';
import {safeAvatar} from '../../../../lib/community/model';
import {validUuid} from '../../../../lib/reviews/model';
import {inspectFeedbackImage} from '../../../../lib/feedback/images';
export const dynamic='force-dynamic';
const missing=()=>new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
export async function GET(req:Request){try{
 const id=new URL(req.url).searchParams.get('round');if(!validUuid(id))return missing();
 const row=await communityDb().prepare('SELECT * FROM community_mystery_rounds WHERE id=?').bind(id).first<MysteryRound>();if(!row||row.state==='cancelled')return missing();
 const current=await currentMystery(row.channel);if(!current||current.row.id!==id||current.row.state==='cancelled')return missing();
 const avatar=safeAvatar(row.avatar);if(!avatar)return missing();
 const response=await fetch(avatar,{redirect:'error',signal:AbortSignal.timeout(8000)});if(!response.ok||!response.body)return missing();
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>512*1024){await reader.cancel();return missing();}chunks.push(next.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const info=inspectFeedbackImage(bytes);let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));
 const hidden=current.row.state!=='revealed',body='<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><filter id="blur"><feGaussianBlur stdDeviation="12"/></filter><clipPath id="clip"><rect width="256" height="256" rx="18"/></clipPath></defs><g clip-path="url(#clip)"><image x="-16" y="-16" width="288" height="288" preserveAspectRatio="xMidYMid slice"'+(hidden?' filter="url(#blur)"':'')+' href="data:'+info.mime+';base64,'+btoa(binary)+'"/></g></svg>';
 return new Response(body,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; sandbox"}});
}catch{return missing();}}
