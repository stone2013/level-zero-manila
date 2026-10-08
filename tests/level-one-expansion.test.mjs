import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {LEVEL_ONE_AREAS} from '../dist/level-one-layout.js';
const traveled=new WeakMap();
function walk(g,p,sprint=false,win=false){let guard=0;while(g.mode==='playing'&&Math.hypot(p.x-g.player.x,p.z-g.player.z)>1e-7){assert(guard++<12000,`blocked ${g.player.x},${g.player.z} -> ${p.x},${p.z}`);const d=Math.hypot(p.x-g.player.x,p.z-g.player.z),speed=sprint&&g.hydration>15?3.25:2.05;g.player.yaw=Math.atan2(p.x-g.player.x,-(p.z-g.player.z));const old={x:g.player.x,z:g.player.z};g.update(Math.min(.025,d/speed),{forward:1,sprint});traveled.set(g,(traveled.get(g)||0)+Math.hypot(g.player.x-old.x,g.player.z-old.z));assert(!g.collides(g.player.x,g.player.z));assert.equal(g.escape.monster?.active||false,false)}assert.equal(g.mode,win?'won':'playing')}
function consumeNeeded(g){if(g.hydration<65){const water=g.inventory('water')[0];if(water)g.consume('water',water.id)}if(g.food<65){const food=g.inventory('food')[0];if(food)g.consume('food',food.id)}}
for(const sprint of[false,true])test(`depleted post-Level-0 ${sprint?'sprint':'walking'} resource-endurance stress visits all branches and survives 8–12 active minutes with explicit repeated routes`,t=>{
 const g=new Game(7);g.start();
 // Explicit depleted-arrival fixture; everything after entry uses ordinary movement.
 // Original Manila world water is deliberately not moved into the inventory.
 g.food=34;g.hydration=28;g.phone('phone-1').battery=37;g.consume('food','food-1');g.transitionZone('level1');const arrival={food:g.food,hydration:g.hydration,phoneBattery:g.phone('phone-1').battery};let branchCount=0,retrieved=0;
 for(const area of LEVEL_ONE_AREAS){
  walk(g,area.spawn,sprint);let last;
  for(const [index,loop]of area.loops.entries()){
   const c=area.crates[index],first=loop.safeRoute[0],inside=loop.safeRoute[1],out=loop.safeRoute[3],side=Math.sign(first.x);
   const top=area.walls.filter(w=>w.w>20&&w.z>first.z).sort((a,b)=>a.z-b.z)[0];
   walk(g,{x:side*(Math.abs(first.x)-.1),z:top.z+.5},sprint);walk(g,first,sprint);walk(g,inside,sprint);
   const stance={x:c.x+side*1.2,z:c.z};walk(g,{x:inside.x,z:c.z},sprint);walk(g,stance,sprint);
   const crate=g.level1.crates.find(item=>item.id===c.id);assert.equal(g.nearestCrate()?.id,c.id);assert.equal(g.interact(),'crate');assert(crate.opened);branchCount++;
   const id=`${c.id}-${c.kind}`;assert.equal(g.items.filter(i=>i.id===id).length,1);consumeNeeded(g);
   // A carried supply can be left here, revisited through the branch and recovered.
   const marker=g.inventory('food')[0]||g.inventory('water')[0];assert(marker);assert(g.drop(marker.id));const dropped={...g.items.find(i=>i.id===marker.id)};
   walk(g,{x:inside.x,z:c.z},sprint);walk(g,loop.safeRoute[2],sprint);walk(g,out,sprint);
   walk(g,loop.safeRoute[2],sprint);walk(g,{x:inside.x,z:c.z},sprint);walk(g,stance,sprint);assert.equal(g.pickupItem(marker.id),marker.id);retrieved++;
   assert.equal(dropped.zone,'level1');for(let n=0;n<3;n++)g.interact();assert.equal(g.items.filter(i=>i.id===id).length,1);
   consumeNeeded(g);walk(g,{x:inside.x,z:c.z},sprint);walk(g,loop.safeRoute[2],sprint);walk(g,out,sprint);
   const bottom=area.walls.filter(w=>w.w>20&&w.z<out.z).sort((a,b)=>b.z-a.z)[0];last={x:side*(Math.abs(out.x)-.1),z:bottom.z-.5};walk(g,last,sprint);
  }
  // Deliberate route review/backtracking, with actual locomotion and no idle time.
  if(area.id<5)walk(g,area.exit,sprint);
  const repeats=area.id===0?(sprint?2:1):area.id===1&&sprint?1:0;
  for(let n=0;n<repeats;n++){for(const p of [...area.route].reverse())walk(g,p,sprint);for(const p of area.route)walk(g,p,sprint);consumeNeeded(g)}
  if(area.id===5)walk(g,area.exit,sprint,true);
 }
 assert.equal(branchCount,10);assert.equal(retrieved,10);assert(g.level1.crates.every(c=>c.opened));assert.equal(g.level1.sectors.filter(s=>s.visited).length,6);assert.equal(g.level1.readClues.length,0);assert.equal(g.phone('phone-1').battery,37);assert(g.food>0&&g.hydration>0);assert(g.level1.elapsed>=480&&g.level1.elapsed<=720,`${g.level1.elapsed}s`);assert(g.items.some(i=>i.kind==='water'&&i.id.startsWith('l1-')&&i.state==='consumed'));
 const consumed=kind=>g.items.filter(i=>i.kind===kind&&i.state==='consumed').map(i=>i.id);
 const metric={label:'Resource-endurance stress: drop/retrieve backtracking and explicitly repeated sectors; not pacing or human first-play evidence',repeatedSectorTraversals:sprint?{sector0:2,sector1:1}:{sector0:1},movement:sprint?'sprint':'walk',traveledDistanceMetres:traveled.get(g),activeDurationSeconds:g.level1.elapsed,fixtureBeforeArrival:{food:34,hydration:28,consumedFoodBeforeEntry:['food-1']},arrival,end:{food:g.food,hydration:g.hydration,phoneBattery:g.phone('phone-1').battery},finiteLevelOneConsumedWater:consumed('water').filter(id=>id.startsWith('l1-')),finiteLevelOneConsumedFood:consumed('food').filter(id=>id.startsWith('l1-')),allConsumedWater:consumed('water'),allConsumedFood:consumed('food'),consumedDuringLevelOne:{water:consumed('water'),food:consumed('food').filter(id=>id!=='food-1')},finiteSupplyConsumptionCounts:{water:consumed('water').filter(id=>id.startsWith('l1-')).length,food:consumed('food').filter(id=>id.startsWith('l1-')).length},branchesVisited:branchCount,cratesOpened:g.level1.crates.filter(c=>c.opened).length,notesRead:g.level1.readClues.length,sectorsVisited:g.level1.sectors.filter(s=>s.visited).length,droppedItemsRetrieved:retrieved,retries:g.level1.retries,idleWaitSeconds:0,outcome:g.mode};
 t.diagnostic('EXPLORATION_RUNTIME_JSON '+JSON.stringify(metric));
});
test('cross-sector return preserves progression and item identity, then permits the final win',()=>{
 const g=new Game(7);g.start();g.transitionZone('level1');const first=LEVEL_ONE_AREAS[0],second=LEVEL_ONE_AREAS[1];
 for(const p of first.route)walk(g,p);walk(g,second.spawn);assert.equal(g.level1.area,1);assert.equal(g.level1.sectors[0].encounter,'finished');
 const items=JSON.stringify(g.items);for(const p of [...first.route].reverse())walk(g,p);assert.equal(g.level1.area,0);assert.equal(g.level1.sectors[0].encounter,'finished');assert.equal(JSON.stringify(g.items),items);
 for(const area of LEVEL_ONE_AREAS)for(const [i,p]of area.route.entries())walk(g,p,false,area.id===5&&i===area.route.length-1);
 assert.equal(g.events.filter(e=>e==='level1-demo-end').length,1);assert.equal(g.level1.sectors.filter(s=>s.visited).length,6);
});
test('six optional route notes are reachable, unique in journal, and retained across checkpoint retry',()=>{
 const g=new Game(7);g.start();g.transitionZone('level1');
 // Independent interaction fixtures probe all authored wall-note stances.
 for(const a of LEVEL_ONE_AREAS){const c=a.clues[0];Object.assign(g.player,{x:c.x,z:c.z+.8});assert(!g.collides(g.player.x,g.player.z));assert.equal(g.interact(),'route-note');assert.equal(g.interact(),'route-note')}
 assert.equal(g.level1.readClues.length,6);const notes=[...g.level1.readClues];
 for(const a of LEVEL_ONE_AREAS){g.level1.danger.checkpoint={...a.spawn};g.level1.area=a.id;g.mode='lost';g.level1.failure='entity';assert(g.retryLevelOne());assert.equal(g.level1.area,a.id);assert.deepEqual(g.player,{...a.spawn,pitch:0});assert.deepEqual(g.level1.readClues,notes);assert.equal(g.level1.sectors[a.id].encounter,'pending');assert(!g.level1.danger.active)}
 assert.equal(g.level1.retries,6);g.reset(7);assert.equal(g.level1.readClues.length,0);assert(g.level1.sectors.every(s=>!s.visited&&s.encounter==='pending'));
});
