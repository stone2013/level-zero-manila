import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {bootControls as boot} from './app-harness.mjs';
// Reader/input cases use lightweight streamed-world meshes; the shipped phone,
// cable, room, simulation and scheduler still execute. Real world geometry and
// loading are covered by stream-render / clear-view integration tests.

const click = {stopPropagation(){}};
const key = (code, extra = {}) => ({code, repeat: false, preventDefault(){}, ...extra});
const pointer = (pointerId, clientX, clientY, extra = {}) => ({pointerId, clientX, clientY, button: 0, preventDefault(){}, stopPropagation(){}, ...extra});
const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
const phone = app => app.eval('game.items.find(i=>i.id==="phone-1")');
function start(options) {
  const app = boot(options); app.element('start').onclick(); app.testTime = 0; return app;
}
function advance(app, seconds) {
  const frames = Math.round(seconds * 20);
  for (let frame = 0; frame < frames; frame++) app.frame(app.testTime += 50);
}
function selectPhone(app) {
  if (!app.eval('game.inventoryOpen')) app.element('backpack').onclick(click);
  app.eval('inventoryNodes.get("phone-1").onclick({detail:0})');
  assert.equal(app.eval('selectedItemId'), 'phone-1');
}
function readPhone(app) {
  selectPhone(app); app.element('consume-item').onclick();
  assert.equal(app.eval('game.phoneOpenId'), 'phone-1');
  assert.equal(app.element('phone-panel').hidden, false);
}
function atCharger(app) {
  app.eval('game.player.x=game.chargerPosition().x-.75;game.player.z=game.chargerPosition().z;sync();updateStreamView()');
  app.settle();
  assert.equal(app.eval('game.nearCharger()'), true);
  assert.equal(app.eval('game.collides(game.player.x,game.player.z)'), false);
}
const survival = app => app.eval('JSON.stringify([game.player,game.food,game.hydration,game.elapsed,game.door,game.doorTarget,game.approach,game.loops,game.foldState])');

test('selecting the stable phone opens a local reader and chapter/back/close restores backpack selection and focus', () => {
  const app = start(); selectPhone(app);
  assert.equal(app.element('consume-item').textContent, '查看资料');
  assert.equal(app.element('consume-item').disabled, false);
  assert.match(app.element('item-description').textContent, /100%.*离线/);
  assert.equal(app.eval('inventoryNodes.get("phone-1").style.gridRow'), '2 / span 1');
  app.element('consume-item').onclick();
  assert.equal(app.element('inventory-panel').hidden, true); assert.equal(app.element('inventory-panel').inert, true);
  assert.equal(app.element('phone-panel').hidden, false); assert.equal(app.element('hud').inert, true);
  assert.equal(app.context.document.activeElement, app.element('phone-close'));
  assert.equal(app.eval('canPlay()'), false); assert.equal(app.eval('canUseInventory()'), false); assert.equal(app.eval('canUsePhone()'), true);
  assert.equal(app.eval('phoneChapterButtons.length'), 3);
  app.eval('phoneChapterButtons[1].onclick()');
  assert.equal(app.element('phone-chapters').hidden, true); assert.equal(app.element('phone-article').hidden, false);
  assert.match(app.element('phone-article-title').textContent, /MANILA/);
  assert.match(app.element('phone-article-copy').textContent, /充电/);
  assert.equal(app.context.document.activeElement, app.element('phone-back'));
  app.element('phone-back').onclick(); assert.equal(app.element('phone-chapters').hidden, false);
  assert.equal(app.element('phone-article').hidden, true);
  assert.equal(app.context.document.activeElement, app.eval('phoneChapterButtons[0]'));
  app.element('phone-close').onclick();
  assert.equal(app.eval('game.phoneOpenId'), null); assert.equal(app.eval('game.inventoryOpen'), true);
  assert.equal(app.element('inventory-panel').hidden, false); assert.equal(app.element('inventory-panel').inert, false);
  assert.equal(app.eval('selectedItemId'), 'phone-1'); assert.equal(app.context.document.activeElement, app.element('consume-item'));
  assert.equal(phone(app).battery, 100); assert.equal(app.eval('game.items.length'), 7);
});

test('foreground frames drain the open phone once while freezing all world simulation', () => {
  const app = start(); app.eval('game.food=60;game.hydration=50;game.entered=true;game.approach=12;game.door=.4;game.doorTarget=1');
  readPhone(app); const before = survival(app); advance(app, 5);
  close(phone(app).battery, 100 - 5 * 100 / 480); assert.equal(survival(app), before);
  assert.equal(app.element('phone-battery-value').textContent, '99%');
  assert.match(app.element('phone-battery')['aria-label'], /99%/);
  app.element('phone-close').onclick(); const battery = phone(app).battery; advance(app, 5);
  assert.equal(phone(app).battery, battery); assert.equal(survival(app), before);
  app.element('inventory-close').onclick(); advance(app, .05);
  assert.notEqual(survival(app), before); assert.equal(phone(app).battery, battery);
  phone(app).battery = 20; readPhone(app); assert.equal(app.element('phone-battery').classList.contains('low'), false);
  advance(app, .05); assert(phone(app).battery < 20);
  assert.equal(app.element('phone-battery').classList.contains('low'), true, 'the low-battery threshold must update within one displayed percent');
});

test('depletion hides cached articles and charger UI restores them without replacing the phone', () => {
  const app = start(); atCharger(app); phone(app).battery = .001; readPhone(app);
  const original = phone(app); app.eval('phoneChapterButtons[0].onclick()'); advance(app, .05);
  assert.equal(phone(app).battery, 0); assert.equal(phone(app), original);
  assert.equal(app.element('phone-battery-value').textContent, '0%');
  assert.equal(app.element('phone-depleted').hidden, false); assert.equal(app.element('phone-article').hidden, true);
  assert.equal(app.element('phone-chapters').hidden, true); assert.equal(app.element('phone-back').hidden, true);
  assert.equal(app.eval('phoneChapterButtons.every(n=>n.disabled)'), true);
  const chapter = app.eval('phoneChapter'); app.eval('phoneChapterButtons[2].onclick()'); assert.equal(app.eval('phoneChapter'), chapter);
  assert.equal(app.element('phone-charge').disabled, false); app.element('phone-charge').onclick();
  assert.equal(app.eval('game.chargingPhoneId'), 'phone-1'); assert.match(app.element('phone-charge-state').textContent, /充电/);
  const before = survival(app); advance(app, 1); close(phone(app).battery, 2.5); assert.equal(survival(app), before);
  assert.equal(app.element('phone-depleted').hidden, true); assert.equal(app.element('phone-article').hidden, false);
  assert.equal(app.eval('phoneChapterButtons.every(n=>!n.disabled)'), true);
  assert.equal(app.element('phone-charge').textContent, '断开充电线');
  advance(app, 39); assert.equal(phone(app).battery, 100); assert.match(app.element('phone-charge-state').textContent, /已充满.*外接电源/);
  assert.equal(app.element('phone-battery-fill').style.width, '100%');
  app.element('phone-charge').onclick(); assert.equal(app.eval('game.chargingPhoneId'), null);
  advance(app, .05); close(phone(app).battery, 100 - .05 * 100 / 480);
});

test('closed reader and backpack keep foreground charging active while the HUD reports the exact bound phone', () => {
  const app = start(); atCharger(app); phone(app).battery = 10; readPhone(app);
  app.element('phone-charge').onclick(); app.element('phone-close').onclick(); const before = survival(app);
  advance(app, 1); close(phone(app).battery, 12.5); assert.equal(survival(app), before);
  assert.match(app.element('item-description').textContent, /13%.*充电中/);
  assert.equal(app.eval('inventoryNodes.get("phone-1").children[1].textContent'), '13%');
  assert.equal(app.element('charging-hud').hidden, false); assert.match(app.element('charging-hud').textContent, /13%.*充电中/);
  app.element('inventory-close').onclick(); advance(app, 1); close(phone(app).battery, 15);
  assert.notEqual(survival(app), before); assert.equal(app.element('charging-hud').hidden, false);
  app.eval('game.move(-.75,0);sync()'); assert.equal(app.eval('game.chargingPhoneId'), null);
  assert.equal(app.element('charging-hud').hidden, true);
});

test('background, blur and pagehide close the reader and freeze charge until explicit resume with no catch-up', () => {
  const app = start(); atCharger(app); phone(app).battery = 20;
  for (const kind of ['hidden', 'blur', 'pagehide']) {
    readPhone(app); if (!app.eval('game.chargingPhoneId')) app.element('phone-charge').onclick();
    if (kind === 'hidden') {app.context.document.hidden = true; app.dispatch('document', 'visibilitychange');}
    else app.dispatch('window', kind);
    assert.equal(app.eval('game.mode'), 'paused'); assert.equal(app.eval('game.phoneOpenId'), null);
    assert.equal(app.eval('game.inventoryOpen'), false); assert.equal(app.element('phone-panel').hidden, true);
    const saved = app.eval('JSON.stringify(game.snapshot())'); app.frame(app.testTime += 60000);
    if (kind === 'hidden') {app.context.document.hidden = false; app.dispatch('document', 'visibilitychange');}
    app.frame(app.testTime += 60000); assert.equal(app.eval('JSON.stringify(game.snapshot())'), saved);
    const battery = phone(app).battery; app.element('resume').onclick(); advance(app, .05);
    close(phone(app).battery, battery + .125); assert.equal(app.eval('game.phoneOpenId'), null);
  }
});

test('portrait preserves the reader but freezes battery, blocks its controls and restores focus on landscape', () => {
  const app = start(); atCharger(app); phone(app).battery = 40; readPhone(app);
  app.element('phone-charge').onclick(); app.eval('phoneChapterButtons[1].onclick()');
  const focused = app.context.document.activeElement, saved = app.eval('JSON.stringify(game.snapshot())');
  app.rotate(390, 844); assert.equal(app.eval('canUsePhone()'), false);
  assert.equal(app.element('game-shell').inert, true); assert.equal(app.context.document.activeElement, app.element('rotate-title'));
  advance(app, 10); app.element('phone-close').onclick(); app.element('phone-back').onclick(); app.element('phone-charge').onclick();
  app.eval('phoneChapterButtons[2].onclick()'); app.dispatch('window', 'keydown', key('Escape'));
  assert.equal(app.eval('JSON.stringify(game.snapshot())'), saved); assert.equal(app.eval('phoneChapter'), 1);
  app.rotate(844, 390); assert.equal(app.eval('canUsePhone()'), true); assert.equal(app.context.document.activeElement, focused);
  advance(app, .05); close(phone(app).battery, 40.125);
});

test('manual pause, settings, menu and note freeze devices; continuing preserves charge and restarting resets it', () => {
  const app = start(); atCharger(app); phone(app).battery = 50; readPhone(app); app.element('phone-charge').onclick();
  app.element('pause').onclick(); assert.equal(app.eval('game.phoneOpenId'), null); advance(app, 2); assert.equal(phone(app).battery, 50);
  app.element('pause-help').onclick(); advance(app, 2); assert.equal(phone(app).battery, 50);
  app.element('help-close').onclick(); assert.equal(app.eval('game.mode'), 'paused');
  app.element('main-menu').onclick(); advance(app, 2); assert.equal(app.eval('game.mode'), 'menu'); assert.equal(phone(app).battery, 50);
  app.element('continue').onclick(); advance(app, .05); close(phone(app).battery, 50.125);
  app.eval('game.mode="note";showState()'); advance(app, 2); close(phone(app).battery, 50.125);
  app.element('note-close').onclick(); readPhone(app); app.eval('phoneChapterButtons[2].onclick()');
  app.element('pause').onclick(); app.element('restart').onclick();
  assert.equal(app.eval('game.phoneOpenId'), null); assert.equal(app.eval('game.chargingPhoneId'), null);
  assert.equal(phone(app).battery, 100); assert.equal(phone(app).state, 'inventory');
  assert.equal(app.eval('phoneChapter'), -1); assert.equal(app.element('phone-panel').hidden, true);
  assert.equal(app.eval('game.items.length'), 7); assert.equal(app.eval('game.items.filter(i=>i.kind==="phone").length'), 1);
  readPhone(app); assert.equal(app.element('phone-chapters').hidden, false); assert.equal(app.element('phone-article').hidden, true);
});

test('phone tab order stays in the visible enabled reader controls and never leaks gameplay keys', () => {
  const app = start({coarse: false, mobile: false});
  app.dispatch('window', 'keydown', key('KeyW')); app.dispatch('window', 'keydown', key('ShiftLeft'));
  readPhone(app); assert.equal(app.eval('keys.size'), 0);
  const saved = app.eval('JSON.stringify(game.snapshot())');
  for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE', 'ShiftLeft', 'ArrowUp', 'Space']) app.dispatch('window', 'keydown', key(code));
  app.dispatch('stick', 'pointerdown', pointer(11, 100, 220)); app.dispatch('look', 'pointerdown', pointer(12, 200, 220));
  app.dispatch('sprint', 'pointerdown', pointer(13, 100, 220)); app.element('interact').onclick(click);
  assert.equal(app.eval('keys.size+touch.sprint.size'), 0); assert.equal(app.captured.size, 0);
  assert.equal(app.eval('JSON.stringify(game.snapshot())'), saved);
  const chapters = app.eval('phoneChapterButtons');
  app.element('phone-close').focus(); app.dispatch('window', 'keydown', key('Tab'));
  assert.equal(app.context.document.activeElement, chapters[0]);
  app.dispatch('window', 'keydown', key('Tab', {shiftKey: true})); assert.equal(app.context.document.activeElement, app.element('phone-close'));
  for (let i = 0; i < 12; i++) {
    app.dispatch('window', 'keydown', key('Tab'));
    assert([...chapters, app.element('phone-close')].includes(app.context.document.activeElement));
  }
  app.eval('phoneChapterButtons[0].onclick()'); app.dispatch('window', 'keydown', key('Tab'));
  assert.equal(app.context.document.activeElement, app.element('phone-close'));
  app.dispatch('window', 'keydown', key('Tab')); assert.equal(app.context.document.activeElement, app.element('phone-back'));
  phone(app).battery = 0; app.eval('renderPhone(true)'); app.dispatch('window', 'keydown', key('Tab'));
  assert.equal(app.context.document.activeElement, app.element('phone-close'));
  app.dispatch('window', 'keydown', key('Escape', {repeat: true})); assert.equal(app.eval('game.phoneOpenId'), 'phone-1');
  app.dispatch('window', 'keydown', key('Escape')); assert.equal(app.eval('game.phoneOpenId'), null); assert.equal(app.eval('game.inventoryOpen'), true);
  app.dispatch('window', 'keydown', key('KeyI')); assert.equal(app.eval('game.inventoryOpen'), false); assert.equal(app.eval('game.mode'), 'playing');
  assert.equal(app.eval('keys.size'), 0);
  atCharger(app); readPhone(app); app.dispatch('window', 'keydown', key('Tab'));
  assert.equal(app.context.document.activeElement, app.element('phone-charge'));
  app.dispatch('window', 'keydown', key('Tab', {shiftKey: true})); assert.equal(app.context.document.activeElement, app.element('phone-close'));
});

test('reader opening releases pointer lock without adding a hidden manual pause', () => {
  const app = start({coarse: false, mobile: false});
  app.context.document.pointerLockElement = app.element('world');
  app.context.document.exitPointerLock = () => {app.context.document.pointerLockElement = null; app.dispatch('document', 'pointerlockchange');};
  readPhone(app); assert.equal(app.eval('game.mode'), 'playing'); assert.equal(app.eval('canUsePhone()'), true);
  advance(app, .05); close(phone(app).battery, 100 - .05 * 100 / 480);
  app.element('phone-close').onclick(); assert.equal(app.eval('game.mode'), 'playing');
});

test('left-discarded phone retains stable identity and battery in its visible floor mesh and can be recovered', () => {
  const app = start(); phone(app).battery = 37.25; const original = phone(app); selectPhone(app);
  app.context.pe = pointer(4, 135, 185); app.eval('beginInventoryDrag(pe,"phone-1")');
  app.dispatch('inventory-panel', 'pointermove', pointer(4, 40, 185)); assert.equal(app.element('discard-zone').hidden, false);
  app.dispatch('inventory-panel', 'pointerup', pointer(4, 40, 185));
  assert.equal(phone(app), original); assert.equal(phone(app).state, 'world'); assert.equal(phone(app).battery, 37.25);
  assert.equal(app.eval('inventoryNodes.has("phone-1")'), false); assert.equal(app.eval('game.items.length'), 7);
  const mesh = app.eval('itemMeshes.get("phone-1")'); assert.equal(mesh.visible, true);
  close(mesh.position.x, original.x); close(mesh.position.y, .005); close(mesh.position.z, original.z);
  assert.equal(mesh.children.length, 3); assert.equal(mesh.children[0].material, app.eval('mat.phone'));
  const saved = app.eval('JSON.stringify(game.items)'); app.dispatch('inventory-panel', 'pointerup', pointer(4, 40, 185));
  assert.equal(app.eval('JSON.stringify(game.items)'), saved);
  app.element('inventory-close').onclick(); app.element('interact').onclick(click);
  assert.equal(phone(app), original); assert.equal(phone(app).state, 'inventory'); assert.equal(phone(app).battery, 37.25);
  assert.equal(mesh.visible, false); selectPhone(app);
  assert.match(app.element('item-description').textContent, /38%/); assert.equal(app.eval('game.items.length'), 7);
});

test('table cable has visible geometry, a matching physical target and a collision-free approach', () => {
  const app = start(), cables = app.eval('roomGroup.children.filter(o=>o.userData.chargingCable)');
  assert.equal(cables.length, 1); const cable = cables[0];
  assert.equal(cable.visible, true); assert.equal(cable.isMesh, true);
  assert.equal(cable.geometry.type, 'TubeGeometry'); assert.equal(cable.geometry.parameters.radius, .012);
  assert.equal(cable.material, app.eval('mat.cable'));
  const endpoint = cable.geometry.parameters.path.getPoint(1), target = app.eval('game.chargerPosition()');
  assert(Math.hypot(endpoint.x - target.x, endpoint.z - target.z) < .2); assert(endpoint.y > .67 && endpoint.y < .75);
  const obstacles = app.eval('game.obstacles.length');
  app.eval('game.player.x=game.maze.doorX+.5;game.player.z=game.maze.doorZ;game.move(3,0);game.move(0,-.65);sync()');
  assert.equal(app.eval('game.collides(game.player.x,game.player.z)'), false); assert.equal(app.eval('game.nearCharger()'), true);
  assert.equal(app.eval('game.obstacles.length'), obstacles, 'visual cable adds no collider');
  app.element('interact').onclick(click); app.element('interact').onclick(click);
  assert.equal(app.element('interact-label').textContent, '充电');
  assert.equal(app.element('prompt').textContent, '接上充电线');
  app.element('interact').onclick(click); assert.equal(app.eval('game.chargingPhoneId'), 'phone-1');
  assert.equal(app.element('interact-label').textContent, '断开');
  assert.equal(app.element('prompt').textContent, '断开充电线');
});

test('every guide chapter is local and usable without network or geolocation access', () => {
  const app = start(); let attempts = 0;
  app.context.fetch = () => {attempts++; throw new Error('unexpected network access');};
  app.context.XMLHttpRequest = class {constructor(){attempts++; throw new Error('unexpected network access');}};
  app.context.WebSocket = class {constructor(){attempts++; throw new Error('unexpected network access');}};
  Object.defineProperty(app.context.navigator, 'geolocation', {get(){attempts++; throw new Error('unexpected GPS access');}});
  readPhone(app); assert.match(app.element('phone-charge-state').textContent, /离线.*无定位/);
  const chapters = app.eval('PHONE_GUIDE'); assert.equal(chapters.length, 3);
  for (let index = 0; index < chapters.length; index++) {
    app.eval(`phoneChapterButtons[${index}].onclick()`);
    assert.equal(app.element('phone-article-title').textContent, chapters[index].title);
    assert.equal(app.element('phone-article-copy').textContent, chapters[index].copy);
    assert(chapters[index].copy.length > 50); app.element('phone-back').onclick();
  }
  assert.equal(attempts, 0);
  const source = fs.readFileSync('dist/app.js', 'utf8');
  assert(!/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|geolocation|watchPosition|getCurrentPosition)\b/.test(source));
  const html = fs.readFileSync('dist/index.html', 'utf8');
  assert.match(html, /id="phone-card"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /id="phone-context"[^>]*>[^<]*本游戏改编/);
});

test('offline cache includes the exact embedded guide code and phone icon without falling back to network', async () => {
  const scope = 'https://example.test/game/', handlers = {}, stored = new Map(); let network = 0, waiting, response;
  const cache = {
    async addAll(requests) {
      for (const request of requests) {
        const relative = new URL(request.url).pathname.slice(new URL(scope).pathname.length) || 'index.html';
        stored.set(request.url, fs.readFileSync(`dist/${relative}`));
      }
    },
    async match(request) {return stored.get(typeof request === 'string' ? request : request.url ?? request.href);}
  };
  const self = {registration: {scope}, location: {origin: new URL(scope).origin}, addEventListener: (event, handler) => handlers[event] = handler};
  vm.runInNewContext(fs.readFileSync('dist/sw.js', 'utf8'), {
    self, URL, Request, caches: {open: async () => cache}, fetch: async () => {network++; throw new Error('offline');}
  });
  handlers.install({waitUntil: promise => waiting = promise}); await waiting;
  for (const name of ['app.js', 'icons/item-phone.svg']) {
    handlers.fetch({request: {method: 'GET', mode: 'cors', url: new URL(name, scope).href}, respondWith: promise => response = promise});
    const bytes = await response; assert(bytes?.length > 0);
    assert.deepEqual(bytes, fs.readFileSync(`dist/${name}`));
    if (name === 'app.js') assert(bytes.toString().includes('const PHONE_GUIDE=Object.freeze(['));
  }
  assert.equal(network, 0);
});
