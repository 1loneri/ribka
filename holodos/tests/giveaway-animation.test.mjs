import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
let now=1000,draws=0,boards=0,apiCalls=0,gunDraws=[];
const context=new Proxy({createLinearGradient:()=>({addColorStop(){}}),drawImage(image,...args){if(image.src==='/assets/giveaway-operator-atlas.webp'){gunDraws.push(args);return}if(image.src!=='/assets/giveaway-fridge-fixed.webp')draws++},fillRect(){boards++}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
const canvas={clientWidth:800,clientHeight:420,width:800,height:420,classList:{toggle(){}},getContext:()=>context},nodes=new Map();
const host={querySelector(key){if(key==='canvas')return canvas;if(!nodes.has(key))nodes.set(key,{textContent:'',setAttribute(){},getAttribute(){return ''}});return nodes.get(key)}};
const sandbox={document:{hidden:true,getElementById:()=>host,addEventListener(){}},location:{pathname:'/giveaways/manage'},state:{me:{is_admin:true}},performance:{now:()=>now},Date:class extends Date{static now(){return now}},localStorage:{getItem:()=> 'off',setItem(){}},devicePixelRatio:1,Image:class{complete=true;get naturalWidth(){return this.src==='/assets/giveaway-operator-atlas.webp'?2100:128}naturalHeight=256},setInterval(){},requestAnimationFrame(){},api:()=>{apiCalls++},console};vm.createContext(sandbox);
const source=readFileSync(new URL('../src/site/giveaways.js',import.meta.url),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.testAnimation={gunFrame,fridgeLightLevel,fridgeLayout,shotSound,syncShots,draw,set:g=>snapshot={round:g},get:()=>({shots,reticle,soundOn}),post};})();');vm.runInContext(source,sandbox);sandbox.document.hidden=false;
const g={id:1,status:'running',layout:'pyramid',endsAt:21000,remaining:4,eliminated:[],participants:Array.from({length:4},(_,i)=>({id:String(i),login:'viewer'+i,can:{src:'/assets/slot-black.webp'},eliminated:false}))};
const a=sandbox.testAnimation;a.set(g);a.syncShots(g,now);g.eliminated=['0'];g.participants[0].eliminated=true;a.syncShots(g,now);const shot=a.get().shots[0];assert.ok(shot.fire>shot.start);const y=a.get().reticle.y;draws=0;a.draw(now+50);assert.notEqual(a.get().reticle.y,y);assert.equal(shot.played,false);assert.equal(draws,4);assert.equal(gunDraws.length,0);assert.ok(boards>0);now=shot.fire+1;a.draw(now);assert.equal(shot.played,true);assert.equal(gunDraws.length,1);assert.equal(gunDraws[0][0],0);draws=0;now+=700;a.draw(now); // A fallen can is fully transparent, its nickname remains.
assert.equal(apiCalls,0);a.syncShots(g,now);assert.equal(a.get().shots.length,1);await a.post('sound');assert.equal(a.get().soundOn,true);assert.equal(apiCalls,0);console.log('PASS shelves, moving aim before shot, impact timing, local mute toggle, deduplicated shots and zero prize API calls');

const layout=a.fridgeLayout(Array.from({length:10},(_,i)=>({id:String(i)})),800,620);assert.equal(layout.rows,7);assert.deepEqual(Array.from({length:4},(_,row)=>[...layout.positions.values()].filter(p=>p.row===row).length),[1,2,3,4]);for(const p of layout.positions.values())assert.ok(Math.abs(p.base-p.y-layout.canH/2)<1e-8);assert.equal(layout.positions.get('0').x,400);console.log('PASS triangular rows 1/2/3/4, centered top and every can resting on refrigerator shelf');

const wide=a.fridgeLayout(Array.from({length:28},(_,i)=>({id:String(i)})),1400,650);assert.ok(wide.cellW<=86);assert.ok(wide.positions.get('27').x-wide.positions.get('21').x<=516);console.log('PASS compact triangular spacing is bounded on wide refrigerator stage');

assert.equal(a.fridgeLightLevel(5000),1);assert.ok(a.fridgeLightLevel(10800)<.8);assert.ok(a.fridgeLightLevel(10800)>.7);assert.equal(a.fridgeLightLevel(12000),1);console.log('PASS refrigerator light briefly dims and returns without a blackout');

for(const count of [0,1,2,24,28,60,120]){const scene=a.fridgeLayout(Array.from({length:count},(_,i)=>({id:String(i)})),1200,800);assert.equal(scene.rows,7);assert.equal(scene.positions.size,count);if(count)assert.equal(scene.positions.get('0').base,800*.306);for(const p of scene.positions.values()){assert.ok(p.x>1200*.1&&p.x<1200*.9);assert.ok(p.base>=800*.306&&p.base<=800*.839)}}console.log('PASS all seven permanent shelves and fixed bank baselines for empty scene through 120 participants');

assert.equal(a.gunFrame(-1),-1);assert.equal(a.gunFrame(0),0);assert.equal(a.gunFrame(80),2);assert.equal(a.gunFrame(1039),25);assert.equal(a.gunFrame(1040),-1);assert.equal(a.gunFrame(119,true),0);assert.equal(a.gunFrame(120,true),-1);console.log('PASS original 25 fps weapon timing, full bolt cycle, no scope frames and reduced motion');

const before=gunDraws.length;a.draw(shot.fire+1500);assert.equal(gunDraws.length,before);console.log('PASS weapon starts with bank impact, never before aiming, and stops after bolt cycle');
