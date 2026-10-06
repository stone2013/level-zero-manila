// Reproducible production CPU benchmark. No GPU, browser FPS, or phone claim.
import {performance} from 'node:perf_hooks';
import fs from 'node:fs';
import {boot} from '../tests/app-harness.mjs';
const repeats=Number(process.env.REPEATS||5),locations=[[0,0],[2,-1],[-3,4],[285,-286]];
const app=boot({autoLoad:false});app.context.benchNow=()=>performance.now();
app.eval(`chunkStream.clear();globalThis.measure={layout:0,bake:0,samples:0,merge:0};
const realCells=game.world.cellsInRect.bind(game.world);game.world.cellsInRect=(...a)=>{const t=benchNow();const v=realCells(...a);measure.layout+=benchNow()-t;return v};
const originalBake=createLightBake;createLightBake=(...a)=>{const b=originalBake(...a),sample=b.sample;b.sample=(...s)=>{const t=benchNow();const v=sample(...s);measure.bake+=benchNow()-t;measure.samples++;return v};return b};
for(const name of ['batchBakedSurfaces','batchCeilingPanels','batchStaticBoxes']){const f=globalThis[name];globalThis[name]=f.constructor.name==='GeneratorFunction'?function*(...a){const it=f(...a);while(true){const t=benchNow();const n=it.next();measure.merge+=benchNow()-t;if(n.done)return;yield n.value}}:(...a)=>{const t=benchNow();const v=f(...a);measure.merge+=benchNow()-t;return v}}`);
const cases=[];
for(let r=-1;r<repeats;r++)for(const [x,z] of locations){
 app.eval(`game.world.cache.clear();measure={layout:0,bake:0,samples:0,merge:0};globalThis.task=createRenderChunk(${x},${z})`);
 const steps=[];let done=false;const start=performance.now();
 while(!done){const t=performance.now();done=app.eval('task.iterator.next().done');steps.push(performance.now()-t)}
 const elapsed=performance.now()-start,measure=app.eval('({...measure})');
 const geometry=app.eval(`(()=>{let bytes=0,vertices=0,triangles=0,draws=0;task.value.traverse(o=>{if(!o.isMesh)return;draws++;vertices+=o.geometry.attributes.position.count*(o.isInstancedMesh?o.count:1);triangles+=(o.geometry.index?.count||0)/3*(o.isInstancedMesh?o.count:1);for(const a of Object.values(o.geometry.attributes))bytes+=a.array.byteLength;bytes+=o.geometry.index?.array.byteLength||0;bytes+=o.instanceMatrix?.array.byteLength||0;bytes+=o.instanceColor?.array.byteLength||0});return{bytes,vertices,triangles,draws}})()`);
 if(r>=0)cases.push({repeat:r,x,z,totalMs:elapsed,layoutMs:measure.layout,bakeMs:measure.bake,meshAndOtherMs:elapsed-measure.layout-measure.bake,mergeMs:measure.merge,samples:measure.samples,steps:steps.length,maxStepMs:Math.max(...steps),p95StepMs:steps.toSorted((a,b)=>a-b)[Math.floor(steps.length*.95)],...geometry});
 app.eval('disposeChunk(task.value)');
}
const median=k=>{const v=cases.map(c=>c[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};
console.log(JSON.stringify({label:process.env.LABEL||'current',node:process.version,seed:5,repeats,locations,summary:Object.fromEntries(['totalMs','layoutMs','bakeMs','meshAndOtherMs','mergeMs','maxStepMs','p95StepMs','bytes','samples','steps'].map(k=>[k,median(k)])),worstStepMs:Math.max(...cases.map(c=>c.maxStepMs)),cases},null,2));
