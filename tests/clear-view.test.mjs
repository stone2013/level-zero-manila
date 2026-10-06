import test from 'node:test';
import assert from 'node:assert/strict';
import {boot,bootControls} from './app-harness.mjs';

test('real perspective selector covers wide pitched frusta with a hard49-region limit and explicit viewport overflow',()=>{
 const app=boot({autoLoad:false});const result=app.eval(`(()=>{
  const maxima={};let checked=0;
  for(const aspect of [1,16/9,844/390,2.4,32/9,4]){let max=0;
   for(const offset of [0,7.5,17.5,34.999])for(const pitch of [-1.1,-.7,0,.7,1.1])for(let yaw=0;yaw<Math.PI*2;yaw+=Math.PI/16){
    const view={x:offset,z:offset,yaw,pitch,aspect},selection=selectFrustumRegions(view);if(selection.overflow||selection.requiredCount>49)throw Error('required tile overflow');max=Math.max(max,selection.requiredCount);checked++;
    // Independently intersect camera rays with floor and ceiling planes. Any
    // point inside the far plane must have a requested owning region.
    for(const sx of [-1,-.5,0,.5,1])for(const sy of [-1,-.5,0,.5,1]){const far=new THREE.Vector3(sx,sy,1).unproject(viewProbe),origin=viewProbe.position;for(const y of [0,3.6]){const t=(y-origin.y)/(far.y-origin.y);if(!(t>=0&&t<=1))continue;const x=origin.x+(far.x-origin.x)*t,z=origin.z+(far.z-origin.z)*t,rx=Math.floor(x/35),rz=Math.floor(z/35);if(!selection.points.some(p=>p.required&&p.x===rx&&p.z===rz))throw Error('unrequested visible floor/ceiling ray')}}
   }maxima[aspect]=max;
  }return{maxima,checked,overflow:selectFrustumRegions({x:0,z:0,yaw:0,pitch:0,aspect:4.01}).overflow};
 })()`);assert(result.checked>=3000);assert.equal(result.overflow,true);assert(Object.values(result.maxima).every(n=>n<=49));
});

test('turning through complete 360-degree corridors never reloads or steals overlay focus',()=>{
 const app=bootControls();app.element('start').onclick();app.frame(100);const elapsed=app.eval('game.elapsed');
 app.element('backpack').onclick({stopPropagation(){}});const focused=app.context.document.activeElement;
 const completed=app.eval('chunkStream.completed');
 for(let i=0;i<128;i++){
  app.eval(`game.player.yaw=${i*Math.PI/16};game.player.pitch=${Math.sin(i)*1.1};updateStreamView()`);
  assert.equal(app.eval('worldLoading'),false);assert.equal(app.context.document.activeElement,focused);
 }
 app.frame(116);assert.equal(app.eval('game.elapsed'),elapsed);assert.equal(app.eval('chunkStream.completed'),completed);
 assert.equal(app.eval('game.inventoryOpen'),true);assert.equal(app.element('world-loading').hidden,true);
});

test('actual app preloads an off-camera fold landing after eviction and transfers exactly once',()=>{
 const app=boot({autoLoad:false});app.settle();app.element('start').onclick();app.settle();
 app.eval('game.player.x=5002.5;game.player.z=-5002.5;updateStreamView()');app.settle();
 app.eval(`chunkStream.clear();requestedSelection=null;game.foldState=1;const f=game.maze.folds[0];game.player.x=f.px-.55;game.player.z=f.pz;game.player.yaw=-Math.PI/2;updateStreamView()`);
 assert.equal(app.eval('worldLoading'),true);app.settle();assert.equal(app.eval('game.renderReady(game.maze.folds[2].px,game.maze.folds[2].pz)'),true);
 const loops=app.eval('game.loops');app.eval('game.move(1.1,0)');assert.equal(app.eval('game.loops'),loops+1);assert(Math.abs(app.eval('game.player.x')-app.eval('game.maze.folds[2].px+.55'))<1e-6);
 app.eval('updateStreamView()');app.settle();assert.equal(app.eval('worldLoading'),false);assert.equal(app.eval('game.collides(game.player.x,game.player.z)'),false);
});

test('an unexpectedly missing fold landing rolls back the crossing and requests it rather than losing the transfer',()=>{
 const app=bootControls();app.element('start').onclick();app.eval(`chunkStream.clear();requestedSelection=null;game.foldState=1;const f=game.maze.folds[0];game.player.x=f.px-.04;game.player.z=f.pz;game.renderReady=(x,z)=>x<30`);
 const before=app.eval('JSON.stringify(game.player)');app.eval('game.move(.08,0)');assert.equal(app.eval('JSON.stringify(game.player)'),before);assert.equal(app.eval('game.loops'),0);assert(app.eval('game.pendingFold.x')>30);
 app.eval('game.renderReady=()=>true;game.move(.08,0)');assert.equal(app.eval('game.loops'),1);assert.equal(app.eval('game.pendingFold'),null);
});
