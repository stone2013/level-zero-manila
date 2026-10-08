import * as THREE from './vendor/three.module.min.js';
import {mergeGeometries} from './vendor/BufferGeometryUtils.js';
import {LEVEL_ONE_AREAS,levelOneCollides} from './level-one-layout.js';

const HEIGHT=4.2;
const COLORS=[0x4d83ad,0xb98e36,0xa24d42,0x53a8ad,0x588b69,0xb1bdb8];
const countMeshes=group=>{let n=0;group.traverse(o=>{if(o.isMesh)n++;});return n;};

/** Compact only the known static shelf kit, once per disposable visit. The
 * caller's template and materials remain untouched; temporary copies are owned
 * here, while resulting geometries are shared by shelf clones in this root. */
function compactShelf(template){
 template.updateWorldMatrix(true,true);
 const inverse=new THREE.Matrix4().copy(template.matrixWorld).invert(),meshes=[];
 let supported=true;
 template.traverse(o=>{
  if(!o.visible||o.isSkinnedMesh||o.isInstancedMesh)supported=false;
  if(!o.isMesh)return;
  if(Array.isArray(o.material)||o.material.transparent||Object.keys(o.geometry.morphAttributes).length||o.geometry.drawRange.start!==0||Number.isFinite(o.geometry.drawRange.count)||o.matrixWorld.determinant()<=0)supported=false;
  meshes.push(o);
 });
 if(!supported||meshes.length<2)return template;
 const buckets=new Map();
 for(const mesh of meshes){
  const g=mesh.geometry;
  const signature=JSON.stringify([mesh.material.uuid,Boolean(g.index),Object.entries(g.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>[name,a.itemSize,a.normalized,a.array?.constructor.name??a.data?.array?.constructor.name,a.gpuType])]);
  if(!buckets.has(signature))buckets.set(signature,[]);
  buckets.get(signature).push(mesh);
 }
 const output=new THREE.Group();output.name='Compacted authored shelf';
 for(const sources of buckets.values()){
  const copies=sources.map(mesh=>mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld)));
  const geometry=mergeGeometries(copies,false);
  copies.forEach(g=>g.dispose());
  if(!geometry){output.traverse(o=>o.geometry?.dispose());return template;}
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,sources[0].material);mesh.name=`Shelf / ${sources[0].material.name}`;mesh.userData.sourceMeshNames=sources.map(o=>o.name);output.add(mesh);
 }
 return output;
}

/** Assemble the authored kit once. All coordinates in the layout are world-space.
 * Initially attach every sector so world-space UV baking and asset registration
 * can visit them. Visibility streaming starts only after this preparation. */
export function buildLevelOneAreas(root,kit){
 if(root.userData.areaRoots)throw new Error('Level One areas already built');
 const required=['concrete-wall-4m','concrete-floor-4m','concrete-column','shelf-loaded','unattended-bench','wood-crate-large','pipe-elbow-brackets','emergency-light','fluorescent-fixture'];
 for(const name of required)if(!kit[name]?.clone)throw new Error(`Missing Level One kit asset: ${name}`);
 const shelf=compactShelf(kit['shelf-loaded']);
 root.userData.shelfCompaction={beforeMeshes:countMeshes(kit['shelf-loaded']),afterMeshes:countMeshes(shelf)};
 const labels=new Map(),plane=new THREE.PlaneGeometry(1,1),box=new THREE.BoxGeometry(1,1,1);
 const safety=new THREE.MeshBasicMaterial({name:'Green safety floor',color:0x477f63,transparent:true,opacity:.3,depthWrite:false});
 const materials=COLORS.map(color=>new THREE.MeshStandardMaterial({name:'Warehouse landmark paint',color,roughness:.85}));
 // Labels and geometry are shared within this visit, never across disposable roots.
 function label(text,width=3,height=.52,color='#294535'){
  const key=`${color}:${text}`;let material=labels.get(key);
  if(!material){
   let map=null;const canvas=globalThis.document?.createElement('canvas');
   if(canvas){canvas.width=384;canvas.height=96;const ctx=canvas.getContext('2d');
    if(ctx){ctx.fillStyle=color;ctx.fillRect(0,0,384,96);ctx.strokeStyle='#b9d0b8';ctx.lineWidth=3;ctx.strokeRect(3,3,378,90);ctx.fillStyle='#f0f5df';ctx.font='bold 32px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,192,49,368);map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;}
   }
   material=new THREE.MeshStandardMaterial({name:'Green safety sign',map,emissiveMap:map,color:map?0xffffff:0x8fb698,emissive:0xffffff,emissiveIntensity:.45,roughness:1,side:THREE.DoubleSide});labels.set(key,material);
  }
  const mesh=new THREE.Mesh(plane,material);mesh.scale.set(width,height,1);mesh.name=`sign-${text}`;mesh.userData.label=text;return mesh;
 }
 function clone(group,key,name,x,y,z,sx=1,sy=1,sz=1,rotation=0){
  const object=(key==='shelf-loaded'?shelf:kit[key]).clone(true);object.name=name;object.position.set(x,y,z);object.scale.set(sx,sy,sz);object.rotation.y=rotation;object.userData.kitAsset=key;group.add(object);return object;
 }
 function addLabel(group,text,x,y,z,w=3,h=.52,rotation=0,color){const o=label(text,w,h,color);o.position.set(x,y,z);o.rotation.y=rotation;group.add(o);return o;}
 function wall(group,name,x,z,w,d){return clone(group,'concrete-wall-4m',name,x,0,z,w/4,HEIGHT/4,d/.2);}
 root.userData.supplyCrates=[];
 root.userData.areaRoots=LEVEL_ONE_AREAS.map((area,index)=>{
  const group=new THREE.Group();group.name=`level-one-area-${area.id}`;group.userData.areaId=area.id;group.userData.area=area;
  const b=area.bounds??area.regions[0],middle=(b.minZ+b.maxZ)/2,width=b.maxX-b.minX,depth=b.maxZ-b.minZ;
  const paint=materials[index%materials.length];root.add(group);
  clone(group,'concrete-floor-4m',`area-${area.id}-floor`,0,0,middle,width/4,1,depth/4);
  // Floor module occupies [-.2,0] locally: ceiling bottom is exactly 4.2m.
  clone(group,'concrete-floor-4m',`area-${area.id}-ceiling`,0,HEIGHT+.2,middle,width/4,1,depth/4);
  area.walls.forEach((w,i)=>wall(group,`area-${area.id}-wall-${i}`,w.x,w.z,w.w,w.d));
  wall(group,`area-${area.id}-west-boundary`,b.minX-.1,middle,.2,depth);
  wall(group,`area-${area.id}-east-boundary`,b.maxX+.1,middle,.2,depth);
  // Only authored collision props appear at body height; new decoration is
  // overhead or wall-flush. In particular nothing is sprinkled onto routes.
  for(const [i,p] of area.props.entries())clone(group,p.kind==='bench'?'unattended-bench':p.kind==='column'?'concrete-column':'shelf-loaded',`area-${area.id}-${p.kind}-${i}`,p.x,0,p.z,1,1,1,p.rotation??p.ry??0);
  for(const c of area.crates){
   const crate=clone(group,'wood-crate-large',`supply-crate-${c.id}`,c.x,0,c.z);crate.userData.supplyCrate=true;crate.userData.crateId=c.id;
   const marker=addLabel(group,'SUPPLIES',c.x,.9,c.z+.04,.9,.22);marker.name=`supply-marker-${c.id}`;
   root.userData.supplyCrates.push({id:c.id,crate,marker});
  }
  for(const [i,s] of area.shelters.entries()){
   const x=(s.minX+s.maxX)/2,z=(s.minZ+s.maxZ)/2;
   const patch=new THREE.Mesh(plane,safety);patch.name=`area-${area.id}-shelter-floor-${i}`;patch.rotation.x=-Math.PI/2;patch.scale.set(s.maxX-s.minX,s.maxZ-s.minZ,1);patch.position.set(x,.012,z);patch.userData.shelter=s;group.add(patch);
   const emergency=clone(group,'emergency-light',`area-${area.id}-safe-fixture-${i}`,x,HEIGHT-.1,z);emergency.rotation.x=Math.PI/2;
   if(i>=2)addLabel(group,index===4?'QUIET REFUGE':'LIT SHELTER',x,3.35,z,2,.32);
  }
  // Branch mouths advertise both options without implying the long aisle is safe.
  for(const [i,loop] of area.loops.entries()){
   const first=loop.doors[0],last=loop.doors.at(-1),toward=first.x>0?'←':'→';
   addLabel(group,`${toward} SHELTER / AISLE ↑`,first.x,2.85,first.z+.6,3.4,.42);
   addLabel(group,'REJOIN AISLE',last.x,2.85,last.z-.6,2.5,.4);
  }
  // A numbered bay, colored overhead gantry and authored pipe modules give each
  // sector a readable silhouette with a small, predictable draw-call budget.
  const bannerZ=Math.max((area.clues?.[0]?.z??b.minZ)+.3,b.maxZ-11);
  addLabel(group,`${String(index+1).padStart(2,'0')}  ${area.label??area.name}`,0,3.35,bannerZ,6,.65,0,`#${paint.color.getHexString()}`);
  addLabel(group,area.landmark,0,2.82,bannerZ,5,.35);
  const gantry=new THREE.Mesh(box,paint);gantry.name=`area-${area.id}-landmark-gantry`;gantry.position.set(0,3.86,bannerZ-.5);gantry.scale.set(index===2?30:20,.22,.28);group.add(gantry);
  for(const x of [-17.9998,17.9998]){
   for(const [bay,z] of [b.maxZ-28,middle,b.minZ+28].entries()){
    const stripe=new THREE.Mesh(box,paint);stripe.name=`area-${area.id}-wall-bay-stripe-${x}-${bay}`;stripe.position.set(x,2.25,z);stripe.scale.set(.0004,2.3,3);group.add(stripe);
    const stencil=addLabel(group,`${String(index+1).padStart(2,'0')} / BAY ${String.fromCharCode(65+bay)}`,x+(x<0?.0004:-.0004),2.7,z,2.6,.5,x<0?Math.PI/2:-Math.PI/2,`#${paint.color.getHexString()}`);
    stencil.name=`area-${area.id}-bay-stencil-${x}-${bay}`;stencil.userData.wayfinding=true;
   }
   // Authored concrete column detail is suspended entirely above head height.
   clone(group,'concrete-column',`area-${area.id}-overhead-column-${x}`,x,2.8,bannerZ,1,.3,1);
  }
  for(const [i,z] of [b.maxZ-12,middle,b.minZ+(index===5?5:12)].entries()){
   const choices=index===5&&i<2?[-17,17,0]:index===2?[-15.5,15.5,0]:[index===3?3:0,3,-15.5,15.5,-17,17];
   const pipeX=choices.find(x=>!levelOneCollides(x,z,.4))??0;
   clone(group,'pipe-elbow-brackets',`area-${area.id}-pipe-${i}`,pipeX,2.7,z,1,.3,1,index===3?Math.PI/2:0);
   clone(group,'fluorescent-fixture',`area-${area.id}-fluorescent-${i}`,0,3.85,z);
   // Additional aisle fixtures avoid flooding the shelter with harsh white light.
   for(const x of [-15,15])clone(group,'fluorescent-fixture',`area-${area.id}-aisle-fixture-${i}-${x}`,x,3.85,z);
  }
  for(const [i,c] of (area.clues??[]).entries()){
   const text=c.label??c.text??c.title??'SERVICE DIRECTORY';const notice=addLabel(group,text,c.x,c.y??2.75,c.z,c.width??4,.65,c.rotation??0);notice.name=`area-${area.id}-clue-${c.id??i}`;notice.userData.clueId=c.id;notice.userData.clue=c;
  }
  if(index===5)addLabel(group,'PIPE SERVICE / DEMO ENDS HERE',0,2.8,b.minZ+.17,4,.5);
  group.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  group.userData.meshCount=countMeshes(group);return group;
 });
 root.userData.areaLabelCount=labels.size;
 updateStats(root);
 return root;
}

function updateStats(root){
 const groups=root.userData.areaRoots??[],attached=groups.filter(g=>g.parent===root);
 root.userData.areaStats={residentAreaCount:groups.length,visibleAreaCount:attached.length,residentMeshes:groups.reduce((n,g)=>n+g.userData.meshCount,0),visibleMeshes:attached.reduce((n,g)=>n+g.userData.meshCount,0),visibleAreaIds:attached.map(g=>g.userData.areaId),labelTextures:root.userData.areaLabelCount??0};
 return root.userData.areaStats;
}

/** Detach distant groups to bound Object3D matrix traversal as well as draws. */
export function setLevelOneAreaVisibility(root,player){
 const groups=root?.userData?.areaRoots;if(!groups?.length||!Number.isFinite(player?.z))return root?.userData?.areaStats;
 let index=groups.findIndex(g=>{const b=g.userData.area.bounds??g.userData.area.regions[0];return player.z>=b.minZ&&player.z<=b.maxZ;});
 if(index<0)index=groups.reduce((best,g,i)=>Math.abs(player.z-(g.userData.area.offsetZ-45))<Math.abs(player.z-(groups[best].userData.area.offsetZ-45))?i:best,0);
 const wanted=new Set([index]),b=groups[index].userData.area.bounds??groups[index].userData.area.regions[0];
 if(Math.abs(player.z-b.maxZ)<=24&&index>0)wanted.add(index-1);
 else if(Math.abs(player.z-b.minZ)<=24&&index<groups.length-1)wanted.add(index+1);
 groups.forEach((g,i)=>{if(wanted.has(i)){if(g.parent!==root)root.add(g);}else if(g.parent===root)root.remove(g);});
 return updateStats(root);
}

/** Reattach all owned sectors before deduplicated disposal or full-scene audits. */
export function restoreLevelOneAreas(root){
 for(const group of root?.userData?.areaRoots??[])if(group.parent!==root)root.add(group);
 return root?updateStats(root):undefined;
}
