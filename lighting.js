// Build-time diffuse lighting only. No render-loop ray casts, real-time lamp lights,
// shadow maps, light textures, post-processing, or simulation RNG consumption.
export const BAKE=Object.freeze({radius:9,cellSize:5,samples:4,power:5.4,
 wallAmbient:.43,floorAmbient:.34,ceilingAmbient:.40,cacheLimit:24000,
 floorMin:.27,wallMin:.32,ceilingMin:.35,max:.86});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(n){n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return((n^(n>>>16))>>>0)/4294967295}
export function seededLamps(points,seed,height=3.6){
 return points.map(p=>{const key=(seed>>>0)^Math.imul(Math.round(p.x*100),73856093)^Math.imul(Math.round(p.z*100),19349663),t=hash(key^0x6d2b79f5);
  return Object.freeze({...p,y:height-.132,intensity:.92+.16*hash(key),color:Object.freeze([1,.977+.018*t,.916+.060*t])});
 });
}
export function segmentHitsBox(a,b,w,height=3.6){
 let lo=0,hi=1;
 const min=[w.x-w.w/2,w.ymin??0,w.z-w.d/2],max=[w.x+w.w/2,w.ymax??height,w.z+w.d/2];
 for(let i=0;i<3;i++){const d=b[i]-a[i];if(Math.abs(d)<1e-9){if(a[i]<min[i]||a[i]>max[i])return false;continue}
  let near=(min[i]-a[i])/d,far=(max[i]-a[i])/d;if(near>far)[near,far]=[far,near];lo=Math.max(lo,near);hi=Math.min(hi,far);if(lo>hi)return false;
 }
 return hi>1e-4&&lo<.9999;
}
function wallDistance(x,z,w){return Math.hypot(Math.max(0,Math.abs(x-w.x)-w.w/2),Math.max(0,Math.abs(z-w.z)-w.d/2))}
export function contactFactor(p,n,walls,height=3.6){
 let near=Infinity;
 for(const w of walls){
  // Ignore the sample's own coplanar wall. Perpendicular returns still form corners.
  const perpendicular=Math.abs(n[1])>.8||(w.w<w.d?Math.abs(n[0])<.5:Math.abs(n[2])<.5);
  if(perpendicular&&p[1]>=(w.ymin??0)-.03&&p[1]<=(w.ymax??height)+.03)near=Math.min(near,wallDistance(p[0],p[2],w));
 }
 const ceiling=n[1]<-.8;
 let shade=(ceiling?.08:.20)*Math.exp(-near/.40);
 if(Math.abs(n[1])<.8)shade+=.14*Math.exp(-Math.max(0,p[1])/.18)+.08*Math.exp(-Math.max(0,height-p[1])/.18);
 return Math.max(.76,1-shade);
}
export function doorSurroundFactor(p,door){return door?1-.07*Math.exp(-((p[0]-door.x)**2/3.5+(p[2]-door.z)**2/3.5)):1}
export function createLightBake(lamps,walls=[],height=3.6,door=null){
 const cache=new Map(),bins=new Map(),stats={samples:0,cacheHits:0,rays:0,boxTests:0,cacheEntries:0};
 function bin(x,z){const ix=Math.floor(x/BAKE.cellSize),iz=Math.floor(z/BAKE.cellSize),key=ix+','+iz;if(bins.has(key))return bins.get(key);
  const cx=(ix+.5)*BAKE.cellSize,cz=(iz+.5)*BAKE.cellSize;
  const nearby=lamps.filter(l=>Math.abs(l.x-cx)<=BAKE.radius+2.5&&Math.abs(l.z-cz)<=BAKE.radius+2.5);
  const blockers=walls.filter(w=>wallDistance(cx,cz,w)<=BAKE.radius+4);
  const value={nearby,blockers};bins.set(key,value);return value;
 }
 function blocked(a,b,candidates){stats.rays++;for(const w of candidates){
  // Cheap XZ rejection before the three-dimensional slab test.
  if(w.x+w.w/2<Math.min(a[0],b[0])||w.x-w.w/2>Math.max(a[0],b[0])||w.z+w.d/2<Math.min(a[2],b[2])||w.z-w.d/2>Math.max(a[2],b[2]))continue;
  stats.boxTests++;if(segmentHitsBox(a,b,w,height))return true;
 }return false}
 function sample(p,n){
  const key=p.map(v=>Math.round(v*10000)).join(',')+'|'+n.join(',');if(cache.has(key)){stats.cacheHits++;return cache.get(key)}stats.samples++;
  const {nearby,blockers}=bin(p[0],p[2]),ceiling=n[1]<-.8,floor=n[1]>.8;
  const ambient=ceiling?BAKE.ceilingAmbient:floor?BAKE.floorAmbient:BAKE.wallAmbient;
  const direct=[0,0,0],origin=p.map((v,i)=>v+n[i]*.018);
  for(const lamp of nearby){const horizontal=(lamp.x-p[0])**2+(lamp.z-p[2])**2;if(horizontal>=BAKE.radius**2)continue;
   if(ceiling){
    // Approximate reflected ceiling fill. The emitting underside cannot directly
    // illuminate the ceiling above itself. Test walls at the source's height.
    const a=[origin[0],height-.18,origin[2]],b=[lamp.x,height-.18,lamp.z];
    if(blocked(a,b,blockers))continue;
    const bounce=.15*Math.exp(-horizontal/5)*lamp.intensity;
    for(let c=0;c<3;c++)direct[c]+=bounce*(.5+.5*lamp.color[c]);
    continue;
   }
   // Four fixed area samples soften occlusion transitions without dynamic shadows.
   for(const u of [-.38,.38])for(const v of [-.065,.065]){
    const source=[lamp.x+u,lamp.y,lamp.z+v],dx=source[0]-origin[0],dy=source[1]-origin[1],dz=source[2]-origin[2],r2=dx*dx+dy*dy+dz*dz,r=Math.sqrt(r2);
    const incident=Math.max(0,(dx*n[0]+dy*n[1]+dz*n[2])/r),emitted=Math.max(0,dy/r);
    if(!incident||!emitted||blocked(origin,source,blockers))continue;
    const fade=Math.max(0,1-horizontal/(BAKE.radius**2));
    const energy=BAKE.power*lamp.intensity*incident*emitted/Math.max(2.2,r2)*Math.exp(-horizontal/24)*fade*fade/BAKE.samples;
    for(let c=0;c<3;c++)direct[c]+=energy*lamp.color[c];
   }
  }
  const ao=contactFactor(p,n,blockers,height),surround=doorSurroundFactor(p,door);
  const min=ceiling?BAKE.ceilingMin:floor?BAKE.floorMin:BAKE.wallMin;
  const rgb=Object.freeze(direct.map(d=>clamp((ambient+(ceiling?Math.min(.16,d):d))*ao*surround,min,ceiling?.58:BAKE.max)));
  if(cache.size<BAKE.cacheLimit){cache.set(key,rgb);stats.cacheEntries=cache.size}return rgb;
 }
 return {sample,stats,clear(){cache.clear();bins.clear();stats.cacheEntries=0}};
}
