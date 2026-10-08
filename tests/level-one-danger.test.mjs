import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {LEVEL_ONE_AREAS,isLevelOneSheltered} from '../dist/level-one-layout.js';
import {resetLevelOneDanger,updateLevelOneDanger} from '../dist/level-one-danger.js';
const tick=(g,t)=>{for(let i=0;i<Math.round(t/.025)&&g.mode==='playing';i++)g.update(.025,{})};
function fresh(area=0){const g=new Game(7);g.start();g.transitionZone('level1');g.level1.area=area;Object.assign(g.player,{x:0,z:LEVEL_ONE_AREAS[area].offsetZ-45,yaw:0});return g}
function presence(g,x=g.player.x,z=g.player.z-.6){g.level1.phase='dark';const record=g.level1.sectors[g.level1.area];record.encounter='dark';record.time=0;Object.assign(g.level1.danger,{area:g.level1.area,active:true,spawnAttempted:true,x,z,phase:'dark',grace:0,routeTimer:Infinity,path:[],lastPlayer:{...g.player}})}

test('physical creature blocks charging through its body but permits retreat',()=>{
 for(const retreat of[false,true]){const g=fresh();presence(g);for(let i=0;i<40&&g.mode==='playing';i++)g.update(.025,{forward:retreat?-1:1});if(retreat){assert.equal(g.mode,'playing');assert(g.player.z> -44);assert.equal(g.level1.danger.contact,0)}else{assert.equal(g.mode,'lost');assert(g.player.z> -45.1);assert.equal(g.level1.failure,'entity')}}
});
test('actual position-triggered blackout captures an exposed stationary player without time writes',()=>{
 const g=fresh();tick(g,20);assert.equal(g.mode,'lost');assert.equal(g.level1.failure,'entity');assert(g.events.includes('level1-entity-caught'));assert.equal(g.escape.monster?.active||false,false);
});
test('every sector shelter is physically safe through its full authored blackout',()=>{
 for(const a of LEVEL_ONE_AREAS)for(const s of a.shelters){const g=fresh(a.id);Object.assign(g.player,{x:(s.minX+s.maxX)/2,z:(s.minZ+s.maxZ)/2});if(g.collides(g.player.x,g.player.z))g.player.x+=1.2;assert(!g.collides(g.player.x,g.player.z));g.level1.sectors[a.id].encounter='dark';g.level1.phase='dark';tick(g,13);assert.equal(g.mode,'playing');assert.equal(g.level1.danger.contact,0);assert.equal(g.level1.danger.proximity,0);assert(!g.level1.danger.active||!isLevelOneSheltered(g.level1.danger.x,g.level1.danger.z));assert.deepEqual(g.level1.danger.checkpoint,{x:g.player.x,z:g.player.z,yaw:0})}
});
test('pause, backpack, phone, other zones and invalid dt preserve entity state',()=>{
 for(const patch of[{mode:'paused'},{inventoryOpen:true},{phoneOpenId:'phone-1'},{zone:'hub'}]){const g=fresh();presence(g);Object.assign(g,patch);const before=JSON.stringify(g.level1.danger);for(let i=0;i<80;i++)updateLevelOneDanger(g,.025);assert.equal(JSON.stringify(g.level1.danger),before)}
 const g=fresh();presence(g);const before=JSON.stringify(g.level1.danger);for(const dt of[NaN,0,-1,Infinity])updateLevelOneDanger(g,dt);assert.equal(JSON.stringify(g.level1.danger),before);
});
test('two second grace precedes sustained contact and breaking contact resets capture',()=>{
 const g=fresh();presence(g);g.level1.danger.grace=2;tick(g,2.5);assert.equal(g.mode,'playing');g.player.x-=2;tick(g,.025);assert.equal(g.level1.danger.contact,0);g.player.x+=2;tick(g,.725);assert.equal(g.mode,'lost');
});
test('light removes the creature without draining health; separate resets own routes and checkpoints',()=>{
 const g=fresh();presence(g);g.level1.phase='lit';const resources=[g.food,g.hydration];updateLevelOneDanger(g,.025);assert(!g.level1.danger.active);assert.equal(g.level1.danger.contact,0);assert.equal(g.level1.danger.proximity,0);assert.deepEqual([g.food,g.hydration],resources);
 const a=resetLevelOneDanger(),b=resetLevelOneDanger();a.path.push({x:0,z:0});a.checkpoint.x=99;assert.equal(b.path.length,0);assert.equal(b.checkpoint.x,0);
});
test('new obstacles invalidate creature occupation rather than teleporting it',()=>{
 const g=fresh();presence(g);const d=g.level1.danger,position={x:d.x,z:d.z};g.collides=()=>true;updateLevelOneDanger(g,.025);assert(!d.active);assert.deepEqual({x:d.x,z:d.z},position);assert.equal(g.mode,'playing');
});
