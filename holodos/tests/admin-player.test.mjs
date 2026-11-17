import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createSite} from '../src/site-server.js';
import {freezeEarlyTesters} from '../src/early-testers.js';
const db=new DatabaseSync(':memory:');
db.exec("CREATE TABLE players(id TEXT PRIMARY KEY,login TEXT,balance INTEGER DEFAULT 0,opens INTEGER DEFAULT 0,wins INTEGER DEFAULT 0,jackpots INTEGER DEFAULT 0,last_opened INTEGER DEFAULT 0);CREATE TABLE shop_orders(id INTEGER PRIMARY KEY,player_id TEXT,login TEXT,vp INTEGER,price INTEGER,status TEXT,created_at INTEGER,updated_at INTEGER);CREATE TABLE chat_stats(player_id TEXT PRIMARY KEY,login TEXT,message_count INTEGER DEFAULT 0,last_seen INTEGER DEFAULT 0,badges_json TEXT DEFAULT '{}');INSERT INTO players(id,login,balance) VALUES('1','alice',200000),('2','bob',200000);INSERT INTO chat_stats(player_id,login,badges_json) VALUES('1','alice','{\"founder\":\"0\"}'),('2','bob','{}');");
const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}},player=(id,login)=>{db.prepare('INSERT OR IGNORE INTO players(id,login) VALUES(?,?)').run(id,login);return db.prepare('SELECT * FROM players WHERE id=?').get(id)};
let tier='1000',rewardCreated=false,redeemed=false,paused=false;
const connections={helix:async(feature,path,params={},method='GET',body)=>{if(feature==='vips')return {data:[{user_id:'1',user_login:'alice'}]};if(feature==='subscriptions')return {data:[{user_id:'2',user_login:'bob',tier}]};if(path==='channel_points/custom_rewards/redemptions'){if(method==='PATCH'){redeemed=true;return {data:[]};}return {data:(params.status==='FULFILLED'&&redeemed||params.status==='UNFULFILLED'&&!redeemed)?[{id:'redeem-1',user_id:'1',user_login:'alice',redeemed_at:new Date().toISOString()}]:[]};}if(method==='POST'){rewardCreated=true;return {data:[{id:'reward-1'}]};}if(method==='PATCH'){if(body?.is_paused!==undefined)paused=body.is_paused;return {data:[]};}return {data:rewardCreated?[{id:'reward-1',title:'Кейс Холодоса · 10 000'}]:[]};}};
const site=createSite({db,transaction,player,publicUrl:'https://test.local',secret:'fixture-not-real',app:()=>null,channelConnections:connections,streamStatus:{get:async()=>({live:true,known:true})}});

const {createAdminPlayer}=await import('../src/admin-player.js');const manager=createAdminPlayer(db,transaction,site);let index=1;
function change(item,op,amount=1,target=''){const f=new URLSearchParams({login:'alice',player_id:'1',item,op,amount:String(amount),target,request_id:String(index++).padStart(32,'0')});manager.change(f,'admin');return f;}
const before=player('1','alice').balance;const f=change('w','add',100);manager.change(f,'admin');assert.equal(player('1','alice').balance,before+100);
change('case:vip','add',3);change('case:vip','replace',2,'case:subscriber');assert.equal(site.caseManagement.inspect('alice').vip,1);assert.equal(site.caseManagement.inspect('alice').subscriber,2);
change('frame:ears','add');assert.ok(site.frames.owned('1').includes('ears'));change('frame:ears','remove');assert.ok(!site.frames.owned('1').includes('ears'));
change('cosmetic:theme:mint','add');change('cosmetic:theme:mint','remove');assert.ok(!site.cosmetics.summary('1').owned.theme.includes('mint'));
change('vp:240','add',2);change('vp:240','replace',1,'vp:475');assert.equal(db.prepare("SELECT COUNT(*) n FROM manual_vp_issuances WHERE player_id='1' AND vp=475 AND status='pending'").get().n,1);
assert.throws(()=>change('case:vip','remove',200));assert.equal(site.caseManagement.inspect('alice').vip,1);
assert.ok(manager.render(x=>String(x),'token','alice').includes('inventory-strip'));console.log('PASS player inventory, replay, case swap, cosmetics, VP swap, overdraft rollback');
