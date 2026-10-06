import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './app-harness.mjs';

test('real initial view loading freezes a connected phone and resumes without battery or survival catch-up',()=>{
 // Real world geometry/scheduler, deliberately not bootControls. Direct model
 // setup covers device-clock defense even if an overlay survives a new load.
 const app=boot({autoLoad:false});app.element('restart').onclick();
 app.eval(`game.player.x=game.maze.doorX+3.6;game.player.z=game.maze.doorZ-.65;
 game.items.find(i=>i.id==='phone-1').battery=50;game.connectCharger('phone-1');
 game.openInventory();game.openPhone('phone-1');updateStreamView();showState()`);
 assert.equal(app.eval('worldLoading'),true);assert.equal(app.eval('game.chargingPhoneId'),'phone-1');
 const before=app.eval('JSON.stringify([game.food,game.hydration,game.elapsed,game.phone().battery])');
 app.frame(1000);assert.equal(app.eval('worldLoading'),true);
 assert.equal(app.eval('JSON.stringify([game.food,game.hydration,game.elapsed,game.phone().battery])'),before);
 app.settle();assert.equal(app.eval('worldLoading'),false);app.frame(10000);
 assert.equal(app.eval('game.phone().battery'),50.125);assert.equal(app.eval('game.elapsed'),0);
 app.eval('game.disconnectCharger()');app.frame(10050);
 assert(Math.abs(app.eval('game.phone().battery')-(50.125-.05*100/480))<1e-9);
 assert.equal(app.eval('game.elapsed'),0);assert.equal(app.eval('scene.fog.near'),16);assert.equal(app.eval('scene.fog.far'),80);
});
