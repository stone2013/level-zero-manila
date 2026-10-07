import test from 'node:test';
import assert from 'node:assert/strict';
import {boot} from './app-harness.mjs';
test('real renderer has a continuous final corridor, visible real door and one translated room',()=>{
 const a=boot();a.element('start').onclick();a.eval('game.elapsed=479.99');let t=0;
 for(let n=0;n<500&&a.eval('game.escape.phase')!=='warning';n++){a.frame(t+=50);a.settle()}
 assert.equal(a.eval('game.escape.phase'),'warning');
 a.eval('Object.assign(game.player,game.escape.layout.end,{yaw:Math.PI/2});game.escape.phase="door";updateStreamView()');a.settle();a.frame(t+=50);
 const result=JSON.parse(a.eval(`JSON.stringify((()=>{
  scene.position.set(0,0,0);scene.updateMatrixWorld(true);
  const m=game.maze, ray=new THREE.Raycaster(new THREE.Vector3(m.doorX-7.5,1.65,m.doorZ),new THREE.Vector3(1,0,0),0,12);
  const hits=ray.intersectObjects([mazeGroup,roomGroup],true).filter(h=>{let p=h.object;while(p){if(!p.visible)return false;p=p.parent}return true});
  const leaf=doorPivot.getWorldPosition(new THREE.Vector3());
  const rooms=[];scene.traverse(n=>{if(n.name==='Manila door leaf')rooms.push(n)});
  return {firstX:hits[0]?.point.x,doorX:m.doorX,doorZ:m.doorZ,leaf:{x:leaf.x,z:leaf.z},roomCount:rooms.length,offset:{x:roomGroup.position.x,z:roomGroup.position.z},expected:game.escape.roomOffset,changed:game.changed};
 })())`));
 assert(result.firstX>=result.doorX-.3&&result.firstX<=result.doorX+.15,JSON.stringify(result));
 assert.equal(result.leaf.x,result.doorX);assert.equal(result.leaf.z,result.doorZ-.8);
 assert.equal(result.roomCount,1);assert.deepEqual(result.offset,result.expected);assert.equal(result.changed,false);
 a.eval('game.door=game.doorTarget=1;sync();scene.position.set(0,0,0);scene.updateMatrixWorld(true)');
 const clear=a.eval(`(()=>{const m=game.maze,r=new THREE.Raycaster(new THREE.Vector3(m.doorX-2.5,1.65,m.doorZ),new THREE.Vector3(1,0,0),0,4);return r.intersectObjects([mazeGroup,roomGroup],true).filter(h=>{let p=h.object;while(p){if(!p.visible)return false;p=p.parent}return true}).length===0})()`);
 assert(clear,'opening the actual door leaves no procedural end wall blocking the entry');
});
