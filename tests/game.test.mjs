import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, makeMaze, SIZE, CELL, RADIUS} from '../dist/game.js';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SEEDS = [0, 1, 7, 42, 12345, 0xDEADBEEF, 0xFFFFFFFF, 20261006];
const close = (actual, expected, message = '') => assert(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} != ${expected}`);
function tick(g, seconds, input = {}) {
  for (let left = seconds; left > 1e-9; left -= .02) g.update(Math.min(left, .02), input);
}
// These routes use the same update/move/collision path as keyboard and touch input.
// No teleport helper, synthetic fold state, or player-position assignment is used.
function walk(g, x, z, onStep = () => {}) {
  let count = 0;
  const loops = g.loops;
  while (g.mode === 'playing' && Math.hypot(g.player.x - x, g.player.z - z) > 1e-7 && count++ < 20000) {
    const dx = x - g.player.x, dz = z - g.player.z, length = Math.hypot(dx, dz);
    g.player.yaw = Math.atan2(dx, -dz);
    g.update(.02, {forward: Math.min(1, length / .041)});
    onStep(g);
    assert.equal(g.loops, loops, 'an ordinary walking leg must not cross an active seam');
  }
  assert(count < 20000, `blocked at ${JSON.stringify(g.player)} towards ${x},${z}`);
  assert(!g.collides(g.player.x, g.player.z), 'walking must end outside collision geometry');
  if (g.mode === 'playing') assert(Math.hypot(g.player.x - x, g.player.z - z) < 1e-6);
}
function center(m, index) {const c = m.cells[index]; return [(c.x + .5) * CELL, (c.z + .5) * CELL];}
function cellIndex(g) {return Math.floor(g.player.z / CELL) * SIZE + Math.floor(g.player.x / CELL);}
function path(m, start, goal) {
  const queue = [start], parent = new Map([[start, -1]]);
  for (const i of queue) {
    if (i === goal) break;
    const c = m.cells[i];
    c.open.forEach((open, d) => {
      if (!open) return;
      const [dx, dz] = DIRS[d], j = (c.z + dz) * SIZE + c.x + dx;
      if (!parent.has(j)) {parent.set(j, i); queue.push(j);}
    });
  }
  assert(parent.has(goal), 'ordinary goal must be connected');
  const result = [];
  for (let i = goal; i !== -1; i = parent.get(i)) result.unshift(i);
  return result;
}
function ordinaryTo(g, goal, onStep) {
  const route = path(g.maze, cellIndex(g), goal);
  for (const i of route) {
    assert(!g.maze.folds.some(f => f.index === i), 'partitioned dead ends require vestibule waypoints');
    walk(g, ...center(g.maze, i), onStep);
  }
}
function enterVestibule(g, f, side = -1, onStep) {
  ordinaryTo(g, f.index + SIZE, onStep);
  walk(g, f.px + side * 1.9, (f.z + 1.5) * CELL, onStep);
  walk(g, f.px + side * 1.9, f.pz, onStep);
}
function leaveVestibule(g, f, side = Math.sign(g.player.x - f.px), onStep) {
  assert(side === -1 || side === 1);
  walk(g, f.px + side * 1.9, g.player.z, onStep);
  walk(g, f.px + side * 1.9, f.z * CELL + 3.7, onStep);
  walk(g, f.px, f.z * CELL + 3.7, onStep);
  walk(g, ...center(g.maze, f.index + SIZE), onStep);
}
function cross(g, from, to, side = -1, dz = 0) {
  assert.equal(Math.sign(g.player.x - from.px), side);
  const before = {...g.player}, loops = g.loops, dx = from.px - g.player.x - side * .55;
  g.move(dx, dz);
  assert.equal(g.loops, loops + 1, 'a real seam crossing must transfer exactly once');
  close(g.player.x, before.x + dx + to.px - from.px, 'translated x and residual movement');
  close(g.player.z, before.z + dz + to.pz - from.pz, 'translated z and residual movement');
  assert.equal(g.player.yaw, before.yaw);
  assert.equal(g.player.pitch, before.pitch);
  assert(!g.collides(g.player.x, g.player.z));
}
function changedOnce(g) {
  const [west, near] = g.maze.folds;
  enterVestibule(g, near);
  cross(g, near, west);
  assert.equal(g.foldState, 0);
  leaveVestibule(g, west);
  ordinaryTo(g, g.maze.start);
  assert.equal(g.foldState, 1);
  assert.equal(g.foldPending, false);
}
function walkOrdinaryEscape(g) {
  ordinaryTo(g, g.maze.goal);
  walk(g, g.maze.doorX - 1.25, g.maze.doorZ);
  assert(g.nearDoor());
}

test('256 seeds: 121 deterministic connected reciprocal cells, central clear spawn, and farthest eastern Manila goal', () => {
  for (let seed = 0; seed < 256; seed++) {
    const m = makeMaze(seed), g = new Game(seed);
    assert.deepEqual(m, makeMaze(seed));
    assert.equal(SIZE, 11); assert.equal(CELL, 5); assert.equal(m.cells.length, 121);
    assert.equal(m.start, 60);
    assert.equal(m.seed, seed);
    assert(m.route.length >= 23, 'bounded deterministic retries should reject short ordinary escapes');
    assert(m.generationAttempt >= 0 && m.generationAttempt <= 16);
    assert.deepEqual([g.player.x, g.player.z], [27.5, 27.5]);
    assert(!g.collides(g.player.x, g.player.z));
    assert(m.dist.every(Number.isFinite));
    assert.equal(new Set(path(m, m.start, m.goal)).size, m.route.length);
    assert.deepEqual(path(m, m.start, m.goal), m.route);
    for (const c of m.cells) c.open.forEach((open, d) => {
      if (!open) return;
      const [dx, dz] = DIRS[d], x = c.x + dx, z = c.z + dz;
      assert(x >= 0 && x < SIZE && z >= 0 && z < SIZE, 'no opening through exterior boundary');
      assert(m.cells[z * SIZE + x].open[(d + 2) % 4]);
    });
    assert.equal(m.dist[m.goal], Math.max(...m.cells.filter(c => c.x === SIZE - 1).map(c => m.dist[c.z * SIZE + c.x])));
    assert.equal(m.doorX, 55);
    for (const f of m.folds) {
      assert.deepEqual(m.cells[f.index].open, [false, false, true, false]);
      assert(g.collides(f.px, f.z * CELL + 2.5), 'center divider must be solid');
      assert(!m.route.includes(f.index), 'optional endpoint must not lie on the Manila route');
      assert(g.collides(f.x * CELL, f.pz));
      assert(g.collides((f.x + 1) * CELL, f.pz));
      assert(g.collides(f.px, f.z * CELL));
    }
  }
});

test('100 seeds: physically walk the ordinary center-to-Manila path with no transfers or trapped corners', () => {
  for (let seed = 0; seed < 100; seed++) {
    const g = new Game(seed); g.start();
    walkOrdinaryEscape(g);
    assert.equal(g.loops, 0); assert.equal(g.foldState, 0);
    assert.equal(g.changed, false); assert(g.hydration > 80);
    assert.equal(g.door, 0); assert(g.collides(g.maze.doorX, g.maze.doorZ));
  }
});

test('initial and settled seams are reciprocal rigid translations preserving yaw, pitch, and residual movement', () => {
  for (const seed of SEEDS) for (const state of [0, 1]) {
    const g = new Game(seed); g.start();
    if (state) changedOnce(g);
    const [a, b] = g.activeFolds();
    enterVestibule(g, a);
    walk(g, a.px - .55, a.pz);
    g.player.yaw = .37; g.player.pitch = -.22;
    const origin = {...g.player}, initialLoops = g.loops, items = JSON.stringify(g.items);
    for (let repetition = 0; repetition < 12; repetition++) {
      cross(g, a, b, -1, .18);
      cross(g, b, a, 1, -.18);
      close(g.player.x, origin.x); close(g.player.z, origin.z);
      assert.equal(g.foldState, state, 'nearby or inverse travel must not reconfigure the pair');
      assert.equal(JSON.stringify(g.items), items, 'seams cannot move, clone, or relabel items');
    }
    assert.equal(g.loops, initialLoops + 24);
  }
});

test('landing exactly on a seam supports immediate reversal from either side in both states', () => {
  for (const state of [0, 1]) for (const side of [-1, 1]) {
    const g = new Game(42); g.start(); if (state) changedOnce(g);
    const [from, to] = g.activeFolds();
    enterVestibule(g, from, side); walk(g, from.px + side * .04, from.pz);
    const loops = g.loops; g.player.yaw = -.73; g.player.pitch = .18;
    g.move(from.px - g.player.x, 0);
    assert.equal(g.loops, loops + 1);
    assert.equal(Math.sign(g.player.x - to.px), -side, 'exact-plane landing must keep its crossing side');
    assert(Math.abs(g.player.x - to.px) <= 1.01e-7);
    close(g.player.z, to.pz);
    g.move(side * .04, 0);
    assert.equal(g.loops, loops + 2, 'immediate reversal must perform the inverse transfer');
    assert(Math.abs(g.player.x - (from.px + side * .04)) <= 1.01e-7);
    close(g.player.z, from.pz);
    assert.equal(g.player.yaw, -.73); assert.equal(g.player.pitch, .18);
    assert.equal(g.foldState, state);
  }
});

test('a dropped food object remains at the same coordinates through an initial shortcut and three repeatable settled loops', () => {
  for (const seed of SEEDS) {
    const g = new Game(seed); g.start();
    assert.equal(g.inventory('water').length, 0);
    const id = g.drop(), item = g.items.find(i => i.id === id), saved = {...item};
    changedOnce(g);
    assert.equal(g.nearestItem(), item, 'first non-Euclidean route returns within pickup range of the original marker');
    const [west, , east] = g.maze.folds;
    for (let repetition = 0; repetition < 3; repetition++) {
      const initialLoops = g.loops;
      enterVestibule(g, west); cross(g, west, east);
      leaveVestibule(g, east); ordinaryTo(g, g.maze.start);
      assert.equal(g.loops, initialLoops + 1);
      assert.equal(g.nearestItem(), item);
      assert.deepEqual(item, saved);
      assert.equal(g.items.find(i => i.id === id), item);
      assert.equal(g.items.length, 6); assert.equal(new Set(g.items.map(i => i.id)).size, 6);
    }
    assert.equal(g.interact(), 'pickup');
    assert.equal(g.inventory('food')[0], item);
    g.food = 50; assert.equal(g.consume('food'), id);
    assert.equal(item.state, 'consumed'); assert.equal(g.items.length, 6);
  }
});

test('the connection changes only once, after movement hides both apertures and clears the 4.5 m exclusion', () => {
  for (const seed of SEEDS) {
    const g = new Game(seed); g.start();
    const [west, near, east] = g.maze.folds;
    enterVestibule(g, near); cross(g, near, west);
    assert.equal(g.foldPending, true); assert.deepEqual(g.activeFolds(), [west, near]);
    const before = {...g.player}; tick(g, 120);
    assert.equal(g.foldState, 0); assert.deepEqual(g.player, before);
    let switches = 0, prior = g.foldState;
    const observe = () => {
      if (g.foldState !== prior) {
        switches++; assert.equal(prior, 0); assert.equal(g.foldState, 1);
        for (const f of [west, near]) {
          assert(Math.hypot(g.player.x - f.px, g.player.z - f.pz) >= 4.5);
          // Independently sample the entire player-passable seam, more densely than the implementation.
          for (let z = RADIUS + .01; z < 2.5 - .08 - RADIUS; z += .025) {
            assert.equal(g.lineClear(f.px, f.z * CELL + z), false, `visible ${f.id} aperture at the change`);
          }
        }
        prior = g.foldState;
      }
    };
    leaveVestibule(g, west, 1, observe); ordinaryTo(g, g.maze.start, observe);
    assert.equal(switches, 1); assert.equal(g.foldPending, false);
    assert.deepEqual(g.activeFolds(), [west, east]);
    for (let i = 0; i < 3; i++) {
      enterVestibule(g, west, -1, observe); cross(g, west, east);
      leaveVestibule(g, east, 1, observe); ordinaryTo(g, g.maze.start, observe);
      tick(g, 10); assert.equal(g.foldState, 1);
    }
    assert.equal(g.events.filter(e => e === '身后传来一声很轻的灯管响。').length, 1);
  }
});

test('all three endpoint vestibules have physical ordinary escape paths from both sides in both fold states', () => {
  for (const seed of SEEDS) for (const state of [0, 1]) for (let index = 0; index < 3; index++) for (const side of [-1, 1]) {
    const g = new Game(seed); g.start(); if (state) changedOnce(g);
    const f = g.maze.folds[index], loops = g.loops;
    enterVestibule(g, f, side); leaveVestibule(g, f, side);
    walkOrdinaryEscape(g);
    assert.equal(g.loops, loops, `ordinary escape from ${f.id}, side ${side}, state ${state}`);
    assert.equal(g.foldState, state); assert.equal(g.mode, 'playing');
  }
});

test('inactive endpoint and southern half of active vestibules do not transfer', () => {
  for (const state of [0, 1]) {
    const g = new Game(42); g.start(); if (state) changedOnce(g);
    const inactive = g.maze.folds[state ? 1 : 2], loops = g.loops;
    enterVestibule(g, inactive); walk(g, inactive.px + 1.9, inactive.pz);
    leaveVestibule(g, inactive, 1);
    for (const f of g.activeFolds()) {
      ordinaryTo(g, f.index + SIZE);
      walk(g, f.px - 1.9, (f.z + 1.5) * CELL);
      walk(g, f.px - 1.9, f.z * CELL + 3.7);
      walk(g, f.px + 1.9, f.z * CELL + 3.7);
      walk(g, f.px + 1.9, (f.z + 1.5) * CELL);
      ordinaryTo(g, g.maze.start);
    }
    assert.equal(g.loops, loops);
  }
});

test('manual door changes the room only after a full close inside; water is finite and the changed exit is traversable', () => {
  for (const seed of SEEDS) {
    const g = new Game(seed); g.start(); const m = g.maze;
    walkOrdinaryEscape(g); tick(g, 2);
    assert.equal(g.door, 0); assert.equal(g.changed, false);
    assert.equal(g.interact(), 'door'); tick(g, 1); assert.equal(g.door, 1);
    // Opening and closing from outside cannot change the space.
    assert.equal(g.interact(), 'door'); tick(g, 1);
    assert.equal(g.entered, false); assert.equal(g.changed, false);
    g.interact(); tick(g, 1);
    walk(g, m.doorX + 2.1, m.doorZ); assert(g.entered);
    tick(g, 10); assert.equal(g.changed, false, 'waiting inside with an open door is insufficient');
    assert.equal(g.interact(), 'door'); tick(g, .25);
    assert(g.door > 0 && g.door < 1); assert.equal(g.changed, false);
    g.interact(); tick(g, .7); assert.equal(g.changed, false);
    g.interact(); tick(g, 1); assert.equal(g.changed, true); assert.equal(g.mode, 'playing');
    assert(g.collides(m.doorX - 3, m.doorZ + 1.3), 'changed corridor side walls remain solid');
    walk(g, m.doorX + 3.6, m.doorZ - .65);
    assert.equal(g.interact(), 'pickup'); assert.equal(g.interact(), 'pickup');
    assert.equal(g.inventory('water').length, 2);
    g.hydration = 10;
    assert(g.consume('water')); assert(g.consume('water')); assert.equal(g.consume('water'), undefined);
    assert.equal(g.inventory('water').length, 0);
    assert.equal(g.items.filter(i => i.kind === 'water' && i.state === 'consumed').length, 2);
    walk(g, m.doorX + 2.1, m.doorZ); assert.equal(g.interact(), 'door'); tick(g, 1);
    walk(g, m.doorX - 8.4, m.doorZ); assert.equal(g.mode, 'won');
  }
});

test('door closing safely reopens if the player blocks the leaf', () => {
  const g = new Game(42); g.start(); walkOrdinaryEscape(g); g.interact(); tick(g, 1);
  walk(g, g.maze.doorX, g.maze.doorZ);
  assert.equal(g.interact(), 'door'); tick(g, 1);
  assert.equal(g.doorTarget, 1); assert.equal(g.changed, false);
  assert(!g.collides(g.player.x, g.player.z));
  assert(g.events.includes('你挡住了门。再往房间里走一点。'));
});

test('pause and notes freeze simulation; restart resets inventory, central spawn, door, and fold state', () => {
  const g = new Game(3); g.start(); g.drop(); changedOnce(g); g.doorTarget = 1; tick(g, 1);
  for (const mode of ['paused', 'note']) {
    if (mode === 'paused') g.pause(); else g.mode = 'note';
    const snapshot = g.snapshot(); tick(g, 60, {forward: 1, sprint: true});
    g.interact(); g.drop(); g.consume('water'); assert.deepEqual(g.snapshot(), snapshot);
    g.resume(); assert.equal(g.mode, 'playing');
  }
  g.reset(4);
  assert.equal(g.items.length, 6); assert.equal(g.inventory('food').length, 4); assert.equal(g.inventory('water').length, 0);
  assert.equal(g.door, 0); assert.equal(g.doorTarget, 0); assert.equal(g.changed, false);
  assert.equal(g.foldState, 0); assert.equal(g.foldPending, false); assert.equal(g.loops, 0);
  assert.equal(g.mode, 'menu'); assert.deepEqual([g.player.x, g.player.z], [27.5, 27.5]);
  assert.equal(g.food, 100); assert.equal(g.hydration, 100);
});

test('food and water depletion lose the run, and long frames are capped', () => {
  for (const resource of ['food', 'hydration']) {
    const g = new Game(7); g.start(); g[resource] = .0001; g.update(.05);
    assert.equal(g[resource], 0); assert.equal(g.mode, 'lost');
    const snapshot = g.snapshot(); tick(g, 1, {forward: 1}); assert.deepEqual(g.snapshot(), snapshot);
  }
  const g = new Game(7); g.start(); g.update(30);
  close(g.elapsed, .05); close(g.food, 100 - .05 * .014); close(g.hydration, 100 - .05 * .035);
});

test('solid walls and vestibule partitions prevent clipping under very large movement commands', () => {
  for (const seed of SEEDS) for (const [dx, dz] of [[-100, 0], [100, 0], [0, -100], [0, 100], [100, 100], [-100, -100]]) {
    const g = new Game(seed); g.start(); g.move(dx, dz);
    assert(!g.collides(g.player.x, g.player.z));
    assert(g.player.x >= RADIUS && g.player.x <= SIZE * CELL - RADIUS);
    assert(g.player.z >= RADIUS && g.player.z <= SIZE * CELL - RADIUS);
  }
  const g = new Game(42); g.start(); const f = g.maze.folds[1];
  ordinaryTo(g, f.index + SIZE); g.move(0, -100);
  assert(g.player.z >= f.z * CELL + 2.5 + .08 + RADIUS);
  assert.equal(g.loops, 0); assert(!g.collides(g.player.x, g.player.z));
});
