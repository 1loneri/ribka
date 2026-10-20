export const OVERLAY_ROLES={
 viewer:{label:'',name:'Зритель',color:'#f3f0ed'},
 vip:{label:'VIP',name:'VIP',color:'#c9a3ff'},
 moderator:{label:'МОД',name:'Модератор',color:'#91dfa7'},
} as const;
export type OverlayRole=keyof typeof OVERLAY_ROLES;

// These roles only style messages; channel permissions remain server-controlled.
export function overlayRole(badges:readonly string[]|undefined):OverlayRole{
 if(!Array.isArray(badges))return 'viewer';
 if(badges.includes('moderator'))return 'moderator';
 return badges.includes('vip')?'vip':'viewer';
}
