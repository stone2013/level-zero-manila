import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../dist/game.js';
import {visibleCorridorCells, WORLD_CELL, DIRECTIONS, keyOf, RENDER_CELLS} from '../dist/world.js';

const keys = cells => new Set(cells.map(c => keyOf(c.x, c.z)));
const reachFor = aspect => 65 * Math.sqrt(1 + Math.tan(76 * Math.PI / 360) ** 2 * (1 + aspect ** 2));
function fixture(links = [], allOpen = false) {
  const cells = new Map(); let reads = 0;
  const get = (x, z) => {
    const key = keyOf(x, z);
    if (!cells.has(key)) cells.set(key, {x, z, active: true, open: Array(4).fill(allOpen)});
    return cells.get(key);
  };
  for (const [a, b] of links) {
    const d = DIRECTIONS.findIndex(([dx, dz]) => b[0] - a[0] === dx && b[1] - a[1] === dz);
    assert(d >= 0); get(...a).open[d] = true; get(...b).open[(d + 2) % 4] = true;
  }
  return {cell(x, z) {reads++; return get(x, z);}, get reads() {return reads;}};
}
function path(points) {return points.slice(1).map((point, i) => [points[i], point]);}
function halo(cells) {
  const out = new Set();
  for (const c of cells) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) out.add(keyOf(c.x + dx, c.z + dz));
  return out;
}

// Independent Amanatides/Woo-style grid traversal oracle. This samples only in
// tests; production propagates every angle in each continuous portal interval.
function rayCells(world, x, z, angle, reach) {
  const dx = Math.cos(angle), dz = Math.sin(angle), sx = dx < 0 ? -1 : 1, sz = dz < 0 ? -1 : 1;
  let cx = Math.floor(x / WORLD_CELL), cz = Math.floor(z / WORLD_CELL);
  const tx = WORLD_CELL / Math.abs(dx), tz = WORLD_CELL / Math.abs(dz);
  let nx = (sx > 0 ? (cx + 1) * WORLD_CELL - x : x - cx * WORLD_CELL) / Math.abs(dx);
  let nz = (sz > 0 ? (cz + 1) * WORLD_CELL - z : z - cz * WORLD_CELL) / Math.abs(dz);
  const out = [keyOf(cx, cz)];
  for (let k = 0; k < 1000; k++) {
    const direction = nx < nz ? (sx > 0 ? 1 : 3) : (sz > 0 ? 2 : 0);
    if (Math.min(nx, nz) > reach) break;
    const previous = world.cell(cx, cz);
    if (nx < nz) {cx += sx; nx += tx;} else {cz += sz; nz += tz;}
    out.push(keyOf(cx, cz));
    const next = world.cell(cx, cz);
    if (!(previous.active === false || next.active === false || previous.open[direction] || next.open[(direction + 2) % 4])) break;
  }
  return out;
}
function wallHit(x, z, dx, dz, wall, reach) {
  let near = 0, far = reach;
  for (const [position, direction, low, high] of [[x, dx, wall.x - wall.w / 2, wall.x + wall.w / 2], [z, dz, wall.z - wall.d / 2, wall.z + wall.d / 2]]) {
    if (Math.abs(direction) < 1e-15) {if (position < low || position > high) return Infinity; continue;}
    const a = (low - position) / direction, b = (high - position) / direction;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return Infinity;
  }
  return near;
}
function physicallyVisited(x, z, angle, reach, walls) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  let hit = reach, hitWall = null;
  for (const wall of walls) {const t = wallHit(x, z, dx, dz, wall, reach); if (t < hit) {hit = t; hitWall = wall;}}
  let cx = Math.floor(x / WORLD_CELL), cz = Math.floor(z / WORLD_CELL);
  const sx = dx < 0 ? -1 : 1, sz = dz < 0 ? -1 : 1;
  const tx = WORLD_CELL / Math.abs(dx), tz = WORLD_CELL / Math.abs(dz);
  let nx = (sx > 0 ? (cx + 1) * WORLD_CELL - x : x - cx * WORLD_CELL) / Math.abs(dx);
  let nz = (sz > 0 ? (cz + 1) * WORLD_CELL - z : z - cz * WORLD_CELL) / Math.abs(dz);
  const cells = [keyOf(cx, cz)];
  for (let k = 0; k < 1000 && Math.min(nx, nz) <= hit; k++) {
    if (nx < nz) {cx += sx; nx += tx;} else {cz += sz; nz += tz;}
    cells.push(keyOf(cx, cz));
  }
  return {cells, hitWall};
}

test('closed walls stop the 360-degree traversal and retain their neighboring ownership cells', () => {
  const world = fixture(), cells = visibleCorridorCells(world, 2.5, 2.5, 200);
  assert.deepEqual(keys(cells), new Set(['0,0', '0,-1', '1,0', '0,1', '-1,0']));
  assert.equal(world.reads, 5);
  assert.deepEqual(visibleCorridorCells(world, 2.5, 2.5, 0), [{x: 0, z: 0}]);
});

test('continuous portal clipping keeps arbitrarily narrow corner slivers and rejects hidden bends', () => {
  const world = fixture(path([[0, 0], [1, 0], [1, 1], [1, 2], [2, 2], [3, 2], [3, 3]]));
  for (const epsilon of [1e-3, 1e-7, 1e-11]) {
    const selected = keys(visibleCorridorCells(world, 2.5, 2.5 - epsilon, 80));
    assert(selected.has('2,2'), `a ${epsilon}-metre origin offset exposes a sliver`);
    const angle = Math.atan(1 + epsilon / 5);
    for (const cell of rayCells(world, 2.5, 2.5 - epsilon, angle, 80)) assert(selected.has(cell), cell);
    if (epsilon >= 1e-7) assert(!selected.has('3,3'), 'the final bend is fully hidden even though the corridor remains connected');
  }
});

test('negative coordinates, exact corner origins, and subnanometre seam offsets remain conservative', () => {
  const world = fixture([], true), reach = 26;
  for (const [x, z] of [[-27.5, -2.5], [0, 0], [-5, -5], [-1e-11, 5 + 1e-11], [5 - 1e-11, -5 + 1e-11]]) {
    const cells = visibleCorridorCells(world, x, z, reach); assert(cells);
    const selected = keys(cells);
    for (let zz = Math.floor((z - reach) / 5); zz <= Math.floor((z + reach) / 5); zz++) for (let xx = Math.floor((x - reach) / 5); xx <= Math.floor((x + reach) / 5); xx++) {
      const nearX = Math.max(xx * 5, Math.min((xx + 1) * 5, x)), nearZ = Math.max(zz * 5, Math.min((zz + 1) * 5, z));
      if (Math.hypot(nearX - x, nearZ - z) <= reach) assert(selected.has(keyOf(xx, zz)), `${x},${z}: missing ${xx},${zz}`);
    }
  }
});

test('cyclic open rooms terminate, and exhausted work/read budgets return null rather than partial visibility', () => {
  const room = fixture([], true), cells = visibleCorridorCells(room, 2.5, 2.5, 30);
  assert(cells && cells.length > 100 && cells.length < 200);
  const bounded = fixture([], true);
  assert.equal(visibleCorridorCells(bounded, 2.5, 2.5, 200, {maxCells: 20}), null);
  assert(bounded.reads <= 20);
  const budget = fixture([], true);
  assert.equal(visibleCorridorCells(budget, 2.5, 2.5, 200, {maxSteps: 20}), null);
  assert(budget.reads <= 20);
  for (const args of [[NaN, 0, 10], [0, Infinity, 10], [0, 0, -1], [0, 0, Infinity], [1e15, 0, 10]]) assert.equal(visibleCorridorCells(room, ...args), null);
  assert.equal(visibleCorridorCells({}, 0, 0, 10), null);
  assert.equal(visibleCorridorCells({cell: () => null}, 0, 0, 10), null);
});

test('the real procedural maze contains 360-degree ray visibility across every seam direction and Manila', () => {
  for (let seed = 0; seed < 32; seed++) {
    const game = new Game(seed), world = game.world, positions = [[27.5, 27.5], [-32.7, -56.3], [0, 0], [game.maze.doorX - .081, game.maze.doorZ], [game.maze.doorX + 2.1, game.maze.doorZ], [game.maze.doorX + 5.8, game.maze.doorZ + 2.3]];
    for (const [cx, cz] of [[0, 0], [-1, -1]]) for (let d = 0; d < 4; d++) {
      const s = world.portal(cx, cz, d), x = (cx * 11 + (d === 1 ? 11 : d === 3 ? 0 : s + .5)) * 5;
      const z = (cz * 11 + (d === 2 ? 11 : d === 0 ? 0 : s + .5)) * 5;
      positions.push([x, z]);
    }
    for (const [x, z] of positions) {
      const reach = reachFor(2.4), selectedCells = visibleCorridorCells(world, x, z, reach);
      assert(selectedCells, `seed ${seed}, ${x},${z} unexpectedly exhausted the conservative traversal`);
      const selected = keys(selectedCells);
      for (let i = 0; i < 384; i++) {
        const angle = (i + .173) * 2 * Math.PI / 384;
        for (const cell of rayCells(world, x, z, angle, reach)) assert(selected.has(cell), `seed ${seed}, ${x},${z}, ray ${i}: missing ${cell}`);
      }
    }
  }
});

test('independent physical wall-box rays retain visible floors and shared wall owners beside corners and Manila', () => {
  for (const seed of [0, 7, 42, 500]) {
    const game = new Game(seed), world = game.world, reach = reachFor(2.4), positions = [[27.5, 27.5], [-32.7, -56.3], [54.999999999, game.maze.doorZ], [55.000000001, game.maze.doorZ], [60.8, game.maze.doorZ + 2.419999999]];
    if (seed === 42) for (const [cx, cz] of [[0, 0], [-1, -1]]) for (let d = 0; d < 4; d++) {
      const s = world.portal(cx, cz, d);
      positions.push([(cx * 11 + (d === 1 ? 11 : d === 3 ? 0 : s + .5)) * 5, (cz * 11 + (d === 2 ? 11 : d === 0 ? 0 : s + .5)) * 5]);
    }
    // Include points a billionth of a metre outside physical .16-metre walls.
    for (const wall of world.cell(5, 5).walls) {
      if (wall.w > wall.d) positions.push([wall.x + wall.w / 2 - .080000001, wall.z + wall.d / 2 + 1e-9]);
      else positions.push([wall.x + wall.w / 2 + 1e-9, wall.z + wall.d / 2 - .080000001]);
    }
    for (const [x, z] of positions) {
      const selectedCells = visibleCorridorCells(world, x, z, reach); assert(selectedCells);
      const selected = keys(selectedCells), owners = halo(selectedCells);
      const r = Math.ceil(reach / 5) + 1, cx = Math.floor(x / 5), cz = Math.floor(z / 5);
      const walls = [...world.wallsInRect(cx - r, cz - r, cx + r, cz + r), ...game.roomWalls];
      const angles = Array.from({length: 256}, (_, i) => (i + .291) * 2 * Math.PI / 256);
      // Angles immediately to either side of actual wall-box vertices target
      // near-tangent slivers instead of relying only on a uniform direction grid.
      for (const wall of world.wallsNear(x, z, 15)) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const angle = Math.atan2(wall.z + sz * wall.d / 2 - z, wall.x + sx * wall.w / 2 - x);
        angles.push(angle - 1e-10, angle, angle + 1e-10);
      }
      for (const angle of angles) {
        const result = physicallyVisited(x, z, angle, reach, walls);
        for (const cell of result.cells) assert(selected.has(cell), `physical ray seed ${seed}, ${x},${z}, angle ${angle}: missing ${cell}`);
        if (result.hitWall) assert(owners.has(keyOf(Math.floor(result.hitWall.x / 5), Math.floor(result.hitWall.z / 5))), 'the visible wall owner is included after a one-cell halo');
      }
    }
  }
});

test('all-yaw spawn regions are a small invariant set within the existing 49-region capacity', () => {
  for (let seed = 0; seed < 128; seed++) {
    const game = new Game(seed), cells = visibleCorridorCells(game.world, 27.5, 27.5, reachFor(2.4)); assert(cells);
    const regions = new Set([...halo(cells)].map(key => {
      const [x, z] = key.split(',').map(Number); return keyOf(Math.floor(x / RENDER_CELLS), Math.floor(z / RENDER_CELLS));
    }));
    assert(regions.size <= 12, `seed ${seed}: ${regions.size} full-turn required regions`);
    assert.deepEqual(visibleCorridorCells(game.world, 27.5, 27.5, reachFor(2.4)), cells, 'exact position/radius determines the result without yaw or pitch');
  }
});
