import * as THREE from './vendor/three.module.min.js';
import {PreviewGame as Game,PREVIEW_LAMPS,PREVIEW_SPAWN} from './preview-game.js';
import {BAKE,bakedLight} from './preview-lighting.js';
const $=s=>document.getElementById(s), seed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
// Shared physical heights: all walls, ceiling panels, fixtures and lintels stay aligned.
const ROOM_HEIGHT=3.6,EYE_HEIGHT=1.63,DOOR_HEAD=2.66;
// Neutral bounced fluorescent light: yellow comes from the wallpaper, not a second yellow filter.
const LIGHTING=Object.freeze({sky:0xfff5e2,ground:0xcdcdc2,hemisphere:.72,directional:.16,exposure:1.0});
let game=new Game(5),graphicsReady=false,hasRun=false,soundEnabled=true,renderScale=1,lastRender=0,renderer,scene,camera,mazeGroup,roomGroup,exitGroup,doorPivot,itemMeshes=new Map(),last=performance.now(),toastUntil=0,helpFrom='menu';
const keys=new Set(),input={forward:0,strafe:0,sprint:false},touch={move:null,look:null,sprint:new Set(),x:0,y:0},coarse=matchMedia('(pointer:coarse)').matches;
// Gate the rendered mobile viewport, not just the physical screen's orientation.
const mobile=navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)||(coarse&&navigator.maxTouchPoints>0&&!matchMedia('(any-hover: hover)').matches);
let orientationBlocked=false,orientationRequestPending=false,orientationFocus=null;
function canPlay(){return game.mode==='playing'&&!orientationBlocked&&!document.hidden}
function updateOrientation(){
 const blocked=mobile&&innerHeight>=innerWidth;
 if(blocked!==orientationBlocked){
  clearInput();last=performance.now();stepClock=0;
  orientationBlocked=blocked;
  if(blocked){orientationFocus=document.activeElement;document.exitPointerLock?.();if(humGain)humGain.gain.setTargetAtTime(0,audio.currentTime,.05)}
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
let audio,humGain,hum,stepClock=0,lastLoop=0;
// Authored texture assets are bundled locally and included in the offline cache.
const textureLoader=new THREE.TextureLoader();
function texture(path){const t=textureLoader.load(path,undefined,undefined,()=>say('纹理加载未完成。请联网后重新打开。'));t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=2;return t}
const wallTex=texture('./textures/level0-wallpaper.webp'),floorTex=texture('./textures/level0-carpet.webp'),ceilTex=texture('./textures/level0-ceiling.webp');
// Use only one panel interior from the original 1254px source, avoiding its baked-in border.
ceilTex.wrapS=ceilTex.wrapT=THREE.ClampToEdgeWrapping;
ceilTex.offset.set(32/1254,(1254-592)/1254);ceilTex.repeat.set(560/1254,560/1254);
const mat={wall:new THREE.MeshLambertMaterial({map:wallTex,vertexColors:true}),floor:new THREE.MeshLambertMaterial({map:floorTex,vertexColors:true}),ceiling:new THREE.MeshLambertMaterial({map:ceilTex}),ceilingGrid:new THREE.MeshLambertMaterial({color:0x98988c}),trim:new THREE.MeshLambertMaterial({color:0x5c5938}),wood:new THREE.MeshLambertMaterial({color:0x665033}),panel:new THREE.MeshLambertMaterial({color:0x4b3a26}),metal:new THREE.MeshLambertMaterial({color:0x3c402f}),light:new THREE.MeshBasicMaterial({color:0xfff5df,toneMapped:false}),housing:new THREE.MeshLambertMaterial({color:0x535745}),room:new THREE.MeshLambertMaterial({color:0xa69869}),exit:new THREE.MeshLambertMaterial({color:0x6e7777}),paper:new THREE.MeshLambertMaterial({color:0xc7c39c}),food:new THREE.MeshLambertMaterial({color:0x9d7548}),water:new THREE.MeshLambertMaterial({color:0x719293})};
// Static lighting is baked once in linear vertex colours. Dynamic door/items keep Lambert shading.
for(const name of ['wall','floor','ceiling','room','exit','trim','housing']){
 const old=mat[name];mat[name]=new THREE.MeshBasicMaterial({map:old.map,color:old.color,vertexColors:true});mat[name].userData.baked=true;old.dispose();
}
mat.trim.color.setHex(0xaca587);mat.housing.color.setHex(0xb8b6a7);
mat.ceilingGrid=new THREE.MeshBasicMaterial({color:0x706f66});
const diffuser=document.createElement('canvas');diffuser.width=256;diffuser.height=96;
const diffuserContext=diffuser.getContext('2d');diffuserContext.fillStyle='#f1f0dd';diffuserContext.fillRect(0,0,256,96);
for(let y=0;y<96;y+=6){diffuserContext.fillStyle=y%12===0?'#dfdfd0':'#e9e9da';diffuserContext.fillRect(0,y,256,1);}
for(let x=0;x<256;x+=8){diffuserContext.fillStyle='#dedfce';diffuserContext.fillRect(x,0,1,96);}
const diffuserTexture=new THREE.CanvasTexture(diffuser);diffuserTexture.colorSpace=THREE.SRGBColorSpace;mat.light.map=diffuserTexture;
const boxGeo=new THREE.BoxGeometry(1,1,1);
// World-scale UVs keep every wall and floor at the same density, including short doorway pieces.
function box(group,x,y,z,w,h,d,material){
 let geo=boxGeo;
 if(material.userData.baked){
  const step=BAKE.sampleStep;
  geo=new THREE.BoxGeometry(w,h,d,Math.max(1,Math.ceil(w/step)),Math.max(1,Math.ceil(h/step)),Math.max(1,Math.ceil(d/step)));
  const p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,metres=material===mat.wall?2.5:2,colours=new Float32Array(p.count*3);
  const blockers=game.walls;
  for(let i=0;i<p.count;i++){
   const pos=[p.getX(i)+x,p.getY(i)+y,p.getZ(i)+z],normal=[n.getX(i),n.getY(i),n.getZ(i)];
   if(Math.abs(normal[1])>.5)uv.setXY(i,pos[0]/metres,pos[2]/metres);
   else if(Math.abs(normal[0])>.5)uv.setXY(i,pos[2]/metres,pos[1]/metres);
   else uv.setXY(i,pos[0]/metres,pos[1]/metres);
   colours.set(bakedLight(pos,normal,group.userData.lamps||[],blockers),i*3);
  }
  geo.setAttribute('color',new THREE.BufferAttribute(colours,3));
 }
 const mesh=new THREE.Mesh(geo,material);mesh.position.set(x,y,z);if(geo===boxGeo)mesh.scale.set(w,h,d);group.add(mesh);return mesh;
}
function ceiling(group,x,z,w,d){
 box(group,x,ROOM_HEIGHT+.10,z,w,.16,d,mat.ceilingGrid);
 const nx=Math.round(w/1.2),nz=Math.round(d/.6),tw=w/nx,td=d/nz,slots=[];
 for(let ix=0;ix<nx;ix++)for(let iz=0;iz<nz;iz++){
  const px=x-w/2+(ix+.5)*tw,pz=z-d/2+(iz+.5)*td;
  // Remove the panel occupied by a fixture. The diffuser sits in a real recess.
  if((group.userData.lamps||[]).some(l=>Math.abs(l.x-px)<tw*.48&&Math.abs(l.z-pz)<td*.48))continue;
  slots.push([px,pz]);
 }
 const geometry=new THREE.PlaneGeometry(1,1);geometry.rotateX(Math.PI/2);
 geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(12).fill(1),3));
 const panels=new THREE.InstancedMesh(geometry,mat.ceiling,slots.length),dummy=new THREE.Object3D(),colour=new THREE.Color();
 slots.forEach(([px,pz],index)=>{
  dummy.position.set(px,ROOM_HEIGHT-.02,pz);dummy.scale.set(tw-.016,1,td-.016);dummy.updateMatrix();panels.setMatrixAt(index,dummy.matrix);
  colour.setRGB(...bakedLight([px,ROOM_HEIGHT-.02,pz],[0,-1,0],group.userData.lamps||[],game.walls));panels.setColorAt(index,colour);
 });
 panels.instanceMatrix.needsUpdate=true;panels.instanceColor.needsUpdate=true;panels.computeBoundingSphere();group.add(panels);
}
// Group only static repeated boxes. Hinged doors and inventory items stay independently movable.
function batchStaticBoxes(group){
 const buckets=new Map();
 for(const mesh of [...group.children])if(mesh.isMesh&&!mesh.isInstancedMesh){const list=buckets.get(mesh.material)||[];list.push(mesh);buckets.set(mesh.material,list);}
 for(const [material,meshes]of buckets){
  if(meshes.length<2)continue;
  if(meshes.every(m=>m.geometry===boxGeo)){
   const batch=new THREE.InstancedMesh(boxGeo,material,meshes.length);meshes.forEach((m,i)=>{m.updateMatrix();batch.setMatrixAt(i,m.matrix);group.remove(m);});batch.computeBoundingSphere();group.add(batch);continue;
  }
  if(!material.userData.baked)continue;
  const attributes={position:[],normal:[],uv:[],color:[]},sizes={position:3,normal:3,uv:2,color:3};
  for(const mesh of meshes){mesh.updateMatrix();const geo=mesh.geometry.toNonIndexed();geo.applyMatrix4(mesh.matrix);for(const key of Object.keys(attributes))attributes[key].push(...geo.attributes[key].array);group.remove(mesh);mesh.geometry.dispose();geo.dispose();}
  const geo=new THREE.BufferGeometry();for(const [key,values]of Object.entries(attributes))geo.setAttribute(key,new THREE.Float32BufferAttribute(values,sizes[key]));geo.computeBoundingSphere();group.add(new THREE.Mesh(geo,material));
 }
}
function pixelRatio(width,height,dpr,coarse,scale=1){const ceiling=coarse?1.35:1.6,budget=coarse?1100000:2000000;return Math.min(dpr,ceiling,Math.sqrt(budget/Math.max(1,width*height)))*scale}
function label(text,w=256,h=64){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#b5ad7d';ctx.fillRect(0,0,w,h);ctx.fillStyle='#353c2b';ctx.font=`500 ${h*.43}px monospace`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,w/2,h/2);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t})}
function makeFixture(g,x,z){
 // 60cm ceiling module: shallow cavity, thin enamel lip, recessed prismatic diffuser.
 box(g,x,ROOM_HEIGHT+.035,z,1.18,.055,.58,mat.housing);
 for(const edge of [-1,1]){
  box(g,x+edge*.5875,ROOM_HEIGHT-.05,z,.025,.035,.6,mat.housing);
  box(g,x,ROOM_HEIGHT-.05,z+edge*.2875,1.15,.035,.025,mat.housing);
 }
 box(g,x,ROOM_HEIGHT-.026,z,1.115,.007,.495,mat.light);
 box(g,x,ROOM_HEIGHT-.039,z,.018,.016,.495,mat.housing);
}
function build(){if(scene)scene.traverse(o=>{if(o.isMesh){if(o.geometry!==boxGeo)o.geometry.dispose();if(o.material&&!Object.values(mat).includes(o.material)){o.material.map?.dispose();o.material.dispose()}}});scene=new THREE.Scene();scene.background=new THREE.Color(0x8b825c);scene.fog=new THREE.Fog(0x8b825c,14,44);scene.add(new THREE.HemisphereLight(LIGHTING.sky,LIGHTING.ground,LIGHTING.hemisphere));const directional=new THREE.DirectionalLight(LIGHTING.sky,LIGHTING.directional);directional.position.set(4,10,5);scene.add(directional);camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.06,65);camera.rotation.order='YXZ';mazeGroup=new THREE.Group();roomGroup=new THREE.Group();exitGroup=new THREE.Group();scene.add(mazeGroup,roomGroup,exitGroup);exitGroup.visible=false;const m=game.maze;mazeGroup.userData.lamps=PREVIEW_LAMPS;roomGroup.userData.lamps=[{x:m.doorX+3,y:3.545,z:m.doorZ,power:9}];exitGroup.userData.lamps=[{x:m.doorX-3,y:3.545,z:m.doorZ,power:7},{x:m.doorX-7,y:3.545,z:m.doorZ,power:7}];
box(mazeGroup,6,-.08,4.2,12,.16,8.4,mat.floor);ceiling(mazeGroup,6,4.2,12,8.4);
for(const w of game.walls){
 const room=w.x>m.doorX+.01;const group=room?roomGroup:mazeGroup;
 box(group,w.x,ROOM_HEIGHT/2,w.z,w.w,ROOM_HEIGHT,w.d,room?mat.room:mat.wall);
 box(group,w.x,BAKE.baseboardHeight/2,w.z,w.w+.012,BAKE.baseboardHeight,w.d+.012,mat.trim);
 box(group,w.x,ROOM_HEIGHT-BAKE.topMoldingHeight/2,w.z,w.w+.008,BAKE.topMoldingHeight,w.d+.008,mat.trim);
}
for(const lamp of PREVIEW_LAMPS)makeFixture(mazeGroup,lamp.x,lamp.z);
box(roomGroup,m.doorX+3,-.08,m.doorZ,6,.16,5,mat.floor);ceiling(roomGroup,m.doorX+3,m.doorZ,6,5);makeFixture(roomGroup,m.doorX+3,m.doorZ);box(roomGroup,m.doorX,(ROOM_HEIGHT+DOOR_HEAD)/2,m.doorZ,.18,ROOM_HEIGHT-DOOR_HEAD,1.6,mat.room);box(roomGroup,m.doorX-.06,1.36,m.doorZ-.91,.23,2.72,.2,mat.wood);box(roomGroup,m.doorX-.06,1.36,m.doorZ+.91,.23,2.72,.2,mat.wood);box(roomGroup,m.doorX-.06,2.7,m.doorZ,.23,.18,2.02,mat.wood);
doorPivot=new THREE.Group();doorPivot.position.set(m.doorX,0,m.doorZ-.8);roomGroup.add(doorPivot);box(doorPivot,0,1.28,.8,.11,2.56,1.6,mat.wood);for(const z of [.43,1.15]){box(doorPivot,-.061,1.75,z,.02,.95,.56,mat.panel);box(doorPivot,-.061,.66,z,.02,.78,.56,mat.panel);box(doorPivot,.061,1.75,z,.02,.95,.56,mat.panel)}box(doorPivot,-.105,1.1,1.38,.15,.065,.12,mat.metal);box(doorPivot,.105,1.1,1.38,.15,.065,.12,mat.metal);const sign=new THREE.Mesh(new THREE.PlaneGeometry(1,.22),label('MANILA'));sign.position.set(m.doorX-.13,2.91,m.doorZ);sign.rotation.y=-Math.PI/2;roomGroup.add(sign);
// Low bench, two finite bottles, and a paper note.
box(roomGroup,m.doorX+4.4,.61,m.doorZ+.5,.8,.12,2.7,mat.wood);for(const z of [-.55,1.55])for(const x of [4.12,4.68])box(roomGroup,m.doorX+x,.29,m.doorZ+z,.075,.58,.075,mat.wood);box(roomGroup,m.doorX+4.35,.681,m.doorZ+1.4,.42,.012,.48,mat.paper);for(let i=0;i<5;i++)box(roomGroup,m.doorX+4.35,.689,m.doorZ+1.26+i*.056,.29,.002,.009,mat.panel);
box(exitGroup,m.doorX-4.8,-.08,m.doorZ,9.6,.16,2.4,mat.exit);box(exitGroup,m.doorX-4.8,ROOM_HEIGHT+.08,m.doorZ,9.6,.16,2.4,mat.exit);box(exitGroup,m.doorX-4.8,ROOM_HEIGHT/2,m.doorZ-1.28,9.6,ROOM_HEIGHT,.16,mat.exit);box(exitGroup,m.doorX-4.8,ROOM_HEIGHT/2,m.doorZ+1.28,9.6,ROOM_HEIGHT,.16,mat.exit);box(exitGroup,m.doorX-9.5,ROOM_HEIGHT/2,m.doorZ,.1,ROOM_HEIGHT,2.4,new THREE.MeshBasicMaterial({color:0x899ba0}));makeFixture(exitGroup,m.doorX-3,m.doorZ);makeFixture(exitGroup,m.doorX-7,m.doorZ);itemMeshes.clear();for(const i of game.items){const g=new THREE.Group();if(i.kind==='food'){box(g,0,.05,0,.32,.1,.22,mat.food);box(g,0,.106,0,.12,.009,.20,mat.paper);box(g,-.16,.05,0,.026,.08,.22,mat.panel);const num=new THREE.Mesh(new THREE.PlaneGeometry(.08,.08),label(i.id.slice(-1),64,64));num.rotation.x=-Math.PI/2;num.position.set(0,.117,0);g.add(num)}else{box(g,0,.15,0,.13,.3,.13,mat.water);box(g,0,.325,0,.09,.05,.09,mat.metal);box(g,0,.15,-.067,.13,.09,.008,mat.paper)}scene.add(g);itemMeshes.set(i.id,g)}batchStaticBoxes(mazeGroup);batchStaticBoxes(roomGroup);batchStaticBoxes(exitGroup);$('seed-label').textContent='固定房间';sync();}
function sync(){mazeGroup.visible=!game.changed;exitGroup.visible=game.changed;doorPivot.rotation.y=game.door*Math.PI/2;for(const i of game.items){const g=itemMeshes.get(i.id);g.visible=i.state==='world'&&(!game.changed||i.area==='room');g.position.set(i.x,i.kind==='water'&&i.area==='room'?.68:.005,i.z)}$('food-meter').style.width=game.food+'%';$('water-meter').style.width=game.hydration+'%';$('food-value').textContent=Math.ceil(game.food);$('water-value').textContent=Math.ceil(game.hydration);$('inventory').textContent=`干粮 ${game.inventory('food').length}  /  饮用水 ${game.inventory('water').length}`;$('zone').textContent=game.inRoom()?'MANILA':game.changed?'UNKNOWN':'LEVEL 0';$('objective').textContent=game.changed?'再打开门，看看外面。':game.entered?'进来之后，把门完全关上。':game.loops?'换一条路，寻找木门。':'找到一扇木门。';const i=game.nearestItem();$('prompt').textContent=game.mode!=='playing'?'':i?(i.kind==='food'?`拾回食物 ${i.id.slice(-1)}`:'拾起饮用水'):game.nearNote()?'阅读纸条':game.nearDoor()?(game.doorTarget>.5?'关门':'开门'):'';const available=Boolean($('prompt').textContent);$('interact').hidden=!available;$('interact').disabled=!available;$('interact-label').textContent=available?$('prompt').textContent:'交互';$('drop').disabled=$('eat').disabled=game.inventory('food').length===0;$('drink').disabled=game.inventory('water').length===0;$('food-value').parentElement?.classList.toggle('low',game.food<25);$('water-value').parentElement?.classList.toggle('low',game.hydration<25);}
function say(t){$('toast').textContent=t;$('toast').classList.add('show');toastUntil=performance.now()+6500}
function clearInput(){for(const [id,pointer]of [['stick',touch.move],['look',touch.look],...Array.from(touch.sprint,p=>['sprint',p])])if(pointer!==null){try{$(id).releasePointerCapture?.(pointer)}catch{}}keys.clear();touch.move=null;touch.look=null;touch.sprint.clear();input.forward=input.strafe=0;input.sprint=false;$('stick-knob').style.transform='';}
function showState(){$('inventory-panel').hidden=true;$('inventory-toggle').setAttribute('aria-expanded','false');for(const id of ['menu','pause-panel','note','ending','quit-panel'])$(id).hidden=true;$('hud').hidden=['menu','won','lost'].includes(game.mode);if(game.mode==='menu'){$('menu').hidden=false;$('continue').disabled=!hasRun}if(game.mode==='paused')$('pause-panel').hidden=false;if(game.mode==='note')$('note').hidden=false;if(['won','lost'].includes(game.mode)){$('ending').hidden=false;$('end-eyebrow').textContent=game.mode==='won'?'CONNECTION CHANGED':'SIGNAL LOST';$('end-title').textContent=game.mode==='won'?'门外，已经不是来路。':'你再也走不动了。';$('end-copy').innerHTML=game.mode==='won'?'你离开了零层。<br>下一层的风，比这里冷。':'饥饿或脱水结束了这次探索。<br>新的迷宫还在等着你。'}if(game.mode!=='playing'){clearInput();document.exitPointerLock?.();if(humGain)humGain.gain.setTargetAtTime(0,audio.currentTime,.05)}last=performance.now()}
function pause(){game.pause();showState()}
function act(a){if(!canPlay())return;if(a==='interact'){if(game.interact()==='note')showState()}else if(a==='drop')game.drop();else if(a==='eat')game.consume('food');else if(a==='drink')game.consume('water');sync()}
function soundStart(){if(!soundEnabled)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();if(!hum){hum=audio.createOscillator();hum.type='sine';hum.frequency.value=60;humGain=audio.createGain();humGain.gain.value=.013;hum.connect(humGain).connect(audio.destination);hum.start()}}catch{}}
function footstep(volume=.015,freq=85){if(!soundEnabled||!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.setValueAtTime(freq,audio.currentTime);o.frequency.exponentialRampToValueAtTime(35,audio.currentTime+.12);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audio.currentTime+.15);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.17)}
function restart(){if(orientationBlocked||!graphicsReady)return;void requestLandscape();hasRun=true;clearInput();game.reset(seed());build();game.start();lastLoop=0;showState();soundStart()}
function requestLook(){try{const pending=$('world').requestPointerLock?.();pending?.catch(()=>say('请再次点击画面以启用鼠标观察。'))}catch{say('此浏览器未允许鼠标锁定。请使用触屏或支持鼠标锁定的浏览器。')}}
function returnToMenu(){game.pause();game.mode='menu';showState()}
$('start').onclick=()=>{if(!graphicsReady)return;restart();if(!coarse&&!orientationBlocked)requestLook()};
$('continue').onclick=()=>{if(orientationBlocked||!graphicsReady||!hasRun||['won','lost'].includes(game.mode))return;void requestLandscape();game.mode='playing';showState();soundStart();if(!coarse)requestLook()};
$('inventory-toggle').onclick=()=>{const next=$('inventory-panel').hidden;$('inventory-panel').hidden=!next;$('inventory-toggle').setAttribute('aria-expanded',String(next));};
$('pause').onclick=pause;$('resume').onclick=()=>{if(orientationBlocked)return;void requestLandscape();game.resume();showState();soundStart()};$('restart').onclick=restart;$('again').onclick=restart;$('main-menu').onclick=returnToMenu;
$('quit').onclick=()=>{$('quit-panel').hidden=false;clearInput()};$('quit-back').onclick=()=>{$('quit-panel').hidden=true};$('error-back').onclick=()=>{$('error').hidden=true};
$('sound-toggle').onclick=()=>{soundEnabled=!soundEnabled;$('sound-toggle').textContent=soundEnabled?'环境音：开':'环境音：关';$('sound-toggle').setAttribute('aria-pressed',String(soundEnabled));if(soundEnabled)soundStart()};
$('quality-toggle').onclick=()=>{renderScale=renderScale===1?.75:1;$('quality-toggle').textContent=renderScale===1?'画质：标准':'画质：省电';resize()};
$('note-close').onclick=()=>{game.resume();showState()};for(const a of ['interact','drop','eat','drink'])$(a).onclick=e=>{e.stopPropagation();act(a)};
function openHelp(){helpFrom=game.mode;$('help').hidden=false;if(game.mode==='playing')pause()}$('help-open').onclick=openHelp;$('pause-help').onclick=openHelp;$('help-close').onclick=()=>{$('help').hidden=true;last=performance.now()};
$('world').addEventListener('click',()=>{if(canPlay()&&!coarse)requestLook()});document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&!coarse&&canPlay())pause()});document.addEventListener('mousemove',e=>{if(document.pointerLockElement&&canPlay()){game.player.yaw+=e.movementX*.0024;game.player.pitch=Math.max(-1.1,Math.min(1.1,game.player.pitch-e.movementY*.0024))}});
window.addEventListener('keydown',e=>{if(orientationBlocked)return;if(!$('help').hidden){if(e.code==='Escape')$('help-close').onclick();return}if(!$('quit-panel').hidden){if(e.code==='Escape')$('quit-back').onclick();return}if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){if(game.mode==='playing')pause();else if(game.mode==='paused'){game.resume();showState()}return}if(!canPlay())return;keys.add(e.code);if(!e.repeat){if(e.code==='KeyE')act('interact');if(e.code==='KeyQ')act('drop');if(e.code==='KeyF')act('eat');if(e.code==='KeyR')act('drink')}});window.addEventListener('keyup',e=>keys.delete(e.code));
const stick=$('stick');stick.addEventListener('pointerdown',e=>{if(!canPlay()||touch.move!==null)return;e.preventDefault();touch.move=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e)});function updateStick(e){if(!canPlay()||e.pointerId!==touch.move)return;const r=stick.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,d=Math.max(1,Math.hypot(dx,dy)/38);input.strafe=dx/d/38;input.forward=-dy/d/38;$('stick-knob').style.transform=`translate(${dx/d}px,${dy/d}px)`}stick.addEventListener('pointermove',updateStick);function endStick(e){if(e.pointerId===touch.move){touch.move=null;input.forward=input.strafe=0;$('stick-knob').style.transform=''}}for(const e of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(e,endStick);
const look=$('look');look.addEventListener('pointerdown',e=>{if(!canPlay()||touch.look!==null)return;e.preventDefault();touch.look=e.pointerId;touch.x=e.clientX;touch.y=e.clientY;look.setPointerCapture(e.pointerId)});look.addEventListener('pointermove',e=>{if(touch.look!==e.pointerId||!canPlay())return;game.player.yaw+=(e.clientX-touch.x)*.005;game.player.pitch=Math.max(-1.1,Math.min(1.1,game.player.pitch-(e.clientY-touch.y)*.005));touch.x=e.clientX;touch.y=e.clientY});for(const e of ['pointerup','pointercancel','lostpointercapture'])look.addEventListener(e,v=>{if(v.pointerId===touch.look)touch.look=null});$('sprint').addEventListener('pointerdown',e=>{if(canPlay()){touch.sprint.add(e.pointerId);$('sprint').setPointerCapture(e.pointerId)}});for(const e of ['pointerup','pointercancel','lostpointercapture'])$('sprint').addEventListener(e,v=>touch.sprint.delete(v.pointerId));window.addEventListener('blur',()=>{clearInput();pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause()}resize()});window.addEventListener('orientationchange',resize);window.screen?.orientation?.addEventListener?.('change',resize);document.addEventListener('fullscreenchange',resize);window.visualViewport?.addEventListener('resize',resize);window.addEventListener('pagehide',()=>{clearInput();pause()});$('rotate-lock').onclick=requestLandscape;
function resize(){clearInput();updateOrientation();if(renderer){renderer.setPixelRatio(pixelRatio(innerWidth,innerHeight,devicePixelRatio,coarse,renderScale));renderer.setSize(innerWidth,innerHeight,false)}if(camera){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}}window.addEventListener('resize',resize);
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;const before=game.mode;if(canPlay())game.update(dt,{forward:input.forward+(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0),strafe:input.strafe+(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0),sprint:touch.sprint.size>0||keys.has('ShiftLeft')||keys.has('ShiftRight')});if(before!==game.mode)showState();while(game.events.length){const t=game.events.shift();if(t!=='exit'&&t!=='lost')say(t)}if(now>toastUntil)$('toast').classList.remove('show');sync();if(game.mode==='menu'&&!hasRun){camera.position.set(PREVIEW_SPAWN.x,EYE_HEIGHT,PREVIEW_SPAWN.z);camera.rotation.set(PREVIEW_SPAWN.pitch,-PREVIEW_SPAWN.yaw,0,'YXZ')}else{camera.position.set(game.player.x,EYE_HEIGHT,game.player.z);camera.rotation.set(game.player.pitch,-game.player.yaw,0,'YXZ')}if(humGain)humGain.gain.setTargetAtTime(canPlay()&&soundEnabled?.012:0,audio.currentTime,.12);if(canPlay()&&(Math.abs(input.forward)+Math.abs(input.strafe)>0||keys.has('KeyW')||keys.has('KeyS')||keys.has('KeyA')||keys.has('KeyD'))){stepClock+=dt;if(stepClock>.56){footstep();stepClock=0}}else if(canPlay()&&game.entered&&!game.changed){stepClock+=dt;if(stepClock>1.2){footstep(Math.min(.028,.004+game.approach*.0007),60);stepClock=0}}if(game.loops!==lastLoop){lastLoop=game.loops;$('fade').style.opacity='.55';setTimeout(()=>$('fade').style.opacity='0',80)}if(!document.hidden&&(canPlay()||now-lastRender>80)){renderer.render(scene,camera);lastRender=now}}
updateOrientation();
try{renderer=new THREE.WebGLRenderer({canvas:$('world'),antialias:false,powerPreference:'high-performance'});renderer.shadowMap.enabled=false;renderer.shadowMap.autoUpdate=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=LIGHTING.exposure;build();graphicsReady=true;resize();requestAnimationFrame(frame)}catch(e){graphicsReady=false;$('start').disabled=true;$('continue').disabled=true;$('render-warning').hidden=false;$('error').hidden=false;console.error(e)}
// Optional structured browser tools, sharing the same visible game state and actions.
if(document.modelContext?.registerTool){const abort=new AbortController();for(const tool of [{name:'read_exploration_status',description:'Read the current visible exploration and supplies status.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({mode:orientationBlocked?'orientation-paused':game.mode,orientationBlocked,zone:$('zone').textContent,food:Math.ceil(game.food),hydration:Math.ceil(game.hydration),foodCount:game.inventory('food').length,waterCount:game.inventory('water').length,objective:$('objective').textContent})},{name:'pause_exploration',description:'Pause the current exploration, freezing survival time.',inputSchema:{type:'object',properties:{},additionalProperties:false},execute:input=>{if(input&&Object.keys(input).length)throw Error('No arguments expected');pause();return{mode:game.mode}}}]){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:abort.signal})).catch(()=>{})}catch{}}window.addEventListener('pagehide',()=>abort.abort(),{once:true})}
$('offline-status').textContent='固定房间本地样稿，没有安装或更新线上缓存。光影尚未通过实际 WebGL 画面验收。';
