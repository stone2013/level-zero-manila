import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';

const game = (seed = 42) => {const g = new Game(seed); g.start(); return g;};
const byId = (g, id) => g.items.find(item => item.id === id);
const ids = g => g.items.map(item => item.id);
function approachWater(g) {
  g.player.x = g.maze.doorX + 3.6;
  g.player.z = g.maze.doorZ - .65;
}
function occupied(g) {
  const cells = new Map();
  for (const item of g.inventory()) {
    const {w, h} = g.itemSize(item);
    assert(Number.isInteger(item.gridX) && Number.isInteger(item.gridY));
    assert(item.gridX >= 0 && item.gridY >= 0 && item.gridX + w <= 4 && item.gridY + h <= 4);
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
      const key = `${item.gridX + dx},${item.gridY + dy}`;
      assert(!cells.has(key), `${key} is occupied by two objects`);
      cells.set(key, item.id);
    }
  }
  return cells;
}
function solidPath(g, item) {
  const distance = Math.hypot(item.x - g.player.x, item.z - g.player.z);
  assert(distance <= .7000001);
  for (let t = 0; t <= 1; t += .005) {
    assert(!g.collides(g.player.x + (item.x - g.player.x) * t, g.player.z + (item.z - g.player.z) * t));
  }
  assert(!g.collides(item.x, item.z));
}

test('reset preserves exactly four food IDs, two table water IDs and one phone ID with a physical 4×4 layout', () => {
  const g = new Game(42);
  assert.equal(g.inventoryOpen, false);
  assert.deepEqual(ids(g), ['food-1', 'food-2', 'food-3', 'food-4', 'water-1', 'water-2', 'phone-1']);
  assert.equal(g.inventory().length, 5);
  assert.equal(g.inventory('water').length, 0);
  assert.deepEqual(g.inventory().map(i => [i.gridX, i.gridY]), [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1]]);
  assert.equal(occupied(g).size, 5);
  for (const water of g.items.filter(i => i.kind === 'water')) {
    assert.deepEqual(g.itemSize(water), {w: 1, h: 2});
    assert.equal(water.gridX, null); assert.equal(water.gridY, null);
    assert.equal(water.placement, 'table'); assert.equal(water.y, .68);
  }
  assert.deepEqual(g.itemSize('food-1'), {w: 1, h: 1});
  assert.equal(g.itemSize('missing'), null);
});

test('grid moves validate the exact footprint, boundaries, integer coordinates, and occupied cells atomically', () => {
  const g = game();
  assert(g.canPlaceItem('food-1', 0, 0), 'the object may remain in its own cells');
  assert(g.moveInventoryItem('food-1', 3, 3));
  assert.deepEqual([byId(g, 'food-1').gridX, byId(g, 'food-1').gridY], [3, 3]);
  for (const [id, x, y] of [['food-1', 1, 0], ['food-1', -1, 2], ['food-1', 4, 0], ['food-1', 0, 4], ['food-1', 1.5, 2], ['food-1', NaN, 2], ['missing', 0, 0], ['water-1', 0, 0]]) {
    const before = JSON.stringify(g.items);
    assert.equal(g.moveInventoryItem(id, x, y), false);
    assert.equal(JSON.stringify(g.items), before);
  }
  approachWater(g);
  assert.equal(g.pickupItem('water-1'), 'water-1');
  assert.equal(g.canPlaceItem('water-1', 0, 3), false);
  assert.equal(g.canPlaceItem('water-1', 3, 2), false, 'bottom half cannot overlap food-1');
  assert(g.moveInventoryItem('water-1', 2, 2));
  assert.equal(g.canPlaceItem('food-2', 2, 3), false, 'both bottle cells are occupied');
  assert.equal(occupied(g).size, 7);
});

test('arrange packs tall items first without changing identities, counts, survival, or consumed/world state', () => {
  const g = game(); approachWater(g);
  assert(g.pickupItem('water-1')); assert(g.pickupItem('water-2'));
  assert(g.moveInventoryItem('food-1', 3, 3));
  const original = ids(g), before = [g.food, g.hydration, g.elapsed];
  assert.equal(g.arrangeInventory(), true);
  assert.equal(occupied(g).size, 9);
  assert.deepEqual([byId(g, 'water-1').gridX, byId(g, 'water-1').gridY], [0, 0]);
  assert.deepEqual([byId(g, 'water-2').gridX, byId(g, 'water-2').gridY], [1, 0]);
  assert.deepEqual(ids(g), original);
  assert.deepEqual([g.food, g.hydration, g.elapsed], before);
  const arranged = JSON.stringify(g.items);
  assert(g.arrangeInventory()); assert.equal(JSON.stringify(g.items), arranged);
  g.food = 40; g.consume('food', 'food-3'); g.drop('water-2');
  const consumed = {...byId(g, 'food-3')}, world = {...byId(g, 'water-2')};
  assert(g.arrangeInventory());
  assert.deepEqual(byId(g, 'food-3'), consumed); assert.deepEqual(byId(g, 'water-2'), world);
});

// Capacity fixtures exercise defensive grid behavior; no extra loot is created
// by the game, its reset, its pickup, or any production action.
function capacityFixture(g, cells) {
  for (const item of g.inventory()) item.state = 'consumed';
  for (const [gridX, gridY] of cells) g.items.push({id: `fixture-${gridX}-${gridY}`, kind: 'food', state: 'inventory', gridX, gridY});
}
test('full capacity pickup keeps the world object and every inventory cell unchanged, including repeated attempts', () => {
  const g = game(); approachWater(g);
  capacityFixture(g, Array.from({length: 16}, (_, i) => [i % 4, Math.floor(i / 4)]));
  const before = JSON.stringify(g.items), original = byId(g, 'water-1');
  for (let n = 0; n < 3; n++) {
    assert.equal(g.pickupItem('water-1'), undefined);
    assert.equal(g.interact(), null);
    assert.equal(JSON.stringify(g.items), before);
    assert.equal(byId(g, 'water-1'), original);
  }
});
test('pickup requires contiguous vertical cells rather than total free area and succeeds after arranging', () => {
  const g = game(); approachWater(g);
  capacityFixture(g, Array.from({length: 8}, (_, i) => [i % 4, i < 4 ? 1 : 3]));
  const before = JSON.stringify(g.items);
  assert.equal(g.pickupItem('water-1'), undefined);
  assert.equal(JSON.stringify(g.items), before);
  assert(g.arrangeInventory());
  assert.equal(g.pickupItem('water-1'), 'water-1');
  assert.equal(occupied(g).size, 10);
});
test('an impossible arrange has no partial side effects', () => {
  const g = game();
  capacityFixture(g, Array.from({length: 17}, (_, i) => [i % 4, Math.floor(i / 4)]));
  const before = JSON.stringify(g.items);
  assert.equal(g.arrangeInventory(), false);
  assert.equal(JSON.stringify(g.items), before);
});

test('pickup requires a reachable world object and never duplicates it on repeated calls', () => {
  const g = game(), original = ids(g), item = byId(g, 'water-1');
  assert.equal(g.pickupItem(item.id), undefined, 'remote pickup is blocked');
  approachWater(g);
  assert.equal(g.pickupItem(item.id), item.id);
  const before = JSON.stringify(g.items);
  for (let n = 0; n < 5; n++) assert.equal(g.pickupItem(item.id), undefined);
  assert.equal(JSON.stringify(g.items), before); assert.equal(byId(g, item.id), item);
  assert.deepEqual(ids(g), original);
  const dropped = g.drop('food-2'), food = byId(g, dropped);
  g.walls.push({x: (g.player.x + food.x) / 2, z: (g.player.z + food.z) / 2, w: 1, d: .02});
  const blocked = JSON.stringify(food);
  assert.equal(g.pickupItem(food.id), undefined);
  assert.equal(JSON.stringify(food), blocked);
});

test('inventory freezes movement, hunger, thirst, door, approach, folds, and world interaction', () => {
  const g = game();
  g.entered = true; g.approach = 11; g.door = .4; g.doorTarget = 1;
  const mode = g.mode;
  assert.equal(g.openInventory(), true); assert.equal(g.mode, mode);
  const before = JSON.stringify(g);
  for (let n = 0; n < 100; n++) g.update(30, {forward: 1, strafe: 1, sprint: true});
  g.move(10, 10); assert.equal(g.interact(), undefined);
  assert.equal(JSON.stringify(g), before);
  assert.equal(g.closeInventory(), true); assert.equal(g.mode, mode);
  g.update(.05); assert.equal(g.elapsed, .05); assert(g.approach > 11);
});
test('inventory actions work while open, but closing never overrides pause, notes, menu, or an ending', () => {
  const g = game(); assert(g.openInventory());
  assert(g.moveInventoryItem('food-4', 3, 3)); assert(g.arrangeInventory());
  g.food = 50; assert.equal(g.consume('food', 'food-4'), 'food-4');
  assert.equal(g.drop('food-2'), 'food-2');
  const beforePickup = JSON.stringify(g.items);
  assert.equal(g.pickupItem('food-2'), undefined); assert.equal(JSON.stringify(g.items), beforePickup);
  g.closeInventory(); assert.equal(g.pickupItem('food-2'), 'food-2');
  for (const mode of ['paused', 'note', 'menu', 'won', 'lost']) {
    g.mode = mode; g.inventoryOpen = true;
    const before = JSON.stringify(g.items);
    assert.equal(g.moveInventoryItem('food-1', 2, 2), false);
    assert.equal(g.arrangeInventory(), false); assert.equal(g.drop('food-1'), undefined);
    assert.equal(g.consume('food', 'food-1'), undefined); assert.equal(g.pickupItem('water-1'), undefined);
    assert.equal(g.openInventory(), false); assert.equal(g.closeInventory(), true);
    assert.equal(g.mode, mode); assert.equal(JSON.stringify(g.items), before);
  }
  g.mode = 'playing'; g.openInventory(); g.pause(); g.closeInventory();
  assert.equal(g.mode, 'paused'); g.resume(); assert.equal(g.mode, 'playing');
});

test('exact selected consumption removes only that object, clears its cells, and cannot respawn or consume twice', () => {
  const g = game(); g.food = 30; g.hydration = 60;
  const original = ids(g), otherFood = {...byId(g, 'food-1')};
  assert.equal(g.consume('food', 'food-3'), 'food-3');
  assert.deepEqual(byId(g, 'food-1'), otherFood);
  assert.equal(g.food, 58); assert.equal(g.hydration, 58);
  assert.equal(byId(g, 'food-3').state, 'consumed');
  assert.equal(byId(g, 'food-3').gridX, null); assert.equal(byId(g, 'food-3').gridY, null);
  const before = JSON.stringify(g.items), survival = [g.food, g.hydration];
  assert.equal(g.consume('food', 'food-3'), undefined); assert.equal(g.drop('food-3'), undefined);
  assert.equal(g.pickupItem('food-3'), undefined); assert.equal(g.consume('water', 'food-1'), undefined);
  assert.equal(g.consume('unknown', 'food-1'), undefined);
  assert.equal(JSON.stringify(g.items), before); assert.deepEqual([g.food, g.hydration], survival);
  approachWater(g); g.pickupItem('water-1'); g.pickupItem('water-2');
  assert.equal(g.consume('water', 'water-2'), 'water-2');
  assert.equal(byId(g, 'water-1').state, 'inventory'); assert.equal(g.hydration, 96);
  assert.deepEqual(ids(g), original);
});
test('full survival bars refuse consumption without moving or removing a selected item', () => {
  const g = game(); approachWater(g); g.pickupItem('water-1');
  const before = JSON.stringify(g.items);
  assert.equal(g.consume('food', 'food-2'), undefined); assert.equal(g.consume('water', 'water-1'), undefined);
  assert.equal(JSON.stringify(g.items), before);
});

test('selected food and water drop onto the ground, remain stable, and can be recovered repeatedly', () => {
  const g = game(); approachWater(g); g.pickupItem('water-1');
  const original = ids(g);
  for (const id of ['water-1', 'food-4']) {
    const item = byId(g, id);
    for (let n = 0; n < 10; n++) {
      assert.equal(g.drop(id), id); assert.equal(item.state, 'world');
      assert.equal(item.placement, 'ground'); assert.equal(item.y, .005);
      assert.equal(item.gridX, null); assert.equal(item.gridY, null);
      solidPath(g, item);
      const before = JSON.stringify(g.items);
      assert.equal(g.drop(id), undefined); assert.equal(JSON.stringify(g.items), before);
      assert.equal(g.nearestItem()?.state, 'world');
      assert.equal(g.pickupItem(id), id); assert.equal(byId(g, id), item);
      occupied(g);
    }
  }
  assert.deepEqual(ids(g), original); assert.equal(new Set(ids(g)).size, 7);
  assert.equal(byId(g, 'water-2').placement, 'table'); assert.equal(byId(g, 'water-2').y, .68);
});
test('dropping does not cross a thin wall even when the nominal landing point is empty', () => {
  const g = game(), p = g.player;
  g.walls.push({x: p.x, z: p.z - .35, w: 2, d: .005});
  assert.equal(g.collides(p.x, p.z - .7), false, 'endpoint alone would be misleading');
  assert.equal(g.dropPathClear(p.x, p.z - .7), false);
  assert.equal(g.drop('food-3'), 'food-3');
  const item = byId(g, 'food-3'); solidPath(g, item);
  assert(item.z > p.z - .35, 'object stays on the player side of the wall');
});
test('dropping near the table and live door chooses a safe unobstructed route', () => {
  const g = game(); approachWater(g); g.pickupItem('water-1');
  g.player.yaw = Math.PI / 2;
  assert.equal(g.drop('water-1'), 'water-1'); solidPath(g, byId(g, 'water-1'));
  assert(byId(g, 'water-1').x < g.maze.doorX + 4);
  g.player.x = g.maze.doorX - .4; g.player.z = g.maze.doorZ; g.player.yaw = Math.PI / 2;
  assert.equal(g.drop('food-1'), 'food-1'); solidPath(g, byId(g, 'food-1'));
  assert(byId(g, 'food-1').x < g.maze.doorX);
});
test('an entirely blocked drop leaves object, grid, and survival state untouched', () => {
  const g = game(), p = g.player;
  g.obstacles.push({x: p.x, z: p.z, w: 3, d: 3});
  const before = g.snapshot();
  assert.equal(g.drop('food-1'), undefined); assert.deepEqual(g.snapshot(), before);
  assert.equal(g.drop('missing'), undefined); assert.deepEqual(g.snapshot(), before);
});
test('new markers in the changed exit stay visible and recoverable; old maze markers remain hidden', () => {
  const g = game(); const old = g.drop('food-1');
  g.changed = true; g.player.x = g.maze.doorX - 5; g.player.z = g.maze.doorZ; g.player.yaw = -Math.PI / 2;
  const id = g.drop('food-2'), item = byId(g, id);
  assert.equal(id, 'food-2'); assert.equal(item.area, 'room'); assert.equal(item.placement, 'ground');
  solidPath(g, item); assert.equal(g.nearestItem(), item); assert.equal(g.pickupItem(id), id);
  assert.equal(g.pickupItem(old), undefined);
});
test('restart clears inventory overlay and restores only the original seven items and survival values', () => {
  const g = game(); g.openInventory(); g.drop('food-4'); g.food = 20; g.consume('food', 'food-2');
  g.reset(17);
  assert.equal(g.mode, 'menu'); assert.equal(g.inventoryOpen, false);
  assert.equal(g.inventory('food').length, 4); assert.equal(g.inventory('water').length, 0);
  assert.equal(g.items.length, 7); assert.equal(new Set(ids(g)).size, 7);
  assert.equal(occupied(g).size, 5); assert.equal(g.food, 100); assert.equal(g.hydration, 100);
});

test('seven consecutive drops use separate free ground footprints and recover their original IDs without duplicates', () => {
  const g = game(); approachWater(g); g.pickupItem('water-1'); g.pickupItem('water-2');
  g.player.x = 27.5; g.player.z = 27.5; g.player.yaw = 0;
  const originals = g.items.slice(), initialIds = ids(g);
  for (const id of initialIds) {
    assert.equal(g.drop(id), id);
    const dropped = byId(g, id); solidPath(g, dropped);
    const width = item => item.kind === 'food' ? .32 : item.kind === 'phone' ? .16 : .13;
    const depth = item => item.kind === 'food' ? .22 : item.kind === 'phone' ? .27 : .13;
    for (const other of g.items.filter(i => i.state === 'world' && i.id !== id)) {
      assert(Math.abs(dropped.x - other.x) >= (width(dropped) + width(other)) / 2 + .03999 || Math.abs(dropped.z - other.z) >= (depth(dropped) + depth(other)) / 2 + .03999, `${id} overlaps ${other.id}`);
    }
  }
  assert.equal(g.inventory().length, 0);
  assert.equal(new Set(g.items.map(i => `${i.x},${i.z}`)).size, 7);
  for (const item of originals) {assert.equal(g.pickupItem(item.id), item.id); assert.equal(byId(g, item.id), item);}
  assert.deepEqual(ids(g), initialIds); assert.equal(g.inventory().length, 7); assert.equal(occupied(g).size, 9);
});
test('occupied ground can reject a drop without partially removing it from its grid cell', () => {
  const g = game(), p = g.player;
  // A tiny, valid floor pocket surrounded by solid geometry, with its only
  // free item footprint already occupied. There is no safe empty landing.
  g.walls.push({x:p.x-.48,z:p.z,w:.2,d:2},{x:p.x+.48,z:p.z,w:.2,d:2},{x:p.x,z:p.z-.48,w:2,d:.2},{x:p.x,z:p.z+.48,w:2,d:.2});
  Object.assign(byId(g, 'food-2'), {state:'world', x:p.x, y:.005, z:p.z, gridX:null, gridY:null, placement:'ground'});
  const before = g.snapshot();
  assert.equal(g.drop('food-1'), undefined); assert.deepEqual(g.snapshot(), before);
});

test('a bottle dropped across the doorway into Manila stays recoverable after room changes', () => {
 const g=new Game(42);g.start();const item=g.items.find(i=>i.id==='water-1');
 Object.assign(item,{state:'inventory',gridX:0,gridY:1});g.door=g.doorTarget=1;
 Object.assign(g.player,{x:g.maze.doorX+.2,z:g.maze.doorZ,yaw:Math.PI/2});
 assert.equal(g.drop(item.id),item.id);assert(item.x>g.maze.doorX);assert.equal(item.area,'room');
 g.player.x=g.maze.doorX+2.1;g.doorTarget=0;for(let i=0;i<60;i++)g.update(.02);
 assert.equal(g.changed,true);assert.equal(g.nearestItem(),item);assert.equal(g.pickupItem(item.id),item.id);assert.equal(item.state,'inventory');
});
