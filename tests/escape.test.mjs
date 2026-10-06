import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, CELL} from '../dist/game.js';
import {ESCAPE_TRIGGER_SECONDS, ESCAPE_SPEED, makeEscapeLayout, escapeDirection, escapeDarkness} from '../dist/escape.js';

const DT=.02, DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
const near=(a,b,message='')=>assert(Math.abs(a-b)<1e-7,`${message}: ${a} != ${b}`);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(c)=>({x:(c.x+.5)*CELL,z:(c.z+.5)*CELL});
function tick(g,seconds,input={}){for(let remaining=seconds;remaining>1e-9;remaining-=DT)g.update(Math.min(DT,remaining),input)}
function until(g,predicate,seconds=20){let ticks=0;while(!predicate()&&ticks++<seconds/DT)g.update(DT);assert(predicate(),`timed out at ${g.escape.phase}/${g.mode}`);return ticks*DT}
function begin(g=new Game(42)){
 if(g.mode==='menu')g.start();
 g.elapsed=ESCAPE_TRIGGER_SECONDS-DT;
 g.update(DT);assert.equal(g.escape.phase,'flicker');
 until(g,()=>g.escape.phase==='warning');
 return g;
}
// Every route leg below uses player yaw plus actual update() movement input.
// There is no position assignment, teleport or test-only collision bypass.
function walk(g,to,{stopAtSeam=false,onStep=()=>{}}={}){
 let count=0;
 while(distance(g.player,to)>1e-7&&!(stopAtSeam&&g.escape.phase==='seam')){
  assert.equal(g.mode,'playing');assert(!['caught-animation','caught'].includes(g.escape.phase));
  assert(count++<15000,`blocked at ${JSON.stringify(g.player)} toward ${JSON.stringify(to)}`);
  const dx=to.x-g.player.x,dz=to.z-g.player.z,d=Math.hypot(dx,dz);
  g.player.yaw=Math.atan2(dx,-dz);
  const forced=['warning','chase','door'].includes(g.escape.phase),speed=forced?ESCAPE_SPEED:2.05;
  const oldConnection=g.escape.connection,m=g.escape.monster&&{...g.escape.monster};
  g.update(DT,{forward:Math.min(1,d/(speed*DT))});
  assert(!g.collides(g.player.x,g.player.z),'player must not enter wall geometry');
  if(g.escape.monster?.active){
   assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}),'monster must not enter wall geometry');
   if(m&&oldConnection===g.escape.connection)assert(distance(m,g.escape.monster)<=4.18*DT+1e-8,'monster must move continuously at its bounded speed');
  }
  assert(g.escape.nav.length<=121,'BFS queue/path must remain bounded');onStep(g);
 }
 return count*DT;
}
function runRoute(g,onStep=()=>{}){
 let seconds=0;const l=g.escape.layout;
 for(let i=l.startIndex+1;i<l.route.length;i++)seconds+=walk(g,l.route[i],{stopAtSeam:true,onStep});
 assert.equal(g.escape.phase,'seam');return seconds;
}
function fingerprint(g){return g.items.map(i=>({...i}))}

// Trigger integration uses a complete 480-second active simulation, not a clock fixture.
test('event is absent before 480 active seconds, freezes in UI/states, and triggers once',()=>{
 const g=new Game(9);g.start();tick(g,479.98);assert.equal(g.escape.phase,'idle');assert.equal(g.escape.triggered,false);
 const before=g.elapsed;
 assert(g.openInventory());tick(g,30);near(g.elapsed,before);assert.equal(g.escape.phase,'idle');g.closeInventory();
 assert(g.openPhone('phone-1'));tick(g,30);near(g.elapsed,before);g.closePhone();
 for(const mode of ['menu','paused','note','won','lost','caught']){g.mode=mode;tick(g,30);near(g.elapsed,before);assert.equal(g.escape.phase,'idle')}
 g.mode='playing';g.update(DT);assert.equal(g.escape.phase,'flicker');assert(g.escape.triggered);
 const firstEvents=g.events.filter(x=>x.includes('灯声变了')).length;assert.equal(firstEvents,1);
 until(g,()=>g.escape.phase==='warning');tick(g,2);assert.equal(g.escape.attempt,1);assert.equal(g.events.filter(x=>x.includes('灯声变了')).length,1);
});

test('prior Manila discovery, entry or completed original ending permanently suppresses the event',()=>{
 for(const flag of ['foundManila','entered','changed']){
  const g=new Game(42);g.start();g[flag]=true;g.elapsed=479.98;g.update(DT);
  assert.equal(g.escape.phase,'suppressed');assert.equal(g.escape.triggered,false);assert.equal(g.escape.layout,null);
  g[flag]=false;tick(g,5);assert.equal(g.escape.phase,'suppressed');
 }
});

test('seeing the original Manila doorway suppresses the event before physical entry',()=>{
 const g=new Game(42);g.start();Object.assign(g.player,{x:g.maze.doorX-4,z:g.maze.doorZ});g.elapsed=479.98;g.update(DT);
 assert.equal(g.entered,false);assert.equal(g.inRoom(),false);assert.equal(g.foundManila,true);assert.equal(g.escape.phase,'suppressed');assert.equal(g.escape.triggered,false);
});

test('flicker, blackout and readiness gate freeze transition and preserve all item instances',()=>{
 const g=new Game(7);g.start();assert.equal(g.drop('food-1'),'food-1');assert.equal(g.drop('phone-1'),'phone-1');
 const items=g.items,refs=[...items],original=fingerprint(g),position={...g.player};let ready=false;g.escapeViewReady=()=>ready;
 g.elapsed=479.98;g.update(DT);assert.equal(g.escape.phase,'flicker');assert(escapeDarkness(g)>0&&escapeDarkness(g)<1);
 until(g,()=>g.escape.phase==='blackout');assert.equal(escapeDarkness(g),1);
 tick(g,.4,{forward:1});near(g.player.x,position.x);near(g.player.z,position.z);
 until(g,()=>g.escape.phase==='loading');const arrival={...g.player};assert.equal(g.escape.monster.clip,'walk');
 tick(g,2,{forward:1});assert.equal(g.escape.phase,'loading');assert.deepEqual(g.player,arrival);assert.equal(g.openInventory(),false);
 assert.strictEqual(g.items,items);g.items.forEach((i,j)=>assert.strictEqual(i,refs[j]));assert.deepEqual(fingerprint(g),original);
 ready=true;g.update(DT);assert.equal(g.escape.phase,'warning');assert.equal(escapeDarkness(g),0);
});

test('escape topology is bounded, reciprocal, marked, and protects existing ground items',()=>{
 const g=new Game(1);g.start();g.drop('food-1');const original=fingerprint(g),layout=makeEscapeLayout(g);
 assert.equal(layout.cells.length,121);assert.equal(layout.lookup.size,121);assert.equal(layout.distance,230);assert.equal(layout.branches.length,8);
 assert.deepEqual(layout.start,layout.route[layout.startIndex]);assert.deepEqual(layout.end,layout.route.at(-1));
 for(const c of layout.cells)for(let d=0;d<4;d++)if(c.open[d]){const[dx,dz]=DIRS[d],n=layout.lookup.get(`${c.x+dx},${c.z+dz}`);assert(n,'no exit into unbounded procedural cells');assert(n.open[(d+2)%4])}
 for(const c of layout.branches)assert.equal(layout.lookup.get(`${c.x},${c.z}`).open.filter(Boolean).length,1,'wrong branches have a return route');
 assert.deepEqual(fingerprint(g),original);for(const item of g.items.filter(i=>i.state==='world'))assert(!layout.lookup.has(`${Math.floor(item.x/CELL)},${Math.floor(item.z/CELL)}`));
});

test('3.2-second warning holds monster still and forced run requires directional input',()=>{
 const g=begin(),monster={...g.escape.monster},player={...g.player},food=g.food,water=g.hydration;
 tick(g,1,{sprint:true});assert.equal(g.escape.phase,'warning');assert.deepEqual(g.player,player);assert.deepEqual(g.escape.monster,monster);
 near(food-g.food,.014,'idle food remains ordinary');near(water-g.hydration,.035,'idle hydration remains ordinary');
 tick(g,2.18);assert.equal(g.escape.phase,'warning');assert.deepEqual(g.escape.monster,monster);
 tick(g,.04);assert.equal(g.escape.phase,'chase');g.update(DT);assert(distance(monster,g.escape.monster)>0);
});

test('forced speed and drains are 1.5 times normal sprint even at low hydration',()=>{
 for(const hydration of [100,10]){
  const g=begin();g.hydration=hydration;const p={...g.player},food=g.food,water=g.hydration;
  tick(g,.4,{forward:1});near(distance(p,g.player),ESCAPE_SPEED*.4);near(food-g.food,.026*1.5*.4);near(water-g.hydration,.07*1.5*.4);
  assert.equal(g.mode,'playing');
 }
 const g=begin(),p={...g.player};tick(g,.2,{forward:1,strafe:1});near(distance(p,g.player),ESCAPE_SPEED*.2,'diagonal input is normalized');
});

test('forced high-speed input cannot tunnel through a closed wall or chunk boundary',()=>{
 const g=begin(),p={...g.player};g.player.yaw=0;
 for(let i=0;i<30;i++)g.update(.05,{forward:1});
 assert(!g.collides(g.player.x,g.player.z));assert.equal(Math.floor(g.player.z/CELL),Math.floor(p.z/CELL));assert(distance(p,g.player)<2.3);
 assert(g.escape.layout.lookup.has(`${Math.floor(g.player.x/CELL)},${Math.floor(g.player.z/CELL)}`));
});

test('actual marked route takes 45–60 active seconds and uses continuous bounded monster pursuit',t=>{
 const g=begin(),items=fingerprint(g),refs=[...g.items],start=g.elapsed,visited=[0];
 const seconds=runRoute(g,()=>{const m=g.escape.monster,index=g.escape.layout.indices.get(`${Math.floor(m.x/CELL)},${Math.floor(m.z/CELL)}`);assert.notEqual(index,undefined,'nominal pursuer remains on the actual route');if(index!==visited.at(-1))visited.push(index)});
 // At 4.18 m/s after the 3.2 s warning, ~44.5 s of chase covers the
 // high-30s of 5 m cells; center commits add bounded turn/frame overhead.
 assert(visited.at(-1)>=35,`monster must traverse deep bends, not stall safely: ${visited.at(-1)}`);assert.deepEqual(visited,Array.from({length:visited.at(-1)+1},(_,i)=>i),'monster visits consecutive route cells across all traversed corners');
 assert(seconds>=45&&seconds<=60,`measured route duration ${seconds}`);near(g.elapsed-start,seconds);
 assert.equal(g.mode,'playing');assert(g.escape.progress>=g.escape.layout.startIndex);assert.equal(g.escape.attempt,1);
 assert.deepEqual(fingerprint(g),items);g.items.forEach((i,j)=>assert.strictEqual(i,refs[j]));
 t.diagnostic(`Measured actual update/input route: ${seconds.toFixed(2)} s, ${g.escape.layout.distance} m, seed 42; monster final route-cell index ${visited.at(-1)}, player index ${g.escape.layout.route.length-1}.`);
});

test('all eight wrong branches remain walkable back to a marked route, with truthful direction hints',()=>{
 for(const branch of makeEscapeLayout(new Game(42)).branches){
  const g=begin(),l=g.escape.layout,junction={x:(branch.x+.5)*CELL,z:(branch.z-.5)*CELL},index=l.route.findIndex(p=>distance(p,junction)<1e-7);
  assert(index>=l.startIndex,'each tested detour occurs after player spawn');
  for(let i=l.startIndex+1;i<=index;i++)walk(g,l.route[i]);
  walk(g,point(branch));const hint=escapeDirection(g);assert(hint.label.includes('返回'));near(distance(hint,junction),0);
  walk(g,junction);assert(escapeDirection(g).label.includes('沿灯下箭头'));
  for(let i=index+1;i<l.route.length;i++)walk(g,l.route[i],{stopAtSeam:true});assert.equal(g.escape.phase,'seam');
 }
});

test('inventory, phone and paused state freeze warning and chase including monster/resources',()=>{
 const g=begin();tick(g,3.24);assert.equal(g.escape.phase,'chase');
 for(const ui of ['inventory','phone','paused']){
  if(ui==='inventory')g.openInventory();else if(ui==='phone')g.openPhone('phone-1');else g.pause();
  const snapshot=JSON.stringify({e:g.escape,player:g.player,food:g.food,water:g.hydration,elapsed:g.elapsed});tick(g,8,{forward:1});
  assert.equal(JSON.stringify({e:g.escape,player:g.player,food:g.food,water:g.hydration,elapsed:g.elapsed}),snapshot);
  g.closeInventory();g.closePhone();g.resume();
 }
 const p={...g.escape.monster};g.update(DT);assert(distance(p,g.escape.monster)>0);
});

test('monster follows real wall-safe path to one 2.6-second caught animation then freezes',()=>{
 const g=begin();const player={...g.player};let frames=0;
 while(g.escape.phase!=='caught-animation'&&frames++<2000){g.update(DT);assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}));assert(g.escape.nav.length<=121)}
 assert.equal(g.escape.phase,'caught-animation');assert.equal(g.escape.monster.clip,'jumpscare');assert.equal(g.mode,'playing');
 const e=g.events.filter(x=>x==='它追上来了。').length;assert.equal(e,1);assert.deepEqual(g.player,player);
 tick(g,2.58,{forward:1});assert.equal(g.escape.phase,'caught-animation');assert.equal(g.mode,'playing');assert.deepEqual(g.player,player);
 tick(g,.04);assert.equal(g.escape.phase,'caught');assert.equal(g.mode,'caught');
 const snapshot=JSON.stringify({e:g.escape,state:g.snapshot()});tick(g,40,{forward:1});assert.equal(JSON.stringify({e:g.escape,state:g.snapshot()}),snapshot);assert.equal(g.events.filter(x=>x==='它追上来了。').length,1);
});

test('retry preserves current resources, identity, consumed and grounded items; reset restores originals',()=>{
 const g=new Game(99);g.start();g.food=50;g.consume('food','food-1');g.drop('food-2');g.phone('phone-1').battery=37;g.drop('phone-1');begin(g);
 until(g,()=>g.mode==='caught');const items=g.items,refs=[...items],snapshot=fingerprint(g),food=g.food,water=g.hydration,elapsed=g.elapsed,layout=g.escape.layout,connection=g.escape.connection;
 assert(g.retryEscape());assert.equal(g.mode,'playing');assert.equal(g.escape.phase,'loading');assert.equal(g.escape.attempt,2);assert.strictEqual(g.escape.layout,layout);
 assert.strictEqual(g.items,items);g.items.forEach((i,j)=>assert.strictEqual(i,refs[j]));assert.deepEqual(fingerprint(g),snapshot);near(g.food,food);near(g.hydration,water);near(g.elapsed,elapsed);assert.equal(g.escape.connection,connection+1);
 assert.deepEqual({x:g.player.x,z:g.player.z},layout.start);assert.equal(g.retryEscape(),false);g.update(DT);assert.equal(g.escape.phase,'warning');
 g.reset(99);assert.equal(g.escape.phase,'idle');assert.equal(g.escape.triggered,false);assert.equal(g.escape.layout,null);assert.equal(g.elapsed,0);assert.equal(g.food,100);assert.equal(g.hydration,100);assert.equal(g.phone('phone-1').battery,100);assert.equal(g.inventory('food').length,4);assert.equal(g.items.filter(i=>i.kind==='water').length,2);assert.equal(new Set(g.items.map(i=>i.id)).size,7);assert.equal(g.world.escapeLayout,undefined);
});

test('Manila seam, door close and reopen preserve the original ending, two waters and one charger',()=>{
 const g=new Game(42);g.start();g.drop('food-1');const grounded=fingerprint(g).filter(i=>i.state==='world'),charger=g.chargerPosition();begin(g);runRoute(g);until(g,()=>g.escape.phase==='door');
 assert.equal(g.player.x,g.maze.doorX-2.5);assert.equal(g.player.z,g.maze.doorZ);walk(g,{x:g.maze.doorX-1.25,z:g.maze.doorZ});
 assert.equal(g.interact(),'door');tick(g,.7);assert.equal(g.door,1);
 walk(g,{x:g.maze.doorX+1.7,z:g.maze.doorZ});assert(g.inRoom());assert(g.entered);assert.equal(g.changed,false);assert.equal(g.escape.phase,'door');
 assert.equal(g.interact(),'door');until(g,()=>g.door===0,2);assert(g.changed);assert.equal(g.escape.phase,'finished');assert.equal(g.escape.monster.active,false);
 assert.deepEqual(fingerprint(g).filter(i=>i.state==='world'),grounded);assert.deepEqual(g.chargerPosition(),charger);assert.equal(g.items.filter(i=>i.kind==='water').length,2);assert.equal(new Set(g.items.map(i=>i.id)).size,g.items.length);
 assert.equal(g.interact(),'door');tick(g,.7);assert.equal(g.door,1);
 // move() ends as soon as the original exit threshold is crossed.
 g.player.yaw=-Math.PI/2;untilMovementToWin(g);assert.equal(g.mode,'won');assert.equal(g.events.filter(x=>x==='exit').length,1);assert.equal(g.escape.phase,'finished');
});
function untilMovementToWin(g){for(let i=0;i<500&&g.mode==='playing';i++)g.update(DT,{forward:1});assert.equal(g.mode,'won')}


test('monster rounds every late bend and catches a player who stops one cell before the end',t=>{
 const g=begin(),l=g.escape.layout,targetIndex=l.route.length-2,seen=new Set([0]);
 const record=()=>{const m=g.escape.monster,index=l.indices.get(`${Math.floor(m.x/CELL)},${Math.floor(m.z/CELL)}`);assert.notEqual(index,undefined);seen.add(index);assert(!g.collides(m.x,m.z,{radius:1.17,ignoreRender:true}))};
 for(let i=l.startIndex+1;i<=targetIndex;i++)walk(g,l.route[i],{onStep:record});
 const waitingPlayer={...g.player};let ticks=0;
 while(g.escape.phase!=='caught-animation'&&ticks++<30/DT){g.update(DT);record()}
 assert.equal(g.escape.phase,'caught-animation');assert.deepEqual(g.player,waitingPlayer);
 assert.equal(Math.max(...seen),targetIndex);assert.deepEqual([...seen].sort((a,b)=>a-b),Array.from({length:targetIndex+1},(_,i)=>i));
 t.diagnostic(`Stationary late-route catch: monster traversed every route-cell index 0–${targetIndex}; caught after ${(ticks*DT).toFixed(2)} s of waiting.`);
});

test('forced boost respects backward and sideways controls, with no automatic translation',()=>{
 for(const {input,yaw,dx,dz} of [
  {input:{forward:-1},yaw:Math.PI/2,dx:-1,dz:0},
  {input:{strafe:1},yaw:0,dx:1,dz:0},
  {input:{strafe:-1},yaw:0,dx:-1,dz:0},
  {input:{forward:0,strafe:0,sprint:true},yaw:Math.PI/2,dx:0,dz:0},
 ]){
  const g=begin();g.player.yaw=yaw;const p={...g.player},food=g.food,water=g.hydration;tick(g,.2,input);
  near(g.player.x-p.x,dx*ESCAPE_SPEED*.2);near(g.player.z-p.z,dz*ESCAPE_SPEED*.2);assert(!g.collides(g.player.x,g.player.z));
  const moving=dx!==0||dz!==0;near(food-g.food,.2*(moving?.026*1.5:.014));near(water-g.hydration,.2*(moving?.07*1.5:.035));
 }
});

test('same-cell target behind solid geometry cannot cause wall traversal or a through-wall catch',()=>{
 const g=begin(),center={...g.escape.layout.start};g.escape.phase='chase';g.escape.time=0;
 // A compact fixture exercises the same-cell fallback without relying on a
 // different procedural layout: both entities are already inside one cell.
 Object.assign(g.player,{x:center.x+1.5,z:center.z});Object.assign(g.escape.monster,{x:center.x-1.5,z:center.z});
 g.obstacles.push({x:center.x,z:center.z,w:.16,d:5});
 assert(!g.collides(g.player.x,g.player.z));assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}));
 // A structural wall participates in the existing line-of-sight wall ledger
 // as well as solid collision, matching real corridor wall geometry.
 g.walls.push({x:center.x,z:center.z,w:.16,d:5});
 assert.equal(g.lineClear(g.escape.monster.x,g.escape.monster.z),false);
 for(let i=0;i<5/DT;i++){g.update(DT);assert(!g.collides(g.escape.monster.x,g.escape.monster.z,{radius:1.17,ignoreRender:true}));assert(g.escape.monster.x<center.x);assert.equal(g.escape.phase,'chase')}
 assert.equal(g.events.filter(x=>x==='它追上来了。').length,0);assert.equal(g.mode,'playing');assert.equal(g.escape.nav.length,0);
});


test('monster pursuit ignores absent render regions while player collision keeps its readiness gate',()=>{
 const g=begin(),start={...g.escape.monster};
 // Only the player's immediate area is rendered. The monster's first cells
 // stay off camera and must be navigable through logical geometry alone.
 g.renderReady=(x,z)=>Math.hypot(x-g.player.x,z-g.player.z)<1;
 assert.equal(g.renderReady(start.x,start.z),false);assert(g.collides(start.x,start.z));
 assert.equal(g.collides(start.x,start.z,{radius:1.17,ignoreRender:true}),false);
 let movedWhileHidden=false,frames=0;
 while(g.escape.phase!=='caught-animation'&&frames++<20/DT){
  g.update(DT);const m=g.escape.monster;
  assert(!g.collides(m.x,m.z,{radius:1.17,ignoreRender:true}));
  if(!g.renderReady(m.x,m.z)&&distance(m,start)>.1)movedWhileHidden=true;
 }
 assert(movedWhileHidden,'off-camera pursuer must move without renderer readiness');assert.equal(g.escape.phase,'caught-animation');
});

test('finding Manila during flicker or the last blackout frame cancels relocation permanently',()=>{
 for(const phase of ['flicker','blackout'])for(const flag of ['foundManila','entered']){
  const g=new Game(42);g.start();g.elapsed=479.98;g.update(DT);assert.equal(g.escape.phase,'flicker');
  if(phase==='blackout'){until(g,()=>g.escape.phase==='blackout');tick(g,.82)}
  const position={...g.player},items=fingerprint(g);g[flag]=true;g.update(DT);
  assert.equal(g.escape.phase,'suppressed');assert.equal(g.escape.layout,null);assert.equal(g.escape.monster,null);assert.equal(g.escape.connection,0);
  tick(g,10);assert.equal(g.escape.phase,'suppressed');assert.deepEqual(g.player,position);assert.deepEqual(fingerprint(g),items);assert.equal(g.escape.attempt,0);
 }
});
