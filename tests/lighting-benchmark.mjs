// Run from the project directory:
// node tests/lighting-benchmark.mjs /absolute/path/to/baseline/dist/lighting.js
// This measures CPU lighting replay, not WebGL FPS or phone performance.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createLightBake as after} from '../dist/lighting.js';
import {productionLightingFixtures,replayLighting} from './lighting-fixtures.mjs';
if(!process.argv[2])throw new Error('Provide the unchanged baseline lighting.js path.');
const {createLightBake:before}=await import(pathToFileURL(resolve(process.argv[2])));
const seeds=[0,42,0xdeadbeef],regions=[[0,0],[-1,-1],[286,-286]],fixtures=seeds.flatMap(seed=>productionLightingFixtures(seed,regions));
const expected=[],baselineStats=replayLighting(before,fixtures,rgb=>expected.push(rgb));
const optimizedStats=replayLighting(after,fixtures,(rgb,index)=>assert.deepEqual(rgb,expected[index],`RGB sample ${index}`));
assert.deepEqual(optimizedStats,baselineStats);
for(let i=0;i<2;i++){replayLighting(before,fixtures);replayLighting(after,fixtures)}
const times={before:[],after:[]};
for(let run=0;run<8;run++)for(const label of run%2?['after','before']:['before','after']){
 const start=performance.now();replayLighting(label==='before'?before:after,fixtures);times[label].push(performance.now()-start);
}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b);return(sorted[3]+sorted[4])/2};
const beforeMs=median(times.before),afterMs=median(times.after);
console.log(JSON.stringify({runtime:process.version,seeds,regions,exactRGB:true,identicalCounters:true,stats:baselineStats,rounds:times,medianMs:{before:beforeMs,after:afterMs},speedup:beforeMs/afterMs,reductionPercent:100*(1-afterMs/beforeMs)},null,2));
