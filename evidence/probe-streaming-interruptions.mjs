// Run from repository root: node evidence/probe-streaming-interruptions.mjs
// Real scheduler and Three.js geometry; DOM/WebGL plumbing is mocked.
// No GPU screenshot, real-device FPS, or allocation profiler claim.
import assert from 'node:assert/strict';
import {RenderChunkStream} from '../dist/world.js';
import {boot} from '../tests/app-harness.mjs';
let state=193746;
const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/2**32};
const created=[], released=[];
const stream=new RenderChunkStream({clock:()=>0,create:(x,z)=>{const value={x,z,steps:0,closed:false,released:false};created.push(value);return{value,iterator:(function*(){try{for(let i=0,n=1+Math.floor(random()*30);i<n;i++){value.steps++;yield}}finally{value.closed=true}})()}},dispose:v=>{assert(!v.released);assert(v.closed);v.released=true;released.push(v)}});
for(let i=0;i<10000;i++){
 const x=Math.floor(random()*24)-12,z=Math.floor(random()*24)-12;
 const points=Array.from({length:1+Math.floor(random()*70)},()=>({x:x+Math.floor(random()*8)-4,z:z+Math.floor(random()*8)-4,required:random()<.6}));
 const old=[...stream.records.entries()],oldRequired=stream.required;
 const accepted=stream.request(points,x*35+.1,z*35+.1);
 if(!accepted){assert.deepEqual([...stream.records.entries()],old);assert.equal(stream.required,oldRequired)}
 stream.process(Infinity,Math.floor(random()*60));
 const records=[...stream.records.values()];assert(records.length<=49);assert(records.filter(r=>r.iterator).length<=1);assert(records.every(r=>!r.value?.released));
 assert.equal(stream.requiredReady(),[...stream.required].every(k=>stream.records.get(k)?.ready===true));
 if(i%200===0){stream.clear();assert.equal(created.length,released.length)}
}
stream.clear();assert.equal(created.length,released.length);
console.log('Random scheduler requests passed',JSON.stringify({requests:10000,created:created.length,released:released.length,maxResident:stream.maxResident}));
const app=boot({autoLoad:false});
app.eval(`globalThis.audit={created:0,released:0};const createForAudit=chunkStream.create,disposeForAudit=chunkStream.dispose;chunkStream.create=(x,z)=>{audit.created++;return createForAudit(x,z)};chunkStream.dispose=g=>{if(g.userData.auditDisposed)throw Error('double disposal');g.userData.auditDisposed=true;audit.released++;disposeForAudit(g)};`);
for(let i=0;i<35;i++){
 const x=(i%2?-1:1)*(i+1)*105+.1,z=(i+1)*70+.1;
 app.eval(`hasRun=true;game.player.x=${x};game.player.z=${z};game.player.yaw=${i*Math.PI/8};updateStreamView();chunkStream.process(Infinity,${(i*73)%260+1});updateStreamView()`);
 assert(app.eval('mazeGroup.children.length<=49&&chunkStream.stats().resident<=49&&game.world.stats().resident<=16'));
 assert(app.eval('mazeGroup.children.every(g=>!g.userData.auditDisposed)'));
 assert.equal(app.eval('mazeGroup.children.length'),app.eval('[...chunkStream.records.values()].filter(r=>r.value).length'));
 assert(app.eval('[...chunkStream.records.values()].filter(r=>r.iterator).length<=1'));
}
app.settle();assert.equal(app.eval('worldLoading'),false);app.eval('chunkStream.clear()');
assert.equal(app.eval('mazeGroup.children.length'),0);
assert.equal(app.eval('audit.created'),app.eval('audit.released'));
console.log('Actual Three.js geometry interruption requests passed',JSON.stringify(app.eval('audit')));
