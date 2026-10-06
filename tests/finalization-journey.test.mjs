import test from 'node:test';
import assert from 'node:assert/strict';
import {bootControls} from './app-harness.mjs';

// Production app handlers + frame loop, with fake DOM/WebGL and empty render
// tasks. These are input integration checks, never a real browser/device claim.
// Movement and camera changes use dispatched controls. No coordinate, elapsed,
// escape-phase or door-state writes are used in either complete journey.
const click={stopPropagation(){}};
const key=code=>({code,repeat:false,preventDefault(){}});
function journey(){
 const a=bootControls();a.element('start').onclick();let clock=0;
 const read=s=>a.eval(s),step=(dt=.05)=>{a.frame(clock+=dt*1000);if(read('worldLoading'))a.settle()};
 const press=code=>a.dispatch('window','keydown',key(code));
 const release=code=>a.dispatch('window','keyup',key(code));
 const look=yaw=>{
  const delta=yaw-read('game.player.yaw');
  a.dispatch('look','pointerdown',{pointerId:80,clientX:0,clientY:0,preventDefault(){}});
  a.dispatch('look','pointermove',{pointerId:80,clientX:delta/.005,clientY:0});
  a.dispatch('look','pointerup',{pointerId:80});
 };
 function walk(to,{stopAtSeam=false,win=false}={}){
  let guard=0;
  while(read('game.mode')==='playing'){
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
  interact();until('game.door===1',30);walk({x:door.x-8.5,z:door.z},{win:true});
  assert.equal(a.element('ending').hidden,false);
  assert.match(a.element('end-eyebrow').textContent,/DEMO COMPLETE/);
  assert.match(a.element('end-copy').innerHTML,/本次演示的终点/);
  assert.equal(read('keys.size'),0);assert.equal(read('touch.sprint.size'),0);
  const final=read('JSON.stringify(game.snapshot())');a.dispatch('window','blur');step();
  assert.equal(read('JSON.stringify(game.snapshot())'),final);
 }
 return {a,read,step,walk,press,release,look,until,finishManila};
}

test('complete ordinary journey dispatches production inputs through Manila and explicit demo completion',()=>{
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
 assert.equal(read('game.loops'),0);j.finishManila();
 a.element('again').onclick();assert.equal(read('game.mode'),'playing');
 assert.equal(read('game.elapsed'),0);assert.equal(read('game.phone("phone-1").battery'),100);
 assert.equal(read('game.inventory("food").length'),4);assert.equal(read('game.items.length'),7);
 assert.equal(read('game.escape.phase'),'idle');assert.equal(read('monsterVisual'),null);
});

test('full 480-second production clock leads through marked chase, hidden seam and original Manila ending',t=>{
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
 assert.equal(read('game.escape.phase'),'seam');
 const duration=read('game.elapsed')-start;assert(duration>=45&&duration<=60);
 j.until('game.escape.phase==="door"',100);j.finishManila();
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
