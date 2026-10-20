import locationData from './locations.json';

export const LICENSE_DURATION=48*3600000;
export const licenseRates=locationData.map(location=>({...location,price:location.min_rod*50}));
export type FishingLicense={until:number;tier:number;trial:boolean};
type Fisher={coins:number;location:string;license?:FishingLicense};
export const licensePrice=(location:string)=>licenseRates.find(rate=>rate.id===location)?.price??50;

export function fishingLicenseStatus(player:Fisher,now:number){
 const rate=licenseRates.find(rate=>rate.id===player.location)??licenseRates[0],license=player.license;
 const phase=!license?'new':license.until<=now?'expired':license.trial?'trial':license.tier<rate.min_rod?'upgrade':'active';
 const due=phase==='expired'?rate.price:phase==='upgrade'?rate.price-license!.tier*50:0;
 return {phase,price:rate.price,due,until:license?.until??0,tier:rate.min_rod,canAfford:player.coins>=due};
}

// Renewal is charged only with an accepted cast. No fees accrue while absent,
// and viewing profiles or changing the location preview never charges coins.
export function ensureFishingLicense(player:Fisher,now:number):{ok:boolean;message:string}{
 const status=fishingLicenseStatus(player,now);
 if(status.phase==='new'){
  player.license={until:now+LICENSE_DURATION,tier:status.tier,trial:true};
  return {ok:true,message:'🎫 Лицензия на первые 48 ч. — бесплатно.'};
 }
 if(status.phase==='trial'){
  player.license!.tier=Math.max(player.license!.tier,status.tier);
  return {ok:true,message:''};
 }
 if(status.phase==='active')return {ok:true,message:''};
 if(!status.canAfford)return {ok:false,message:(status.phase==='upgrade'?'Доплата за эту локацию':'Лицензия истекла. Продление')+' — '+status.due+' монет, у тебя '+player.coins+'. Забери !бонус или выбери более дешёвую локацию.'};
 player.coins-=status.due;
 if(status.phase==='upgrade'){
  player.license!.tier=status.tier;
  return {ok:true,message:'🎫 Доплата за локацию −'+status.due+' монет. Срок лицензии прежний.'};
 }
 player.license={until:now+LICENSE_DURATION,tier:status.tier,trial:false};
 return {ok:true,message:'🎫 Лицензия продлена: −'+status.due+' монет за 48 ч.'};
}

export function fishingLicenseReply(player:Fisher,now:number){
 const status=fishingLicenseStatus(player,now),hours=Math.max(0,Math.ceil((status.until-now)/3600000));
 if(status.phase==='new')return 'Лицензия: первые 48 ч. с первого заброса бесплатно, затем '+status.price+' монет / 48 ч.';
 if(status.phase==='expired')return 'Лицензия истекла. Продление при следующем забросе: '+status.due+' монет.';
 if(status.phase==='upgrade')return 'Лицензия ещё на '+hours+' ч. Для этой локации доплата '+status.due+' монет.';
 return (status.phase==='trial'?'Пробная лицензия':'Лицензия')+' ещё на '+hours+' ч. Продление: '+status.price+' монет / 48 ч.';
}
