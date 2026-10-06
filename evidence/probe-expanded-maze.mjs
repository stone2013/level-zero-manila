import {Game, makeMaze, CELL} from '../dist/game.js';
import {writeFileSync} from 'node:fs';
const lengths=[], attempts={};
for(let seed=0;seed<10000;seed++){const m=makeMaze(seed);lengths.push(m.route.length);attempts[m.generationAttempt]=(attempts[m.generationAttempt]||0)+1;if(m.seed!==seed||m.route.length<23||!m.dist.every(Number.isFinite))throw Error(`seed ${seed}`);}
// An analytic rectangle-ray oracle avoids relying on lineClear's 10 cm stepping.
const rayBlocked=(g,x,z)=>{const p=g.player,dx=x-p.x,dz=z-p.z;return g.walls.some(w=>{let lo=0,hi=1;for(const[o,d,a,b]of[[p.x,dx,w.x-w.w/2,w.x+w.w/2],[p.z,dz,w.z-w.d/2,w.z+w.d/2]]){if(Math.abs(d)<1e-12){if(o<a||o>b)return false;}else{const u=(a-o)/d,v=(b-o)/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>hi)return false;}}return hi>0&&lo<1;});};
const g=new Game(42),pair=g.activeFolds();let checked=0;const counterexamples=[];
for(let x=12.5;x<32.5;x+=.2)for(let z=15.25;z<30;z+=.2){if(g.collides(x,z))continue;g.player.x=x;g.player.z=z;if(pair.some(f=>Math.hypot(x-f.px,z-f.pz)<4.5))continue;if(pair.some(f=>[.35,1.15,2.1].some(q=>!rayBlocked(g,f.px,f.z*CELL+q))))continue;checked++;for(const f of pair)for(let q=.221;q<2.2;q+=.02)if(!rayBlocked(g,f.px,f.z*CELL+q)){counterexamples.push({x,z,endpoint:f.id,seamZ:f.z*CELL+q});break;}}
lengths.sort((a,b)=>a-b);
const result={seeds:10000,ordinaryRouteCells:{minimum:lengths[0],median:lengths[5000],maximum:lengths.at(-1)},generationAttempts:attempts,occlusionProbe:{seed:42,positionSpacingMetres:.2,analyticRectangleRayOracle:true,candidateHiddenPositions:checked,apertureSampleSpacingMetres:.02,counterexamples}};
writeFileSync(new URL('./expanded-maze-probe.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
