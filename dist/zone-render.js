import {buildLevelOneAreas,setLevelOneAreaVisibility,restoreLevelOneAreas} from './level-one-area-render.js';
import * as THREE from './vendor/three.module.min.js';
import {LEVEL1} from './zones.js';
import {createLevelOneEntityVisual,updateLevelOneEntityVisual} from './level-one-entity-visual.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';
import {applyWorldScaleTextures} from './zone-texture-scale.js';

const ASSETS = new URL('./assets/level1/', import.meta.url);
const loader = new GLTFLoader();
function sign(text,width=2,height=.42){
 const canvas=globalThis.document?.createElement('canvas');
 let map=null;
 if(canvas){canvas.width=768;canvas.height=160;const ctx=canvas.getContext('2d');ctx.fillStyle='#173c32';ctx.fillRect(0,0,768,160);ctx.strokeStyle='#88c5a1';ctx.lineWidth=7;ctx.strokeRect(6,6,756,148);ctx.fillStyle='#ddffe6';ctx.font='bold 70px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,384,82,735);map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;}
 const material=new THREE.MeshStandardMaterial({name:'Green safety sign',map,emissiveMap:map,color:map?0xffffff:0x74ac88,emissive:0xffffff,emissiveIntensity:.5,roughness:.9});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);mesh.name=`sign-${text}`;mesh.userData.label=text;return mesh;
}

export const ZONE_ASSET_FILES = ['hub.glb','level1-hall.glb', ...['wood-crate-large','wood-crate-small','blue-wall-2m','concrete-column','unattended-bench','pipe-elbow-brackets','white-panel-door','concrete-wall-4m','shelf-loaded','concrete-floor-4m','fluorescent-fixture','emergency-light'].map(n=>`modules/${n}.glb`)];

// Triangle filtering happens only at the two authored door openings. Every
// surviving attribute, material and UV remains from the original GLB.
export function removeTriangles(mesh, predicate) {
 const source=mesh.geometry, position=source.getAttribute('position'), index=source.index;
 const keep=[], points=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
 mesh.updateWorldMatrix(true,false);
 for(let i=0,n=index?index.count:position.count;i<n;i+=3){
  const ids=[0,1,2].map(k=>index?index.getX(i+k):i+k);
  ids.forEach((id,k)=>points[k].fromBufferAttribute(position,id).applyMatrix4(mesh.matrixWorld));
  if(!predicate(points))keep.push(...ids);
 }
 if(keep.length===(index?index.count:position.count))return;
 const geometry=source.clone();geometry.setIndex(keep);geometry.computeBoundingBox();geometry.computeBoundingSphere();
 mesh.geometry=geometry;source.dispose();
}

/** Fresh, independently disposable assets per visit; no cross-zone texture cache. */
export async function loadZoneVisual(zone) {
 if(!['hub','level1'].includes(zone))throw new RangeError(`Unknown zone: ${zone}`);
 const root=new THREE.Group();root.name=`zone-${zone}`;root.userData.zone=zone;
 const templates=new Map();
 const load=async name=>{
  if(!templates.has(name))templates.set(name,loader.loadAsync(new URL(name,ASSETS).href).then(g=>g.scene));
  return templates.get(name);
 };
 const module=async name=>load(`modules/${name}.glb`);
 const add=(template,name,x=0,y=0,z=0,ry=0,sx=1,sy=1,sz=1)=>{
  const object=template.clone(true);object.name=name;object.position.set(x,y,z);object.rotation.y=ry;object.scale.set(sx,sy,sz);root.add(object);return object;
 };
 try {
  if(zone==='hub')root.add(await load('hub.glb'));
  if(zone==='hub'){
   const [blue,door]=await Promise.all([module('blue-wall-2m'),module('white-panel-door')]);
   const seal=add(blue,'hub-rear-seal',0,0,6.5,0,6,1,1);seal.visible=false;
   root.userData.seal=seal;
   add(blue,'hub-rear-left',-3.5,0,6.5,0,2.5);add(blue,'hub-rear-right',3.5,0,6.5,0,2.5);
   add(blue,'hub-rear-lintel',0,2.35,6.5,0,1,1.55/3.9);
   for(const x of [-6.1,6.1])add(blue,'hub-side-return',x,0,6.32,Math.PI/2,.2);
   const reveal=new THREE.Mesh(new THREE.PlaneGeometry(2,2.35),new THREE.MeshStandardMaterial({color:0x242319,roughness:1}));reveal.name='hub-entry-reveal';reveal.position.set(0,1.175,6.51);reveal.rotation.y=Math.PI;root.add(reveal);root.userData.entryReveal=reveal;

   const entry=add(door,'level1-active-door',5.94,0,3.3,-Math.PI/2);
   // Keep the authored panelled leaf and lettering. Green frame distinguishes
   // this eighth door from the seven original, inactive reference doors.
   const frameMaterial=new THREE.MeshStandardMaterial({color:0x305e48,emissive:0x1a694a,emissiveIntensity:.35,roughness:.65});
   for(const [y,z,h,w] of [[1.1,2.69,2.3,.08],[1.1,3.91,2.3,.08],[2.25,3.3,.08,1.3]]){
    const frame=new THREE.Mesh(new THREE.BoxGeometry(.13,h,w),frameMaterial);frame.position.set(5.86,y,z);frame.name='active-door-green-frame';root.add(frame);
   }
   entry.userData.destination='level1';
   const label=sign('LEVEL 1',1.65,.4);label.position.set(5.82,2.85,3.3);label.rotation.y=-Math.PI/2;root.add(label);
  }else{
   const names=['concrete-wall-4m','concrete-floor-4m','concrete-column','fluorescent-fixture','wood-crate-large','wood-crate-small','unattended-bench','pipe-elbow-brackets','emergency-light','shelf-loaded'];
   const models=await Promise.all(names.map(module)),kit=Object.fromEntries(names.map((n,i)=>[n,models[i]]));
   buildLevelOneAreas(root,kit);
   const presence=createLevelOneEntityVisual();root.add(presence);root.userData.presence=presence;
  }
  applyWorldScaleTextures(root);
  const materials=new Set(),geometries=new Set(),textures=new Set();let meshes=0,triangles=0;
  root.traverse(o=>{if(!o.isMesh)return;o.castShadow=false;o.receiveShadow=false;meshes++;geometries.add(o.geometry);triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
   for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}
  });
  root.userData.emissives=[...materials].filter(m=>m.emissiveIntensity>0&&m.emissive?.getHex()>0&&!root.userData.presence?.userData.levelOneVisual?.materials?.includes(m)).map(material=>({material,intensity:material.emissiveIntensity,safety:/Green safety/.test(material.name)}));
  root.userData.zoneStats={meshes,triangles,materials:materials.size,textures:textures.size,geometries:geometries.size};
  root.userData.disposed=false;return root;
 }catch(error){
  // Include templates that finished after another asset failed.
  await Promise.allSettled([...templates.values()].map(async p=>{const t=await p;if(!t.parent)root.add(t);}));
  disposeZoneVisual(root);throw error;
 }
}

export function setZoneVisualState(root,{sealed=false,phase='lit',openedCrates=[],elapsed=0,danger=null,player=null}={}){
 if(!root||root.userData.disposed)return;
 if(player)setLevelOneAreaVisibility(root,player);
 if(root.userData.presence)updateLevelOneEntityVisual(root.userData.presence,danger,elapsed);
 if(root.userData.seal)root.userData.seal.visible=sealed;
 if(root.userData.entryReveal)root.userData.entryReveal.visible=!sealed;
 const opened=new Set(openedCrates);
 for(const item of root.userData.supplyCrates??[]){
  item.marker.visible=!opened.has(item.id);
  item.crate.userData.opened=opened.has(item.id);
  item.crate.traverse(o=>{if(/shipping.label/i.test(o.name))o.visible=!opened.has(item.id);});
 }
 for(const {material,intensity,safety} of root.userData.emissives??[])material.emissiveIntensity=intensity*(safety?1:phase==='dark'?.015:phase==='warning'?(.6+.08*Math.sin(elapsed*Math.PI)):1);
}

/** Dispose shared intra-zone assets exactly once; never touches another visit. */
export function disposeZoneVisual(root){
 if(!root||root.userData.disposed)return;
 restoreLevelOneAreas(root);
 const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
 root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture){textures.add(v);if(v.source?.data)images.add(v.source.data);}}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());images.forEach(i=>i.close?.());root.removeFromParent();root.clear();root.userData={zone:root.userData.zone,zoneStats:root.userData.zoneStats,disposed:true};
}
