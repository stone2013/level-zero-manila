import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, PHONE_DRAIN_PER_SECOND, PHONE_CHARGE_PER_SECOND} from '../dist/game.js';

const PHONE = 'phone-1';
const originalIds = ['food-1', 'food-2', 'food-3', 'food-4', 'water-1', 'water-2', PHONE];
const createGame = (seed = 42) => {const g = new Game(seed); g.start(); return g;};
const item = (g, id = PHONE) => g.items.find(i => i.id === id);
const close = (actual, expected, message = '') => assert(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);
function deviceTime(g, seconds, active = true) {
  const frames = Math.floor(seconds / .05);
  for (let frame = 0; frame < frames; frame++) g.updateDevices(.05, active);
  const remainder = seconds - frames * .05;
  if (remainder > 1e-9) g.updateDevices(remainder, active);
}
function atCharger(g) {
  const c = g.chargerPosition();
  Object.assign(g.player, {x: c.x - .75, z: c.z, yaw: 0});
  assert(!g.collides(g.player.x, g.player.z), 'charger fixture is a walkable position');
  assert(g.nearCharger());
}
function occupiedCells(g) {
  const cells = new Set();
  for (const held of g.inventory()) {
    const {w, h} = g.itemSize(held);
    assert(Number.isInteger(held.gridX) && Number.isInteger(held.gridY));
    assert(held.gridX >= 0 && held.gridY >= 0 && held.gridX + w <= 4 && held.gridY + h <= 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const key = `${held.gridX + x},${held.gridY + y}`;
      assert(!cells.has(key), `overlap at ${key}`); cells.add(key);
    }
  }
  return cells;
}

test('reset appends one full 1×1 phone after the six stable legacy items', () => {
  for (const seed of [0, 1, 42, 0xFFFFFFFF]) {
    const g = new Game(seed), phone = item(g);
    assert.deepEqual(g.items.map(i => i.id), originalIds);
    assert.equal(g.items.filter(i => i.kind === 'phone').length, 1);
    assert.equal(phone.state, 'inventory'); assert.equal(phone.battery, 100);
    assert.deepEqual(g.itemSize(phone), {w: 1, h: 1});
    assert.deepEqual(g.itemSize(PHONE), {w: 1, h: 1});
    assert.deepEqual([phone.gridX, phone.gridY], [0, 1]);
    assert.equal(g.inventory('food').length, 4); assert.equal(g.inventory('water').length, 0);
    assert.equal(g.inventory().length, 5); assert.equal(occupiedCells(g).size, 5);
    assert.equal(g.phoneOpenId, null); assert.equal(g.chargingPhoneId, null);
    assert.equal(g.phone(PHONE), phone); assert.equal(g.phone('food-1'), undefined);
  }
});

test('phone opens only a held phone in play, and invalid opens preserve the current reader', () => {
  const g = new Game(42);
  assert.equal(g.openPhone(PHONE), false);
  g.start(); assert.equal(g.openPhone(PHONE), true); assert.equal(g.phone(), item(g));
  for (const id of ['food-1', 'water-1', 'missing', null, '', undefined]) {
    assert.equal(g.openPhone(id), false); assert.equal(g.phoneOpenId, PHONE);
  }
  assert.equal(g.closePhone(), true); assert.equal(g.closePhone(), false);
  assert.equal(g.drop(PHONE), PHONE); assert.equal(g.phone(PHONE), undefined);
  assert.equal(g.openPhone(PHONE), false);
  assert.equal(g.pickupItem(PHONE), PHONE);
  for (const mode of ['menu', 'paused', 'note', 'won', 'lost']) {
    g.mode = mode; assert.equal(g.openPhone(PHONE), false); assert.equal(g.phoneOpenId, null);
  }
});

test('opening the reader freezes world state and disallows inventory and world actions', () => {
  const g = createGame();
  g.entered = true; g.approach = 11; g.door = .4; g.doorTarget = 1;
  g.food = 50; g.hydration = 60; assert(g.openPhone(PHONE));
  const before = g.snapshot();
  for (let frame = 0; frame < 100; frame++) g.update(.05, {forward: 1, strafe: 1, sprint: true});
  g.move(10, 10); assert.equal(g.interact(), undefined);
  assert.equal(g.openInventory(), false); assert.equal(g.moveInventoryItem(PHONE, 3, 3), false);
  assert.equal(g.arrangeInventory(), false); assert.equal(g.drop(PHONE), undefined);
  assert.equal(g.consume('food', 'food-1'), undefined); assert.equal(g.pickupItem('water-1'), undefined);
  assert.deepEqual(g.snapshot(), before, 'world updates must not also advance device time');
  g.updateDevices(.05); close(item(g).battery, 100 - .05 * PHONE_DRAIN_PER_SECOND);
  const after = g.snapshot(); after.items = before.items;
  assert.deepEqual(after, before, 'the device clock changes no survival or world state');
});

test('device clock drains a full unpowered reader in eight minutes without consuming the phone', () => {
  const g = createGame(), phone = item(g), ids = g.items.map(i => i.id);
  assert.equal(PHONE_DRAIN_PER_SECOND, 100 / 480);
  assert(g.openPhone(PHONE)); deviceTime(g, 240); close(phone.battery, 50);
  deviceTime(g, 240.05); assert.equal(phone.battery, 0);
  assert.equal(phone.state, 'inventory'); assert.equal(g.phoneOpenId, PHONE);
  assert.equal(g.phone(), phone); assert.deepEqual(g.items.map(i => i.id), ids);
  const events = [...g.events]; deviceTime(g, 60);
  assert.equal(phone.battery, 0); assert.deepEqual(g.events, events, 'depletion notification is not repeated');
  g.closePhone(); assert(g.openPhone(PHONE), 'a dead phone may show its dead-battery screen');
  deviceTime(g, 1); assert.equal(phone.battery, 0);
});

test('closed, unconnected phones do not drain and survival update never ticks devices implicitly', () => {
  const g = createGame(), phone = item(g); phone.battery = 62.25;
  deviceTime(g, 600); assert.equal(phone.battery, 62.25);
  for (let frame = 0; frame < 100; frame++) g.update(.05);
  assert.equal(phone.battery, 62.25); assert(g.elapsed > 0);
  assert(g.openPhone(PHONE)); g.update(.05); assert.equal(phone.battery, 62.25);
  g.updateDevices(.05); close(phone.battery, 62.25 - .05 * PHONE_DRAIN_PER_SECOND);
});

test('each device tick clamps catch-up and ignores negative, zero, and nonfinite frame durations', () => {
  const g = createGame(), phone = item(g); phone.battery = 50; g.openPhone(PHONE);
  for (const dt of [0, -1, NaN, Infinity, -Infinity, undefined, null, '0.05']) {
    g.updateDevices(dt); assert.equal(phone.battery, 50);
  }
  g.updateDevices(30); close(phone.battery, 50 - .05 * PHONE_DRAIN_PER_SECOND);
  atCharger(g); assert(g.connectCharger(PHONE)); phone.battery = 50;
  g.updateDevices(30); close(phone.battery, 50 + .05 * PHONE_CHARGE_PER_SECOND);
});

test('device time freezes explicitly in background/portrait/inactive UI and all nonplaying modes', () => {
  const g = createGame(), phone = item(g); atCharger(g);
  phone.battery = 50; assert(g.connectCharger(PHONE)); assert(g.openPhone(PHONE));
  const before = g.snapshot(); deviceTime(g, 60, false); assert.deepEqual(g.snapshot(), before);
  for (const mode of ['menu', 'paused', 'note', 'won', 'lost']) {
    g.mode = mode; const snapshot = g.snapshot(); deviceTime(g, 60);
    assert.deepEqual(g.snapshot(), snapshot, `${mode} must freeze charging and drain`);
  }
  g.mode = 'playing'; g.updateDevices(.05); close(phone.battery, 50 + .05 * PHONE_CHARGE_PER_SECOND);
  g.disconnectCharger(); const readingBattery = phone.battery;
  deviceTime(g, 60, false); assert.equal(phone.battery, readingBattery);
});

test('backpack and reader freeze survival while connected charging continues exactly once per explicit tick', () => {
  const g = createGame(), phone = item(g); atCharger(g); phone.battery = 10;
  assert(g.connectCharger(PHONE)); assert(g.openInventory());
  const survival = [g.elapsed, g.food, g.hydration, g.approach, g.door];
  for (let frame = 0; frame < 100; frame++) {g.update(.05, {forward: 1}); g.updateDevices(.05);}
  close(phone.battery, 22.5); assert.deepEqual([g.elapsed, g.food, g.hydration, g.approach, g.door], survival);
  assert(g.openPhone(PHONE)); deviceTime(g, 5); close(phone.battery, 35);
  assert.deepEqual([g.elapsed, g.food, g.hydration, g.approach, g.door], survival);
  assert.equal(g.closePhone(), true); assert.equal(g.inventoryOpen, true);
  assert.equal(g.closeInventory(), true); assert.equal(g.phoneOpenId, null);
});

test('forty seconds of external power fully charges a dead phone even while reading', () => {
  assert.equal(PHONE_CHARGE_PER_SECOND, 100 / 40);
  for (const reading of [false, true]) {
    const g = createGame(), phone = item(g); atCharger(g); phone.battery = 0;
    assert(g.connectCharger(PHONE)); if (reading) assert(g.openPhone(PHONE));
    deviceTime(g, 20); close(phone.battery, 50);
    deviceTime(g, 20); assert.equal(phone.battery, 100);
    deviceTime(g, 60); assert.equal(phone.battery, 100);
    assert.equal(g.chargingPhoneId, PHONE); assert.equal(phone.state, 'inventory');
    assert.equal(g.items.length, 7);
  }
});

test('charger refuses remote, blocked, wrong-kind, unavailable, and nonplaying targets atomically', () => {
  const g = createGame(), phone = item(g); phone.battery = 40;
  assert.equal(g.connectCharger(PHONE), false); assert.equal(g.toggleCharger(PHONE), false);
  atCharger(g);
  for (const id of ['food-1', 'water-1', 'missing', undefined]) assert.equal(g.connectCharger(id), false);
  assert.equal(g.chargingPhoneId, null);
  for (const mode of ['menu', 'paused', 'note', 'won', 'lost']) {
    g.mode = mode; assert.equal(g.connectCharger(PHONE), false); assert.equal(g.toggleCharger(PHONE), false);
  }
  g.mode = 'playing'; const c = g.chargerPosition();
  g.walls.push({x: (g.player.x + c.x) / 2, z: c.z, w: .1, d: 1});
  assert.equal(g.nearCharger(), false); assert.equal(g.connectCharger(PHONE), false);
  g.walls.pop(); assert.equal(g.drop(PHONE), PHONE);
  assert.equal(g.connectCharger(PHONE), false); assert.equal(g.chargingPhoneId, null);
  assert.equal(phone.battery, 40);
});

test('repeated connection is idempotent and explicit unplug immediately restores reading drain', () => {
  const g = createGame(), phone = item(g); atCharger(g); phone.battery = 50;
  assert(g.connectCharger(PHONE)); const events = [...g.events];
  for (let n = 0; n < 20; n++) assert(g.connectCharger(PHONE));
  assert.deepEqual(g.events, events); assert.equal(phone.battery, 50);
  assert(g.openPhone(PHONE)); g.updateDevices(.05); close(phone.battery, 50.125);
  assert.equal(g.disconnectCharger(), true); assert.equal(g.disconnectCharger(), false);
  g.updateDevices(.05); close(phone.battery, 50.125 - .05 * PHONE_DRAIN_PER_SECOND);
  assert(g.toggleCharger(PHONE)); assert.equal(g.chargingPhoneId, PHONE);
  assert(g.toggleCharger(PHONE)); assert.equal(g.chargingPhoneId, null);
});

test('invalid charger requests cannot clear or replace an existing cable while a reader is open', () => {
  const g = createGame(); atCharger(g); assert(g.connectCharger(PHONE)); assert(g.openPhone(PHONE));
  const before = g.snapshot();
  for (const id of ['food-1', 'water-1', 'missing', null, '', undefined]) {
    assert.equal(g.connectCharger(id), false); assert.deepEqual(g.snapshot(), before);
    assert.equal(g.toggleCharger(id), false); assert.deepEqual(g.snapshot(), before);
  }
});

test('only one phone can bind to the charger and a different open phone still drains', () => {
  const g = createGame(), first = item(g); atCharger(g); first.battery = 50;
  // Defensive fixture only: production reset and pickup must never create another phone.
  const second = {...first, id: 'fixture-phone-2', gridX: 1, battery: 20}; g.items.push(second);
  assert(g.connectCharger(PHONE)); assert(g.connectCharger(second.id));
  assert.equal(g.chargingPhoneId, second.id); assert(g.openPhone(PHONE));
  deviceTime(g, 1); close(second.battery, 22.5); close(first.battery, 50 - PHONE_DRAIN_PER_SECOND);
  assert(g.connectCharger(PHONE)); const secondBattery = second.battery;
  deviceTime(g, 1); close(first.battery, 50 - PHONE_DRAIN_PER_SECOND + 2.5);
  assert.equal(second.battery, secondBattery);
});

test('moving away disconnects the cable before any later charge and cannot reconnect by returning', () => {
  const g = createGame(), phone = item(g); atCharger(g); phone.battery = 30;
  assert(g.connectCharger(PHONE)); g.move(-.75, 0);
  assert.equal(g.chargingPhoneId, null); const events = [...g.events];
  deviceTime(g, 1); assert.equal(phone.battery, 30); assert.deepEqual(g.events, events);
  atCharger(g); deviceTime(g, 1); assert.equal(g.chargingPhoneId, null); assert.equal(phone.battery, 30);
  assert(g.connectCharger(PHONE)); g.player.x -= 2; g.updateDevices(.05);
  assert.equal(g.chargingPhoneId, null); assert.equal(phone.battery, 30);
});

test('lost line of sight invalidates an existing charger binding with a single notification', () => {
  const g = createGame(), phone = item(g); atCharger(g); phone.battery = 30;
  assert(g.connectCharger(PHONE)); const c = g.chargerPosition();
  g.walls.push({x: (g.player.x + c.x) / 2, z: c.z, w: .1, d: 1});
  assert.equal(g.nearCharger(), false); g.updateDevices(.05);
  assert.equal(g.chargingPhoneId, null); assert.equal(phone.battery, 30);
  const events = [...g.events]; g.validateCharger(); g.updateDevices(.05);
  assert.deepEqual(g.events, events);
});

test('dropping unplugs without changing battery and pickup never silently reconnects', () => {
  const g = createGame(), phone = item(g); atCharger(g); phone.battery = 37.125;
  assert(g.connectCharger(PHONE)); assert.equal(g.drop(PHONE), PHONE);
  assert.equal(g.chargingPhoneId, null); assert.equal(phone.battery, 37.125);
  assert.equal(phone.state, 'world'); assert.equal(phone.gridX, null); assert.equal(phone.gridY, null);
  deviceTime(g, 60); assert.equal(phone.battery, 37.125);
  assert.equal(g.pickupItem(PHONE), PHONE); assert.equal(g.chargingPhoneId, null);
  assert.equal(item(g), phone); assert.equal(phone.battery, 37.125); assert.equal(g.items.length, 7);
});

test('a blocked drop retains the held phone, battery, grid position, and cable binding', () => {
  const g = createGame(), phone = item(g); atCharger(g); phone.battery = 25;
  assert(g.connectCharger(PHONE));
  g.obstacles.push({x: g.player.x, z: g.player.z, w: 3, d: 3});
  const before = g.snapshot(); assert.equal(g.drop(PHONE), undefined); assert.deepEqual(g.snapshot(), before);
  assert.equal(g.chargingPhoneId, PHONE); assert.equal(phone.state, 'inventory');
});

test('invalidated or removed held phone cannot keep receiving power', () => {
  for (const state of ['world', 'consumed']) {
    const g = createGame(), phone = item(g); atCharger(g); phone.battery = 20;
    assert(g.connectCharger(PHONE)); phone.state = state; g.updateDevices(.05);
    assert.equal(g.chargingPhoneId, null); assert.equal(phone.battery, 20);
  }
});

test('device operations clamp finite battery boundaries and never overcharge or underflow', () => {
  const g = createGame(), phone = item(g); g.openPhone(PHONE);
  for (const battery of [0, .001, -1, 100, 101]) {
    phone.battery = battery; g.updateDevices(.05);
    assert(Number.isFinite(phone.battery) && phone.battery >= 0 && phone.battery <= 100);
  }
  atCharger(g); assert(g.connectCharger(PHONE));
  for (const battery of [0, -1, 99.999, 100, 101]) {
    phone.battery = battery; g.updateDevices(.05);
    assert(Number.isFinite(phone.battery) && phone.battery >= 0 && phone.battery <= 100);
  }
});

test('repeated open/close cannot refill a battery or register additional drain', () => {
  const g = createGame(), phone = item(g); phone.battery = 70;
  assert(g.openInventory());
  for (let cycle = 0; cycle < 40; cycle++) {
    assert(g.openPhone(PHONE)); assert(g.openPhone(PHONE));
    g.updateDevices(.05); assert(g.closePhone()); assert.equal(g.closePhone(), false);
    g.updateDevices(.05);
  }
  close(phone.battery, 70 - 2 * PHONE_DRAIN_PER_SECOND);
  assert.equal(g.inventoryOpen, true); assert.equal(g.items.length, 7);
});

test('phone is not consumable under any kind alias and cannot affect survival meters', () => {
  const g = createGame(), phone = item(g); g.food = 30; g.hydration = 40; phone.battery = 27;
  const before = g.snapshot();
  for (const kind of ['phone', 'food', 'water', 'unknown']) assert.equal(g.consume(kind, PHONE), undefined);
  assert.deepEqual(g.snapshot(), before); assert.equal(g.consume('phone'), undefined);
  assert.deepEqual(g.snapshot(), before);
});

test('arranging and moving a phone preserve its object, battery, ID, and exact one-cell occupancy', () => {
  const g = createGame(), phone = item(g); phone.battery = 41.125;
  assert(g.moveInventoryItem(PHONE, 3, 3));
  assert.equal(g.canPlaceItem('food-1', 3, 3), false);
  assert.equal(g.moveInventoryItem(PHONE, 1, 0), false);
  atCharger(g); assert(g.pickupItem('water-1')); assert(g.pickupItem('water-2'));
  assert(g.arrangeInventory()); assert.equal(occupiedCells(g).size, 9);
  assert.equal(phone.battery, 41.125); assert.equal(item(g), phone);
  const before = g.snapshot(); assert(g.arrangeInventory()); assert.deepEqual(g.snapshot(), before);
  assert.deepEqual(g.items.map(i => i.id), originalIds);
});

test('repeated phone drop/pickup preserves physical object, battery, and identity without duplication', () => {
  const g = createGame(), phone = item(g); phone.battery = 31.2345;
  for (let cycle = 0; cycle < 20; cycle++) {
    assert.equal(g.drop(PHONE), PHONE); assert.equal(phone.state, 'world');
    assert.equal(phone.placement, 'ground'); assert.equal(phone.y, .005);
    assert.equal(phone.gridX, null); assert.equal(phone.gridY, null);
    assert(!g.collides(phone.x, phone.z)); assert(g.dropPathClear(phone.x, phone.z));
    const before = {...phone}; assert.equal(g.drop(PHONE), undefined); assert.deepEqual(phone, before);
    deviceTime(g, .5); assert.equal(phone.battery, 31.2345);
    assert.equal(g.pickupItem(PHONE), PHONE); assert.equal(g.pickupItem(PHONE), undefined);
    assert.equal(item(g), phone); assert.equal(phone.battery, 31.2345);
    assert.equal(occupiedCells(g).size, 5); assert.deepEqual(g.items.map(i => i.id), originalIds);
  }
});

test('full backpack refuses phone pickup atomically and retains the same world phone until space opens', () => {
  const g = createGame(), phone = item(g); phone.battery = 12.5; assert.equal(g.drop(PHONE), PHONE);
  // Fill only empty cells with ordinary defensive fixtures; production has seven objects.
  const occupied = occupiedCells(g);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (!occupied.has(`${x},${y}`)) {
    g.items.push({id: `fixture-${x}-${y}`, kind: 'food', state: 'inventory', gridX: x, gridY: y});
  }
  assert.equal(occupiedCells(g).size, 16); const before = JSON.stringify(g.items);
  for (let n = 0; n < 5; n++) {
    assert.equal(g.pickupItem(PHONE), undefined); assert.equal(g.interact(), null);
    assert.equal(JSON.stringify(g.items), before); assert.equal(item(g), phone); assert.equal(phone.state, 'world');
  }
  g.food = 50; assert.equal(g.consume('food', 'food-1'), 'food-1');
  assert.equal(g.pickupItem(PHONE), PHONE); assert.equal(phone.battery, 12.5);
  assert.equal(occupiedCells(g).size, 16); assert.equal(g.items.filter(i => i.id === PHONE).length, 1);
});

test('phone pickup requires reach and line of sight, with no battery or identity changes on failure', () => {
  const g = createGame(), phone = item(g); phone.battery = 18; assert.equal(g.drop(PHONE), PHONE);
  const original = {...phone}, start = {...g.player};
  g.player.x += 5; assert.equal(g.pickupItem(PHONE), undefined); assert.deepEqual(phone, original);
  Object.assign(g.player, start);
  g.walls.push({x: (g.player.x + phone.x) / 2, z: (g.player.z + phone.z) / 2, w: 1, d: .16});
  assert.equal(g.pickupItem(PHONE), undefined); assert.deepEqual(phone, original);
  g.walls.pop(); assert.equal(g.pickupItem(PHONE), PHONE); assert.equal(phone.battery, 18);
});

test('real spatial-seam crossings preserve a carried phone and leave a dropped phone at its original location', () => {
  for (const carried of [true, false]) {
    const g = createGame(), phone = item(g); phone.battery = 23.5;
    const from = g.maze.folds[0]; Object.assign(g.player, {x: from.px - .6, z: from.pz, yaw: 0});
    assert(!g.collides(g.player.x, g.player.z)); if (!carried) assert.equal(g.drop(PHONE), PHONE);
    const original = {...phone};
    g.move(1.2, 0); assert.equal(g.loops, 1); assert.deepEqual(phone, original);
    if (!carried) assert.equal(g.pickupItem(PHONE), undefined, 'the world phone did not travel through the seam');
    g.move(-1.2, 0); assert.equal(g.loops, 2); assert.deepEqual(phone, original);
    if (!carried) assert.equal(g.pickupItem(PHONE), PHONE);
    assert.equal(item(g), phone); assert.equal(phone.battery, 23.5); assert.deepEqual(g.items.map(i => i.id), originalIds);
  }
});

test('pause closes the reader, resume does not reopen it, and inventory close preserves explicit modes', () => {
  const g = createGame(), phone = item(g); atCharger(g); phone.battery = 45;
  g.openInventory(); g.openPhone(PHONE); g.connectCharger(PHONE); g.pause();
  assert.equal(g.mode, 'paused'); assert.equal(g.phoneOpenId, null);
  deviceTime(g, 10); assert.equal(phone.battery, 45);
  g.resume(); assert.equal(g.mode, 'playing'); assert.equal(g.phoneOpenId, null);
  assert.equal(g.chargingPhoneId, PHONE); g.updateDevices(.05); close(phone.battery, 45.125);
  for (const mode of ['paused', 'note', 'menu', 'won', 'lost']) {
    g.mode = 'playing'; g.openInventory(); g.openPhone(PHONE); g.mode = mode;
    assert.equal(g.closeInventory(), true); assert.equal(g.phoneOpenId, null); assert.equal(g.mode, mode);
  }
});

test('charger interaction picks up nearby bottles first, then toggles a single held-phone cable', () => {
  const g = createGame(); atCharger(g);
  assert.equal(g.interact(), 'pickup'); assert.equal(g.interact(), 'pickup');
  assert.equal(g.inventory('water').length, 2); assert.equal(g.chargingPhoneId, null);
  assert.equal(g.interact(), 'charger'); assert.equal(g.chargingPhoneId, PHONE);
  assert.equal(g.interact(), 'charger'); assert.equal(g.chargingPhoneId, null);
  assert.equal(occupiedCells(g).size, 9); assert.deepEqual(g.items.map(i => i.id), originalIds);
});

test('reset clears device bindings and restores exactly one full phone without duplicating old items', () => {
  const g = createGame(); atCharger(g); item(g).battery = 3;
  assert(g.connectCharger(PHONE)); assert(g.openInventory()); assert(g.openPhone(PHONE));
  g.reset(17);
  assert.equal(g.mode, 'menu'); assert.equal(g.inventoryOpen, false);
  assert.equal(g.phoneOpenId, null); assert.equal(g.chargingPhoneId, null);
  assert.equal(item(g).battery, 100); assert.equal(item(g).state, 'inventory');
  assert.deepEqual(g.items.map(i => i.id), originalIds); assert.equal(occupiedCells(g).size, 5);
  assert.equal(g.food, 100); assert.equal(g.hydration, 100); assert.equal(g.elapsed, 0);
  deviceTime(g, 60); assert.equal(item(g).battery, 100);
  g.start(); assert.equal(g.drop(PHONE), PHONE); g.reset(42);
  assert.deepEqual(g.items.map(i => i.id), originalIds); assert.equal(item(g).battery, 100);
});
