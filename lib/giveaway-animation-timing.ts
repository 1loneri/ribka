export const FISHING_DRAW_DURATION=12000;
export const VENDING_DRAW_DURATION=12000;
export const winnerRevealDelay=(mode:string)=>mode==='fishing'?FISHING_DRAW_DURATION+500:mode==='vending'?VENDING_DRAW_DURATION+500:5000;
