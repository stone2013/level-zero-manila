import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {LEVEL_ONE_AREAS,LEVEL_ONE_EXIT} from '../dist/level-one-layout.js';
import {bootControls} from './app-harness.mjs';
function game(record=true){const g=new Game(7);g.start();if(record)g.setPlaytestEnabled(true,'scripted');g.transitionZone('level1');return g}
test('optional observer starts at entry, exports detached JSON with explicit source and counts',()=>{
 const off=game(false);off.update(.05);assert.equal(off.playtestReport().current,null);
 const g=game();g.update(.05);const r=g.playtestReport();assert.equal(r.current.activeSeconds,.05);assert.equal(r.current.source,'scripted');assert.equal(r.current.partial,false);assert.equal(r.current.cluesRead,0);assert.equal(r.current.cratesOpened,0);r.current.visits.length=0;assert.equal(g.playtestReport().current.visits.length,1);
});
test('uses capped effective time, excludes invalid ticks, pause, inventory and phone',()=>{
 const g=game();g.update(100);assert.equal(g.playtestReport().current.activeSeconds,.05);
 for(const dt of [NaN,Infinity,-1,0])g.update(dt);
 g.pause();g.update(10);g.resume();g.openInventory();g.update(10);g.closeInventory();g.openPhone('phone-1');g.update(10);g.closePhone();assert.equal(g.playtestReport().current.activeSeconds,.05);
});
test('ordered visits include backtracking and reuse clue and crate identities without changes',()=>{
 const g=game();for(const id of [0,1,2,1]){Object.assign(g.player,LEVEL_ONE_AREAS[id].spawn);g.update(.05)}
 const c=LEVEL_ONE_AREAS[1].clues[0];Object.assign(g.player,{x:c.x,z:c.z+.8});g.interact();g.interact();g.level1.crates[0].opened=true;
 const before=g.snapshot(),r=g.playtestReport().current;assert.deepEqual(r.visits.map(v=>v.area),[0,1,2,1]);assert.equal(r.cluesRead,1);assert.equal(r.cratesOpened,1);assert.deepEqual(g.snapshot(),before);
});
test('death and successful retry counted once; retry preserves cumulative time and stock',()=>{
 const g=game();g.update(.05);g.hydration=0;g.update(.05);assert.equal(g.mode,'lost');g.playtestReport();g.playtestReport();assert.equal(g.playtestReport().current.deaths,1);
 const items=JSON.stringify(g.items);assert.equal(g.retryLevelOne(),true);assert.equal(JSON.stringify(g.items),items);assert.equal(g.retryLevelOne(),false);g.update(.05);
 const r=g.playtestReport().current;assert.equal(r.retries,1);assert.equal(r.deaths,1);assert.equal(r.attempts.length,2);assert.ok(Math.abs(r.activeSeconds-.15)<1e-10);assert.equal(g.level1.elapsed,.05);
});
test('real pipe exit stops timing; restart archives and resets independently',()=>{
 const g=game();Object.assign(g.player,{x:LEVEL_ONE_EXIT.x,z:LEVEL_ONE_EXIT.z+.01,yaw:0});g.update(.05,{forward:1});assert.equal(g.mode,'won');const r=g.playtestReport().current;assert.equal(r.reachedPipeExit,true);g.update(1);assert.equal(g.playtestReport().current.activeSeconds,r.activeSeconds);
 g.reset(9);assert.equal(g.playtestReport().history[0].outcome,'pipe-exit');assert.equal(g.playtestReport().current,null);g.start();g.transitionZone('level1');assert.equal(g.playtestReport().current.activeSeconds,0);
});
test('mid-run enable and stop/re-enable are partial; history bounded',()=>{
 const g=game(false);g.update(.05);g.setPlaytestEnabled(true);assert.equal(g.playtestReport().current.partial,true);g.update(.05);g.setPlaytestEnabled(false);assert.equal(g.playtestReport().history[0].activeSeconds,.05);assert.equal(g.playtestReport().current,null);
 for(let i=0;i<24;i++){g.setPlaytestEnabled(true);g.setPlaytestEnabled(false)}assert.equal(g.playtestReport().history.length,20);
});
test('paired recording-on/off simulation identical including movement, encounters, survival and retry',()=>{
 const a=game(),b=game(false);
 for(let i=0;i<1200;i++){const input={forward:i%100<70?1:0,strafe:i%100>=70?1:0,sprint:i%7===0};a.update(.05,input);b.update(.05,input);assert.deepEqual(a.snapshot(),b.snapshot())}
 a.hydration=b.hydration=0;a.update(.05);b.update(.05);assert.deepEqual(a.snapshot(),b.snapshot());a.retryLevelOne();b.retryLevelOne();assert.deepEqual(a.snapshot(),b.snapshot());
});
test('developer record controls default hidden, gated; background/portrait/loading frames excluded',()=>{
 const a=bootControls({mobile:true,width:844,height:390,zoneLoadMode:'pending'});assert.equal(a.element('developer-tools').hidden,true);a.element('playtest-toggle').onclick();assert.equal(a.eval('game.playtestEnabled'),undefined);
 a.element('start').onclick();a.element('pause').onclick();a.element('pause-help').onclick();a.element('developer-toggle').onclick();a.element('playtest-toggle').onclick();a.eval("game.transitionZone('level1')");a.element('playtest-view').onclick();assert.match(a.element('playtest-stats').textContent,/human-unverified/);
 a.element('help-close').onclick();a.element('resume').onclick();a.eval('zoneLoading=true');a.frame(50);assert.equal(a.eval('game.playtestReport().current.activeSeconds'),0);a.eval('zoneLoading=false;document.hidden=true');a.frame(100);assert.equal(a.eval('game.playtestReport().current.activeSeconds'),0);a.eval('document.hidden=false;orientationBlocked=true');a.frame(150);assert.equal(a.eval('game.playtestReport().current.activeSeconds'),0);
});

test('JSON download is local, detached and gated, and releases its object URL',()=>{
 const a=bootControls();let payload,clicked=false,revoked=false;
 a.context.Blob=class{constructor(parts){payload=parts.join('')}};a.context.URL={createObjectURL:()=> 'blob:test',revokeObjectURL:url=>{assert.equal(url,'blob:test');revoked=true}};
 a.context.document.createElement=()=>({click(){clicked=true;assert.equal(this.download,'level-zero-rc2-playtest.json');assert.equal(this.href,'blob:test')}});
 a.element('playtest-export').onclick();assert.equal(clicked,false);a.element('help-open').onclick();a.element('developer-toggle').onclick();const before=a.eval('JSON.stringify(game.snapshot())');a.element('playtest-export').onclick();assert.equal(clicked,true);assert.equal(revoked,true);assert.equal(JSON.parse(payload).schemaVersion,1);assert.equal(a.eval('JSON.stringify(game.snapshot())'),before);
});
