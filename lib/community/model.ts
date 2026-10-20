export const ROOM_SLOTS={
 palette:{name:'Цвет комнаты',options:[{id:'ember',name:'Бордовый'},{id:'forest',name:'Хвойный'},{id:'night',name:'Ночной'}]},
 corner:{name:'Уютный уголок',options:[{id:'books',name:'Без декора'},{id:'arcade',name:'Игровой автомат'},{id:'plants',name:'Домашние джунгли'}]},
 rug:{name:'Ковёр',options:[{id:'check',name:'Шахматный'},{id:'sun',name:'Звезда Y2K'},{id:'waves',name:'Волны'}]},
} as const;
export type RoomSlot=keyof typeof ROOM_SLOTS;
export type RoomLayout={palette:'ember'|'forest'|'night';corner:'books'|'arcade'|'plants';rug:'check'|'sun'|'waves'};
export const DEFAULT_ROOM:RoomLayout={palette:'ember',corner:'books',rug:'check'};
export function roomLayout(value:unknown):RoomLayout{
 let data:unknown=value;if(typeof data==='string')try{data=JSON.parse(data);}catch{data={};}
 const result={...DEFAULT_ROOM},v=data&&typeof data==='object'?data as Record<string,unknown>:{};
 for(const key of Object.keys(ROOM_SLOTS) as RoomSlot[])if(ROOM_SLOTS[key].options.some(option=>option.id===v[key]))Object.assign(result,{[key]:v[key]});
 return result;
}
export const randomIndex=(length:number)=>{const cap=Math.floor(4294967296/length)*length;let value;do{value=crypto.getRandomValues(new Uint32Array(1))[0];}while(value>=cap);return value%length;};
export const normalizeGuess=(value:unknown)=>typeof value==='string'&&/^@?[a-z0-9_]{1,25}$/i.test(value.trim())?value.trim().replace(/^@/,'').toLowerCase():null;
export function anonymousQuote(text:string,login:string,name:string){
 if(!text||text.length>300||/^\s*[!/]/.test(text)||text.toLowerCase().includes(login.toLowerCase())||name&&text.toLowerCase().includes(name.toLowerCase()))return null;
 const quote=text.replace(/https?:\/\/\S+/gi,'[ссылка]').replace(/@[a-z0-9_]+/gi,'[ник]').trim();
 return quote.length>=6?quote.slice(0,220):null;
}
export function safeAvatar(value:unknown){if(typeof value!=='string'||value.length>1200)return null;try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='static-cdn.jtvnw.net'&&!u.port&&!u.username&&!u.password&&u.pathname.startsWith('/jtv_user_pictures/')?u.href:null;}catch{return null;}}
