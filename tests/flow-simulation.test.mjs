import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';

function roomGame(){
 const g=new Game(42);g.start();g.changed=true;g.entered=true;
 g.player.x=g.maze.doorX+.6;g.player.z=g.maze.doorZ;
 g.events=[];return g;
}

test('opening door stops and reverses before intersecting a player inside its sweep',()=>{
 for(const dt of [.016,.05,1]){
  const g=roomGame();assert(!g.collides(g.player.x,g.player.z));
  assert.equal(g.interact(),'door');
  let reversed=false;
  for(let i=0;i<100;i++){
   g.update(dt);
   assert(!g.doorCollision(g.player.x,g.player.z),'opening leaf must never advance into player');
   if(g.doorTarget===0)reversed=true;
  }
  assert(reversed);assert.equal(g.door,0);assert.equal(g.mode,'playing');
  // Repeated attempts from the obstructed spot cannot force the door through us.
  for(let attempt=0;attempt<3;attempt++){
   g.interact();for(let i=0;i<50;i++){g.update(.02);assert(!g.doorCollision(g.player.x,g.player.z))}
  }
  // Moving out of the sweep allows the same existing door to open fully.
  g.move(1.5,0);assert.equal(g.interact(),'door');
  for(let i=0;i<50;i++)g.update(.02);
  assert.equal(g.door,1);assert(!g.collides(g.player.x,g.player.z));
 }
});

test('blocked opening remains frozen across backpack and manual pause, then resumes safely',()=>{
 const g=roomGame();g.interact();g.update(.05);
 assert(g.door>0&&g.door<1);const before=g.door;
 g.openInventory();for(let i=0;i<20;i++)g.update(.05);assert.equal(g.door,before);
 g.closeInventory();g.pause();for(let i=0;i<20;i++)g.update(.05);assert.equal(g.door,before);
 g.resume();for(let i=0;i<50;i++){g.update(.05);assert(!g.doorCollision(g.player.x,g.player.z))}
 assert.equal(g.door,0);
});

test('exit crossing commits one terminal result before survival can overwrite it',()=>{
 for(const resource of ['food','hydration']){
  const g=roomGame();g.transitionZone('level1');g.events=[];
  g.player.x=0;g.player.z=-42.78;g.player.yaw=0;
  g[resource]=.0001;g.update(.05,{forward:1});
  assert.equal(g.mode,'won');assert.deepEqual(g.events,['level1-demo-end']);
  const final=g.snapshot();for(let i=0;i<20;i++){g.update(.05,{forward:1});g.updateDevices(.05)}
  assert.deepEqual(g.snapshot(),final,'terminal simulation and devices stay frozen');
 }
});

test('depletion before reaching the exit still loses once and freezes thereafter',()=>{
 const g=roomGame();g.door=g.doorTarget=1;
 g.player.x=g.maze.doorX-8;g.player.z=g.maze.doorZ;g.player.yaw=-Math.PI/2;
 g.hydration=.0001;g.update(.05,{forward:1});
 assert.equal(g.mode,'lost');assert.deepEqual(g.events,['lost']);
 const final=g.snapshot();for(let i=0;i<20;i++)g.update(.05,{forward:1});
 assert.deepEqual(g.snapshot(),final);
});
