// Build-time diffuse lighting only. No render-loop ray casts, real-time lamp lights,
// shadow maps, light textures, post-processing, or simulation RNG consumption.
export const BAKE=Object.freeze({radius:9,cellSize:5,samples:4,power:5.4,
 wallAmbient:.43,floorAmbient:.34,ceilingAmbient:.40,cacheLimit:24000,
 floorMin:.27,wallMin:.32,ceilingMin:.35,max:.86});
const AREA_U=[-.38,.38],AREA_V=[-.065,.065];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(n){n=Math.imul(n^(n>>>16),0x7feb352d);n=Math.imul(n^(n>>>15),0x846ca68b);return((n^(n>>>16))>>>0)/4294967295}
export function seededLamps(points,seed,height=3.6){
 return points.map(p=>{const key=(seed>>>0)^Math.imul(Math.round(p.x*100),73856093)^Math.imul(Math.round(p.z*100),19349663),t=hash(key^0x6d2b79f5);
  return Object.freeze({...p,y:height-.132,intensity:.92+.16*hash(key),color:Object.freeze([1,.977+.018*t,.916+.060*t])});
 });
}
export function segmentHitsBox(a,b,w,height=3.6){
 const min=[w.x-w.w/2,w.ymin??0,w.z-w.d/2],max=[w.x+w.w/2,w.ymax??height,w.z+w.d/2];
 return segmentHitsBounds(a,b,min,max);
}
function segmentHitsBounds(a,b,min,max){
 let lo=0,hi=1;
 for(let i=0;i<3;i++){const d=b[i]-a[i];if(Math.abs(d)<1e-9){if(a[i]<min[i]||a[i]>max[i])return false;continue}
  let near=(min[i]-a[i])/d,far=(max[i]-a[i])/d;if(near>far){const swap=near;near=far;far=swap}lo=Math.max(lo,near);hi=Math.min(hi,far);if(lo>hi)return false;
 }
 return hi>1e-4&&lo<.9999;
}
function wallDistance(x,z,w){return Math.hypot(Math.max(0,Math.abs(x-w.x)-w.w/2),Math.max(0,Math.abs(z-w.z)-w.d/2))}
export function contactFactor(p,n,walls,height=3.6){
 let near=Infinity;
 for(const w of walls){
  // Ignore the sample's own coplanar wall. Perpendicular returns still form corners.
  const perpendicular=Math.abs(n[1])>.8||(w.w<w.d?Math.abs(n[0])<.5:Math.abs(n[2])<.5);
  if(perpendicular&&p[1]>=(w.ymin??0)-.03&&p[1]<=(w.ymax??height)+.03){
   const dx=Math.max(0,Math.abs(p[0]-w.x)-w.w/2),dz=Math.max(0,Math.abs(p[2]-w.z)-w.d/2);
   // Axis distances are lower bounds. Only evaluate hypot when this wall could
   // improve the exact nearest distance; zero is already the global minimum.
   if(dx>near||dz>near)continue;
   near=Math.min(near,Math.hypot(dx,dz));if(near===0)break;
  }
 }
 const ceiling=n[1]<-.8;
 let shade=(ceiling?.08:.20)*Math.exp(-near/.40);
 if(Math.abs(n[1])<.8)shade+=.14*Math.exp(-Math.max(0,p[1])/.18)+.08*Math.exp(-Math.max(0,height-p[1])/.18);
 return Math.max(.76,1-shade);
}
export function doorSurroundFactor(p,door){return door?1-.07*Math.exp(-((p[0]-door.x)**2/3.5+(p[2]-door.z)**2/3.5)):1}
export function createLightBake(lamps,walls=[],height=3.6,door=null){
 // Build-only bounds are shared by every bin/ray, then released by clear().
 let boundedWalls;
 const cache=new Map(),bins=new Map(),stats={samples:0,cacheHits:0,rays:0,boxTests:0,cacheEntries:0};
 let lastX,lastZ,lastBin;
 function bin(x,z){const ix=Math.floor(x/BAKE.cellSize),iz=Math.floor(z/BAKE.cellSize);
  if(ix===lastX&&iz===lastZ)return lastBin;
  const key=ix+','+iz,cached=bins.get(key);lastX=ix;lastZ=iz;if(cached)return lastBin=cached;
  const cx=(ix+.5)*BAKE.cellSize,cz=(iz+.5)*BAKE.cellSize;
  const nearby=lamps.filter(l=>Math.abs(l.x-cx)<=BAKE.radius+2.5&&Math.abs(l.z-cz)<=BAKE.radius+2.5);
  boundedWalls??=walls.map(w=>({x:w.x,z:w.z,w:w.w,d:w.d,ymin:w.ymin,ymax:w.ymax,min:[w.x-w.w/2,w.ymin??0,w.z-w.d/2],max:[w.x+w.w/2,w.ymax??height,w.z+w.d/2]}));
  const blockers=boundedWalls.filter(w=>wallDistance(cx,cz,w)<=BAKE.radius+4);
  const value={nearby,blockers};bins.set(key,value);return lastBin=value;
 }
 function blocked(a,b,candidates){stats.rays++;
  const minX=Math.min(a[0],b[0]),maxX=Math.max(a[0],b[0]),minZ=Math.min(a[2],b[2]),maxZ=Math.max(a[2],b[2]);
  for(const w of candidates){
  // Cheap XZ rejection before the three-dimensional slab test.
  if(w.max[0]<minX||w.min[0]>maxX||w.max[2]<minZ||w.min[2]>maxZ)continue;
  stats.boxTests++;if(segmentHitsBounds(a,b,w.min,w.max))return true;
 }return false}
 function sample(p,n){
  const key=Math.round(p[0]*10000)+','+Math.round(p[1]*10000)+','+Math.round(p[2]*10000)+'|'+n[0]+','+n[1]+','+n[2],cached=cache.get(key);if(cached){stats.cacheHits++;return cached}stats.samples++;
  const {nearby,blockers}=bin(p[0],p[2]),ceiling=n[1]<-.8,floor=n[1]>.8;
  const ambient=ceiling?BAKE.ceilingAmbient:floor?BAKE.floorAmbient:BAKE.wallAmbient;
  let red=0,green=0,blue=0;
  const origin=[p[0]+n[0]*.018,p[1]+n[1]*.018,p[2]+n[2]*.018],source=[0,0,0];
  if(ceiling)origin[1]=height-.18;
  for(const lamp of nearby){const horizontal=(lamp.x-p[0])**2+(lamp.z-p[2])**2;if(horizontal>=BAKE.radius**2)continue;
   if(ceiling){
    // Approximate reflected ceiling fill. The emitting underside cannot directly
    // illuminate the ceiling above itself. Test walls at the source's height.
    source[0]=lamp.x;source[1]=height-.18;source[2]=lamp.z;
    if(blocked(origin,source,blockers))continue;
    const bounce=.15*Math.exp(-horizontal/5)*lamp.intensity;
    red+=bounce*(.5+.5*lamp.color[0]);green+=bounce*(.5+.5*lamp.color[1]);blue+=bounce*(.5+.5*lamp.color[2]);
    continue;
   }
   // Four fixed area samples soften occlusion transitions without dynamic shadows.
   const fade=Math.max(0,1-horizontal/(BAKE.radius**2)),attenuation=Math.exp(-horizontal/24),power=BAKE.power*lamp.intensity;
   for(const u of AREA_U)for(const v of AREA_V){
    source[0]=lamp.x+u;source[1]=lamp.y;source[2]=lamp.z+v;
    const dx=source[0]-origin[0],dy=source[1]-origin[1],dz=source[2]-origin[2],r2=dx*dx+dy*dy+dz*dz,r=Math.sqrt(r2);
    const incident=Math.max(0,(dx*n[0]+dy*n[1]+dz*n[2])/r),emitted=Math.max(0,dy/r);
    if(!incident||!emitted||blocked(origin,source,blockers))continue;
    const energy=power*incident*emitted/Math.max(2.2,r2)*attenuation*fade*fade/BAKE.samples;
    red+=energy*lamp.color[0];green+=energy*lamp.color[1];blue+=energy*lamp.color[2];
   }
  }
  const ao=contactFactor(p,n,blockers,height),surround=doorSurroundFactor(p,door);
  const min=ceiling?BAKE.ceilingMin:floor?BAKE.floorMin:BAKE.wallMin;
  const rgb=Object.freeze([red,green,blue].map(d=>clamp((ambient+(ceiling?Math.min(.16,d):d))*ao*surround,min,ceiling?.58:BAKE.max)));
  if(cache.size<BAKE.cacheLimit){cache.set(key,rgb);stats.cacheEntries=cache.size}return rgb;
 }
 return {sample,stats,clear(){cache.clear();bins.clear();lastX=lastZ=lastBin=boundedWalls=undefined;stats.cacheEntries=0}};
}
