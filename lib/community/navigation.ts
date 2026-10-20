export type CommunityTab='room'|'viewer'|'levels'|'profile';
export type LevelView='overview'|'overlay'|'season';
export type CommunityLocation={tab:CommunityTab;channel:string;view:LevelView;profile:string};
export function communityLocation(q:URLSearchParams):CommunityLocation{
 const value=q.get('tab'),tab:CommunityTab=value==='viewer'||value==='levels'||value==='profile'?value:'room';
 const channel=q.get('channel')??'',view=q.get('view'),profile=q.get('profile')??'';
 return {tab,channel:/^[a-z0-9_]{1,25}$/.test(channel)?channel:'',view:view==='overlay'||view==='season'?view:'overview',profile:tab==='profile'&&/^\d{1,30}$/.test(profile)?profile:''};
}
export function communityHref(tab:CommunityTab,channel='',view:LevelView='overview',profile=''){
 const q=new URLSearchParams({tab});
 if(/^[a-z0-9_]{1,25}$/.test(channel))q.set('channel',channel);
 if(tab==='levels'&&view!=='overview')q.set('view',view);
 if(tab==='profile'&&/^\d{1,30}$/.test(profile))q.set('profile',profile);
 return '/community?'+q;
}
// OAuth returns are limited to this local workspace and its known fields.
export function validCommunityReturn(value:string){
 if(!/^\/community(?:\?[^#]*)?$/.test(value)||value.length>250)return false;
 const q=new URL(value,'https://site.invalid').searchParams;
 for(const [key] of q)if(!['tab','channel','view','profile'].includes(key)||q.getAll(key).length!==1)return false;
 if(q.has('tab')&&!['room','viewer','levels','profile'].includes(q.get('tab')!))return false;
 if(q.has('channel')&&!/^[a-z0-9_]{1,25}$/.test(q.get('channel')!))return false;
 if(q.has('view')&&(q.get('tab')!=='levels'||!['overview','overlay','season'].includes(q.get('view')!)))return false;
 return !q.has('profile')||q.get('tab')==='profile'&&/^\d{1,30}$/.test(q.get('profile')!);
}
export function legacyLevelsHref(q:URLSearchParams){
 const view=q.get('tab'),profile=q.get('profile')??'',tab=view==='profile'||/^\d{1,30}$/.test(profile)?'profile':'levels';
 const target=new URL(communityHref(tab,q.get('channel')??'',view==='overlay'||view==='season'?view:'overview',profile),'https://site.invalid');
 const twitch=q.get('twitch');if(twitch)target.searchParams.set('twitch',twitch.slice(0,250));
 return target.pathname+target.search;
}
