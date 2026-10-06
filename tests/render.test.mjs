import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as THREE from '../dist/vendor/three.module.min.js';
// Real Three.js geometry and matrices under Node. This does not test WebGL or browser input.
const source=fs.readFileSync('dist/app.js','utf8');
test('wallpaper is 25% smaller in both world axes and the rest of the v1.3.5 app is byte-identical',()=>{
 assert.equal((source.match(/metres=wall\?1\.875:2/g)||[]).length,1);
 assert.equal(1.875/2.5,.75);
 const baseline=source.replace('metres=wall?1.875:2','metres=wall?2.5:2');
 assert.equal(createHash('sha256').update(baseline).digest('hex'),'433ba1428f77fbd4adadceb96dfa6d50da7ac3d4e81c1ba0df620f5365ee57b2');
});
function setup(){const mat={wall:new THREE.MeshLambertMaterial(),floor:new THREE.MeshLambertMaterial(),ceiling:new THREE.MeshLambertMaterial(),ceilingGrid:new THREE.MeshLambertMaterial()};const context={THREE,mat,ROOM_HEIGHT:3.6,boxGeo:new THREE.BoxGeometry(1,1,1)};vm.createContext(context);vm.runInContext(source.slice(source.indexOf('function box('),source.indexOf('function label(')),context);return{...context,group:new THREE.Group()}}
test('world-scale wall and floor UVs remain proportional and line up across differently sized pieces',()=>{const{box,mat,group}=setup();for(const dims of [[5,3.1,.16],[.16,3.1,1.6],[35,.16,35],[6,.16,5]]){const material=dims[1]===3.1?mat.wall:mat.floor,metres=material===mat.wall?1.875:2;const m=box(group,5,1.55,7,...dims,material),p=m.geometry.attributes.position,n=m.geometry.attributes.normal,uv=m.geometry.attributes.uv;assert.equal(m.scale.x,1);for(let i=0;i<p.count;i++){let u,v;if(Math.abs(n.getY(i))>.5){u=(p.getX(i)+5)/metres;v=(p.getZ(i)+7)/metres}else if(Math.abs(n.getX(i))>.5){u=(p.getZ(i)+7)/metres;v=(p.getY(i)+1.55)/metres}else{u=(p.getX(i)+5)/metres;v=(p.getY(i)+1.55)/metres}assert(Math.abs(uv.getX(i)-u)<.00001);assert(Math.abs(uv.getY(i)-v)<.00001)}}});
test('ceiling uses downward-facing instanced panels with a real 25mm seam and bounded coverage',()=>{const{ceiling,group}=setup();ceiling(group,17.5,17.5,35,35);const panels=group.children.find(n=>n.isInstancedMesh);assert.equal(panels.count,28*28);assert(panels.geometry.attributes.normal.getY(0)<-.99);const matrix=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();panels.getMatrixAt(0,matrix);matrix.decompose(p,q,s);assert(Math.abs(s.x-1.225)<1e-6);assert(Math.abs(s.z-1.225)<1e-6);assert(Math.abs(p.x-.625)<1e-6);assert(Math.abs(p.z-.625)<1e-6);assert(Math.abs(p.y-3.58)<1e-6);assert(panels.boundingSphere.radius>20);assert.equal(group.children.length,2)});
