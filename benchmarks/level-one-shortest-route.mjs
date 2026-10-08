import {LEVEL_ONE_AREAS,levelOneCollides} from '../dist/level-one-layout.js';
import {performance} from 'node:perf_hooks';
const startTime=performance.now(),step=.5,minX=-18,minZ=-606,cols=73,rows=1225;
const point=i=>({x:minX+(i%cols)*step,z:minZ+Math.floor(i/cols)*step});
const index=p=>Math.round((p.z-minZ)/step)*cols+Math.round((p.x-minX)/step);
const start=index(LEVEL_ONE_AREAS[0].spawn),goal=index(LEVEL_ONE_AREAS.at(-1).exit),finish=point(goal);
const allowed=new Uint8Array(cols*rows);for(let i=0;i<allowed.length;i++){const p=point(i);allowed[i]=!levelOneCollides(p.x,p.z,.22)}
function clear(a,b){const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.075));for(let k=0;k<=n;k++)if(levelOneCollides(a.x+(b.x-a.x)*k/n,a.z+(b.z-a.z)*k/n,.22))return false;return true}
const heap=[];function push(i,f){let n=heap.length;heap.push({i,f});while(n){const p=(n-1)>>1;if(heap[p].f<=f)break;heap[n]=heap[p];n=p}heap[n]={i,f}}
function pop(){const head=heap[0],last=heap.pop();if(heap.length){let n=0;while(n*2+1<heap.length){let c=n*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(heap[c].f>=last.f)break;heap[n]=heap[c];n=c}heap[n]=last}return head}
const distance=new Float64Array(allowed.length).fill(Infinity),parent=new Int32Array(allowed.length).fill(-1),closed=new Uint8Array(allowed.length);distance[start]=0;push(start,0);let expanded=0;
while(heap.length){const{i}=pop();if(closed[i])continue;closed[i]=1;expanded++;if(i===goal)break;const a=point(i),cx=i%cols,cz=Math.floor(i/cols);for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dz)continue;const x=cx+dx,z=cz+dz;if(x<0||x>=cols||z<0||z>=rows)continue;const j=z*cols+x;if(!allowed[j]||closed[j])continue;const b=point(j);if(!clear(a,b))continue;const d=distance[i]+Math.hypot(dx,dz)*step;if(d<distance[j]){distance[j]=d;parent[j]=i;push(j,d+Math.hypot(b.x-finish.x,b.z-finish.z))}}}
if(!Number.isFinite(distance[goal]))throw Error('No route');const raw=[];for(let i=goal;i>=0;i=parent[i])raw.unshift(point(i));const route=[raw[0]];for(let i=0;i<raw.length-1;){let j=raw.length-1;while(j>i+1&&!clear(raw[i],raw[j]))j--;route.push(raw[j]);i=j}
const length=route.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-route[i].x,p.z-route[i].z),0);
console.log(JSON.stringify({method:'Independent whole-level 0.5m eight-neighbour A*, radius0.22, sampled segment clearance0.075m; greedy visibility simplification. Grid-optimal, not an exact continuous-space proof.',expanded,gridDistance:distance[goal],smoothedDistance:length,walkSeconds:length/2.05,sprintSeconds:length/3.25,geometricLongitudinalLowerBound:Math.abs(finish.z-point(start).z),computationMs:performance.now()-startTime,route},null,2));
