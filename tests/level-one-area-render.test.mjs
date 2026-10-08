import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from '../dist/vendor/three.module.min.js';
import {GLTFLoader} from '../dist/vendor/GLTFLoader.js';
import {LEVEL_ONE_AREAS,levelOneCollides} from '../dist/level-one-layout.js';
import {buildLevelOneAreas,setLevelOneAreaVisibility,restoreLevelOneAreas} from '../dist/level-one-area-render.js';
import {applyWorldScaleTextures} from '../dist/zone-texture-scale.js';
const oldFetch=globalThis.fetch;
globalThis.self=globalThis;
globalThis.createImageBitmap=async()=>({width:256,height:256,close(){}});
globalThis.ProgressEvent=class{constructor(t,i){Object.assign(this,i);}};
globalThis.fetch=async(i,o)=>{const u=typeof i==='string'?i:i.url;return u.startsWith('file:')?new Response(await readFile(new URL(u))):oldFetch(i,o);};
const keys=['concrete-wall-4m','concrete-floor-4m','concrete-column','shelf-loaded','unattended-bench','wood-crate-large','pipe-elbow-brackets','emergency-light','fluorescent-fixture'];
const loader=new GLTFLoader();
const kit=Object.fromEntries(await Promise.all(keys.map(async k=>[k,(await loader.loadAsync(new URL(`../dist/assets/level1/modules/${k}.glb`,import.meta.url).href)).scene])));
const make=()=>buildLevelOneAreas(new THREE.Group(),kit);
const box=o=>new THREE.Box3().setFromObject(o);
const near=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} ~= ${b}`);

test('actual kit assembles six distinct sectors within resident and portal draw budgets',()=>{
 const root=make();assert.equal(root.userData.areaRoots.length,6);assert.equal(root.children.length,6);
 assert.equal(new Set(root.userData.areaRoots.map(g=>g.getObjectByName(`area-${g.userData.areaId}-landmark-gantry`).material.color.getHex())).size,6);
 for(const g of root.userData.areaRoots){assert.ok(g.userData.meshCount<=350,`${g.name}: ${g.userData.meshCount}`);g.traverse(o=>{assert.ok(!o.isLight);if(o.isMesh){assert.equal(o.castShadow,false);assert.equal(o.receiveShadow,false);}});}
 console.log('Actual per-sector mesh budgets:',root.userData.areaRoots.map(g=>g.userData.meshCount));
 assert.equal(root.userData.areaStats.residentMeshes,root.userData.areaStats.visibleMeshes);
});

test('solid walls match every authored footprint, perimeter and 4.2m ceiling',()=>{
 const root=make();root.updateMatrixWorld(true);
 for(const a of LEVEL_ONE_AREAS){
  const g=root.userData.areaRoots.find(g=>g.userData.areaId===a.id);
  a.walls.forEach((w,i)=>{const b=box(g.getObjectByName(`area-${a.id}-wall-${i}`));near(b.min.x,w.x-w.w/2);near(b.max.x,w.x+w.w/2);near(b.min.z,w.z-w.d/2);near(b.max.z,w.z+w.d/2);near(b.min.y,0);near(b.max.y,4.2);});
  near(box(g.getObjectByName(`area-${a.id}-west-boundary`)).max.x,-18);
  near(box(g.getObjectByName(`area-${a.id}-east-boundary`)).min.x,18);
  near(box(g.getObjectByName(`area-${a.id}-floor`)).max.y,0);
  near(box(g.getObjectByName(`area-${a.id}-ceiling`)).min.y,4.2);
  for(const child of g.children)if(/-pipe-|overhead-column/.test(child.name))assert.ok(box(child).min.y>=2.5,child.name+' bounds '+JSON.stringify(box(child)));
 }
});

test('streaming detaches distant matrices, retains neighboring portal sectors, and restores all ownership',()=>{
 const root=make();
 for(const a of LEVEL_ONE_AREAS){
  const middle=(a.bounds.minZ+a.bounds.maxZ)/2;
  const stats=setLevelOneAreaVisibility(root,{x:0,z:middle});assert.deepEqual(stats.visibleAreaIds,[a.id]);assert.equal(root.children.length,1);assert.equal(stats.residentAreaCount,6);assert.ok(stats.visibleMeshes<stats.residentMeshes);
  if(a.id<5){const stats=setLevelOneAreaVisibility(root,{z:a.bounds.minZ+24});assert.deepEqual(stats.visibleAreaIds,[a.id,a.id+1]);assert.ok(stats.visibleMeshes<=700);}
 }
 restoreLevelOneAreas(root);assert.equal(root.children.length,6);assert.equal(root.userData.areaStats.visibleAreaCount,6);
});

test('crate markers, precise safe patches and clue labels follow world-space gameplay data',()=>{
 const root=make();assert.equal(root.userData.supplyCrates.length,LEVEL_ONE_AREAS.reduce((n,a)=>n+a.crates.length,0));
 for(const a of LEVEL_ONE_AREAS){
  for(const c of a.crates){const v=root.userData.supplyCrates.find(v=>v.id===c.id);assert.ok(v);near(v.crate.position.x,c.x);near(v.crate.position.z,c.z);assert.equal(v.marker.userData.label,'SUPPLIES');}
  for(const [i,s] of a.shelters.entries()){const patch=root.getObjectByName(`area-${a.id}-shelter-floor-${i}`);near(patch.position.z,(s.minZ+s.maxZ)/2);near(patch.scale.x,s.maxX-s.minX);near(patch.scale.y,s.maxZ-s.minZ);}
  for(const c of a.clues){const clue=root.getObjectByName(`area-${a.id}-clue-${c.id}`);assert.equal(clue.userData.label,c.label);near(clue.position.z,c.z);assert.equal(clue.userData.clue.text,c.text);}
 }
 assert.ok(root.getObjectByName('sign-QUIET REFUGE'));
});

test('label texture cache uses small canvases and all sectors receive world-space UVs before detach',()=>{
 const old=globalThis.document,canvases=[];
 globalThis.document={createElement:()=>{const c={getContext:()=>({fillRect(){},strokeRect(){},fillText(){}})};canvases.push(c);return c;}};
 try{
  const root=make();assert.ok(canvases.length<=48);for(const c of canvases){assert.equal(c.width,384);assert.equal(c.height,96);}
  const supply=root.userData.supplyCrates.map(c=>c.marker.material);assert.ok(supply.every(m=>m===supply[0]));assert.equal(supply[0].map,supply[0].emissiveMap);
  applyWorldScaleTextures(root);
  for(const g of root.userData.areaRoots){let concrete=0;g.traverse(o=>{if(o.isMesh&&o.material.name==='Concrete warm aggregate'){assert.equal(o.userData.worldTextureMetres,2);concrete++;}});assert.ok(concrete>10);}
 }finally{if(old===undefined)delete globalThis.document;else globalThis.document=old;}
});

test('shelf compaction preserves every material, transformed triangle, normal, atlas UV and authored label',()=>{
 const source=kit['shelf-loaded'];const originals=[];source.traverse(o=>{if(o.isMesh)originals.push({mesh:o,geometry:o.geometry,material:o.material,position:Array.from(o.geometry.attributes.position.array)});});
 const root=make(),shelf=root.getObjectByName(`area-${LEVEL_ONE_AREAS[0].id}-shelf-0`);
 assert.deepEqual(root.userData.shelfCompaction,{beforeMeshes:61,afterMeshes:4});
 const trianglesByMaterial=object=>{
  object.updateWorldMatrix(true,true);const inv=new THREE.Matrix4().copy(object.matrixWorld).invert(),result=new Map();
  object.traverse(o=>{
   if(!o.isMesh)return;const g=o.geometry,matrix=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),p=new THREE.Vector3(),n=new THREE.Vector3(),uv=new THREE.Vector2();
   if(!result.has(o.material))result.set(o.material,[]);const values=result.get(o.material);
   for(let i=0;i<(g.index?.count??g.attributes.position.count);i++){
    const k=g.index?g.index.getX(i):i;p.fromBufferAttribute(g.attributes.position,k).applyMatrix4(matrix);n.fromBufferAttribute(g.attributes.normal,k).applyNormalMatrix(normalMatrix);uv.fromBufferAttribute(g.attributes.uv,k);
    values.push(p.x,p.y,p.z,n.x,n.y,n.z,uv.x,uv.y);
   }
  });return result;
 };
 const before=trianglesByMaterial(source),after=trianglesByMaterial(shelf);assert.equal(before.size,after.size);
 for(const [material,values] of before){const got=after.get(material);assert.ok(got,material.name);assert.equal(values.length,got.length,`${material.name}: triangle count`);for(let i=0;i<values.length;i++)near(values[i],got[i]);}
 const sourceBounds=box(source),localShelf=shelf.clone(true);localShelf.position.set(0,0,0);const mergedBounds=box(localShelf);for(const edge of ['min','max'])for(const axis of ['x','y','z'])near(sourceBounds[edge][axis],mergedBounds[edge][axis]);
 const sourceNames=originals.map(({mesh})=>mesh.name).sort(),mergedNames=shelf.children.flatMap(o=>o.userData.sourceMeshNames).sort();assert.deepEqual(mergedNames,sourceNames);
 for(const {mesh,geometry,material,position} of originals){assert.strictEqual(mesh.geometry,geometry);assert.strictEqual(mesh.material,material);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),position);}
 const triangles=[...before.values()].reduce((n,v)=>n+v.length/24,0);console.log('Shelf compaction:',{beforeMeshes:61,afterMeshes:4,triangles,exactMaterials:before.size});
});

test('compacted shelf geometry is shared within a visit, independent across visits and disposed once after streaming',async()=>{
 const {disposeZoneVisual}=await import('../dist/zone-render.js');
 const root=make(),another=make(),shelves=[];root.traverse(o=>{if(o.userData.kitAsset==='shelf-loaded')shelves.push(o);});
 const owned=new Set(shelves[0].children.map(o=>o.geometry));assert.equal(owned.size,4);for(const shelf of shelves)assert.ok(shelf.children.every(o=>owned.has(o.geometry)));
 const otherShelf=another.getObjectByName(`area-${LEVEL_ONE_AREAS[0].id}-shelf-0`);assert.ok(otherShelf.children.every(o=>!owned.has(o.geometry)));
 const disposals=new Map();for(const g of owned){disposals.set(g,0);g.addEventListener('dispose',()=>disposals.set(g,disposals.get(g)+1));}
 setLevelOneAreaVisibility(root,{z:-550});assert.ok(root.children.length<6);disposeZoneVisual(root);for(const n of disposals.values())assert.equal(n,1);
 disposeZoneVisual(root);for(const n of disposals.values())assert.equal(n,1);
});


test('three numbered wall-flush beats per flank stay clear of body routes and share paired label maps',()=>{
 const root=make();
 for(const group of root.userData.areaRoots){
  const stencils=group.children.filter(o=>o.userData.wayfinding);assert.equal(stencils.length,6);assert.equal(new Set(stencils.map(o=>o.material)).size,3);
  for(const o of stencils){assert.ok(Math.abs(o.position.x)>17.9);near(o.position.y,2.7);assert.ok(Math.abs(o.rotation.y)===Math.PI/2);assert.match(o.userData.label,/\d{2} \/ BAY [ABC]/);}
  assert.equal(new Set(stencils.map(o=>o.position.z)).size,3);
 }
 assert.ok(root.userData.areaRoots.every(g=>g.userData.meshCount<=170));
});

test('emergency fixtures meet the ceiling and entry headers are clear from the actual spawn',()=>{
 const root=make();root.updateMatrixWorld(true);
 for(const area of LEVEL_ONE_AREAS){
  const group=root.userData.areaRoots[area.id];
  group.traverse(o=>{if(o.name.includes('-safe-fixture-')){const box=new THREE.Box3().setFromObject(o);assert(box.min.y>3.99);assert(box.max.y<=4.201)}});
  const header=group.children.find(o=>o.userData.label?.startsWith(`${String(area.id+1).padStart(2,'0')}  `));assert(header);assert(area.spawn.z-header.position.z>=8);
 }
 const group=root.userData.areaRoots[0],header=group.children.find(o=>o.userData.label?.startsWith('01  '));const eye=new THREE.Vector3(0,1.63,4.5),target=header.position.clone(),ray=new THREE.Raycaster(eye,target.clone().sub(eye).normalize(),0,eye.distanceTo(target)+.01);
 assert.strictEqual(ray.intersectObject(group,true)[0]?.object,header,'the central column must not cover the entry header');
});

test('overhead pipe landmarks are placed over visible walkable aisles, never buried in solid storage masses',()=>{
 const root=make();let count=0;
 for(const group of root.userData.areaRoots)for(const child of group.children)if(/-pipe-\d+$/.test(child.name)){assert(!levelOneCollides(child.position.x,child.position.z,.4),child.name);count++}
 assert.equal(count,18);
});
