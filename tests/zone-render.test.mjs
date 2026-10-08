import {LEVEL_ONE_AREAS} from '../dist/level-one-layout.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.min.js';
import {loadZoneVisual,setZoneVisualState,disposeZoneVisual,ZONE_ASSET_FILES} from '../dist/zone-render.js';
const originalFetch=globalThis.fetch;
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:256,height:256,close(){this.closed=true;}});
globalThis.ProgressEvent=class{constructor(type,init){this.type=type;Object.assign(this,init);}};
globalThis.fetch=async(input,init)=>{
 const url=typeof input==='string'?input:input.url;
 if(url.startsWith('file:'))return new Response(await readFile(new URL(url)),{headers:{'Content-Type':'model/gltf-binary'}});
 return originalFetch(input,init);
};
test('official local GLTF loader preserves mapped pack materials and hub seal',async()=>{
 const root=await loadZoneVisual('hub');assert.equal(root.userData.zone,'hub');assert.ok(root.userData.zoneStats.textures>=3);assert.ok(root.userData.zoneStats.triangles>1000);
 let map;root.traverse(o=>{if(o.material?.map)map=o.material.map;});assert.equal(map.colorSpace,THREE.SRGBColorSpace);
 root.updateMatrixWorld(true);assert.ok(new THREE.Raycaster(new THREE.Vector3(0,1.6,5),new THREE.Vector3(0,0,1),0,2).intersectObject(root,true).some(hit=>hit.object.name==='hub-entry-reveal'));assert.equal(root.getObjectByName('hub-rear-seal').visible,false);setZoneVisualState(root,{sealed:true});assert.equal(root.getObjectByName('hub-rear-seal').visible,true);
 assert.ok(root.getObjectByName('level1-active-door'));disposeZoneVisual(root);disposeZoneVisual(root);assert.equal(root.children.length,0);
});
test('six assembled sectors have continuous portals, real refuge/pipe modules, dark controls and independent visits',async()=>{
 const root=await loadZoneVisual('level1');assert.ok(root.userData.zoneStats.textures>=3);
 for(const name of ['area-0-floor','area-4-bench-1','area-5-pipe-1','level-one-area-5'])assert.ok(root.getObjectByName(name),name);
 root.updateMatrixWorld(true);for(const area of LEVEL_ONE_AREAS.slice(0,-1)){const ray=new THREE.Raycaster(new THREE.Vector3(0,1.6,area.bounds.minZ+1),new THREE.Vector3(0,0,-1),0,2);assert.equal(ray.intersectObject(root,true).length,0,'sector portal must stay physically open');}
 const another=await loadZoneVisual('level1');const before=another.userData.emissives.map(x=>x.material.emissiveIntensity);
 setZoneVisualState(root,{phase:'dark',openedCrates:['l1-a1-crate-1']});assert.equal(root.getObjectByName('supply-marker-l1-a1-crate-1').visible,false);assert.equal(root.getObjectByName('supply-marker-l1-a1-crate-2').visible,true);assert.ok(root.userData.emissives.some(x=>!x.safety&&x.material.emissiveIntensity<x.intensity));assert.deepEqual(another.userData.emissives.map(x=>x.material.emissiveIntensity),before);assert.ok(root.userData.emissives.filter(x=>x.safety).every(x=>x.material.emissiveIntensity===x.intensity));setZoneVisualState(root,{phase:'lit'});assert.ok(root.userData.emissives.every(x=>x.material.emissiveIntensity===x.intensity));
 const signs=root.userData.emissives.filter(x=>x.material.name==='Green safety sign');assert.ok(signs.length>=3,'actual safety sign materials must be registered, not an empty safety filter');
 const fluorescent=root.userData.emissives.find(x=>!x.safety&&/fluor|light|lamp/i.test(x.material.name));assert.ok(fluorescent,'fixture must expose a fluorescent material');
 setZoneVisualState(root,{phase:'warning',elapsed:28.1});const pulseLow=fluorescent.material.emissiveIntensity;
 setZoneVisualState(root,{phase:'warning',elapsed:28.6});const pulseHigh=fluorescent.material.emissiveIntensity;
 assert.ok(pulseHigh>pulseLow,'warning must gently vary fluorescent brightness');
 assert.ok(signs.every(x=>x.material.emissiveIntensity===x.intensity),'green signs remain steady during warning');
 setZoneVisualState(root,{phase:'dark',elapsed:34});assert.ok(signs.every(x=>x.material.emissiveIntensity===x.intensity),'green signs remain readable during blackout');
 assert.ok(fluorescent.material.emissiveIntensity<pulseLow);setZoneVisualState(root,{phase:'lit'});
 const geom=root.getObjectByName('area-5-pipe-1').children.find(x=>x.isMesh).geometry;let count=0;geom.addEventListener('dispose',()=>count++);disposeZoneVisual(root);assert.equal(count,1);assert.deepEqual(Object.keys(root.userData).sort(),['disposed','zone','zoneStats']);disposeZoneVisual(another);
});
test('runtime assets remain self-contained GLB files with embedded textures',async()=>{
 for(const name of ZONE_ASSET_FILES){const b=await readFile(new URL(`../dist/assets/level1/${name}`,import.meta.url));assert.equal(b.toString('utf8',0,4),'glTF');const j=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));assert.ok((j.images??[]).every(i=>i.bufferView!==undefined&&!i.uri),name);}
});

test('canvas safety labels use the same sRGB texture for color and emissive text',async()=>{
 const previous=globalThis.document;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})})};
 let root;
 try{
  root=await loadZoneVisual('level1');const signs=root.userData.emissives.filter(x=>x.material.name==='Green safety sign');assert.ok(signs.length>=3);
  for(const {material,intensity} of signs){assert.ok(material.map?.isCanvasTexture);assert.equal(material.map.colorSpace,THREE.SRGBColorSpace);assert.strictEqual(material.emissiveMap,material.map);setZoneVisualState(root,{phase:'dark'});assert.equal(material.emissiveIntensity,intensity)}
 }finally{if(root)disposeZoneVisual(root);if(previous===undefined)delete globalThis.document;else globalThis.document=previous}
});
