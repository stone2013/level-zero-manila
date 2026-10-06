import test from 'node:test';import assert from 'node:assert/strict';import * as THREE from '../dist/vendor/three.module.min.js';import {boot} from './app-harness.mjs';
test('app boots and follows menu / pause / continue / settings / restart with a mocked DOM and GPU',()=>{const app=boot();assert.equal(app.element('error').hidden,true);
assert.equal(app.eval('game.mode'),'menu');app.frame(100);assert.equal(app.getRender().camera.position.x,42.5);assert.equal(app.eval('hasRun'),false);app.element('start').onclick();assert.equal(app.eval('game.mode'),'playing');assert.equal(app.eval('game.maze.seed'),42);app.element('pause').onclick();assert.equal(app.eval('game.mode'),'paused');app.element('main-menu').onclick();assert.equal(app.eval('game.mode'),'menu');assert.equal(app.element('continue').disabled,false);app.element('continue').onclick();assert.equal(app.eval('game.mode'),'playing');app.element('sound-toggle').onclick();assert.equal(app.eval('soundEnabled'),false);app.element('quality-toggle').onclick();assert.equal(app.eval('renderScale'),.75);app.element('restart').onclick();assert.equal(app.eval('game.items.length'),6);assert.equal(app.eval('game.inventory("food").length'),4);app.frame(200);assert.equal(app.eval('renderer.shadowMap.enabled'),false);assert.equal(app.eval('renderer.shadowMap.autoUpdate'),false)});
test('lighting stays bounded, instancing retains static geometry, and resolution budget is enforced',()=>{const app=boot();app.frame(100);const{scene}=app.getRender();let lights=0,points=0,instanced=0,instances=0;scene.traverse(o=>{if(o.isLight)lights++;if(o.isPointLight)points++;if(o.isInstancedMesh){instanced++;instances+=o.count}});assert.equal(lights,2);assert.equal(points,0);assert(instanced>=6);assert(instances>900);for(const[w,h,dpr,coarse]of [[390,844,3,true],[1366,1024,2,true],[3840,2160,2,false]]){const r=app.eval(`pixelRatio(${w},${h},${dpr},${coarse})`);assert(w*h*r*r<=(coarse?1100000:2000000)+.01);assert(r<=(coarse?1.35:1.6))}});
test('baked fluorescent surfaces avoid double ambient lighting and retain bounded prop fill',()=>{
 const app=boot();app.frame(100);const {scene}=app.getRender();const hemi=scene.children.find(o=>o.isHemisphereLight),directional=scene.children.find(o=>o.isDirectionalLight);
 assert.equal(hemi.intensity,1.65);assert.equal(hemi.color.getHex(),0xfff5e2);assert.equal(hemi.groundColor.getHex(),0xcdcdc2);assert.equal(directional.intensity,.18);assert.equal(app.eval('renderer.toneMappingExposure'),1);
 const luminance=c=>.2126*c.r+.7152*c.g+.0722*c.b;
 assert(luminance(hemi.groundColor)*hemi.intensity>8*luminance(new THREE.Color(0x393422))*.92);
 assert(luminance(hemi.color)/luminance(hemi.groundColor)<3);
 assert.equal(app.eval('mat.ceiling.isMeshBasicMaterial'),true);assert.equal(app.eval('mat.wall.isMeshBasicMaterial'),true);assert.equal(app.eval('mat.floor.isMeshBasicMaterial'),true);assert.equal(scene.fog.near,16);assert.equal(scene.fog.far,80);
});
test('raised physical ceilings align maze, room, exit, fixtures, trim and door lintel',()=>{
 const app=boot();app.frame(100);const H=app.eval('ROOM_HEIGHT'),mat=app.eval('mat');assert.equal(H,3.6);
 const matrix=new THREE.Matrix4(),pos=new THREE.Vector3(),quat=new THREE.Quaternion(),scale=new THREE.Vector3();
 function instances(group,material){const result=[];for(const mesh of group.children.filter(o=>o.material===material)){if(mesh.isInstancedMesh){for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);matrix.decompose(pos,quat,scale);result.push({y:pos.y,h:scale.y})}}else result.push({y:mesh.position.y,h:mesh.scale.y})}return result}
 for(const group of [app.eval('mazeGroup'),app.eval('roomGroup')]){
  for(const mesh of group.children.filter(o=>o.material===mat.ceiling)){assert(mesh.isInstancedMesh);mesh.getMatrixAt(0,matrix);matrix.decompose(pos,quat,scale);assert(Math.abs(pos.y-(H-.02))<1e-6)}
  const backing=instances(group,mat.ceilingGrid);assert(backing.length);for(const b of backing)assert(Math.abs(b.y-b.h/2-H)<1e-6);
  const fixtures=instances(group,mat.housing);assert(fixtures.length);for(const f of fixtures){assert(Math.abs(f.y-(H-.07))<1e-6);assert(f.y+f.h/2<H-.02)}
  for(const t of instances(group,mat.trim))assert(Math.abs(t.y-t.h/2)<1e-6||Math.abs(t.y+t.h/2-H)<1e-6);
 }
 for(const wall of app.eval('mazeGroup').children.filter(o=>o.material===mat.wall)){wall.geometry.computeBoundingBox();assert(Math.abs(wall.geometry.boundingBox.min.y+wall.position.y)<1e-6);assert(Math.abs(wall.geometry.boundingBox.max.y+wall.position.y-H)<1e-6)}
 const lintel=app.eval('roomGroup').children.find(o=>o.userData.doorFacade&&Math.abs(o.geometry.parameters.height-(H-2.66))<1e-6);assert(lintel);assert(Math.abs(lintel.position.y-lintel.geometry.parameters.height/2-2.66)<1e-6);
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
 app.dispatch('window','keydown',key('KeyF'));app.dispatch('window','keydown',key('Escape'));app.dispatch('stick','pointerdown',pointer(44));app.dispatch('look','pointerdown',pointer(55));app.dispatch('look','pointermove',pointer(55,160,160));app.dispatch('sprint','pointerdown',pointer(66));for(const action of ['interact','consume-item','drop-item','arrange-items'])app.element(action).onclick({stopPropagation(){}});
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

// Mocked application checks below validate data/geometry, not rendered GPU images.
test('local light falloff follows actual fixture positions with a bounded static geometry cost',()=>{
 const app=boot();app.frame(100);const {scene}=app.getRender();
 const group=app.eval('mazeGroup'),floor=app.eval('mat.floor');
 assert.equal(group.userData.lamps.length,121);
 assert.equal(group.userData.lamps[0].x,2.5);assert.equal(group.userData.lamps[0].z,2.5);
 assert(group.userData.lamps.every(l=>l.intensity>=.92&&l.intensity<=1.08));
 assert.equal(app.eval('roomGroup.userData.lamps[0].x'),app.eval('game.maze.doorX+3'));
 const slab=group.children.find(o=>o.material===floor),colour=slab.geometry.attributes.color;
 assert(colour&&colour.count>100);const values=Array.from(colour.array);assert(Math.min(...values)>=.27-.00001);assert(Math.max(...values)<=.86001);assert(Math.max(...values)-Math.min(...values)>.15);
 const panels=group.children.find(o=>o.material===app.eval('mat.ceiling'));assert(panels.instanceColor);assert.equal(panels.instanceColor.count,panels.count);
 let uniqueTriangles=0;scene.traverse(o=>{if(o.geometry)uniqueTriangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3});assert(uniqueTriangles<30000);
 const hemi=scene.children.find(o=>o.isHemisphereLight);assert(hemi.groundColor.b/hemi.groundColor.r>.85,'ceiling fill must not reintroduce a strong yellow filter');
});
test('context actions show the nearby target and empty supplies cannot be pressed',()=>{
 const app=boot();app.element('start').onclick();assert.equal(app.element('interact').disabled,true);app.element('backpack').onclick({stopPropagation(){}});assert.equal(app.element('consume-item').disabled,true);assert.equal(app.element('drop-item').disabled,false);app.element('inventory-close').onclick();
 app.eval('game.player.x=game.maze.doorX-.8;game.player.z=game.maze.doorZ;sync()');assert.equal(app.element('interact').disabled,false);assert.equal(app.element('interact-label').textContent,'开门');
 app.element('interact').onclick({stopPropagation(){}});assert.equal(app.element('interact-label').textContent,'关门');
 app.eval('for(const item of game.items)if(item.kind==="food")item.state="consumed";sync()');app.element('backpack').onclick({stopPropagation(){}});assert.equal(app.element('consume-item').disabled,true);assert.equal(app.element('drop-item').disabled,true);
});
test('WebGL failure remains explicit and prevents starting a broken game, while settings remain usable',()=>{
 const app=boot({graphicsFailure:true});assert.equal(app.element('error').hidden,false);assert.equal(app.element('render-warning').hidden,false);assert.equal(app.element('start').disabled,true);
 app.element('error-back').onclick();assert.equal(app.element('error').hidden,true);app.element('start').onclick();assert.equal(app.eval('game.mode'),'menu');
 app.element('help-open').onclick();assert.equal(app.element('help').hidden,false);app.element('help-close').onclick();assert.equal(app.element('help').hidden,true);assert.equal(app.element('render-warning').hidden,false);
});

test('Escape closes settings without resuming simulation behind the overlay',()=>{
 const app=boot();app.element('start').onclick();app.element('pause-help').onclick();assert.equal(app.eval('game.mode'),'paused');assert.equal(app.element('help').hidden,false);
 app.dispatch('window','keydown',{code:'Escape'});assert.equal(app.element('help').hidden,true);assert.equal(app.eval('game.mode'),'paused');
 app.element('resume').onclick();assert.equal(app.eval('game.mode'),'playing');
});


test('doorway flank/lintel tint is local and bounded while wood geometry/material and draw count stay intact',()=>{
 const app=boot(),group=app.eval('roomGroup'),material=app.eval('mat.room');
 const surfaces=group.children.filter(o=>o.material===material);assert.equal(surfaces.length,1);assert(surfaces[0].isInstancedMesh);
 const colours=surfaces[0].instanceColor;assert(colours);const values=Array.from(colours.array);assert(Math.min(...values)>=.93-1e-6);assert(Math.min(...values)>=.99);assert(Math.max(...values)>.99);
 assert.equal(app.eval('mat.wood.color.getHex()'),0x665033);assert.equal(app.eval('mat.panel.color.getHex()'),0x4b3a26);assert(app.eval('doorPivot.children.every(m=>!m.userData.lightTint)'));
 for(const g of [app.eval('mazeGroup'),group,app.eval('exitGroup')]){const batches=g.children.filter(o=>o.material===app.eval('mat.light'));assert.equal(batches.length,1);assert(batches[0].isInstancedMesh);assert.equal(batches[0].instanceColor.count,batches[0].count);assert.equal(g.userData.bake.stats.cacheEntries,0)}
 const samples=app.eval('mazeGroup.userData.bake.stats.samples');app.frame(100);app.frame(200);assert.equal(app.eval('mazeGroup.userData.bake.stats.samples'),samples);
});


test('yellow ceiling is panel albedo only, retaining neutral global fill and panel bake variation',()=>{
 const app=boot();app.frame(100);const ceiling=app.eval('mat.ceiling');
 assert.equal(ceiling.color.getHex(),0xd6be7b);assert(ceiling.isMeshBasicMaterial);assert.equal(ceiling.map,app.eval('ceilTex'));
 assert.equal(app.eval('mat.wall.color.getHex()'),0xffffff);assert.equal(app.eval('mat.floor.color.getHex()'),0xffffff);
 assert.equal(app.eval('LIGHTING.ground'),0xcdcdc2);assert.equal(app.eval('LIGHTING.sky'),0xfff5e2);assert.equal(app.eval('LIGHTING.exposure'),1);
 for(const group of [app.eval('mazeGroup'),app.eval('roomGroup')]){
  const panels=group.children.find(o=>o.material===ceiling);assert(panels?.isInstancedMesh);
  const values=Array.from(panels.instanceColor.array);assert(Math.max(...values)-Math.min(...values)>.005);
  assert.equal(panels.geometry.attributes.normal.getY(0),-1);
 }
});

test('11x11 map is rendered at full extent, central spawn, and static surfaces are chunked for mobile',()=>{
 const app=boot();app.frame(100);assert.equal(app.eval('game.maze.cells.length'),121);assert.equal(app.eval('game.player.x'),27.5);assert.equal(app.eval('game.player.z'),27.5);
 const group=app.eval('mazeGroup'),m=app.eval('mat');const floor=group.children.filter(o=>o.material===m.floor);assert(floor.length>1&&floor.every(o=>o.userData.bakedChunk));
 let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,triangles=0,draws=0;
 for(const mesh of floor){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){minX=Math.min(minX,p.getX(i));maxX=Math.max(maxX,p.getX(i));minZ=Math.min(minZ,p.getZ(i));maxZ=Math.max(maxZ,p.getZ(i))}}
 assert.deepEqual([minX,maxX,minZ,maxZ],[0,55,0,55]);const panels=group.children.find(o=>o.material===m.ceiling);assert.equal(panels.count,44*44);
 app.getRender().scene.traverse(o=>{if(o.isMesh){draws+=Array.isArray(o.material)?o.geometry.groups.length:1;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3}});assert(draws<110,`scene mesh/draw upper bound ${draws}`);assert(triangles<30000,`unique triangles ${triangles}`);
 assert.equal(app.eval('mazeGroup.userData.foldBake.stats.cacheEntries'),0);
});

test('outside Manila facade shares wallpaper and bake, lintel fills opening, room persists after change',()=>{
 const app=boot(),g=app.eval('roomGroup'),mat=app.eval('mat'),m=app.eval('game.maze');
 const facade=g.children.filter(o=>o.userData.doorFacade);assert.equal(facade.length,3);assert(facade.every(o=>o.material[1].map===app.eval('wallTex')&&o.material[0]===mat.room));
 assert.equal(app.eval('roomGroup.userData.facadeBake'),app.eval('mazeGroup.userData.bake'));
 const lintel=facade.find(o=>o.geometry.parameters.height<2);assert.equal(lintel.geometry.parameters.depth,1.8);assert.equal(lintel.geometry.parameters.width,.16);assert.equal(lintel.position.z,m.doorZ);
 const flanks=facade.filter(o=>o!==lintel).sort((a,b)=>a.position.z-b.position.z);assert(Math.abs(flanks[0].position.z+flanks[0].geometry.parameters.depth/2-(m.doorZ-.9))<1e-8);assert(Math.abs(flanks[1].position.z-flanks[1].geometry.parameters.depth/2-(m.doorZ+.9))<1e-8);
 app.eval('game.changed=true;sync()');assert.equal(g.visible,true);assert.equal(app.eval('mazeGroup.visible'),false);assert.equal(app.eval('exitGroup.visible'),true);assert.equal(app.eval('doorPivot.parent'),g);
});

test('all seam vestibules use identical lamp appearance and matching local surface samples',()=>{
 const app=boot(),g=app.eval('mazeGroup'),folds=app.eval('game.maze.folds'),mat=app.eval('mat');
 const lamps=folds.map(f=>g.userData.lamps.find(l=>l.x===f.px&&l.z===(f.z+.5)*5));for(const l of lamps){assert.equal(l.intensity,lamps[0].intensity);assert.deepEqual(l.color,lamps[0].color)}
 function surface(f,material){const data=[];for(const mesh of g.children.filter(o=>o.material===material)){const {position:p,normal:n,uv,color:c}=mesh.geometry.attributes;for(let i=0;i<p.count;i++){const x=p.getX(i)-f.x*5,z=p.getZ(i)-f.z*5;if(x>.09&&x<4.91&&z>.09&&z<2.2)data.push([x,p.getY(i),z,n.getX(i),n.getY(i),n.getZ(i),uv.getX(i),uv.getY(i),c.getX(i),c.getY(i),c.getZ(i)].map(v=>Math.round(v*1e5)/1e5).join(','))}}return data.sort()}
 const baseline=surface(folds[0],mat.floor);assert(baseline.length);for(const f of folds.slice(1))assert.deepEqual(surface(f,mat.floor),baseline);
 function interiorWalls(f){const data=[];for(const mesh of g.children.filter(o=>o.material===mat.wall)){const {position:p,normal:n,uv,color:c}=mesh.geometry.attributes;for(let i=0;i<p.count;i++){const x=p.getX(i)-f.x*5,z=p.getZ(i)-f.z*5;
  const inside=(Math.abs(x-.08)<1e-5&&n.getX(i)===1)||(Math.abs(x-4.92)<1e-5&&n.getX(i)===-1)||(Math.abs(z-.08)<1e-5&&n.getZ(i)===1)||(Math.abs(z-2.42)<1e-5&&n.getZ(i)===-1&&x>=1.19999&&x<=3.80001);
  if(inside&&x>.0001&&x<4.9999&&z>.0001&&z<=2.42001)data.push([x,p.getY(i),z,n.getX(i),n.getY(i),n.getZ(i),uv.getX(i),uv.getY(i),c.getX(i),c.getY(i),c.getZ(i)].map(v=>Math.round(v*1e5)/1e5).join(','))}}return data.sort()}
 const walls=interiorWalls(folds[0]);assert(walls.length);for(const f of folds.slice(1))assert.deepEqual(interiorWalls(f),walls);

});
