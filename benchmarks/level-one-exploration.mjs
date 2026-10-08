import {Game} from '../dist/game.js';
import {LEVEL_ONE_AREAS,levelOneCollides} from '../dist/level-one-layout.js';
const step=.5,cols=73,rows=205,cache=new Map();
const clear=(a,b)=>{const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.08));for(let i=0;i<=n;i++)if(levelOneCollides(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,.22))return false;return true};
function path(area,from,to){
 let nav=cache.get(area.id);if(!nav){const points=Array.from({length:cols*rows},(_,i)=>({x:-18+(i%cols)*step,z:area.bounds.minZ+Math.floor(i/cols)*step})),free=points.map(p=>!levelOneCollides(p.x,p.z,.22));nav={points,free};cache.set(area.id,nav)}
 const nearest=p=>nav.points.map((q,i)=>({i,d:Math.hypot(q.x-p.x,q.z-p.z)})).filter(c=>nav.free[c.i]&&c.d<2).sort((a,b)=>a.d-b.d).find(c=>clear(p,nav.points[c.i]))?.i;
 const start=nearest(from),goal=nearest(to);if(start===undefined||goal===undefined)throw Error('No stance');
 const heap=[];const push=(i,f)=>{let n=heap.length;heap.push({i,f});while(n){const p=(n-1)>>1;if(heap[p].f<=f)break;heap[n]=heap[p];n=p}heap[n]={i,f}};const pop=()=>{const h=heap[0],l=heap.pop();if(heap.length){let n=0;while(n*2+1<heap.length){let c=n*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=l.f)break;heap[n]=heap[c];n=c}heap[n]=l}return h};
 const d=new Float64Array(nav.points.length).fill(Infinity),par=new Int32Array(d.length).fill(-1),closed=new Uint8Array(d.length);d[start]=0;push(start,0);
 while(heap.length){const{i}=pop();if(closed[i])continue;closed[i]=1;if(i===goal)break;const a=nav.points[i],x=i%cols,z=Math.floor(i/cols);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const xx=x+dx,zz=z+dz;if(xx<0||xx>=cols||zz<0||zz>=rows)continue;const j=zz*cols+xx;if(!nav.free[j]||closed[j]||!clear(a,nav.points[j]))continue;const dd=d[i]+Math.hypot(dx,dz)*step;if(dd<d[j]){d[j]=dd;par[j]=i;const q=nav.points[j];push(j,dd+Math.hypot(q.x-to.x,q.z-to.z))}}}
 if(!Number.isFinite(d[goal]))throw Error('Disconnected target');const raw=[to];for(let i=goal;i>=0;i=par[i])raw.unshift(nav.points[i]);raw.unshift(from);const out=[];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!clear(raw[i],raw[j]))j--;out.push(raw[j]);i=j}return out;
}
const results=[];
for(const sprint of [false,true]){
 const g=new Game(7);g.start();g.transitionZone('level1');g.food=62;g.hydration=26;g.phone('phone-1').battery=37;let travelled=0,blocked=false;
 function walk(area,target){for(const p of path(area,g.player,target)){let guard=0;while(g.mode==='playing'&&Math.hypot(p.x-g.player.x,p.z-g.player.z)>1e-6){if(guard++>4000){blocked=true;return}const old={...g.player},d=Math.hypot(p.x-old.x,p.z-old.z),speed=sprint&&g.hydration>15?3.25:2.05;g.player.yaw=Math.atan2(p.x-old.x,-(p.z-old.z));g.update(Math.min(.025,d/speed),{forward:1,sprint});travelled+=Math.hypot(g.player.x-old.x,g.player.z-old.z)}}}
 outer:for(const area of LEVEL_ONE_AREAS){
  walk(area,area.spawn);const c=area.clues[0];walk(area,{x:c.x,z:c.z+.8});g.interact();
  for(const [i,loop]of area.loops.entries()){
   for(const p of loop.safeRoute.slice(0,2))walk(area,p);
   const crate=area.crates[i],side=Math.sign(loop.safeRoute[0].x);walk(area,{x:crate.x+side*1.2,z:crate.z});g.interact();
   if(g.hydration<70&&g.inventory('water').length)g.consume('water',g.inventory('water')[0].id);if(g.food<50&&g.inventory('food').length)g.consume('food',g.inventory('food')[0].id);
   for(const p of loop.safeRoute.slice(2))walk(area,p);
   if(g.mode!=='playing'||blocked)break outer;
  }
  walk(area,area.exit);if(g.mode!=='playing'||blocked)break;
 }
 results.push({movement:sprint?'sprint':'walk',outcome:g.mode,blocked,activeSeconds:g.level1.elapsed,travelledMetres:travelled,notesRead:g.level1.readClues.length,cratesOpened:g.level1.crates.filter(c=>c.opened).length,arrival:{food:62,hydration:26,battery:37},end:{food:g.food,hydration:g.hydration,battery:g.phone('phone-1').battery},consumed:g.items.filter(i=>i.state==='consumed').map(i=>i.id),idleOrReadingDwellSeconds:0,extraSectorRepeats:0});
}
console.log(JSON.stringify({method:'Collision-planned continuous all-notes/all-supply-branches route. Real simulation and danger, no coordinate writes after explicit arrival fixture, no idle/reading dwell, no arbitrary repeats or drop/retrieve stress. This is scripted coverage, not human first-play timing.',results},null,2));
