import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {makeEscapeLayout} from '../dist/escape.js';
import {CELL} from '../dist/game.js';
import {bootControls} from './app-harness.mjs';

const near=(a,b,eps=1e-6)=>assert(Math.abs(a-b)<eps,`${a} != ${b}`);
function marks(){
 const app=bootControls(),layout=makeEscapeLayout(app.eval('game'));
 app.context.wallArrowLayout=layout;
 app.eval('game.escape.layout=wallArrowLayout;syncEscapeVisual()');
 const mesh=app.eval('escapeMarks'),instances=[];
 for(let i=0;i<mesh.count;i++){
  const matrix=new THREE.Matrix4();mesh.getMatrixAt(i,matrix);
  const position=new THREE.Vector3().setFromMatrixPosition(matrix);
  const direction=new THREE.Vector3(1,0,0).transformDirection(matrix);
  const routeIndex=layout.indices.get(Math.floor(position.x/CELL)+','+Math.floor(position.z/CELL));
  instances.push({matrix,position,direction,routeIndex});
 }
 return{app,layout,mesh,instances};
}

test('route paint is one black instanced mesh of vertical arrows at eye height',()=>{
 const{mesh,instances}=marks();
 assert(mesh.isInstancedMesh);assert.equal(mesh.count,84);
 assert.equal(mesh.name,'Escape route black wall arrows');
 assert.equal(mesh.material.color.getHex(),0x101010);
 assert.equal(mesh.material.side,THREE.DoubleSide);
 assert.equal(mesh.material.depthTest,true);
 const positions=mesh.geometry.attributes.position;
 assert.equal(positions.count,9);
 for(let i=0;i<positions.count;i++)near(positions.getZ(i),0);
 for(const {matrix,position} of instances){
  near(position.y,1.55);
  const up=new THREE.Vector3(0,1,0).transformDirection(matrix);near(up.y,1);
  for(let i=0;i<positions.count;i++){
   const vertex=new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix);
   assert(vertex.y>1.2&&vertex.y<1.9,'paint must be on the wall, never the floor');
  }
 }
});

test('every arrow follows the next route leg and sits just in front of an existing wall face',()=>{
 const{layout,instances}=marks(),marked=new Set();
 for(const {position,direction,routeIndex} of instances){
  assert(Number.isInteger(routeIndex),'wall arrow must remain within its route cell');marked.add(routeIndex);
  const p=layout.route[routeIndex],next=layout.route[routeIndex+1]||layout.door;
  const expected=new THREE.Vector3(next.x-p.x,0,next.z-p.z).normalize();
  near(direction.dot(expected),1);
  const cell=layout.lookup.get(Math.floor(p.x/CELL)+','+Math.floor(p.z/CELL));
  const wall=cell.walls.find(w=>w.w>w.d
   ?Math.abs(position.x-p.x)<1e-4&&Math.abs(position.z-(w.z+Math.sign(p.z-w.z)*(w.d/2+.012)))<2e-4
   :Math.abs(position.z-p.z)<1e-4&&Math.abs(position.x-(w.x+Math.sign(p.x-w.x)*(w.w/2+.012)))<2e-4);
  assert(wall,'no arrow may float in an open doorway or be embedded in wallpaper');
  near(wall.w>wall.d?direction.z:direction.x,0);
 }
 assert.equal(marked.size,layout.route.length,'every route cell, including the endpoint, is marked');
});

test('all turns have an approaching player-facing arrow pointing into the open turn',()=>{
 const{layout,instances}=marks();let corners=0;
 for(let i=1;i<layout.route.length-1;i++){
  const p=layout.route[i],before=layout.route[i-1],next=layout.route[i+1];
  const incoming=new THREE.Vector3(p.x-before.x,0,p.z-before.z).normalize();
  const outgoing=new THREE.Vector3(next.x-p.x,0,next.z-p.z).normalize();
  if(incoming.dot(outgoing)>.99)continue;
  corners++;
  const mark=instances.find(m=>m.routeIndex===i&&new THREE.Vector3(m.position.x-p.x,0,m.position.z-p.z).dot(incoming)>2);
  assert(mark,`turn ${i} needs paint on the wall visible before the turn`);
  near(mark.direction.dot(outgoing),1);
  const cell=layout.lookup.get(Math.floor(p.x/CELL)+','+Math.floor(p.z/CELL));
  const exit=outgoing.x>0?1:outgoing.x<0?3:outgoing.z>0?2:0;
  assert.equal(cell.open[exit],true,'the painted turn must lead into a real opening');
 }
 assert.equal(corners,10);
});

test('final arrows point east into the real Manila door and persist during the final approach',()=>{
 const{app,layout,instances}=marks();
 const end=layout.route.at(-1),final=instances.filter(m=>m.routeIndex===layout.route.length-1);
 assert.equal(final.length,2);assert.equal(layout.door.x-end.x,CELL/2);assert.equal(layout.door.z,end.z);
 for(const mark of final){near(mark.direction.x,1);near(mark.direction.z,0)}
 for(const phase of ['loading','warning','chase','door']){
  app.eval(`game.escape.phase=${JSON.stringify(phase)};syncEscapeVisual()`);
  assert.equal(app.eval('escapeMarks.visible'),true,phase);
 }
 app.eval('game.escape.phase="finished";syncEscapeVisual()');
 assert.equal(app.eval('escapeMarks.visible'),false);
});

test('replacing the escape layout disposes old paint resources and does not duplicate the mesh',()=>{
 const{app,mesh}=marks();let geometryDisposed=false,materialDisposed=false,instancesDisposed=false;
 mesh.geometry.addEventListener('dispose',()=>geometryDisposed=true);
 mesh.material.addEventListener('dispose',()=>materialDisposed=true);
 mesh.addEventListener('dispose',()=>instancesDisposed=true);
 app.eval('game.escape.layout={...game.escape.layout};syncEscapeVisual()');
 assert(geometryDisposed&&materialDisposed&&instancesDisposed);
 assert.equal(mesh.parent,null);
 assert.equal(app.eval('scene.children.filter(o=>o.name==="Escape route black wall arrows").length'),1);
});
