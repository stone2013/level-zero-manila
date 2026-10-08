import {performance} from 'node:perf_hooks';
import {Game} from '../dist/game.js';
const paths={direct:[[0,2],[5,2],[5,-9.8],[-5,-9.8],[-5,-15.9],[5,-15.9],[5,-20],[0,-20],[0,-28],[0,-43]],refuge:[[0,2],[5,2],[5,-9.8],[-5,-9.8],[-5,-15.9],[5,-15.9],[5,-20],[0,-20],[0,-28],[-5,-28],[-5,-37],[0,-37],[0,-43]]};
const results=[];
for(const branch of ['direct','refuge'])for(const sprint of [false,true]){
 const g=new Game(7);g.start();g.transitionZone('level1');const start=performance.now();g.prepareLevelOne();const prepareMs=performance.now()-start;
 const state={branch,sprint,prepareMs,phases:[],activeSeconds:0,darkActiveSeconds:0,visibleSeconds:0,minDistance:null,maxTickMs:0,totalTickMs:0,ticks:0};let oldPhase='';
 for(const[x,z]of paths[branch]){
  let guard=0;while(g.mode==='playing'&&Math.hypot(x-g.player.x,z-g.player.z)>1e-7){
   if(guard++>5000)throw Error('Blocked '+branch);const dist=Math.hypot(x-g.player.x,z-g.player.z),dt=Math.min(.025,dist/(sprint?3.25:2.05));g.player.yaw=Math.atan2(x-g.player.x,-(z-g.player.z));
   const t=performance.now();g.update(dt,{forward:1,sprint});const cost=performance.now()-t;state.totalTickMs+=cost;state.maxTickMs=Math.max(state.maxTickMs,cost);state.ticks++;
   const d=g.level1.danger;if(g.level1.phase!==oldPhase){oldPhase=g.level1.phase;state.phases.push({phase:oldPhase,t:g.level1.elapsed,x:g.player.x,z:g.player.z})}
   if(d.active){state.activeSeconds+=dt;if(g.level1.phase==='dark')state.darkActiveSeconds+=dt;if(g.lineClear(d.x,d.z)&&d.grace<1.9){state.visibleSeconds+=dt;const distance=Math.hypot(d.x-g.player.x,d.z-g.player.z);state.minDistance=state.minDistance===null?distance:Math.min(state.minDistance,distance)}}
  }
 }
 Object.assign(state,{mode:g.mode,elapsed:g.level1.elapsed,averageTickMs:state.totalTickMs/state.ticks});results.push(state);
}
console.log(JSON.stringify({note:'Node CPU simulation with actual collision and input vectors. Not GPU FPS, audible or human playtest evidence. Visual opportunity uses line-of-sight, not camera framing.',results},null,2));
