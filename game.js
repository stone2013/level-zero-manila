// Pure simulation: metres, +x east, +z south, yaw 0 faces north.
export const CELL=5,SIZE=11,RADIUS=.22;
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
reset(seed){this.maze=makeMaze(seed);this.player={x:SIZE*CELL/2,z:SIZE*CELL/2,yaw:0,pitch:0};this.mode='menu';this.inventoryOpen=false;this.elapsed=0;this.food=100;this.hydration=100;this.door=0;this.doorTarget=0;this.changed=false;this.entered=false;this.loops=0;this.foldState=0;this.foldPending=false;this.approach=0;this.noteRead=false;this.exitAnnounced=false;this.events=[];this.items=Array.from({length:4},(_,i)=>({id:`food-${i+1}`,kind:'food',state:'inventory',gridX:i%4,gridY:Math.floor(i/4),x:0,y:.005,z:0,placement:'ground',area:'maze'}));this.items.push(...Array.from({length:2},(_,i)=>({id:`water-${i+1}`,kind:'water',state:'world',gridX:null,gridY:null,x:this.maze.doorX+4.25,y:.68,z:this.maze.doorZ-.8+i*.5,placement:'table',area:'room'})));this.obstacles=[{x:this.maze.doorX+4.4,z:this.maze.doorZ+.5,w:.8,d:2.7}];this.walls=[];const add=(x,z,w,d)=>this.walls.push({x,z,w,d});for(const c of this.maze.cells){const x=c.x*CELL,z=c.z*CELL;if(!c.open[0])add(x+2.5,z,5,.16);if(!c.open[3])add(x,z+2.5,.16,5);if(c.x===SIZE-1&&c.z!==this.maze.cells[this.maze.goal].z)add(x+5,z+2.5,.16,5);if(c.z===SIZE-1)add(x+2.5,z+5,5,.16)}for(const f of this.maze.folds)add(f.px,f.z*CELL+2.5,2.6,.16);const dx=this.maze.doorX,dz=this.maze.doorZ;add(dx,dz-1.7,.16,1.6);add(dx,dz+1.7,.16,1.6);add(dx+3,dz-2.5,6,.16);add(dx+3,dz+2.5,6,.16);add(dx+6,dz,.16,5);return this}
start(){this.mode='playing';this.events.push('你带了食物，却忘了水。打开背包，可以放下一份记住来路。')}
inRoom(){return this.player.x>this.maze.doorX+RADIUS+.1}
inventory(kind){return this.items.filter(i=>i.state==='inventory'&&(kind===undefined||i.kind===kind))}
itemSize(item){if(typeof item==='string')item=this.items.find(i=>i.id===item);return item?.kind==='water'?{w:1,h:2}:item?.kind==='food'?{w:1,h:1}:null}
// Grid coordinates belong to the object, not its array index. Failed moves never
// overwrite the old location, so a cancelled drag needs no simulation rollback.
canPlaceItem(id,x,y){
 const item=this.items.find(i=>i.id===id),size=this.itemSize(item);
 if(!size||item.state==='consumed'||!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x+size.w>4||y+size.h>4)return false;
 return this.inventory().every(other=>{if(other.id===id)return true;const s=this.itemSize(other);return s&&Number.isInteger(other.gridX)&&Number.isInteger(other.gridY)&&(x+size.w<=other.gridX||x>=other.gridX+s.w||y+size.h<=other.gridY||y>=other.gridY+s.h)});
}
moveInventoryItem(id,x,y){
 if(this.mode!=='playing')return false;
 const item=this.items.find(i=>i.id===id&&i.state==='inventory');
 if(!item||!this.canPlaceItem(id,x,y))return false;
 item.gridX=x;item.gridY=y;return true;
}
firstInventorySlot(id){for(let y=0;y<4;y++)for(let x=0;x<4;x++)if(this.canPlaceItem(id,x,y))return{x,y};return null}
arrangeInventory(){
 if(this.mode!=='playing')return false;
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
openInventory(){if(this.mode!=='playing')return false;this.inventoryOpen=true;return true}
closeInventory(){const wasOpen=this.inventoryOpen;this.inventoryOpen=false;return wasOpen}

collides(x,z){const m=this.maze,r=RADIUS;if(this.changed&&x<m.doorX){if(x<m.doorX-9.5||Math.abs(z-m.doorZ)>1.2-r)return true;return this.doorCollision(x,z)}if(x<r||z<r||z>SIZE*CELL-r)return true;if(x>m.doorX&&((x>m.doorX+6-r)||Math.abs(z-m.doorZ)>2.5-r))return true;if([...this.walls,...this.obstacles].some(w=>Math.abs(x-w.x)<w.w/2+r&&Math.abs(z-w.z)<w.d/2+r))return true;return this.doorCollision(x,z)}
doorCollision(x,z){const m=this.maze; // A hinged solid leaf, tested in its local frame.
const a=this.door*Math.PI/2,dx=x-m.doorX,dz=z-(m.doorZ-.8),lx=Math.cos(a)*dx-Math.sin(a)*dz,lz=Math.sin(a)*dx+Math.cos(a)*dz;return Math.abs(lx)<.055+RADIUS&&lz> -RADIUS&&lz<1.6+RADIUS}
// A seam is a rigid translation of two matching, wall-occluded vestibules.
// Position, residual movement, yaw and pitch use the same frame; items never move.
activeFolds(){const f=this.maze.folds;return this.foldState===0?[f[0],f[1]]:[f[0],f[2]]}
tryFold(oldX,oldZ){
 if(this.changed)return false;
 const p=this.player,[a,b]=this.activeFolds();
 for(const [from,to] of [[a,b],[b,a]]){
  if(!((oldX<from.px&&p.x>=from.px)||(oldX>from.px&&p.x<=from.px)))continue;
  const t=(from.px-oldX)/(p.x-oldX),z=oldZ+(p.z-oldZ)*t;
  if(z<=from.z*CELL+RADIUS||z>=from.z*CELL+2.5-.08-RADIUS)continue;
  const x=p.x+(to.px-from.px),nz=p.z+(to.pz-from.pz);
  if(this.collides(x,nz))continue;
  p.x=x+(p.x===from.px?Math.sign(p.x-oldX)*1e-7:0);p.z=nz;this.loops++;if(this.foldState===0)this.foldPending=true;
  this.events.push('灯管的低鸣接上了刚才的节奏。');return true;
 }
 return false;
}
settleFold(){
 if(!this.foldPending||this.foldState||this.changed)return;
 const pair=this.activeFolds(),p=this.player;
 // The connection changes only after BOTH full seam apertures are behind walls.
 // A nearby or visible seam remains stable, even if the player waits or looks back.
 if(pair.some(f=>Math.hypot(p.x-f.px,p.z-f.pz)<4.5||[.35,1.15,2.1].some(z=>this.lineClear(f.px,f.z*CELL+z))))return;
 this.foldState=1;this.foldPending=false;this.events.push('身后传来一声很轻的灯管响。');
}
move(dx,dz){if(this.inventoryOpen)return;const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.09));for(let k=0;k<steps;k++){const p=this.player,oldX=p.x,oldZ=p.z;const x=p.x+dx/steps,z=p.z+dz/steps;if(!this.collides(x,p.z))p.x=x;if(!this.collides(p.x,z))p.z=z;this.tryFold(oldX,oldZ);this.settleFold();if(this.changed&&p.x<this.maze.doorX-8.3){this.mode='won';this.events.push('exit');break}}}
update(dt,input={}){if(this.mode!=='playing'||this.inventoryOpen)return;dt=Math.min(.05,Math.max(0,dt));this.elapsed+=dt;const speed=input.sprint&&this.hydration>15?3.25:2.05;let f=input.forward||0,s=input.strafe||0,n=Math.max(1,Math.hypot(f,s));f/=n;s/=n;this.move((Math.sin(this.player.yaw)*f+Math.cos(this.player.yaw)*s)*speed*dt,(-Math.cos(this.player.yaw)*f+Math.sin(this.player.yaw)*s)*speed*dt);this.food=Math.max(0,this.food-dt*(input.sprint?.026:.014));this.hydration=Math.max(0,this.hydration-dt*(input.sprint?.07:.035));if(this.hydration<=0||this.food<=0){this.mode='lost';this.events.push('lost');return}if(this.inRoom()&&!this.entered){this.entered=true;this.events.push('木门外，传来很轻的脚步声。先把门关好。')}if(this.entered&&!this.changed)this.approach+=dt;if(this.door!==this.doorTarget){const old=this.door;let proposed=this.door+Math.sign(this.doorTarget-this.door)*dt*1.5;this.door=Math.max(0,Math.min(1,proposed));if(this.doorTarget===0&&this.doorCollision(this.player.x,this.player.z)){this.door=old;this.doorTarget=1;this.events.push('你挡住了门。再往房间里走一点。')}}if(this.entered&&!this.changed&&this.door===0&&this.doorTarget===0&&this.inRoom()){this.changed=true;this.events.push('门完全关上了。脚步声消失。')} }
nearDoor(){return Math.hypot(this.player.x-this.maze.doorX,this.player.z-this.maze.doorZ)<2.35}
nearNote(){return this.inRoom()&&Math.hypot(this.player.x-(this.maze.doorX+4.35),this.player.z-(this.maze.doorZ+1.4))<1.6}
lineClear(x,z){const p=this.player,dist=Math.hypot(x-p.x,z-p.z),steps=Math.ceil(dist/.1);for(let k=1;k<steps;k++){const qx=p.x+(x-p.x)*k/steps,qz=p.z+(z-p.z)*k/steps;if((!this.changed||qx>=this.maze.doorX)&&this.walls.some(w=>Math.abs(qx-w.x)<w.w/2&&Math.abs(qz-w.z)<w.d/2)||this.changed&&qx<this.maze.doorX&&(qx<this.maze.doorX-9.5||Math.abs(qz-this.maze.doorZ)>1.2)||this.doorCollision(qx,qz))return false}return true}
nearestItem(){return this.items.filter(i=>i.state==='world'&&(this.changed?i.area==='room':true)).filter(i=>Math.hypot(i.x-this.player.x,i.z-this.player.z)<1.6&&this.lineClear(i.x,i.z)).sort((a,b)=>Math.hypot(a.x-this.player.x,a.z-this.player.z)-Math.hypot(b.x-this.player.x,b.z-this.player.z))[0]}
pickupItem(id){
 if(this.mode!=='playing'||this.inventoryOpen)return;
 const item=this.items.find(i=>i.id===id&&i.state==='world');
 if(!item||(this.changed&&item.area!=='room')||Math.hypot(item.x-this.player.x,item.z-this.player.z)>=1.6||!this.lineClear(item.x,item.z))return;
 const slot=this.firstInventorySlot(id);
 if(!slot){this.events.push('背包没有足够的连续空格。');return}
 Object.assign(item,{state:'inventory',gridX:slot.x,gridY:slot.y});
 this.events.push(item.kind==='food'?`拾回了食物 ${item.id.slice(-1)}。`:'找到一小瓶饮用水。');return item.id;
}
interact(){if(this.mode!=='playing'||this.inventoryOpen)return;const item=this.nearestItem();if(item)return this.pickupItem(item.id)?'pickup':null;if(this.nearNote()){this.noteRead=true;this.mode='note';return 'note'}if(this.nearDoor()){this.doorTarget=this.doorTarget>.5?0:1;return 'door'}return null}
// Sample the entire route using the existing solid collision geometry, including
// furniture and the live door leaf. An empty endpoint beyond a thin wall is unsafe.
dropPathClear(x,z){
 if(!Number.isFinite(x)||!Number.isFinite(z))return false;
 const p=this.player,distance=Math.hypot(x-p.x,z-p.z),steps=Math.max(1,Math.ceil(distance/.04));
 for(let k=0;k<=steps;k++)if(this.collides(p.x+(x-p.x)*k/steps,p.z+(z-p.z)*k/steps))return false;
 return true;
}
dropSpotFree(item,x,z){
 const footprint=object=>object.kind==='food'?{w:.32,d:.22}:{w:.13,d:.13},size=footprint(item);
 return this.items.every(other=>{
  if(other.state!=='world'||other.placement==='table'||this.changed&&other.area!=='room')return true;
  const s=footprint(other);
  return Math.abs(x-other.x)>=(size.w+s.w)/2+.04||Math.abs(z-other.z)>=(size.d+s.d)/2+.04;
 });
}
drop(id){
 if(this.mode!=='playing')return;
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
 Object.assign(item,{state:'world',gridX:null,gridY:null,...spot,y:.005,placement:'ground',area:spot.x>this.maze.doorX||this.changed?'room':'maze'});
 this.events.push(item.kind==='food'?`放下了食物 ${item.id.slice(-1)}。它会留在原地。`:'放下了饮用水。它会留在原地。');return item.id;
}
consume(kind,id){
 if(this.mode!=='playing'||!['food','water'].includes(kind))return;
 const item=id===undefined?this.inventory(kind)[0]:this.items.find(i=>i.id===id&&i.kind===kind&&i.state==='inventory');
 if(!item){this.events.push(kind==='water'?'没有饮用水。':'没有食物了。');return}
 if(kind==='food'&&this.food>98){this.events.push('现在还不饿。');return}
 if(kind==='water'&&this.hydration>98){this.events.push('现在还不渴。');return}
 Object.assign(item,{state:'consumed',gridX:null,gridY:null});
 if(kind==='food'){this.food=Math.min(100,this.food+28);this.hydration=Math.max(0,this.hydration-2);this.events.push('吃完了一份干粮。有些口干。')}else{this.hydration=Math.min(100,this.hydration+38);this.events.push('喝完了一小瓶水。')}return item.id;
}
pause(){if(this.mode==='playing')this.mode='paused'}resume(){if(this.mode==='paused'||this.mode==='note')this.mode='playing'}
snapshot(){return{seed:this.maze.seed,mode:this.mode,inventoryOpen:this.inventoryOpen,player:{...this.player},food:this.food,hydration:this.hydration,elapsed:this.elapsed,door:this.door,doorTarget:this.doorTarget,changed:this.changed,loops:this.loops,foldState:this.foldState,foldPending:this.foldPending,items:this.items.map(i=>({...i}))}}
}
