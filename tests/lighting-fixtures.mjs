import fs from 'node:fs';
import {boot} from './app-harness.mjs';
import {Game} from '../dist/game.js';

// Capture the shipped box/ceiling/fold/door sampling coordinates using real
// Three.js geometry. Lighting itself is bypassed while constructing the fixtures.
export function productionLightingFixtures(seed=42,regions=[[0,0],[-1,-1],[286,-286]]){
 const source=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'');
 const capture=`globalThis.lightFixtures=[];createLightBake=(...args)=>{const fixture={args,samples:[]};lightFixtures.push(fixture);return{sample(p,n){fixture.samples.push([[...p],[...n]]);return[.5,.5,.5]},clear(){}}};\n`;
 class SeededGame extends Game{constructor(){super(seed)}}
 const app=boot({autoLoad:false,Game:SeededGame,sourceOverride:capture+source});
 for(const[rx,rz]of regions)app.eval(`{const task=createRenderChunk(${rx},${rz});while(!task.iterator.next().done){}disposeChunk(task.value)}`);
 // Values cross a vm realm; recreate plain native arrays/objects for test equality.
 return JSON.parse(JSON.stringify(app.context.lightFixtures.filter(f=>f.samples.length)));
}
export function replayLighting(createLightBake,fixtures,visit=()=>{}){
 let calls=0,samples=0,cacheHits=0,rays=0,boxTests=0;
 for(const fixture of fixtures){const bake=createLightBake(...fixture.args);for(const[p,n]of fixture.samples){visit(bake.sample(p,n),calls++);}
  samples+=bake.stats.samples;cacheHits+=bake.stats.cacheHits;rays+=bake.stats.rays;boxTests+=bake.stats.boxTests;
 }
 return{calls,samples,cacheHits,rays,boxTests};
}
