import test from 'node:test';
import assert from 'node:assert/strict';
import {bootControls} from './app-harness.mjs';
const near=(a,b)=>assert(Math.abs(a-b)<4e-6,`${a} != ${b}`);
test('all six Manila shell pieces use approved wallpaper outside and retain the correct plain interior face',()=>{
 const app=bootControls(),mat=app.eval('mat'),maze=app.eval('game.maze'),shell=app.eval('roomGroup.children.filter(o=>o.userData.roomShell)');
 assert.equal(shell.length,6);assert.equal(shell.filter(o=>o.userData.doorFacade).length,3);
 for(const mesh of shell){
  const expected=Math.abs(mesh.position.x-maze.doorX)<.01?0:mesh.geometry.parameters.width>mesh.geometry.parameters.depth?(mesh.position.z<maze.doorZ?4:5):1;
  assert.equal(mesh.userData.insideFace,expected);assert.equal(mesh.material[expected],mat.room);
  mesh.material.forEach((material,face)=>{if(face!==expected)assert.equal(material,mat.wall)});
  assert.equal(mat.room.map,null);assert.equal(mat.room.color.getHex(),0xa69869);
  const {position:p,normal:n,uv,color}=mesh.geometry.attributes;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i)+mesh.position.x,y=p.getY(i)+mesh.position.y,z=p.getZ(i)+mesh.position.z;
   near(uv.getX(i),(Math.abs(n.getX(i))>.5?z:x)/1.40625);
   near(uv.getY(i),(Math.abs(n.getY(i))>.5?z:y)/1.40625);
   for(const value of [color.getX(i),color.getY(i),color.getZ(i)])assert(Number.isFinite(value)&&value>=0&&value<=1.5);
  }
 }
});
test('north, south and rear wallpaper uses the exterior lamp bake rather than indoor lamp fill',()=>{
 const app=bootControls();app.eval('prepareLighting(game.maze)');const room=app.eval('roomGroup'),shell=room.children.filter(o=>o.userData.roomShell);
 const normals=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
 for(const mesh of shell){
  const inside=normals[mesh.userData.insideFace],{position:p,normal:n,color}=mesh.geometry.attributes;let checked=0;
  for(let i=0;i<p.count;i++){
   const normal=[n.getX(i),n.getY(i),n.getZ(i)];if(normal.reduce((sum,value,j)=>sum+value*inside[j],0)>-.5)continue;
   const expected=room.userData.facadeBake.sample([p.getX(i)+mesh.position.x,p.getY(i)+mesh.position.y,p.getZ(i)+mesh.position.z],normal);
   near(color.getX(i),expected[0]);near(color.getY(i),expected[1]);near(color.getZ(i),expected[2]);checked++;
  }assert(checked>0);
 }
});
test('shell treatment leaves every physical wall, door state and finite item unchanged across rebuilds',()=>{
 const app=bootControls();app.element('start').onclick();const before=app.eval('JSON.stringify([game.roomWalls,game.obstacles,game.items,game.door,game.doorTarget,game.player])');app.eval('build()');app.settle();
 assert.equal(app.eval('JSON.stringify([game.roomWalls,game.obstacles,game.items,game.door,game.doorTarget,game.player])'),before);assert.equal(app.eval('game.items.filter(i=>i.kind==="water").length'),2);
 app.eval('game.changed=true;sync()');assert.equal(app.eval('roomGroup.visible'),true);assert.equal(app.eval('roomGroup.children.filter(o=>o.userData.roomShell).length'),6);
});
