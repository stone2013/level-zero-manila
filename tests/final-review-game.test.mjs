import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,CELL,RADIUS} from '../dist/game.js';
import {ESCAPE_SPEED,MONSTER_RADIUS,MONSTER_STEP,ESCAPE_CAPTURE_DISTANCE} from '../dist/escape.js';

// These are model-only regression checks, not browser/GPU/device QA.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function begin(dt=.02){
 const g=new Game(42);g.start();g.elapsed=480-dt;
 for(let frames=0;g.escape.phase!=='warning'&&frames<1000;frames++)g.update(dt);
 assert.equal(g.escape.phase,'warning');return g;
}
function walk(g,to,dt){
 for(let frames=0;distance(g.player,to)>1e-7&&frames<15000;frames++){
  assert.equal(g.mode,'playing');assert(!['caught-animation','caught'].includes(g.escape.phase));
  const dx=to.x-g.player.x,dz=to.z-g.player.z,d=Math.hypot(dx,dz);
  g.player.yaw=Math.atan2(dx,-dz);g.update(dt,{forward:Math.min(1,d/(ESCAPE_SPEED*dt))});
  assert(!g.collides(g.player.x,g.player.z),'walking never bypasses player collision');
  assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}),'pursuit never bypasses monster collision');
 }
 assert(distance(g.player,to)<1e-6,`walking stalled toward ${JSON.stringify(to)}`);
}
function waitForCapture(g,dt,seconds=60){
 const player={...g.player};
 for(let frames=0;g.mode==='playing'&&frames<seconds/dt;frames++){
  g.update(dt);
  assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}),'capture does not require monster wall penetration');
 }
 assert.deepEqual(g.player,player,'stationary player stays put through the catch animation');
 assert.equal(g.mode,'caught',`stationary corner player remains safe at gap ${distance(g.player,g.escape.monster).toFixed(6)} m`);
 assert.equal(g.escape.phase,'caught');
 assert.equal(g.events.filter(e=>e==='它追上来了。').length,1);
}

for(const dt of [.02,.05])for(let branchIndex=0;branchIndex<8;branchIndex++)for(const side of [-1,1]){
 test(`stationary escape branch ${branchIndex} far ${side<0?'left':'right'} corner is caught at ${1/dt} Hz`,()=>{
  const g=begin(dt),l=g.escape.layout,b=l.branches[branchIndex];
  const junction={x:(b.x+.5)*CELL,z:(b.z-.5)*CELL};
  const index=l.route.findIndex(p=>distance(p,junction)<1e-7);
  assert(index>=l.startIndex);
  for(let i=l.startIndex+1;i<=index;i++)walk(g,l.route[i],dt);
  walk(g,{x:(b.x+.5)*CELL,z:(b.z+.5)*CELL},dt);
  // Wall thickness .16 + player radius .22 permits a .305 m inset.
  // Both far corners are reached by the ordinary input and collision path.
  walk(g,{x:(b.x+.5)*CELL+side*(CELL/2-.305),z:(b.z+1)*CELL-.305},dt);
  assert.equal(g.escape.phase==='warning'||g.escape.phase==='chase',true);
  waitForCapture(g,dt);
 });
}

test('corner capture retains the structural-wall line-of-sight guard',()=>{
 const g=begin(),center={...g.escape.layout.start};g.escape.phase='chase';g.escape.time=0;
 // Both actors fit on opposite sides of a same-cell structural divider.
 // State placement isolates the occlusion case; it is not a playable route.
 Object.assign(g.player,{x:center.x+.4,z:center.z});
 Object.assign(g.escape.monster,{x:center.x-1.3,z:center.z});
 const divider={x:center.x,z:center.z,w:.16,d:5};g.obstacles.push(divider);g.walls.push(divider);
 assert(!g.collides(g.player.x,g.player.z));assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}));
 assert.equal(g.lineClear(g.escape.monster.x,g.escape.monster.z),false);
 for(let i=0;i<500;i++)g.update(.02);
 assert.equal(g.mode,'playing');assert.equal(g.escape.phase,'chase');
 assert(g.escape.monster.x<center.x);assert.equal(g.events.filter(e=>e==='它追上来了。').length,0);
});

for(const dt of [.02,.05])for(const [name,sx,sz] of [['northwest',-1,-1],['northeast',1,-1],['southwest',-1,1],['southeast',1,1]]){
 test(`stationary escape outer ${name} corner is caught at ${1/dt} Hz`,()=>{
  const g=begin(dt),l=g.escape.layout;
  const horizontal=sx<0?3:1,vertical=sz<0?0:2;
  const center=l.route.find(p=>{
   const cell=l.lookup.get(`${Math.floor(p.x/CELL)},${Math.floor(p.z/CELL)}`);
   return !cell.open[horizontal]&&!cell.open[vertical];
  });
  assert(center,`escape layout has a closed ${name} corner`);
  // A local same-cell fixture checks every geometric orientation, including
  // the start/end edges that cannot all be reached before normal pursuit.
  Object.assign(g.player,center);Object.assign(g.escape.monster,center);
  walk(g,{x:center.x+sx*(CELL/2-.305),z:center.z+sz*(CELL/2-.305)},dt);
  waitForCapture(g,dt,10);
 });
}

for(const forced of [false,true])test(`door sweep and player substeps stay collision-free across partial leaf angles at ${forced?'forced chase':'normal sprint'} speed`,()=>{
 let frames=0;
 for(let phase=0;phase<=20;phase++)for(const direction of [-1,1])for(let side=0;side<16;side++){
  const g=new Game(42);g.start();const a=side*Math.PI/8;
  Object.assign(g.player,{x:g.maze.doorX+Math.cos(a)*1.7,z:g.maze.doorZ+Math.sin(a)*1.7});
  g.door=phase/20;g.doorTarget=direction>0?1:0;
  // Isolate the existing door-phase speed boost without an active pursuer.
  // A completed full close still ends this phase through production logic.
  if(forced){g.escape.phase='door';g.escape.monster={active:false}}
  if(g.collides(g.player.x,g.player.z))continue;
  for(let frame=0;frame<45;frame++){
   g.player.yaw=a+frame*.19;
   g.update(.05,{forward:frame%3-1,strafe:(frame+1)%3-1,sprint:true});frames++;
   assert(!g.collides(g.player.x,g.player.z),`door intersection at leaf ${phase/20}, direction ${direction}, side ${side}, frame ${frame}`);
  }
 }
 assert.equal(frames,26100);
});

test('capture reach includes collision radii and one bounded movement substep',()=>{assert.equal(ESCAPE_CAPTURE_DISTANCE,MONSTER_RADIUS+RADIUS+MONSTER_STEP)});

for(const dt of [.0157,.0158])for(const side of [-1,1]){
 test(`near-wall branch corner cannot evade capture at ${(1000*dt).toFixed(1)} ms frames, side ${side}`,()=>{
  const g=begin(dt),b=g.escape.layout.branches[0];
  walk(g,{x:(b.x+.5)*CELL,z:(b.z+.5)*CELL},dt);
  // The legal wall boundary is a .30 m inset. At these ordinary frame
  // cadences, rejecting the next whole monster substep leaves 1.394–1.405 m
  // between the actors, just beyond radius-sum reach (1.39 m).
  walk(g,{x:(b.x+.5)*CELL+side*(CELL/2-.300001),z:(b.z+1)*CELL-.300001},dt);
  waitForCapture(g,dt);
 });
}

for(const branchIndex of [0,4,7])for(const side of [-1,1]){
 test(`varying frame cadence catches branch ${branchIndex} at its closest legal far corner, side ${side}`,()=>{
  const g=begin(),l=g.escape.layout,b=l.branches[branchIndex];
  const cycle=[.0157,.0162,.0158,.0174,.0182,.048,.05,.006];let frame=0;
  const nextDt=()=>cycle[frame++%cycle.length];
  function walkVariable(to){
   for(let step=0;distance(g.player,to)>1e-7&&step<15000;step++){
    assert.equal(g.mode,'playing');assert(!['caught-animation','caught'].includes(g.escape.phase));
    const dt=nextDt(),dx=to.x-g.player.x,dz=to.z-g.player.z,d=Math.hypot(dx,dz);
    g.player.yaw=Math.atan2(dx,-dz);g.update(dt,{forward:Math.min(1,d/(ESCAPE_SPEED*dt))});
    assert(!g.collides(g.player.x,g.player.z));assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}));
   }
   assert(distance(g.player,to)<1e-6);
  }
  const junction={x:(b.x+.5)*CELL,z:(b.z-.5)*CELL};
  const index=l.route.findIndex(p=>distance(p,junction)<1e-7);
  for(let i=l.startIndex+1;i<=index;i++)walkVariable(l.route[i]);
  walkVariable({x:(b.x+.5)*CELL,z:(b.z+.5)*CELL});
  walkVariable({x:(b.x+.5)*CELL+side*(CELL/2-.300001),z:(b.z+1)*CELL-.300001});
  const player={...g.player};let elapsed=0;
  while(g.mode==='playing'&&elapsed<60){const dt=nextDt();g.update(dt);elapsed+=dt;assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}))}
  assert.deepEqual(g.player,player);assert.equal(g.mode,'caught');assert.equal(g.escape.phase,'caught');
  assert.equal(g.events.filter(e=>e==='它追上来了。').length,1);
 });
}
