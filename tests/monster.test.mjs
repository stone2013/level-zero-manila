import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as THREE from '../dist/vendor/three.module.min.js';
import {createCableMonster,CABLE_MONSTER_CLIPS} from '../dist/monster.js';
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
test('approved V2 is one low-poly skinned mesh with expected dimensions and clips',()=>{
 const m=createCableMonster(THREE),mesh=m.root.children[0];assert(mesh.isSkinnedMesh);assert.equal(mesh.geometry.index.count/3,8260);assert.equal(mesh.skeleton.bones.length,16);assert.equal(m.root.children.length,1);assert.equal(m.root.visible,false);assert.equal(m.root.userData.modelStats.revision,2);
 const b=m.root.userData.nativeBounds;assert(b.max[1]<3.06&&b.max[1]>3.05);assert(b.max[0]-b.min[0]<2.1);assert.deepEqual(Object.keys(CABLE_MONSTER_CLIPS),['idle','walk','chase_run','jumpscare']);m.dispose();
});
test('runtime never takes over gameplay world position orientation or scale',()=>{
 const m=createCableMonster(THREE);m.root.position.set(17,2,-9);m.root.rotation.set(.02,1.4,.05);m.root.scale.setScalar(.9);const pos=m.root.position.clone(),q=m.root.quaternion.clone(),scale=m.root.scale.clone();
 for(const clip of Object.keys(CABLE_MONSTER_CLIPS))for(let i=0;i<200;i++){m.update(1/60,{clip,speed:1.3,active:true});assert(m.root.position.equals(pos));assert(m.root.quaternion.equals(q));assert(m.root.scale.equals(scale));}
 m.dispose();
});
test('different clips, hidden freeze, single-shot end and disposal are deterministic',()=>{
 const m=createCableMonster(THREE);m.update(.016,{clip:'walk',active:true});const t=m.update(.016,{clip:'walk',active:false}).time;for(let i=0;i<20;i++)near(m.update(.02,{clip:'walk',active:false}).time,t);
 assert.equal(m.root.visible,false);for(let i=0;i<180;i++)m.update(1/60,{clip:'jumpscare',active:true});const s=m.update(.1,{clip:'jumpscare',active:true});assert(s.finished);near(s.time,2.6);near(m.root.position.z,0);m.update(.02,{clip:'walk',active:true});assert(!m.root.userData.animationState.finished);assert(m.root.userData.animationState.time<.1);
 const parent=new THREE.Group();parent.add(m.root);m.dispose();m.dispose();assert.equal(parent.children.length,0);assert.equal(m.root.children.length,0);assert(!m.update(.01,{active:true}).active);
});
test('clip transitions and steady poses preserve finite bounded skin with no floor penetration',()=>{
 const m=createCableMonster(THREE),mesh=m.root.children[0],g=mesh.geometry,p=new THREE.Vector3();
 for(const clip of ['walk','chase_run','jumpscare','idle','chase_run','walk'])for(let i=0;i<180;i++){
  m.update(1/60,{clip,active:true,speed:1});let minY=Infinity,max=0;
  for(let j=0;j<g.attributes.position.count;j++){p.fromBufferAttribute(g.attributes.position,j);mesh.applyBoneTransform(j,p);assert(p.toArray().every(Number.isFinite));minY=Math.min(minY,p.y);max=Math.max(max,Math.abs(p.x),Math.abs(p.y),Math.abs(p.z));}
  assert(minY>=-.00001,`${clip} frame ${i}: floor ${minY}`);assert(max<4);
 }
 m.dispose();
});
test('arguments reject nonfinite motion inputs and zero speed freezes playback',()=>{
 const m=createCableMonster(THREE);assert.throws(()=>m.update(NaN));assert.throws(()=>m.update(-1));assert.throws(()=>m.update(.1,{speed:Infinity}));assert.throws(()=>m.update(.1,{clip:'unknown'}));m.update(.1,{clip:'walk'});const t=m.update(.1,{speed:0}).time;near(m.update(.1,{speed:0}).time,t);m.dispose();
});
