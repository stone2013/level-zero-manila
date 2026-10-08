import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {bootControls as boot} from './app-harness.mjs';
const key=(a,code,other={})=>a.dispatch('window','keydown',{code,repeat:false,preventDefault(){},...other});
function settings(a){a.element('pause').onclick();a.element('pause-help').onclick()}
function enabled(){const a=boot();a.element('start').onclick();settings(a);a.element('developer-toggle').onclick();return a}
test('developer actions are default-off, hidden and inert without enable or without a live game',()=>{
 const a=boot();assert.equal(a.element('developer-tools').hidden,true);assert.equal(a.element('debug-badge').hidden,true);const before=a.eval('JSON.stringify(game.snapshot())');
 a.element('help-open').onclick();for(const id of ['developer-spawn','developer-time','developer-teleport-inside'])a.element(id).onclick();assert.equal(a.eval('JSON.stringify(game.snapshot())'),before);
 a.element('developer-toggle').onclick();assert.equal(a.element('developer-tools').hidden,false);assert.equal(a.element('debug-badge').hidden,false);assert.equal(a.element('developer-spawn').disabled,true);assert.equal(a.element('developer-time').disabled,true);assert.equal(a.element('developer-teleport-inside').disabled,true);
 for(const id of ['developer-spawn','developer-time','developer-teleport-inside'])a.element(id).onclick();assert.equal(a.eval('game.items.length'),7);assert.equal(a.eval('game.elapsed'),0);
 a.element('help-close').onclick();a.element('start').onclick();assert.equal(a.eval('game.developerEnabled'),true);assert.equal(a.eval('game.items.length'),7,'normal starting stock is intact');
 const fresh=boot();assert.equal(fresh.eval('developerEnabled'),false,'reload creates a disabled session');
});
test('settings spawn creates one matching mesh per unique item without restarting the world or advancing time',()=>{
 const a=enabled();const old=a.eval('game.world'),elapsed=a.eval('game.elapsed');
 for(const kind of ['food','water','phone']){a.element('developer-item').value=kind;a.element('developer-spawn').onclick()}
 assert.equal(a.eval('game.items.length'),10);assert.equal(a.eval('itemMeshes.size'),10);assert.equal(a.eval('new Set(game.items.map(i=>i.id)).size'),10);assert.equal(a.eval('game.items.filter(i=>i.developerSpawned).length'),3);
 assert.equal(a.eval('game.world'),old);assert.equal(a.eval('game.elapsed'),elapsed);assert.equal(a.eval('game.mode'),'paused');a.frame(1000);assert.equal(a.eval('game.elapsed'),elapsed);
 assert.equal(a.eval('game.items.find(i=>i.id==="water-1").x'),a.eval('game.maze.doorX+4.25'));
 a.element('developer-toggle').onclick();const count=a.eval('game.items.length');a.element('developer-spawn').onclick();assert.equal(a.eval('game.items.length'),count);assert.equal(a.element('debug-badge').hidden,true);
});
test('7:30 waits for thirty active seconds after settings and respects the existing event eligibility',()=>{
 const a=enabled();a.element('developer-time').onclick();assert.equal(a.eval('game.elapsed'),450);for(let i=1;i<20;i++)a.frame(i*1000);assert.equal(a.eval('game.elapsed'),450);assert.equal(a.eval('game.escape.phase'),'idle');
 a.element('help-close').onclick();assert.equal(a.eval('game.mode'),'paused');a.element('resume').onclick();let now=19000;for(let i=0;i<599;i++)a.frame(now+=50);assert.equal(a.eval('game.escape.phase'),'idle');a.frame(now+=50);assert.equal(a.eval('game.escape.phase'),'flicker');
 settings(a);assert.equal(a.element('developer-time').disabled,true);const elapsed=a.eval('game.elapsed');a.element('developer-time').onclick();assert.equal(a.eval('game.elapsed'),elapsed);assert.match(a.element('developer-status').textContent,/已触发|已跳过/);
});
test('developer teleport clears active chase visuals and preserves paused state, items, resources and original door ending',()=>{
 const a=enabled();a.element('help-close').onclick();a.element('resume').onclick();a.eval('game.elapsed=479.99');let now=0;for(let i=0;i<600&&a.eval('game.escape.phase')!=='chase';i++){a.frame(now+=50);a.settle()}assert.equal(a.eval('game.escape.phase'),'chase');settings(a);
 const items=a.eval('JSON.stringify(game.items)'),food=a.eval('game.food'),water=a.eval('game.hydration');a.element('developer-teleport-inside').onclick();
 assert.equal(a.eval('game.inRoom()'),true);assert.equal(a.eval('game.mode'),'paused');assert.equal(a.eval('game.escape.phase'),'finished');assert.equal(a.eval('monsterVisual.root.visible'),false);assert.equal(a.element('escape-guide').hidden,true);assert.equal(a.element('escape-blackout').style.opacity,'0');assert.equal(a.eval('escapeMarks.visible'),false);
 assert.equal(a.eval('JSON.stringify(game.items)'),items);assert.equal(a.eval('game.food'),food);assert.equal(a.eval('game.hydration'),water);assert.equal(a.eval('game.changed'),false);assert.equal(a.eval('game.door'),1);assert.match(a.element('developer-status').textContent,/跳过本次追逐/);
 a.settle();a.element('help-close').onclick();a.element('resume').onclick();a.element('interact').onclick({stopPropagation(){}});for(let i=0;i<20;i++)a.frame(now+=50);assert.equal(a.eval('game.changed'),true);
});
test('developer controls participate in settings keyboard focus only when enabled; portrait blocks actions',()=>{
 const a=enabled();a.element('quality-toggle').focus();key(a,'Tab');assert.equal(a.context.document.activeElement,a.element('developer-toggle'));key(a,'Tab');assert.equal(a.context.document.activeElement,a.element('playtest-toggle'));key(a,'Tab');assert.equal(a.context.document.activeElement,a.element('playtest-view'));key(a,'Tab');assert.equal(a.context.document.activeElement,a.element('playtest-export'));key(a,'Tab');assert.equal(a.context.document.activeElement,a.element('developer-item'));
 a.element('developer-toggle').onclick();a.element('developer-toggle').focus();key(a,'Tab');assert.equal(a.context.document.activeElement,a.element('help-close'));key(a,'Tab',{shiftKey:true});assert.equal(a.context.document.activeElement,a.element('developer-toggle'));
 a.element('developer-toggle').onclick();a.rotate(390,844);const before=a.eval('game.items.length');a.element('developer-spawn').onclick();assert.equal(a.eval('game.items.length'),before);a.rotate(844,390);a.element('developer-spawn').onclick();assert.equal(a.eval('game.items.length'),before+1);
});
test('developer mobile layout uses scrollable settings, 44px controls and explicit session disclosure',()=>{
 const html=fs.readFileSync('dist/index.html','utf8'),css=fs.readFileSync('dist/style.css','utf8');assert.match(html,/关闭页面后恢复关闭/);assert.match(html,/重新开始一轮也会保留开关/);assert.match(css,/developer-section button\{[^}]*min-height:44px/);assert.match(css,/\.panel > div[^}]+overflow-y: auto/);assert(!/eval\(|new Function|localStorage|sessionStorage/.test(fs.readFileSync('dist/developer.js','utf8')));
});
