import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const js=readFileSync(new URL('../src/site/nov23-ui.js',import.meta.url),'utf8');
const roles=js.slice(js.indexOf('function roleBadgesHtml'),js.indexOf('const nov23Profile'));
const ctx={applyPlayerCosmetics(){}};vm.createContext(ctx);vm.runInContext(roles,ctx);
function line(rank){return {html:'',querySelectorAll:()=>[],closest:()=>rank?{}:null,insertAdjacentHTML(_,html){this.html+=html}}}
for(const ranked of [false,true]){const row=line(ranked);ctx.applyPlayerCosmetics({dataset:{playerAvatar:'lick0ver'},closest:()=>row},{title:'чмоня'});assert.equal(row.html.includes('Модератор'),ranked);assert.equal(row.html.includes('Администратор'),ranked)}
assert.equal(ctx.roleBadgesHtml('lick0ver','Администратор').includes('>Администратор<'),false);
assert.equal(ctx.roleBadgesHtml('lick0ver','Модератор').includes('>Модератор<'),false);
const box={innerHTML:''},host={querySelector:()=>box},handlers={};let calls=0,posted;
Object.assign(ctx,{$:()=>host,renderProfile(){},state:{me:{authenticated:true,cosmetics:{duel_can:{id:'black'},duel_cans:[{id:'berry',label:'Ultra Strawberry Dreams',src:'/assets/duel-can-strawberry.webp'}]}}},esc:String,canImageSource:id=>'/assets/slot-'+id+'.webp',document:{addEventListener(type,fn){handlers[type]=fn}},supportPost:async(path,data)=>{calls++;posted={path,data}},refreshMe:async()=>{ctx.state.me.cosmetics.duel_can.id='berry';ctx.renderProfile()},notice(){}});
vm.runInContext(js.slice(js.indexOf('const nov23Profile'),js.indexOf('// Suggestions')),ctx);ctx.renderProfile();assert.ok(!box.innerHTML.includes('<select'));assert.ok(box.innerHTML.includes('data-profile-can="black" aria-pressed="true"'));assert.ok(box.innerHTML.includes('data-profile-can="berry" aria-pressed="false"'));
const buttons=[{disabled:false},{disabled:false}],button={dataset:{profileCan:'berry'},getAttribute:()=> 'false',closest:()=>({querySelectorAll:()=>buttons})};const event={target:{closest:()=>button}};const pending=handlers.click(event);await handlers.click(event);await pending;assert.equal(calls,1);assert.equal(posted.path,'/api/duels/equip');assert.equal(posted.data.can,'berry');assert.ok(box.innerHTML.includes('data-profile-can="berry" aria-pressed="true"'));assert.ok(buttons.every(b=>!b.disabled));
console.log('PASS one selected title outside rankings, nonduplicated ranking roles, clickable owned can cards, selected state and single-flight equip');
