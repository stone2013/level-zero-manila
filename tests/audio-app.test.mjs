import test from 'node:test';
import assert from 'node:assert/strict';
import {bootControls as boot} from './app-harness.mjs';
import {FakeAudioContext,flush} from './audio-harness.mjs';
const key=code=>({code,repeat:false,preventDefault(){}}),click={stopPropagation(){}};
async function start(options={}){const app=boot({AudioContext:FakeAudioContext,...options});assert.equal(app.eval('gameAudio.context'),null);app.element('start').onclick();await flush();app.frame(50);return app}
const count=(app,kind)=>app.eval(`[...gameAudio.voices].filter(v=>v.kind==='${kind}').length`);

test('start unlocks before fullscreen and starts one modest hum after loading',async()=>{
 const calls=[];class Context extends FakeAudioContext{resume(){calls.push('resume');return super.resume()}}
 const app=await start({AudioContext:Context,fullscreen:async()=>calls.push('fullscreen'),lock:async()=>calls.push('landscape')});
 assert.deepEqual(calls.slice(0,2),['resume','fullscreen']);assert.equal(count(app,'hum'),1);assert.equal(app.eval('gameAudio.master.gain.value'),.8);
 for(let i=0;i<5;i++){app.dispatch('document','pointerdown');await flush();app.frame(100+i*50)}assert.equal(count(app,'hum'),1);
});
test('real door action triggers creak, animation endpoint triggers latch, and unrelated interaction stays quiet',async()=>{
 const app=await start();app.eval('game.player.x=game.maze.doorX-.85;game.player.z=game.maze.doorZ;updateStreamView()');app.settle();app.frame(100);
 assert.equal(app.eval('game.nearDoor()'),true);app.element('interact').onclick(click);assert.equal(app.eval('game.doorTarget'),1);assert.equal(count(app,'door'),1);
 for(let t=150;t<=1000;t+=50)app.frame(t);assert.equal(app.eval('game.door'),1);assert.equal(count(app,'latch'),1);
 app.eval('game.player.x=game.maze.doorX-6;updateStreamView()');app.settle();app.element('interact').onclick(click);assert.equal(count(app,'door'),1);
});
test('ArrowUp and touch movement produce steps; blocked movement does not',async()=>{
 const app=await start();app.eval('game.player.x=game.maze.doorX+2;game.player.z=game.maze.doorZ;game.player.yaw=0;game.entered=true;game.changed=true;updateStreamView()');app.settle();app.frame(100);
 app.dispatch('window','keydown',key('ArrowUp'));for(let t=150;t<=650;t+=50)app.frame(t);assert(count(app,'step')>=1);
 app.dispatch('window','keyup',key('ArrowUp'));app.eval('gameAudio.resetTracking();input.strafe=1');for(let t=700;t<=1200;t+=50)app.frame(t);assert(count(app,'step')>=2);
 app.eval('input.strafe=0');const before=count(app,'step');for(let t=1250;t<=2000;t+=50)app.frame(t);assert.equal(count(app,'step'),before);
});
test('doorway pursuit is audible on an independent cadence while walking and stops after world change',async()=>{
 const app=await start();app.eval('game.player.x=game.maze.doorX+2;game.player.z=game.maze.doorZ;game.entered=true;game.door=game.doorTarget=1;game.approach=20;game.player.yaw=0;updateStreamView()');app.settle();app.eval('input.forward=.7');
 for(let t=100;t<=1350;t+=50)app.frame(t);assert.equal(count(app,'pursuit'),1);assert(count(app,'step')>=1,'walking must not suppress pursuit');
 app.eval('game.changed=true');const before=count(app,'pursuit');for(let t=1400;t<=2800;t+=50)app.frame(t);assert.equal(count(app,'pursuit'),before);
});
test('pause, inventory, phone, portrait, background and pagehide immediately clear all game sounds',async()=>{
 for(const stop of ['pause','inventory','phone','portrait','background','pagehide']){
  const app=await start();app.eval('gameAudio.door()');assert(app.eval('gameAudio.voices.size')>1);
  if(stop==='pause')app.element('pause').onclick();
  if(stop==='inventory')app.element('backpack').onclick(click);
  if(stop==='phone'){app.element('backpack').onclick(click);app.eval('inventoryNodes.get("phone-1").onclick({detail:0})');app.element('consume-item').onclick()}
  if(stop==='portrait')app.rotate(390,844);
  if(stop==='background'){app.context.document.hidden=true;app.dispatch('document','visibilitychange')}
  if(stop==='pagehide')app.dispatch('window','pagehide');
  assert.equal(app.eval('gameAudio.voices.size'),0,stop);assert.equal(app.eval('gameAudio.master.gain.value'),0,stop);
  app.frame(100);assert.equal(app.eval('gameAudio.voices.size'),0,stop);
 }
});
test('muted choice survives restart/menu/continue, and enabling in settings waits for play',async()=>{
 const app=await start();app.element('pause').onclick();app.element('pause-help').onclick();app.element('sound-toggle').onclick();assert.equal(app.eval('soundEnabled'),false);assert.equal(app.eval('gameAudio.voices.size'),0);
 app.element('help-close').onclick();for(let i=0;i<4;i++){app.element('restart').onclick();await flush();app.frame(100+i*50);assert.equal(app.eval('gameAudio.voices.size'),0)}
 app.element('pause').onclick();app.element('main-menu').onclick();app.element('continue').onclick();await flush();app.frame(400);assert.equal(app.eval('gameAudio.voices.size'),0);
 app.element('pause').onclick();app.element('pause-help').onclick();app.element('sound-toggle').onclick();await flush();assert.equal(app.eval('gameAudio.voices.size'),0);app.element('help-close').onclick();app.element('resume').onclick();await flush();app.frame(450);assert.equal(count(app,'hum'),1);
});
test('failed start resume has actionable feedback and a new gameplay touch can recover',async()=>{
 let failed=true;class Context extends FakeAudioContext{resume(){this.resumeCalls++;if(failed)return Promise.reject(Error('NotAllowedError'));this.state='running';return Promise.resolve()}}
 const app=await start({AudioContext:Context});assert.equal(count(app,'hum'),0);assert.match(app.element('toast').textContent,/声音未能启动/);assert.equal(app.eval('gameAudio.errorReported'),true);
 failed=false;app.dispatch('document','pointerdown');await flush();app.frame(100);assert.equal(count(app,'hum'),1);assert.equal(app.eval('gameAudio.context.resumeCalls'),2);
});
test('background interruption stays silent after returning until fresh resume; Escape resumes audio too',async()=>{
 const app=await start();app.context.document.hidden=true;app.dispatch('document','visibilitychange');app.eval('gameAudio.context.stateChange("interrupted")');app.context.document.hidden=false;app.dispatch('document','visibilitychange');app.frame(100);assert.equal(app.eval('gameAudio.voices.size'),0);assert.equal(app.eval('game.mode'),'paused');
 app.dispatch('window','keydown',key('Escape'));await flush();app.frame(150);assert.equal(app.eval('game.mode'),'playing');assert.equal(count(app,'hum'),1);
});
