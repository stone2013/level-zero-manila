import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {createLevelOneEntityVisual, updateLevelOneEntityVisual} from '../dist/level-one-entity-visual.js';
const state = {active:true,x:4,z:-8,yaw:.6,grace:0,proximity:.4,contact:0};
function meshes(root) {const out=[];root.traverse(o=>{if(o.isMesh)out.push(o)});return out;}
function pose(root) {const out=[];root.traverse(o=>out.push([...o.position.toArray(),...o.quaternion.toArray()]));return out;}
test('lurker uses real bounded low-poly meshes without lights, shadows or shared resources',()=>{
 const a=createLevelOneEntityVisual(),b=createLevelOneEntityVisual();
 assert(a instanceof THREE.Group);assert.equal(a.visible,false);
 const parts=meshes(a);let triangles=0;
 a.traverse(o=>assert(!o.isLight));
 for(const m of parts){triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert.equal(m.castShadow,false);assert.equal(m.receiveShadow,false);assert(m.material.emissiveIntensity>0);for(const attr of Object.values(m.geometry.attributes))assert(Array.from(attr.array).every(Number.isFinite));}
 assert(triangles>100&&triangles<1500,`triangle count ${triangles}`);
 for(const m of parts)for(const n of meshes(b)){assert.notEqual(m.geometry,n.geometry);assert.notEqual(m.material,n.material)}
 updateLevelOneEntityVisual(a,{...state,x:0,z:0,yaw:0},0);
 const box=new THREE.Box3().setFromObject(a);assert(box.min.y>=-.001);assert(box.max.y>2&&box.max.y<2.5);assert(box.max.x-box.min.x<1.3);
 assert(a.getObjectByName('single-ivory-eye-slit'));assert.equal(parts.length,17);
});
test('ground transform is parent-relative and arrival smoothly fades over two seconds',()=>{
 const root=createLevelOneEntityVisual(),parent=new THREE.Group();parent.position.set(10,3,20);parent.add(root);
 for(const [grace,opacity] of [[2,0],[1,.5],[0,1],[-3,1],[4,0]]){updateLevelOneEntityVisual(root,{...state,grace},0);assert.equal(root.visible,true);assert.deepEqual(root.position.toArray(),[4,0,-8]);assert.equal(root.rotation.y,-.6);for(const m of meshes(root)){assert.equal(m.material.opacity,opacity);assert.equal(m.material.depthWrite,opacity===1)}}
 parent.updateMatrixWorld(true);assert.deepEqual(root.getWorldPosition(new THREE.Vector3()).toArray(),[14,3,12]);
 updateLevelOneEntityVisual(root,{...state,active:false},1);assert.equal(root.visible,false);
 updateLevelOneEntityVisual(root,null,2);assert.equal(root.visible,false);
});
test('pose is deterministic from elapsed, freezes cleanly, and reset has no accumulated motion',()=>{
 const root=createLevelOneEntityVisual();updateLevelOneEntityVisual(root,state,2);const before=pose(root);updateLevelOneEntityVisual(root,state,2);assert.deepEqual(pose(root),before);
 updateLevelOneEntityVisual(root,state,3);assert.notDeepEqual(pose(root),before);updateLevelOneEntityVisual(root,state,2);assert.deepEqual(pose(root),before);
 updateLevelOneEntityVisual(root,{...state,x:NaN,yaw:Infinity},NaN);assert(pose(root).flat().every(Number.isFinite));
});
test('zone-root traversal can dispose all entity resources without affecting another instance',()=>{
 const zone=new THREE.Group(),a=createLevelOneEntityVisual(),b=createLevelOneEntityVisual();zone.add(a);let geometryDisposals=0,materialDisposals=0,otherDisposals=0;
 for(const m of meshes(a)){m.geometry.addEventListener('dispose',()=>geometryDisposals++);m.material.addEventListener('dispose',()=>materialDisposals++)}
 for(const m of meshes(b)){m.geometry.addEventListener('dispose',()=>otherDisposals++);m.material.addEventListener('dispose',()=>otherDisposals++)}
 zone.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose()}});assert.equal(geometryDisposals,meshes(a).length);assert.equal(materialDisposals,meshes(a).length);assert.equal(otherDisposals,0);
});

test('eye-facing direction matches simulation movement at all cardinal headings',()=>{
 const root=createLevelOneEntityVisual();
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){updateLevelOneEntityVisual(root,{...state,yaw},0);const forward=new THREE.Vector3(0,0,-1).applyQuaternion(root.quaternion);assert(Math.abs(forward.x-Math.sin(yaw))<1e-9);assert(Math.abs(forward.z+Math.cos(yaw))<1e-9)}
});
