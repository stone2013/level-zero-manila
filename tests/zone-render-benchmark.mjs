// Real GLB JSON/buffer/material assembly, mocked PNG decode. Not an FPS benchmark.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import * as THREE from '../dist/vendor/three.module.min.js';
import {loadZoneVisual,disposeZoneVisual} from '../dist/zone-render.js';
import {LEVEL1,zoneCollides} from '../dist/zones.js';
const fetchOriginal=globalThis.fetch;
globalThis.self=globalThis;globalThis.ProgressEvent=class{constructor(type,init){Object.assign(this,init);}};
globalThis.document={createElement(){return {width:0,height:0,getContext(){return {fillRect(){},strokeRect(){},fillText(){}};}};}};
let decoded=[];
globalThis.createImageBitmap=async blob=>{const b=Buffer.from(await blob.arrayBuffer());const image={width:b.readUInt32BE(16),height:b.readUInt32BE(20),closed:false,close(){this.closed=true;}};decoded.push(image);return image;};
globalThis.fetch=async(input,init)=>{const url=typeof input==='string'?input:input.url;return url.startsWith('file:')?new Response(await readFile(new URL(url))):fetchOriginal(input,init);};
const results={measuredAt:new Date().toISOString(),method:'Node official GLTFLoader parse and assembly. PNG dimensions inspected, image decode stubbed. CPU figures exclude actual PNG decode, GPU upload, shader compile and rendering. No FPS claim.',zones:{}};
for(const zone of ['hub','level1']){
 decoded=[];const start=performance.now();const root=await loadZoneVisual(zone);const ms=performance.now()-start;
 const resources={geometry:new Set(),material:new Set(),texture:new Set()};
 root.traverse(o=>{if(!o.isMesh)return;resources.geometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){resources.material.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.texture.add(v);}});
 const disposed={geometry:0,material:0,texture:0};for(const [kind,set] of Object.entries(resources))for(const r of set)r.addEventListener('dispose',()=>disposed[kind]++);
 const samples=zone==='level1'?[[0,1.6,-20,0,0,-1,3],[0,1.6,-26,0,0,-1,7],[0,1.6,-28,-1,0,0,5],[0,1.6,-35,0,0,-1,7]]:[];
 root.updateMatrixWorld(true);const traversableRays=samples.map(([x,y,z,dx,dy,dz,distance])=>({origin:[x,y,z],direction:[dx,dy,dz],distance,hits:new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(dx,dy,dz),0,distance).intersectObject(root,true).map(x=>x.object.name)}));
 let sampledWalkablePoints=0,missingFloors=0,nearbyUnexpectedGeometry=0;
 if(zone==='level1'){
  let seed=818;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const region of LEVEL1.regions)for(let i=0;i<128;i++){
   const x=region.minX+(region.maxX-region.minX)*rand(),z=region.minZ+(region.maxZ-region.minZ)*rand();if(zoneCollides(zone,x,z))continue;sampledWalkablePoints++;
   if(!new THREE.Raycaster(new THREE.Vector3(x,.1,z),new THREE.Vector3(0,-1,0),0,.3).intersectObject(root,true).length){missingFloors++;console.error("missingFloor",x,z);}
   for(const [dx,dz] of [[0,-1],[1,0],[0,1],[-1,0]])if(new THREE.Raycaster(new THREE.Vector3(x,1.6,z),new THREE.Vector3(dx,0,dz),0,.12).intersectObject(root,true).length){nearbyUnexpectedGeometry++;console.error("unexpected",x,z,dx,dz,new THREE.Raycaster(new THREE.Vector3(x,1.6,z),new THREE.Vector3(dx,0,dz),0,.12).intersectObject(root,true).map(h=>h.object.name));}
  }
 }
 const glbNames=zone==='hub'?['hub.glb','modules/blue-wall-2m.glb','modules/white-panel-door.glb']:['level1-hall.glb',...['concrete-wall-4m','concrete-floor-4m','fluorescent-fixture','wood-crate-large','wood-crate-small','unattended-bench','pipe-elbow-brackets','emergency-light','shelf-loaded'].map(n=>`modules/${n}.glb`)];
 const glbBytes=(await Promise.all(glbNames.map(n=>readFile(new URL(`../dist/assets/level1/${n}`,import.meta.url))))).reduce((n,b)=>n+b.byteLength,0);
 const stats={...root.userData.zoneStats,sampledWalkablePoints,missingFloors,nearbyUnexpectedGeometry,glbBytes,canvasTextureRGBABytes:[...resources.texture].filter(t=>t.isCanvasTexture).reduce((n,t)=>n+t.image.width*t.image.height*4,0),parseAssembleMs:Number(ms.toFixed(2)),decodedImageCount:decoded.length,decodedImageRGBABytes:decoded.reduce((n,i)=>n+i.width*i.height*4,0),textureDimensions:decoded.map(i=>[i.width,i.height]),traversableRays};
 disposeZoneVisual(root);disposeZoneVisual(root);stats.disposal={expected:Object.fromEntries(Object.entries(resources).map(([k,s])=>[k,s.size])),actual:disposed,remainingChildren:root.children.length,remainingResourceUserData:Object.keys(root.userData).filter(k=>!['zone','zoneStats','disposed'].includes(k)),allDecodedImagesClosed:decoded.every(i=>i.closed)};results.zones[zone]=stats;
 if(missingFloors||nearbyUnexpectedGeometry)throw Error(`Render/collision mismatch in ${zone}`);
 if(traversableRays.some(r=>r.hits.length))throw Error(`Blocked route in ${zone}`);
 if(Object.keys(disposed).some(k=>disposed[k]!==resources[k].size)||!stats.disposal.allDecodedImagesClosed)throw Error('Resource leak');
}
await mkdir(new URL('../audit/',import.meta.url),{recursive:true});await writeFile(new URL('../audit/zone-assets-evidence.json',import.meta.url),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
