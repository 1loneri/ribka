import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/site/nov23-ui.js',import.meta.url),'utf8');
const block=source.slice(source.indexOf('// Suggestions'),source.indexOf('function playJackpotCan'));
function node(){return {value:'',attrs:{},events:{},children:[],hidden:false,setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},before(n){this.wrapper=n},append(...nodes){this.children.push(...nodes)},addEventListener(k,f){(this.events[k]||=[]).push(f)},dispatchEvent(e){for(const fn of this.events[e.type]||[])fn(e)},querySelectorAll(){return this.options||[]}}}
const input=node(),created=[],timers=new Map(),requests=[];let sequence=0;
const ctx={$:()=>input,document:{activeElement:input,createElement(){const n=node();created.push(n);return n}},state:{me:{authenticated:true}},esc:String,Event:class{constructor(type){this.type=type}},setTimeout(fn){timers.set(++sequence,fn);return sequence},clearTimeout(id){timers.delete(id)},api(url){return new Promise(resolve=>requests.push({url,resolve}))}};
vm.runInNewContext(block,ctx);const box=created[0],field=created[1];assert.equal(input.wrapper,field);assert.equal(field.children[0],input);assert.equal(field.children[1],box);assert.equal(input.attrs.role,'combobox');
const edit=value=>{input.value=value;input.dispatchEvent({type:'input'})};
const flush=async()=>{const callbacks=[...timers.values()];timers.clear();for(const cb of callbacks)cb();await new Promise(setImmediate)};
edit('wa');await flush();assert.equal(requests[0].url,'/api/players/suggest?q=wa');edit('war');await flush();requests[0].resolve({players:[{login:'wrong_old_result'}]});await new Promise(setImmediate);assert.equal(box.hidden,true);
requests[1].resolve({players:[{login:'wariouss'},{login:'war1ouss'}]});await new Promise(setImmediate);assert.equal(box.hidden,false);assert.ok(box.innerHTML.includes('wariouss'));box.options=[node(),node()];
let prevented=false;input.dispatchEvent({type:'keydown',key:'ArrowUp',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(input.attrs['aria-activedescendant'],'duel-suggestion-1');
let previewValue='';input.addEventListener('input',()=>{previewValue=input.value});input.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});assert.equal(input.value,'war1ouss');assert.equal(previewValue,'war1ouss');assert.equal(box.hidden,true);assert.equal(timers.size,0);
edit('li');await flush();input.dispatchEvent({type:'keydown',key:'Escape'});requests[2].resolve({players:[{login:'lick0ver'}]});await new Promise(setImmediate);assert.equal(box.hidden,true);
edit('wa');await flush();input.dispatchEvent({type:'blur'});requests[3].resolve({players:[{login:'wariouss'}]});await new Promise(setImmediate);assert.equal(box.hidden,true);
console.log('PASS anchored nickname dropdown, prefix query, stale response rejection, ArrowUp/Enter selection, opponent preview update, Escape and blur');
