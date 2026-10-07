import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, CELL, PHONE_CHARGE_PER_SECOND} from '../dist/game.js';
import {ESCAPE_TRIGGER_SECONDS, ESCAPE_SPEED, MONSTER_RADIUS, escapeDarkness, escapeDirection} from '../dist/escape.js';

const near=(a,b,message='')=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const position=p=>({x:p.x,z:p.z});
const items=g=>g.items.map(i=>({...i}));
const forbiddenPhases=new Set(['blackout','loading','seam','seam-loading']);

function begin(g,dt){
 g.elapsed=ESCAPE_TRIGGER_SECONDS-dt;
 g.update(dt);
 assert.equal(g.escape.phase,'flicker');
 for(let i=0;i<5/dt&&g.escape.phase!=='warning';i++)g.update(dt);
 assert.equal(g.escape.phase,'warning');
 assert(!g.collides(g.player.x,g.player.z));
 return g.escape.connection;
}

// From the initial warning onward, every displacement is produced by actual
// Game.update() input. The only allowed later translation is the existing
// level0-to-hub zone transition, never a chase-to-Manila seam.
function driver(g,dt){
 const connection=g.escape.connection;
 let frames=0,travel=0,maximumStep=0;
 function step(input={}){
  const before=position(g.player),zone=g.zone,phase=g.escape.phase;
  const monster=g.escape.monster&&position(g.escape.monster);
  const speed=['warning','chase','door'].includes(phase)?ESCAPE_SPEED:2.05;
  g.update(dt,input);frames++;
  assert.equal(g.mode,'playing',`unexpected ${g.mode} at frame ${frames}`);
  assert.equal(g.escape.connection,connection,'the endpoint must not reconnect or relocate the player');
  assert(!forbiddenPhases.has(g.escape.phase),`unexpected endpoint transition ${g.escape.phase}`);
  assert.equal(escapeDarkness(g),0,'the route and room must remain visible');
  if(g.zone===zone){
   const moved=distance(before,g.player);travel+=moved;maximumStep=Math.max(maximumStep,moved);
   assert(moved<=speed*dt+1e-7,`discontinuous player step ${moved} at ${phase}`);
   if(!input.forward&&!input.strafe)near(moved,0,'no automatic player motion');
  }else{
   assert.equal(zone,'level0');assert.equal(g.zone,'hub');
   assert.equal(g.changed,true);assert(before.x<g.maze.doorX-8,'zone transition is reached by walking through the exit');
  }
  assert(!g.collides(g.player.x,g.player.z),'player cannot cross a physical wall, table or door leaf');
  if(g.escape.monster?.active){
   const m=g.escape.monster;
   assert(!g.collides(m.x,m.z,{radius:MONSTER_RADIUS,ignoreRender:true}),'pursuer cannot cross a wall');
   assert(distance(monster,m)<=4.18*dt+1e-7,'pursuer displacement stays bounded');
  }
  assert(g.escape.nav.length<=121);
 }
 function walk(to){
  let count=0;
  while(distance(g.player,to)>1e-7){
   assert(count++<2000,`blocked at ${JSON.stringify(position(g.player))} toward ${JSON.stringify(to)}`);
   const dx=to.x-g.player.x,dz=to.z-g.player.z,d=Math.hypot(dx,dz);
   g.player.yaw=Math.atan2(dx,-dz);
   const speed=['warning','chase','door'].includes(g.escape.phase)?ESCAPE_SPEED:2.05;
   step({forward:Math.min(1,d/(speed*dt))});
  }
 }
 function until(predicate,seconds=2){
  for(let i=0;i<Math.ceil(seconds/dt)&&!predicate();i++)step();
  assert(predicate(),`timed out in ${g.escape.phase}`);
 }
 return{step,walk,until,stats:()=>({frames,travel,maximumStep})};
}

for(const [seed,dt] of [[1,1/60],[7,.02],[42,.05],[99,1/60],[20261007,.02],[0xffffffff,.05]]){
 test(`seed ${seed}, ${Math.round(1/dt)} Hz: continuous escape endpoint → real room → finite supplies/charger → hub`,t=>{
  const g=new Game(seed),originalDoor={x:g.maze.doorX,z:g.maze.doorZ};g.start();
  g.food=60;g.hydration=45;assert.equal(g.consume('food','food-1'),'food-1');
  assert.equal(g.drop('food-2'),'food-2');g.phone('phone-1').battery=37;
  const array=g.items,refs=[...array],before=items(g),ground=before.filter(i=>i.state==='world'&&i.area==='maze');
  const roomWalls=g.roomWalls,wallRefs=[...roomWalls],wallData=roomWalls.map(w=>({...w}));
  const obstacles=g.obstacles,obstacleRefs=[...obstacles],obstacleData=obstacles.map(w=>({...w}));
  const charger=g.chargerPosition();
  begin(g,dt);
  const l=g.escape.layout,offset=g.escape.roomOffset;
  near(g.maze.doorX,l.end.x+CELL/2);near(g.maze.doorZ,l.end.z);
  assert.deepEqual({x:g.maze.doorX,z:g.maze.doorZ},l.door);
  assert(offset&&Math.hypot(offset.x,offset.z)>100,'the real room was relocated during the initial blackout');
  assert.equal(g.roomContains(originalDoor.x+2,originalDoor.z),false,'the original location is no longer a second Manila room');
  assert.strictEqual(g.items,array);g.items.forEach((item,i)=>assert.strictEqual(item,refs[i]));
  assert.deepEqual(items(g),before.map(i=>i.state==='world'&&i.area==='room'?{...i,x:i.x+offset.x,z:i.z+offset.z}:i));
  assert.strictEqual(g.roomWalls,roomWalls);g.roomWalls.forEach((w,i)=>assert.strictEqual(w,wallRefs[i]));
  assert.deepEqual(g.roomWalls,wallData.map(w=>({...w,x:w.x+offset.x,z:w.z+offset.z})));
  assert.strictEqual(g.obstacles,obstacles);g.obstacles.forEach((w,i)=>assert.strictEqual(w,obstacleRefs[i]));
  assert.deepEqual(g.obstacles,obstacleData.map(w=>({...w,x:w.x+offset.x,z:w.z+offset.z})));
  assert.deepEqual(g.chargerPosition(),{x:charger.x+offset.x,z:charger.z+offset.z});
  assert.equal(g.phone('phone-1').battery,37);

  const d=driver(g,dt),start=g.elapsed;
  for(let i=l.startIndex+1;i<l.route.length;i++)d.walk(l.route[i]);
  const routeSeconds=g.elapsed-start;
  assert(routeSeconds>=45&&routeSeconds<=60,`route duration ${routeSeconds}`);
  assert.equal(g.escape.phase,'door');assert.deepEqual(position(g.player),l.end);
  assert.equal(g.escape.progress,l.route.length-1);
  assert.deepEqual(position(escapeDirection(g)),l.door);
  near(distance(g.player,l.door),2.5,'the endpoint is physically beside the real wooden door');
  assert(g.lineClear(g.maze.doorX-.4,g.maze.doorZ),'door approach is visible and unobstructed');
  assert(g.collides(g.maze.doorX,g.maze.doorZ),'closed door remains solid');
  assert(g.collides(g.maze.doorX,g.maze.doorZ-1.7),'north doorway jamb remains solid');
  assert(g.collides(g.maze.doorX,g.maze.doorZ+1.7),'south doorway jamb remains solid');
  assert.equal(g.changed,false);assert.equal(g.entered,false);
  assert.equal(g.interact(),null,'the player must approach to reach the door handle');

  d.walk({x:g.maze.doorX-1.25,z:g.maze.doorZ});
  assert.equal(g.interact(),'door');d.until(()=>g.door===1);
  assert(!g.collides(g.maze.doorX,g.maze.doorZ),'fully open door allows continuous crossing');
  d.walk({x:g.maze.doorX+1.7,z:g.maze.doorZ});
  assert(g.inRoom());assert(g.entered);assert.equal(g.changed,false);
  assert.equal(g.escape.phase,'door');assert(escapeDirection(g).label.includes('关上'));
  assert.equal(g.interact(),'door');d.until(()=>g.door===0);
  assert(g.changed);assert.equal(g.escape.phase,'finished');assert.equal(g.escape.monster.active,false);
  assert(g.collides(g.maze.doorX+6,g.maze.doorZ),'the original back wall encloses the relocated room');
  assert.equal(g.events.filter(e=>e==='门完全关上了。脚步声消失。').length,1);

  // Stop west of the solid table: both bottles and the actual charging cable
  // must be reachable through normal interactions without entering furniture.
  d.walk({x:g.maze.doorX+3.15,z:g.maze.doorZ-.55});
  assert(g.nearCharger());assert.equal(g.chargingPhoneId,null);
  const picked=[];
  for(let i=0;i<2;i++){
   const nearest=g.nearestItem();assert.equal(nearest?.kind,'water');picked.push(nearest.id);
   assert.equal(g.interact(),'pickup');assert.strictEqual(g.items.find(item=>item.id===nearest.id),nearest);
  }
  assert.deepEqual(picked.sort(),['water-1','water-2']);assert.equal(g.inventory('water').length,2);
  assert.equal(g.nearestItem(),undefined);assert.equal(g.items.filter(i=>i.kind==='water').length,2);
  assert.equal(g.interact(),'charger');assert.equal(g.chargingPhoneId,'phone-1');
  for(let i=0;i<20;i++)g.updateDevices(.05);
  near(g.phone('phone-1').battery,37+PHONE_CHARGE_PER_SECOND,'the single original phone charges in place');
  for(const id of picked){assert.equal(g.consume('water',id),id);assert.equal(g.consume('water',id),undefined);assert.equal(g.pickupItem(id),undefined)}
  assert.equal(g.items.filter(i=>i.kind==='water'&&i.state==='consumed').length,2);
  assert.equal(g.inventory('water').length,0);assert.equal(g.nearestItem(),undefined);
  assert.equal(g.interact(),'charger');assert.equal(g.chargingPhoneId,null,'repeated table interaction cannot regenerate bottles');
  const battery=g.phone('phone-1').battery;
  d.walk({x:g.maze.doorX+1.7,z:g.maze.doorZ});
  assert.equal(g.interact(),'door');d.until(()=>g.door===1);
  g.player.yaw=-Math.PI/2;
  for(let i=0;i<12/dt&&g.zone==='level0';i++)d.step({forward:1});
  assert.equal(g.zone,'hub');assert.equal(g.mode,'playing');assert.equal(g.escape.phase,'finished');
  assert.equal(g.phone('phone-1').battery,battery);
  assert.equal(g.items.length,7);assert.equal(new Set(g.items.map(i=>i.id)).size,7);
  g.items.forEach((item,i)=>assert.strictEqual(item,refs[i]));
  assert.deepEqual(items(g).filter(i=>i.state==='world'&&i.area==='maze'),ground,'all maze drops stay at their original positions');
  assert.equal(g.items.find(i=>i.id==='food-1').state,'consumed');
  assert.equal(g.items.filter(i=>i.kind==='water').length,2);
  t.diagnostic(`${routeSeconds.toFixed(2)} s route; ${d.stats().frames} checked frames; largest same-zone step ${d.stats().maximumStep.toFixed(4)} m.`);
 });
}

for(const seed of [1,42,99]){
 test(`seed ${seed}: retry reuses one relocated room without moving dropped items; reset restores original room`,()=>{
  const dt=.02,g=new Game(seed),original=new Game(seed);g.start();
  g.food=60;g.hydration=70;assert.equal(g.consume('food','food-1'),'food-1');
  assert.equal(g.drop('food-2'),'food-2');g.phone('phone-1').battery=19;
  begin(g,dt);
  assert.equal(g.drop('food-3'),'food-3');assert.equal(g.drop('phone-1'),'phone-1');
  for(let i=0;i<30/dt&&g.mode!=='caught';i++)g.update(dt);
  assert.equal(g.mode,'caught');
  const before=items(g),array=g.items,refs=[...array],layout=g.escape.layout,offset={...g.escape.roomOffset};
  const door={x:g.maze.doorX,z:g.maze.doorZ},walls=g.roomWalls.map(w=>({...w})),obstacles=g.obstacles.map(o=>({...o})),charger=g.chargerPosition();
  const elapsed=g.elapsed,food=g.food,hydration=g.hydration,connection=g.escape.connection;
  assert(g.retryEscape());assert.equal(g.escape.attempt,2);assert.equal(g.escape.connection,connection+1);
  assert.strictEqual(g.escape.layout,layout);assert.strictEqual(g.items,array);g.items.forEach((i,k)=>assert.strictEqual(i,refs[k]));
  assert.deepEqual(items(g),before);assert.deepEqual(g.escape.roomOffset,offset);
  assert.deepEqual({x:g.maze.doorX,z:g.maze.doorZ},door);assert.deepEqual(g.roomWalls,walls);assert.deepEqual(g.obstacles,obstacles);assert.deepEqual(g.chargerPosition(),charger);
  near(g.elapsed,elapsed);near(g.food,food);near(g.hydration,hydration);
  assert.deepEqual(position(g.player),layout.start);g.update(dt);assert.equal(g.escape.phase,'warning');
  // Both escape-local drops remain physically reachable at the retry start.
  assert.equal(g.pickupItem('phone-1'),'phone-1');assert.equal(g.phone('phone-1').battery,19);
  assert.equal(g.pickupItem('food-3'),'food-3');
  const d=driver(g,dt);for(let i=layout.startIndex+1;i<layout.route.length;i++)d.walk(layout.route[i]);
  assert.equal(g.escape.phase,'door');assert.deepEqual({x:g.maze.doorX,z:g.maze.doorZ},door);
  assert.deepEqual(g.roomWalls,walls);assert.deepEqual(g.obstacles,obstacles);assert.deepEqual(g.chargerPosition(),charger);
  assert.equal(g.phone('phone-1').battery,19);assert.equal(g.items.find(i=>i.id==='food-1').state,'consumed');
  assert.deepEqual(g.items.find(i=>i.id==='food-2'),before.find(i=>i.id==='food-2'));
  g.reset(seed);
  assert.equal(g.escape.phase,'idle');assert.equal(g.escape.layout,null);assert.equal(g.escape.roomOffset,undefined);assert.equal(g.world.escapeLayout,undefined);
  assert.deepEqual(g.snapshot(),original.snapshot());assert.deepEqual(g.roomWalls,original.roomWalls);assert.deepEqual(g.obstacles,original.obstacles);assert.deepEqual(g.chargerPosition(),original.chargerPosition());
 });
}
