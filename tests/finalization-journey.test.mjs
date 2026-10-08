import test from 'node:test';
import assert from 'node:assert/strict';
import {bootControls} from './app-harness.mjs';

// Production app handlers + frame loop, with fake DOM/WebGL and empty render
// tasks. These are input integration checks, never a real browser/device claim.
// Movement and camera changes use dispatched controls. No coordinate, elapsed,
// escape-phase or door-state writes are used in either complete journey.
const click={stopPropagation(){}};
const key=code=>({code,repeat:false,preventDefault(){}});
export function journey(options={}){
 const a=bootControls(options);a.element('start').onclick();let clock=0;
 const read=s=>a.eval(s),step=(dt=.05)=>{a.frame(clock+=dt*1000);if(read('worldLoading'))a.settle()};
 const press=code=>a.dispatch('window','keydown',key(code));
 const release=code=>a.dispatch('window','keyup',key(code));
 const look=yaw=>{
  const delta=yaw-read('game.player.yaw');
  a.dispatch('look','pointerdown',{pointerId:80,clientX:0,clientY:0,preventDefault(){}});
  a.dispatch('look','pointermove',{pointerId:80,clientX:delta/.005,clientY:0});
  a.dispatch('look','pointerup',{pointerId:80});
 };
 function walk(to,{stopAtSeam=false,win=false,zoneChange=false}={}){
  let guard=0;
  while(read('game.mode')==='playing'){
   if(zoneChange&&read('game.zone')!=='level0')break;
   const p=read('({...game.player})'),d=Math.hypot(to.x-p.x,to.z-p.z);
   if(d<1e-6||(stopAtSeam&&read('game.escape.phase')==='seam'))break;
   assert(guard++<5000,`blocked at ${JSON.stringify(p)} toward ${JSON.stringify(to)}`);
   assert(!['caught','caught-animation'].includes(read('game.escape.phase')));
   look(Math.atan2(to.x-p.x,-(to.z-p.z)));a.settle();
   const speed=read("['warning','chase','door'].includes(game.escape.phase)?4.875:2.05");
   press('KeyW');step(Math.min(.05,d/speed));release('KeyW');
   assert(!read('game.collides(game.player.x,game.player.z)'));
   assert(read('chunkStream.records.size')<=49);
  }
  assert.equal(read('game.mode'),win?'won':'playing');
 }
 function until(check,limit=1000){let ticks=0;while(!read(check)&&ticks++<limit)step();assert(read(check),check)}
 function interact(){a.element('interact').onclick(click)}
 function finishManila(){
  const door=read('({x:game.maze.doorX,z:game.maze.doorZ})');
  walk({x:door.x-1.25,z:door.z});interact();until('game.door===1',30);
  walk({x:door.x+1.7,z:door.z});assert(read('game.entered'));assert(!read('game.changed'));
  interact();until('game.changed',30);assert.equal(read('game.door'),0);
  assert.equal(read('game.items.filter(i=>i.kind==="water").length'),2);
  interact();until('game.door===1',30);walk({x:door.x-8.5,z:door.z},{zoneChange:true});
  assert.equal(read('game.zone'),'hub');assert.equal(a.element('ending').hidden,true);
 }
 function finishLevel1(branch="direct"){
  walk({x:0,z:4.5});assert.equal(read('game.hub.sealed'),true);
  walk({x:5.3,z:3.3});interact();step();
  assert.equal(read('game.zone'),'level1');assert.equal(a.element('ending').hidden,true);
  assert.equal(read('game.escape.monster?.active||false'),false);
  finishLevelOneRoute(branch);
  assert.equal(a.element('ending').hidden,false);
  assert.match(a.element('end-eyebrow').textContent,/DEMO COMPLETE/);
  assert.match(a.element('end-copy').innerHTML,/Level 1|管道|演示/);
  assert.equal(read('keys.size'),0);assert.equal(read('touch.sprint.size'),0);
  const final=read('JSON.stringify(game.snapshot())');a.dispatch('window','blur');step();
  assert.equal(read('JSON.stringify(game.snapshot())'),final);
 }
 function finishLevelOneRoute(branch='direct'){
  for(const [x,z] of [[0,2],[5,2],[5,-9.8],[-5,-9.8],[-5,-15.9],[5,-15.9],[5,-20],[0,-20],[0,-28]])walk({x,z});
  if(branch==='refuge')for(const [x,z] of [[-5,-28],[-5,-37],[0,-37]])walk({x,z});
  walk({x:0,z:-43},{win:true});
 }
 return {a,read,step,walk,press,release,look,until,finishManila,finishLevel1,finishLevelOneRoute,interact};
}

test('complete ordinary journey dispatches production inputs through Manila and hub, side-wall Level 1 and pipe demo completion',()=>{
 const j=journey(),{a,read,step}=j;
 // A dropped marker is picked up through real bag and interaction handlers.
 a.element('backpack').onclick(click);
 read('inventoryNodes.get("food-1").onclick({detail:0})');a.element('drop-item').onclick();
 const marker=read('({...game.items.find(i=>i.id==="food-1")})');assert.equal(marker.state,'world');
 a.element('inventory-close').onclick();a.element('interact').onclick(click);
 assert.equal(read('game.items.find(i=>i.id==="food-1").state'),'inventory');
 // Phone reading runs battery time without advancing exploration.
 a.element('backpack').onclick(click);read('inventoryNodes.get("phone-1").onclick({detail:0})');
 a.element('consume-item').onclick();const elapsed=read('game.elapsed');for(let i=0;i<40;i++)step();
 assert.equal(read('game.elapsed'),elapsed);assert(read('game.phone("phone-1").battery')<100);
 a.element('phone-close').onclick();a.element('inventory-close').onclick();
 const route=read('game.maze.route.map(i=>({x:(game.maze.cells[i].x+.5)*5,z:(game.maze.cells[i].z+.5)*5}))');
 for(const p of route.slice(1))j.walk(p);
 assert.equal(read('game.foundManila'),true);assert.equal(read('game.escape.phase'),'suppressed');
 assert.equal(read('game.loops'),0);j.finishManila();j.finishLevel1();
 a.element('again').onclick();assert.equal(read('game.mode'),'playing');
 assert.equal(read('game.elapsed'),0);assert.equal(read('game.phone("phone-1").battery'),100);
 assert.equal(read('game.inventory("food").length'),4);assert.equal(read('game.items.length'),7);
 assert.equal(read('game.escape.phase'),'idle');assert.equal(read('monsterVisual'),null);
});

test('full 480-second production clock leads through wall-marked chase, continuous Manila entrance, hub and Level 1 pipe ending',t=>{
 const j=journey(),{a,read,step}=j;
 // All 480 seconds pass through app.frame(), with no developer clock jump.
 for(let i=0;i<9599;i++)step();assert.equal(read('game.escape.phase'),'idle');
 assert(Math.abs(read('game.elapsed')-479.95)<1e-5);
 // Pauses preserve all world state; stale held movement is released.
 j.press('KeyW');a.element('pause').onclick();const paused=read('JSON.stringify(game.snapshot())');
 for(let i=0;i<20;i++)step();assert.equal(read('JSON.stringify(game.snapshot())'),paused);
 assert.equal(read('keys.size'),0);a.element('resume').onclick();step();
 assert.equal(read('game.escape.phase'),'flicker');
 j.until('game.escape.phase==="warning"',200);
 const start=read('game.elapsed'),route=read('game.escape.layout.route.slice(game.escape.layout.startIndex+1).map(p=>({...p}))');
 for(const p of route)j.walk(p,{stopAtSeam:true});
 assert.equal(read('game.escape.phase'),'door');
 assert.equal(read('game.escape.connection'),1,'no final teleport connection');
 const duration=read('game.elapsed')-start;assert(duration>=45&&duration<=60);
 j.until('game.escape.phase==="door"',100);j.finishManila();j.finishLevel1("refuge");
 assert.equal(read('game.escape.phase'),'finished');assert.equal(read('game.escape.monster.active'),false);
 assert.equal(read('game.items.length'),7);
 t.diagnostic(`Production handler/frame integration: trigger 480.00 active seconds; escape route ${duration.toFixed(2)} active seconds. Fake DOM/GPU only.`);
});

test('depletion boundary shows one stable loss screen and full restart restores the complete run',()=>{
 const j=journey(),{a,read,step}=j;
 // A near-empty hydration fixture isolates loss UI without claiming a second
 // complete 45-minute playthrough. The actual frame and input handlers end it.
 read('game.hydration=.0001');
 a.element('backpack').onclick(click);const elapsed=read('game.elapsed');
 for(let i=0;i<20;i++)step();assert.equal(read('game.mode'),'playing');assert.equal(read('game.elapsed'),elapsed);
 a.element('inventory-close').onclick();j.press('KeyW');j.press('ShiftLeft');step();
 assert.equal(read('game.mode'),'lost');assert.equal(a.element('ending').hidden,false);
 assert.equal(a.element('end-eyebrow').textContent,'SIGNAL LOST');assert.equal(a.element('caught-panel').hidden,true);
 assert.equal(read('keys.size'),0);assert.equal(read('gameAudio.voices.size'),0);
 const final=read('JSON.stringify(game.snapshot())');
 for(let i=0;i<10;i++){step();j.press('KeyE');j.release('KeyE')}
 assert.equal(read('JSON.stringify(game.snapshot())'),final);
 a.element('again').onclick();
 assert.equal(read('game.mode'),'playing');assert.equal(a.element('ending').hidden,true);
 assert.equal(read('game.elapsed'),0);assert.equal(read('game.food'),100);assert.equal(read('game.hydration'),100);
 assert.equal(read('game.phone("phone-1").battery'),100);assert.equal(read('game.chargingPhoneId'),null);
 assert.equal(read('game.inventory("food").length'),4);assert.equal(read('game.items.length'),7);
 assert.equal(read('game.door'),0);assert.equal(read('game.doorTarget'),0);assert.equal(read('game.changed'),false);
 assert.equal(read('game.escape.phase'),'idle');assert.equal(read('game.escape.layout'),null);
});

test('held keyboard and pointer wall traversal cancels on release, bag, pause and focus loss; direct Level 1 restarts cleanly',()=>{
 const j=journey(),{a,read,step}=j,w=read('({...game.abnormalWall})');
 j.walk({x:w.x+w.normalX*.75,z:w.z+w.normalZ*.75});assert(read('game.nearAbnormalWall()'));
 const hold=(n=20)=>{j.press('KeyE');for(let i=0;i<n;i++)step()};
 hold();assert(read('game.abnormalWall.hold')>.9);j.release('KeyE');step();assert.equal(read('game.abnormalWall.hold'),0);
 hold();a.element('backpack').onclick(click);assert.equal(read('game.abnormalWall.hold'),0);for(let i=0;i<50;i++)step();assert.equal(read('game.zone'),'level0');a.element('inventory-close').onclick();
 hold();a.element('pause').onclick();assert.equal(read('game.abnormalWall.hold'),0);a.element('resume').onclick();
 hold();a.dispatch('window','blur');assert.equal(read('game.abnormalWall.hold'),0);a.element('resume').onclick();
 a.dispatch('interact','pointerdown',{pointerId:91,preventDefault(){}});for(let i=0;i<20;i++)step();
 assert(read('game.abnormalWall.hold')>.9);a.dispatch('interact','pointercancel',{pointerId:91});step();assert.equal(read('game.abnormalWall.hold'),0);
 hold(41);j.release('KeyE');assert.equal(read('game.zone'),'level1');assert.equal(read('game.hub.sealed'),false);assert.equal(a.zoneLoads.length,1);assert.equal(a.zoneLoads[0].zone,'level1');
 a.element('pause').onclick();a.element('restart').onclick();
 assert.equal(read('game.zone'),'level0');assert.equal(read('game.level1.elapsed'),0);assert(read('game.level1.crates.every(c=>!c.opened)'));assert.equal(read('keys.size'),0);assert.equal(read('interactPointer'),null);assert(a.zoneLoads[0].group.userData.disposed);
});

test('Level 1 lighting freezes during pause, bag, hidden document and orientation block',()=>{
 const j=journey(),{a,read,step}=j;read("game.transitionZone('level1')");step();
 j.until('game.level1.phase==="warning"',600);assert.equal(read('game.escape.monster?.active||false'),false);
 j.until('game.level1.phase==="dark"',140);
 const frozen=action=>{action();const t=read('game.level1.elapsed');for(let i=0;i<180;i++)step();assert.equal(read('game.level1.elapsed'),t);assert.equal(read('game.level1.phase'),'dark')};
 frozen(()=>a.element('pause').onclick());a.element('resume').onclick();
 frozen(()=>a.element('backpack').onclick(click));a.element('inventory-close').onclick();
 frozen(()=>{read('document.hidden=true');a.dispatch('document','visibilitychange')});read('document.hidden=false');a.dispatch('document','visibilitychange');if(read('game.mode')==='paused')a.element('resume').onclick();
 frozen(()=>a.rotate(390,844));a.rotate(844,390);if(read('game.mode')==='paused')a.element('resume').onclick();
 j.until('game.level1.phase==="lit"',180);assert.equal(read('game.escape.monster?.active||false'),false);
});

test('Level 1 crate supplies are finite and a full bag can retry pickup after making space',()=>{
 const j=journey(),{a,read,step}=j;read("game.transitionZone('level1')");step();
 j.walk({x:-4,z:2});j.interact();assert.equal(read('game.level1.crates[0].opened'),true);assert.equal(read('game.inventory("water").length'),1);
 for(let i=0;i<5;i++)j.interact();assert.equal(read('game.items.filter(i=>i.id==="l1-crate-1-water").length'),1);
 // Full-bag and hunger fixture, then only production bag and interaction controls.
 read("game.food=90");
 read(`for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(!game.inventory().some(i=>{const s=game.itemSize(i);return x>=i.gridX&&x<i.gridX+s.w&&y>=i.gridY&&y<i.gridY+s.h}))game.items.push({id:'fill-'+x+'-'+y,kind:'food',state:'inventory',gridX:x,gridY:y,zone:'level1'})`);
 j.walk({x:0,z:2});j.walk({x:5,z:2});j.walk({x:5,z:-6});j.interact();
 assert.equal(read('game.items.find(i=>i.id==="l1-crate-2-food").state'),'world');
 for(let i=0;i<3;i++)j.interact();assert.equal(read('game.items.filter(i=>i.id==="l1-crate-2-food").length'),1);
 a.element('backpack').onclick(click);read('inventoryNodes.get("food-1").onclick({detail:0})');a.element('consume-item').onclick();a.element('inventory-close').onclick();j.interact();
 assert.equal(read('game.items.find(i=>i.id==="l1-crate-2-food").state'),'inventory');assert.equal(read('game.items.filter(i=>i.id==="l1-crate-2-food").length'),1);
});

test('zone loader pending/error/retry freezes time; stale completion after restart is disposed',()=>{
 const j=journey({zoneLoadMode:'pending'}),{a,read,step}=j;
 read("game.transitionZone('hub')");step();assert.equal(a.zoneLoads.length,1);assert(read('worldLoading'));
 const elapsed=read('game.elapsed'),battery=read('game.phone("phone-1").battery'),position=read('JSON.stringify(game.player)');j.press('KeyW');j.press('KeyE');for(let i=0;i<30;i++)step();assert.equal(read('game.elapsed'),elapsed);assert.equal(read('game.phone("phone-1").battery'),battery);assert.equal(read('JSON.stringify(game.player)'),position);
 a.zoneLoads[0].reject(new Error('deliberate fixture failure'));step();assert(read('zoneLoadError'));assert(read('worldLoading'));
 assert.equal(a.element('world-loading').tabIndex,0);a.dispatch('world-loading','keydown',key('Enter'));assert.equal(a.zoneLoads.length,2);a.zoneLoads[1].resolve();assert.equal(read('keys.size'),0);step();assert(!read('worldLoading'));assert.equal(read('game.zone'),'hub');
 read("game.transitionZone('level1')");step();assert.equal(a.zoneLoads.length,3);a.element('pause').onclick();a.element('restart').onclick();a.zoneLoads[2].resolve();
 assert.equal(read('game.zone'),'level0');assert.equal(read('zoneVisual'),null);assert.equal(a.zoneLoads[2].group.userData.disposed,true);
});

test('dropped items retain zone identity and cannot be interacted with from another zone',()=>{
 const j=journey(),{a,read,step}=j;
 a.element('backpack').onclick(click);read('inventoryNodes.get("food-1").onclick({detail:0})');a.element('drop-item').onclick();a.element('inventory-close').onclick();
 const item=read('({...game.items.find(i=>i.id==="food-1")})');assert.equal(item.zone,'level0');
 read("game.transitionZone('hub')");step();assert(!read('game.worldItemVisible(game.items.find(i=>i.id==="food-1"))'));j.interact();assert.equal(read('game.items.find(i=>i.id==="food-1").state'),'world');
 j.walk({x:0,z:4.5});j.walk({x:5.3,z:3.3});j.interact();step();
 a.element('backpack').onclick(click);read('inventoryNodes.get("food-2").onclick({detail:0})');a.element('drop-item').onclick();a.element('inventory-close').onclick();assert.equal(read('game.items.find(i=>i.id==="food-2").zone'),'level1');j.interact();assert.equal(read('game.items.find(i=>i.id==="food-2").state'),'inventory');
 assert.equal(read('game.items.find(i=>i.id==="food-1").state'),'world');
});


test('all seven original hub doors stay inactive; only the distinct side-wall door enters Level 1',()=>{
 const j=journey(),{a,read,step}=j;read("game.transitionZone('hub')");step();
 j.walk({x:0,z:4.5});assert(read('game.hub.sealed'));
 j.walk({x:-5.25,z:1});
 for(let n=0;n<7;n++){
  const x=-5.25+n*1.75;j.walk({x,z:.7});step();
  assert.equal(read('game.nearHubDoor().id'),'hub-door-'+(n+1));
  if(n===0)assert.match(a.element('prompt').textContent,/130/);
  j.interact();assert.equal(read('game.zone'),'hub');assert.equal(read('game.mode'),'playing');
 }
 j.walk({x:5.25,z:3.3});step();assert.equal(read('game.nearHubDoor().id'),'hub-level1');
 const food=read('game.food'),hydration=read('game.hydration'),items=read('JSON.stringify(game.items)');
 j.interact();assert.equal(read('game.zone'),'level1');assert.equal(read('game.food'),food);assert.equal(read('game.hydration'),hydration);assert.equal(read('JSON.stringify(game.items)'),items);
});

test('direct wall entry completes refuge route through production movement and shows the Level 2 boundary',()=>{
 const j=journey(),{a,read,step}=j,w=read('({...game.abnormalWall})');
 j.walk({x:w.x+w.normalX*.75,z:w.z+w.normalZ*.75});j.press('KeyE');for(let i=0;i<41;i++)step();j.release('KeyE');
 assert.equal(read('game.zone'),'level1');assert.equal(read('game.hub.sealed'),false);
 j.finishLevelOneRoute('refuge');assert.equal(a.element('ending').hidden,false);assert.match(a.element('end-copy').innerHTML,/Level 2/);assert.equal(read('keys.size'),0);assert.equal(a.element('level1-retry').hidden,true);
});

test('natural Level 1 capture freezes during bag, phone and pause, reports entity cause and retries without duplicating supplies',()=>{
 const j=journey(),{a,read,step}=j,w=read('({...game.abnormalWall})');
 j.walk({x:w.x+w.normalX*.75,z:w.z+w.normalZ*.75});j.press('KeyE');for(let i=0;i<41;i++)step();j.release('KeyE');
 j.walk({x:-4,z:2});j.interact();assert(read('game.level1.crates[0].opened'));
 j.walk({x:0,z:2});j.walk({x:5,z:2});j.walk({x:5,z:0});j.until('game.level1.phase==="warning"');
 const freeze=()=>{const danger=read('JSON.stringify(game.level1.danger)'),time=read('game.level1.elapsed');for(let i=0;i<40;i++)step();assert.equal(read('game.level1.elapsed'),time);assert.equal(read('JSON.stringify(game.level1.danger)'),danger)};
 a.element('pause').onclick();freeze();a.element('resume').onclick();
 a.element('backpack').onclick(click);freeze();read('inventoryNodes.get("phone-1").onclick({detail:0})');a.element('consume-item').onclick();const battery=read('game.phone("phone-1").battery');freeze();assert(read('game.phone("phone-1").battery')<battery);a.element('phone-close').onclick();a.element('inventory-close').onclick();
 j.until('game.mode==="lost"',320);assert.equal(read('game.level1.failure'),'entity');assert.equal(a.element('ending').hidden,false);assert.match(a.element('end-title').textContent,/轮廓/);assert.match(a.element('end-copy').innerHTML,/补给不会重新生成/);assert.equal(a.element('level1-retry').hidden,false);assert.equal(read('keys.size'),0);
 const supplies=read('JSON.stringify(game.items)'),crates=read('JSON.stringify(game.level1.crates)'),checkpoint=read('JSON.stringify(game.level1.danger.checkpoint)'),elapsed=read('game.level1.elapsed');for(let i=0;i<20;i++)step();assert.equal(read('game.level1.elapsed'),elapsed);
 a.element('level1-retry').onclick();assert.equal(read('game.mode'),'playing');assert.equal(a.element('ending').hidden,true);assert.equal(read('game.level1.failure'),null);assert.equal(read('game.level1.elapsed'),0);assert.equal(read('game.level1.retries'),1);assert.equal(read('JSON.stringify(game.items)'),supplies);assert.equal(read('JSON.stringify(game.level1.crates)'),crates);assert.equal(read('JSON.stringify(game.level1.danger.checkpoint)'),checkpoint);assert(!read('game.level1.danger.active'));
 j.finishLevelOneRoute('direct');assert.equal(a.element('ending').hidden,false);assert.match(a.element('end-eyebrow').textContent,/DEMO COMPLETE/);
});
