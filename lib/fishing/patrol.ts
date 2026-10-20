export const PATROL_WINDOW=10*60000;
export const PATROL_FINE_COOLDOWN=5*60000;
export type FishingPatrol={recentCasts:number[];limit:number;lastFineAt:number};
type Fisher={coins:number;patrol?:FishingPatrol};

const chooseLimit=(rng:()=>number)=>15+Math.min(15,Math.max(0,Math.floor(rng()*16)));

// Called only after a successful human cast. The caller persists this together
// with the catch and coin balance in the existing revision-checked transaction.
export function recordPatrolCast(player:Fisher,now:number,rng:()=>number):string{
 const patrol=player.patrol??={recentCasts:[],limit:chooseLimit(rng),lastFineAt:0};
 const recent=patrol.recentCasts.filter(at=>at>now-PATROL_WINDOW&&at<=now);
 if(patrol.recentCasts.length&&!recent.length)patrol.limit=chooseLimit(rng);
 patrol.recentCasts=[...recent,now].slice(-30);
 const count=patrol.recentCasts.length;
 if(count>=patrol.limit&&(!patrol.lastFineAt||now-patrol.lastFineAt>=PATROL_FINE_COOLDOWN)){
  const amount=Math.min(player.coins,Math.max(5,Math.min(30,Math.floor(player.coins*.1))));
  player.coins-=amount;
  patrol.lastFineAt=now;
  // A paid inspection starts a fresh quota; already fined casts cannot be
  // charged a second time. Recent history stays bounded for long sessions.
  patrol.recentCasts=[];patrol.limit=chooseLimit(rng);
  return '🚨 Рыбнадзор: превышена норма вылова! Штраф −'+amount+' монет. Дай озеру отдохнуть!';
 }
 return '';
}
