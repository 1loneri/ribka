// Read-only release smoke checks: no Twitch calls, no database, no secrets.
// Run during the Docker build to catch missing images and accidental broken routes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';

const dir=dirname(fileURLToPath(import.meta.url));
const html=readFileSync(join(dir,'index.html'),'utf8');
const css=readFileSync(join(dir,'site.css'),'utf8');
const server=readFileSync(join(dir,'..','site-server.js'),'utf8');

const images=['hero-main-2026.webp','casino-main-2026.webp','cases-main-2026.webp','duels-main-2026.webp'];
for(const name of images){
 const bytes=readFileSync(join(dir,name));
 assert.ok(bytes.length>30000,name+' unexpectedly small or empty');
 assert.equal(bytes.toString('ascii',0,4),'RIFF',name+' RIFF signature');
 assert.equal(bytes.toString('ascii',8,12),'WEBP',name+' WebP signature');
 assert.equal(bytes.readUInt32LE(4)+8,bytes.length,name+' invalid RIFF length');
 assert.ok(html.includes('/assets/'+name)||css.includes('/assets/'+name),name+' not referenced by site');
 assert.ok(server.includes("'/assets/"+name+"'"),name+' not exposed by backend');
}
for(const [route,id] of [
 ['/','view-home'],['/casino','view-casino'],['/cases','view-cases'],
 ['/duels','view-duels'],['/top','view-top'],['/chat','view-chat'],
 ['/shop','view-shop'],['/profile','view-profile']
]){
 assert.ok(html.includes('id="'+id+'" data-view="'+route+'"'),'Missing page '+route);
}
assert.ok(html.includes('mode-card--cases'),'Missing cases artwork card');
assert.ok(css.includes('object-fit:contain'),'Artwork crop protection missing');
assert.ok(css.includes('prefers-reduced-motion'),'Reduced-motion styles missing');
console.log('War1ouss static smoke checks passed: 4 images, 8 routes, responsive artwork.');
