import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import {createSupplyModels} from '../dist/assets/supplies/supply-models.js';
import {Game} from '../dist/game.js';
import {bootControls} from './app-harness.mjs';

test('supply geometry is finite, floor-grounded, metre-scale and one opaque draw per item',()=>{
 const models=createSupplyModels();
 for(const kind of ['food','water']){
  const root=models.create(kind),mesh=root.children[0],geometry=mesh.geometry,b=geometry.boundingBox;
  assert.equal(root.children.length,1);assert(mesh.isMesh);assert.equal(mesh.material.transparent,false);assert.equal(mesh.material.map,null);
  for(const attr of Object.values(geometry.attributes))assert([...attr.array].every(Number.isFinite));
  assert(Math.abs(b.min.y)<1e-7);assert(b.max.y<(kind==='food'?.09:.36));assert(b.max.y>(kind==='food'?.04:.34));
  assert(b.max.x-b.min.x<(kind==='food'?.35:.15));assert(b.max.z-b.min.z<(kind==='food'?.23:.15));
  assert(geometry.attributes.position.count/3<=2000);assert(geometry.boundingSphere.radius<.2);
 }
 assert.throws(()=>models.create('phone'));models.dispose();
});
test('ten supplies share exactly two geometries and one material; dispose is once and reuse is fresh',()=>{
 const models=createSupplyModels(),roots=Array.from({length:10},(_,i)=>models.create(i%2?'food':'water'));
 const meshes=roots.map(r=>r.children[0]),geometries=new Set(meshes.map(m=>m.geometry)),materials=new Set(meshes.map(m=>m.material));
 assert.equal(geometries.size,2);assert.equal(materials.size,1);let disposed=0;
 for(const r of [...geometries,...materials])r.addEventListener('dispose',()=>disposed++);
 models.dispose();models.dispose();assert.equal(disposed,3);
 assert(!geometries.has(models.create('water').children[0].geometry));models.dispose();
});
test('visual creation cannot mutate inventory, pickup radius, collision, IDs or survival',()=>{
 const g=new Game(42);g.start();const before=JSON.stringify(g),models=createSupplyModels();
 for(const item of g.items.filter(i=>i.kind!=='phone'))models.create(item.kind);
 assert.equal(JSON.stringify(g),before);
 assert.deepEqual(g.itemSize('food-1'),{w:1,h:1});assert.deepEqual(g.itemSize('water-1'),{w:1,h:2});
 g.player.x=g.maze.doorX+3.6;g.player.z=g.maze.doorZ-.65;assert.equal(g.pickupItem('water-1'),'water-1');assert(g.drop('water-1'));
 const item=g.items.find(i=>i.id==='water-1');assert(!g.collides(item.x,item.z));assert.equal(g.pickupItem('water-1'),'water-1');
 assert.equal(new Set(g.items.map(i=>i.id)).size,g.items.length);models.dispose();
});
test('app rebuild disposes shared supply resources once and preserves phone construction',()=>{
 const app=bootControls();const meshes=app.eval("[...itemMeshes.values()].flatMap(g=>g.children).filter(o=>o.userData.sharedSupply)");
 assert.equal(meshes.length,6);const resources=new Set(meshes.flatMap(m=>[m.geometry,m.material]));let count=0;for(const r of resources)r.addEventListener('dispose',()=>count++);
 app.eval('build()');assert.equal(count,3);assert.equal(app.eval("itemMeshes.get('phone-1').children.length"),3);
 assert.equal(app.eval("[...itemMeshes.values()].filter(g=>g.children[0]?.userData.sharedSupply).length"),6);
});
test('offline cache includes supply module and candidate version',()=>{
 const sw=fs.readFileSync('dist/sw.js','utf8');assert(sw.includes('./assets/supplies/supply-models.js'));assert(sw.includes('demo-v1.0-rc1'));
});
