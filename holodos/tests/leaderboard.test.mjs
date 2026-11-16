import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {createLeaderboard} from '../src/leaderboard.js';
const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE players(id TEXT PRIMARY KEY,login TEXT,balance INTEGER,opens INTEGER)');const list=createLeaderboard(db);
assert.deepEqual(list(1),{players:[],total:0,page:1,pages:1,pageSize:10,offset:0});
for(let i=0;i<24;i++)db.prepare('INSERT INTO players VALUES(?,?,?,?)').run(String(i),'viewer'+String(i).padStart(2,'0'),100-Math.floor(i/2),i);
const p1=list('1'),p2=list('2'),p3=list('3');assert.equal(p1.total,24);assert.equal(p1.pages,3);assert.equal(p1.players.length,10);assert.equal(p2.offset,10);assert.equal(p3.players.length,4);assert.equal(p3.offset,20);
const all=[...p1.players,...p2.players,...p3.players];assert.equal(new Set(all.map(p=>p.login)).size,24);assert.deepEqual(all.map(p=>p.login),Array.from({length:24},(_,i)=>'viewer'+String(i).padStart(2,'0')));
for(const invalid of [null,undefined,'0','-1','1.5','NaN','1 OR 1=1','9999999999'])assert.equal(list(invalid).page,1);
assert.equal(list('999').page,3);db.exec('DELETE FROM players WHERE opens>=10');assert.equal(list('3').page,1);
console.log('PASS: pagination, 10 rows, stable tied ordering, complete coverage without duplicates, invalid pages, empty list, final short page and out-of-range page clamping');
