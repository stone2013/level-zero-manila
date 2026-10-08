import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {bootControls} from './app-harness.mjs';

// These checks dispatch production event handlers against the fake DOM/GPU.
// They do not claim browser hit-testing, rendered images, or real-device PWA QA.
const pointer=(pointerId,clientX=90,clientY=220)=>({pointerId,clientX,clientY,preventDefault(){},stopPropagation(){}});
const key=code=>({code,repeat:false,preventDefault(){}});
function start(){const app=bootControls();app.element('start').onclick();return app}
function primeInput(app){
 app.dispatch('stick','pointerdown',pointer(11));
 app.dispatch('look','pointerdown',pointer(22));
 app.dispatch('sprint','pointerdown',pointer(33));
 app.dispatch('window','keydown',key('KeyW'));
 app.dispatch('window','keydown',key('ShiftLeft'));
 assert.equal(app.captured.size,3);
 assert.notEqual(app.eval('input.forward'),0);
}
function assertCleared(app,label){
 assert.equal(app.captured.size,0,label);
 assert.equal(app.eval('keys.size+touch.sprint.size'),0,label);
 assert.equal(app.eval('touch.move'),null,label);
 assert.equal(app.eval('touch.look'),null,label);
 assert.equal(app.eval('input.forward'),0,label);
 assert.equal(app.eval('input.strafe'),0,label);
 assert.equal(app.element('stick-knob').style.transform,'',label);
}
function sendObsoletePointerEvents(app){
 app.dispatch('stick','pointermove',pointer(11,120,200));
 app.dispatch('look','pointermove',pointer(22,260,270));
 app.dispatch('sprint','pointerup',pointer(33));
}

test('final review: interruption/resume matrix releases every held input and ignores obsolete pointer moves',()=>{
 for(const kind of ['pause','blur','pagehide','hidden','portrait','loading','inventory','menu']){
  const app=start();primeInput(app);
  if(kind==='pause')app.element('pause').onclick();
  if(kind==='blur'||kind==='pagehide')app.dispatch('window',kind);
  if(kind==='hidden'){app.context.document.hidden=true;app.dispatch('document','visibilitychange')}
  if(kind==='portrait')app.rotate(390,844);
  if(kind==='loading')app.eval('chunkStream.clear();requestedSelection=null;updateStreamView()');
  if(kind==='inventory')app.element('backpack').onclick({stopPropagation(){}});
  if(kind==='menu'){app.element('pause').onclick();app.element('main-menu').onclick()}
  assertCleared(app,kind);assert.equal(app.eval('canPlay()'),false,kind);
  if(kind==='hidden'){app.context.document.hidden=false;app.dispatch('document','visibilitychange')}
  if(['pause','blur','pagehide','hidden'].includes(kind))app.element('resume').onclick();
  if(kind==='portrait')app.rotate(844,390);
  if(kind==='loading')app.settle();
  if(kind==='inventory')app.element('inventory-close').onclick();
  if(kind==='menu')app.element('continue').onclick();
  assert.equal(app.eval('canPlay()'),true,kind);
  const position=app.eval('JSON.stringify(game.player)');
  sendObsoletePointerEvents(app);app.frame(50);
  assertCleared(app,kind);assert.equal(app.eval('JSON.stringify(game.player)'),position,kind);
 }
});

test('final review: actual caught transition and retry do not carry touch, look or keyboard input into a new attempt',()=>{
 const app=start();let time=0;
 const tick=()=>{app.frame(time+=50);if(app.eval('worldLoading'))app.settle()};
 app.eval('game.elapsed=479.99');
 for(let i=0;i<200&&app.eval('game.escape.phase')!=='chase';i++)tick();
 assert.equal(app.eval('game.escape.phase'),'chase');
 app.eval('game.escape.monster.x=game.player.x-.5;game.escape.monster.z=game.player.z;game.escape.navClock=0');
 tick();assert.equal(app.eval('game.escape.phase'),'caught-animation');
 primeInput(app);
 for(let i=0;i<80&&app.eval('game.mode')!=='caught';i++)tick();
 assert.equal(app.eval('game.mode'),'caught');assertCleared(app,'caught');
 assert.equal(app.element('caught-panel').hidden,false);
 const items=app.eval('JSON.stringify(game.items)');
 app.element('escape-retry').onclick();app.settle();tick();
 assert.equal(app.eval('game.escape.phase'),'warning');
 assert.equal(app.eval('JSON.stringify(game.items)'),items);
 const position=app.eval('JSON.stringify(game.player)');
 sendObsoletePointerEvents(app);tick();
 assertCleared(app,'retry');assert.equal(app.eval('JSON.stringify(game.player)'),position);
});

test('final review: the versioned offline cache closes over every local module, texture and UI reference',async()=>{
 const scope='https://example.test/nested/level-zero/',handlers={},stored=new Map();
 let network=0,waiting,response;
 const self={registration:{scope},location:{origin:new URL(scope).origin},addEventListener:(name,fn)=>handlers[name]=fn};
 const cache={
  async addAll(requests){for(const request of requests){
   assert.equal(request.cache,'reload');
   const name=new URL(request.url).pathname.slice(new URL(scope).pathname.length)||'index.html';
   stored.set(request.url,fs.readFileSync(path.join('dist',name)));
  }},
  async match(request){return stored.get(typeof request==='string'?request:request.url??request.href)}
 };
 const context={self,URL,Request,caches:{open:async()=>cache},fetch:async()=>{network++;throw new Error('offline')}};
 vm.runInNewContext(fs.readFileSync('dist/sw.js','utf8'),context);
 handlers.install({waitUntil:promise=>waiting=promise});await waiting;
 const required=new Set(['index.html','app.js','style.css','manifest.webmanifest']);
 const html=fs.readFileSync('dist/index.html','utf8');
 for(const [,ref]of html.matchAll(/(?:src|href)=["'](\.[^"']+)["']/g))required.add(path.posix.normalize(ref));
 const manifest=JSON.parse(fs.readFileSync('dist/manifest.webmanifest','utf8'));
 for(const icon of manifest.icons)required.add(path.posix.normalize(icon.src));
 const modules=['app.js'],seen=new Set();
 while(modules.length){
  const name=modules.pop();if(seen.has(name))continue;seen.add(name);required.add(name);
  const source=fs.readFileSync(path.join('dist',name),'utf8');
  for(const [,ref]of source.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g))modules.push(path.posix.normalize(path.posix.join(path.posix.dirname(name),ref)));
  for(const [,ref]of source.matchAll(/\btexture\(["'](\.[^"']+)["']/g))required.add(path.posix.normalize(ref));
 }
 for(const kind of ['food','water','phone'])required.add(`icons/item-${kind}.svg`);
 for(const name of required){
  handlers.fetch({request:{method:'GET',mode:'cors',url:new URL(name,scope).href},respondWith:promise=>response=promise});
  assert.deepEqual(await response,fs.readFileSync(path.join('dist',name)),name);
 }
 handlers.fetch({request:{method:'GET',mode:'navigate',url:scope+'?offline-check=1'},respondWith:promise=>response=promise});
 assert.deepEqual(await response,fs.readFileSync('dist/index.html'));
 assert.equal(network,0);assert(required.size>=28);
 const version=html.match(/HTML \/ PWA · ([a-z0-9.-]+)/)?.[1];assert(version);
 assert.match(fs.readFileSync('dist/sw.js','utf8'),new RegExp(`CACHE=PREFIX\\+'${version.replaceAll('.','\\.')}'`));
});
