import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,bootControls} from './app-harness.mjs';
function start(make=bootControls){const app=make();app.element('start').onclick();app.eval('game.elapsed=479.99');let t=0;return{app,frame(){app.frame(t+=50)},get t(){return t}}}
function reach(run,phase){for(let i=0;i<600&&run.app.eval('game.escape.phase')!==phase;i++){run.frame();if(run.app.eval('worldLoading'))run.app.settle()}assert.equal(run.app.eval('game.escape.phase'),phase)}
function state(a){return a.eval('JSON.stringify({phase:game.escape.phase,time:game.escape.time,elapsed:game.elapsed,food:game.food,water:game.hydration,monster:game.escape.monster,animation:monsterVisual?.root.userData.animationState})')}
test('real app keeps blackout until entire destination view is generated and creates approved monster plus one instanced route',()=>{
 const r=start(boot),a=r.app;reach(r,'loading');
 assert.equal(a.element('escape-blackout').style.opacity,'1');
 a.eval('chunkStream.clear();requestedSelection=null;updateStreamView()');const before=state(a);a.eval('chunkStream.process=()=>0');for(let i=0;i<20;i++)r.frame();assert.equal(state(a),before,'loading must freeze simulation and animation together');
 a.eval('chunkStream.process=RenderChunkStream.prototype.process');a.settle();r.frame();
 assert.equal(a.eval('game.escape.phase'),'warning');assert.equal(a.element('escape-blackout').style.opacity,'0');
 assert.equal(a.eval('monsterVisual.root.name'),'CableMonster_V2');assert.equal(a.eval('escapeMarks.isInstancedMesh'),true);assert.equal(a.eval('escapeMarks.count'),84);assert.equal(a.eval('escapeMarks.name'),'Escape route black wall arrows');
 assert.equal(a.element('escape-guide').hidden,false);
 assert.equal(a.eval('scene.children.filter(o=>o.isLight).length'),2);
 assert(a.eval('chunkStream.stats().resident<=49'));
});
test('inventory, manual pause, background and portrait freeze chase animation with its simulation and sound',()=>{
 for(const which of ['inventory','pause','background','portrait']){
  const r=start(),a=r.app;reach(r,'chase');r.frame();
  if(which==='inventory')a.element('backpack').onclick({stopPropagation(){}});
  if(which==='pause')a.element('pause').onclick();
  if(which==='background'){a.context.document.hidden=true;a.dispatch('document','visibilitychange')}
  if(which==='portrait')a.rotate(390,844);
  const before=state(a);for(let i=0;i<40;i++)r.frame();assert.equal(state(a),before,which);assert.equal(a.eval('gameAudio.voices.size'),0);
 }
});
test('catch lunge runs once, caught panel freezes it, retry resets pose and preserves supplies, restart removes event',()=>{
 const r=start(),a=r.app;reach(r,'chase');
 a.eval('game.escape.monster.x=game.player.x-.5;game.escape.monster.z=game.player.z;game.escape.navClock=0');r.frame();assert.equal(a.eval('game.escape.phase'),'caught-animation');
 a.element('backpack').onclick({stopPropagation(){}});assert.equal(a.eval('game.inventoryOpen'),false);
 reach(r,'caught');assert.equal(a.element('caught-panel').hidden,false);assert.equal(a.element('ending').hidden,true);
 const before=state(a);for(let i=0;i<70;i++)r.frame();assert.equal(state(a),before);
 const items=a.eval('JSON.stringify(game.items)'),food=a.eval('game.food'),water=a.eval('game.hydration');
 a.element('escape-retry').onclick();a.settle();r.frame();assert.equal(a.eval('game.escape.phase'),'warning');assert.equal(a.element('caught-panel').hidden,true);assert.equal(a.eval('JSON.stringify(game.items)'),items);assert(a.eval('game.food')<=food);assert(a.eval('game.hydration')<=water);assert.equal(a.eval('monsterVisual.root.userData.animationState.clip'),'walk');
 a.element('escape-restart').onclick();r.frame();assert.equal(a.eval('game.escape.phase'),'idle');assert.equal(a.eval('monsterVisual'),null);assert.equal(a.eval('escapeMarks'),null);assert.equal(a.element('escape-guide').hidden,true);
});
test('closing Manila door immediately hides the entity, removes escape guidance and retains original ending',()=>{
 const r=start(),a=r.app;reach(r,'chase');a.eval('game.player.x=game.maze.doorX+2;game.player.z=game.maze.doorZ;game.entered=true;game.door=game.doorTarget=0;game.escape.phase="door";updateStreamView()');a.settle();r.frame();
 assert.equal(a.eval('game.escape.phase'),'finished');assert.equal(a.eval('monsterVisual.root.visible'),false);assert.equal(a.element('escape-guide').hidden,true);assert.equal(a.eval('game.changed'),true);
});
