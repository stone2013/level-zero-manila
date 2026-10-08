import {Game} from '../dist/game.js';
import {LEVEL_ONE_KNOWN_ROUTE} from '../dist/level-one-layout.js';
import {performance} from 'node:perf_hooks';
const results=[];
for(const sprint of [false,true]){
 const g=new Game(7);g.start();g.transitionZone('level1');g.food=80;g.hydration=65;g.prepareLevelOne();let distance=0,ticks=0,blocked=0,maxTick=0,cpu=0;const encounters=[];let phase='';
 outer:for(const target of LEVEL_ONE_KNOWN_ROUTE){
  let guard=0;while(Math.hypot(target.x-g.player.x,target.z-g.player.z)>1e-6){
   if(g.mode!=='playing')break outer;
   if(guard++>10000){blocked++;break outer}
   const p={...g.player},d=Math.hypot(target.x-p.x,target.z-p.z);g.player.yaw=Math.atan2(target.x-p.x,-(target.z-p.z));const start=performance.now();g.update(Math.min(.05,d/(sprint?3.25:2.05)),{forward:1,sprint});const elapsed=performance.now()-start;maxTick=Math.max(maxTick,elapsed);cpu+=elapsed;ticks++;distance+=Math.hypot(g.player.x-p.x,g.player.z-p.z);
   const key=g.level1.area+':'+g.level1.phase;if(key!==phase){phase=key;encounters.push({area:g.level1.area,phase:g.level1.phase,t:g.level1.elapsed,position:{x:g.player.x,z:g.player.z}})}
  }
 }
 results.push({sprint,mode:g.mode,area:g.level1.area,seconds:g.level1.elapsed,distance,food:g.food,hydration:g.hydration,blocked,ticks,cpuAverageMs:cpu/ticks,cpuMaxMs:maxTick,encounters});
}
console.log(JSON.stringify({note:'Unreactive known-route controller; failures are reported, not suppressed. Real game update, collision and authored danger. CPU timing is not FPS.',results},null,2));
