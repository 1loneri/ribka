export type FishingSession={channel:string;enabled:number;collecting:boolean;collectorUntil:number};
export function collecting(game:FishingSession|null|undefined,now:number){return !!game?.enabled&&game.collecting&&game.collectorUntil>now;}
export function shouldResume(game:FishingSession|null|undefined,channel:string,ownChannel:string|undefined,canManage:boolean,listening:boolean,lastAttempt:string,now:number){
 return !!game&&game.channel===channel&&channel===ownChannel&&canManage&&!!game.enabled&&!collecting(game,now)&&!listening&&lastAttempt!==channel;
}
export function fishingStatus(game:FishingSession|null|undefined,listening:boolean,ready:boolean,now:number){
 if(!game?.enabled)return 'off';
 if(listening&&!ready)return 'connecting';
 if(collecting(game,now))return 'active';
 return 'disconnected';
}
