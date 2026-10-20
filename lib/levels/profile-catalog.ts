// Only artwork supplied by the site owner is added to these collections.
// Profile editors select IDs from this list; they never submit URLs or files.
export type ProfileArtwork={id:string;name:string;image:string;position?:string};
export const PROFILE_AVATARS:ProfileArtwork[]=[
 {id:'viper-ink',name:'Вайпер',image:'/profiles/avatars/viper-ink.jpg'},
 {id:'fade-ink',name:'Фейд',image:'/profiles/avatars/fade-ink.jpg'},
 {id:'jett-ink',name:'Джетт',image:'/profiles/avatars/jett-ink.jpg'},
 {id:'jett-sketch',name:'Сейдж · скетч',image:'/profiles/avatars/jett-sketch.png'},
 {id:'clove-sketch',name:'Клов · скетч',image:'/profiles/avatars/clove-sketch.png'},
];
export const PROFILE_BANNERS:ProfileArtwork[]=[
 {id:'clove-pastel',name:'Клов',image:'/profiles/banners/clove-pastel.png',position:'50% 34%'},
 {id:'yoru-summer',name:'Йору у бассейна',image:'/profiles/banners/yoru-summer.jpg',position:'50% 30%'},
 {id:'fade-shadow',name:'Фейд',image:'/profiles/banners/fade-shadow.png',position:'50% 43%'},
 {id:'jett-stream',name:'Джетт в наушниках',image:'/profiles/banners/jett-stream.png',position:'65% 38%'},
];
export const DEFAULT_AVATAR='twitch';
export const DEFAULT_BANNER='default';
