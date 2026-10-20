import {env} from 'cloudflare:workers';
import type {FeedMessage} from '../twitch-feed/types';
import {KNOWN_BOTS} from '../levels/rules';
import {GUESS_RANKS,guessAnswer,guessCommand,guessTier} from './guess-model';
export type GuessGameRow={id:string;channel:string;owner:string;review_id:string;answer:string;state:'voting'|'revealed'|'cancelled';created:number;vote_ends:number;expires:number;revealed_at:number|null};
export const guessDb=()=>{if(!env.DB)throw Error('Игра временно недоступна.');return env.DB;};
export async function guessSnapshot(channel:string,viewerId?:string){
 const db=guessDb(),now=Date.now(),row=await db.prepare("SELECT g.*,r.riot_id,r.twitch_name,r.avatar,r.twitch_id,r.duration_ms,r.rank_verified_at,r.rank AS current_rank FROM rank_guess_games g JOIN demo_reviews r ON r.id=g.review_id WHERE g.channel=? AND g.state!='cancelled' AND r.status IN ('queued','reviewing','reviewed','declined') AND r.duration_ms>0 AND (g.state='revealed' OR g.expires>?) ORDER BY g.created DESC,g.id DESC LIMIT 1").bind(channel,now).first<GuessGameRow&{riot_id:string;twitch_name:string;avatar:string|null;twitch_id:string;duration_ms:number;rank_verified_at:number|null;current_rank:string}>();
 if(!row)return null;
 const [counts,mine,winners]=await Promise.all([
  db.prepare('SELECT choice,COUNT(*) AS n FROM rank_guess_votes WHERE game_id=? GROUP BY choice').bind(row.id).all<{choice:string;n:number}>(),
  viewerId?db.prepare('SELECT choice FROM rank_guess_votes WHERE game_id=? AND user_id=?').bind(row.id,viewerId).first<{choice:string}>():null,
  row.state==='revealed'?db.prepare('SELECT name FROM rank_guess_votes WHERE game_id=? AND choice=? ORDER BY updated,user_id LIMIT 12').bind(row.id,guessTier(row.answer)).all<{name:string}>():{results:[]},
 ]);
 const totals=new Map(counts.results.map(v=>[v.choice,v.n])),total=counts.results.reduce((n,v)=>n+v.n,0),revealed=row.state==='revealed';
 return {id:row.id,channel,state:row.state,created:row.created,voteEnds:row.vote_ends,voting:!revealed&&row.vote_ends>now,videoUrl:'/api/reviews/guess/video?game='+row.id,duration:row.duration_ms/1000,total,mine:mine?.choice??null,canVote:viewerId!==row.twitch_id,answer:revealed?{...guessAnswer(row.answer)!,verified:!!row.rank_verified_at&&row.current_rank===row.answer}:null,author:revealed?{name:row.twitch_name,riotId:row.riot_id,avatar:row.avatar}:null,results:revealed?GUESS_RANKS.map(rank=>({id:rank.id,count:totals.get(rank.id)??0,percent:total?Math.round((totals.get(rank.id)??0)/total*100):0})):null,correct:revealed?totals.get(guessTier(row.answer)!)??0:null,winners:winners.results.map(p=>p.name)};
}
export async function ingestGuessVote(channel:string,lease:string,message:FeedMessage){
 const now=Date.now(),choice=guessCommand(message.text);
 if(!choice||message.kind!=='message'||!/^\d{1,30}$/.test(message.userId)||KNOWN_BOTS.has(message.login.toLowerCase())||!Number.isFinite(message.created)||message.created<now-60000||message.created>now+10000)return false;
 const result=await guessDb().prepare(`INSERT INTO rank_guess_votes(game_id,user_id,name,choice,updated)
  SELECT g.id,?,?,?,? FROM rank_guess_games g JOIN demo_reviews r ON r.id=g.review_id WHERE g.channel=? AND g.state='voting' AND g.vote_ends>? AND g.expires>? AND g.created<=? AND r.twitch_id!=? AND r.status IN ('queued','reviewing','reviewed','declined')
  AND EXISTS(SELECT 1 FROM chat_channels c WHERE c.channel=g.channel AND c.owner=g.owner AND c.collector_token=? AND c.collector_until>?)
  ON CONFLICT(game_id,user_id) DO UPDATE SET name=excluded.name,choice=excluded.choice,updated=excluded.updated WHERE excluded.updated>=rank_guess_votes.updated`)
  .bind(message.userId,(message.name||message.login).slice(0,100),choice,message.created,channel,now,now,message.created,message.userId,lease,now).run();
 return !!result.meta.changes;
}
