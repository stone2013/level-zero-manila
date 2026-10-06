import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BAKE,seededLamps,createLightBake,contactFactor,segmentHitsBox} from '../dist/lighting.js';
import {productionLightingFixtures,replayLighting} from './lighting-fixtures.mjs';

// v1.6.3 exterior-shell fixtures are replayed against the frozen v1.6.1
// pre-optimization bake to retain an independent numerical reference. The new
// wallpaper shell adds 298 samples; streamed floor/wall/fold geometry is unchanged.
// These hash Float64 RGB values, not rounded GPU attributes.
const snapshots=[
 {seed:0,hash:'265e60d4956154f3b8553b18d6a03a2102a7b5ce4f09dea627208fa2564a7874',stats:{calls:29572,samples:24962,cacheHits:4610,rays:436030,boxTests:453732}},
 {seed:42,hash:'21ebafb7089c2d05d34cb9bedd116e19f2b5b487aeb97d2755869ff275ec9ebd',stats:{calls:29302,samples:24888,cacheHits:4414,rays:434890,boxTests:442424}},
 {seed:0xdeadbeef,hash:'5595f53667adf631debb96ade463785ca7b5ce2d2207232db19657e0352bda88',stats:{calls:29842,samples:25302,cacheHits:4540,rays:441274,boxTests:454962}},
];
for(const expected of snapshots)test(`seed ${expected.seed}: production floor/wall/ceiling, folds, doorway and distant grids preserve every RGB bit`,()=>{
 const fixtures=productionLightingFixtures(expected.seed),hash=createHash('sha256'),bytes=Buffer.alloc(24);
 assert(fixtures.some(f=>f.args[0].length===1&&f.args[1].length===4),'fold bake is sampled');
 assert(fixtures.some(f=>f.args[1].some(w=>w.ymin===2.66&&w.ymax===3.6)),'door lintel height is included');
 assert(fixtures.some(f=>f.samples.some(([p])=>p[0]<0&&p[2]<0)),'negative grid coordinates are included');
 assert(fixtures.some(f=>f.samples.some(([p])=>p[0]>10000&&p[2]<-10000)),'10 km coordinates are included');
 const stats=replayLighting(createLightBake,fixtures,rgb=>{for(let c=0;c<3;c++)bytes.writeDoubleLE(rgb[c],c*8);hash.update(bytes)});
 assert.deepEqual(stats,expected.stats);assert.equal(hash.digest('hex'),expected.hash);
});

// Frozen mathematical references isolate the nearest-wall pruning and ray slab
// optimization from complete bake fixtures. Never replace these with production
// helpers: they intentionally retain the straightforward pre-optimization math.
function originalContact(p,n,walls,height=3.6){
 let near=Infinity;
 for(const w of walls){const perpendicular=Math.abs(n[1])>.8||(w.w<w.d?Math.abs(n[0])<.5:Math.abs(n[2])<.5);
  if(perpendicular&&p[1]>=(w.ymin??0)-.03&&p[1]<=(w.ymax??height)+.03)near=Math.min(near,Math.hypot(Math.max(0,Math.abs(p[0]-w.x)-w.w/2),Math.max(0,Math.abs(p[2]-w.z)-w.d/2)));
 }
 let shade=(n[1]<-.8?.08:.20)*Math.exp(-near/.40);
 if(Math.abs(n[1])<.8)shade+=.14*Math.exp(-Math.max(0,p[1])/.18)+.08*Math.exp(-Math.max(0,height-p[1])/.18);
 return Math.max(.76,1-shade);
}
function originalSegment(a,b,w,height=3.6){
 let lo=0,hi=1;const min=[w.x-w.w/2,w.ymin??0,w.z-w.d/2],max=[w.x+w.w/2,w.ymax??height,w.z+w.d/2];
 for(let i=0;i<3;i++){const d=b[i]-a[i];if(Math.abs(d)<1e-9){if(a[i]<min[i]||a[i]>max[i])return false;continue}
  let near=(min[i]-a[i])/d,far=(max[i]-a[i])/d;if(near>far)[near,far]=[far,near];lo=Math.max(lo,near);hi=Math.min(hi,far);if(lo>hi)return false;
 }return hi>1e-4&&lo<.9999;
}
function rng(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
const normals=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[.6,.8,0],[.6,-.8,0]];
test('nearest-contact pruning is exact for finite surfaces, partial-height walls and zero-distance corners',()=>{
 const random=rng(837);for(let i=0;i<4000;i++){
  const x=(i%3-1)*10000,z=(i%5-2)*10000,p=[x+random()*10,random()*4,z+random()*10],n=normals[i%normals.length];
  const walls=Array.from({length:24},(_,j)=>({x:x+random()*20-5,z:z+random()*20-5,w:j%2?.16:5,d:j%2?5:.16,...(j%3?{}:{ymin:2.66,ymax:3.6})}));
  if(i%4===0)walls.unshift({x:p[0],z:p[2],w:5,d:5});
  assert.equal(contactFactor(p,n,walls),originalContact(p,n,walls));
 }
});
test('ray slabs preserve parallel, reversed, tangent and endpoint tolerance cases',()=>{
 const random=rng(479);for(let i=0;i<12000;i++){
  const x=(i%3-1)*10000,z=(i%5-2)*10000,w={x,z,w:i%2?.16:5,d:i%2?5:.16,...(i%3?{}:{ymin:2.66,ymax:3.6})};
  const a=[x+random()*12-6,random()*5-1,z+random()*12-6],b=[x+random()*12-6,random()*5-1,z+random()*12-6];
  if(i%4===0)b[i%3]=a[i%3];
  if(i%7===0)b[i%3]=a[i%3]+1e-10;
  assert.equal(segmentHitsBox(a,b,w),originalSegment(a,b,w));assert.equal(segmentHitsBox(b,a,w),originalSegment(b,a,w));
 }
 const w={x:0,z:0,w:2,d:2};
 for(const y of [0,3.6,3.6+1e-10])for(const x of [-1,-1-1e-10,0,1,1+1e-10])for(const b of [[x,y,2],[x,y,-2],[x,y,0]]){
  const a=[x,y,-1];assert.equal(segmentHitsBox(a,b,w),originalSegment(a,b,w));
 }
});
test('cache quantization, frozen colors, clear and wall-bound refresh preserve the existing contract',()=>{
 assert.equal(BAKE.radius,9);assert.equal(BAKE.samples,4);assert.equal(BAKE.cacheLimit,24000);
 const lamps=seededLamps([{x:0,z:0}],3),wall={x:1.4,z:0,w:.16,d:5},walls=[wall],before=JSON.stringify(walls),bake=createLightBake(lamps,walls),p=[2.8,1.6,0],normal=[-1,0,0];
 const first=bake.sample(p,normal);assert(Object.isFrozen(first));assert.equal(JSON.stringify(walls),before);
 assert.equal(bake.sample([p[0]+1e-6,p[1],p[2]],normal),first);assert.equal(bake.stats.cacheHits,1);
 bake.clear();assert.equal(bake.stats.cacheEntries,0);assert.deepEqual(bake.sample(p,normal),first);
 // Clearing must discard both the last-bin shortcut and precomputed bounds.
 wall.x=100;bake.clear();assert.deepEqual(bake.sample(p,normal),createLightBake(lamps,walls).sample(p,normal));
 assert.notDeepEqual(bake.sample(p,normal),first);
});
