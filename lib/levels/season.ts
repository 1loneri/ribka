export function levelMonth(now=Date.now()){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Tallinn',year:'numeric',month:'2-digit'}).formatToParts(now);
 return parts.find(p=>p.type==='year')!.value+'-'+parts.find(p=>p.type==='month')!.value;
}
export const monthLabel=(month:string)=>new Date(month+'-15T12:00:00Z').toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'Europe/Tallinn'});
