import {boot} from '../tests/app-harness.mjs';
import {createHash} from 'node:crypto';
const app=boot({autoLoad:false});app.eval('chunkStream.clear()');
const cases=[];
for(const [x,z]of [[0,0],[2,-1],[-3,4],[285,-286]]){
 app.eval(`globalThis.task=createRenderChunk(${x},${z});while(!task.iterator.next().done){}`);
 const meshes=app.eval(`task.value.children.filter(o=>o.isMesh).map(o=>({material:Object.keys(mat).find(k=>mat[k]===o.material),position:o.position.toArray(),count:o.count||0,attributes:Object.entries(o.geometry.attributes).map(([k,v])=>[k,v.array]),index:o.geometry.index?.array,matrix:o.instanceMatrix?.array,color:o.instanceColor?.array}))`);
 const h=createHash('sha256');for(const m of meshes){h.update(JSON.stringify([m.material,m.position,m.count]));for(const[k,a]of m.attributes)h.update(k).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));for(const a of[m.index,m.matrix,m.color])if(a)h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength))}
 cases.push({x,z,meshes:meshes.length,hash:h.digest('hex')});app.eval('disposeChunk(task.value)');
}
console.log(JSON.stringify(cases,null,2));
