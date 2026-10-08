import {resetLevelOneProgress,updateLevelOneProgress,levelOneAtExit,nearestLevelOneClue,readLevelOneClue,levelOneObjective} from './level-one-progression.js';
import {levelOneAreaAt} from './level-one-layout.js';
import {resetLevelOneDanger,prepareLevelOneDanger,updateLevelOneDanger,levelOneSheltered} from './level-one-danger.js';
import {HUB,LEVEL1,levelOneLightingAt,zoneCollides,abnormalWallFor} from './zones.js';
import {ChunkWorld} from './world.js';
import {resetEscape,updateEscape,escapeForced,escapeFrozen,retryEscape} from './escape.js';
// Pure simulation: metres, +x east, +z south, yaw 0 faces north.
export const CELL=5,SIZE=11,RADIUS=.22;
export const PHONE_DRAIN_PER_SECOND=100/480,PHONE_CHARGE_PER_SECOND=100/40;
const DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
export function rng(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
export function makeMaze(seed,attempt=0){
 const random=rng((seed+Math.imul(attempt,0x9e3779b9))>>>0),center=Math.floor(SIZE/2),start=center*SIZE+center;
 const cells=Array.from({length:SIZE*SIZE},(_,i)=>({x:i%SIZE,z:Math.floor(i/SIZE),open:[false,false,false,false]}));
 // Identical, opaque U-shaped vestibules hide both sides of each spatial seam.
 // Their only ordinary opening is south; they never replace the escape route.
 const folds=[{id:'west',x:center-2,z:center-2},{id:'near',x:center,z:center-1},{id:'east',x:center+2,z:center-2}].map(c=>({...c,index:c.z*SIZE+c.x,px:(c.x+.5)*CELL,pz:c.z*CELL+1.15}));
 const endpoints=new Set(folds.map(c=>c.index)),seen=new Set([start]);
 const allowed=(i,d,j)=>(!endpoints.has(i)||d===2)&&(!endpoints.has(j)||d===0);
 function open(i,j){const a=cells[i],b=cells[j],d=DIRS.findIndex(([dx,dz])=>b.x-a.x===dx&&b.z-a.z===dz);a.open[d]=true;b.open[(d+2)%4]=true;seen.add(i);seen.add(j)}
 // A short, guaranteed first experiment is available from the central spawn.
 for(const path of [[[center,center],[center,center-1]],[[center,center],[center-1,center],[center-2,center],[center-2,center-1],[center-2,center-2]],[[center,center],[center+1,center],[center+2,center],[center+2,center-1],[center+2,center-2]]])for(let k=1;k<path.length;k++)open(path[k-1][1]*SIZE+path[k-1][0],path[k][1]*SIZE+path[k][0]);
 const stack=[...seen];
 while(stack.length){const i=stack.at(-1),c=cells[i],options=[];DIRS.forEach(([dx,dz],d)=>{const x=c.x+dx,z=c.z+dz,j=z*SIZE+x;if(x>=0&&x<SIZE&&z>=0&&z<SIZE&&!seen.has(j)&&allowed(i,d,j))options.push(j)});if(!options.length){stack.pop();continue}const j=options[Math.floor(random()*options.length)];open(i,j);stack.push(j)}
 // Fewer shortcuts per square metre than the old 7x7 map; no disconnected traps.
 for(let k=0;k<8;k++){const i=Math.floor(random()*cells.length),c=cells[i],d=random()<.5?1:2,[dx,dz]=DIRS[d],x=c.x+dx,z=c.z+dz,j=z*SIZE+x;if(x<SIZE&&z<SIZE&&allowed(i,d,j))open(i,j)}
 const dist=Array(cells.length).fill(Infinity),parent=Array(cells.length).fill(-1),q=[start];dist[start]=0;
 for(let k=0;k<q.length;k++){const i=q[k],c=cells[i];c.open.forEach((v,d)=>{if(v){const[dx,dz]=DIRS[d],j=(c.z+dz)*SIZE+c.x+dx;if(dist[j]===Infinity){dist[j]=dist[i]+1;parent[j]=i;q.push(j)}}})}
 let goal=SIZE-1;for(let z=0;z<SIZE;z++){const i=z*SIZE+SIZE-1;if(dist[i]>dist[goal])goal=i}
 const route=[];for(let i=goal;i>=0;i=parent[i])route.unshift(i);
 // Reject unusually short escape routes, deterministically and with bounded build work.
 if(route.length<23&&attempt<16)return makeMaze(seed,attempt+1);
 return{seed:seed>>>0,generationAttempt:attempt,cells,start,folds,goal,route,dist,doorX:SIZE*CELL,doorZ:(cells[goal].z+.5)*CELL};
}
export class Game{
constructor(seed=1){this.reset(seed)}
// Optional observer: never writes gameplay state or uses wall-clock time.
setPlaytestEnabled(enabled,source='human-unverified'){
 if(enabled===Boolean(this.playtestEnabled))return;
 if(!enabled)this.finishPlaytest('recording-stopped');
 this.playtestEnabled=Boolean(enabled);this.playtestSource=source;
 if(enabled&&this.zone==='level1')this.beginPlaytest(true);
}
beginPlaytest(partial=false){
 if(!this.playtestEnabled||this.playtestRun)return;
 this.playtestRun={seed:this.maze.seed,source:this.playtestSource,partial,debugAssisted:Boolean(this.playtestDebugAssisted),
 activeSeconds:0,visits:[],deaths:0,retries:0,reachedPipeExit:false,outcome:'in-progress',attempts:[],
 baseline:{elapsed:this.level1.elapsed,clueIds:[...this.level1.readClues],crateIds:this.level1.crates.filter(c=>c.opened).map(c=>c.id)},
 clueIds:[],crateIds:[]};
 this.playtestRun.attempts.push({activeSeconds:0,outcome:'in-progress'});this.observePlaytest();
}
observePlaytest(){
 const r=this.playtestRun;if(!r||this.zone!=='level1')return;
 const area=levelOneAreaAt(this.player.x,this.player.z).id;
 if(r.visits.at(-1)?.area!==area)r.visits.push({area,activeSeconds:r.activeSeconds,attempt:r.attempts.length});
 r.clueIds=[...this.level1.readClues];r.crateIds=this.level1.crates.filter(c=>c.opened).map(c=>c.id);r.sectors=this.level1.sectors.map((s,area)=>({area,visited:s.visited}));r.cluesRead=r.clueIds.length;r.cratesOpened=r.crateIds.length;
 if(this.mode==='lost'&&r.attempts.at(-1).outcome==='in-progress'){r.deaths++;r.attempts.at(-1).outcome='lost';r.outcome='lost'}
 if(this.mode==='won'){r.reachedPipeExit=true;r.outcome='pipe-exit';r.attempts.at(-1).outcome='pipe-exit'}
}
finishPlaytest(outcome){
 if(!this.playtestRun)return;this.observePlaytest();
 if(!this.playtestRun.reachedPipeExit)this.playtestRun.outcome=outcome;
 const attempt=this.playtestRun.attempts.at(-1);if(attempt.outcome==='in-progress')attempt.outcome=outcome;
 this.playtestHistory??=[];this.playtestHistory.push(this.playtestRun);this.playtestHistory=this.playtestHistory.slice(-20);this.playtestRun=null;
}
playtestReport(){
 this.observePlaytest();
 return JSON.parse(JSON.stringify({schemaVersion:1,build:'demo-v1.0-rc2',timeBasis:'Level 1 simulation-active seconds; pauses, inventory, phone, hidden/portrait/loading excluded; frame delta capped at 0.05s',
 evidence:'Scripted timing is not human first-play evidence. Human source is unverified, not a claim of first play or mobile acceptance.',
 enabled:Boolean(this.playtestEnabled),history:this.playtestHistory||[],current:this.playtestRun||null}));
}
reset(seed){this.finishPlaytest('restarted');this.playtestDebugAssisted=false;this.maze=makeMaze(seed);this.zone='level0';this.hub={sealed:false};this.level1={...resetLevelOneProgress(),failure:null,retries:0,danger:resetLevelOneDanger(),crates:LEVEL1.crates.map(c=>({...c,opened:false}))};this.abnormalWall=abnormalWallFor(this.maze);this.player={x:SIZE*CELL/2,z:SIZE*CELL/2,yaw:0,pitch:0};this.mode='menu';this.inventoryOpen=false;this.phoneOpenId=null;this.chargingPhoneId=null;this.elapsed=0;this.food=100;this.hydration=100;this.door=0;this.doorTarget=0;this.changed=false;this.entered=false;this.loops=0;this.foldState=0;this.foldPending=false;this.approach=0;this.noteRead=false;this.exitAnnounced=false;this.events=[];this.items=Array.from({length:4},(_,i)=>({id:`food-${i+1}`,kind:'food',state:'inventory',gridX:i%4,gridY:Math.floor(i/4),x:0,y:.005,z:0,placement:'ground',area:'maze'}));this.items.push(...Array.from({length:2},(_,i)=>({id:`water-${i+1}`,kind:'water',state:'world',gridX:null,gridY:null,x:this.maze.doorX+4.25,y:.68,z:this.maze.doorZ-.8+i*.5,placement:'table',area:'room'})));this.items.push({id:'phone-1',kind:'phone',battery:100,state:'inventory',gridX:0,gridY:1,x:0,y:.005,z:0,placement:'ground',area:'maze'});this.obstacles=[{x:this.maze.doorX+4.4,z:this.maze.doorZ+.5,w:.8,d:2.7}];this.roomWalls=[];const add=(x,z,w,d)=>this.roomWalls.push({x,z,w,d});const dx=this.maze.doorX,dz=this.maze.doorZ;add(dx,dz-1.7,.16,1.6);add(dx,dz+1.7,.16,1.6);add(dx+3,dz-2.5,6,.16);add(dx+3,dz+2.5,6,.16);add(dx+6,dz,.16,5);this.world=new ChunkWorld(seed,this.maze);this.walls=[...this.world.wallsInRect(0,0,SIZE-1,SIZE-1),...this.roomWalls];this.renderReady=null;this.pendingFold=null;this.escape=resetEscape();this.escapeViewReady=null;this.foundManila=false;for(const item of this.items)item.zone='level0';return this}
start(){this.mode='playing';this.events.push('你带了食物和一部手机，却忘了水。打开背包，可以查看资料或放下路标。')}
roomContains(x,z){const m=this.maze;return x>m.doorX&&x<m.doorX+6&&Math.abs(z-m.doorZ)<2.5}
inRoom(x=this.player.x,z=this.player.z){return this.zone==='level0'&&this.roomContains(x,z)&&x>this.maze.doorX+RADIUS+.1}
worldItemVisible(item){return item.state==='world'&&(item.zone||'level0')===this.zone&&(this.zone!=='level0'||item.area==='room'||!this.changed&&(!this.renderReady||this.renderReady(item.x,item.z)))}
inventory(kind){return this.items.filter(i=>i.state==='inventory'&&(kind===undefined||i.kind===kind))}
itemSize(item){if(typeof item==='string')item=this.items.find(i=>i.id===item);return item?.kind==='water'?{w:1,h:2}:['food','phone'].includes(item?.kind)?{w:1,h:1}:null}
// Grid coordinates belong to the object, not its array index. Failed moves never
// overwrite the old location, so a cancelled drag needs no simulation rollback.
canPlaceItem(id,x,y){
 const item=this.items.find(i=>i.id===id),size=this.itemSize(item);
 if(!size||item.state==='consumed'||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x+size.w>4||y+size.h>4)return false;
 return this.inventory().every(other=>{if(other.id===id)return true;const s=this.itemSize(other);return s&&Number.isInteger(other.gridX)&&Number.isInteger(other.gridY)&&(x+size.w<=other.gridX||x>=other.gridX+s.w||y+size.h<=other.gridY||y>=other.gridY+s.h)});
}
moveInventoryItem(id,x,y){
 if(this.mode!=='playing'||this.phoneOpenId)return false;
 const item=this.items.find(i=>i.id===id&&i.state==='inventory');
 if(!item||!this.canPlaceItem(id,x,y))return false;
 item.gridX=x;item.gridY=y;return true;
}
firstInventorySlot(id){for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(this.canPlaceItem(id,x,y))return{x,y};return null}
arrangeInventory(){
 if(this.mode!=='playing'||this.phoneOpenId)return false;
 // Plan the whole arrangement first. Tall bottles go first; stable ordering
 // within each size keeps repeated sorting deterministic and preserves IDs.
 const items=this.inventory().slice().sort((a,b)=>this.itemSize(b).h-this.itemSize(a).h),occupied=Array(16).fill(false),plan=[];
 for(const item of items){
  const size=this.itemSize(item);let slot=null;
  for(let y=0;y<=4-size.h&&!slot;y++)for(let x=0;x<=4-size.w&&!slot;x++){
   let free=true;for(let dy=0;dy<size.h;dy++)for(let dx=0;dx<size.w;dx++)if(occupied[(y+dy)*4+x+dx])free=false;
   if(free)slot={x,y};
  }
  if(!slot)return false;
  for(let dy=0;dy<size.h;dy++)for(let dx=0;dx<size.w;dx++)occupied[(slot.y+dy)*4+slot.x+dx]=true;
  plan.push({item,...slot});
 }
 for(const {item,x,y} of plan){item.gridX=x;item.gridY=y}return true;
}
openInventory(){this.cancelInteraction();if(this.mode!=='playing'||this.phoneOpenId||escapeFrozen(this))return false;this.inventoryOpen=true;return true}
closeInventory(){const wasOpen=this.inventoryOpen;this.closePhone();this.inventoryOpen=false;return wasOpen}

// Device time is intentionally separate from survival time: reading and the
// backpack freeze the world, while the visible screen / connected cable run.
// The UI passes active=false for portrait, background, settings and pause.
phone(id=this.phoneOpenId){return this.items.find(i=>i.id===id&&i.kind==='phone'&&i.state==='inventory')}
openPhone(id){this.cancelInteraction();if(typeof id!=='string'||this.mode!=='playing'||!this.phone(id))return false;this.phoneOpenId=id;return true}
closePhone(){const wasOpen=Boolean(this.phoneOpenId);this.phoneOpenId=null;return wasOpen}
chargerPosition(){return{x:this.maze.doorX+4.25,z:this.maze.doorZ-.65}}
nearCharger(){const c=this.chargerPosition();return this.inRoom()&&Math.hypot(this.player.x-c.x,this.player.z-c.z)<1.3&&this.lineClear(c.x,c.z)}
connectCharger(id){
 if(typeof id!=='string'||this.mode!=='playing'||!this.nearCharger()||!this.phone(id))return false;
 if(this.chargingPhoneId===id)return true;
 this.chargingPhoneId=id;this.events.push('已接上充电线。离开桌边会自动断开。');return true;
}
disconnectCharger(){const connected=Boolean(this.chargingPhoneId);this.chargingPhoneId=null;return connected}
toggleCharger(id){if(this.mode!=='playing'||!this.nearCharger())return false;if(this.chargingPhoneId===id)return this.disconnectCharger();return this.connectCharger(id)}
validateCharger(){if(this.chargingPhoneId&&(!this.phone(this.chargingPhoneId)||!this.nearCharger())){this.disconnectCharger();this.events.push('充电线已断开。')}}
updateDevices(dt,active=true){
 this.validateCharger();
 if(!active||this.mode!=='playing'||!Number.isFinite(dt)||dt<=0)return;
 // No elapsed-time catch-up after a stalled frame or hidden tab.
 dt=Math.min(.05,dt);
 const charging=this.phone(this.chargingPhoneId),reading=this.phone();
 if(charging)charging.battery=Math.min(100,Math.max(0,charging.battery)+dt*PHONE_CHARGE_PER_SECOND);
 if(reading&&reading!==charging){const before=reading.battery;reading.battery=Math.max(0,Math.min(100,before)-dt*PHONE_DRAIN_PER_SECOND);if(before>0&&reading.battery===0)this.events.push('手机没电了。马尼拉房间的桌边有充电线。')}
}


collides(x,z,{radius=RADIUS,ignoreRender=false,ignoreEntities=false}={}){
 const m=this.maze,r=radius;if(!Number.isFinite(x)||!Number.isFinite(z))return true;if(this.zone!=='level0'){
 const e=this.level1.danger;
 if(!ignoreEntities&&this.zone==='level1'&&this.level1.phase==='dark'&&e.active&&e.grace<=0){
  const distance=Math.hypot(x-e.x,z-e.z),old=Math.hypot(this.player.x-e.x,this.player.z-e.z);
  if(distance<.35+r&&distance<=old+1e-9)return true;
 }
 return zoneCollides(this.zone,x,z,r);
}
 if(this.changed){if(x<m.doorX){if(x<m.doorX-9.5||Math.abs(z-m.doorZ)>1.2-r)return true;return this.doorCollision(x,z)}if(x>m.doorX+6-r||Math.abs(z-m.doorZ)>2.5-r)return true}
 const roomEnvelope=x>=m.doorX-r&&x<=m.doorX+6+r&&Math.abs(z-m.doorZ)<=2.5+r;
 if(!this.changed&&!roomEnvelope){if(!ignoreRender&&this.renderReady&&!this.renderReady(x,z))return true;if(!this.world.cell(Math.floor(x/CELL),Math.floor(z/CELL)).active)return true}
 const walls=this.changed?this.roomWalls:[...this.world.wallsNear(x,z,r+.09),...this.walls];
 if([...walls,...this.obstacles].some(w=>Math.abs(x-w.x)<w.w/2+r&&Math.abs(z-w.z)<w.d/2+r))return true;
 return this.doorCollision(x,z);
}
doorCollision(x,z){const m=this.maze; // A hinged solid leaf, tested in its local frame.
const a=this.door*Math.PI/2,dx=x-m.doorX,dz=z-(m.doorZ-.8),lx=Math.cos(a)*dx-Math.sin(a)*dz,lz=Math.sin(a)*dx+Math.cos(a)*dz;return Math.abs(lx)<.055+RADIUS&&lz> -RADIUS&&lz<1.6+RADIUS}
// A seam is a rigid translation of two matching, wall-occluded vestibules.
// Position, residual movement, yaw and pitch use the same frame; items never move.
activeFolds(){const f=this.maze.folds;return this.foldState===0?[f[0],f[1]]:[f[0],f[2]]}
tryFold(oldX,oldZ){
 if(this.zone!=='level0'||this.changed||this.escape.layout)return false;
 const p=this.player,[a,b]=this.activeFolds();
 for(const [from,to] of [[a,b],[b,a]]){
  if(!((oldX<from.px&&p.x>=from.px)||(oldX>from.px&&p.x<=from.px)))continue;
  const t=(from.px-oldX)/(p.x-oldX),z=oldZ+(p.z-oldZ)*t;
  if(z<=from.z*CELL+RADIUS||z>=from.z*CELL+2.5-.08-RADIUS)continue;
  const x=p.x+(to.px-from.px),nz=p.z+(to.pz-from.pz);
  if(this.renderReady&&!this.renderReady(x,nz)){p.x=oldX;p.z=oldZ;this.pendingFold={x,z:nz};return false}
  if(this.collides(x,nz))continue;
  this.pendingFold=null;
  p.x=x+(p.x===from.px?Math.sign(p.x-oldX)*1e-7:0);p.z=nz;this.loops++;if(this.foldState===0)this.foldPending=true;
  this.events.push('灯管的低鸣接上了刚才的节奏。');return true;
 }
 return false;
}
settleFold(){
 if(this.zone!=='level0'||!this.foldPending||this.foldState||this.changed)return;
 const pair=this.activeFolds(),p=this.player;
 // The connection changes only after BOTH full seam apertures are behind walls.
 // A nearby or visible seam remains stable, even if the player waits or looks back.
 if(pair.some(f=>Math.hypot(p.x-f.px,p.z-f.pz)<4.5||[.35,1.15,2.1].some(z=>this.lineClear(f.px,f.z*CELL+z))))return;
 this.foldState=1;this.foldPending=false;this.events.push('身后传来一声很轻的灯管响。');
}
move(dx,dz){if(this.inventoryOpen||this.phoneOpenId)return;if(this.pendingFold&&(!this.renderReady||this.renderReady(this.pendingFold.x,this.pendingFold.z)))this.pendingFold=null;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.09));for(let k=0;k<steps;k++){const p=this.player,oldX=p.x,oldZ=p.z;const x=p.x+dx/steps,z=p.z+dz/steps;if(!this.collides(x,p.z))p.x=x;if(!this.collides(p.x,z))p.z=z;this.tryFold(oldX,oldZ);this.settleFold();this.validateCharger();if(this.zone==='level0'&&this.changed&&p.x<this.maze.doorX-8.3){this.transitionZone('hub');break}if(this.zone==='hub'&&p.z+RADIUS<HUB.sealZ&&!this.hub.sealed){this.hub.sealed=true;this.events.push('身后的入口封闭了。')}if(this.zone==='level1'&&levelOneAtExit(this)){this.mode='won';this.events.push('level1-demo-end');break}}}
update(dt,input={}){
 const before=this.level1.elapsed;
 this.updateSimulation(dt,input);
 if(this.playtestEnabled&&this.zone==='level1'){
  this.beginPlaytest(before>0);
  const r=this.playtestRun,delta=Math.max(0,this.level1.elapsed-before);
  if(r&&!r.reachedPipeExit){r.activeSeconds+=delta;r.attempts.at(-1).activeSeconds+=delta;this.observePlaytest()}
 }
}
updateSimulation(dt,input={}){
 if(this.mode!=='playing'||this.inventoryOpen||this.phoneOpenId||!Number.isFinite(dt)||dt<=0){this.cancelInteraction();return}
 dt=Math.min(.05,dt);this.elapsed+=dt;if(this.zone==='level1'){this.level1.elapsed+=dt}if(this.zone==='level0'&&!this.foundManila&&Math.hypot(this.player.x-this.maze.doorX,this.player.z-this.maze.doorZ)<6&&this.lineClear(this.maze.doorX-.4,this.maze.doorZ))this.foundManila=true;if(this.zone==='level0')updateEscape(this,dt);this.updateInteraction(dt,input.interactHeld);
 if(this.mode!=='playing'||escapeFrozen(this))return;
 const forced=escapeForced(this),moving=Math.hypot(input.forward||0,input.strafe||0)>0;
 const sprint=forced?moving:!!input.sprint,speed=forced?3.25*1.5:input.sprint&&this.hydration>15?3.25:2.05;
 let f=input.forward||0,s=input.strafe||0,n=Math.max(1,Math.hypot(f,s));f/=n;s/=n;
 this.move((Math.sin(this.player.yaw)*f+Math.cos(this.player.yaw)*s)*speed*dt,(-Math.cos(this.player.yaw)*f+Math.sin(this.player.yaw)*s)*speed*dt);
 if(this.mode!=='playing')return;
 if(this.zone==='level1'){this.level1.sprinting=!!input.sprint&&moving&&this.hydration>15;updateLevelOneProgress(this,dt);updateLevelOneDanger(this,dt);if(this.mode!=='playing')return}
 const drain=forced&&moving?1.5:1;
 this.food=Math.max(0,this.food-dt*(sprint?.026:.014)*drain);this.hydration=Math.max(0,this.hydration-dt*(sprint?.07:.035)*drain);
 if(this.hydration<=0||this.food<=0){this.mode='lost';if(this.escape.monster)this.escape.monster.active=false;this.events.push('lost');return}
 if(this.zone!=='level0')return;
 if(this.inRoom()&&!this.entered){this.entered=true;this.events.push('木门外，传来很轻的脚步声。先把门关好。')}
 if(this.entered&&!this.changed)this.approach+=dt;
 if(this.door!==this.doorTarget){const old=this.door;let proposed=this.door+Math.sign(this.doorTarget-this.door)*dt*1.5;this.door=Math.max(0,Math.min(1,proposed));if(this.doorCollision(this.player.x,this.player.z)){const closing=this.doorTarget===0;this.door=old;this.doorTarget=closing?1:0;this.events.push(closing?'你挡住了门。再往房间里走一点。':'门被你挡住了。退开一点再试。')}}
 if(this.entered&&!this.changed&&this.door===0&&this.doorTarget===0&&this.inRoom()){this.changed=true;if(this.escape.monster){this.escape.monster.active=false;this.escape.phase='finished'}this.events.push('门完全关上了。脚步声消失。')}
}
transitionZone(zone){
 if(!['hub','level1'].includes(zone)||this.zone===zone)return false;
 this.cancelInteraction();this.closeInventory();this.disconnectCharger();this.pendingFold=null;
 this.zone=zone;Object.assign(this.player,zone==='hub'?HUB.spawn:LEVEL1.spawn,{pitch:0});
 if(zone==='level1')this.beginPlaytest(false);
 if(this.escape.monster)this.escape.monster.active=false;if(this.escape.phase!=='suppressed')this.escape.phase='finished';
 this.events.push(zone==='hub'?'前方的七扇门无法打开。右侧墙上的门通往 Level 1。':'Level 1 · 六个仓库区相连。观察编号与路线标记；绿色服务间可绕行，补给有限。');return true;
}
nearAbnormalWall(){const w=this.abnormalWall;return this.zone==='level0'&&!this.changed&&!this.escape.layout&&Math.hypot(this.player.x-w.x,this.player.z-w.z)<1.35&&this.lineClear(w.x+w.normalX*.15,w.z+w.normalZ*.15)}
cancelInteraction(){if(this.abnormalWall)this.abnormalWall.hold=0}
updateInteraction(dt,held){if(!held||!this.nearAbnormalWall()){this.cancelInteraction();return}this.abnormalWall.hold+=dt;if(this.abnormalWall.hold>=2-1e-9)this.transitionZone('level1')}
zonePrompt(){
 const item=this.nearestItem();if(item)return item.kind==='phone'?'拾起手机':item.kind==='water'?'拾起饮用水':'拾起食物';
 const door=this.nearHubDoor();if(door)return door.active?'打开门 · Level 1':`${door.label} · 无法打开`;
 if(this.nearestCrate())return '打开补给箱';if(nearestLevelOneClue(this))return '阅读路线标记';return '';
}
nearHubDoor(){return this.zone==='hub'?[...HUB.doors,HUB.sideDoor].filter(d=>Math.hypot(this.player.x-d.x,this.player.z-d.z)<1.35).sort((a,b)=>Math.hypot(this.player.x-a.x,this.player.z-a.z)-Math.hypot(this.player.x-b.x,this.player.z-b.z))[0]:null}
crateReachable(c){const dx=this.player.x-c.x,dz=this.player.z-c.z,d=Math.hypot(dx,dz);return d>0&&this.lineClear(c.x+dx/d*.62,c.z+dz/d*.62)}
nearestCrate(){return this.zone==='level1'?this.level1.crates.filter(c=>!c.opened&&Math.hypot(this.player.x-c.x,this.player.z-c.z)<1.6&&this.crateReachable(c)).sort((a,b)=>Math.hypot(this.player.x-a.x,this.player.z-a.z)-Math.hypot(this.player.x-b.x,this.player.z-b.z))[0]:null}
interactZone(){
 const door=this.nearHubDoor();if(door){if(door.active){this.transitionZone('level1');return 'level1'}this.events.push(`${door.label} · 这扇门无法打开。`);return 'inactive-door'}
 const crate=this.nearestCrate();if(!crate)return readLevelOneClue(this);
 const id=`${crate.id}-${crate.kind}`,item={id,kind:crate.kind,state:'world',gridX:null,gridY:null,zone:'level1',area:'level1',x:this.player.x,z:this.player.z,y:.005,placement:'ground'};
 // Insert only for slot calculation, then commit once, or roll back completely.
 if(this.items.some(i=>i.id===id)){crate.opened=true;return null}
 this.items.push(item);const slot=this.firstInventorySlot(id);
 if(slot){Object.assign(item,{state:'inventory',gridX:slot.x,gridY:slot.y})}
 else{let spot=null;for(const d of [.7,.5,.3,.15,0]){for(const a of [0,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2,Math.PI]){const x=this.player.x+Math.sin(this.player.yaw+a)*d,z=this.player.z-Math.cos(this.player.yaw+a)*d;if(this.dropPathClear(x,z)&&this.items.every(o=>o===item||o.state!=='world'||(o.zone||'level0')!==this.zone||Math.hypot(o.x-x,o.z-z)>.42)){spot={x,z};break}}if(spot)break}if(!spot){this.items.pop();this.events.push('先腾出一点地方，再打开箱子。');return null}Object.assign(item,spot)}
 crate.opened=true;this.events.push(slot?'箱子里有一份补给，已放入背包。':'背包已满。补给放在了脚边。');return 'crate';
}
prepareLevelOne(){prepareLevelOneDanger(this)}
retryLevelOne(){
 if(this.zone!=='level1'||this.mode!=='lost')return false;
 this.observePlaytest();if(this.playtestRun){this.playtestRun.retries++;this.playtestRun.outcome='in-progress';this.playtestRun.attempts.push({activeSeconds:0,outcome:'in-progress'})}
 const checkpoint=this.level1.danger.checkpoint||LEVEL1.spawn;
 Object.assign(this.player,checkpoint,{pitch:0});
 this.level1.elapsed=0;this.level1.phase='lit';this.level1.failure=null;this.level1.retries++;this.level1.area=levelOneAreaAt(checkpoint.x,checkpoint.z).id;this.level1.sectors[this.level1.area].encounter='pending';this.level1.sectors[this.level1.area].time=0;
 this.level1.danger=resetLevelOneDanger();this.level1.danger.checkpoint={...checkpoint};
 // Retry retains stable identities, opened crates, dropped/consumed items and phone.
 // A small survival floor avoids an irreversible dry checkpoint; no item is granted.
 this.food=Math.max(25,this.food);this.hydration=Math.max(25,this.hydration);
 this.prepareLevelOne();this.closeInventory();this.cancelInteraction();this.mode='playing';
 this.events.push('回到最近的绿色光区。补给状态保留；体力与水分至少恢复至 25。');return true;
}
levelOneObjective(){return levelOneObjective(this)}
levelOneSafe(){return this.zone==='level1'&&levelOneSheltered(this.player.x,this.player.z)}
retryEscape(){return retryEscape(this)}
nearDoor(){return this.zone==='level0'&&Math.hypot(this.player.x-this.maze.doorX,this.player.z-this.maze.doorZ)<2.35}
nearNote(){return this.inRoom()&&Math.hypot(this.player.x-(this.maze.doorX+4.35),this.player.z-(this.maze.doorZ+1.4))<1.6}
lineClear(x,z){if(this.zone!=='level0'){const p=this.player,n=Math.max(1,Math.ceil(Math.hypot(x-p.x,z-p.z)/.08));for(let k=1;k<n;k++)if(zoneCollides(this.zone,p.x+(x-p.x)*k/n,p.z+(z-p.z)*k/n,0))return false;return true}const p=this.player,dist=Math.hypot(x-p.x,z-p.z),steps=Math.ceil(dist/.1);for(let k=1;k<steps;k++){const qx=p.x+(x-p.x)*k/steps,qz=p.z+(z-p.z)*k/steps;const walls=this.changed?this.roomWalls:[...this.world.wallsNear(qx,qz,.09),...this.walls];if(walls.some(w=>Math.abs(qx-w.x)<w.w/2&&Math.abs(qz-w.z)<w.d/2)||this.changed&&qx<this.maze.doorX&&(qx<this.maze.doorX-9.5||Math.abs(qz-this.maze.doorZ)>1.2)||this.doorCollision(qx,qz))return false}return true}
nearestItem(){return this.items.filter(i=>this.worldItemVisible(i)).filter(i=>Math.hypot(i.x-this.player.x,i.z-this.player.z)<1.6&&this.lineClear(i.x,i.z)).sort((a,b)=>Math.hypot(a.x-this.player.x,a.z-this.player.z)-Math.hypot(b.x-this.player.x,b.z-this.player.z))[0]}
pickupItem(id){
 if(this.mode!=='playing'||this.inventoryOpen||this.phoneOpenId)return;
 const item=this.items.find(i=>i.id===id&&i.state==='world');
 if(!item||!this.worldItemVisible(item)||Math.hypot(item.x-this.player.x,item.z-this.player.z)>=1.6||!this.lineClear(item.x,item.z))return;
 const slot=this.firstInventorySlot(id);
 if(!slot){this.events.push('背包没有足够的连续空格。');return}
 Object.assign(item,{state:'inventory',gridX:slot.x,gridY:slot.y});
 this.events.push(item.kind==='phone'?'拾回了手机。电量保持不变。':item.kind==='food'?`拾回了食物 ${item.id.split('-').at(-1)}。`:'找到一小瓶饮用水。');return item.id;
}
interact(){if(this.mode!=='playing'||this.inventoryOpen||this.phoneOpenId||escapeFrozen(this))return;const item=this.nearestItem();if(item)return this.pickupItem(item.id)?'pickup':null;if(this.zone!=='level0')return this.interactZone();if(this.nearCharger()){const phone=this.phone(this.chargingPhoneId)||this.inventory('phone')[0];if(!phone){this.events.push('这里有充电线。先把手机拾回背包。');return 'charger'}this.toggleCharger(phone.id);return 'charger'}if(this.nearNote()){this.noteRead=true;this.mode='note';return 'note'}if(this.nearDoor()){this.doorTarget=this.doorTarget>.5?0:1;return 'door'}return null}
// Sample the entire route using the existing solid collision geometry, including
// furniture and the live door leaf. An empty endpoint beyond a thin wall is unsafe.
dropPathClear(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 const p=this.player,distance=Math.hypot(x-p.x,z-p.z),steps=Math.max(1,Math.ceil(distance/.04));
 for(let k=0;k<=steps;k++)if(this.collides(p.x+(x-p.x)*k/steps,p.z+(z-p.z)*k/steps))return false;
 return true;
}
dropSpotFree(item,x,z){
 const footprint=object=>object.kind==='food'?{w:.32,d:.22}:object.kind==='phone'?{w:.16,d:.27}:{w:.13,d:.13},size=footprint(item);
 return this.items.every(other=>{
  if(other.state!=='world'||(other.zone||'level0')!==this.zone||other.placement==='table'||this.zone==='level0'&&this.changed&&other.area!=='room')return true;
  const s=footprint(other);
  return Math.abs(x-other.x)>=(size.w+s.w)/2+.04||Math.abs(z-other.z)>=(size.d+s.d)/2+.04;
 });
}
drop(id){
 if(this.mode!=='playing'||this.phoneOpenId)return;
 const item=id===undefined?this.inventory('food')[0]:this.items.find(i=>i.id===id&&i.state==='inventory');
 if(!item){this.events.push(id===undefined?'没有食物可以放下了。':'这件物品不在背包里。');return}
 const p=this.player;let spot=null;
 // Prefer straight ahead. If crowded by a wall or table, find a reachable spot
 // alongside the feet rather than pushing the object through the obstacle.
 for(const distance of [.7,.5,.3,.15,0]){
  for(const angle of [0,-Math.PI/4,Math.PI/4,-Math.PI/2,Math.PI/2]){
   const x=p.x+Math.sin(p.yaw+angle)*distance,z=p.z-Math.cos(p.yaw+angle)*distance;
   if(this.dropPathClear(x,z)&&this.dropSpotFree(item,x,z)){spot={x,z};break}
  }
  if(spot)break;
 }
 if(!spot){this.events.push('这里没有可以放下物品的空地。');return}
 Object.assign(item,{state:'world',gridX:null,gridY:null,...spot,y:.005,placement:'ground',zone:this.zone,area:this.roomContains(spot.x,spot.z)||this.changed?'room':'maze'});
 if(this.chargingPhoneId===id)this.disconnectCharger();
 this.events.push(item.kind==='phone'?'放下了手机。它会留在原地。':item.kind==='food'?`放下了食物 ${item.id.split('-').at(-1)}。它会留在原地。`:'放下了饮用水。它会留在原地。');return item.id;
}
consume(kind,id){
 if(this.mode!=='playing'||this.phoneOpenId||!['food','water'].includes(kind))return;
 const item=id===undefined?this.inventory(kind)[0]:this.items.find(i=>i.id===id&&i.kind===kind&&i.state==='inventory');
 if(!item){this.events.push(kind==='water'?'没有饮用水。':'没有食物了。');return}
 if(kind==='food'&&this.food>98){this.events.push('现在还不饿。');return}
 if(kind==='water'&&this.hydration>98){this.events.push('现在还不渴。');return}
 Object.assign(item,{state:'consumed',gridX:null,gridY:null});
 if(kind==='food'){this.food=Math.min(100,this.food+28);this.hydration=Math.max(0,this.hydration-2);this.events.push('吃完了一份干粮。有些口干。')}else{this.hydration=Math.min(100,this.hydration+38);this.events.push('喝完了一小瓶水。')}return item.id;
}
pause(){this.cancelInteraction();if(this.mode==='playing')this.mode='paused';this.closePhone()}resume(){if(this.mode==='paused'||this.mode==='note')this.mode='playing'}
snapshot(){return{zone:this.zone,hub:{...this.hub},level1:{...this.level1,sectors:this.level1.sectors.map(s=>({...s})),readClues:[...this.level1.readClues],danger:JSON.parse(JSON.stringify(this.level1.danger)),crates:this.level1.crates.map(c=>({...c}))},abnormalWall:{...this.abnormalWall},seed:this.maze.seed,mode:this.mode,inventoryOpen:this.inventoryOpen,phoneOpenId:this.phoneOpenId,chargingPhoneId:this.chargingPhoneId,player:{...this.player},food:this.food,hydration:this.hydration,elapsed:this.elapsed,door:this.door,doorTarget:this.doorTarget,changed:this.changed,loops:this.loops,foldState:this.foldState,foldPending:this.foldPending,items:this.items.map(i=>({...i}))}}
}
