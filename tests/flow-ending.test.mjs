import test from 'node:test';
import assert from 'node:assert/strict';
import {bootControls as boot} from './app-harness.mjs';

test('same-frame exit/depletion shows only success and remains stable through blur and restart',()=>{
 const app=boot();app.element('start').onclick();
 app.eval(`game.changed=true;game.entered=true;game.door=game.doorTarget=1;game.player.x=game.maze.doorX-8.28;game.player.z=game.maze.doorZ;game.player.yaw=-Math.PI/2;game.hydration=.0001;game.events=[];keys.add('KeyW')`);
 app.frame(50);
 assert.equal(app.eval('game.mode'),'won');assert.equal(app.element('ending').hidden,false);
 assert.equal(app.element('end-title').textContent,'门外，已经不是来路。');
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
