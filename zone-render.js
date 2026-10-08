import * as THREE from './vendor/three.module.min.js';
import {LEVEL1} from './zones.js';
import {createLevelOneEntityVisual,updateLevelOneEntityVisual} from './level-one-entity-visual.js';
import { GLTFLoader } from './vendor/GLTFLoader.js';

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
  root.add(await load(zone==='hub'?'hub.glb':'level1-hall.glb'));
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
   root.updateMatrixWorld(true);
   root.traverse(object=>{
    if(!object.isMesh)return;
    if(object.material.name==='Concrete warm aggregate')removeTriangles(object,points=>points.every(p=>p.z < -21.89));
    if(['Ivory painted door','Brushed galvanized steel'].includes(object.material.name))removeTriangles(object,points=>points.every(p=>p.z < -21.7 && Math.abs(p.x)<.8 && p.y<2.4));
   });
   const names=['concrete-wall-4m','concrete-floor-4m','fluorescent-fixture','wood-crate-large','wood-crate-small','unattended-bench','pipe-elbow-brackets','emergency-light','shelf-loaded'];
   const models=await Promise.all(names.map(module));const kit=Object.fromEntries(names.map((n,i)=>[n,models[i]]));
   const wall=(name,x,z,length,ry=0)=>add(kit['concrete-wall-4m'],name,x,0,z,ry,length/4);
   const slab=(name,x,z,width,depth,y=0)=>add(kit['concrete-floor-4m'],name,x,y,z,0,width/4,1,depth/4);
   // Full-height portal replaces the pack's solid end wall and closed door.
   wall('hall-south-boundary',0,6,16);
   wall('north-wall-left',-5,-22,6);wall('north-wall-right',5,-22,6);
   for(const [name,x,z,w,d] of [['continuation',0,-28,4,12],['refuge',-5,-27.5,6,5],['pipe',0,-39,3.2,10],['refuge-bypass',-5,-34,2,8],['refuge-return',-2.8,-37,2.4,2]]){
    slab(`${name}-floor`,x,z,w,d);slab(`${name}-ceiling`,x,z,w,d,4.2);
   }
   wall('continuation-east',2,-28,12,Math.PI/2);
   wall('continuation-west-south',-2,-23.5,3,Math.PI/2);
   wall('continuation-west-north',-2,-32,4,Math.PI/2);
   wall('refuge-south',-5,-25,6);wall('refuge-north-left',-7,-30,2);wall('refuge-north-right',-3,-30,2);wall('refuge-west',-8,-27.5,5,Math.PI/2);
   wall('pipe-east',1.6,-39,10,Math.PI/2);wall('pipe-west-south',-1.6,-35,2,Math.PI/2);wall('pipe-west-north',-1.6,-41,6,Math.PI/2);
   wall('bypass-west',-6,-34,8,Math.PI/2);wall('bypass-east',-4,-33,6,Math.PI/2);wall('bypass-north',-3.8,-38,4.4);wall('bypass-return-south',-2.8,-36,2.4);wall('pipe-end',0,-44,3.2);
   wall('pipe-threshold-left',-1.8,-34,.4);wall('pipe-threshold-right',1.8,-34,.4);
   for(const z of [-24,-29,-33,-37,-41])add(kit['fluorescent-fixture'],`extension-fixture-${z}`,0,3.65,z);
   add(kit['fluorescent-fixture'],'refuge-fixture',-5,3.65,-27.5);
   const presence=createLevelOneEntityVisual();root.add(presence);root.userData.presence=presence;
   // Reused warehouse dividers: author collision and rendering from one layout.
   for(const [i,b] of LEVEL1.baffles.entries())wall(`warehouse-divider-${i}`,b.x,b.z,b.w);
   for(const [text,x,z] of [['PASSAGE →',2.6,-4.88],['← PASSAGE',-2.6,-11.68],['PASSAGE →',2.6,-17.68]]){const label=sign(text,2,.36);label.position.set(x,2.55,z);root.add(label);}
   for(const [name,x,z,w,d] of [['entry',0,3.6,4,3.2],['east',6.4,-19.75,2.2,2.5],['refuge',-5,-27.5,5.2,4.2]]){
    const marker=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({color:0x397664,transparent:true,opacity:.25,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.position.set(x,.012,z);marker.name=`shelter-floor-${name}`;root.add(marker);
    const label=sign('LIT SHELTER',1.8,.3);label.position.set(x,2.65,z-.6);root.add(label);
   }
   add(kit['emergency-light'],'entry-safety-lamp',0,2.7,5.85,Math.PI);
   add(kit['emergency-light'],'east-safety-lamp',7.83,2.7,-19.75,-Math.PI/2);
   for(const z of [-32,-36]){add(kit['emergency-light'],`bypass-safety-lamp-${z}`,-5.83,2.7,z,Math.PI/2);}
   let crateIndex=0;root.userData.supplyCrates=[];
   for(const [x,z] of [[-5,2],[6,-6],[-5,-19.5],[-6,-27]]){
    const c=add(kit['wood-crate-large'],`supply-crate-${x}-${z}`,x,0,z);c.userData.supplyCrate=true;c.userData.crateId=`l1-crate-${++crateIndex}`;
    const marker=sign('SUPPLIES',.66,.16);marker.position.set(x,.83,z+.03);marker.name=`supply-marker-${crateIndex}`;root.add(marker);root.userData.supplyCrates.push({id:c.userData.crateId,crate:c,marker});
   }
   add(kit['wood-crate-small'],'refuge-small-crate',-6.8,0,-28.7);
   add(kit['unattended-bench'],'refuge-bench',-7,0,-29.45);
   add(kit['shelf-loaded'],'refuge-shelf',-7.3,0,-26,Math.PI/2);
   for(const z of [-35,-38,-41])add(kit['pipe-elbow-brackets'],`pipe-module-${z}`,1.24,0,z);
   add(kit['emergency-light'],'refuge-safety-lamp',-7.83,2.7,-27.5,Math.PI/2);
   add(kit['emergency-light'],'pipe-safety-lamp',0,2.7,-43.85);
   for(const [text,x,y,z,width] of [['SAFE ROUTE ← / PIPES ↑',0,3.2,-24.8,3.2],['SAFE ROUTE ↑',-5,2.65,-29.86,1.6],['REJOIN PIPES →',-5,2.65,-37.85,1.8],['PIPE PASSAGE',0,3.15,-34.2,2.5],['DEMO ENDS HERE',0,2.2,-43.85,2.6]]){
    const label=sign(text,width);label.position.set(x,y,z);root.add(label);
   }
  }
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

export function setZoneVisualState(root,{sealed=false,phase='lit',openedCrates=[],elapsed=0,danger=null}={}){
 if(!root||root.userData.disposed)return;
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
 const geometries=new Set(),materials=new Set(),textures=new Set(),images=new Set();
 root.traverse(o=>{if(!o.isMesh)return;geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture){textures.add(v);if(v.source?.data)images.add(v.source.data);}}});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());images.forEach(i=>i.close?.());root.removeFromParent();root.clear();root.userData={zone:root.userData.zone,zoneStats:root.userData.zoneStats,disposed:true};
}
