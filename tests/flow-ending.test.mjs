import {LEVEL_ONE_EXIT} from '../dist/level-one-layout.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {bootControls as boot} from './app-harness.mjs';

test('same-frame exit/depletion shows only success and remains stable through blur and restart',()=>{
 const app=boot();app.element('start').onclick();app.eval("game.transitionZone('level1')");app.frame(0);
 app.eval(`game.player.x=0;game.player.z=${LEVEL_ONE_EXIT.z+.02};game.player.yaw=0;game.hydration=.0001;game.events=[];keys.add('KeyW')`);
 app.frame(50);
 assert.equal(app.eval('game.mode'),'won');assert.equal(app.element('ending').hidden,false);
 assert.match(app.element('end-title').textContent,/管道|Level 1/);
 assert.equal(app.element('pause-panel').hidden,true);assert.equal(app.eval('keys.size'),0);
 const final=app.eval('JSON.stringify(game.snapshot())');
 app.dispatch('window','blur');app.frame(60000);
 assert.equal(app.eval('JSON.stringify(game.snapshot())'),final);
 assert.equal(app.element('ending').hidden,false);assert.equal(app.element('pause-panel').hidden,true);
 app.element('again').onclick();assert.equal(app.eval('game.mode'),'playing');
 assert.equal(app.element('ending').hidden,true);assert.equal(app.eval('game.items.length'),7);
 assert.equal(app.eval('game.items.filter(i=>i.kind==="water").length'),2);
 assert.equal(app.eval('game.phone("phone-1").battery'),100);
 assert.equal(app.eval('game.changed'),false);
});
