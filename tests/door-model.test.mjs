import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../dist/vendor/three.module.min.js';
import {bootControls} from './app-harness.mjs';
const source=fs.readFileSync('dist/app.js','utf8');
function model(){
 const mat={doorWood:new THREE.MeshLambertMaterial({color:0x665033,vertexColors:true}),doorMetal:new THREE.MeshLambertMaterial({color:0x78684c,vertexColors:true})},context={THREE,mat};vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('// MANILA_DOOR_MODEL_BEGIN'),source.indexOf('// MANILA_DOOR_MODEL_END')),context);
 const room=new THREE.Group(),m={doorX:55,doorZ:17.5},pivot=context.makeManilaDoor(room,m),frame=room.children.find(o=>o!==pivot);return{room,pivot,frame,mat,m};
}
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const parts=g=>g.userData.doorParts;
test('Manila joinery retains the original leaf envelope, pin and full-height opening',()=>{
 const{pivot,frame,m,mat}=model();near(pivot.position.x,m.doorX);near(pivot.position.y,0);near(pivot.position.z,m.doorZ-.8);
 const bounds=pivot.children.find(o=>o.material===mat.doorWood).geometry.boundingBox;near(bounds.min.x,-.055);near(bounds.max.x,.055);near(bounds.min.y,0);near(bounds.max.y,2.56);near(bounds.min.z,0);near(bounds.max.z,1.6);
 const structural=parts(frame).filter(p=>p.name.startsWith('frame '));assert.equal(structural.length,8);
 for(const part of structural){assert(part.min[0]>=-.175001&&part.max[0]<=.055001);assert(part.min[1]>=-.000001&&part.max[1]<=2.790001);assert(part.min[2]>=-.210001&&part.max[2]<=1.810001);assert(part.min[1]>=2.609999||part.max[2]<=-.009999||part.min[2]>=1.609999,'no casing or threshold crosses the original clear opening')}
});
test('four panels are genuinely recessed on both faces with outward bevel normals',()=>{
 const{pivot,mat}=model(),wood=pivot.children.find(o=>o.material===mat.doorWood);const centres=parts(pivot).filter(p=>p.name.endsWith('recessed centre'));assert.equal(centres.length,4);for(const p of centres){near(p.min[0],-.026);near(p.max[0],.026)}
 const bevels=parts(pivot).filter(p=>p.name.includes(' bevel '));assert.equal(bevels.length,32);
 let triangleOffset=0;for(const p of parts(pivot).filter(p=>p.material==='wood')){if(p.name.includes(' bevel ')){const side=p.name.includes(' -1 bevel ')?-1:1;for(let i=triangleOffset*3;i<(triangleOffset+p.triangles)*3;i++){const index=wood.geometry.index.getX(i);assert(wood.geometry.attributes.normal.getX(index)*side>0)}}triangleOffset+=p.triangles}
});
test('handles and moving hinge leaves stay rigidly attached at closed, partial and fully open angles',()=>{
 const{room,pivot,frame,m}=model();const hardware=parts(pivot).filter(p=>p.name.startsWith('handle')||p.name.includes(' leaf '));assert(hardware.length>=20);assert(parts(pivot).filter(p=>p.name.includes('lever')).every(p=>p.min[2]>1.3&&p.max[2]<1.54));
 const fixedBefore=new THREE.Box3().setFromObject(frame).clone();
 for(const angle of [0,Math.PI/8,Math.PI/4,3*Math.PI/8,Math.PI/2]){
  pivot.rotation.y=angle;room.updateMatrixWorld(true);const endpoint=pivot.localToWorld(new THREE.Vector3(0,1.28,1.6));near(endpoint.x,m.doorX+Math.sin(angle)*1.6);near(endpoint.z,m.doorZ-.8+Math.cos(angle)*1.6);
  for(const p of hardware){const local=new THREE.Vector3().fromArray(p.min),world=pivot.localToWorld(local.clone()),roundtrip=pivot.worldToLocal(world.clone());near(roundtrip.distanceTo(local),0)}
  const fixed=new THREE.Box3().setFromObject(frame);near(fixed.min.distanceTo(fixedBefore.min),0);near(fixed.max.distanceTo(fixedBefore.max),0);
  for(const y of [.30,1.28,2.26])near(pivot.localToWorld(new THREE.Vector3(0,y,0)).distanceTo(new THREE.Vector3(m.doorX,y,m.doorZ-.8)),0);
 }
 assert.equal(parts(frame).filter(p=>p.name.includes('knuckle')).length,9);assert.equal(parts(pivot).filter(p=>p.name.includes('knuckle')).length,6);
});
test('door model is four draw calls with bounded geometry and finite baked wood grain',()=>{
 const{room,pivot,frame,mat}=model();let draws=0,triangles=0;room.traverse(o=>{if(!o.isMesh)return;draws++;triangles+=o.geometry.index.count/3;for(const a of Object.values(o.geometry.attributes))assert(Array.from(a.array).every(Number.isFinite));assert(o.geometry.boundingSphere.radius>0)});assert.equal(draws,4);assert(triangles<6000,`door triangles: ${triangles}`);
 for(const g of [pivot,frame]){const colors=g.children.find(o=>o.material===mat.doorWood).geometry.attributes.color.array;assert(Math.max(...colors)-Math.min(...colors)>.1);assert(Math.min(...colors)>.75);assert(Math.max(...colors)<1.15)}
 for(const material of Object.values(mat)){assert.equal(material.map,null);assert.equal(material.emissive.getHex(),0);assert(material.isMeshLambertMaterial)}
});
test('app connects the refined leaf to the unchanged door animation and keeps it after space change',()=>{
 const app=bootControls();for(const value of [0,.25,.5,.75,1]){app.eval(`game.door=${value};sync()`);near(app.eval('doorPivot.rotation.y'),value*Math.PI/2)}
 assert.equal(app.eval('doorPivot.parent'),app.eval('roomGroup'));app.eval('game.changed=true;sync()');assert.equal(app.eval('roomGroup.visible'),true);assert.equal(app.eval('doorPivot.parent'),app.eval('roomGroup'));assert.equal(app.eval('mat.wood.color.getHex()'),0x665033);assert.equal(app.eval('mat.panel.color.getHex()'),0x4b3a26);
});
