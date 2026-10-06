import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {BAKE,seededLamps,segmentHitsBox,contactFactor,doorSurroundFactor,createLightBake} from '../dist/lighting.js';
import {Game} from '../dist/game.js';
const Y=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
const points=[{x:2.5,z:2.5},{x:7.5,z:2.5}],up=[0,1,0],down=[0,-1,0];

test('lamp variations are seed-stable, position-stable, within ±8%, and do not consume game RNG',()=>{
 const a=seededLamps(points,5),b=seededLamps(points,5);assert.deepEqual(a,b);assert.notDeepEqual(a,seededLamps(points,6));assert.deepEqual([...a].reverse(),seededLamps([...points].reverse(),5));
 for(let seed=0;seed<100;seed++)for(const l of seededLamps(points,seed)){assert(l.intensity>=.92&&l.intensity<=1.08);assert.equal(l.y,3.468);assert.equal(l.color[0],1);assert(l.color[1]>=.977&&l.color[1]<=.995);assert(l.color[2]>=.916&&l.color[2]<=.976)}
 const game=new Game(5),before=JSON.stringify(game);seededLamps(points,game.maze.seed);assert.equal(JSON.stringify(game),before);
});
test('area fixture pools overlap smoothly but remain brighter below each fixture',()=>{
 const b=createLightBake(seededLamps(points,5)),under=Y(b.sample([2.5,0,2.5],up)),between=Y(b.sample([5,0,2.5],up));
 assert(under/between>1.20&&under/between<1.50);assert(between>.45);
 let previous;for(let x=2.5;x<=7.5;x+=.05){const value=Y(b.sample([x,0,2.5],up));if(previous!==undefined)assert(Math.abs(value-previous)<.018);previous=value}
 const single=createLightBake(seededLamps([points[0]],5));assert(between>Y(single.sample([5,0,2.5],up)),'neighboring pools add together');
});
test('wall obstruction blocks the direct component while preserving nonblack bounce',()=>{
 const lamps=seededLamps([{x:0,z:0}],7),p=[2.8,1.6,0],n=[-1,0,0],wall={x:1.4,z:0,w:.16,d:5};
 const clear=createLightBake(lamps),blocked=createLightBake(lamps,[wall]);assert(segmentHitsBox(p,[0,3.468,0],wall));assert(!segmentHitsBox(p,[0,3.468,8],wall));
 const lit=Y(clear.sample(p,n)),shade=Y(blocked.sample(p,n));assert(shade/lit>=.75&&shade/lit<=.85);assert(shade>=BAKE.wallMin);assert(Y(clear.sample(p,[1,0,0]))<lit,'surface orientation matters');
 const lintel={...wall,ymin:2.66,ymax:3.6};assert(!segmentHitsBox([4,1,0],[0,1,0],lintel));assert(segmentHitsBox([4,3,0],[0,3,0],lintel));
});
test('corner/contact shade is soft and locally 15–25% darker without self-shadowing a flat wall',()=>{
 const walls=[{x:0,z:2.5,w:.16,d:5},{x:2.5,z:0,w:5,d:.16}],normal=[1,0,0];
 const corner=contactFactor([.08,1.6,.10],normal,walls),flat=contactFactor([.08,1.6,2.5],normal,walls);assert(corner/flat>=.75&&corner/flat<=.85);
 assert(contactFactor([.08,1.6,2.5],normal,[walls[0]])>.99,'own wall is not an occluder');
 const floorContact=contactFactor([.10,0,2.5],up,walls),floorOpen=contactFactor([2.5,0,2.5],up,walls);assert(floorContact/floorOpen>=.75&&floorContact/floorOpen<=.85);
 assert(contactFactor([.08,.02,.10],normal,walls)>=.76);
});
test('ceiling bounce retains local variation and never treats an underside lamp as upward direct light',()=>{
 const b=createLightBake(seededLamps(points,5)),under=b.sample([2.5,3.58,2.5],down),between=b.sample([5,3.58,2.5],down);
 assert(Y(under)>Y(between)*1.08);assert(Y(between)>.4);assert(Math.max(...under)<=.58);assert(Math.min(...under)/Math.max(...under)>.96);
});
test('door surroundings are gently dimmed, positive and continuous with no special lamp',()=>{
 const door={x:5,z:5};assert(Math.abs(doorSurroundFactor([5,1.6,5],door)-.93)<1e-12);assert(doorSurroundFactor([10,1.6,5],door)>.999);assert.equal(doorSurroundFactor([5,1.6,5],null),1);
 const b=createLightBake(seededLamps([{x:2.5,z:5}],5),[],3.6,door);const rgb=b.sample([4.8,1.6,5],[-1,0,0]);assert(Math.min(...rgb)>.4);
});
test('every sampled maze surface stays finite/readable, and caches/ray work are bounded',()=>{
 for(const seed of [0,5,42,0xDEADBEEF]){const g=new Game(seed),b=createLightBake(seededLamps(g.maze.cells.map(c=>({x:c.x*5+2.5,z:c.z*5+2.5})),seed),g.walls);
  for(let x=.1;x<35;x+=1.25)for(let z=.1;z<35;z+=1.25)for(const y of [0,3.58]){const rgb=b.sample([x,y,z],y?down:up);assert(rgb.every(c=>Number.isFinite(c)&&c>=BAKE.floorMin&&c<=BAKE.max))}
  const before={...b.stats},p=[2.5,0,2.5];b.sample(p,up);b.sample(p,up);assert(b.stats.cacheHits>before.cacheHits);assert(b.stats.cacheEntries<=BAKE.cacheLimit);assert(b.stats.rays<50000);assert(b.stats.boxTests<120000);
  b.clear();assert.equal(b.stats.cacheEntries,0);
 }
 const empty=createLightBake([]);for(let i=0;i<BAKE.cacheLimit+10;i++)empty.sample([i*.01,0,0],up);assert.equal(empty.stats.cacheEntries,BAKE.cacheLimit);
});
test('menu/material release preserves simulation, baked lighting, manifest, and original gameplay tests byte-for-byte',()=>{
 const expected={'dist/game.js':'895a418d65813a18958ee360f43b107a3da9db78c3c021ede0af4a7983118f76','dist/lighting.js':'92d0b8925092a0d4c2b414171acd880ff6332eb82726f51d298c7bb96c54efcb','dist/manifest.webmanifest':'d2aba93336a48a58e50799bc67d5bbdd205ef3a635ff209ab7a19d5012d7446a','tests/game.test.mjs':'8be4782fd5710c4fe72eb2081c4dc713a1aa5d026dc836163c3e394c08713c5c'};
 for(const [path,sha] of Object.entries(expected))assert.equal(createHash('sha256').update(fs.readFileSync(path)).digest('hex'),sha,path);
 const app=fs.readFileSync('dist/app.js','utf8'),loop=app.slice(app.indexOf('function sync()'));assert(!/bake\.sample|seededLamps|new THREE\.(PointLight|SpotLight)|flicker/.test(loop));
 assert(!/MeshPhongMaterial|MeshStandardMaterial|EffectComposer|shadowMap\.enabled=true/.test(app),'no carpet specular or extra render passes');
});

// v1.3.5 permits menu CSS and one ceiling albedo value, never a lighting/gameplay reset.
test('menu restoration changes no app behavior or lighting except the requested ceiling material',()=>{
 const app=fs.readFileSync('dist/app.js','utf8');
 const normalized=app.replace('// Only the panel albedo is yellowed; the lamp bake and global lighting stay neutral.\n','').replace('map:ceilTex,color:0xd6be7b','map:ceilTex');
 assert.equal(createHash('sha256').update(normalized).digest('hex'),'653bbf9d3efed2ed76d7e1e923365b06e98b14fc7c44ed2bd0bfe90afd9e4389');
});
test('HUD, touch controls, dialogs and landscape safeguards retain their prior CSS',()=>{
 const css=fs.readFileSync('dist/style.css','utf8').replace(/\/\*[^]*?\*\//g,'');
 const protectedRules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m=>!/#menu|\.menu-|#render-warning/.test(m[1])).map(m=>[m[1].trim(),m[2].trim()]);
 assert.equal(createHash('sha256').update(JSON.stringify(protectedRules)).digest('hex'),'6b614710d016299d74e86dab9d1617110d90f48544e1a39272c1be5d52bdea0d');
});
