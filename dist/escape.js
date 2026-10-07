// A bounded escape road ends at the single existing Manila room. The initial
// blackout relocates that room once; the final approach has no hidden teleport.
export const ESCAPE_TRIGGER_SECONDS=480,ESCAPE_MULTIPLIER=1.5,ESCAPE_SPEED=3.25*ESCAPE_MULTIPLIER;
// Include the player's .22 m radius and one bounded movement substep: solid
// collision can reject that last step before body contact at a tight corner.
// The line-of-sight gate below still prevents grabs through structural walls.
export const MONSTER_RADIUS=1.17,MONSTER_STEP=.08,ESCAPE_CAPTURE_DISTANCE=MONSTER_RADIUS+.22+MONSTER_STEP;
const CELL=5,DIRS=[[0,-1],[1,0],[0,1],[-1,0]],key=(x,z)=>`${x},${z}`;
export function makeEscapeLayout(game){
 let cx=-64,cz=-64;
 const occupied=[game.player,...game.items.filter(i=>i.state==='world')];
 while(occupied.some(p=>Math.abs(p.x-(cx*55+27.5))<150&&Math.abs(p.z-(cz*55+27.5))<150))cx+=4;
 const ox=cx*11,oz=cz*11;
 const cells=Array.from({length:121},(_,i)=>({x:ox+i%11,z:oz+Math.floor(i/11),active:true,open:[false,false,false,false],walls:[]}));
 const route=[[0,0],[1,0]];
 for(let row=0;row<5;row++){const z=1+row*2;for(let k=0;k<9;k++)route.push([row%2?9-k:1+k,z]);if(row<4)route.push([row%2?1:9,z+1])}
 const get=(x,z)=>cells[z*11+x];
 const open=(a,b)=>{const d=DIRS.findIndex(([dx,dz])=>a[0]+dx===b[0]&&a[1]+dz===b[1]);get(...a).open[d]=true;get(...b).open[(d+2)%4]=true};
 for(let i=1;i<route.length;i++)open(route[i-1],route[i]);
 // Dead ends are at most 5 m from their marked junction. They cannot rejoin a
 // later section, turn into accidental shortcuts, or strand the player.
 const branches=[];
 for(let row=0;row<4;row++)for(const x of [3,6]){const a=[x,1+row*2],b=[x,2+row*2];open(a,b);branches.push(b)}
 // Open the road directly into the real room and reserve its entire footprint.
 get(9,9).open[1]=true;
 for(const c of cells)c.open.forEach((v,d)=>{if(!v){const[dx,dz]=DIRS[d];c.walls.push({x:(c.x+.5+dx*.5)*CELL,z:(c.z+.5+dz*.5)*CELL,w:d%2?.16:CELL,d:d%2?CELL:.16,key:`${d%2}:${d===3?c.x-1:c.x},${d===0?c.z-1:c.z}`})}});
 get(10,9).active=false;get(10,9).walls=[];
 cells.push({x:ox+11,z:oz+9,active:false,open:[false,false,false,false],walls:[]});
 const points=route.map(([x,z])=>({x:(ox+x+.5)*CELL,z:(oz+z+.5)*CELL}));
 return {cx,cz,ox,oz,cells,door:{x:(ox+10)*CELL,z:(oz+9.5)*CELL},route:points,branches:branches.map(([x,z])=>({x:ox+x,z:oz+z})),startIndex:4,start:points[4],end:points.at(-1),distance:(points.length-1-4)*CELL,lookup:new Map(cells.map(c=>[key(c.x,c.z),c])),indices:new Map(points.map((p,i)=>[key(Math.floor(p.x/CELL),Math.floor(p.z/CELL)),i]))};
}
export function resetEscape(){return{phase:'idle',triggered:false,time:0,chaseTime:0,layout:null,monster:null,progress:0,navClock:0,nav:[],connection:0,attempt:0}}
export function escapeForced(game){return ['warning','chase','door'].includes(game.escape.phase)}
export function escapeFrozen(game){return ['blackout','loading','seam','seam-loading','caught-animation'].includes(game.escape.phase)}
export function escapeDirection(game){
 const e=game.escape;if(!e.layout||!['warning','chase','door'].includes(e.phase))return null;
 if(e.phase==='door')return {x:game.maze.doorX,z:game.maze.doorZ,label:game.inRoom()?'把门完全关上':'木门就在前面 · 进入后关门'};
 const p=game.player,i=e.layout.indices.get(key(Math.floor(p.x/CELL),Math.floor(p.z/CELL)));
 let target;
 if(i===undefined){let nearest=Infinity;for(const point of e.layout.route){const d=Math.hypot(point.x-p.x,point.z-p.z);if(d<nearest){nearest=d;target=point}}}
 else target=e.layout.route[Math.min(i+1,e.layout.route.length-1)];
 return {...target,label:i===undefined?'短支路 · 返回墙上黑色箭头':'沿墙上黑色箭头逃向木门 · 移动时自动疾跑'};
}
function connectManila(game){
 const e=game.escape;if(e.roomOffset)return;
 const m=game.maze,dx=e.layout.door.x-m.doorX,dz=e.layout.door.z-m.doorZ;
 e.roomOffset={x:dx,z:dz};
 // Preserve identities, consumption, battery and inventory state. Maze drops stay put.
 for(const item of game.items)if(item.state==='world'&&item.area==='room'){item.x+=dx;item.z+=dz}
 for(const wall of game.roomWalls){wall.x+=dx;wall.z+=dz}
 for(const obstacle of game.obstacles){obstacle.x+=dx;obstacle.z+=dz}
 m.doorX+=dx;m.doorZ+=dz;game.world.cache.clear();
}
function setPhase(e,phase){e.phase=phase;e.time=0}
function placeStart(game){const e=game.escape,l=e.layout;Object.assign(game.player,l.start,{yaw:Math.PI/2,pitch:0});e.monster={...l.route[0],yaw:Math.PI/2,clip:'walk',active:true};e.progress=l.startIndex;e.nav=[];e.navClock=0;e.chaseTime=0;e.attempt++;game.pendingFold=null;game.disconnectCharger();}
export function retryEscape(game){if(game.mode!=='caught'||!game.escape.layout)return false;game.mode='playing';game.closeInventory();placeStart(game);setPhase(game.escape,'loading');game.escape.connection++;game.events.push('重新逃生。已用掉的物资不会恢复；也可暂停后重新生成整轮迷宫。');return true}
// Work is bounded by 121 escape cells or the original central maze. Replan at
// most 5 Hz; finish the next cell centre before replanning. Replanning from
// midway through a cell can cut an inside corner and strand a wide entity.
function pathBetween(game,start,target){
 const e=game.escape,l=e.layout,from=key(Math.floor(start.x/CELL),Math.floor(start.z/CELL)),to=key(Math.floor(target.x/CELL),Math.floor(target.z/CELL));
 const allowed=(x,z)=>l.lookup.has(key(x,z));
 const q=[from],parents=new Map([[from,null]]);
 for(let i=0;i<q.length&&i<121;i++){const at=q[i];if(at===to)break;const[x,z]=at.split(',').map(Number),c=game.world.cell(x,z);for(let d=0;d<4;d++){if(!c.open[d])continue;const[dx,dz]=DIRS[d],xx=x+dx,zz=z+dz,k=key(xx,zz);if(allowed(xx,zz)&&!parents.has(k)){parents.set(k,at);q.push(k)}}}
 if(!parents.has(to))return[];
 const out=[];for(let at=to;at&&at!==from;at=parents.get(at)){const[x,z]=at.split(',').map(Number);out.unshift({x:(x+.5)*CELL,z:(z+.5)*CELL})}return out;
}
function monsterMove(game,dt){
 const e=game.escape,m=e.monster;if(!m?.active)return;
 const p=game.player,target=e.phase==='door'&&game.inRoom()?{x:game.maze.doorX-2.5,z:game.maze.doorZ}:p;
 e.navClock-=dt;if(!e.nav.length&&e.navClock<=0){e.nav=pathBetween(game,m,target).slice(0,1);e.navClock=.2}
 const sameCell=Math.floor(m.x/CELL)===Math.floor(target.x/CELL)&&Math.floor(m.z/CELL)===Math.floor(target.z/CELL);
 const to=e.nav[0]||(sameCell?target:null);if(!to)return;
 const dx=to.x-m.x,dz=to.z-m.z,d=Math.hypot(dx,dz);if(d<1e-6){e.nav=[];e.navClock=0;return}
 // Slightly slower than the player's forced run. A warning provides a fair
 // start; short wrong branches cost ground, but never force a trap or warp.
 const move=Math.min(d,4.18*dt),steps=Math.max(1,Math.ceil(move/MONSTER_STEP));m.yaw=Math.atan2(dx,-dz);m.clip='chase_run';
 for(let i=0;i<steps;i++){const x=m.x+dx/d*move/steps,z=m.z+dz/d*move/steps;if(x>=game.maze.doorX-1.25&&e.phase==='door')break;if(game.collides(x,z,{radius:MONSTER_RADIUS,ignoreRender:true}))break;m.x=x;m.z=z}
 if(!game.inRoom()&&Math.hypot(m.x-p.x,m.z-p.z)<ESCAPE_CAPTURE_DISTANCE&&game.lineClear(m.x,m.z)){m.clip='jumpscare';setPhase(e,'caught-animation');game.events.push('它追上来了。')}
}
export function updateEscape(game,dt){
 const e=game.escape;
 if(e.phase==='idle'){
  if(game.foundManila||game.entered||game.inRoom()||game.changed){e.phase='suppressed';return}
  if(game.elapsed+1e-7<ESCAPE_TRIGGER_SECONDS)return;
  e.triggered=true;setPhase(e,'flicker');game.events.push('灯声变了。别停下，留意亮着的方向。');return;
 }
 if(['flicker','blackout'].includes(e.phase)&&(game.foundManila||game.entered||game.inRoom()||game.changed)){setPhase(e,'suppressed');game.events.push('木门仍在这里。先进房间，把门关上。');return}
 if(['suppressed','finished','caught'].includes(e.phase))return;
 e.time+=dt;
 if(e.phase==='flicker'&&e.time>=2.4){setPhase(e,'blackout');return}
 if(e.phase==='blackout'&&e.time>=.85){e.layout??=makeEscapeLayout(game);game.world.escapeLayout=e.layout;connectManila(game);placeStart(game);e.connection++;setPhase(e,'loading');return}
 if(e.phase==='loading'&&(!game.escapeViewReady||game.escapeViewReady())){setPhase(e,'warning');game.events.push('身后有东西。沿墙上黑色箭头跑！移动时速度与消耗为快走的 1.5 倍。');return}
 if(e.phase==='warning'){if(e.time>=3.2)setPhase(e,'chase');return}
 if(e.phase==='caught-animation'){if(e.time>=2.6){setPhase(e,'caught');game.mode='caught'}return}
 if(['chase','door'].includes(e.phase)){
  e.chaseTime+=dt;if(game.changed){e.monster.active=false;setPhase(e,'finished');return}
  if(e.phase==='chase'){
   const i=e.layout.indices.get(key(Math.floor(game.player.x/CELL),Math.floor(game.player.z/CELL)));if(i!==undefined)e.progress=Math.max(e.progress,i);
   if(i===e.layout.route.length-1){setPhase(e,'door');game.events.push('木门！进去后手动把门完全关上。')}
  }
  monsterMove(game,dt);
 }
}
export function escapeDarkness(game){const e=game.escape;if(['blackout','loading','seam','seam-loading'].includes(e.phase))return 1;if(e.phase==='flicker')return e.time<.5?.08:e.time<1.2?.48:e.time<1.8?.14:.65;return 0}
