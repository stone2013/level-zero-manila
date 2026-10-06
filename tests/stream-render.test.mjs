import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './app-harness.mjs';

// This executes the shipped application and real Three.js geometry, with mocked
// DOM/WebGL plumbing. It is intentionally not an FPS or screenshot claim.
test('actual app freezes initial and restarted exploration until the full clear view is ready',()=>{
 const app=boot({autoLoad:false});assert.equal(app.eval('worldLoading'),true);assert.equal(app.element('start').disabled,true);assert.equal(app.eval('worldRendered'),false);assert.equal(app.eval('scene.fog.far'),80);
 const before=app.eval('game.elapsed');app.frame(100);assert.equal(app.eval('game.elapsed'),before);assert.equal(app.getRender(),undefined);
 app.settle();assert.equal(app.eval('worldLoading'),false);app.element('start').onclick();assert.equal(app.eval('worldLoading'),true);assert.equal(app.eval('game.mode'),'playing');
 app.frame(200);assert.equal(app.eval('game.elapsed'),0);assert.equal(app.eval('game.food'),100);assert.equal(app.eval('game.hydration'),100);
 app.settle();app.frame(300);assert.equal(app.eval('worldLoading'),false);assert.equal(app.eval('worldRendered'),true);assert(app.eval('game.elapsed')>0);assert.equal(app.getRender().camera.far,65);
});

test('real chunk unload disposes owned geometries/instance buffers, never shared assets or Manila',()=>{
 const app=boot();app.element('start').onclick();
 app.eval(`globalThis.ownership={geometry:0,instances:0,shared:0};globalThis.originalRoom=roomGroup;globalThis.originalDoor=doorPivot;globalThis.originalWater=itemMeshes.get('water-1');globalThis.originalItems=game.items;globalThis.originalIds=game.items.map(i=>i.id).join(',');
 boxGeo.addEventListener('dispose',()=>ownership.shared++);for(const m of Object.values(mat))m.addEventListener('dispose',()=>ownership.shared++);
 const old=mazeGroup.children.find(g=>g.visible);globalThis.oldChunk=old;const seen=new Set();old.traverse(o=>{if(o.isInstancedMesh)o.addEventListener('dispose',()=>ownership.instances++);if(o.geometry&&o.geometry!==boxGeo&&!seen.has(o.geometry)){seen.add(o.geometry);o.geometry.addEventListener('dispose',()=>ownership.geometry++)}});globalThis.ownedGeometryCount=seen.size;
 game.drop('food-1');globalThis.markerSnapshot=JSON.stringify(game.items.find(i=>i.id==='food-1'));`);
 for(let step=1;step<=40;step++){
  const x=step%2?step*255:-step*255,z=-step*270;
  app.eval(`game.player.x=${x+2.5};game.player.z=${z+2.5};chunkStream.update(game.player.x,game.player.z);while(!chunkStream.readyAt(game.player.x,game.player.z))chunkStream.process(10,100)`);
  assert(app.eval('chunkStream.stats().resident')<=25);assert(app.eval('mazeGroup.children.length')<=25);assert(app.eval('game.world.stats().resident')<=16);
 }
 assert.equal(app.eval('oldChunk.parent'),null);assert.equal(app.eval('oldChunk.children.length'),0);
 assert.equal(app.eval('ownership.geometry'),app.eval('ownedGeometryCount'));assert(app.eval('ownership.instances')>0);assert.equal(app.eval('ownership.shared'),0);
 assert.equal(app.eval('roomGroup===originalRoom&&doorPivot===originalDoor&&itemMeshes.get("water-1")===originalWater'),true);
 assert.equal(app.eval('game.items===originalItems&&game.items.map(i=>i.id).join(",")===originalIds'),true);
 assert.equal(app.eval('JSON.stringify(game.items.find(i=>i.id==="food-1"))===markerSnapshot'),true);
 assert.equal(app.eval('game.inRoom()'),false);assert.equal(app.eval('game.entered||game.changed'),false);
 app.eval('game.player.x=27.5;game.player.z=27.5;chunkStream.update(27.5,27.5);while(!chunkStream.readyAt(27.5,27.5))chunkStream.process(10,100);sync()');
 assert.equal(app.eval('itemMeshes.get("food-1").visible'),true);assert.equal(app.eval('game.pickupItem("food-1")'),'food-1');
 app.eval('game.food=50;game.consume("food","food-1");sync()');assert.equal(app.eval('itemMeshes.get("food-1").visible'),false);
 app.element('restart').onclick();assert.equal(app.eval('ownership.shared'),0);assert.equal(app.eval('game.world.stats().resident<=16&&chunkStream.stats().resident<=49'),true);
});

test('10 km render coordinates, UVs, and camera rebasing stay small while world items remain absolute',()=>{
 const app=boot();app.element('start').onclick();
 app.eval('game.player.x=10002.5;game.player.z=-10002.5;chunkStream.update(game.player.x,game.player.z);while(!chunkStream.readyAt(game.player.x,game.player.z))chunkStream.process(10,100)');
 app.frame(100);
 const result=app.eval(`(()=>{let maxPosition=0,maxUV=0,maxMatrix=0;const group=mazeGroup.children.find(g=>g.visible);group.traverse(o=>{if(o.isMesh&&[mat.wall,mat.floor].includes(o.material)){for(const v of o.geometry.attributes.position.array)maxPosition=Math.max(maxPosition,Math.abs(v));for(const v of o.geometry.attributes.uv.array)maxUV=Math.max(maxUV,Math.abs(v))}if(o.isInstancedMesh){const matrix=new THREE.Matrix4();for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);maxMatrix=Math.max(maxMatrix,Math.abs(matrix.elements[12]),Math.abs(matrix.elements[14]))}}});return{maxPosition,maxUV,maxMatrix,cameraX:camera.position.x,cameraZ:camera.position.z,worldX:camera.position.x-scene.position.x,worldZ:camera.position.z-scene.position.z}})()`);
 assert(result.maxPosition<41);assert(result.maxUV<30);assert(result.maxMatrix<40);assert(Math.abs(result.cameraX)<35&&Math.abs(result.cameraZ)<35);assert.equal(result.worldX,10002.5);assert.equal(result.worldZ,-10002.5);
});

test('actual frame freezes chunk work in background and portrait without changing simulation',()=>{
 const app=boot({autoLoad:false});
 const before=app.eval('JSON.stringify(chunkStream.stats())');app.context.document.hidden=true;app.frame(1000);assert.equal(app.eval('JSON.stringify(chunkStream.stats())'),before);
 app.context.document.hidden=false;app.rotate(390,844);app.frame(2000);assert.equal(app.eval('JSON.stringify(chunkStream.stats())'),before);
 app.rotate(844,390);for(let t=2016;t<2400;t+=16)app.frame(t);assert.equal(app.eval('[...chunkStream.records.values()].some(r=>r.iterator||r.ready)'),true);
});
