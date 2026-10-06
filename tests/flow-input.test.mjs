import test from 'node:test';
import assert from 'node:assert/strict';
import {bootControls as boot} from './app-harness.mjs';

const click={stopPropagation(){}};
const key=(code,repeat=false)=>({code,repeat,preventDefault(){}});
function start(){const app=boot();app.element('start').onclick();return app}
function escape(app,repeat=false){app.dispatch('window','keydown',key('Escape',repeat))}

test('holding Escape pauses once and cannot resume until a fresh press',()=>{
 const app=start();escape(app);assert.equal(app.eval('game.mode'),'paused');
 const before=app.eval('JSON.stringify(game.snapshot())');
 for(let i=1;i<=5;i++){escape(app,true);app.frame(i*50);assert.equal(app.eval('game.mode'),'paused')}
 assert.equal(app.eval('JSON.stringify(game.snapshot())'),before);
 app.dispatch('window','keyup',key('Escape'));escape(app);assert.equal(app.eval('game.mode'),'playing');
 for(let i=0;i<5;i++){escape(app,true);assert.equal(app.eval('game.mode'),'playing')}
});

test('held Escape closes one phone or backpack layer without also pausing exploration',()=>{
 const app=start();app.element('backpack').onclick(click);
 app.eval('inventoryNodes.get("phone-1").onclick({detail:0})');app.element('consume-item').onclick();
 escape(app);assert.equal(app.eval('game.phoneOpenId'),null);assert.equal(app.eval('game.inventoryOpen'),true);
 for(let i=0;i<5;i++){escape(app,true);assert.equal(app.eval('game.inventoryOpen'),true);assert.equal(app.eval('game.mode'),'playing')}
 app.dispatch('window','keyup',key('Escape'));escape(app);assert.equal(app.eval('game.inventoryOpen'),false);
 for(let i=0;i<5;i++){escape(app,true);assert.equal(app.eval('game.inventoryOpen'),false);assert.equal(app.eval('game.mode'),'playing')}
 app.dispatch('window','keyup',key('Escape'));escape(app);assert.equal(app.eval('game.mode'),'paused');
});

test('Escape repeats after dismissing settings preserve the existing manual pause',()=>{
 const app=start();app.element('pause').onclick();app.element('pause-help').onclick();
 escape(app);assert.equal(app.element('help').hidden,true);assert.equal(app.eval('game.mode'),'paused');
 for(let i=0;i<5;i++){escape(app,true);assert.equal(app.eval('game.mode'),'paused');assert.equal(app.element('pause-panel').hidden,false)}
 app.dispatch('window','keyup',key('Escape'));escape(app);assert.equal(app.eval('game.mode'),'playing');
});

test('settings blocks underlying actions and freezes survival and charging until explicitly resumed',()=>{
 const app=start();
 app.eval('game.player.x=game.chargerPosition().x-.75;game.player.z=game.chargerPosition().z;game.items.find(i=>i.id==="phone-1").battery=50;game.connectCharger("phone-1");updateStreamView()');app.settle();
 app.element('pause').onclick();app.element('pause-help').focus();app.element('pause-help').onclick();
 assert.equal(app.context.document.activeElement,app.element('sound-toggle'));
 for(const id of ['menu','pause-panel','hud','inventory-panel','phone-panel'])assert.equal(app.element(id).inert,true,id);
 const before=app.eval('JSON.stringify(game.snapshot())');
 for(const id of ['start','continue','resume','restart','again','main-menu','note-close'])app.element(id).onclick();
 app.element('backpack').onclick(click);app.element('quit').onclick();app.element('help-open').onclick();
 assert.equal(app.element('quit-panel').hidden,true);assert.equal(app.element('help').hidden,false);
 for(let t=50;t<=1000;t+=50)app.frame(t);
 assert.equal(app.eval('JSON.stringify(game.snapshot())'),before);
 app.element('help-close').onclick();assert.equal(app.context.document.activeElement,app.element('pause-help'));
 assert.equal(app.eval('game.mode'),'paused');assert.equal(app.element('pause-panel').hidden,false);
 for(const id of ['menu','pause-panel','hud','inventory-panel','phone-panel'])assert.equal(app.element(id).inert,false,id);
 app.element('resume').onclick();app.frame(1050);
 assert.equal(app.eval('game.mode'),'playing');assert(app.eval('game.elapsed')>0);
 assert.equal(app.eval('game.phone("phone-1").battery'),50.125);
});

test('settings and quit gate gameplay even if the model momentarily reports playing',()=>{
 for(const id of ['help-open','quit']){
  const app=boot();app.element(id).onclick();app.eval('game.mode="playing"');
  const before=app.eval('JSON.stringify(game.snapshot())');assert.equal(app.eval('canPlay()'),false);
  app.dispatch('window','keydown',key('KeyW'));app.frame(50);
  assert.equal(app.eval('JSON.stringify(game.snapshot())'),before);
 }
});

test('settings Tab and Shift+Tab cycle only through enabled modal controls in event dispatch',()=>{
 const app=boot();app.element('help-open').focus();app.element('help-open').onclick();
 const tab=(shiftKey=false)=>app.dispatch('window','keydown',{...key('Tab'),shiftKey});
 const order=['sound-toggle','quality-toggle','developer-toggle','help-close'];
 for(let i=1;i<=12;i++){tab();assert.equal(app.context.document.activeElement,app.element(order[i%4]))}
 tab(true);assert.equal(app.context.document.activeElement,app.element('help-close'));
 app.element('quality-toggle').disabled=true;app.element('sound-toggle').focus();tab();assert.equal(app.context.document.activeElement,app.element('developer-toggle'));
 app.element('start').focus();tab();assert.equal(app.context.document.activeElement,app.element('sound-toggle'));
 app.element('start').focus();tab(true);assert.equal(app.context.document.activeElement,app.element('help-close'));
 escape(app,true);assert.equal(app.element('help').hidden,false);
 escape(app);assert.equal(app.element('help').hidden,true);assert.equal(app.context.document.activeElement,app.element('help-open'));
 assert.equal(app.eval('game.mode'),'menu');assert.equal(app.element('menu').inert,false);
 app.element('help-close').onclick();assert.equal(app.context.document.activeElement,app.element('help-open'));
});

test('quit cannot start or reset a run and retains its single-control focus until dismissal',()=>{
 const app=start();app.element('pause').onclick();app.element('main-menu').onclick();
 const before=app.eval('JSON.stringify(game.snapshot())');app.element('quit').focus();app.element('quit').onclick();
 assert.equal(app.context.document.activeElement,app.element('quit-back'));assert.equal(app.element('menu').inert,true);
 for(const id of ['start','continue','resume','restart','again','main-menu','note-close'])app.element(id).onclick();
 app.element('help-open').onclick();app.element('quit').onclick();assert.equal(app.element('help').hidden,true);
 for(const shiftKey of [false,true,false,true]){
  app.dispatch('window','keydown',{...key('Tab'),shiftKey});assert.equal(app.context.document.activeElement,app.element('quit-back'));
 }
 assert.equal(app.eval('JSON.stringify(game.snapshot())'),before);
 escape(app,true);assert.equal(app.element('quit-panel').hidden,false);
 app.element('quit-back').onclick();assert.equal(app.element('quit-panel').hidden,true);
 assert.equal(app.context.document.activeElement,app.element('quit'));assert.equal(app.element('menu').inert,false);
 assert.equal(app.eval('JSON.stringify(game.snapshot())'),before);
 app.element('continue').onclick();assert.equal(app.eval('game.mode'),'playing');
});

test('blur, background, pagehide and rotation preserve settings or quit without enabling underlying controls',()=>{
 for(const kind of ['help','quit']){
  const app=start();app.element('pause').onclick();
  if(kind==='quit')app.element('main-menu').onclick();
  const trigger=kind==='help'?'pause-help':'quit',panel=kind==='help'?'help':'quit-panel',close=kind==='help'?'help-close':'quit-back';
  app.element(trigger).onclick();const before=app.eval('JSON.stringify(game.snapshot())'),focus=app.context.document.activeElement;
  for(const event of ['blur','pagehide']){app.dispatch('window',event);assert.equal(app.element(panel).hidden,false);assert.equal(app.element('menu').inert,true)}
  app.context.document.hidden=true;app.dispatch('document','visibilitychange');app.element(close).onclick();app.frame(60000);
  assert.equal(app.element(panel).hidden,false);app.context.document.hidden=false;app.dispatch('document','visibilitychange');
  app.rotate(390,844);app.element(close).onclick();escape(app);assert.equal(app.element(panel).hidden,false);
  app.frame(120000);app.rotate(844,390);assert.equal(app.context.document.activeElement,focus);
  assert.equal(app.element(panel).hidden,false);assert.equal(app.element('menu').inert,true);assert.equal(app.eval('canPlay()'),false);
  assert.equal(app.eval('JSON.stringify(game.snapshot())'),before);
  app.element(close).onclick();assert.equal(app.context.document.activeElement,app.element(trigger));assert.equal(app.element('menu').inert,false);
  assert.equal(app.eval('game.mode'),kind==='help'?'paused':'menu');
 }
});
