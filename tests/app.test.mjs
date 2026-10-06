import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import vm from'node:vm';import * as THREE from'../dist/vendor/three.module.min.js';import{Game}from'../dist/game.js';
const source=fs.readFileSync('dist/app.js','utf8').replace("import * as THREE from './vendor/three.module.min.js';",'').replace("import {Game} from './game.js';",'');
function boot(options={}){
 const {width=844,height=390,coarse=true,mobile=true,standalone=false,lock,fullscreen,platform='',userAgent}=options;
 const nodes=new Map(),listeners={},canvas2d={fillRect(){},fillText(){}},captured=new Map();
 function on(target,n,fn){(listeners[target+':'+n]??=[]).push(fn)}
 function element(id){if(!nodes.has(id))nodes.set(id,{id,hidden:id!=='menu',disabled:id==='continue',style:{},textContent:'',inert:false,isConnected:true,classList:{add(){},remove(){}},addEventListener(n,fn){on(id,n,fn)},setAttribute(){},focus(){document.activeElement=this},setPointerCapture(p){captured.set(p,id)},releasePointerCapture(p){captured.delete(p)},getContext:()=>canvas2d,getBoundingClientRect:()=>({left:22,top:200,width:112,height:112})});return nodes.get(id)}
 let frame,rendered,now=0;const document={getElementById:element,createElement:()=>element('canvas-'+nodes.size),addEventListener(n,fn){on('document',n,fn)},exitPointerLock(){},hidden:false,documentElement:{}};
 if(fullscreen)document.documentElement.requestFullscreen=()=>fullscreen(document);
 class Renderer{constructor(){this.shadowMap={};}setPixelRatio(v){this.ratio=v}setSize(w,h){this.width=w;this.height=h}render(scene,camera){rendered={scene,camera}}};class Loader{load(){return new THREE.Texture()}}
 const orientation={addEventListener(n,fn){on('orientation',n,fn)}};if(lock)orientation.lock=lock;
 const context={THREE:{...THREE,WebGLRenderer:Renderer,TextureLoader:Loader},Game,document,window:{screen:{orientation},visualViewport:{addEventListener(n,fn){on('viewport',n,fn)}},addEventListener(n,fn){on('window',n,fn)}},navigator:{userAgent:userAgent??(mobile?'iPhone':'Desktop'),platform,maxTouchPoints:mobile?2:0},performance:{now:()=>now},crypto:{getRandomValues:a=>{a[0]=42;return a}},matchMedia:q=>({matches:q==='(pointer:coarse)'?coarse:q==='(any-hover: hover)'?!mobile:q==='(display-mode: standalone)'?standalone:false}),innerWidth:width,innerHeight:height,devicePixelRatio:3,requestAnimationFrame:fn=>frame=fn,setTimeout:fn=>fn(),console,AbortController};
 vm.createContext(context);vm.runInContext(source,context);
 const dispatch=(target,n,event={})=>{for(const fn of listeners[target+':'+n]||[])fn(event)};
 return{context,element,listeners,captured,dispatch,rotate(w,h){context.innerWidth=w;context.innerHeight=h;dispatch('window','resize')},frame:t=>{now=t;frame(t)},getRender:()=>rendered,eval:s=>vm.runInContext(s,context)}
}
test('app boots and follows menu / pause / continue / settings / restart with a mocked DOM and GPU',()=>{const app=boot();assert.equal(app.element('error').hidden,true);
assert.equal(app.eval('game.mode'),'menu');app.frame(100);assert.equal(app.getRender().camera.position.x,22.5);assert.equal(app.eval('hasRun'),false);app.element('start').onclick();assert.equal(app.eval('game.mode'),'playing');assert.equal(app.eval('game.maze.seed'),42);app.element('pause').onclick();assert.equal(app.eval('game.mode'),'paused');app.element('main-menu').onclick();assert.equal(app.eval('game.mode'),'menu');assert.equal(app.element('continue').disabled,false);app.element('continue').onclick();assert.equal(app.eval('game.mode'),'playing');app.element('sound-toggle').onclick();assert.equal(app.eval('soundEnabled'),false);app.element('quality-toggle').onclick();assert.equal(app.eval('renderScale'),.75);app.element('restart').onclick();assert.equal(app.eval('game.items.length'),6);assert.equal(app.eval('game.inventory("food").length'),4);app.frame(200);assert.equal(app.eval('renderer.shadowMap.enabled'),false);assert.equal(app.eval('renderer.shadowMap.autoUpdate'),false)});
test('lighting stays bounded, instancing retains static geometry, and resolution budget is enforced',()=>{const app=boot();app.frame(100);const{scene}=app.getRender();let lights=0,points=0,instanced=0,instances=0;scene.traverse(o=>{if(o.isLight)lights++;if(o.isPointLight)points++;if(o.isInstancedMesh){instanced++;instances+=o.count}});assert.equal(lights,2);assert.equal(points,0);assert(instanced>=6);assert(instances>900);for(const[w,h,dpr,coarse]of [[390,844,3,true],[1366,1024,2,true],[3840,2160,2,false]]){const r=app.eval(`pixelRatio(${w},${h},${dpr},${coarse})`);assert(w*h*r*r<=(coarse?1100000:2000000)+.01);assert(r<=(coarse?1.35:1.6))}});
test('fluorescent fill lifts downward ceiling illumination without adding lights or emissive surfaces',()=>{
 const app=boot();app.frame(100);const {scene}=app.getRender();const hemi=scene.children.find(o=>o.isHemisphereLight),directional=scene.children.find(o=>o.isDirectionalLight);
 assert.equal(hemi.intensity,1.45);assert.equal(hemi.color.getHex(),0xf5efcf);assert.equal(hemi.groundColor.getHex(),0xa59b72);assert.equal(directional.intensity,.7);assert.equal(app.eval('renderer.toneMappingExposure'),1.08);
 const luminance=c=>.2126*c.r+.7152*c.g+.0722*c.b;
 assert(luminance(hemi.groundColor)*hemi.intensity>8*luminance(new THREE.Color(0x393422))*.92);
 assert(luminance(hemi.color)/luminance(hemi.groundColor)<3);
 assert.equal(app.eval('mat.ceiling.emissive.getHex()'),0);assert.equal(app.eval('mat.wall.emissive.getHex()'),0);assert.equal(scene.fog.near,14);assert.equal(scene.fog.far,44);
});
test('raised physical ceilings align maze, room, exit, fixtures, trim and door lintel',()=>{
 const app=boot();app.frame(100);const H=app.eval('ROOM_HEIGHT'),mat=app.eval('mat');assert.equal(H,3.6);
 const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
 function instances(group,material){const result=[];for(const mesh of group.children.filter(o=>o.material===material)){if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);result.push({y:pos.y,h:scale.y})}}else result.push({y:mesh.position.y,h:mesh.scale.y})}return result}
 for(const group of [app.eval('mazeGroup'),app.eval('roomGroup')]){
  for(const mesh of group.children.filter(o=>o.material===mat.ceiling)){assert(mesh.isInstancedMesh);mesh.getMatrixAt(0,matrix);matrix.decompose(pos,quat,scale);assert(Math.abs(pos.y-(H-.003))<1e-6)}
  const backing=instances(group,mat.ceilingGrid);assert(backing.length);for(const b of backing)assert(Math.abs(b.y-b.h/2-H)<1e-6);
  const fixtures=instances(group,mat.housing);assert(fixtures.length);for(const f of fixtures){assert(Math.abs(f.y-(H-.07))<1e-6);assert(f.y+f.h/2<H-.003)}
  for(const t of instances(group,mat.trim))assert(Math.abs(t.y-t.h/2)<1e-6||Math.abs(t.y+t.h/2-H)<1e-6);
 }
 for(const wall of app.eval('mazeGroup').children.filter(o=>o.material===mat.wall)){wall.geometry.computeBoundingBox();assert(Math.abs(wall.geometry.boundingBox.min.y+wall.position.y)<1e-6);assert(Math.abs(wall.geometry.boundingBox.max.y+wall.position.y-H)<1e-6)}
 const roomBoxes=instances(app.eval('roomGroup'),mat.room),lintel=roomBoxes.find(b=>Math.abs(b.h-(H-2.66))<1e-6);assert(lintel);assert(Math.abs(lintel.y-lintel.h/2-2.66)<1e-6);assert(Math.abs(lintel.y+lintel.h/2-H)<1e-6);
 const exitBoxes=instances(app.eval('exitGroup'),mat.exit);assert.equal(exitBoxes.filter(b=>Math.abs(b.h-H)<1e-6).length,2);assert(exitBoxes.some(b=>Math.abs(b.y-b.h/2-H)<1e-6));
 const leaf=app.eval('doorPivot').children.find(o=>o.material===mat.wood);assert.equal(leaf.scale.y,2.56);assert(leaf.position.y+leaf.scale.y/2<2.66);
});
test('height change preserves natural menu and gameplay eye height and field of view',()=>{
 const app=boot();app.frame(100);assert.equal(app.getRender().camera.position.y,1.63);assert.equal(app.getRender().camera.fov,76);
 app.element('start').onclick();app.frame(200);assert.equal(app.getRender().camera.position.y,1.63);assert.equal(app.getRender().camera.fov,76);assert(app.eval('ROOM_HEIGHT-EYE_HEIGHT')>1.9);
 app.element('pause').onclick();app.frame(300);assert.equal(app.getRender().camera.position.y,1.63);
});
test('separate touch pointers stop on cancellation and blur in mocked event dispatch',()=>{const app=boot();app.element('start').onclick();const event=(id,x,y)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});app.listeners['stick:pointerdown'][0](event(11,100,420));assert.notEqual(app.eval('input.forward'),0);app.listeners['look:pointerdown'][0](event(22,220,380));app.listeners['look:pointermove'][0](event(22,230,380));assert(app.eval('game.player.yaw')>0);app.listeners['stick:pointercancel'][0](event(11,100,420));assert.equal(app.eval('input.forward'),0);app.listeners['window:blur'][0]();assert.equal(app.eval('game.mode'),'paused');assert.equal(app.eval('touch.look'),null);assert.equal(app.eval('touch.move'),null)});

const pointer=(id,x=100,y=220)=>({pointerId:id,clientX:x,clientY:y,preventDefault(){}});
const key=code=>({code,repeat:false,preventDefault(){}});
test('portrait mobile gates the menu without reshaping desktop or hybrid laptop windows',()=>{
 const mobile=boot({width:390,height:844});assert.equal(mobile.eval('orientationBlocked'),true);assert.equal(mobile.element('game-shell').inert,true);assert.equal(mobile.element('rotate-overlay').hidden,false);assert.equal(mobile.element('rotate-lock').hidden,true);assert.equal(mobile.eval('game.mode'),'menu');
 mobile.rotate(600,600);assert.equal(mobile.eval('orientationBlocked'),true);mobile.rotate(844,390);assert.equal(mobile.element('rotate-overlay').hidden,true);assert.equal(mobile.element('game-shell').inert,false);assert.equal(mobile.eval('game.mode'),'menu');
 for(const coarse of [false,true]){const desktop=boot({width:390,height:844,mobile:false,coarse});assert.equal(desktop.eval('orientationBlocked'),false);desktop.element('start').onclick();assert.equal(desktop.eval('canPlay()'),true)}
});
test('portrait freezes all simulation, drops captured input, and blocks every gameplay input',()=>{
 const app=boot();app.element('start').onclick();app.eval('game.entered=true;game.doorTarget=1;game.food=70;game.hydration=70');
 app.dispatch('stick','pointerdown',pointer(11));app.dispatch('look','pointerdown',pointer(22));app.dispatch('sprint','pointerdown',pointer(33));app.dispatch('window','keydown',key('KeyW'));assert.equal(app.captured.size,3);
 app.frame(100);app.context.gains=[];app.eval('audio={currentTime:0};humGain={gain:{setTargetAtTime:v=>gains.push(v)}}');app.rotate(390,844);assert.deepEqual(app.context.gains,[0]);assert.equal(app.eval('game.mode'),'playing');assert.equal(app.eval('canPlay()'),false);assert.equal(app.captured.size,0);assert.equal(app.eval('keys.size+touch.sprint.size'),0);assert.equal(app.eval('touch.move'),null);assert.equal(app.eval('touch.look'),null);assert.equal(app.eval('input.forward+input.strafe'),0);
 const before=app.eval('JSON.stringify(game)');
 for(let t=150;t<=6150;t+=50)app.frame(t);
 app.dispatch('window','keydown',key('KeyF'));app.dispatch('window','keydown',key('Escape'));app.dispatch('stick','pointerdown',pointer(44));app.dispatch('look','pointerdown',pointer(55));app.dispatch('look','pointermove',pointer(55,160,160));app.dispatch('sprint','pointerdown',pointer(66));for(const action of ['interact','eat','drink','drop'])app.element(action).onclick({stopPropagation(){}});
 assert.equal(app.eval('JSON.stringify(game)'),before);assert.equal(app.captured.size,0);
 app.rotate(844,390);assert.equal(app.eval('canPlay()'),true);assert.equal(app.eval('keys.size'),0);app.frame(6200);assert.notEqual(app.eval('JSON.stringify(game)'),before);
});
test('repeated rotations retain manual pause, help, note, menu, won and lost states',()=>{
 const app=boot();app.element('start').onclick();app.frame(50);app.element('pause').onclick();
 for(const mode of ['paused','note','menu','won','lost']){app.eval(`game.mode='${mode}';showState()`);const before=app.eval('JSON.stringify(game)');for(let i=0;i<3;i++){app.rotate(390,844);app.frame(1000+i*100);app.dispatch('window','keydown',key('Escape'));app.rotate(844,390);assert.equal(app.eval('game.mode'),mode);assert.equal(app.eval('canPlay()'),false)}assert.equal(app.eval('JSON.stringify(game)'),before)}
 app.eval("game.mode='paused';showState()");app.element('pause-help').onclick();app.rotate(390,844);app.rotate(844,390);assert.equal(app.element('help').hidden,false);assert.equal(app.eval('game.mode'),'paused');
});
test('backgrounding while portrait requires manual resume and never catches up time',()=>{
 const app=boot();app.element('start').onclick();app.frame(100);app.rotate(390,844);app.context.document.hidden=true;app.dispatch('document','visibilitychange');assert.equal(app.eval('game.mode'),'paused');const before=app.eval('JSON.stringify(game)');app.frame(60000);app.rotate(844,390);app.context.document.hidden=false;app.dispatch('document','visibilitychange');app.frame(120000);assert.equal(app.eval('JSON.stringify(game)'),before);app.element('resume').onclick();app.frame(120050);assert(app.eval('game.elapsed')<1);
});
test('orientation lock is feature-detected, user-triggered, serialized and fullscreen-aware',async()=>{
 const calls=[];let release;const locked=new Promise(r=>release=r);const app=boot({width:390,height:844,lock:async value=>{calls.push(value);await locked},fullscreen:async doc=>{calls.push('fullscreen');doc.fullscreenElement=doc.documentElement}});
 assert.deepEqual(calls,[]);assert.equal(app.element('rotate-lock').hidden,false);const pending=app.element('rotate-lock').onclick();await Promise.resolve();const duplicate=await app.element('rotate-lock').onclick();assert.equal(duplicate,false);assert.equal(app.element('rotate-lock').disabled,true);assert.deepEqual(calls,['fullscreen','landscape']);release();assert.equal(await pending,true);assert.equal(app.element('rotate-lock').disabled,false);assert.equal(app.eval('orientationBlocked'),true);app.rotate(844,390);assert.equal(app.eval('orientationBlocked'),false);
 const pwaCalls=[];const pwa=boot({standalone:true,lock:async v=>pwaCalls.push(v),fullscreen:async()=>pwaCalls.push('fullscreen')});await pwa.element('rotate-lock').onclick();assert.deepEqual(pwaCalls,['landscape']);
});
test('unsupported or denied orientation and fullscreen locks fail safely',async()=>{
 for(const lock of [()=>{throw Error('unsupported')},()=>Promise.reject(Error('not allowed'))]){const app=boot({width:390,height:844,lock});assert.equal(await app.element('rotate-lock').onclick(),false);assert.equal(app.eval('orientationBlocked'),true);assert.equal(app.element('rotate-lock').disabled,false);assert.match(app.element('rotate-copy').textContent,/请关闭系统竖屏锁定/);app.rotate(844,390);assert.equal(app.eval('orientationBlocked'),false)}
 let locks=0;const denied=boot({width:390,height:844,lock:async()=>locks++,fullscreen:async()=>{throw Error('fullscreen denied')}});assert.equal(await denied.element('rotate-lock').onclick(),false);assert.equal(locks,0);assert.equal(denied.eval('game.mode'),'menu');
 const desktop=boot({mobile:false,coarse:false,lock:async()=>locks++});await desktop.element('rotate-lock').onclick();assert.equal(locks,0);
});

test('iPad desktop identification and pointer-lock release do not break orientation pause',()=>{
 const ipad=boot({width:390,height:844,coarse:false,mobile:true,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',platform:'MacIntel'});assert.equal(ipad.eval('mobile'),true);assert.equal(ipad.eval('orientationBlocked'),true);ipad.element('start').onclick();assert.equal(ipad.eval('game.mode'),'menu');ipad.rotate(844,390);ipad.element('start').onclick();ipad.context.document.pointerLockElement=ipad.element('world');ipad.context.document.exitPointerLock=()=>{ipad.context.document.pointerLockElement=null;ipad.dispatch('document','pointerlockchange')};ipad.rotate(390,844);assert.equal(ipad.eval('game.mode'),'playing');ipad.element('resume').onclick();assert.equal(ipad.eval('canPlay()'),false);ipad.rotate(844,390);assert.equal(ipad.eval('canPlay()'),true);
});
