import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {boot,bootControls} from './app-harness.mjs';
import {RenderChunkStream} from '../dist/world.js';

test('optimized final mesh, UV, colour, index and instance buffers match v1.6.1 exactly',()=>{
 const app=boot({autoLoad:false});app.eval('chunkStream.clear()');
 for(const expected of JSON.parse(fs.readFileSync('evidence/geometry-v1.6.1.json'))){
  app.eval(`globalThis.task=createRenderChunk(${expected.x},${expected.z});globalThis.steps=0;while(!task.iterator.next().done)steps++`);
  const meshes=app.eval(`task.value.children.filter(o=>o.isMesh).map(o=>({material:Object.keys(mat).find(k=>mat[k]===o.material),position:o.position.toArray(),count:o.count||0,attributes:Object.entries(o.geometry.attributes).map(([k,v])=>[k,v.array]),index:o.geometry.index?.array,matrix:o.instanceMatrix?.array,color:o.instanceColor?.array}))`);
  const h=createHash('sha256');for(const m of meshes){h.update(JSON.stringify([m.material,m.position,m.count]));for(const[k,a]of m.attributes)h.update(k).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));for(const a of[m.index,m.matrix,m.color])if(a)h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength))}
  assert.equal(meshes.length,expected.meshes);assert.equal(h.digest('hex'),expected.hash);assert(app.eval('steps')>300);
  app.eval('disposeChunk(task.value)');
 }
});

test('newly required regions preempt optional work, then reuse the unfinished iterator',()=>{
 const calls=[];let now=0;
 const stream=new RenderChunkStream({clock:()=>now,dispose(){},create(x,z){return{value:{x,z},iterator:(function*(){for(let i=0;i<4;i++){calls.push(x);now+=1;yield}})()}}});
 stream.request([{x:1,z:0,required:false}],0,0);assert.equal(stream.process(1,20),1);assert.deepEqual(calls,[1]);
 stream.request([{x:0,z:0,required:true},{x:1,z:0,required:false}],0,0);stream.process(1,20);assert.deepEqual(calls,[1,0]);
 while(!stream.requiredReady())stream.process(1,20);
 assert.deepEqual(calls.slice(0,5),[1,0,0,0,0]);stream.process(Infinity,100);assert.equal(calls.filter(x=>x===1).length,4);assert.equal(stream.stats().ready,2);
});

test('CPU scheduler checks its deadline after every yielded surface and respects max steps',()=>{
 let now=0,steps=0;
 const stream=new RenderChunkStream({clock:()=>now,dispose(){},create(){return{value:{},iterator:(function*(){while(true){steps++;now+=.4;yield}})()}}});
 stream.request([{x:0,z:0,required:true}],0,0);
 assert.equal(stream.process(3,100),8);assert.equal(steps,8);assert(now<3.5);
 assert.equal(stream.process(Infinity,5),5);stream.clear();assert.equal(stream.stats().resident,0);
});

test('continuous touch-look keeps pointer capture, held movement and simulation alive after readiness',()=>{
 const app=bootControls();app.element('start').onclick();app.frame(100);
 app.dispatch('look','pointerdown',{pointerId:7,clientX:0,clientY:0,preventDefault(){}});
 app.eval('keys.add("KeyW")');const before=app.eval('game.elapsed');
 for(let i=1;i<=128;i++){
  app.dispatch('look','pointermove',{pointerId:7,clientX:i*40,clientY:Math.sin(i)*60});app.frame(100+i*16);
  assert.equal(app.eval('worldLoading'),false);assert.equal(app.eval('touch.look'),7);assert.equal(app.captured.get(7),'look');assert.equal(app.eval('keys.has("KeyW")'),true);
 }
 assert(app.eval('game.elapsed')>before+1.9);assert.equal(app.element('world-loading').hidden,true);
});

test('moving and teleporting keep the actual visibility stream and data cache bounded',()=>{
 const app=bootControls();app.element('start').onclick();
 for(let i=0;i<100;i++){
  app.eval(`game.player.x=${i*113-5000+.27};game.player.z=${i*-83+2000+.31};updateStreamView()`);app.settle();
  assert.equal(app.eval('worldLoading'),false);assert(app.eval('chunkStream.stats().resident')<=49);assert(app.eval('game.world.stats().resident')<=16);assert(app.eval('mazeGroup.children.length')<=49);
 }
});
