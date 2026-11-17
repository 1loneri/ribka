import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
let now=1000,draws=0,boards=0,apiCalls=0;
const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),drawImage(){draws++},fillRect(){boards++}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
const canvas={clientWidth:800,clientHeight:420,width:800,height:420,getContext:()=>context},nodes=new Map();
const host={querySelector(key){if(key==='canvas')return canvas;if(!nodes.has(key))nodes.set(key,{textContent:'',setAttribute(){},getAttribute(){return ''}});return nodes.get(key)}};
const sandbox={document:{hidden:true,getElementById:()=>host,addEventListener(){}},location:{pathname:'/giveaways/manage'},state:{me:{is_admin:true}},performance:{now:()=>now},Date:class extends Date{static now(){return now}},localStorage:{getItem:()=> 'off',setItem(){}},devicePixelRatio:1,Image:class{complete=true;naturalWidth=60},setInterval(){},requestAnimationFrame(){},api:()=>{apiCalls++},console};vm.createContext(sandbox);
const source=readFileSync(new URL('../src/site/giveaways.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.testAnimation={syncShots,draw,set:g=>snapshot={round:g},get:()=>({shots,reticle,soundOn}),post};})();');vm.runInContext(source,sandbox);sandbox.document.hidden=false;
const g={id:1,status:'running',layout:'pyramid',endsAt:21000,remaining:4,eliminated:[],participants:Array.from({length:4},(_,i)=>({id:String(i),login:'viewer'+i,can:{src:'/assets/slot-black.webp'},eliminated:false}))};
const a=sandbox.testAnimation;a.set(g);a.syncShots(g,now);g.eliminated=['0'];g.participants[0].eliminated=true;a.syncShots(g,now);const shot=a.get().shots[0];assert.ok(shot.fire>shot.start);const x=a.get().reticle.x;draws=0;a.draw(now+50);assert.notEqual(a.get().reticle.x,x);assert.equal(shot.played,false);assert.equal(draws,4);assert.ok(boards>0);now=shot.fire+1;a.draw(now);assert.equal(shot.played,true);draws=0;now+=700;a.draw(now); // A fallen can is fully transparent, its nickname remains.
assert.equal(apiCalls,0);a.syncShots(g,now);assert.equal(a.get().shots.length,1);await a.post('sound');assert.equal(a.get().soundOn,true);assert.equal(apiCalls,0);console.log('PASS shelves, moving aim before shot, impact timing, local mute toggle, deduplicated shots and zero prize API calls');
