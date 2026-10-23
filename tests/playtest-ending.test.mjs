import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bootControls} from './app-harness.mjs';
import {LEVEL_ONE_EXIT} from '../dist/level-one-layout.js';
function setup(record=true){
 const a=bootControls();a.element('start').onclick();
 if(record){a.element('pause').onclick();a.element('pause-help').onclick();a.element('developer-toggle').onclick();a.element('playtest-toggle').onclick();a.element('developer-toggle').onclick();a.element('help-close').onclick();a.element('resume').onclick()}
 a.eval("game.transitionZone('level1');sync();showState()");a.frame(0);return a;
}
function download(a,{fail=false}={}){
 const out={payloads:[],clicks:0,revoked:[]};
 a.context.Blob=class{constructor(parts){out.payloads.push(JSON.parse(parts.join('')))}};
 a.context.URL={createObjectURL:()=> 'blob:test',revokeObjectURL:url=>out.revoked.push(url)};
 const create=a.context.document.createElement;
 a.context.document.createElement=tag=>tag!=='a'?create(tag):({click(){out.clicks++;assert.equal(this.download,'level-zero-rc2-playtest.json');if(fail)throw Error('download unavailable')}});
 return out;
}
function finish(a){a.eval(`game.player.x=${LEVEL_ONE_EXIT.x};game.player.z=${LEVEL_ONE_EXIT.z+.01};game.player.yaw=0;keys.add('KeyW')`);a.frame(50);assert.equal(a.eval('game.mode'),'won')}
const snapshot=a=>a.eval('JSON.stringify(game.snapshot())');
test('terminal export defaults hidden and cannot run from active gameplay or disabled recording',()=>{
 for(const record of [false,true]){const a=setup(record),out=download(a);assert.equal(a.element('end-playtest').hidden,true);a.element('end-playtest-export').onclick();assert.equal(out.clicks,0);finish(a);assert.equal(a.element('end-playtest').hidden,!record);if(!record){a.element('end-playtest-export').onclick();assert.equal(out.clicks,0)}}
});
test('real exit exposes direct export with developer tools off; repeated export preserves gameplay',()=>{
 const a=setup(),out=download(a);finish(a);assert.equal(a.eval('developerEnabled'),false);assert.equal(a.element('end-playtest').hidden,false);
 const before=snapshot(a);a.element('end-playtest-export').onclick();a.element('end-playtest-export').onclick();
 assert.equal(out.clicks,2);assert.equal(out.revoked.length,2);assert.deepEqual(out.payloads[0],out.payloads[1]);assert.equal(out.payloads[0].current.outcome,'pipe-exit');assert.equal(out.payloads[0].current.partial,false);assert.equal(snapshot(a),before);assert.match(a.element('end-playtest-status').textContent,/请求下载/);assert.equal(a.element('ending').hidden,false);
 a.element('again').onclick();assert.equal(a.element('end-playtest').hidden,true);assert.equal(a.element('end-playtest-status').textContent,'');assert.equal(a.eval('game.playtestReport().history[0].outcome'),'pipe-exit');assert.equal(a.eval('game.items.length'),7);
});
test('death export and repeated retry taps retain one run and stable item identities',()=>{
 const a=setup(),out=download(a);a.eval('game.hydration=0');a.frame(50);assert.equal(a.eval('game.mode'),'lost');
 a.element('end-playtest-export').onclick();assert.equal(out.payloads[0].current.deaths,1);const items=a.eval('JSON.stringify(game.items)');
 a.element('level1-retry').onclick();a.element('level1-retry').onclick();assert.equal(a.eval('game.playtestReport().current.retries'),1);assert.equal(a.eval('JSON.stringify(game.items)'),items);assert.equal(a.element('end-playtest').hidden,true);assert.equal(a.eval('new Set(game.items.map(i=>i.id)).size'),a.eval('game.items.length'));
 a.eval('game.hydration=0');a.frame(100);a.element('end-playtest-export').onclick();assert.equal(out.payloads[1].current.deaths,2);assert.equal(out.payloads[1].current.retries,1);assert.equal(out.payloads[1].current.attempts.length,2);assert.equal(out.payloads[1].history.length,0);
});
test('end export respects hidden, portrait and settings gates without advancing terminal gameplay',()=>{
 const a=setup(),out=download(a);finish(a);const before=snapshot(a),time=a.eval('game.playtestReport().current.activeSeconds');
 a.context.document.hidden=true;a.element('end-playtest-export').onclick();a.context.document.hidden=false;
 a.rotate(390,844);a.element('end-playtest-export').onclick();a.rotate(844,390);
 a.eval('openHelp()');a.element('end-playtest-export').onclick();assert.equal(out.clicks,0);a.element('help-close').onclick();a.element('end-playtest-export').onclick();a.frame(10000);
 assert.equal(out.clicks,1);assert.equal(snapshot(a),before);assert.equal(a.eval('game.playtestReport().current.activeSeconds'),time);
});
test('failed export retains records and releases its URL; successful retry downloads the same run',()=>{
 const a=setup(),failed=download(a,{fail:true});finish(a);const before=snapshot(a);assert.doesNotThrow(()=>a.element('end-playtest-export').onclick());assert.equal(failed.revoked.length,1);assert.match(a.element('end-playtest-status').textContent,/未能下载.*记录仍在本页/);assert.equal(snapshot(a),before);
 const ok=download(a);a.element('end-playtest-export').onclick();assert.equal(ok.clicks,1);assert.deepEqual(ok.payloads,failed.payloads);
});
test('end export has a hidden-by-default ordinary button and accessible local-only status',()=>{
 const html=fs.readFileSync('dist/index.html','utf8');assert.match(html,/<div id="end-playtest" hidden>/);assert.match(html,/id="end-playtest-export" type="button"/);assert.match(html,/id="end-playtest-status"[^>]*role="status"[^>]*aria-live="polite"/);
});
test('recorded touch movement interrupted by pause clears held input and freezes effective time',()=>{
 const a=setup(),pointer=(pointerId,clientX,clientY)=>({pointerId,clientX,clientY,button:0,preventDefault(){},stopPropagation(){}});
 a.dispatch('stick','pointerdown',pointer(11,78,218));a.dispatch('look','pointerdown',pointer(12,400,220));a.dispatch('sprint','pointerdown',pointer(13,700,300));a.frame(50);
 const time=a.eval('game.playtestReport().current.activeSeconds');assert.ok(time>0);a.element('pause').onclick();assert.equal(a.eval('touch.move'),null);assert.equal(a.eval('touch.look'),null);assert.equal(a.eval('touch.sprint.size'),0);const position=a.eval('JSON.stringify(game.player)');a.frame(5000);assert.equal(a.eval('game.playtestReport().current.activeSeconds'),time);
 a.dispatch('stick','pointermove',pointer(11,78,200));a.element('resume').onclick();a.frame(5050);assert.equal(a.eval('JSON.stringify(game.player)'),position);assert.ok(a.eval('game.playtestReport().current.activeSeconds')>time);
});
