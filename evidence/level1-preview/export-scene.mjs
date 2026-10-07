import fs from 'node:fs/promises';
import * as THREE from '../../dist/vendor/three.module.min.js';
import {loadZoneVisual,setZoneVisualState,disposeZoneVisual} from '../../dist/zone-render.js';
globalThis.self=globalThis;globalThis.createImageBitmap=async()=>({width:256,height:256,close(){}});globalThis.ProgressEvent=class{constructor(t,o){Object.assign(this,o)}};
const nativeFetch=globalThis.fetch;globalThis.fetch=async u=>{const url=typeof u==='string'?u:u.url;return url.startsWith('file:')?new Response(await fs.readFile(new URL(url))):nativeFetch(u)};
for(const zone of ['hub','level1']){
 const root=await loadZoneVisual(zone);setZoneVisualState(root,{sealed:true});root.updateMatrixWorld(true);const meshes=[];
 root.traverse(o=>{if(!o.isMesh||!o.visible)return;const g=o.geometry,p=g.attributes.position,uv=g.attributes.uv,m=o.material,vs=[],us=[],v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld);vs.push([v.x,-v.z,v.y]);if(uv)us.push([uv.getX(i),uv.getY(i)])}meshes.push({name:o.name,vertices:vs,uv:us,indices:g.index?Array.from(g.index.array):Array.from({length:p.count},(_,i)=>i),material:{name:m.name,color:m.color?.toArray()||[.5,.5,.5],emission:m.emissive?.toArray()||[0,0,0],intensity:m.emissiveIntensity||0,map:!!m.map}})});
 await fs.writeFile(new URL(`./${zone}.json`,import.meta.url),JSON.stringify(meshes));disposeZoneVisual(root);
}
