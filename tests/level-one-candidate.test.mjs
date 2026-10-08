import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {LEVEL_ONE_AREAS,LEVEL_ONE_KNOWN_ROUTE,levelOneCollides} from '../dist/level-one-layout.js';
const fresh=()=>{const g=new Game(7);g.start();g.transitionZone('level1');return g};
export function walk(g,p,{sprint=false,win=false}={}){
 let count=0;
 while(g.mode==='playing'&&Math.hypot(p.x-g.player.x,p.z-g.player.z)>1e-7){
  assert(count++<10000,`blocked at ${g.player.x},${g.player.z} toward ${p.x},${p.z}`);
  const distance=Math.hypot(p.x-g.player.x,p.z-g.player.z),speed=sprint&&g.hydration>15?3.25:2.05;
  g.player.yaw=Math.atan2(p.x-g.player.x,-(p.z-g.player.z));g.update(Math.min(.025,distance/speed),{forward:1,sprint});
  assert(!g.collides(g.player.x,g.player.z));assert.equal(g.escape.monster?.active||false,false);
 }
 assert.equal(g.mode,win?'won':'playing');
}
for(const sprint of[false,true])test(`six-sector continuous ${sprint?'sprint':'walk'} route wins deterministically without waits or clue gates`,()=>{
 const a=fresh(),b=fresh();for(const g of[a,b])for(const [i,p]of LEVEL_ONE_KNOWN_ROUTE.entries())walk(g,p,{sprint,win:i===LEVEL_ONE_KNOWN_ROUTE.length-1});
 assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(a.level1.sectors.filter(s=>s.visited).length,6);assert.equal(a.level1.readClues.length,0);assert.equal(a.events.filter(e=>e==='level1-demo-end').length,1);assert(a.level1.elapsed>(sprint?220:350));assert(a.level1.elapsed<(sprint?240:380));assert(a.food>0&&a.hydration>0);
});
test('all ten service loops admit a complete body through both openings and retain solid partitions',()=>{
 let count=0;for(const a of LEVEL_ONE_AREAS)for(const loop of a.loops){count++;for(let i=1;i<loop.safeRoute.length;i++){const from=loop.safeRoute[i-1],to=loop.safeRoute[i],steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.05);for(let n=0;n<=steps;n++)assert(!levelOneCollides(from.x+(to.x-from.x)*n/steps,from.z+(to.z-from.z)*n/steps,.22),`${a.key} ${loop.id}`)}assert(levelOneCollides(a.walls.find(w=>w.w>20).x,a.walls.find(w=>w.w>20).z,.22))}assert.equal(count,10);
});
test('retry preserves finite crates, consumed and dropped identities, phone and read clues; reset restores fresh state',()=>{
 const g=fresh(),c=g.level1.crates[0];Object.assign(g.player,{x:c.x+1,z:c.z});g.interact();g.food=90;g.consume('food','food-1');g.drop('food-2');g.phone('phone-1').battery=31;g.level1.readClues.push('l1-route-note-1');
 const before=JSON.stringify(g.items),crates=JSON.stringify(g.level1.crates);g.food=0;g.hydration=3;g.mode='lost';g.level1.failure='entity';g.level1.danger.checkpoint={x:0,z:3,yaw:1};
 assert(g.retryLevelOne());assert.equal(JSON.stringify(g.items),before);assert.equal(JSON.stringify(g.level1.crates),crates);assert.equal(g.food,25);assert.equal(g.hydration,25);assert.equal(g.phone('phone-1').battery,31);assert.deepEqual(g.player,{x:0,z:3,yaw:1,pitch:0});assert.equal(g.level1.elapsed,0);assert.equal(g.level1.failure,null);assert.equal(g.level1.retries,1);assert.deepEqual(g.level1.readClues,['l1-route-note-1']);assert(!g.retryLevelOne());
 g.reset(7);assert.equal(g.zone,'level0');assert.equal(g.level1.retries,0);assert(g.level1.crates.every(c=>!c.opened));assert.equal(g.items.length,7);assert.equal(g.phone('phone-1').battery,100);assert(g.items.every(i=>i.zone==='level0'));
});
test('authored encounters are position-triggered, one-shot, and quiet refuge has none',()=>{
 for(const a of LEVEL_ONE_AREAS){const g=fresh();Object.assign(g.player,a.spawn);for(let i=0;i<2400;i++)g.update(.025,{});assert.equal(g.level1.phase,'lit');assert(!g.level1.danger.active);
  if(!a.encounter){assert.equal(a.id,4);assert.equal(g.level1.sectors[a.id].encounter,'finished');continue}
  Object.assign(g.player,{x:0,z:a.encounter.triggerZ});g.update(.025,{});assert.equal(g.level1.phase,'warning');assert.equal(g.level1.sectors[a.id].encounter,'warning');
  // Isolated clock fixture relocates to the clear entry refuge after triggering.
  Object.assign(g.player,a.spawn);for(let i=0;i<Math.ceil((a.encounter.warning+a.encounter.dark+100)/.025);i++)g.update(.025,{});
  assert.equal(g.mode,'playing');assert.equal(g.level1.phase,'lit');assert.equal(g.level1.sectors[a.id].encounter,'finished');assert(!g.level1.danger.active);
 }
});
