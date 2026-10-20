import {env} from 'cloudflare:workers';

// The owner requested this historical total on 2026-10-19, after supplying their chat statistics.
// The observed site total was read from production before preparing this correction.
const correction={id:'2026-10-19-war1ouss-lick0ver',channel:'war1ouss',userId:'491647905',login:'lick0ver',observed:785,total:7182};
let completed=false,pending:Promise<void>|null=null;
export async function restoreMessageHistory(channel:string){
 if(channel!==correction.channel||completed)return;
 if(pending)return pending;
 pending=restore();try{await pending;}finally{pending=null;}
}
async function restore(){
 const db=env.DB;if(!db)throw Error('Уровни временно недоступны.');
 const exists=()=>db.prepare('SELECT id FROM level_message_adjustments WHERE id=?').bind(correction.id).first();
 if(await exists()){completed=true;return;}
 const nonce=crypto.randomUUID(),amount=correction.total-correction.observed;
 // A unique receipt and the increment share a transaction. Replays, parallel workers and
 // new chat messages cannot apply the historical amount twice or overwrite newer activity.
 const result=await db.batch([
  db.prepare(`INSERT OR IGNORE INTO level_message_adjustments(id,channel,user_id,amount,observed,total,nonce,created)
   SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM level_players WHERE channel=? AND user_id=? AND lower(login)=? AND messages>=?)`)
   .bind(correction.id,correction.channel,correction.userId,amount,correction.observed,correction.total,nonce,Date.now(),correction.channel,correction.userId,correction.login,correction.observed),
  db.prepare(`UPDATE level_players SET messages=messages+?,xp=messages+? WHERE channel=? AND user_id=?
   AND EXISTS (SELECT 1 FROM level_message_adjustments WHERE id=? AND nonce=?)`)
   .bind(amount,amount,correction.channel,correction.userId,correction.id,nonce),
 ]);
 completed=!!result[0].meta.changes||!!await exists();
}
