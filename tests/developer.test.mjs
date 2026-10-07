import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {escapeDarkness,escapeForced,escapeFrozen} from '../dist/escape.js';
import {DEVELOPER_ITEM_LIMIT,setDeveloperEnabled,developerStatus,spawnDeveloperItem,jumpDeveloperTime,teleportDeveloper} from '../dist/developer.js';

const DT=.02;
function run(seed=42){const g=new Game(seed);g.start();assert(setDeveloperEnabled(g,true).ok);return g}
function tick(g,seconds,input={}){for(let left=seconds;left>1e-9;left-=DT)g.update(Math.min(DT,left),input)}
function state(g){return JSON.stringify({snapshot:g.snapshot(),escape:g.escape,entered:g.entered,foundManila:g.foundManila,pendingFold:g.pendingFold,events:g.events,developerEnabled:g.developerEnabled})}
function originals(g){const array=g.items,refs=[...array],values=refs.map(item=>({...item}));return()=>{assert.strictEqual(g.items,array);refs.forEach((item,i)=>{assert.strictEqual(g.items[i],item);assert.deepEqual(item,values[i])})}}
function full(g){while(g.inventory().length<16){const result=spawnDeveloperItem(g,'food');assert(result.ok);assert.equal(result.location,'inventory')}assert.equal(g.inventory().length,16)}
function beginChase(){const g=run();g.elapsed=479.98;g.update(DT);for(let i=0;i<1000&&g.escape.phase!=='chase';i++)g.update(DT);assert.equal(g.escape.phase,'chase');return g}

// Tools are inert without the explicit toggle, independent of their UI.
test('developer tools are disabled by default and disabling again gates every action',()=>{
 const g=new Game(4);g.start();assert.equal(g.developerEnabled,undefined);assert.equal(developerStatus(g).enabled,false);
 const before=state(g);
 for(const action of [()=>spawnDeveloperItem(g,'water'),()=>jumpDeveloperTime(g),()=>teleportDeveloper(g)]){const result=action();assert.equal(result.ok,false);assert.match(result.reason,/启用/);assert.equal(state(g),before)}
 assert(setDeveloperEnabled(g,true).ok);assert.equal(developerStatus(g).available,true);
 assert(setDeveloperEnabled(g,false).ok);assert.equal(developerStatus(g).canSpawn,false);assert.equal(developerStatus(g).canJumpTime,false);assert.equal(developerStatus(g).canTeleportInside,false);
 assert.equal(setDeveloperEnabled(g,'true').ok,false);assert.equal(g.developerEnabled,false);
});

test('enable is session-only across resets; a fresh game requires explicit enable',()=>{
 const g=new Game(9);assert(setDeveloperEnabled(g,true).ok);assert.equal(developerStatus(g).available,false);
 g.start();const first=spawnDeveloperItem(g,'phone');assert(first.ok);
 g.reset(10);assert.equal(g.developerEnabled,true);assert.equal(developerStatus(g).available,false);g.start();
 const next=spawnDeveloperItem(g,'phone');assert(next.ok);assert.notEqual(next.item.id,first.item.id);
 const fresh=new Game(10);fresh.start();assert.equal(developerStatus(fresh).enabled,false);
});

test('all developer actions reject non-run and terminal states without mutation',()=>{
 for(const mode of ['menu','note','won','lost','caught']){
  const g=run();g.mode=mode;const before=state(g);assert.equal(developerStatus(g).available,false);
  for(const result of [spawnDeveloperItem(g,'food'),jumpDeveloperTime(g),teleportDeveloper(g,'inside'),teleportDeveloper(g,'outside')])assert.equal(result.ok,false);
  assert.equal(state(g),before);
 }
 for(const mode of ['playing','paused']){
  const g=run();g.mode=mode;g.escape.phase='caught-animation';const before=state(g);
  assert.equal(spawnDeveloperItem(g,'water').ok,false);assert.equal(jumpDeveloperTime(g).ok,false);assert.equal(teleportDeveloper(g).ok,false);assert.equal(state(g),before);
 }
});

test('invalid item kinds and teleport targets are rejected atomically',()=>{
 const g=run(),before=state(g);
 for(const value of [undefined,null,'Food','ammo','water-1',{},[],1])assert.equal(spawnDeveloperItem(g,value).ok,false);
 for(const value of [null,'door','room',{},1])assert.equal(teleportDeveloper(g,value).ok,false);
 assert.equal(state(g),before);
});

test('each click adds exactly one unique real item while preserving all original objects',()=>{
 const g=run(),unchanged=originals(g),ids=new Set(g.items.map(item=>item.id));g.pause();
 for(let n=0;n<36;n++){
  const kind=['food','water','phone'][n%3],count=g.items.length,result=spawnDeveloperItem(g,kind);
  assert(result.ok,result.reason);assert.equal(g.items.length,count+1);assert.equal(result.item.kind,kind);assert.match(result.item.id,new RegExp(`^debug-${kind}-\\d+$`));
  assert.equal(ids.has(result.item.id),false);ids.add(result.item.id);assert.equal(result.item.developerSpawned,true);assert.strictEqual(g.items.at(-1),result.item);
  assert.equal(g.mode,'paused');assert.equal(g.elapsed,0);unchanged();
  if(result.item.state==='inventory'){assert(g.canPlaceItem(result.item.id,result.item.gridX,result.item.gridY));assert.deepEqual(g.itemSize(result.item),kind==='water'?{w:1,h:2}:{w:1,h:1})}
  // Keep testing rapid/repeated creation without physically covering every drop
  // location: consumed entries stay in the ledger and must never recycle IDs.
  Object.assign(result.item,{state:'consumed',gridX:null,gridY:null});
 }
 assert.equal(ids.size,g.items.length);
 const other=run();const result=spawnDeveloperItem(other,'food');assert(result.ok);assert(!ids.has(result.item.id),'IDs stay unique across Game instances in this page session');
});

test('new debug phones start full without charging existing phones or changing two original waters',()=>{
 const g=run();g.phone('phone-1').battery=17.5;g.food=49;g.hydration=62;
 const unchanged=originals(g),phone=spawnDeveloperItem(g,'phone'),water=spawnDeveloperItem(g,'water');
 assert(phone.ok);assert(water.ok);assert.equal(phone.item.battery,100);assert.equal(g.phone('phone-1').battery,17.5);assert.equal(water.item.kind,'water');assert.notEqual(water.item.id,'water-1');assert.notEqual(water.item.id,'water-2');
 unchanged();assert.equal(g.food,49);assert.equal(g.hydration,62);
});

test('spawn uses the existing contiguous grid rules for a tall water bottle',()=>{
 const g=run();full(g);
 const at=(x,y)=>g.inventory().find(item=>item.gridX===x&&item.gridY===y);
 for(const [x,y] of [[3,2],[3,3]])Object.assign(at(x,y),{state:'consumed',gridX:null,gridY:null});
 const result=spawnDeveloperItem(g,'water');assert(result.ok);assert.equal(result.location,'inventory');assert.equal(result.item.gridX,3);assert.equal(result.item.gridY,2);assert(g.canPlaceItem(result.item.id,3,2));
});

test('separated free cells cannot hold water, and a full backpack safely falls back to the existing drop algorithm',()=>{
 for(const fragmented of [false,true]){
  const g=run();full(g);
  if(fragmented)for(const [x,y] of [[0,0],[3,3]])Object.assign(g.inventory().find(item=>item.gridX===x&&item.gridY===y),{state:'consumed',gridX:null,gridY:null});
  const unchanged=originals(g),result=spawnDeveloperItem(g,'water');assert(result.ok,result.reason);assert.equal(result.location,'world');assert.equal(result.item.state,'world');assert.equal(result.item.placement,'ground');assert.equal(result.item.area,'maze');
  assert(g.dropPathClear(result.item.x,result.item.z));assert(!g.collides(result.item.x,result.item.z));assert.equal(result.item.gridX,null);assert.equal(result.item.gridY,null);unchanged();
 }
});

test('world fallback retains pause and phone state and ignores only unloaded render regions',()=>{
 const g=run();full(g);g.openPhone('phone-1');g.mode='paused';g.chargingPhoneId='phone-1';g.renderReady=()=>false;
 const elapsed=g.elapsed,result=spawnDeveloperItem(g,'phone');assert(result.ok,result.reason);assert.equal(result.location,'world');assert.equal(g.mode,'paused');assert.equal(g.phoneOpenId,'phone-1');assert.equal(g.chargingPhoneId,'phone-1');assert.equal(g.elapsed,elapsed);
 assert.equal(g.collides(result.item.x,result.item.z,{ignoreRender:true}),false);assert.equal(result.item.battery,100);
});

test('world fallback does not overlap grounded objects or cross physical walls',()=>{
 const g=run();full(g);const first=spawnDeveloperItem(g,'food');assert(first.ok);assert.equal(first.location,'world');
 // A second click needs a different footprint even though its preferred point
 // is already occupied. Neither item can be pushed through the wall fixture.
 const second=spawnDeveloperItem(g,'phone');assert(second.ok);assert.equal(second.location,'world');assert.notDeepEqual({x:first.item.x,z:first.item.z},{x:second.item.x,z:second.item.z});
 const trial=Object.create(g);trial.items=g.items.filter(item=>item!==second.item);assert(trial.dropSpotFree(second.item,second.item.x,second.item.z));
 g.obstacles.push({x:g.player.x,z:g.player.z-.35,w:4,d:.16});
 const third=spawnDeveloperItem(g,'water');assert(third.ok,third.reason);assert(g.dropPathClear(third.item.x,third.item.z));assert(third.item.z>g.player.z-.35,'drop must not tunnel through the nearby obstacle');
});

test('failed full-inventory spawn is atomic when every legal drop position is blocked',()=>{
 const g=run();full(g);g.pause();g.obstacles.push({x:g.player.x,z:g.player.z,w:3,d:3});
 const before=state(g),unchanged=originals(g),count=g.items.length;
 const result=spawnDeveloperItem(g,'food');assert.equal(result.ok,false);assert.match(result.reason,/没有生成/);assert.equal(g.items.length,count);assert.equal(state(g),before);unchanged();
 g.obstacles.pop();const success=spawnDeveloperItem(g,'food');assert(success.ok);assert.equal(g.items.length,count+1);
});

test('the bounded 128-item debug ledger counts consumed items and resets only with a new run',()=>{
 const g=run();
 for(let i=0;i<DEVELOPER_ITEM_LIMIT;i++){const result=spawnDeveloperItem(g,['food','water','phone'][i%3]);assert(result.ok);Object.assign(result.item,{state:'consumed',gridX:null,gridY:null})}
 assert.equal(g.items.length,7+128);assert.equal(developerStatus(g).canSpawn,false);assert.match(developerStatus(g).spawnReason,/128/);
 const before=state(g);for(let i=0;i<10;i++){const result=spawnDeveloperItem(g,'food');assert.equal(result.ok,false);assert.match(result.reason,/128/)}assert.equal(state(g),before);
 assert.equal(developerStatus(g).canJumpTime,true);assert.equal(developerStatus(g).canTeleportInside,true);
 g.reset(45);g.start();assert(spawnDeveloperItem(g,'water').ok);assert.equal(g.items.length,8);
});

test('7:30 changes only elapsed time; 30 additional active seconds are still required',()=>{
 const g=run();g.food=34;g.hydration=58;g.phone('phone-1').battery=71;g.pause();const unchanged=originals(g),position={...g.player},events=[...g.events];
 const result=jumpDeveloperTime(g);assert(result.ok);assert.equal(result.elapsed,450);assert.equal(result.remaining,30);assert.equal(g.elapsed,450);assert.equal(g.escape.phase,'idle');assert.equal(g.escape.triggered,false);assert.equal(g.mode,'paused');
 tick(g,35,{forward:1});assert.equal(g.elapsed,450);assert.deepEqual(g.player,position);assert.equal(g.food,34);assert.equal(g.hydration,58);assert.deepEqual(g.events,events);unchanged();
 g.resume();tick(g,29.98);assert.equal(g.escape.phase,'idle');assert.equal(g.escape.triggered,false);g.update(DT);assert.equal(g.escape.phase,'flicker');assert.equal(g.escape.triggered,true);
});

test('backpack and phone also freeze the 30-second countdown after time jump',()=>{
 const g=run();assert(jumpDeveloperTime(g).ok);g.openInventory();tick(g,35);assert.equal(g.elapsed,450);g.closeInventory();g.openPhone('phone-1');tick(g,35);assert.equal(g.elapsed,450);g.closePhone();tick(g,30);assert.equal(g.escape.phase,'flicker');
});

test('time jump rejects triggered, suppressed, discovered and transformed runs rather than resurrecting events',()=>{
 const fixtures=[g=>{g.escape.triggered=true},g=>{g.escape.phase='flicker'},g=>{g.escape.phase='suppressed'},g=>{g.escape.phase='finished'},g=>{g.foundManila=true},g=>{g.entered=true},g=>{g.changed=true},g=>Object.assign(g.player,{x:g.maze.doorX+2,z:g.maze.doorZ})];
 for(const setup of fixtures){const g=run();setup(g);const before=state(g);assert.equal(developerStatus(g).canJumpTime,false);assert.equal(jumpDeveloperTime(g).ok,false);assert.equal(state(g),before)}
 const g=beginChase(),before=state(g);assert.equal(jumpDeveloperTime(g).ok,false);assert.equal(state(g),before);
});

test('inside teleport chooses a physical safe point even when rendering is unavailable and preserves items/resources',()=>{
 for(const seed of [0,1,7,42,99,2026]){
  const g=run(seed);g.drop('food-1');g.food=37;g.hydration=53;g.phone('phone-1').battery=12;g.pause();g.chargingPhoneId='phone-1';g.pendingFold={x:9,z:12};g.foldPending=true;g.renderReady=()=>false;
  const unchanged=originals(g),world=g.world,walls=g.walls,obstacles=g.obstacles,elapsed=g.elapsed;
  const result=teleportDeveloper(g);assert(result.ok,result.reason);assert.equal(g.player.x,g.maze.doorX+2);assert.equal(g.player.z,g.maze.doorZ);assert(g.inRoom());assert.equal(g.collides(g.player.x,g.player.z,{ignoreRender:true}),false);
  assert.equal(g.door,1);assert.equal(g.doorTarget,1);assert.equal(g.entered,true);assert.equal(g.foundManila,true);assert.equal(g.changed,false);assert.equal(g.escape.phase,'suppressed');assert.equal(g.escape.triggered,false);assert.equal(g.mode,'paused');assert.equal(g.pendingFold,null);assert.equal(g.foldPending,false);assert.equal(g.chargingPhoneId,null);assert.equal(g.food,37);assert.equal(g.hydration,53);assert.equal(g.elapsed,elapsed);
  assert.strictEqual(g.world,world);assert.strictEqual(g.walls,walls);assert.strictEqual(g.obstacles,obstacles);unchanged();
  tick(g,40);assert.equal(g.changed,false);assert.equal(g.elapsed,elapsed);
 }
});

test('outside teleport preserves door state and is unavailable after the original connection changes',()=>{
 for(const door of [0,.4,1]){
  const g=run();g.door=door;g.doorTarget=door===1?0:1;g.pause();const unchanged=originals(g),target=g.doorTarget;
  const result=teleportDeveloper(g,'outside');assert(result.ok);assert.equal(g.player.x,g.maze.doorX-2.5);assert.equal(g.player.z,g.maze.doorZ);assert(!g.inRoom());assert(!g.collides(g.player.x,g.player.z,{ignoreRender:true}));assert.equal(g.entered,false);assert.equal(g.foundManila,true);assert.equal(g.door,door);assert.equal(g.doorTarget,target);assert.equal(g.changed,false);assert.equal(g.mode,'paused');unchanged();
 }
 const g=run();g.changed=true;g.entered=true;const before=state(g);assert.equal(developerStatus(g).canTeleportOutside,false);assert.equal(teleportDeveloper(g,'outside').ok,false);assert.equal(state(g),before);
 assert(teleportDeveloper(g,'inside').ok);assert.equal(g.changed,true,'inside teleport cannot reset the completed room transformation');
});

test('safe-point search falls back around a blocked preferred landing and failure is atomic',()=>{
 const g=run();g.obstacles.push({x:g.maze.doorX+2,z:g.maze.doorZ,w:.15,d:.15});
 const result=teleportDeveloper(g);assert(result.ok);assert.notDeepEqual(result.position,{x:g.maze.doorX+2,z:g.maze.doorZ});assert(!g.collides(g.player.x,g.player.z,{ignoreRender:true}));
 const blocked=beginChase();blocked.pause();blocked.chargingPhoneId='phone-1';blocked.pendingFold={x:1,z:2};blocked.obstacles.push({x:blocked.maze.doorX+2,z:blocked.maze.doorZ,w:6,d:5});
 const before=state(blocked),monster=blocked.escape.monster,result2=teleportDeveloper(blocked);assert.equal(result2.ok,false);assert.equal(state(blocked),before);assert.strictEqual(blocked.escape.monster,monster);assert.equal(monster.active,true);
});

test('teleport explicitly cancels chase, blackout and loading without refilling, deleting or relocating existing items',()=>{
 for(const phase of ['flicker','blackout','loading','warning','chase','seam','seam-loading','door']){
  const g=beginChase();g.escape.phase=phase;g.escape.time=2;g.escape.chaseTime=13;g.escape.nav=[{x:1,z:2}];g.escape.navClock=.1;g.drop('food-1');g.pause();
  const unchanged=originals(g),monster=g.escape.monster,layout=g.world.escapeLayout,food=g.food,hydration=g.hydration,elapsed=g.elapsed,attempt=g.escape.attempt;
  const result=teleportDeveloper(g,'inside');assert(result.ok);assert.equal(result.bypassedChase,true);assert.match(result.reason,/跳过本次追逐/);assert.equal(monster.active,false);assert.equal(g.escape.monster,null);assert.equal(g.escape.layout,null);assert.equal(g.escape.phase,'finished');assert.equal(g.escape.triggered,true);assert.equal(g.escape.time,0);assert.equal(g.escape.chaseTime,0);assert.equal(g.escape.navClock,0);assert.deepEqual(g.escape.nav,[]);assert.equal(g.escape.attempt,attempt);assert.strictEqual(g.world.escapeLayout,layout);
  assert.equal(escapeDarkness(g),0);assert.equal(escapeForced(g),false);assert.equal(escapeFrozen(g),false);assert.equal(g.mode,'paused');assert.equal(g.elapsed,elapsed);assert.equal(g.food,food);assert.equal(g.hydration,hydration);unchanged();
  g.resume();tick(g,2);assert.equal(g.escape.phase,'finished');assert.equal(g.changed,false);assert.equal(g.mode,'playing');unchanged();
 }
});

test('teleport from chase still requires manual close and preserves the hub transition and Level 1 terminal controls',()=>{
 const g=beginChase();g.drop('food-1');const unchanged=originals(g),charger=g.chargerPosition();g.pause();assert(teleportDeveloper(g).ok);tick(g,10);assert.equal(g.changed,false);g.resume();tick(g,3);assert.equal(g.changed,false);
 assert.equal(g.interact(),'door');tick(g,1);assert.equal(g.door,0);assert.equal(g.changed,true);assert.equal(g.escape.phase,'finished');assert.equal(g.escape.monster,null);assert.deepEqual(g.chargerPosition(),charger);unchanged();
 assert.equal(g.interact(),'door');tick(g,1);assert.equal(g.door,1);g.player.yaw=-Math.PI/2;
 for(let i=0;i<600&&g.zone==='level0';i++)g.update(DT,{forward:1});assert.equal(g.mode,'playing');assert.equal(g.zone,'hub');assert.equal(g.events.filter(event=>event==='exit').length,0);assert.equal(g.items.filter(item=>item.kind==='water').length,2);unchanged();
 g.transitionZone('level1');g.player.x=0;g.player.z=-42.79;g.player.yaw=0;g.update(DT,{forward:1});assert.equal(g.mode,'won');
 const before=state(g);assert.equal(teleportDeveloper(g).ok,false);assert.equal(jumpDeveloperTime(g).ok,false);assert.equal(spawnDeveloperItem(g,'food').ok,false);assert.equal(state(g),before);
});
