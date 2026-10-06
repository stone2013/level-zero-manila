// CPU/scene probe only. No WebGL context, real phone frame rate or heat claim.
import {performance} from 'node:perf_hooks';
import {boot} from '../tests/app-harness.mjs';
const app=boot();app.element('start').onclick();app.eval('game.elapsed=479.99');let now=0;
while(app.eval('game.escape.phase')!=='loading'){app.frame(now+=50)}
const begin=performance.now();app.settle();const generationMs=performance.now()-begin;app.frame(now+=50);
const geometry=app.eval(`(()=>{let entityDraws=0,entityTriangles=0,routeDraws=0,routeTriangles=0;monsterVisual.root.traverse(o=>{if(o.isMesh){entityDraws++;entityTriangles+=o.geometry.index.count/3}});routeDraws=1;routeTriangles=escapeMarks.geometry.attributes.position.count/3*escapeMarks.count;return{entityDraws,entityTriangles,routeDraws,routeTriangles,realLights:scene.children.filter(o=>o.isLight).length,dataCache:game.world.stats(),render:chunkStream.stats(),escapeCells:game.escape.layout.cells.length}})()`);
let blockingLoads=0;const before=app.eval('chunkStream.completed');for(let i=0;i<128;i++){app.eval(`game.player.yaw=${i*Math.PI/16};game.player.pitch=${Math.sin(i)*1.1};updateStreamView()`);if(app.eval('worldLoading'))blockingLoads++;app.settle()}
const t=performance.now();app.eval(`for(let i=0;i<1000;i++)monsterVisual.update(1/60,{clip:'chase_run',active:true})`);const animation1000Ms=performance.now()-t;
console.log(JSON.stringify({environment:'Node with real Three.js scene objects, mocked renderer; not GPU',destinationQueuedWorkCpuMs:generationMs,animation1000Ms,meanAnimationMs:animation1000Ms/1000,turnChecks:128,blockingLoads,newRegions:app.eval('chunkStream.completed')-before,...geometry},null,2));
