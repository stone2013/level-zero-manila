// One physical presence, confined to the currently authored sector. Static
// navigation is shared across retries; occupation and every step remain live.
import {LEVEL_ONE_AREAS,levelOneAreaAt,isLevelOneSheltered} from './level-one-layout.js';
const NAVIGATION=new WeakMap(),STEP=1,RADIUS=.25,SPEED=1.6,MEMORY=2.5;
export const levelOneSheltered=isLevelOneSheltered;
const areaFor=game=>LEVEL_ONE_AREAS.find(a=>a.id===game.level1.area)||levelOneAreaAt(game.player.x,game.player.z)||LEVEL_ONE_AREAS[0];
const shelteredBody=(x,z,r=RADIUS)=>LEVEL_ONE_AREAS.some(a=>a.shelters.some(s=>x>=s.minX-r&&x<=s.maxX+r&&z>=s.minZ-r&&z<=s.maxZ+r));
export function resetLevelOneDanger(){const p=LEVEL_ONE_AREAS[0].spawn;return{active:false,x:p.x,z:p.z,yaw:0,area:null,proximity:0,contact:0,grace:2,checkpoint:{...p},phase:'lit',path:[],routeTimer:0,spawnAttempted:false,lastSeen:null,memory:0,lastPlayer:null}}
function free(game,area,x,z,radius=RADIUS){const b=area.bounds;return x>=b.minX+radius&&x<=b.maxX-radius&&z>=b.minZ+radius&&z<=b.maxZ-radius&&!shelteredBody(x,z,radius)&&!game.collides(x,z,{radius,ignoreEntities:true})}
function segment(game,area,a,b,radius=RADIUS+.04){const n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.12));for(let k=0;k<=n;k++)if(!free(game,area,a.x+(b.x-a.x)*k/n,a.z+(b.z-a.z)*k/n,radius))return false;return true}
function graph(game,area){let cache=NAVIGATION.get(game);if(!cache||cache.collides!==game.collides){cache={collides:game.collides,areas:new Map()};NAVIGATION.set(game,cache)}if(cache.areas.has(area.id))return cache.areas.get(area.id);
 const b=area.bounds,cols=Math.floor((b.maxX-b.minX)/STEP)+1,rows=Math.floor((b.maxZ-b.minZ)/STEP)+1,points=Array.from({length:cols*rows},(_,i)=>({x:b.minX+i%cols*STEP,z:b.minZ+Math.floor(i/cols)*STEP})),nodes=new Uint8Array(points.length),edges=Array.from({length:points.length},()=>[]);
 for(let i=0;i<points.length;i++)nodes[i]=free(game,area,points[i].x,points[i].z,RADIUS+.04)?1:0;
 for(let i=0;i<points.length;i++)if(nodes[i])for(const j of[i%cols<cols-1?i+1:-1,i+cols<points.length?i+cols:-1])if(j>=0&&nodes[j]&&segment(game,area,points[i],points[j])){edges[i].push(j);edges[j].push(i)}
 const nav={points,nodes,edges};cache.areas.set(area.id,nav);return nav;
}
function nearest(nav,p,game,area,allowShelter=false){const choices=[];for(let i=0;i<nav.nodes.length;i++)if(nav.nodes[i])choices.push({i,d:(nav.points[i].x-p.x)**2+(nav.points[i].z-p.z)**2});choices.sort((a,b)=>a.d-b.d||a.i-b.i);for(const c of choices){if(allowShelter||segment(game,area,p,nav.points[c.i]))return c.i;if(c.d>9)break}return -1}
function route(game,area,d,spawn=false){const nav=graph(game,area),target=spawn?game.player:d.lastSeen;if(!target){d.path=[];return}const safe=isLevelOneSheltered(target.x,target.z),root=nearest(nav,target,game,area,spawn&&safe);if(root<0){d.path=[];return}const destination=spawn?-1:nearest(nav,d,game,area),parents=new Int32Array(nav.nodes.length).fill(-2),queue=[root];parents[root]=-1;
 for(let k=0;k<queue.length;k++){const i=queue[k];if(i===destination)break;for(const j of nav.edges[i])if(parents[j]===-2){parents[j]=i;queue.push(j)}}
 if(spawn){const choices=queue.map(i=>({i,q:nav.points[i]})).map(c=>({...c,distance:Math.hypot(c.q.x-game.player.x,c.q.z-game.player.z)})).filter(c=>c.distance>=8).sort((a,b)=>a.distance-b.distance||a.i-b.i);const pick=choices.slice(0,64).find(c=>game.lineClear(c.q.x,c.q.z))||choices[0];if(!pick)return;d.x=pick.q.x;d.z=pick.q.z;d.active=true;d.grace=2;d.path=[];return}
 d.path=[];if(destination<0||parents[destination]===-2)return;for(let i=destination;i>=0;i=parents[i])d.path.push(nav.points[i]);if(segment(game,area,nav.points[root],target))d.path.push({...target});while(d.path.length>1&&segment(game,area,d,d.path[1]))d.path.shift();
}
// Pure prewarm: no player, phase, checkpoint, entity or event mutation.
export function prepareLevelOneDanger(game){if(game.zone==='level1')for(const area of LEVEL_ONE_AREAS)graph(game,area)}
function hide(d){d.active=false;d.contact=0;d.proximity=0;d.path=[];d.spawnAttempted=false;d.routeTimer=0;d.lastSeen=null;d.memory=0}
export function updateLevelOneDanger(game,dt){
 if(game.zone!=='level1'||game.mode!=='playing'||game.inventoryOpen||game.phoneOpenId||!Number.isFinite(dt)||dt<=0)return;
 const d=game.level1.danger||(game.level1.danger=resetLevelOneDanger()),area=areaFor(game),phase=game.level1.phase,p=game.player;dt=Math.min(.05,dt);
 const safe=isLevelOneSheltered(p.x,p.z);if(safe)d.checkpoint={x:p.x,z:p.z,yaw:p.yaw||0};
 if(d.area!==area.id){const changed=d.area!==null;hide(d);d.area=area.id;d.lastPlayer={x:p.x,z:p.z};if(changed){d.phase=phase;return}}
 if(d.phase!==phase){d.phase=phase;if(phase==='warning')game.events.push('灯光正在变暗。寻找亮着应急灯的安全区域；墙壁可以遮住它的视线。');else if(phase==='dark')game.events.push('停电了。躲到遮挡物后安静行走；奔跑声会引来它。');else if(phase==='lit')game.events.push('电力恢复了。黑暗中的东西消失了。')}
 const moving=d.lastPlayer&&Math.hypot(p.x-d.lastPlayer.x,p.z-d.lastPlayer.z)>.001;d.lastPlayer={x:p.x,z:p.z};
 if(phase!=='dark'){hide(d);return}
 if(!d.active&&!d.spawnAttempted){d.spawnAttempted=true;route(game,area,d,true);d.routeTimer=0}
 if(!d.active)return;if(!free(game,area,d.x,d.z)){d.active=false;d.path=[];d.contact=0;d.proximity=0;return}
 const distance=Math.hypot(d.x-p.x,d.z-p.z),visible=game.lineClear(d.x,d.z),heard=moving&&distance<=(game.level1.sprinting?14:4);
 if(!safe&&(visible||heard)){d.lastSeen={x:p.x,z:p.z};d.memory=MEMORY}else d.memory=Math.max(0,d.memory-dt);
 // Memory preserves the last observed position, never an unseen live target.
 // Once there, the presence waits. New sight or sound is needed to reacquire.
 if(d.memory<=0&&d.lastSeen&&Math.hypot(d.x-d.lastSeen.x,d.z-d.lastSeen.z)<.4){d.lastSeen=null;d.path=[]}
 d.grace=Math.max(0,d.grace-dt);d.routeTimer-=dt;if(d.routeTimer<=0){route(game,area,d);d.routeTimer=.3}
 let travel=SPEED*dt;if(d.grace<=0&&!safe)while(travel>0&&d.path.length){const next=d.path[0],dx=next.x-d.x,dz=next.z-d.z,length=Math.hypot(dx,dz);if(length<.001){d.path.shift();continue}const step=Math.min(travel,length),q={x:d.x+dx/length*step,z:d.z+dz/length*step};if(Math.hypot(q.x-p.x,q.z-p.z)<.58||!segment(game,area,d,q,RADIUS)){d.path=[];break}d.yaw=Math.atan2(dx,-dz);d.x=q.x;d.z=q.z;travel-=step;if(step===length)d.path.shift()}
 const close=Math.hypot(d.x-p.x,d.z-p.z);d.proximity=visible&&!safe?Math.max(0,1-close/7):0;if(d.grace<=0&&!safe&&visible&&close<.65)d.contact+=dt;else d.contact=0;
 if(d.contact>=.7){game.mode='lost';game.level1.failure='entity';game.events.push('level1-entity-caught')}
}
