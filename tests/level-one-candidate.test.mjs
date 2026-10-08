import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {LEVEL1,levelOneLightingAt,zoneCollides} from '../dist/zones.js';
const fresh=()=>{const g=new Game(7);g.start();g.transitionZone('level1');return g};
// Continuous ordinary-speed movement with real collision, danger and survival.
function walk(g,x,z,{sprint=false}={}){
 let count=0;
 while(Math.hypot(x-g.player.x,z-g.player.z)>1e-7){
  assert.equal(g.mode,'playing');assert(count++<2000,`blocked at ${g.player.x},${g.player.z} toward ${x},${z}`);
  const d=Math.hypot(x-g.player.x,z-g.player.z);g.player.yaw=Math.atan2(x-g.player.x,-(z-g.player.z));
  g.update(Math.min(.025,d/(sprint?3.25:2.05)),{forward:1,sprint});assert(!g.collides(g.player.x,g.player.z));
 }
}
function finish(g,branch){
 for(const [x,z]of [[0,2],[5,2],[5,-9.8],[-5,-9.8],[-5,-15.9],[5,-15.9],[5,-20],[0,-20],[0,-28]])walk(g,x,z);
 if(branch==='refuge')for(const[x,z]of[[-5,-28],[-5,-37],[0,-37]])walk(g,x,z);
 walk(g,0,-42.75);for(let i=0;i<4&&g.mode==='playing';i++)g.update(.025,{forward:1});
 assert.equal(g.mode,'won');assert.equal(g.zone,'level1');assert.equal(g.events.filter(e=>e==='level1-demo-end').length,1);
}
for(const branch of ['direct','refuge'])test(`continuous ${branch} branch wins deterministically with live blackout cycles`,()=>{
 const a=fresh(),b=fresh();finish(a,branch);finish(b,branch);assert.deepEqual(a.snapshot(),b.snapshot());assert(a.level1.elapsed>28);
});
test('continuous sprint supply detours reach all four finite crates and return to the route',()=>{
 const g=fresh();const open=n=>{const c=g.level1.crates[n];assert.equal(g.nearestCrate()?.id,c.id);assert.equal(g.interact(),'crate');for(let i=0;i<3;i++)g.interact();assert.equal(g.items.filter(i=>i.id===`${c.id}-${c.kind}`).length,1)};
 walk(g,-4,2,{sprint:true});open(0);walk(g,0,2,{sprint:true});walk(g,5,2,{sprint:true});walk(g,5,-6,{sprint:true});open(1);
 for(const[x,z]of[[5,-9.8],[-5,-9.8],[-5,-15.9],[5,-15.9],[5,-20],[0,-20],[-3.8,-20]])walk(g,x,z,{sprint:true});open(2);
 for(const[x,z]of[[0,-20],[0,-28],[-5,-28],[-5,-27]])walk(g,x,z,{sprint:true});open(3);
 assert(g.level1.crates.every(c=>c.opened));walk(g,-5,-28,{sprint:true});walk(g,-5,-37,{sprint:true});walk(g,0,-37,{sprint:true});walk(g,0,-42.75,{sprint:true});g.update(.05,{forward:1});assert.equal(g.mode,'won');
});
test('bypass seams allow an entire body while corner and exterior probes remain solid',()=>{
 for(const[x,z]of[[-5,-29.8],[-5,-30],[-5,-30.2],[-5,-35.8],[-5,-37],[-4,-37],[-2,-37],[-1.6,-37],[0,-37]])assert(!zoneCollides('level1',x,z,.22),`open seam ${x},${z}`);
 for(const[x,z]of[[-3.9,-35.9],[-6.1,-31],[-5,-38.1],[-3,-35.9],[-1.8,-35.5],[-1.8,-38.1]])assert(zoneCollides('level1',x,z,.22),`solid corner ${x},${z}`);
});
test('retry preserves stable crate, consumed and dropped item identities; reset restores fresh state',()=>{
 const g=fresh();walk(g,-4,2);g.interact();g.food=90;g.consume('food-1');g.drop('food-2');g.phone('phone-1').battery=31;
 const before=JSON.stringify(g.items),crates=JSON.stringify(g.level1.crates);g.food=0;g.hydration=3;g.mode='lost';g.level1.failure='entity';g.level1.danger.checkpoint={x:0,z:3,yaw:1};
 assert(g.retryLevelOne());assert.equal(JSON.stringify(g.items),before);assert.equal(JSON.stringify(g.level1.crates),crates);assert.equal(g.food,25);assert.equal(g.hydration,25);assert.equal(g.phone('phone-1').battery,31);assert.deepEqual(g.player,{x:0,z:3,yaw:1,pitch:0});assert.equal(g.level1.elapsed,0);assert.equal(g.level1.failure,null);assert.equal(g.level1.retries,1);assert(!g.retryLevelOne());
 g.reset(7);assert.equal(g.zone,'level0');assert.equal(g.level1.retries,0);assert(g.level1.crates.every(c=>!c.opened));assert.equal(g.items.length,7);assert.equal(g.phone('phone-1').battery,100);assert(g.items.every(i=>i.zone==='level0'));
});
test('introductory and later lighting boundaries are exact',()=>{
 for(const[t,phase]of[[0,'lit'],[13.999,'lit'],[14,'warning'],[19.999,'warning'],[20,'dark'],[27.999,'dark'],[28,'lit'],[55.999,'lit'],[56,'warning'],[62,'dark'],[70,'lit']])assert.equal(levelOneLightingAt(t),phase,`${t}s`);
});
