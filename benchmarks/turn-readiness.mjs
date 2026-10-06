// Production selector + scheduler with empty render tasks. Measures reload events
// and region churn, not generation CPU time or FPS. Same test on both versions.
import {bootControls} from '../tests/app-harness.mjs';
const app=bootControls();app.element('start').onclick();
const locations=[[27.5,27.5],[37.5,42.5],[57.5,app.eval('game.maze.doorZ')],[10002.5,-10002.5]],cases=[];
for(const[x,z]of locations){
 app.eval(`game.player.x=${x};game.player.z=${z};game.player.yaw=0;updateStreamView()`);app.settle();
 const before=app.eval('chunkStream.completed');let gates=0,peak=0;const required=new Set();
 for(let i=1;i<=128;i++){
  app.eval(`game.player.yaw=${i*Math.PI/16};game.player.pitch=${Math.sin(i)*1.1};updateStreamView()`);
  if(app.eval('worldLoading'))gates++;
  for(const key of app.eval('[...chunkStream.required]'))required.add(key);
  peak=Math.max(peak,app.eval('chunkStream.records.size'));app.settle();
 }
 cases.push({x,z,turns:4,checks:128,blockingLoads:gates,newRegions:app.eval('chunkStream.completed')-before,requiredRegionUnion:required.size,peakResident:peak});
}
console.log(JSON.stringify({label:process.env.LABEL||'current',seed:42,width:844,height:390,cases},null,2));
