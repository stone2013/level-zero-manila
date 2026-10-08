// Level 1's single blackout presence. Navigation always samples live collision;
// neither the decorative renderer nor a remembered map can open a wall for it.
const NAVIGATION=new WeakMap();
const STEP=.5,MIN_X=-8,MIN_Z=-44,COLS=33,ROWS=101,RADIUS=.25,SPEED=1.6;
const CHECKPOINTS=[[-7.7,-2.5,-29.6,-25.4],[-2,2,2,5.6],[5.3,7.5,-21,-18.5]];
const SHELTERS=[...CHECKPOINTS,[-5.75,-4.25,-37.75,-29.4],[-5.75,-1.85,-37.75,-36.25]];
export function levelOneSheltered(x,z){return SHELTERS.some(([a,b,c,d])=>x>=a&&x<=b&&z>=c&&z<=d)}
const shelteredBody=(x,z)=>SHELTERS.some(([a,b,c,d])=>x>=a-RADIUS&&x<=b+RADIUS&&z>=c-RADIUS&&z<=d+RADIUS);
export function resetLevelOneDanger(){return{active:false,x:0,z:-12,yaw:0,proximity:0,contact:0,grace:2,checkpoint:{x:0,z:4.5,yaw:0},phase:'lit',path:[],routeTimer:0,spawnAttempted:false}}
const point=i=>({x:MIN_X+(i%COLS)*STEP,z:MIN_Z+Math.floor(i/COLS)*STEP});
function free(game,x,z,radius=RADIUS){return x>=MIN_X&&x<=8&&z>=MIN_Z&&z<=6&&!shelteredBody(x,z)&&!game.collides(x,z,{radius,ignoreEntities:true})}
function segment(game,a,b,radius=RADIUS+.04){const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/.08));for(let k=0;k<=n;k++)if(!free(game,a.x+(b.x-a.x)*k/n,a.z+(b.z-a.z)*k/n,radius))return false;return true}
function nearest(nodes,p,game){
 // Try short local connections first. Testing every progressively nearer node
 // from the far map edge would perform hundreds of unnecessary wall traces.
 const choices=[];for(let i=0;i<nodes.length;i++)if(nodes[i]){const q=point(i);choices.push({i,d:(q.x-p.x)**2+(q.z-p.z)**2})}
 choices.sort((a,b)=>a.d-b.d||a.i-b.i);
 for(const {i}of choices)if(segment(game,p,point(i)))return i;return -1;
}
function navigation(game,d,spawn=false){
 // Shelters are a hard exclusion. A sheltered player cannot be selected as a
 // chase target, and the existing presence waits outside until they leave.
 let target=game.player;if(levelOneSheltered(target.x,target.z)){if(!spawn){d.path=[];return}target={x:0,z:0}}
 // Level geometry is immutable for this run. Cache its graph per game and
 // reset-state identity; every actual movement still checks live collision.
 let nav=NAVIGATION.get(game);
 if(!nav||nav.owner!==d||nav.collides!==game.collides){const nodes=new Uint8Array(COLS*ROWS);for(let i=0;i<nodes.length;i++){const p=point(i);nodes[i]=free(game,p.x,p.z,RADIUS+.04)?1:0}nav={owner:d,collides:game.collides,nodes,edges:[]};NAVIGATION.set(game,nav)}
 const {nodes,edges}=nav;
 const root=nearest(nodes,target,game);if(root<0){d.path=[];return}
 const destination=spawn?-1:nearest(nodes,d,game);
 const parents=new Int32Array(nodes.length).fill(-2),queue=[root];parents[root]=-1;
 for(let k=0;k<queue.length;k++){
  const i=queue[k],x=i%COLS,z=Math.floor(i/COLS);if(i===destination)break;
  if(!edges[i]){edges[i]=[];for(const [dx,dz]of[[0,1],[1,0],[0,-1],[-1,0]]){const nx=x+dx,nz=z+dz;if(nx<0||nx>=COLS||nz<0||nz>=ROWS)continue;const j=nz*COLS+nx;if(nodes[j]&&segment(game,point(i),point(j)))edges[i].push(j)}}
  for(const j of edges[i])if(parents[j]===-2){parents[j]=i;queue.push(j)}
 }
 if(spawn){
  // Choose the nearest valid arrival at least 8m away, deterministically. No
  // chance roll can put a presence behind the player's shoulder.
  const choices=queue.map(i=>({i,q:point(i)})).map(c=>({...c,distance:Math.hypot(c.q.x-game.player.x,c.q.z-game.player.z)})).filter(c=>c.q.z>=-30&&c.distance>8).sort((a,b)=>a.distance-b.distance||a.i-b.i);
  // Prefer a disclosed arrival in the current sightline; a maze divider must
  // not hide an entire introductory encounter. Never reduce reaction distance.
  const pick=(choices.find(c=>game.lineClear(c.q.x,c.q.z))||choices[0])?.i??-1;
  if(pick<0)return;const q=point(pick);d.x=q.x;d.z=q.z;d.active=true;d.grace=2;
 }
 const start=spawn?nearest(nodes,d,game):destination;d.path=[];if(start<0||parents[start]===-2)return;
 for(let i=start;i>=0;i=parents[i])d.path.push(point(i));
 if(segment(game,point(root),target))d.path.push({x:target.x,z:target.z});
 // Skip already-visible waypoints so replanning never pulls the entity back
 // to its nearest grid node in the middle of a stride.
 while(d.path.length>1&&segment(game,d,d.path[1]))d.path.shift();
}
// The renderer calls this behind its loading screen, avoiding a graph-build
// hitch in the first playable blackout. No gameplay state changes survive it.
export function prepareLevelOneDanger(game){
 if(game.zone!=='level1')return;
 const d=game.level1.danger,saved={...d,path:[...d.path]};
 navigation(game,d,true);Object.assign(d,saved);
}
export function updateLevelOneDanger(game,dt){
 if(game.zone!=='level1'||game.mode!=='playing'||game.inventoryOpen||game.phoneOpenId||!Number.isFinite(dt)||dt<=0)return;
 const d=game.level1.danger||(game.level1.danger=resetLevelOneDanger()),phase=game.level1.phase;
 dt=Math.min(.05,dt);
 if(CHECKPOINTS.some(([a,b,c,e])=>game.player.x>=a&&game.player.x<=b&&game.player.z>=c&&game.player.z<=e))d.checkpoint={x:game.player.x,z:game.player.z,yaw:game.player.yaw||0};
 if(d.phase!==phase){
  d.phase=phase;
  if(phase==='warning')game.events.push('灯光正在变暗。黑暗中的东西即将出现；寻找亮着应急灯的安全区域。');
  else if(phase==='dark')game.events.push('停电了。保持移动，或留在应急灯下；不要让它持续靠近。');
  else if(phase==='lit')game.events.push('电力恢复了。黑暗中的东西消失了。');
 }
 if(phase!=='warning'&&phase!=='dark'){d.active=false;d.contact=0;d.proximity=0;d.path=[];d.spawnAttempted=false;d.routeTimer=0;return}
 if(phase==='warning'){d.active=false;d.path=[];d.contact=0;d.proximity=0;d.spawnAttempted=false;return}
 if(!d.active&&!d.spawnAttempted){d.spawnAttempted=true;navigation(game,d,true);d.routeTimer=.25}
 if(!d.active)return;
 // Live geometry changes invalidate occupation too; disappearing is safer
 // than teleporting through a newly closed wall or into a refuge.
 if(!free(game,d.x,d.z)){d.active=false;d.contact=0;d.proximity=0;return}
 if(phase==='dark'){
  d.grace=Math.max(0,d.grace-dt);d.routeTimer-=dt;
  if(d.routeTimer<=0){navigation(game,d);d.routeTimer=.25}
  let travel=SPEED*dt;
  if(d.grace<=0&&!levelOneSheltered(game.player.x,game.player.z))while(travel>0&&d.path.length){const next=d.path[0],dx=next.x-d.x,dz=next.z-d.z,length=Math.hypot(dx,dz);if(length<.001){d.path.shift();continue}const step=Math.min(travel,length),p={x:d.x+dx/length*step,z:d.z+dz/length*step};if(Math.hypot(p.x-game.player.x,p.z-game.player.z)<.58||!segment(game,d,p,RADIUS)){d.path=[];break}d.yaw=Math.atan2(dx,-dz);d.x=p.x;d.z=p.z;travel-=step;if(step===length)d.path.shift()}
 }
 const distance=Math.hypot(d.x-game.player.x,d.z-game.player.z),visible=game.lineClear(d.x,d.z),safe=levelOneSheltered(game.player.x,game.player.z);
 d.proximity=visible&&!safe?Math.max(0,1-distance/7):0;
 if(phase==='dark'&&d.grace<=0&&!safe&&visible&&distance<.65)d.contact+=dt;else d.contact=0;
 if(d.contact>=.7){game.mode='lost';game.level1.failure='entity';game.events.push('level1-entity-caught')}
}
