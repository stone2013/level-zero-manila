import * as THREE from './vendor/three.module.min.js';
import {createSupplyModels} from './assets/supplies/supply-models.js';
import {Game,SIZE,CELL} from './game.js';
import {loadZoneVisual,setZoneVisualState,disposeZoneVisual} from './zone-render.js';
import {GameAudio} from './audio.js';
import {createCableMonster} from './monster.js';
import {escapeDirection,escapeDarkness,escapeFrozen} from './escape.js';
import {setDeveloperEnabled,developerStatus,spawnDeveloperItem,jumpDeveloperTime,teleportDeveloper} from './developer.js';
import {RenderChunkStream,RENDER_CELLS,RENDER_METRES,visibleCorridorCells} from './world.js';
import {seededLamps,createLightBake,doorSurroundFactor} from './lighting.js';
const supplyModels=createSupplyModels();
const $=s=>document.getElementById(s), seed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
// Shared physical heights: all walls, ceiling panels, fixtures and lintels stay aligned.
const ROOM_HEIGHT=3.6,EYE_HEIGHT=1.63,DOOR_HEAD=2.66;
// Wall/floor/ceiling surfaces receive the diffuse bake once. These two soft lights
// shade the remaining Lambert props, trim, housings, and room/exit wall boxes.
const LIGHTING=Object.freeze({sky:0xfff5e2,ground:0xcdcdc2,hemisphere:1.65,directional:0.18,exposure:1.0});
let chunkStream,renderOrigin={x:0,z:0},worldLoading=true,worldRendered=false,viewOverflow=false,selectedViewCache=null,corridorViewCache=null,requestedSelection=null;
// Preserve the last presented drawing buffer while a resized view is loading.
let developerEnabled=false;
let zoneVisual=null,zoneVisualId='level0',zoneLoadToken=0,zoneLoading=false,zoneLoadError=false,interactPointer=null,noclipCue=null;
let pendingRendererSize=null,monsterVisual=null,escapeMarks=null,escapeMarkLayout=null,escapeConnection=0;
let game=new Game(5),graphicsReady=false,hasRun=false,soundEnabled=true,renderScale=1,lastRender=0,renderer,scene,camera,mazeGroup,roomGroup,exitGroup,doorPivot,itemMeshes=new Map(),last=performance.now(),toastUntil=0,dialogReturnFocus=null;
const keys=new Set(),input={forward:0,strafe:0,sprint:false},touch={move:null,look:null,sprint:new Set(),x:0,y:0},coarse=matchMedia('(pointer:coarse)').matches;
// Gate the rendered mobile viewport, not just the physical screen's orientation.
const mobile=navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||(coarse&&navigator.maxTouchPoints>0&&!matchMedia('(any-hover: hover)').matches);
let orientationBlocked=false,orientationRequestPending=false,orientationFocus=null;
function modalOpen(){return !$('help').hidden||!$('quit-panel').hidden}
function canPlay(){return game.mode==='playing'&&!game.inventoryOpen&&!game.phoneOpenId&&!worldLoading&&!orientationBlocked&&!document.hidden&&!modalOpen()}
function updateOrientation(){
 const blocked=mobile&&innerHeight>=innerWidth;
 if(blocked!==orientationBlocked){
  clearInput();cancelInventoryDrag();last=performance.now();
  orientationBlocked=blocked;
  if(blocked){orientationFocus=document.activeElement;document.exitPointerLock?.();gameAudio.stop()}
  $('game-shell').inert=blocked;
  $('rotate-overlay').hidden=!blocked;
  if(blocked)$('rotate-title').focus?.();
  else if(orientationFocus?.isConnected){orientationFocus.focus?.();orientationFocus=null}
 }
 $('rotate-lock').hidden=typeof window.screen?.orientation?.lock!=='function';
}
// Called only by explicit start/resume/rotate clicks. Fullscreen needs user activation.
async function requestLandscape(){
 const orientation=window.screen?.orientation;
 if(!mobile||document.hidden||orientationRequestPending||typeof orientation?.lock!=='function')return false;
 orientationRequestPending=true;$('rotate-lock').disabled=true;
 try{
  const standalone=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone===true;
  if(!standalone&&!document.fullscreenElement&&document.documentElement?.requestFullscreen){
   await document.documentElement.requestFullscreen();
  }
  if(document.hidden)return false;
  await orientation.lock('landscape');
  return true;
 }catch{
  $('rotate-copy').textContent='未能自动横屏。请关闭系统竖屏锁定，再把设备横过来。';
  return false;
 }finally{
  orientationRequestPending=false;$('rotate-lock').disabled=false;updateOrientation();
 }
}
let soundNoticePending=false;
const gameAudio=new GameAudio({createContext:()=>new(window.AudioContext||window.webkitAudioContext)(),canPlay,onError:()=>{soundNoticePending=true}});
// Authored texture assets are bundled locally and included in the offline cache.
const textureLoader=new THREE.TextureLoader();
function texture(path){const t=textureLoader.load(path,undefined,undefined,()=>say('纹理加载未完成。请联网后重新打开。'));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;return t}
const wallTex=texture('./textures/level0-wallpaper.webp'),floorTex=texture('./textures/level0-carpet.webp'),ceilTex=texture('./textures/level0-ceiling.webp');
// Use only one panel interior from the original 1254px source, avoiding its baked-in border.
ceilTex.wrapS=ceilTex.wrapT=THREE.ClampToEdgeWrapping;
ceilTex.offset.set(32/1254,(1254-592)/1254);ceilTex.repeat.set(560/1254,560/1254);
// Only the panel albedo is yellowed; the lamp bake and global lighting stay neutral.
const mat={wall:new THREE.MeshBasicMaterial({map:wallTex,vertexColors:true}),floor:new THREE.MeshBasicMaterial({map:floorTex,vertexColors:true}),ceiling:new THREE.MeshBasicMaterial({map:ceilTex,color:0xd6be7b}),ceilingGrid:new THREE.MeshBasicMaterial({color:new THREE.Color(0x98988c).multiplyScalar(.44)}),trim:new THREE.MeshLambertMaterial({color:0x5c5938}),wood:new THREE.MeshLambertMaterial({color:0x665033}),panel:new THREE.MeshLambertMaterial({color:0x4b3a26}),metal:new THREE.MeshLambertMaterial({color:0x3c402f}),light:new THREE.MeshBasicMaterial({color:0xffffff}),housing:new THREE.MeshLambertMaterial({color:0x535745}),room:new THREE.MeshLambertMaterial({color:0xa69869}),exit:new THREE.MeshLambertMaterial({color:0x6e7777}),paper:new THREE.MeshLambertMaterial({color:0xc7c39c}),food:new THREE.MeshLambertMaterial({color:0x9d7548}),water:new THREE.MeshLambertMaterial({color:0x719293}),phone:new THREE.MeshLambertMaterial({color:0x252b2a}),phoneScreen:new THREE.MeshBasicMaterial({color:0x495149}),cable:new THREE.MeshLambertMaterial({color:0x252923})};
// Door-only materials leave the room furniture and approved wallpaper untouched.
mat.doorWood=new THREE.MeshLambertMaterial({color:0x665033,vertexColors:true});
mat.doorMetal=new THREE.MeshLambertMaterial({color:0x78684c,vertexColors:true});
// WALLPAPER_FADE_BEGIN: albedo only, before the existing vertex-light bake.
// Median unprinted yellow-paper pixels from the approved texture: sRGB #997a21.
// Three.js decodes the sRGB map and this Color to Linear-sRGB before mixing.
const WALLPAPER_CONTRAST=.5,WALLPAPER_PAPER_SRGB=0x997a21;
mat.wall.onBeforeCompile=shader=>{
 shader.uniforms.wallpaperPaper={value:new THREE.Color(WALLPAPER_PAPER_SRGB)};
 shader.uniforms.wallpaperContrast={value:WALLPAPER_CONTRAST};
 const wallMap=THREE.ShaderChunk.map_fragment.replace('diffuseColor *= sampledDiffuseColor;',
  'sampledDiffuseColor.rgb = mix( wallpaperPaper, sampledDiffuseColor.rgb, wallpaperContrast );\n\tdiffuseColor *= sampledDiffuseColor;');
 shader.fragmentShader='uniform vec3 wallpaperPaper;\nuniform float wallpaperContrast;\n'+shader.fragmentShader.replace('#include <map_fragment>',wallMap);
};
mat.wall.customProgramCacheKey=()=> 'level0-wallpaper-contrast-v1';
// WALLPAPER_FADE_END
const boxGeo=new THREE.BoxGeometry(1,1,1);
// World-scale UVs keep every wall and floor at the same density, including short doorway pieces.
function box(group,x,y,z,w,h,d,material,insideNormal=null){
 let geo=boxGeo;
 if(material===mat.wall||material===mat.floor){
  const wall=material===mat.wall;
  geo=new THREE.BoxGeometry(w,h,d,Math.max(1,Math.ceil(w/1.25)),wall?4:1,Math.max(1,Math.ceil(d/1.25)));
  const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,metres=wall?1.40625:2,colours=new Float32Array(p.count*3);
  const fold=group.userData.folds?.find(f=>Math.abs(x-f.px)<=CELL/2+.001&&Math.abs(z-(f.z+.5)*CELL)<=CELL/2+.001);
  for(let i=0;i<p.count;i++){
   const px=p.getX(i)+x,py=p.getY(i)+y,pz=p.getZ(i)+z;
   const ux=px-(fold?fold.x*CELL:Math.floor((group.userData.origin?.x||0)/metres)*metres),uz=pz-(fold?fold.z*CELL:Math.floor((group.userData.origin?.z||0)/metres)*metres);
   if(Math.abs(n.getY(i))>.5)uv.setXY(i,ux/metres,uz/metres);
   else if(Math.abs(n.getX(i))>.5)uv.setXY(i,uz/metres,py/metres);
   else uv.setXY(i,ux/metres,py/metres);
   // The existing geometry/UVs are unchanged; bake real fixture distance, normals,
   // fixed-wall occlusion and contact shade into its existing vertex colours.
   const outside=insideNormal?n.getX(i)*insideNormal[0]+n.getY(i)*insideNormal[1]+n.getZ(i)*insideNormal[2]<.5:Math.abs(x-group.userData.door?.x)<.1&&n.getX(i)<-.5;
   const bake=wall&&group.userData.facadeBake&&outside?group.userData.facadeBake:group.userData.bake;
   const normal=[n.getX(i),n.getY(i),n.getZ(i)];
   const rgb=fold&&uz<=2.5?group.userData.foldBake.sample([ux,py,uz],normal):bake?.sample([px,py,pz],normal)||[.5,.5,.5];
   colours.set(rgb,i*3);
  }
  uv.needsUpdate=true;geo.setAttribute('color',new THREE.BufferAttribute(colours,3));
 }
 const mesh=new THREE.Mesh(geo,material);mesh.position.set(x,y,z);if(geo===boxGeo)mesh.scale.set(w,h,d);
 // Tint the existing doorway flanks/lintel only; the wooden frame/leaf retain their readable fill.
 if(material===mat.room&&group.userData.door){const shade=doorSurroundFactor([x,y,z],group.userData.door);mesh.userData.lightTint=[shade,shade,shade]}
 group.add(mesh);return mesh
}
// Preserve the room-facing beige surface; only the corridor-facing shell gets wallpaper.
function facadeBox(group,x,y,z,w,h,d,insideFace=0){
 const normals=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
 const mesh=box(group,x,y,z,w,h,d,mat.wall,normals[insideFace]);
 mesh.material=Array(6).fill(mat.wall);mesh.material[insideFace]=mat.room;
 mesh.userData.roomShell=true;mesh.userData.insideFace=insideFace;mesh.userData.doorFacade=insideFace===0;return mesh;
}
function ceiling(group,x,z,w,d){
 // Separate the panel from its backing by 20mm so distant panels do not depth-fight.
 box(group,x,ROOM_HEIGHT+.08,z,w,.16,d,mat.ceilingGrid);
 const nx=Math.ceil(w/1.25),nz=Math.ceil(d/1.25),tw=w/nx,td=d/nz;
 const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(Math.PI/2);
 const panels=new THREE.InstancedMesh(geometry,mat.ceiling,nx*nz),dummy=new THREE.Object3D(),colour=new THREE.Color();
 for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
  dummy.position.set(x-w/2+(ix+.5)*tw,ROOM_HEIGHT-.02,z-d/2+(iz+.5)*td);
  dummy.scale.set(tw-.025,1,td-.025);dummy.updateMatrix();const index=ix*nz+iz;if(group.userData.origin){dummy.position.x-=group.userData.origin.x;dummy.position.z-=group.userData.origin.z;dummy.updateMatrix()}panels.setMatrixAt(index,dummy.matrix);
  const sx=dummy.position.x+(group.userData.origin?.x||0),sz=dummy.position.z+(group.userData.origin?.z||0);
  const fold=group.userData.folds?.find(f=>Math.abs(sx-f.px)<CELL/2&&sz>f.z*CELL&&sz<f.z*CELL+2.5);
  const rgb=fold?group.userData.foldBake.sample([sx-fold.x*CELL,dummy.position.y,sz-fold.z*CELL],[0,-1,0]):group.userData.bake?.sample([sx,dummy.position.y,sz],[0,-1,0])||[.45,.45,.45];colour.setRGB(...rgb);panels.setColorAt(index,colour);
 }
 panels.instanceMatrix.needsUpdate=true;panels.instanceColor.needsUpdate=true;panels.computeBoundingSphere();if(group.userData.origin)panels.position.set(group.userData.origin.x,0,group.userData.origin.z);group.add(panels)
}
// Group only static repeated boxes. Hinged doors and inventory items stay independently movable.
function batchStaticBoxes(group){const batches=new Map();for(const mesh of [...group.children])if(mesh.isMesh&&!mesh.isInstancedMesh&&mesh.geometry===boxGeo){const list=batches.get(mesh.material)||[];list.push(mesh);batches.set(mesh.material,list)}for(const[material,meshes]of batches){if(meshes.length<2)continue;const batch=new THREE.InstancedMesh(boxGeo,material,meshes.length);meshes.forEach((mesh,i)=>{const ox=group.userData.origin?.x||0,oz=group.userData.origin?.z||0;mesh.position.x-=ox;mesh.position.z-=oz;mesh.updateMatrix();batch.setMatrixAt(i,mesh.matrix);if(mesh.userData.lightTint)batch.setColorAt(i,new THREE.Color().setRGB(...mesh.userData.lightTint));group.remove(mesh)});batch.instanceMatrix.needsUpdate=true;if(batch.instanceColor)batch.instanceColor.needsUpdate=true;batch.computeBoundingSphere();if(group.userData.origin)batch.position.set(group.userData.origin.x,0,group.userData.origin.z);group.add(batch)}}
// Bake once, then merge by 15-metre chunks: bounded draw calls with frustum culling.
// Keep the persistent room separate, so changing the door connection cannot hide it.
function* batchBakedSurfaces(group){
 const chunks=new Map();
 for(const mesh of [...group.children])if(!mesh.isInstancedMesh&&[mat.wall,mat.floor].includes(mesh.material)){
  const key=mesh.material===mat.wall?'wall':'floor';
  const list=chunks.get(key)||[];list.push(mesh);chunks.set(key,list);
 }
 for(const meshes of chunks.values()){
  const vertexCount=meshes.reduce((n,m)=>n+m.geometry.attributes.position.count,0),indexCount=meshes.reduce((n,m)=>n+m.geometry.index.count,0);
  // Write directly into final buffers instead of building and copying large JS
  // number arrays. Yield between source surfaces so merging cannot monopolize a frame.
  const positions=new Float32Array(vertexCount*3),normals=new Float32Array(vertexCount*3),uvs=new Float32Array(vertexCount*2),colors=new Float32Array(vertexCount*3),indices=vertexCount>65535?new Uint32Array(indexCount):new Uint16Array(indexCount);
  let offset=0,indexOffset=0;
  for(const mesh of meshes){const attrs=mesh.geometry.attributes;
   for(let i=0;i<attrs.position.count;i++){
    const j=(i+offset)*3;
    positions[j]=attrs.position.getX(i)+mesh.position.x-(group.userData.origin?.x||0);positions[j+1]=attrs.position.getY(i)+mesh.position.y;positions[j+2]=attrs.position.getZ(i)+mesh.position.z-(group.userData.origin?.z||0);
   }
   normals.set(attrs.normal.array,offset*3);uvs.set(attrs.uv.array,offset*2);colors.set(attrs.color.array,offset*3);
   for(const i of mesh.geometry.index.array)indices[indexOffset++]=i+offset;
   offset+=attrs.position.count;group.remove(mesh);mesh.geometry.dispose();yield;
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,array,size] of [['position',positions,3],['normal',normals,3],['uv',uvs,2],['color',colors,3]])geometry.setAttribute(name,new THREE.BufferAttribute(array,size));
  geometry.setIndex(new THREE.BufferAttribute(indices,1));geometry.computeBoundingBox();geometry.computeBoundingSphere();const batch=new THREE.Mesh(geometry,meshes[0].material);batch.userData.bakedChunk=true;if(group.userData.origin)batch.position.set(group.userData.origin.x,0,group.userData.origin.z);group.add(batch);yield;
 }
}
function batchCeilingPanels(group){
 const panels=group.children.filter(o=>o.isInstancedMesh&&o.material===mat.ceiling);if(panels.length<2)return;
 const total=panels.reduce((n,p)=>n+p.count,0),batch=new THREE.InstancedMesh(panels[0].geometry,mat.ceiling,total),matrix=new THREE.Matrix4(),color=new THREE.Color();let index=0;
 for(const panel of panels){for(let i=0;i<panel.count;i++){panel.getMatrixAt(i,matrix);batch.setMatrixAt(index,matrix);panel.getColorAt(i,color);batch.setColorAt(index++,color)}group.remove(panel);panel.dispose();if(panel!==panels[0])panel.geometry.dispose()}
 batch.instanceMatrix.needsUpdate=true;batch.instanceColor.needsUpdate=true;batch.computeBoundingSphere();batch.position.set(group.userData.origin.x,0,group.userData.origin.z);group.add(batch);
}
function pixelRatio(width,height,dpr,coarse,scale=1){const ceiling=coarse?1.35:1.6,budget=coarse?1100000:2000000;return Math.min(dpr,ceiling,Math.sqrt(budget/Math.max(1,width*height)))*scale}
function label(text,w=256,h=64){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#b5ad7d';ctx.fillRect(0,0,w,h);ctx.fillStyle='#353c2b';ctx.font=`500 ${h*.43}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t})}
function makeFixture(g,x,z){
 const lamp=g.userData.lamps.find(l=>l.x===x&&l.z===z);
 box(g,x,ROOM_HEIGHT-.07,z,1.35,.09,.42,mat.housing);
 const tint=lamp?lamp.color.map(c=>c*(.86+.08*(lamp.intensity-.92)/.16)):[.9,.89,.86];
 for(const [y,dz,w,h,d] of [[ROOM_HEIGHT-.123,0,1.15,.014,.16],[ROOM_HEIGHT-.138,-.13,1.1,.018,.035],[ROOM_HEIGHT-.138,.13,1.1,.018,.035]])box(g,x,y,z+dz,w,h,d,mat.light).userData.lightTint=tint;
}
function prepareLighting(m){
 mazeGroup.userData.folds=m.folds;
 const foldLamp=seededLamps([{x:2.5,z:2.5}],m.seed,ROOM_HEIGHT)[0];
 mazeGroup.userData.foldLamp=foldLamp;
 mazeGroup.userData.foldBake=createLightBake([foldLamp],[{x:2.5,z:0,w:5,d:.16},{x:0,z:2.5,w:.16,d:5},{x:5,z:2.5,w:.16,d:5},{x:2.5,z:2.5,w:2.6,d:.16}],ROOM_HEIGHT);
 const x=Math.floor(m.doorX/CELL),z=Math.floor(m.doorZ/CELL),cells=game.world.cellsInRect(x-3,z-3,x+3,z+3).filter(c=>c.active);
 const blockers=[...game.world.wallsInRect(x-3,z-3,x+3,z+3),...game.roomWalls,{x:m.doorX,z:m.doorZ,w:.16,d:1.8,ymin:DOOR_HEAD,ymax:ROOM_HEIGHT}],door={x:m.doorX,z:m.doorZ};
 roomGroup.userData.lamps=seededLamps([{x:m.doorX+3,z:m.doorZ}],m.seed,ROOM_HEIGHT);roomGroup.userData.door=door;
 roomGroup.userData.facadeBake=createLightBake(seededLamps(cells.map(c=>({x:(c.x+.5)*CELL,z:(c.z+.5)*CELL})),m.seed,ROOM_HEIGHT),blockers,ROOM_HEIGHT,door);
 roomGroup.userData.bake=createLightBake(roomGroup.userData.lamps,blockers,ROOM_HEIGHT,door);
 exitGroup.userData.lamps=seededLamps([{x:m.doorX-3,z:m.doorZ},{x:m.doorX-7,z:m.doorZ}],m.seed,ROOM_HEIGHT);
 exitGroup.userData.bake=createLightBake(exitGroup.userData.lamps,[{x:m.doorX-4.8,z:m.doorZ-1.28,w:9.6,d:.16},{x:m.doorX-4.8,z:m.doorZ+1.28,w:9.6,d:.16}],ROOM_HEIGHT,door);
}
// Shared materials/textures/boxGeo live for the application; every chunk owns
// only its generated geometries and instance buffers. Never dispose shared assets.
function disposeChunk(group){const geometries=new Set();group.traverse(o=>{if(o.isMesh){o.dispose?.();if(o.geometry!==boxGeo)geometries.add(o.geometry)}});for(const g of geometries)g.dispose();group.userData.bake?.clear();group.userData.bake=null;group.removeFromParent();group.clear()}
function createRenderChunk(rx,rz){
 const group=new THREE.Group(),x0=rx*RENDER_CELLS,z0=rz*RENDER_CELLS,origin={x:rx*RENDER_METRES,z:rz*RENDER_METRES};
 group.userData.origin=origin;group.userData.chunkKey=`${rx},${rz}`;group.visible=false;mazeGroup.add(group);
 function* buildChunk(){
  const cells=game.world.cellsInRect(x0,z0,x0+RENDER_CELLS-1,z0+RENDER_CELLS-1).filter(c=>c.active),halo=game.world.cellsInRect(x0-3,z0-3,x0+RENDER_CELLS+2,z0+RENDER_CELLS+2).filter(c=>c.active);
  const walls=game.world.wallsInRect(x0-1,z0-1,x0+RENDER_CELLS,z0+RENDER_CELLS).filter(w=>Math.floor(w.x/RENDER_METRES)===rx&&Math.floor(w.z/RENDER_METRES)===rz);
  const blockers=[...game.world.wallsInRect(x0-3,z0-3,x0+RENDER_CELLS+2,z0+RENDER_CELLS+2),...game.roomWalls],foldLamp=mazeGroup.userData.foldLamp;
  group.userData.folds=game.maze.folds;group.userData.foldBake=mazeGroup.userData.foldBake;
  group.userData.lamps=seededLamps(halo.map(c=>({x:(c.x+.5)*CELL,z:(c.z+.5)*CELL})),game.maze.seed,ROOM_HEIGHT).map(l=>game.maze.folds.some(f=>f.px===l.x&&(f.z+.5)*CELL===l.z)?{...l,intensity:foldLamp.intensity,color:foldLamp.color}:l);
  group.userData.bake=createLightBake(group.userData.lamps,blockers,ROOM_HEIGHT,{x:game.maze.doorX,z:game.maze.doorZ});yield;
  for(const c of cells){const x=(c.x+.5)*CELL,z=(c.z+.5)*CELL;box(group,x,-.08,z,CELL,.16,CELL,mat.floor);yield;ceiling(group,x,z,CELL,CELL);yield;makeFixture(group,x,z);yield}
  for(const w of walls){box(group,w.x,ROOM_HEIGHT/2,w.z,w.w,ROOM_HEIGHT,w.d,mat.wall);yield;box(group,w.x,.07,w.z,w.w+.025,.14,w.d+.025,mat.trim);box(group,w.x,ROOM_HEIGHT-.08,w.z,w.w+.018,.16,w.d+.018,mat.trim);yield}
  batchCeilingPanels(group);yield;batchStaticBoxes(group);yield;yield* batchBakedSurfaces(group);
  for(const child of group.children){child.position.x-=origin.x;child.position.z-=origin.z}group.position.set(origin.x,0,origin.z);
  group.userData.bake.clear();group.userData.bake=null;group.userData.lamps=null;group.userData.foldBake=null;group.visible=true;
 }
 return{value:group,iterator:buildChunk()};
}
// Request the real perspective frustum intersected with the room-height band.
// A 65 m far plane is NOT a 65 m circle: its wide-view corners reach farther.
const viewProbe=new THREE.PerspectiveCamera(76,1,.06,65),viewFrustum=new THREE.Frustum(),viewMatrix=new THREE.Matrix4(),viewBox=new THREE.Box3();
viewProbe.rotation.order='YXZ';
function currentView(){const menu=game.mode==='menu'&&!hasRun;return{x:menu?game.maze.doorX-12.5:game.player.x,z:menu?game.maze.doorZ-1.35:game.player.z,yaw:menu?-Math.PI/2+.14:-game.player.yaw,pitch:menu?-.025:game.player.pitch,aspect:innerWidth/Math.max(1,innerHeight)}}
function selectFrustumRegions(view){
 const signature=[view.x,view.z,view.yaw,view.pitch,view.aspect,game.foldState,hasRun,game.pendingFold?.x,game.pendingFold?.z].join(',');if(selectedViewCache?.signature===signature)return selectedViewCache;
 // Explicit support boundary instead of silently dropping visible tiles on an
 // arbitrarily wide window. Portrait mobile is already paused separately.
 if(!Number.isFinite(view.aspect)||view.aspect<=0||view.aspect>4)return{signature,overflow:true,points:[],requiredCount:0};
 viewProbe.aspect=view.aspect;viewProbe.updateProjectionMatrix();viewProbe.position.set(view.x,EYE_HEIGHT,view.z);viewProbe.rotation.set(view.pitch,view.yaw,0,'YXZ');viewProbe.updateMatrixWorld();viewMatrix.multiplyMatrices(viewProbe.projectionMatrix,viewProbe.matrixWorldInverse);viewFrustum.setFromProjectionMatrix(viewMatrix);
 const reach=65*Math.sqrt(1+Math.tan(76*Math.PI/360)**2*(1+view.aspect**2)),radius=Math.ceil(reach/RENDER_METRES)+1,cx=Math.floor(view.x/RENDER_METRES),cz=Math.floor(view.z/RENDER_METRES),points=[];
 for(let z=cz-radius;z<=cz+radius;z++)for(let x=cx-radius;x<=cx+radius;x++){
  viewBox.min.set(x*RENDER_METRES-.1,-.16,z*RENDER_METRES-.1);viewBox.max.set((x+1)*RENDER_METRES+.1,ROOM_HEIGHT+.2,(z+1)*RENDER_METRES+.1);
  const required=(x===cx&&z===cz)||viewFrustum.intersectsBox(viewBox);
  if(!required){viewBox.min.x-=8;viewBox.min.z-=8;viewBox.max.x+=8;viewBox.max.z+=8;if(!viewFrustum.intersectsBox(viewBox))continue}
  points.push({x,z,required});
 }
 // The hidden folds may land behind the current camera. Prepare the destination
 // floor before crossing; its new view is then loaded before the next presentation.
 const requirePoint=(x,z)=>{const rx=Math.floor(x/RENDER_METRES),rz=Math.floor(z/RENDER_METRES),point=points.find(p=>p.x===rx&&p.z===rz);if(point)point.required=true;else points.push({x:rx,z:rz,required:true})};
 for(const dx of [-.5,.5])for(const dz of [-.5,.5])requirePoint(view.x+dx,view.z+dz);
 if(hasRun&&!game.changed){const[a,b]=game.activeFolds();for(const[from,to]of [[a,b],[b,a]])if(Math.hypot(game.player.x-from.px,game.player.z-from.pz)<8)for(const dx of [-2,2])for(const dz of [-.9,.9])requirePoint(to.px+dx,to.pz+dz);if(game.pendingFold)requirePoint(game.pendingFold.x,game.pendingFold.z)}
 points.sort((a,b)=>Number(b.required)-Number(a.required)||Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz));
 const requiredCount=points.filter(p=>p.required).length;selectedViewCache={signature,points,requiredCount,overflow:requiredCount>49};return selectedViewCache;
}
// Opaque full-height maze walls hide most of the distant frustum. Prepare the
// complete angular corridor visibility once per position, so yaw/pitch alone can
// never turn an already-ready corridor into another blocking load. The old full
// frustum remains the conservative fallback for unusual/ambiguous locations.
function selectViewRegions(view){
 if(!Number.isFinite(view.aspect)||view.aspect<=0||view.aspect>4)return selectFrustumRegions(view);
 const signature=[view.x,view.z,view.aspect,game.foldState,hasRun,game.pendingFold?.x,game.pendingFold?.z].join(',');
 if(corridorViewCache?.signature===signature)return corridorViewCache;
 const reach=65*Math.sqrt(1+Math.tan(76*Math.PI/360)**2*(1+view.aspect**2));
 const cells=visibleCorridorCells(game.world,view.x,view.z,reach);
 if(!cells)return selectFrustumRegions(view);
 const required=new Map(),cx=Math.floor(view.x/RENDER_METRES),cz=Math.floor(view.z/RENDER_METRES);
 const add=(x,z)=>{const rx=Math.floor(x/RENDER_METRES),rz=Math.floor(z/RENDER_METRES);required.set(rx+','+rz,{x:rx,z:rz,required:true})};
 // Include both owners of every visible boundary wall, also at negative seams.
 for(const c of cells)for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)add((c.x+dx+.5)*CELL,(c.z+dz+.5)*CELL);
 for(const dx of [-.5,.5])for(const dz of [-.5,.5])add(view.x+dx,view.z+dz);
 if(hasRun&&!game.changed){const[a,b]=game.activeFolds();for(const[from,to]of [[a,b],[b,a]])if(Math.hypot(game.player.x-from.px,game.player.z-from.pz)<8)for(const dx of [-2,2])for(const dz of [-.9,.9])add(to.px+dx,to.pz+dz);if(game.pendingFold)add(game.pendingFold.x,game.pendingFold.z)}
 // Pathological open views keep the old, complete current-camera fallback;
 // never discard a visible region merely to meet the memory budget.
 if(required.size>49)return selectFrustumRegions(view);
 const optional=new Map();for(const p of required.values())for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const x=p.x+dx,z=p.z+dz,key=x+','+z;if(!required.has(key))optional.set(key,{x,z,required:false})}
 const distance=(a,b)=>Math.hypot(a.x-cx,a.z-cz)-Math.hypot(b.x-cx,b.z-cz);
 const points=[...[...required.values()].sort(distance),...[...optional.values()].sort(distance)];
 corridorViewCache={signature,points,requiredCount:required.size,overflow:false,corridor:true};return corridorViewCache;
}
function updateStreamView(){
 if(game.zone!=='level0'){
  ensureZoneVisual();worldLoading=zoneLoading||zoneLoadError;viewOverflow=false;
  $('world-loading').hidden=!worldLoading;$('world-loading').style.pointerEvents=zoneLoadError?'auto':'none';$('world-loading').tabIndex=zoneLoadError?0:-1;
  $('world-loading').textContent=zoneLoadError?'场景未加载成功。点此重试；物资与时间已暂停。':'正在加载完整场景…';
  $('start').disabled=true;return;
 }
 const wasLoading=worldLoading;
 if(game.changed){worldLoading=false;viewOverflow=false}
 else{const view=currentView(),selection=selectViewRegions(view);viewOverflow=selection.overflow;if(requestedSelection!==selection){requestedSelection=chunkStream.request(selection.points,view.x,view.z)?selection:null}worldLoading=viewOverflow||!requestedSelection||!chunkStream.requiredReady()}
 $('world-loading').hidden=!worldLoading;
 $('world-loading').textContent=viewOverflow?'视口过宽，请缩窄窗口后继续。':worldRendered?'正在准备新的视野，稍等片刻…':'正在生成后室，准备完整视野…';
 $('start').disabled=!graphicsReady||worldLoading;
 if(worldLoading&&!wasLoading){clearInput();gameAudio.resetTracking()}
}
function prepareStream(){
 chunkStream=new RenderChunkStream({create:createRenderChunk,dispose:disposeChunk});worldRendered=false;worldLoading=true;selectedViewCache=null;corridorViewCache=null;requestedSelection=null;$('world').style.visibility='hidden';
 // Local item visibility is deliberately separate from whole-view readiness.
 game.escapeViewReady=()=>!worldLoading;
 game.renderReady=(x,z)=>[-.22,.22].every(dx=>[-.22,.22].every(dz=>chunkStream.readyAt(x+dx,z+dz)));
 updateStreamView();
}
// MANILA_DOOR_MODEL_BEGIN: local low-poly joinery, shared vertex-colour materials.
// The original hinge axis and 0.11 x 2.56 x 1.60 m leaf envelope are unchanged.
// Grain is baked into geometry colours once; no texture, shader, light or collider.
function makeManilaDoor(parent,m){
 const frame=new THREE.Group(),pivot=new THREE.Group();
 frame.name='Manila door frame';frame.position.set(m.doorX,0,m.doorZ-.8);parent.add(frame);
 pivot.name='Manila door leaf';pivot.position.copy(frame.position);parent.add(pivot);
 const makeBuilder=group=>({group,batches:new Map(),parts:[]});
 const fixed=makeBuilder(frame),moving=makeBuilder(pivot);
 function add(builder,name,geometry,material,tone=1,grain=null){
  const p=geometry.attributes.position,colours=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
   const y=p.getY(i),z=p.getZ(i),across=grain==='horizontal'?y:z,along=grain==='horizontal'?z:y;
   // 1–3 cm, low-contrast fibres. Cross rails run horizontally; stiles/panels vertically.
   let shade=tone;
   if(grain){shade*=.97+.043*Math.sin(across*347+.35*Math.sin(along*3.1))+.022*Math.sin(across*911+along*.7);shade*=1+.025*Math.exp(-y*5)}
   colours.set([shade,shade*.995,shade*.982],i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colours,3));geometry.computeBoundingBox();
  builder.parts.push({name,material:material===mat.doorWood?'wood':'metal',min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray(),triangles:geometry.index.count/3});
  const list=builder.batches.get(material)||[];list.push(geometry);builder.batches.set(material,list);
 }
 function plank(builder,name,x,y,z,w,h,d,grain='vertical',tone=1){
  const hs=grain==='horizontal'?Math.max(1,Math.ceil(h/.015)):Math.max(1,Math.ceil(h/.65));
  const ds=grain==='vertical'?Math.max(1,Math.ceil(d/.015)):Math.max(1,Math.ceil(d/.65));
  const geo=new THREE.BoxGeometry(w,h,d,1,hs,ds);geo.translate(x,y,z);add(builder,name,geo,mat.doorWood,tone,grain);
 }
 function metalBox(builder,name,x,y,z,w,h,d,tone=1){const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);add(builder,name,g,mat.doorMetal,tone)}
 function cylinder(builder,name,x,y,z,r,h,axis='y',tone=1){const g=new THREE.CylinderGeometry(r,r,h,8,1);if(axis==='x')g.rotateZ(Math.PI/2);if(axis==='z')g.rotateX(Math.PI/2);g.translate(x,y,z);add(builder,name,g,mat.doorMetal,tone)}
 function quad(builder,name,points,tone){
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();add(builder,name,g,mat.doorWood,tone);
 }
 function panel(name,z0,z1,y0,y1){
  const inset=.035,inner=[z0+inset,z1-inset,y0+inset,y1-inset];
  plank(moving,name+' recessed centre',0,(y0+y1)/2,(z0+z1)/2,.052,y1-y0-2*inset,z1-z0-2*inset,'vertical',.93);
  for(const side of [-1,1]){
   const outer=[[side*.05,y0,z0],[side*.05,y1,z0],[side*.05,y1,z1],[side*.05,y0,z1]];
   const inside=[[side*.026,inner[2],inner[0]],[side*.026,inner[3],inner[0]],[side*.026,inner[3],inner[1]],[side*.026,inner[2],inner[1]]];
   for(let i=0;i<4;i++){const j=(i+1)%4,points=[outer[i],outer[j],inside[j],inside[i]];if(side===-1)points.reverse();quad(moving,`${name} ${side} bevel ${i}`,points,.86)}
  }
 }
 // A stepped casing and inner jamb fit entirely within the old frame bounds.
 // No raised threshold: the walking surface and full existing passage stay clear.
 for(const side of [-1,1]){
  const z=.8+side*.935;
  plank(fixed,`frame ${side} body`,-.0575,1.305,z,.225,2.61,.15);
  plank(fixed,`frame ${side} outer bead`,-.153,1.35,.8+side*.9675,.044,2.70,.085,'vertical',1.04);
  plank(fixed,`frame ${side} jamb`,-.03,1.305,.8+side*.835,.17,2.61,.05,'vertical',.87);
 }
 plank(fixed,'frame header',-.0575,2.7,.8,.225,.18,2.02,'horizontal');
 plank(fixed,'frame header bead',-.153,2.745,.8,.044,.09,2.02,'horizontal',1.04);
 // Joinery replaces the old slab plus applied rectangles with real 24 mm recesses.
 for(const [name,z,w]of [['hinge stile',.08,.16],['centre stile',.8,.13],['latch stile',1.52,.16]])plank(moving,name,0,1.28,z,.11,2.56,w);
 for(const [name,y,h]of [['bottom rail',.095,.19],['lock rail',1.275,.25],['top rail',2.46,.2]])for(const z of [.4475,1.1525])plank(moving,name+' '+z,0,y,z,.11,h,.575,'horizontal');
 panel('lower left',.16,.735,.19,1.15);panel('lower right',.865,1.44,.19,1.15);
 panel('upper left',.16,.735,1.4,2.36);panel('upper right',.865,1.44,1.4,2.36);
 // Muted brass hardware sits on the latch stile, on both faces; it all follows the leaf.
 for(const side of [-1,1]){
  metalBox(moving,`handle ${side} plate`,side*.06,1.275,1.515,.01,.24,.105,.79);
  cylinder(moving,`handle ${side} rose`,side*.07,1.30,1.51,.043,.012,'x',.93);
  cylinder(moving,`handle ${side} stem`,side*.098,1.30,1.51,.019,.056,'x');
  cylinder(moving,`handle ${side} lever`,side*.127,1.30,1.43,.021,.19,'z',1.07);
  cylinder(moving,`handle ${side} keyhole`,side*.067,1.213,1.515,.01,.004,'x',.28);
  for(const y of [1.174,1.376])cylinder(moving,`handle ${side} screw ${y}`,side*.067,y,1.515,.006,.004,'x',.6);
 }
 // The pin is exactly the existing Y rotation axis. Alternating knuckles are fixed
 // to the jamb or attached to the moving leaf rather than floating beside the door.
 for(const [index,y]of [.30,1.28,2.26].entries()){
  metalBox(fixed,`hinge ${index} fixed plate`,.027,y,-.007,.056,.16,.006,.79);
  metalBox(fixed,`hinge ${index} fixed tab`,.025,y,-.002,.05,.11,.004,.79);
  metalBox(moving,`hinge ${index} leaf plate`,.058,y,.061,.006,.16,.116,.86);
  metalBox(moving,`hinge ${index} leaf tab`,.0285,y,.015,.057,.10,.028,.86);
  for(let k=0;k<5;k++)cylinder(k%2?moving:fixed,`hinge ${index} knuckle ${k}`,0,y+(k-2)*.028,0,.013,.027,'y',k%2?.98:.9);
 }
 // Four draw calls total (wood/metal for fixed frame and moving leaf), with no
 // per-frame rebuilding. Disposal follows the scene's existing geometry lifecycle.
 for(const builder of [fixed,moving]){
  for(const[material,geometries]of builder.batches){
   const p=[],n=[],c=[],idx=[];let offset=0;
   for(const g of geometries){p.push(...g.attributes.position.array);n.push(...g.attributes.normal.array);c.push(...g.attributes.color.array);for(const i of g.index.array)idx.push(i+offset);offset+=g.attributes.position.count;g.dispose()}
   const geometry=new THREE.BufferGeometry();for(const[name,data]of [['position',p],['normal',n],['color',c]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(data,3));geometry.setIndex(idx);geometry.computeBoundingBox();geometry.computeBoundingSphere();
   const mesh=new THREE.Mesh(geometry,material);mesh.name=material===mat.doorWood?'Manila wood joinery':'Manila brass hardware';builder.group.add(mesh);
  }
  builder.group.userData.doorParts=builder.parts;
 }
 pivot.userData.leafEnvelope={width:.11,height:2.56,depth:1.6};
 return pivot;
}
// MANILA_DOOR_MODEL_END

function createItemMesh(i){const g=i.kind==='food'||i.kind==='water'?supplyModels.create(i.kind):new THREE.Group();if(i.kind==='phone'){box(g,0,.016,0,.16,.032,.27,mat.phone);box(g,0,.034,0,.135,.005,.218,mat.phoneScreen);box(g,0,.039,-.106,.047,.004,.008,mat.metal)}scene.add(g);itemMeshes.set(i.id,g);return g}

function build(){supplyModels.dispose();zoneLoadToken++;zoneLoading=false;zoneLoadError=false;zoneVisualId='level0';if(zoneVisual){disposeZoneVisual(zoneVisual);zoneVisual=null}noclipCue=null;monsterVisual?.dispose();monsterVisual=null;escapeMarks=null;escapeMarkLayout=null;escapeConnection=0;chunkStream?.clear();if(scene)scene.traverse(o=>{if(o.isMesh&&!o.userData.sharedSupply){o.dispose?.();if(o.geometry!==boxGeo)o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])if(material&&!Object.values(mat).includes(material)){material.map?.dispose();material.dispose()}}});scene=new THREE.Scene();scene.background=new THREE.Color(0x626354);scene.fog=new THREE.Fog(0x626354,16,80);scene.add(new THREE.HemisphereLight(LIGHTING.sky,LIGHTING.ground,LIGHTING.hemisphere));const directional=new THREE.DirectionalLight(LIGHTING.sky,LIGHTING.directional);directional.position.set(4,10,5);scene.add(directional);camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.06,65);camera.rotation.order='YXZ';mazeGroup=new THREE.Group();roomGroup=new THREE.Group();exitGroup=new THREE.Group();scene.add(mazeGroup,roomGroup,exitGroup);exitGroup.visible=false;const m=game.maze;prepareLighting(m);
for(const w of game.roomWalls){const insideFace=Math.abs(w.x-m.doorX)<.01?0:w.w>w.d?(w.z<m.doorZ?4:5):1;facadeBox(roomGroup,w.x,ROOM_HEIGHT/2,w.z,w.w,ROOM_HEIGHT,w.d,insideFace);box(roomGroup,w.x,.07,w.z,w.w+.025,.14,w.d+.025,mat.trim);box(roomGroup,w.x,ROOM_HEIGHT-.08,w.z,w.w+.018,.16,w.d+.018,mat.trim)}
box(roomGroup,m.doorX+3,-.08,m.doorZ,6,.16,5,mat.floor);ceiling(roomGroup,m.doorX+3,m.doorZ,6,5);makeFixture(roomGroup,m.doorX+3,m.doorZ);facadeBox(roomGroup,m.doorX,(ROOM_HEIGHT+DOOR_HEAD)/2,m.doorZ,.16,ROOM_HEIGHT-DOOR_HEAD,1.8);box(roomGroup,m.doorX,ROOM_HEIGHT-.08,m.doorZ,.178,.16,1.818,mat.trim);
doorPivot=makeManilaDoor(roomGroup,m);const sign=new THREE.Mesh(new THREE.PlaneGeometry(1,.22),label('MANILA'));sign.position.set(m.doorX-.13,2.91,m.doorZ);sign.rotation.y=-Math.PI/2;roomGroup.add(sign);
// Low bench, two finite bottles, and a paper note.
box(roomGroup,m.doorX+4.4,.61,m.doorZ+.5,.8,.12,2.7,mat.wood);for(const z of [-.55,1.55])for(const x of [4.12,4.68])box(roomGroup,m.doorX+x,.29,m.doorZ+z,.075,.58,.075,mat.wood);box(roomGroup,m.doorX+4.35,.681,m.doorZ+1.4,.42,.012,.48,mat.paper);for(let i=0;i<5;i++)box(roomGroup,m.doorX+4.35,.689,m.doorZ+1.26+i*.056,.29,.002,.009,mat.panel);
// A fixed wall socket and short tabletop cable: purely visual, no extra collider.
box(roomGroup,m.doorX+5.89,.92,m.doorZ-.65,.10,.22,.18,mat.paper);
box(roomGroup,m.doorX+5.81,.92,m.doorZ-.65,.08,.095,.085,mat.cable);
const cableCurve=new THREE.CatmullRomCurve3([new THREE.Vector3(m.doorX+5.77,.92,m.doorZ-.65),new THREE.Vector3(m.doorX+5.45,.72,m.doorZ-.64),new THREE.Vector3(m.doorX+4.72,.69,m.doorZ-.66),new THREE.Vector3(m.doorX+4.35,.69,m.doorZ-.62)]);
const cableMesh=new THREE.Mesh(new THREE.TubeGeometry(cableCurve,16,.012,5,false),mat.cable);cableMesh.userData.chargingCable=true;roomGroup.add(cableMesh);
box(roomGroup,m.doorX+4.30,.696,m.doorZ-.62,.10,.026,.044,mat.metal);
box(exitGroup,m.doorX-4.8,-.08,m.doorZ,9.6,.16,2.4,mat.exit);box(exitGroup,m.doorX-4.8,ROOM_HEIGHT+.08,m.doorZ,9.6,.16,2.4,mat.exit);box(exitGroup,m.doorX-4.8,ROOM_HEIGHT/2,m.doorZ-1.28,9.6,ROOM_HEIGHT,.16,mat.exit);box(exitGroup,m.doorX-4.8,ROOM_HEIGHT/2,m.doorZ+1.28,9.6,ROOM_HEIGHT,.16,mat.exit);box(exitGroup,m.doorX-9.5,ROOM_HEIGHT/2,m.doorZ,.1,ROOM_HEIGHT,2.4,new THREE.MeshBasicMaterial({color:0x899ba0}));makeFixture(exitGroup,m.doorX-3,m.doorZ);makeFixture(exitGroup,m.doorX-7,m.doorZ);itemMeshes.clear();for(const i of game.items)createItemMesh(i);batchStaticBoxes(roomGroup);batchStaticBoxes(exitGroup);roomGroup.userData.bake.clear();roomGroup.userData.facadeBake.clear();exitGroup.userData.bake.clear();prepareStream();sync();}
function ensureZoneVisual(){
 if(game.zone==='level0'||zoneVisualId===game.zone)return;
 const requested=game.zone,token=++zoneLoadToken;zoneVisualId=requested;zoneLoading=true;zoneLoadError=false;worldLoading=true;
 clearInput();gameAudio.stop();chunkStream?.clear();mazeGroup.visible=roomGroup.visible=exitGroup.visible=false;
 const ownedGeometry=new Set(),ownedMaterials=new Set();for(const group of [roomGroup,exitGroup]){group.traverse(o=>{if(o.isMesh){o.dispose?.();if(o.geometry!==boxGeo)ownedGeometry.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(!Object.values(mat).includes(m))ownedMaterials.add(m)}});group.clear()}ownedGeometry.forEach(g=>g.dispose());ownedMaterials.forEach(m=>{m.map?.dispose();m.dispose()});
 monsterVisual?.dispose();monsterVisual=null;escapeMarks?.removeFromParent();escapeMarks=null;
 if(zoneVisual){disposeZoneVisual(zoneVisual);zoneVisual=null}
 $('world').style.visibility='hidden';worldRendered=false;
 loadZoneVisual(requested).then(group=>{
  if(token!==zoneLoadToken||game.zone!==requested){disposeZoneVisual(group);return}
  zoneVisual=group;scene.add(group);zoneLoading=false;zoneLoadError=false;worldLoading=false;
  scene.background.set(0x252a2a);scene.fog.color.set(0x252a2a);scene.fog.near=22;scene.fog.far=60;
  game.renderReady=null;clearInput();last=performance.now();sync();
 }).catch(error=>{if(token!==zoneLoadToken)return;zoneLoading=false;zoneLoadError=true;console.error(error);say('场景加载失败。点加载提示重试；也可以暂停后重新开始。')});
}
$('world-loading').onclick=()=>{if(zoneLoadError){zoneVisualId='';zoneLoadError=false;ensureZoneVisual()}};
$('world-loading').addEventListener('keydown',e=>{if(zoneLoadError&&['Enter','Space'].includes(e.code)){e.preventDefault();$('world-loading').onclick()}});
function syncZoneVisual(){
 if(game.zone==='level0'){
  if(!noclipCue&&game.abnormalWall){const w=game.abnormalWall;noclipCue=new THREE.Group();noclipCue.name='Abnormal wallpaper seam';
   const panel=new THREE.Mesh(new THREE.PlaneGeometry(.62,1.8),new THREE.MeshBasicMaterial({color:0xc7bb87,transparent:true,opacity:.27,side:THREE.DoubleSide}));
   panel.position.set(w.x,1.25,w.z);panel.rotation.y=Math.atan2(w.normalX,w.normalZ);noclipCue.add(panel);scene.add(noclipCue)}
  if(noclipCue)noclipCue.visible=!game.changed&&!game.escape.layout;
  return;
 }
 if(noclipCue)noclipCue.visible=false;
 if(zoneVisual)setZoneVisualState(zoneVisual,{sealed:game.hub.sealed,phase:game.level1.phase,elapsed:game.level1.elapsed,openedCrates:game.level1.crates.filter(c=>c.opened).map(c=>c.id)});
 const dark=game.zone==='level1'&&game.level1.phase==='dark',warning=game.zone==='level1'&&game.level1.phase==='warning';
 for(const light of scene.children.filter(o=>o.isLight))light.intensity=light.isHemisphereLight?(dark?.12:warning?(Math.floor(game.level1.elapsed/.5)%2?1:.5):1.5):(dark?.015:.20);
}
// Backpack state belongs to this UI; simulation owns item identities and transactions.
let selectedItemId=null,inventoryDrag=null,inventorySignature='',objectiveKey='',objectiveUntil=0;
const inventoryCells=[],inventoryNodes=new Map();
const itemName=i=>`${i.developerSpawned?'调试 · ':''}${i.kind==='phone'?'手机':i.kind==='water'?'饮用水':'干粮'} ${i.id.split('-').at(-1)}`;
const itemIcon=i=>`./icons/item-${i.kind}.svg`;
function canUseInventory(){return game.inventoryOpen&&!game.phoneOpenId&&game.mode==='playing'&&!orientationBlocked&&!document.hidden}
function selectedItem(){return game.inventory().find(i=>i.id===selectedItemId)}
function renderInventory(force=false){
 if(!game.inventoryOpen)return;
 const items=game.inventory();if(!items.some(i=>i.id===selectedItemId))selectedItemId=items[0]?.id||null;
 const signature=JSON.stringify([items.map(i=>[i.id,i.gridX,i.gridY,Math.ceil(i.battery||0)]),game.chargingPhoneId,game.nearCharger(),selectedItemId,Math.ceil(game.food),Math.ceil(game.hydration)]);
 if(!force&&signature===inventorySignature)return;inventorySignature=signature;
 for(const [id,node]of inventoryNodes)if(!items.some(i=>i.id===id)){node.remove();inventoryNodes.delete(id)}
 for(const item of items){
  let node=inventoryNodes.get(item.id);
  if(!node){node=document.createElement('button');node.type='button';node.className='inventory-item';node.dataset.itemId=item.id;node.dataset.kind=item.kind;
   const art=document.createElement('img');art.className='item-art';art.src=itemIcon(item);art.alt='';art.draggable=false;node.append(art);
   const number=document.createElement('span');number.className='item-number';number.textContent=item.id.split('-').at(-1);node.append(number);
   node.addEventListener('pointerdown',e=>beginInventoryDrag(e,item.id));
   node.onclick=e=>{if(e.detail===0&&canUseInventory()&&!inventoryDrag){selectedItemId=item.id;renderInventory(true)}};
   $('inventory-items').append(node);inventoryNodes.set(item.id,node);
  }
  if(item.kind==='phone')node.children[1].textContent=`${Math.ceil(item.battery)}%`;
  const size=game.itemSize(item);node.style.gridColumn=`${item.gridX+1} / span ${size.w}`;node.style.gridRow=`${item.gridY+1} / span ${size.h}`;
  node.classList.toggle('selected',item.id===selectedItemId);node.setAttribute('aria-pressed',String(item.id===selectedItemId));node.setAttribute('aria-label',`${itemName(item)}，占用 ${size.w} 乘 ${size.h} 格${item.kind==='phone'?`，电量 ${Math.ceil(item.battery)}%`:''}`);
 }
 for(const cell of inventoryCells){const x=Number(cell.dataset.x),y=Number(cell.dataset.y),occupied=items.some(i=>{const s=game.itemSize(i);return x>=i.gridX&&x<i.gridX+s.w&&y>=i.gridY&&y<i.gridY+s.h});cell.tabIndex=occupied?-1:0;cell.setAttribute('aria-label',`第 ${y+1} 行第 ${x+1} 格${occupied?'，已占用':'，空位'}`)}
 const item=selectedItem();$('item-detail').classList.toggle('empty',!item);$('item-art').hidden=!item;
 $('item-name').textContent=item?itemName(item):'背包是空的';$('item-size').textContent=item?`占用 ${game.itemSize(item).w} × ${game.itemSize(item).h}`:'16 格空间';
 $('item-description').textContent=item?(item.kind==='phone'?`🔋 ${Math.ceil(item.battery)}% · 离线层级资料${game.chargingPhoneId===item.id?' · 充电中':item.battery<=0?' · 需到马尼拉桌边充电':''}`:item.kind==='water'?'补充水分':'补充饱腹，吃后会有些口干'):'靠近物品，点交互拾取。';
 if(item)$('item-art').src=itemIcon(item);
 $('consume-item').textContent=item?.kind==='phone'?'查看资料':item?.kind==='water'?'饮用':'进食';
 $('consume-item').disabled=!item||(item.kind==='phone'?false:item.kind==='water'?game.hydration>98:game.food>98);$('drop-item').disabled=!item;
 $('arrange-items').disabled=!items.length;
}
// Original, in-universe notes for this game; no network, GPS or imported wiki text.
const PHONE_GUIDE=Object.freeze([
 {title:'LEVEL 0 · 零层',copy:'黄色墙纸、潮湿地毯、灯管低鸣。相似的走廊容易让人误判方向。\n\n放下的物品会留在原地，可以作为路标。空间连接偶尔会改变；反复见到同一份干粮时，试试别的岔路。\n\n留意木门上的 MANILA 标识。节省饮水，背包里的干粮不能代替水。'},
 {title:'MANILA · 马尼拉房间',copy:'房间内有长凳、纸条和有限的饮用水。先读纸条，再留意门外动静。\n\n本次探索手记：进入房间后把木门完全关上。外面安静后，再检查门另一侧。\n\n桌边的线连着墙上插座。靠近后接上手机可充电；离开桌边或放下手机会断开。'},
 {title:'LEVEL 1 · 人工设施',copy:'混凝土柱厅、货架与管线。木箱内可能有有限补给；带走的物资不会刷新。\n\n灯光会先闪烁预警，再短暂停电。绿色标识指向缓冲休息区。这里没有常驻居民。\n\n连接区的七扇白门暂未开放；侧墙另有 Level 1 入口。管道通道是本次演示的终点，Level 2 尚未开放。'}
]);
let phoneChapter=-1,phoneSignature='';
const phoneChapterButtons=[];
function canUsePhone(){return Boolean(game.phoneOpenId)&&game.mode==='playing'&&!orientationBlocked&&!document.hidden}
function renderPhone(force=false){
 const item=game.phone();if(!item)return;
 const powered=item.battery>0,connected=game.chargingPhoneId===item.id,near=game.nearCharger();
 const signature=JSON.stringify([item.id,Math.ceil(item.battery),powered,item.battery>=100,item.battery<20,connected,near,phoneChapter]);if(!force&&signature===phoneSignature)return;phoneSignature=signature;
 $('phone-battery-value').textContent=`${Math.ceil(item.battery)}%`; $('phone-battery-fill').style.width=`${item.battery}%`;
 $('phone-battery').classList.toggle('low',item.battery<20);$('phone-battery').setAttribute('aria-label',`电量 ${Math.ceil(item.battery)}%${connected?'，充电中':''}`);
 $('phone-charge-state').textContent=connected?(item.battery>=100?'已充满 · 外接电源':'正在充电 · 留在桌边'):'离线缓存 · 无定位';
 $('phone-depleted').hidden=powered;$('phone-chapters').hidden=!powered||phoneChapter>=0;$('phone-article').hidden=!powered||phoneChapter<0;
 $('phone-back').hidden=phoneChapter<0||!powered;
 for(const button of phoneChapterButtons)button.disabled=!powered;
 if(powered&&phoneChapter>=0){const page=PHONE_GUIDE[phoneChapter];$('phone-article-title').textContent=page.title;$('phone-article-copy').textContent=page.copy}
 $('phone-charge').textContent=connected?'断开充电线':'接上充电线';$('phone-charge').disabled=!near;
 $('phone-power-hint').textContent=connected?'充电约 40 秒充满；屏幕由插座供电。':near?'充电线就在桌边，可以接上手机。':'亮屏约 8 分钟耗尽。马尼拉桌边可以充电。';
}
function openPhone(id){
 if(!canUseInventory()||!game.openPhone(id))return;cancelInventoryDrag();clearInput();phoneChapter=-1;phoneSignature='';showState();renderPhone(true);$('phone-close').focus();
}
function closePhone(){if(!game.closePhone())return;phoneChapter=-1;phoneSignature='';showState();renderInventory(true);if(canUseInventory())$('consume-item').focus()}
function initPhone(){
 PHONE_GUIDE.forEach((page,index)=>{const button=document.createElement('button');button.type='button';button.className='phone-chapter';button.textContent=page.title;button.onclick=()=>{if(!canUsePhone()||game.phone().battery<=0)return;phoneChapter=index;renderPhone(true);$('phone-back').focus()};$('phone-chapters').append(button);phoneChapterButtons.push(button)});
 $('phone-close').onclick=()=>{if(canUsePhone())closePhone()};$('phone-back').onclick=()=>{if(canUsePhone()){phoneChapter=-1;renderPhone(true);phoneChapterButtons[0]?.focus()}};
 $('phone-charge').onclick=()=>{if(canUsePhone()){game.toggleCharger(game.phoneOpenId);renderPhone(true);renderInventory(true)}};
}
function clearInventoryTargets(){for(const cell of inventoryCells){cell.classList.remove('drop-valid','drop-invalid')} $('discard-zone').hidden=true;$('discard-zone').classList.remove('active')}
function cancelInventoryDrag(){
 const drag=inventoryDrag;inventoryDrag=null;
 if(drag){inventoryNodes.get(drag.id)?.classList.remove('dragging');try{$('inventory-panel').releasePointerCapture(drag.pointerId)}catch{}}
 $('inventory-drag-ghost').hidden=true;clearInventoryTargets();
}
function inventoryTarget(e,drag){
 const card=$('backpack-card').getBoundingClientRect();
 if(e.clientX>=0&&e.clientX<card.left&&e.clientY>=card.top&&e.clientY<=card.bottom)return{discard:true};
 const rect=$('inventory-grid').getBoundingClientRect();
 if(e.clientX<rect.left||e.clientX>=rect.right||e.clientY<rect.top||e.clientY>=rect.bottom)return null;
 return{x:Math.floor((e.clientX-rect.left)/rect.width*4)-drag.offsetX,y:Math.floor((e.clientY-rect.top)/rect.height*4)-drag.offsetY};
}
function beginInventoryDrag(e,id){
 if(!canUseInventory()||inventoryDrag||e.button>0)return;
 const item=game.inventory().find(i=>i.id===id);if(!item)return;e.preventDefault();e.stopPropagation();selectedItemId=id;renderInventory(true);
 const node=inventoryNodes.get(id),rect=node.getBoundingClientRect(),size=game.itemSize(item);
 inventoryDrag={id,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false,offsetX:Math.min(size.w-1,Math.max(0,Math.floor((e.clientX-rect.left)/rect.width*size.w))),offsetY:Math.min(size.h-1,Math.max(0,Math.floor((e.clientY-rect.top)/rect.height*size.h)))};
 try{$('inventory-panel').setPointerCapture(e.pointerId)}catch{cancelInventoryDrag()}
}
function moveInventoryDrag(e){
 const drag=inventoryDrag;if(!drag||e.pointerId!==drag.pointerId)return;
 if(!canUseInventory()){cancelInventoryDrag();return}e.preventDefault();
 if(!drag.moved&&Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<8)return;
 drag.moved=true;inventoryNodes.get(drag.id)?.classList.add('dragging');
 const ghost=$('inventory-drag-ghost');ghost.src=itemIcon(game.items.find(i=>i.id===drag.id));ghost.hidden=false;ghost.style.left=e.clientX+'px';ghost.style.top=e.clientY+'px';
 clearInventoryTargets();const target=inventoryTarget(e,drag);drag.target=target;
 if(target?.discard){$('discard-zone').hidden=false;$('discard-zone').classList.add('active');return}
 if(target){const size=game.itemSize(drag.id),valid=game.canPlaceItem(drag.id,target.x,target.y);for(const cell of inventoryCells){const x=Number(cell.dataset.x),y=Number(cell.dataset.y);if(x>=target.x&&x<target.x+size.w&&y>=target.y&&y<target.y+size.h)cell.classList.add(valid?'drop-valid':'drop-invalid')}}
}
function endInventoryDrag(e){
 const drag=inventoryDrag;if(!drag||e.pointerId!==drag.pointerId)return;
 const target=drag.moved?inventoryTarget(e,drag):null,allowed=canUseInventory();cancelInventoryDrag();
 if(allowed&&target){if(target.discard)game.drop(drag.id);else game.moveInventoryItem(drag.id,target.x,target.y)}
 renderInventory(true);sync();
}
function openInventory(){
 if(!canPlay()||!game.openInventory())return;clearInput();gameAudio.resetTracking();inventorySignature='';$('inventory-status').textContent='';showState();renderInventory(true);$('inventory-close').focus();
}
function closeInventory(){
 cancelInventoryDrag();if(!game.inventoryOpen)return;game.closeInventory();clearInput();gameAudio.resetTracking();showState();if(canPlay())$('backpack').focus();
}
function initInventory(){
 for(const [id,label]of [['food-meter','饱腹'],['water-meter','水分']]){const meter=$(id).parentElement;meter?.setAttribute('role','progressbar');meter?.setAttribute('aria-label',label);meter?.setAttribute('aria-valuemin','0');meter?.setAttribute('aria-valuemax','100')}

 for(let y=0;y<4;y++)for(let x=0;x<4;x++){const cell=document.createElement('button');cell.type='button';cell.className='inventory-cell';cell.dataset.x=x;cell.dataset.y=y;cell.style.gridColumn=String(x+1);cell.style.gridRow=String(y+1);cell.onclick=()=>{if(!canUseInventory()||inventoryDrag||!selectedItem())return;if(game.moveInventoryItem(selectedItemId,x,y))renderInventory(true)};$('inventory-grid').append(cell);inventoryCells.push(cell)}
 const ghost=document.createElement('img');ghost.id='inventory-drag-ghost';ghost.className='inventory-drag-ghost';ghost.alt='';ghost.hidden=true;ghost.draggable=false;$('inventory-panel').append(ghost);
 $('backpack').onclick=e=>{e.stopPropagation();openInventory()};$('inventory-close').onclick=closeInventory;
 $('arrange-items').onclick=()=>{if(canUseInventory()&&!inventoryDrag){game.arrangeInventory();renderInventory(true)}};
 $('consume-item').onclick=()=>{const item=selectedItem();if(canUseInventory()&&!inventoryDrag&&item){if(item.kind==='phone')openPhone(item.id);else game.consume(item.kind,item.id);renderInventory(true);sync()}};
 $('drop-item').onclick=()=>{const item=selectedItem();if(canUseInventory()&&!inventoryDrag&&item){game.drop(item.id);renderInventory(true);sync()}};
 $('inventory-panel').addEventListener('pointermove',moveInventoryDrag);$('inventory-panel').addEventListener('pointerup',endInventoryDrag);
 for(const type of ['pointercancel','lostpointercapture'])$('inventory-panel').addEventListener(type,e=>{if(inventoryDrag?.pointerId===e.pointerId)cancelInventoryDrag()});
}
function syncEscapeVisual(dt=0,active=false){
 if(game.zone!=='level0'){$('escape-blackout').style.opacity='0';$('escape-guide').hidden=true;return}
 const e=game.escape;
 if(e.roomOffset){roomGroup.position.set(e.roomOffset.x,0,e.roomOffset.z);exitGroup.position.set(e.roomOffset.x,0,e.roomOffset.z)}
 $('escape-blackout').style.opacity=String(escapeDarkness(game));
 const direction=escapeDirection(game),visible=direction&&game.mode==='playing'&&!game.inventoryOpen&&!game.phoneOpenId;
 $('escape-guide').hidden=!visible;
 if(visible){const angle=Math.atan2(direction.x-game.player.x,-(direction.z-game.player.z))-game.player.yaw;$('escape-arrow').style.transform=`rotate(${angle}rad)`;$('escape-guide-copy').textContent=direction.label}
 if(e.layout&&escapeMarkLayout!==e.layout){
  if(escapeMarks){escapeMarks.removeFromParent();escapeMarks.geometry.dispose();escapeMarks.material.dispose();escapeMarks.dispose()}
  // Paint lies in the local XY plane and points along +X. Each instance follows
  // the real next route segment on a solid wall, including the final door leg.
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-.66,-.095,0,.15,-.095,0,.15,.095,0,-.66,-.095,0,.15,.095,0,-.66,.095,0,.10,-.34,0,.74,0,0,.10,.34,0]),3));
  geometry.computeVertexNormals();
  const marks=[];
  e.layout.route.forEach((p,i)=>{
   const next=e.layout.route[i+1]||e.layout.door,dx=Math.sign(next.x-p.x),dz=Math.sign(next.z-p.z);
   const cell=e.layout.lookup.get(Math.floor(p.x/CELL)+','+Math.floor(p.z/CELL));
   for(const wall of cell.walls){
    const alongX=wall.w>wall.d;
    if(alongX?dz!==0:dx!==0)continue;
    // The 16 cm walls extend into the cell. Keep paint 12 mm in front of the
    // interior face, not at the wall centre or coplanar with the wallpaper.
    const x=alongX?p.x:wall.x+Math.sign(p.x-wall.x)*(wall.w/2+.012);
    const z=alongX?wall.z+Math.sign(p.z-wall.z)*(wall.d/2+.012):p.z;
    marks.push({x,z,yaw:Math.atan2(-dz,dx)});
   }
   // At a turn the closed wall ahead of the incoming segment is selected above;
   // its sideways arrow is visible on approach and points into the open passage.
  });
  escapeMarks=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0x101010,side:THREE.DoubleSide}),marks.length);
  escapeMarks.name='Escape route black wall arrows';const dummy=new THREE.Object3D();
  marks.forEach((mark,i)=>{dummy.position.set(mark.x,1.55,mark.z);dummy.rotation.set(0,mark.yaw,0);dummy.updateMatrix();escapeMarks.setMatrixAt(i,dummy.matrix)});
  escapeMarks.instanceMatrix.needsUpdate=true;escapeMarks.computeBoundingSphere();scene.add(escapeMarks);escapeMarkLayout=e.layout;
 }
 if(escapeMarks)escapeMarks.visible=['loading','warning','chase','door','caught-animation','caught'].includes(e.phase);
 if(e.monster?.active){
  if(!monsterVisual){monsterVisual=createCableMonster(THREE);scene.add(monsterVisual.root)}
  monsterVisual.root.position.set(e.monster.x,0,e.monster.z);monsterVisual.root.rotation.y=-e.monster.yaw;
  monsterVisual.update(active&&['warning','chase','door','caught-animation'].includes(e.phase)?dt:0,{clip:e.monster.clip,active:true});
 }else monsterVisual?.update(0,{active:false});
 // Switch existing lamp faces behind the advancing chase off once. The diffuse
 // bake stays fixed; this does not create lights, rebake the world or add passes.
 if(e.layout&&['warning','chase','caught-animation'].includes(e.phase)){
  const matrix=new THREE.Matrix4(),colour=new THREE.Color();
  for(const group of mazeGroup.children)for(const mesh of group.children)if(mesh.isInstancedMesh&&mesh.material===mat.light){
   if(mesh.userData.escapeProgress===e.attempt+':'+e.progress)continue;mesh.userData.escapeProgress=e.attempt+':'+e.progress;
   if(!mesh.userData.escapeBaseColors){mesh.userData.escapeBaseColors=[];for(let i=0;i<mesh.count;i++){if(mesh.instanceColor)mesh.getColorAt(i,colour);else colour.setRGB(1,1,1);mesh.userData.escapeBaseColors.push(colour.clone())}}
   let changed=false;
   for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);const x=matrix.elements[12]+mesh.position.x,z=matrix.elements[14]+mesh.position.z;const index=e.layout.indices.get(Math.floor(x/CELL)+','+Math.floor(z/CELL));const off=index!==undefined&&index<e.progress-3;if(index!==undefined){mesh.setColorAt(i,colour.copy(mesh.userData.escapeBaseColors[i]).multiplyScalar(off?.025:1));changed=true}}
   if(changed)mesh.instanceColor.needsUpdate=true;
  }
 }
}

function syncDeveloperTools(){
 const status=developerStatus(game);
 $('developer-toggle').textContent=developerEnabled?'关闭开发者工具':'启用开发者工具';$('developer-toggle').setAttribute('aria-pressed',String(developerEnabled));
 $('developer-tools').hidden=!developerEnabled;$('debug-badge').hidden=!developerEnabled;
 $('developer-availability').textContent=status.available?(status.spawnReason||'调试动作只改变当前一轮，设置内不会推进探索时间。'):status.reason;
 $('developer-spawn').disabled=!status.canSpawn;$('developer-time').disabled=!status.canJumpTime;
 $('developer-teleport-outside').disabled=!status.canTeleportOutside;$('developer-teleport-inside').disabled=!status.canTeleportInside;
 $('developer-time-reason').textContent=status.canJumpTime?'继续实际探索 30 秒后触发事件；暂停和加载不计时。':status.jumpReason||status.reason;
 $('developer-teleport-reason').textContent=status.canTeleportInside?(status.outsideReason?status.outsideReason+' ':'' )+'传送视为找到马尼拉，会跳过或终止本轮追逐。物资和消耗保留，室内仍需手动关门。':status.teleportReason||status.reason;
}
function runDeveloperAction(action){
 if(!developerEnabled||$('help').hidden||orientationBlocked||document.hidden)return;
 const result=action();$('developer-status').textContent=result.reason||'';
 if(result.ok){clearInput();cancelInventoryDrag();inventorySignature='';phoneSignature='';gameAudio.stop();sync();syncEscapeVisual(0,false);selectedViewCache=null;corridorViewCache=null;requestedSelection=null;updateStreamView()}
 syncDeveloperTools();
}
$('developer-toggle').onclick=()=>{if($('help').hidden||orientationBlocked||document.hidden)return;developerEnabled=!developerEnabled;setDeveloperEnabled(game,developerEnabled);$('developer-status').textContent=developerEnabled?'开发者工具已启用，仅在当前页面会话保留。':'';syncDeveloperTools()};
$('developer-item').value='food';
$('developer-spawn').onclick=()=>runDeveloperAction(()=>spawnDeveloperItem(game,$('developer-item').value));
$('developer-time').onclick=()=>runDeveloperAction(()=>jumpDeveloperTime(game));
$('developer-teleport-outside').onclick=()=>runDeveloperAction(()=>teleportDeveloper(game,'outside'));
$('developer-teleport-inside').onclick=()=>runDeveloperAction(()=>teleportDeveloper(game,'inside'));

function sync(){
 const level0=game.zone==='level0';mazeGroup.visible=level0&&!game.changed;roomGroup.visible=level0;exitGroup.visible=level0&&game.changed;doorPivot.rotation.y=game.door*Math.PI/2;syncZoneVisual();
 for(const i of game.items){const g=itemMeshes.get(i.id)||createItemMesh(i);g.visible=game.worldItemVisible(i);g.position.set(i.x,i.y??.005,i.z)}
 $('food-meter').style.width=game.food+'%';$('water-meter').style.width=game.hydration+'%';$('food-value').textContent=Math.ceil(game.food);$('water-value').textContent=Math.ceil(game.hydration);
 $('food-meter').parentElement?.setAttribute('aria-valuenow',String(Math.ceil(game.food)));$('water-meter').parentElement?.setAttribute('aria-valuenow',String(Math.ceil(game.hydration)));
 $('zone').textContent=game.zone==='hub'?'连接区':game.zone==='level1'?'LEVEL 1 · EASY':game.inRoom()?'MANILA':game.changed?'UNKNOWN':'LEVEL 0';
 const objective=game.zone==='hub'?'寻找侧墙绿色标识的 Level 1 入口':game.zone==='level1'?(game.level1.phase==='warning'?'灯光不稳，绿色标识通向缓冲休息区':game.level1.phase==='dark'?'短暂停电，沿绿色标识缓行':'搜寻补给，沿管道找到过渡通道'):game.escape.triggered&&!['finished','suppressed'].includes(game.escape.phase)?'沿墙上黑色箭头逃向木门':game.changed?'重新开门，进入连接区':game.entered?'把门完全关上':game.loops?'换条路寻找木门':'找到一扇木门';
 if(objective!==objectiveKey){objectiveKey=objective;objectiveUntil=game.elapsed+6;$('objective').textContent=objective}
 $('objective').hidden=game.elapsed>objectiveUntil;
 const i=game.nearestItem();$('prompt').textContent=!canPlay()?'':game.zone!=='level0'?(game.zonePrompt?.()||''):game.nearAbnormalWall?.()?`按住交互穿过异常墙面 ${Math.floor((game.abnormalWall.hold||0)/2*100)}%`:i?(i.kind==='phone'?'拾回手机':i.kind==='food'?`拾回干粮 ${i.id.split('-').at(-1)}`:'拾起饮用水'):game.nearCharger()?(game.chargingPhoneId?'断开充电线':game.inventory('phone').length?'接上充电线':'查看充电线'):game.nearNote()?'阅读纸条':game.nearDoor()?(game.doorTarget>.5?'关门':'开门'):'';
 const available=Boolean($('prompt').textContent);$('interact').disabled=!available;$('interact-label').textContent=available?(i?(i.kind==='food'?'拾回':'拾取'):game.nearCharger()?(game.chargingPhoneId?'断开':'充电'):game.nearNote()?'阅读':$('prompt').textContent):'交互';$('interact').setAttribute('aria-label',available?$('prompt').textContent:'交互');
 $('food-value').parentElement?.classList.toggle('low',game.food<25);$('water-value').parentElement?.classList.toggle('low',game.hydration<25);const charging=game.phone(game.chargingPhoneId);$('charging-hud').hidden=!charging;$('charging-hud').textContent=charging?`🔋 ${Math.ceil(charging.battery)}% · ${charging.battery>=100?'已充满':'充电中'}`:'';renderInventory();renderPhone();syncDeveloperTools();
}
function say(t){$('toast').textContent=t;if(game.inventoryOpen)$('inventory-status').textContent=t;$('toast').classList.add('show');toastUntil=performance.now()+6500}
function clearInput(){if(interactPointer!==null){try{$('interact').releasePointerCapture?.(interactPointer)}catch{}}interactPointer=null;game.cancelInteraction?.();for(const [id,pointer]of [['stick',touch.move],['look',touch.look],...Array.from(touch.sprint,p=>['sprint',p])])if(pointer!==null){try{$(id).releasePointerCapture?.(pointer)}catch{}}keys.clear();touch.move=null;touch.look=null;touch.sprint.clear();input.forward=input.strafe=0;input.sprint=false;$('stick-knob').style.transform='';}
function showState(){$('phone-panel').hidden=!game.phoneOpenId;$('inventory-panel').hidden=!game.inventoryOpen||Boolean(game.phoneOpenId);$('inventory-panel').inert=Boolean(game.phoneOpenId);$('hud').inert=game.inventoryOpen;$('backpack').setAttribute('aria-expanded',String(game.inventoryOpen));for(const id of ['menu','pause-panel','note','ending','caught-panel'])$(id).hidden=true;$('hud').hidden=['menu','won','lost','caught'].includes(game.mode);$('caught-panel').hidden=game.mode!=='caught';if(game.mode==='caught')$('escape-retry').focus();if(game.mode==='menu'){$('menu').hidden=false;$('continue').disabled=!hasRun}if(game.mode==='paused')$('pause-panel').hidden=false;if(game.mode==='note')$('note').hidden=false;if(['won','lost'].includes(game.mode)){$('ending').hidden=false;$('end-eyebrow').textContent=game.mode==='won'?'LEVEL 1 · DEMO COMPLETE':'SIGNAL LOST';$('end-title').textContent=game.mode==='won'?'管道延伸到尚未开放的深处。':'你再也走不动了。';$('end-copy').innerHTML=game.mode==='won'?'你已完成 Level 1 Demo。<br>管道通道是本次演示的终点；Level 2 尚未开放。':'饥饿或脱水结束了这次探索。<br>新的迷宫还在等着你。'}syncModalInert();if(game.mode!=='playing'||game.inventoryOpen||game.phoneOpenId||modalOpen()){clearInput();document.exitPointerLock?.();gameAudio.stop()}last=performance.now()}
function pause(){game.pause();cancelInventoryDrag();game.closeInventory();showState()}
function act(a){if(!canPlay())return;if(a==='interact'){const result=game.interact();if(result==='door')gameAudio.door();if(result==='note')showState()}sync()}
function soundStart(){gameAudio.setEnabled(soundEnabled);return gameAudio.unlock()}
// A fresh gameplay gesture can recover Safari audio after an interrupted/resume failure.
function unlockGameplayAudio(){if(soundEnabled&&hasRun&&!document.hidden&&!orientationBlocked&&!modalOpen())soundStart()}
document.addEventListener('pointerdown',unlockGameplayAudio,{capture:true});
window.addEventListener('keydown',e=>{if(!e.repeat)unlockGameplayAudio()},{capture:true});
function restart(){if(orientationBlocked||document.hidden||modalOpen()||!graphicsReady)return;gameAudio.reset();soundStart();void requestLandscape();hasRun=true;clearInput();cancelInventoryDrag();selectedItemId=null;inventorySignature='';phoneChapter=-1;phoneSignature='';objectiveKey='';game.reset(seed());setDeveloperEnabled(game,developerEnabled);build();game.start();showState()}
function requestLook(){try{const pending=$('world').requestPointerLock?.();pending?.catch(()=>say('请再次点击画面以启用鼠标观察。'))}catch{say('此浏览器未允许鼠标锁定。请使用触屏或支持鼠标锁定的浏览器。')}}
function returnToMenu(){if(orientationBlocked||document.hidden||modalOpen())return;game.pause();cancelInventoryDrag();game.closeInventory();game.mode='menu';showState()}
$('start').onclick=()=>{if(orientationBlocked||document.hidden||modalOpen()||!graphicsReady||worldLoading)return;restart();if(!coarse&&!orientationBlocked)requestLook()};
$('continue').onclick=()=>{if(orientationBlocked||document.hidden||modalOpen()||!graphicsReady||!hasRun||['won','lost','caught'].includes(game.mode))return;soundStart();void requestLandscape();game.mode='playing';showState();if(!coarse)requestLook()};
$('escape-retry').onclick=()=>{if(orientationBlocked||document.hidden||modalOpen())return;if(game.retryEscape()){clearInput();gameAudio.reset();soundStart();showState();updateStreamView()}};$('escape-restart').onclick=restart;
$('pause').onclick=pause;$('resume').onclick=()=>{if(orientationBlocked||document.hidden||modalOpen())return;soundStart();void requestLandscape();game.resume();showState()};$('restart').onclick=restart;$('again').onclick=restart;$('main-menu').onclick=returnToMenu;
$('quit').onclick=()=>{if(game.mode!=='menu'||orientationBlocked||document.hidden||modalOpen())return;dialogReturnFocus=$('quit');$('quit-panel').hidden=false;clearInput();syncModalInert();$('quit-back').focus()};$('quit-back').onclick=()=>closeModal('quit-panel');$('error-back').onclick=()=>{$('error').hidden=true};
$('sound-toggle').onclick=()=>{soundEnabled=!soundEnabled;$('sound-toggle').textContent=soundEnabled?'音效：开':'音效：关';$('sound-toggle').setAttribute('aria-pressed',String(soundEnabled));gameAudio.setEnabled(soundEnabled);if(soundEnabled)soundStart()};
$('quality-toggle').onclick=()=>{renderScale=renderScale===1?.75:1;$('quality-toggle').textContent=renderScale===1?'画质：标准':'画质：省电';resize()};
$('note-close').onclick=()=>{if(orientationBlocked||document.hidden||modalOpen())return;game.resume();showState()};$('interact').onclick=e=>{e.stopPropagation();act('interact')};
function syncModalInert(){
 const blocked=modalOpen();for(const id of ['menu','pause-panel','note','ending','phone-panel','caught-panel'])$(id).inert=blocked;
 $('inventory-panel').inert=blocked||Boolean(game.phoneOpenId);$('hud').inert=blocked||game.inventoryOpen;
}
function closeModal(id){
 if($(id).hidden||orientationBlocked||document.hidden)return;$(id).hidden=true;syncModalInert();last=performance.now();
 const trigger=dialogReturnFocus;dialogReturnFocus=null;if(trigger?.isConnected&&!trigger.disabled)trigger.focus();
}
function openHelp(trigger=game.mode==='menu'?$('help-open'):$('pause-help')){
 if(orientationBlocked||document.hidden||modalOpen())return;dialogReturnFocus=trigger;$('help').hidden=false;
 if(game.mode==='playing')pause();else{clearInput();syncModalInert()}$('sound-toggle').focus();
}
$('help-open').onclick=()=>openHelp($('help-open'));$('pause-help').onclick=()=>openHelp($('pause-help'));$('help-close').onclick=()=>closeModal('help');
$('world').addEventListener('click',()=>{if(canPlay()&&!coarse)requestLook()});document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&!coarse&&canPlay())pause()});document.addEventListener('mousemove',e=>{if(document.pointerLockElement&&canPlay()){game.player.yaw+=e.movementX*.0024;game.player.pitch=Math.max(-1.1,Math.min(1.1,game.player.pitch-e.movementY*.0024))}});
window.addEventListener('keydown',e=>{
 if(orientationBlocked||document.hidden)return;
 if(modalOpen()){
  const help=!$('help').hidden;
  if(e.code==='Escape'){e.preventDefault?.();if(!e.repeat)closeModal(help?'help':'quit-panel')}
  if(e.code==='Tab'){
   e.preventDefault();const focusable=(help?[$('sound-toggle'),$('quality-toggle'),$('developer-toggle'),...(developerEnabled?[$('developer-item'),$('developer-spawn'),$('developer-time'),$('developer-teleport-outside'),$('developer-teleport-inside')]:[]),$('help-close')]:[$('quit-back')]).filter(n=>!n.disabled);
   const index=focusable.indexOf(document.activeElement),next=index<0?(e.shiftKey?focusable.length-1:0):(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length;focusable[next]?.focus();
  }
  return;
 }
 if(game.phoneOpenId){
  if(e.code==='Escape'||e.code==='KeyI'){e.preventDefault();if(!e.repeat)closePhone();return}
  if(e.code==='Tab'){
   e.preventDefault();const focusable=[...(! $('phone-chapters').hidden?phoneChapterButtons:[]),...(!$('phone-back').hidden?[$('phone-back')]:[]),$('phone-charge'),$('phone-close')].filter(n=>!n.disabled);
   const index=focusable.indexOf(document.activeElement),next=(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length;focusable[next]?.focus();
  }
  return;
 }
 if(game.inventoryOpen){
  if(e.code==='Escape'||e.code==='KeyI'){e.preventDefault();if(!e.repeat)closeInventory();return}
  if(e.code==='Tab'){
   e.preventDefault();const focusable=[...inventoryNodes.values(),...inventoryCells.filter(n=>n.tabIndex!==-1),$('consume-item'),$('drop-item'),$('arrange-items'),$('inventory-close')].filter(n=>!n.disabled);
   const index=focusable.indexOf(document.activeElement),next=(index+(e.shiftKey?-1:1)+focusable.length)%focusable.length;focusable[next]?.focus();
  }
  return;
 }
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
 if(e.code==='Escape'){e.preventDefault?.();if(e.repeat)return;if(game.mode==='playing')pause();else if(game.mode==='paused'){game.resume();showState()}return}
 if(!canPlay())return;
 if(e.code==='Tab'||e.code==='KeyI'){e.preventDefault();if(!e.repeat)openInventory();return}
 keys.add(e.code);if(!e.repeat&&e.code==='KeyE')act('interact');
});window.addEventListener('keyup',e=>keys.delete(e.code));
const interaction=$('interact');interaction.addEventListener('pointerdown',e=>{if(canPlay()&&game.nearAbnormalWall?.()){e.preventDefault();interactPointer=e.pointerId;interaction.setPointerCapture?.(e.pointerId)}});for(const type of ['pointerup','pointercancel','lostpointercapture'])interaction.addEventListener(type,e=>{if(e.pointerId===interactPointer){interactPointer=null;game.cancelInteraction?.()}});
const stick=$('stick');stick.addEventListener('pointerdown',e=>{if(!canPlay()||touch.move!==null)return;e.preventDefault();touch.move=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e)});function updateStick(e){if(!canPlay()||e.pointerId!==touch.move)return;const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,d=Math.max(1,Math.hypot(dx,dy)/38);input.strafe=dx/d/38;input.forward=-dy/d/38;$('stick-knob').style.transform=`translate(${dx/d}px,${dy/d}px)`}stick.addEventListener('pointermove',updateStick);function endStick(e){if(e.pointerId===touch.move){touch.move=null;input.forward=input.strafe=0;$('stick-knob').style.transform=''}}for(const e of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(e,endStick);
const look=$('look');look.addEventListener('pointerdown',e=>{if(!canPlay()||touch.look!==null)return;e.preventDefault();touch.look=e.pointerId;touch.x=e.clientX;touch.y=e.clientY;look.setPointerCapture(e.pointerId)});look.addEventListener('pointermove',e=>{if(touch.look!==e.pointerId||!canPlay())return;game.player.yaw+=(e.clientX-touch.x)*.005;game.player.pitch=Math.max(-1.1,Math.min(1.1,game.player.pitch-(e.clientY-touch.y)*.005));touch.x=e.clientX;touch.y=e.clientY});for(const e of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(e,v=>{if(v.pointerId===touch.look)touch.look=null});$('sprint').addEventListener('pointerdown',e=>{if(canPlay()){touch.sprint.add(e.pointerId);$('sprint').setPointerCapture(e.pointerId)}});for(const e of ['pointerup','pointercancel','lostpointercapture'])$('sprint').addEventListener(e,v=>touch.sprint.delete(v.pointerId));window.addEventListener('blur',()=>{clearInput();pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause()}resize()});window.addEventListener('orientationchange',resize);window.screen?.orientation?.addEventListener?.('change',resize);document.addEventListener('fullscreenchange',resize);window.visualViewport?.addEventListener('resize',resize);window.addEventListener('pagehide',()=>{clearInput();pause()});$('rotate-lock').onclick=requestLandscape;
function resize(){clearInput();cancelInventoryDrag();updateOrientation();if(renderer)pendingRendererSize={width:innerWidth,height:innerHeight,ratio:pixelRatio(innerWidth,innerHeight,devicePixelRatio,coarse,renderScale)};if(camera){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}}window.addEventListener('resize',resize);
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;const before=game.mode;if(!document.hidden&&!orientationBlocked){updateStreamView();if(game.zone==='level0'&&!game.changed)chunkStream.process(worldLoading?8:3,worldLoading?48:24);updateStreamView()}const simulationActive=canPlay();if(simulationActive)game.update(dt,{forward:input.forward+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),strafe:input.strafe+(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),interactHeld:interactPointer!==null||keys.has('KeyE'),sprint:touch.sprint.size>0||keys.has('ShiftLeft')||keys.has('ShiftRight')});game.updateDevices(dt,!worldLoading&&!orientationBlocked&&!document.hidden&&$('help').hidden&&$('quit-panel').hidden);if(before!==game.mode)showState();while(game.events.length){const t=game.events.shift();if(t!=='exit'&&t!=='lost'&&t!=='level1-demo-end')say(t)}if(now>toastUntil)$('toast').classList.remove('show');sync();syncEscapeVisual(dt,simulationActive&&game.mode==='playing');if(!document.hidden&&!orientationBlocked)updateStreamView();if(game.mode==='menu'&&!hasRun){camera.position.set(game.maze.doorX-12.5,EYE_HEIGHT,game.maze.doorZ-1.35);camera.rotation.set(-.025,-Math.PI/2+.14,0,'YXZ')}else{camera.position.set(game.player.x,EYE_HEIGHT,game.player.z);camera.rotation.set(game.player.pitch,-game.player.yaw,0,'YXZ')}renderOrigin.x=Math.floor(game.player.x/RENDER_METRES)*RENDER_METRES;renderOrigin.z=Math.floor(game.player.z/RENDER_METRES)*RENDER_METRES;scene.position.set(-renderOrigin.x,0,-renderOrigin.z);camera.position.x-=renderOrigin.x;camera.position.z-=renderOrigin.z;gameAudio.update(dt,game);if(soundNoticePending){say('声音未能启动。请再点一下画面，或在设置中重新开启音效。');soundNoticePending=false}if(!document.hidden&&!orientationBlocked&&!worldLoading&&(canPlay()||now-lastRender>80)){if(pendingRendererSize){const{width,height,ratio}=pendingRendererSize;renderer.setPixelRatio(ratio);renderer.setSize(width,height,false);pendingRendererSize=null}renderer.render(scene,camera);worldRendered=true;$('world').style.visibility='visible';lastRender=now}}
initPhone();
initInventory();
updateOrientation();
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:false,powerPreference:'high-performance'});renderer.shadowMap.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=LIGHTING.exposure;build();graphicsReady=true;resize();requestAnimationFrame(frame)}catch(e){graphicsReady=false;$('start').disabled=true;$('continue').disabled=true;$('render-warning').hidden=false;$('error').hidden=false;console.error(e)}
// Optional structured browser tools, sharing the same visible game state and actions.
if(document.modelContext?.registerTool){const abort=new AbortController();for(const tool of [{name:'read_exploration_status',description:'Read the current visible exploration and supplies status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({mode:orientationBlocked?'orientation-paused':game.phoneOpenId?'phone':game.inventoryOpen?'inventory':game.mode,orientationBlocked,zone:$('zone').textContent,food:Math.ceil(game.food),hydration:Math.ceil(game.hydration),foodCount:game.inventory('food').length,waterCount:game.inventory('water').length,phones:game.inventory('phone').map(i=>({id:i.id,battery:Math.ceil(i.battery),charging:game.chargingPhoneId===i.id})),objective:$('objective').textContent})},{name:'pause_exploration',description:'Pause the current exploration, freezing survival time.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(input&&Object.keys(input).length)throw Error('No arguments expected');pause();return{mode:game.mode}}}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:abort.signal})).catch(()=>{})}catch{}}window.addEventListener('pagehide',()=>abort.abort(),{once:true})}
if('serviceWorker'in navigator){navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(async reg=>{await navigator.serviceWorker.ready;$('offline-status').textContent='离线资源已就绪。已安装版本会在所有页面关闭后安全更新。';reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)say('新版本已缓存。结束探索并关闭所有游戏页面后更新。')})})}).catch(()=>{$('offline-status').textContent='离线缓存未完成。请保持联网，稍后重新打开。'})}else $('offline-status').textContent='此环境不支持离线缓存。请使用 HTTPS 打开。';
