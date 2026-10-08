import {LEVEL_ONE_AREAS,LEVEL_ONE_EXIT,levelOneAreaAt} from './level-one-layout.js';
export function resetLevelOneProgress(){return{area:0,elapsed:0,phase:'lit',sprinting:false,readClues:[],sectors:LEVEL_ONE_AREAS.map(()=>({visited:false,encounter:'pending',time:0}))}}
export function updateLevelOneProgress(game,dt){
 const state=game.level1,area=levelOneAreaAt(game.player.x,game.player.z),record=state.sectors[area.id];
 state.area=area.id;
 if(!record.visited){record.visited=true;if(area.id>0)game.events.push(`${area.shortName} · ${area.id===4?'应急灯稳定，可以整理补给或直接继续。':'观察区域编号，寻找下一段通道。'}`)}
 if(!area.encounter){record.encounter='finished';state.phase='lit';return}
 if(record.encounter==='pending'&&game.player.z<=area.encounter.triggerZ){record.encounter='warning';record.time=0}
 if(record.encounter==='warning'||record.encounter==='dark'){
  record.time+=dt;
  if(record.encounter==='warning'&&record.time>=area.encounter.warning){record.encounter='dark';record.time=0}
  else if(record.encounter==='dark'&&record.time>=area.encounter.dark){record.encounter='finished';record.time=0}
 }
 state.phase=['warning','dark'].includes(record.encounter)?record.encounter:'lit';
}
export function levelOneAtExit(game){return Math.abs(game.player.x-LEVEL_ONE_EXIT.x)<LEVEL_ONE_EXIT.halfWidth&&game.player.z<LEVEL_ONE_EXIT.z}
export function nearestLevelOneClue(game){
 if(game.zone!=='level1')return null;
 return LEVEL_ONE_AREAS.flatMap(a=>a.clues).find(c=>Math.hypot(c.x-game.player.x,c.z-game.player.z)<2.1&&game.lineClear(c.x,c.z))||null;
}
export function readLevelOneClue(game){const c=nearestLevelOneClue(game);if(!c)return null;if(!game.level1.readClues.includes(c.id))game.level1.readClues.push(c.id);game.events.push(c.text);return 'route-note'}
export function levelOneObjective(game){
 const a=LEVEL_ONE_AREAS[game.level1.area];
 if(game.levelOneSafe())return `${a.shortName} · 绿色光区安全，服务间两端可通行`;
 if(game.level1.phase==='warning')return `${a.shortName} · 灯光变暗，留意轮廓与附近绿色通道`;
 if(game.level1.phase==='dark')return `${a.shortName} · 拐角可以遮挡视线，奔跑会暴露位置`;
 return a.id===5?'06 管道接近区 · 两侧路线汇合，前往尽头的演示出口':`${a.shortName} · 寻找编号 ${String(a.id+2).padStart(2,'0')}，补给和路线标记在支路`;
}
