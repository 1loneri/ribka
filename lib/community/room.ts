import {communityDb,communityOperatorSql} from './access';
import {DEFAULT_ROOM,ROOM_SLOTS,roomLayout,randomIndex,type RoomSlot} from './model';
type Poll={id:string;channel:string;owner:string;slot:RoomSlot;state:string;active:number|null;created:number;ends:number;winner:string|null};
type Room={channel:string;layout:string;revision:number};
async function settle(channel:string){
 const db=communityDb(),now=Date.now(),poll=await db.prepare("SELECT * FROM community_room_polls WHERE channel=? AND active=1 AND ends<=? LIMIT 1").bind(channel,now).first<Poll>();if(!poll)return;
 // Lock voting before counting; any competing finalizer uses the same immutable vote set.
 await db.prepare('UPDATE community_room_polls SET ends=0 WHERE id=? AND active=1 AND ends<=?').bind(poll.id,now).run();
 const room=await db.prepare('SELECT * FROM community_rooms WHERE channel=?').bind(channel).first<Room>();if(!room)return;
 const counts=await db.prepare('SELECT choice,COUNT(*) AS n FROM community_room_votes WHERE poll_id=? GROUP BY choice').bind(poll.id).all<{choice:string;n:number}>();
 const options=ROOM_SLOTS[poll.slot]?.options;if(!options)return;
 const totals=new Map(counts.results.map(x=>[x.choice,x.n])),max=Math.max(0,...options.map(x=>totals.get(x.id)??0)),best=options.filter(x=>(totals.get(x.id)??0)===max),layout=roomLayout(room.layout),winner=max?best[randomIndex(best.length)].id:layout[poll.slot];
 const nonce=crypto.randomUUID();
 await db.batch([
  db.prepare("UPDATE community_room_polls SET active=NULL,state='closed',winner=?,settled=? WHERE id=? AND active=1 AND ends=0").bind(winner,nonce,poll.id),
  db.prepare('UPDATE community_rooms SET layout=?,revision=revision+1 WHERE channel=? AND EXISTS(SELECT 1 FROM community_room_polls WHERE id=? AND settled=?)').bind(JSON.stringify({...layout,[poll.slot]:winner}),channel,poll.id,nonce),
 ]);
}
export async function roomSnapshot(channel:string,viewer?:string){
 await settle(channel);const db=communityDb(),row=await db.prepare('SELECT * FROM community_rooms WHERE channel=?').bind(channel).first<Room>(),poll=await db.prepare('SELECT * FROM community_room_polls WHERE channel=? ORDER BY active DESC,created DESC,id DESC LIMIT 1').bind(channel).first<Poll>();
 const votes=poll?await db.prepare('SELECT choice,COUNT(*) AS n FROM community_room_votes WHERE poll_id=? GROUP BY choice').bind(poll.id).all<{choice:string;n:number}>():{results:[]};
 const mine=poll&&viewer?await db.prepare('SELECT choice FROM community_room_votes WHERE poll_id=? AND user_id=?').bind(poll.id,viewer).first<{choice:string}>():null;
 return {layout:roomLayout(row?.layout),revision:row?.revision??0,poll:poll?{id:poll.id,slot:poll.slot,state:poll.state,ends:poll.ends,winner:poll.winner,total:votes.results.reduce((n,x)=>n+x.n,0),counts:votes.results,mine:mine?.choice??null}:null};
}
export async function startRoomPoll(channel:string,owner:string,id:string,slot:RoomSlot,email:string){
 const db=communityDb(),prior=await db.prepare('SELECT owner,channel FROM community_room_polls WHERE id=?').bind(id).first<{owner:string;channel:string}>();if(prior)return prior.owner===owner&&prior.channel===channel;
 await settle(channel);
 const result=await db.batch([
  db.prepare('INSERT OR IGNORE INTO community_rooms(channel,layout,revision) VALUES(?,?,0)').bind(channel,JSON.stringify(DEFAULT_ROOM)),
  db.prepare(`INSERT OR IGNORE INTO community_room_polls(id,channel,owner,slot,state,active,created,ends) SELECT ?,?,?,?,'voting',1,?,? WHERE ${communityOperatorSql}`).bind(id,channel,owner,slot,Date.now(),Date.now()+90000,email.toLowerCase(),channel,channel,owner),
 ]);return !!result[1].meta.changes;
}
export async function roomVote(channel:string,pollId:string,user:string,name:string,choice:string){
 const db=communityDb(),poll=await db.prepare('SELECT slot FROM community_room_polls WHERE id=? AND channel=?').bind(pollId,channel).first<{slot:RoomSlot}>();if(!poll||!ROOM_SLOTS[poll.slot].options.some(x=>x.id===choice))return false;
 const result=await db.prepare(`INSERT INTO community_room_votes(poll_id,user_id,name,choice,updated) SELECT id,?,?,?,? FROM community_room_polls WHERE id=? AND channel=? AND active=1 AND ends>? ON CONFLICT(poll_id,user_id) DO UPDATE SET name=excluded.name,choice=excluded.choice,updated=excluded.updated`).bind(user,name,choice,Date.now(),pollId,channel,Date.now()).run();return !!result.meta.changes;
}
export async function finishRoomPoll(channel:string,owner:string,id:string,email:string){
 const result=await communityDb().prepare(`UPDATE community_room_polls SET ends=0 WHERE id=? AND channel=? AND owner=? AND active=1 AND ${communityOperatorSql}`).bind(id,channel,owner,email.toLowerCase(),channel,channel,owner).run();await settle(channel);return !!result.meta.changes;
}
