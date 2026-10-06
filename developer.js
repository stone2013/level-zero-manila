// Explicit, session-only debug actions. Nothing in this module advances the
// simulation or changes an existing item to manufacture a new one.
import {ESCAPE_TRIGGER_SECONDS} from './escape.js';

const KINDS=new Set(['food','water','phone']);
const NAMES={food:'干粮',water:'饮用水',phone:'满电手机'};
const JUMP_SECONDS=450;
export const DEVELOPER_ITEM_LIMIT=128;
let nextItemSerial=1;

function unavailable(game){
 if(game?.developerEnabled!==true)return '请先启用开发者工具。';
 if(!['playing','paused'].includes(game.mode))return '请先开始或继续一轮探索；结束后请重新开始。';
 if(['caught','caught-animation'].includes(game.escape?.phase))return '本次追逐已失败，请先重试或重新开始。';
 return '';
}
function jumpUnavailable(game){
 const reason=unavailable(game);if(reason)return reason;
 if(game.escape?.triggered||game.escape?.phase!=='idle')return '本轮事件已触发或已跳过；请重新开始后测试 7:30。';
 if(game.foundManila||game.entered||game.inRoom()||game.changed)return '本轮已发现马尼拉房间；请重新开始后测试 7:30。';
 return '';
}
function outsideUnavailable(game){
 return unavailable(game)||(game.changed?'房门连接已经改变，不能再传送到原来的门外。':'');
}
function spawnUnavailable(game){
 return unavailable(game)||(game.items.filter(item=>item.developerSpawned===true||/^debug-(?:food|water|phone)-\d+$/.test(item.id)).length>=DEVELOPER_ITEM_LIMIT?`本轮最多生成 ${DEVELOPER_ITEM_LIMIT} 件调试物品；请重新开始后继续测试。`:'');
}

export function setDeveloperEnabled(game,enabled){
 if(!game||typeof enabled!=='boolean')return {ok:false,reason:'开发者工具开关必须明确设为开启或关闭。'};
 game.developerEnabled=enabled;
 return {ok:true,enabled,reason:enabled?'开发者工具已启用，仅对本次页面会话生效。':'开发者工具已关闭。'};
}

export function developerStatus(game){
 const reason=unavailable(game),spawnReason=spawnUnavailable(game),jumpReason=jumpUnavailable(game),outsideReason=outsideUnavailable(game);
 return {enabled:game?.developerEnabled===true,available:!reason,reason:reason||'开发者工具已启用。',canSpawn:!spawnReason,canJumpTime:!jumpReason,canTeleportInside:!reason,canTeleportOutside:!outsideReason,spawnReason,jumpReason,teleportReason:reason,outsideReason};
}

// A disposable view lets the ordinary inventory and drop code plan the entire
// action first. The live item array, its objects, UI, events and pause state are
// never temporarily modified, including when no legal placement is available.
function simulationView(game){
 const view=Object.create(game),collides=game.collides;
 view.events=[];
 view.collides=function(x,z,options={}){return collides.call(this,x,z,{...options,ignoreRender:true})};
 return view;
}
function itemSerial(game){
 let serial=nextItemSerial;
 for(const item of game.items){const match=/^debug-(?:food|water|phone)-(\d+)$/.exec(item.id);if(match)serial=Math.max(serial,Number(match[1])+1)}
 return serial;
}

export function spawnDeveloperItem(game,kind){
 const reason=spawnUnavailable(game);if(reason)return {ok:false,reason};
 if(!KINDS.has(kind))return {ok:false,reason:'只能生成干粮、饮用水或手机。'};
 const serial=itemSerial(game),item={id:`debug-${kind}-${serial}`,kind,developerSpawned:true,state:'world',gridX:null,gridY:null,x:0,y:.005,z:0,placement:'ground',area:game.inRoom()||game.changed?'room':'maze'};
 if(kind==='phone')item.battery=100;
 const view=simulationView(game);view.items=[...game.items,item];
 const size=view.itemSize(item),slot=size&&view.firstInventorySlot(item.id);
 if(slot&&view.canPlaceItem(item.id,slot.x,slot.y))Object.assign(item,{state:'inventory',gridX:slot.x,gridY:slot.y});
 else{
  // drop() owns footprint spacing, route sampling, door/furniture collisions
  // and the standard bounded fallback positions. Only the trial item changes.
  view.mode='playing';view.phoneOpenId=null;item.state='inventory';
  if(view.drop(item.id)!==item.id)return {ok:false,reason:'背包已满，脚边也没有安全空地；没有生成物品。'};
 }
 game.items.push(item);nextItemSerial=serial+1;
 const location=item.state==='inventory'?'inventory':'world';
 return {ok:true,reason:`已生成 1 份${NAMES[kind]}，${location==='inventory'?'放入背包':'背包已满，放在脚边的安全空地'}。`,item,location};
}

export function jumpDeveloperTime(game){
 const reason=jumpUnavailable(game);if(reason)return {ok:false,reason};
 game.elapsed=JUMP_SECONDS;
 return {ok:true,reason:'活动时间已设为 7:30；继续探索 30 秒后才会触发事件，暂停期间不计时。',elapsed:JUMP_SECONDS,remaining:ESCAPE_TRIGGER_SECONDS-JUMP_SECONDS};
}

function teleportSpot(game,target){
 const view=simulationView(game),inside=target==='inside',m=game.maze;
 // Plan against the final open door before committing any real door change.
 if(inside)view.door=view.doorTarget=1;
 const x=m.doorX+(inside?2:-2.5),z=m.doorZ;
 for(const [dx,dz] of [[0,0],[-.3,0],[.3,0],[0,-.5],[0,.5],[-.5,-.5],[-.5,.5],[.5,-.5],[.5,.5]]){
  const point={x:x+dx,z:z+dz};
  if((inside?view.inRoom(point.x,point.z):point.x<m.doorX)&&!view.collides(point.x,point.z,{ignoreRender:true}))return point;
 }
 return null;
}

export function teleportDeveloper(game,target='inside'){
 const reason=unavailable(game);if(reason)return {ok:false,reason};
 if(!['inside','outside'].includes(target))return {ok:false,reason:'请选择马尼拉房间内或门外。'};
 if(target==='outside'){const blocked=outsideUnavailable(game);if(blocked)return {ok:false,reason:blocked}}
 const spot=teleportSpot(game,target);if(!spot)return {ok:false,reason:'传送位置被实体障碍占用，未移动玩家。'};
 const e=game.escape,bypassedChase=!['idle','suppressed','finished'].includes(e.phase),inside=target==='inside';
 if(e.monster)e.monster.active=false;
 // Keep any already-created world overlay: items left on that floor must not
 // lose their geometry. Clear only the live event and its movement restrictions.
 Object.assign(e,{phase:e.triggered?'finished':'suppressed',time:0,chaseTime:0,layout:null,monster:null,progress:0,navClock:0,nav:[],connection:e.connection+1});
 game.pendingFold=null;game.foldPending=false;game.disconnectCharger();
 Object.assign(game.player,spot,{yaw:inside?-Math.PI/2:Math.PI/2,pitch:0});
 game.foundManila=true;if(inside){game.entered=true;game.door=game.doorTarget=1}
 const message=inside?'已传送到马尼拉房间内，门已打开；请手动关门以继续原结局。':'已传送到马尼拉房间门外，原房门状态保持不变。';
 return {ok:true,reason:message+(bypassedChase?' 开发者传送已跳过本次追逐，怪物与黑场已结束。':''),target,position:{...spot},bypassedChase};
}
