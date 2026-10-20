export type OverlayFragment={type:'text';text:string}|{type:'emote';text:string;id:string};
// Preserve Twitch's fragment boundaries, including when the public overlay clips a message.
export function overlayFragments(text:string,input:unknown,limit=500):OverlayFragment[]{
 const fallback=():OverlayFragment[]=>[{type:'text',text:text.slice(0,limit)}];
 if(!Array.isArray(input)||input.length>1000)return fallback();
 if(!input.every(part=>part&&typeof part==='object'&&typeof part.text==='string')||input.map(part=>part.text).join('')!==text)return fallback();
 const result:OverlayFragment[]=[];let remaining=limit;
 for(const part of input){
  if(remaining<=0)break;
  const label=part.text.slice(0,remaining);remaining-=label.length;if(!label)continue;
  if(part.type==='emote'&&label===part.text&&typeof part.id==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(part.id))result.push({type:'emote',text:label,id:part.id});
  else if(result.at(-1)?.type==='text')result[result.length-1].text+=label;
  else result.push({type:'text',text:label});
 }
 return result.length?result:fallback();
}
