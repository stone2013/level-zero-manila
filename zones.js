import {LEVEL_ONE_AREAS,LEVEL_ONE_CRATES,LEVEL_ONE_OBSTACLES,LEVEL_ONE_EXIT,levelOneCollides} from './level-one-layout.js';
// Shared authoritative layout for renderer and pure simulation. GLB coordinates
// are Y-up: Blender's negative Y corridor extends toward positive Z in the hub.
export const HUB={bounds:{minX:-6,maxX:6,minZ:0,maxZ:6.5},spawn:{x:0,z:6,yaw:0},doors:[-5.25,-3.5,-1.75,0,1.75,3.5,5.25].map((x,i)=>({id:`hub-door-${i+1}`,x,z:0,active:false,label:i===0?'Level 130':`未启用 ${i+1}`})),sideDoor:{id:'hub-level1',x:6,z:3.3,active:true,label:'Level 1'},sealZ:5.3};
export const LEVEL1={spawn:LEVEL_ONE_AREAS[0].spawn,areas:LEVEL_ONE_AREAS,regions:LEVEL_ONE_AREAS.flatMap(a=>a.regions),walls:LEVEL_ONE_AREAS.flatMap(a=>a.walls),props:LEVEL_ONE_AREAS.flatMap(a=>a.props),crates:LEVEL_ONE_CRATES,columns:[],shelves:[],baffles:[],endZ:LEVEL_ONE_EXIT.z,lighting:{firstLit:14,lit:28,warning:6,dark:8}};
const inside=(r,x,z)=>x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ;
const HUB_OBSTACLES=[...HUB.doors.map(d=>({x:d.x,z:0,w:1.4,d:.3})),{x:5.9,z:3.3,w:.21,d:1.3}];
const LEVEL1_OBSTACLES=LEVEL_ONE_OBSTACLES;
export function zoneObstacles(zone){return zone==='level1'?LEVEL1_OBSTACLES:HUB_OBSTACLES}
export function zoneCollides(zone,x,z,r=.22){
 if(zone==='level1')return levelOneCollides(x,z,r);
 const regions=zone==='hub'?[{...HUB.bounds,maxZ:6.4}]:LEVEL1.regions;
 // Full circle probes permit walking across contiguous room seams, but reject
 // protruding into outer walls and concave corners.
 for(let i=0;i<16;i++){const a=i*Math.PI/8;if(!regions.some(b=>inside(b,x+Math.cos(a)*r,z+Math.sin(a)*r)))return true}
 return zoneObstacles(zone).some(o=>Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r);
}
export function abnormalWallFor(maze){
 const cells=maze.cells.slice().sort((a,b)=>maze.dist[a.z*11+a.x]-maze.dist[b.z*11+b.x]);
 for(const c of cells){const d=c.open.findIndex(v=>!v);if(d<0)continue;const [dx,dz]=[[0,-1],[1,0],[0,1],[-1,0]][d];return{x:(c.x+.5)*5+dx*2.4,z:(c.z+.5)*5+dz*2.4,normalX:-dx,normalZ:-dz,hold:0}}
}

// A shorter introductory cycle teaches the hazard before the first exit.
export function levelOneLightingAt(elapsed){
 const {firstLit,lit,warning,dark}=LEVEL1.lighting;
 const first=firstLit+warning+dark;
 const t=elapsed<first?Math.max(0,elapsed):(elapsed-first)%(lit+warning+dark);
 const light=elapsed<first?firstLit:lit;
 return t<light?'lit':t<light+warning?'warning':'dark';
}
