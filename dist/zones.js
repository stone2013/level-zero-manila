// Shared authoritative layout for renderer and pure simulation. GLB coordinates
// are Y-up: Blender's negative Y corridor extends toward positive Z in the hub.
export const HUB={bounds:{minX:-6,maxX:6,minZ:0,maxZ:6.5},spawn:{x:0,z:6,yaw:0},doors:[-5.25,-3.5,-1.75,0,1.75,3.5,5.25].map((x,i)=>({id:`hub-door-${i+1}`,x,z:0,active:false,label:i===0?'Level 130':`未启用 ${i+1}`})),sideDoor:{id:'hub-level1',x:6,z:3.3,active:true,label:'Level 1'},sealZ:5.3};
export const LEVEL1={spawn:{x:0,z:4.5,yaw:0},regions:[{minX:-8,maxX:8,minZ:-22,maxZ:6},{minX:-2,maxX:2,minZ:-34,maxZ:-22},{minX:-8,maxX:-2,minZ:-30,maxZ:-25},{minX:-1.6,maxX:1.6,minZ:-44,maxZ:-34},{minX:-6,maxX:-4,minZ:-38,maxZ:-30},{minX:-4,maxX:-1.6,minZ:-38,maxZ:-36}],columns:[-4,4].flatMap(x=>[-1,-7,-13,-19].map(z=>({x,z,w:.72,d:.72}))),shelves:[-6.6,6.6].flatMap(x=>[-3,-9,-15].map(z=>({x,z,w:2.16,d:.86}))),walls:[{x:0,z:6,w:16,d:.2},{x:-5,z:-22,w:6,d:.2},{x:5,z:-22,w:6,d:.2},{x:2,z:-28,w:.2,d:12},{x:-2,z:-23.5,w:.2,d:3},{x:-2,z:-32,w:.2,d:4},{x:-5,z:-25,w:6,d:.2},{x:-7,z:-30,w:2,d:.2},{x:-3,z:-30,w:2,d:.2},{x:-8,z:-27.5,w:.2,d:5},{x:1.6,z:-39,w:.2,d:10},{x:-1.6,z:-35,w:.2,d:2},{x:-1.6,z:-41,w:.2,d:6},{x:-6,z:-34,w:.2,d:8},{x:-4,z:-33,w:.2,d:6},{x:-3.8,z:-38,w:4.4,d:.2},{x:-2.8,z:-36,w:2.4,d:.2},{x:0,z:-44,w:3.2,d:.2},{x:-1.8,z:-34,w:.4,d:.2},{x:1.8,z:-34,w:.4,d:.2}],props:[...[-7.5,7.5].map(x=>({x,z:2.25,w:.15,d:.15})),...[[ -3,-8],[5.3,-11],[-6.1,-17]].flatMap(([x,z])=>[{x,z,w:.75,d:.70},{x:x+.6,z:z-.5,w:.55,d:.70}]),{x:-6.4,z:.5,w:1.55,d:.62},{x:-7,z:-29.45,w:1.55,d:.62},{x:-7.3,z:-26,w:.86,d:2.16},{x:-6.8,z:-28.7,w:.55,d:.70},...[-34.75,-37.75,-40.75].map(z=>({x:1.24,z,w:.14,d:.14}))],crates:[{id:'l1-crate-1',x:-5,z:2,kind:'water'},{id:'l1-crate-2',x:6,z:-6,kind:'food'},{id:'l1-crate-3',x:-5,z:-19.5,kind:'water'},{id:'l1-crate-4',x:-6,z:-27,kind:'food'}],baffles:[{x:-2,z:-5,w:12,d:.2},{x:2,z:-11.8,w:12,d:.2},{x:-2,z:-17.8,w:12,d:.2}],endZ:-42.8,lighting:{firstLit:14,lit:28,warning:6,dark:8}};
const inside=(r,x,z)=>x>=r.minX&&x<=r.maxX&&z>=r.minZ&&z<=r.maxZ;
const HUB_OBSTACLES=[...HUB.doors.map(d=>({x:d.x,z:0,w:1.4,d:.3})),{x:5.9,z:3.3,w:.21,d:1.3}];
const LEVEL1_OBSTACLES=[...LEVEL1.baffles,...LEVEL1.columns,...LEVEL1.shelves,...LEVEL1.props,...LEVEL1.walls,...LEVEL1.crates.map(c=>({...c,w:.85,d:.85}))];
export function zoneObstacles(zone){return zone==='level1'?LEVEL1_OBSTACLES:HUB_OBSTACLES}
export function zoneCollides(zone,x,z,r=.22){
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
