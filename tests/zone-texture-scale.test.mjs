import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.min.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {applyWorldScaleTextures} from '../dist/zone-texture-scale.js';
import {loadZoneVisual,disposeZoneVisual} from '../dist/zone-render.js';
const nativeFetch=globalThis.fetch;
globalThis.self=globalThis;globalThis.ProgressEvent=class{constructor(t,o){Object.assign(this,o)}};
globalThis.createImageBitmap=async()=>({width:256,height:256,close(){}});
globalThis.fetch=async i=>{const u=typeof i==='string'?i:i.url;return u.startsWith('file:')?new Response(await readFile(new URL(u))):nativeFetch(i)};
const loader=new GLTFLoader();
async function model(name){return (await loader.loadAsync(new URL(`../dist/assets/level1/${name}.glb`,import.meta.url).href)).scene;}
function verifyDensity(root){
 root.updateMatrixWorld(true);let count=0;
 root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.userData.worldTextureMetres)return;
  const g=mesh.geometry,p=g.attributes.position,u=g.attributes.uv;
  const idx=g.index;const n=idx?.count??p.count;
  for(let i=0;i<n;i+=3){
   const ids=[0,1,2].map(k=>idx?idx.getX(i+k):i+k);
   const v=ids.map(k=>new THREE.Vector3().fromBufferAttribute(p,k).applyMatrix4(mesh.matrixWorld));
   const normal=new THREE.Vector3().crossVectors(v[1].clone().sub(v[0]),v[2].clone().sub(v[0])).normalize();
   if(Math.max(Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z))<.99999)continue; // tiny authored bevels have planar projection
   for(let k=0;k<3;k++){
    const a=ids[k],b=ids[(k+1)%3],metres=v[k].distanceTo(v[(k+1)%3]);
    const uvLength=Math.hypot(u.getX(a)-u.getX(b),u.getY(a)-u.getY(b));
    assert.ok(Math.abs(uvLength-metres/2)<.00002,`${mesh.name}: ${metres}m / ${uvLength} tiles`);
   }count++;
  }
 });assert.ok(count>0);return count;
}
test('real 4m kit supports 2–32m walls, anisotropic floors, nested rotation and scale at 2m/tile',async()=>{
 const root=new THREE.Group();
 const wall=await model('modules/concrete-wall-4m'),floor=await model('modules/concrete-floor-4m');
 for(const width of [2,4,12,16,32]){
  const w=wall.clone(true);w.position.set(width,0,-width);w.rotation.y=Math.PI/2;w.scale.set(width/4,1,1);root.add(w);
  const f=floor.clone(true);f.scale.set(width/4,1,3);f.position.y=4.2;root.add(f);
 }
 const nested=new THREE.Group();nested.rotation.y=Math.PI/2;nested.scale.set(2,1,3);nested.add(wall.clone(true));root.add(nested);
 applyWorldScaleTextures(root);verifyDensity(root);
 disposeZoneVisual(root);
});
test('world texture phase matches across neighboring module boundaries, including negative coordinates',async()=>{
 const root=new THREE.Group(),base=await model('modules/concrete-floor-4m');
 for(const x of [-4,0,4]){const slab=base.clone(true);slab.position.x=x;root.add(slab)}
 applyWorldScaleTextures(root);const positions=new Map();let matching=0;
 root.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position,u=o.geometry.attributes.uv;
 for(let i=0;i<p.count;i++){const v=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);if(Math.abs(v.y)>.0001||o.geometry.attributes.normal.getY(i)<.99)continue;const key=v.toArray().map(x=>x.toFixed(4)).join(',');const value=[u.getX(i),u.getY(i)];if(positions.has(key)){const previous=positions.get(key);for(let a=0;a<2;a++){const delta=value[a]-previous[a];assert.ok(Math.abs(delta-Math.round(delta))<1e-6,'same repeat phase at shared boundary')}matching++}else positions.set(key,value)} });
 assert.ok(matching>6);disposeZoneVisual(root);
});
test('actual hall, ceilings, columns and every assembled expansion use isotropic 2m/tile mapping',async()=>{
 const root=await loadZoneVisual('level1');assert.ok(verifyDensity(root)>100);disposeZoneVisual(root);
 const column=await model('modules/concrete-column');column.scale.set(2,1.5,3);applyWorldScaleTextures(column);verifyDensity(column);disposeZoneVisual(column);
});
test('labels, atlas-like mixed materials, wood and metal retain original UVs and texture transforms',()=>{
 for(const name of ['Green safety sign','Warm oak planks','Brushed galvanized steel','Shipping label']){
  const map=new THREE.Texture();map.repeat.set(.5,.25);const m=new THREE.MeshStandardMaterial({name,map});const g=new THREE.BoxGeometry(3,4,1),mesh=new THREE.Mesh(g,m),before=Array.from(g.attributes.uv.array);
  applyWorldScaleTextures(mesh);assert.strictEqual(mesh.geometry,g);assert.deepEqual(Array.from(g.attributes.uv.array),before);assert.deepEqual(map.repeat.toArray(),[.5,.25]);
 }
 const g=new THREE.BoxGeometry(),mesh=new THREE.Mesh(g,[new THREE.MeshStandardMaterial({name:'Concrete warm aggregate',map:new THREE.Texture()}),new THREE.MeshStandardMaterial({name:'Shipping label',map:new THREE.Texture()})]);applyWorldScaleTextures(mesh);assert.strictEqual(mesh.geometry,g);
});
test('shared templates become independent UV buffers without new textures/materials or triangles',async()=>{
 const root=new THREE.Group(),base=await model('modules/concrete-wall-4m');root.add(base.clone(true),base.clone(true));root.children[1].scale.x=4;
 let old,material;root.traverse(o=>{if(o.isMesh){old=o.geometry;material=o.material}});let disposed=0;old.addEventListener('dispose',()=>disposed++);
 const beforeTriangles=(old.index?.count??old.attributes.position.count)/3;const result=applyWorldScaleTextures(root);assert.equal(disposed,1);assert.equal(result.triangles,beforeTriangles*2);
 const meshes=[];root.traverse(o=>{if(o.isMesh)meshes.push(o)});assert.notStrictEqual(meshes[0].geometry,meshes[1].geometry);assert.strictEqual(meshes[0].material,material);assert.strictEqual(meshes[1].material,material);verifyDensity(root);disposeZoneVisual(root);
});

test('far-coordinate architecture preserves strict density and repeat phase beyond z=-600',async()=>{
 const root=new THREE.Group(),base=await model('modules/concrete-wall-4m');
 for(const z of [-606,-10000.3]){const w=base.clone(true);w.position.set(120.3,0,z);w.rotation.y=Math.PI/2;w.scale.set(8,1,.75);root.add(w)}
 applyWorldScaleTextures(root);verifyDensity(root);
 root.traverse(o=>{if(!o.isMesh)return;const uv=o.geometry.attributes.uv;assert.ok(Math.max(...uv.array.map(Math.abs))<20,'whole-tile origin keeps Float32 UVs close to zero')});disposeZoneVisual(root);
});
