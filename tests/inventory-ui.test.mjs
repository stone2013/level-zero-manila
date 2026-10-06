import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {boot} from './app-harness.mjs';
const click={stopPropagation(){}};
const key=(code,extra={})=>({code,repeat:false,preventDefault(){},...extra});
const pointer=(pointerId,clientX,clientY,extra={})=>({pointerId,clientX,clientY,button:0,preventDefault(){},stopPropagation(){},...extra});
function start(){const app=boot();app.element('start').onclick();return app}
function open(app){app.element('backpack').onclick(click);assert.equal(app.eval('game.inventoryOpen'),true)}
function drag(app,id,pid=1,x=135,y=115){app.context.pe=pointer(pid,x,y);app.eval(`beginInventoryDrag(pe,'${id}')`)}
function move(app,pid,x,y){app.dispatch('inventory-panel','pointermove',pointer(pid,x,y))}
function end(app,pid,x,y){app.dispatch('inventory-panel','pointerup',pointer(pid,x,y))}

test('backpack opens from I or Tab, freezes all simulation and closes before Escape pauses',()=>{
 const app=start();app.eval('game.food=60;game.hydration=50;game.entered=true;game.approach=12;game.doorTarget=1');
 app.dispatch('window','keydown',key('Tab'));assert.equal(app.eval('game.inventoryOpen'),true);assert.equal(app.element('inventory-panel').hidden,false);assert.equal(app.element('hud').inert,true);assert.equal(app.element('pause-panel').hidden,true);
 const saved=app.eval('JSON.stringify(game.snapshot())');for(let t=100;t<6000;t+=50)app.frame(t);
 app.dispatch('window','keydown',key('KeyE'));app.dispatch('window','keydown',key('KeyW'));assert.equal(app.eval('JSON.stringify(game.snapshot())'),saved);
 app.dispatch('window','keydown',key('Tab'));assert.equal(app.eval('game.inventoryOpen'),true);assert.equal(app.eval('keys.size'),0);
 app.dispatch('window','keydown',key('Escape'));assert.equal(app.eval('game.inventoryOpen'),false);assert.equal(app.eval('game.mode'),'playing');assert.equal(app.eval('game.approach'),12);
 app.dispatch('window','keydown',key('Escape'));assert.equal(app.eval('game.mode'),'paused');app.element('resume').onclick();app.dispatch('window','keydown',key('KeyI'));assert.equal(app.eval('game.inventoryOpen'),true);
 app.dispatch('window','keydown',key('KeyI'));assert.equal(app.eval('game.inventoryOpen'),false);
});

test('portrait freezes an open backpack and cancels drag; background preserves manual pause on closing',()=>{
 const app=start();open(app);drag(app,'food-1');move(app,1,40,160);assert.equal(app.element('discard-zone').hidden,false);
 const before=app.eval('JSON.stringify(game.items)');app.rotate(390,844);assert.equal(app.eval('inventoryDrag'),null);assert.equal(app.element('discard-zone').hidden,true);app.element('drop-item').onclick();app.element('consume-item').onclick();assert.equal(app.eval('JSON.stringify(game.items)'),before);
 assert.equal(app.eval('game.inventoryOpen'),true);app.rotate(844,390);assert.equal(app.eval('canPlay()'),false);assert.equal(app.eval('canUseInventory()'),true);
 app.context.document.hidden=true;app.dispatch('document','visibilitychange');assert.equal(app.eval('game.mode'),'paused');assert.equal(app.eval('game.inventoryOpen'),false);app.context.document.hidden=false;app.dispatch('document','visibilitychange');app.element('inventory-close').onclick();assert.equal(app.eval('game.mode'),'paused');assert.equal(app.eval('canPlay()'),false);
});

test('tap selection and a free-cell tap move exactly one item; rectangles cannot overlap or exceed grid',()=>{
 const app=start();open(app);assert.equal(app.eval('inventoryCells.length'),16);assert.equal(app.eval('inventoryNodes.size'),4);
 drag(app,'food-1');end(app,1,135,115);app.eval('inventoryCells[8].onclick()');assert.equal(app.eval("game.items[0].gridY"),2);assert.equal(app.eval('game.items[0].gridX'),0);
 app.eval('inventoryCells[1].onclick()');assert.equal(app.eval('game.items[0].gridY'),2,'occupied target rejected');
 app.eval("game.items[4].state='inventory';game.items[4].gridX=2;game.items[4].gridY=1;selectedItemId='water-1';renderInventory(true)");
 assert.equal(app.eval("inventoryNodes.get('water-1').style.gridRow"),'2 / span 2');assert.equal(app.element('consume-item').textContent,'饮用');
 app.eval('inventoryCells[15].onclick()');assert.equal(app.eval('game.items[4].gridY'),1);
 app.eval('inventoryCells[9].onclick()');assert.equal(app.eval('game.items[4].gridX'),1);assert.equal(app.eval('game.items[4].gridY'),2);
});

test('only dragging past backpack left boundary can discard; repeated pointer-up preserves same world object',()=>{
 const app=start();open(app);drag(app,'food-1');assert.equal(app.element('discard-zone').hidden,true);
 move(app,1,90,160);assert.equal(app.element('discard-zone').hidden,true,'left of grid but inside backpack is not discard');
 move(app,1,40,160);assert.equal(app.element('discard-zone').hidden,false);assert.equal(app.eval('game.items[0].state'),'inventory');end(app,1,40,160);
 assert.equal(app.eval('game.items[0].state'),'world');assert.equal(app.eval('game.items[0].y'),.005);assert.equal(app.eval('game.items.length'),6);assert.equal(app.element('discard-zone').hidden,true);
 const after=app.eval('JSON.stringify(game.items)');end(app,1,40,160);assert.equal(app.eval('JSON.stringify(game.items)'),after);
 app.element('inventory-close').onclick();app.element('interact').onclick(click);assert.equal(app.eval('game.items[0].state'),'inventory');assert.equal(app.eval('game.items[0].id'),'food-1');assert.equal(app.eval('game.items.length'),6);
});

test('leaving discard region, pointer cancel, lost capture, second fingers and resize are lossless',()=>{
 const app=start();open(app);const before=app.eval('JSON.stringify(game.items)');
 drag(app,'food-1');move(app,1,40,160);drag(app,'food-2',2,205,115);assert.equal(app.eval('inventoryDrag.id'),'food-1');
 move(app,2,30,150);end(app,2,30,150);assert.equal(app.eval('inventoryDrag.id'),'food-1');assert.equal(app.eval('game.items[0].state'),'inventory');
 move(app,1,600,160);assert.equal(app.element('discard-zone').hidden,true);end(app,1,600,160);assert.equal(app.eval('JSON.stringify(game.items)'),before);
 for(const event of ['pointercancel','lostpointercapture']){drag(app,'food-1');move(app,1,40,160);app.dispatch('inventory-panel',event,pointer(1,40,160));end(app,1,40,160);assert.equal(app.eval('JSON.stringify(game.items)'),before)}
 drag(app,'food-1');move(app,1,40,160);app.rotate(568,280);end(app,1,40,160);assert.equal(app.eval('JSON.stringify(game.items)'),before);assert.equal(app.captured.size,0);
});

test('valid drag moves to a grid location, invalid overlap restores, water lower-half preserves grab offset',()=>{
 const app=start();open(app);drag(app,'food-1');move(app,1,135,255);end(app,1,135,255);assert.equal(app.eval('game.items[0].gridY'),2);
 drag(app,'food-1',1,135,255);move(app,1,205,115);end(app,1,205,115);assert.equal(app.eval('game.items[0].gridY'),2);
 app.eval("game.items[4].state='inventory';game.items[4].gridX=2;game.items[4].gridY=1;renderInventory(true)");
 drag(app,'water-1',1,275,255);assert.equal(app.eval('inventoryDrag.offsetY'),1);move(app,1,345,325);end(app,1,345,325);assert.equal(app.eval('game.items[4].gridX'),3);assert.equal(app.eval('game.items[4].gridY'),2);
});

test('selected consume/drop use the exact instance, water drops from table to ground, restart clears UI state',()=>{
 const app=start();app.eval('game.food=20;game.hydration=20');open(app);drag(app,'food-3',1,275,115);end(app,1,275,115);app.element('consume-item').onclick();assert.equal(app.eval('game.items[2].state'),'consumed');assert.equal(app.eval('game.inventory("food").length'),3);
 app.eval("game.items[4].state='inventory';game.items[4].gridX=2;game.items[4].gridY=1;selectedItemId='water-1';renderInventory(true)");app.element('drop-item').onclick();assert.equal(app.eval('game.items[4].state'),'world');assert.equal(app.eval('game.items[4].y'),.005);assert.equal(app.eval("itemMeshes.get('water-1').position.y"),.005);
 app.element('inventory-close').onclick();app.element('pause').onclick();app.element('restart').onclick();assert.equal(app.eval('game.inventoryOpen'),false);assert.equal(app.element('inventory-panel').hidden,true);assert.equal(app.eval('game.inventory("water").length'),0);assert.equal(app.eval('game.inventory("food").length'),4);assert.equal(app.eval('game.items[4].y'),.68);
});

test('goal fades by simulation time, controls contain no permanent survival buttons or seed debug text',()=>{
 const app=start();assert.equal(app.element('objective').hidden,false);app.eval('game.elapsed=7;sync()');assert.equal(app.element('objective').hidden,true);app.eval('game.entered=true;sync()');assert.equal(app.element('objective').hidden,false);assert.equal(app.element('objective').textContent,'把门完全关上');
 const html=fs.readFileSync('dist/index.html','utf8'),css=fs.readFileSync('dist/style.css','utf8');
 assert(!/id="(eat|drink|drop)"/.test(html));assert(!fs.readFileSync('dist/app.js','utf8').includes('SEED ${'));assert(html.includes('id="backpack"'));assert(css.includes('44px'));
});

test('blocked drop feedback stays inside backpack and pointer-lock release does not add a pause',()=>{
 const app=boot({coarse:false,mobile:false});app.element('start').onclick();app.context.document.pointerLockElement=app.element('world');app.context.document.exitPointerLock=()=>{app.context.document.pointerLockElement=null;app.dispatch('document','pointerlockchange')};
 open(app);assert.equal(app.eval('game.mode'),'playing');assert.equal(app.element('backpack')['aria-expanded'],'true');
 app.eval('game.dropPathClear=()=>false');app.element('drop-item').onclick();app.frame(100);
 assert.match(app.element('inventory-status').textContent,/没有.*空地/);assert.equal(app.eval('game.items[0].state'),'inventory');
 app.element('inventory-close').onclick();assert.equal(app.eval('game.mode'),'playing');assert.equal(app.element('backpack')['aria-expanded'],'false');open(app);assert.equal(app.element('inventory-status').textContent,'');
});
