import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,RADIUS} from '../dist/game.js';
import {HUB,LEVEL1} from '../dist/zones.js';
const tick=(g,t,input={})=>{for(let i=0;i<Math.round(t/.02);i++)g.update(.02,input)};
const game=()=>{const g=new Game(7);g.start();return g};

test('Manila corridor transitions to hub preserving survival and inventory',()=>{
 const g=game();g.changed=true;g.player.x=g.maze.doorX-8.29;g.player.z=g.maze.doorZ;g.food=65;g.hydration=71;g.phone('phone-1').battery=36;const items=JSON.stringify(g.items);g.move(-.1,0);
 assert.equal(g.zone,'hub');assert.equal(g.mode,'playing');assert.deepEqual(g.player,{...HUB.spawn,pitch:0});assert.equal(g.food,65);assert.equal(g.hydration,71);assert.equal(g.phone('phone-1').battery,36);assert.equal(JSON.stringify(g.items),items);assert(!g.collides(g.player.x,g.player.z));
});
test('hub seals only after whole player clears rear; side door enters L1 and front stays inactive',()=>{
 const g=game();g.transitionZone('hub');g.move(0,-.5);assert(!g.hub.sealed);g.move(0,-.5);assert(g.hub.sealed);assert(!g.collides(g.player.x,g.player.z));
 Object.assign(g.player,{x:-5.25,z:.6});assert.equal(g.interact(),'inactive-door');assert.equal(g.zone,'hub');assert(g.events.at(-1).includes('130'));
 Object.assign(g.player,{x:5.4,z:3.3});assert.equal(g.interact(),'level1');assert.equal(g.zone,'level1');assert(!g.collides(g.player.x,g.player.z));
});
test('ground items stay in their zones through transitions and can never be picked up remotely',()=>{
 const g=game();g.drop('phone-1');const phone=g.items.find(i=>i.id==='phone-1'),old={...phone};g.transitionZone('hub');assert(!g.worldItemVisible(phone));Object.assign(g.player,{x:phone.x,z:phone.z});assert(!g.pickupItem(phone.id));assert.deepEqual(phone,old);g.transitionZone('level1');Object.assign(g.player,LEVEL1.spawn);g.drop('food-1');const food=g.items.find(i=>i.id==='food-1');assert.equal(food.zone,'level1');assert(g.worldItemVisible(food));assert.equal(g.pickupItem(food.id),food.id);
});
test('crate opens atomically only once, including full inventory',()=>{
 const g=game();g.transitionZone('level1');const c=g.level1.crates[0];Object.assign(g.player,{x:c.x+1,z:c.z});assert.equal(g.interact(),'crate');assert(c.opened);assert.equal(g.items.filter(i=>i.id===`${c.id}-${c.kind}`).length,1);g.interact();assert.equal(g.items.length,8);
 const full=game();full.transitionZone('level1');for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(!full.inventory().some(i=>i.gridX===x&&i.gridY===y))full.items.push({id:`fill-${x}-${y}`,kind:'food',state:'inventory',gridX:x,gridY:y,zone:'level1'});
 const crate=full.level1.crates[1];Object.assign(full.player,{x:crate.x-1,z:crate.z});assert.equal(full.interact(),'crate');const item=full.items.find(i=>i.id===`${crate.id}-${crate.kind}`);assert.equal(item.state,'world');assert(full.dropPathClear(item.x,item.z));assert(full.worldItemVisible(item));full.interact();assert.equal(full.items.filter(i=>i.id===item.id).length,1);
});
test('L1 warning lasts six seconds and dark eight; paused and bag time never advance',()=>{
 const g=game();g.transitionZone('level1');tick(g,14.02);assert.equal(g.level1.phase,'warning');tick(g,5.96);assert.equal(g.level1.phase,'warning');tick(g,.04);assert.equal(g.level1.phase,'dark');const t=g.level1.elapsed;g.pause();tick(g,9);assert.equal(g.level1.elapsed,t);g.resume();g.openInventory();tick(g,9);assert.equal(g.level1.elapsed,t);g.closeInventory();tick(g,8);assert.equal(g.level1.phase,'lit');assert(!g.escape.monster?.active);
});
test('abnormal wall requires continuous two second hold; release and pause cancel; bypasses hub',()=>{
 const g=game(),w=g.abnormalWall;Object.assign(g.player,{x:w.x+w.normalX*.7,z:w.z+w.normalZ*.7});assert(!g.collides(g.player.x,g.player.z));assert(g.nearAbnormalWall());tick(g,1.5,{interactHeld:true});assert.equal(g.zone,'level0');tick(g,.02);assert.equal(w.hold,0);tick(g,1,{interactHeld:true});g.pause();assert.equal(w.hold,0);g.resume();tick(g,2,{interactHeld:true});assert.equal(g.zone,'level1');assert(!g.hub.sealed);
});
test('baffles interrupt the center spine and only reachable pipe movement ends demo',()=>{
 const g=game();g.transitionZone('level1');
 for(const z of [-5,-11.8,-17.8])assert(g.collides(0,z),`baffle ${z}`);
 for(let z=4.5;z>-4.6;z-=.1)assert(!g.collides(0,z));
 g.move(0,-60);assert.equal(g.mode,'playing');assert(g.player.z>-5);assert(!g.collides(g.player.x,g.player.z));
 assert(g.collides(7.9,-5));assert(g.collides(0,-44));
 Object.assign(g.player,{x:0,z:-42.7});g.move(0,-.2);assert.equal(g.mode,'won');assert(g.events.includes('level1-demo-end'));
});
test('reset clears new zone progression and per-item zones',()=>{const g=game();g.transitionZone('level1');g.level1.crates[0].opened=true;g.reset(8);assert.equal(g.zone,'level0');assert.equal(g.level1.elapsed,0);assert(g.level1.crates.every(c=>!c.opened));assert(g.items.every(i=>i.zone==='level0'));});
test('abnormal wall has a clear reachable interaction stance across 256 seeds',()=>{for(let seed=0;seed<256;seed++){const g=new Game(seed),w=g.abnormalWall;Object.assign(g.player,{x:w.x+w.normalX*.7,z:w.z+w.normalZ*.7});assert(!g.collides(g.player.x,g.player.z),`seed ${seed}`);assert(g.nearAbnormalWall(),`seed ${seed}`)}});
test('each supply crate can be approached, opened and produces exactly one existing-kind supply',()=>{for(let n=0;n<4;n++){const g=game();g.transitionZone('level1');const c=g.level1.crates[n];let reached=false;for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){Object.assign(g.player,{x:c.x+Math.cos(a),z:c.z+Math.sin(a)});if(!g.collides(g.player.x,g.player.z)&&g.nearestCrate()?.id===c.id){reached=true;break}}assert(reached,c.id);assert.equal(g.interact(),'crate');assert(c.opened);assert.equal(g.items.filter(i=>i.id===`${c.id}-${c.kind}`).length,1)}});
