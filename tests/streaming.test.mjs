import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, makeMaze, CELL, SIZE, RADIUS} from '../dist/game.js';
import {
  ChunkWorld, RenderChunkStream, CHUNK_CELLS, CHUNK_METRES,
  DATA_CACHE_LIMIT, DIRECTIONS, RENDER_CELLS, RENDER_METRES, RENDER_LIMIT, VIEW_REGION_LIMIT, keyOf,
} from '../dist/world.js';

const EPSILON = 1e-6;
const FIXED_IDS = ['food-1', 'food-2', 'food-3', 'food-4', 'water-1', 'water-2', 'phone-1'];
const close = (actual, expected, message) => assert(Math.abs(actual - expected) < EPSILON, `${message}: ${actual} != ${expected}`);
const cellCenter = c => [(c.x + .5) * CELL, (c.z + .5) * CELL];
const chunkSnapshot = chunk => JSON.stringify(chunk);
const portalIndex = (direction, slot) => direction === 0 ? slot : direction === 1 ? slot * CHUNK_CELLS + CHUNK_CELLS - 1 : direction === 2 ? (CHUNK_CELLS - 1) * CHUNK_CELLS + slot : slot * CHUNK_CELLS;

function assertConnectedChunk(chunk, context) {
  const active = chunk.cells.filter(cell => cell.active);
  assert(active.length > 0, context);
  const n = CHUNK_CELLS, first = chunk.cells.indexOf(active[0]), seen = new Set([first]), queue = [first];
  for (const index of queue) {
    const cell = chunk.cells[index], localX = index % n, localZ = Math.floor(index / n);
    cell.open.forEach((open, direction) => {
      if (!open) return;
      const [dx, dz] = DIRECTIONS[direction], x = localX + dx, z = localZ + dz;
      if (x < 0 || x >= n || z < 0 || z >= n) return;
      const neighborIndex = z * n + x, neighbor = chunk.cells[neighborIndex];
      assert(neighbor.active, `${context}: open edge enters reserved cell ${neighborIndex}`);
      assert(neighbor.open[(direction + 2) % 4], `${context}: nonreciprocal interior edge`);
      if (!seen.has(neighborIndex)) {seen.add(neighborIndex); queue.push(neighborIndex);}
    });
  }
  assert.equal(seen.size, active.length, `${context}: every active cell must be reachable without leaving the chunk`);
  for (const cell of chunk.cells.filter(cell => !cell.active)) {
    assert(cell.open.every(open => !open), `${context}: a reserved Manila cell cannot advertise a maze opening`);
    assert.deepEqual(cell.walls, [], `${context}: reserved cells have no generated room geometry`);
  }
}

// These helpers traverse the real exported simulation. Only yaw is assigned;
// positions, collision, folds, and inter-chunk transfers all run through Game.move.
function moveTo(game, x, z, onStep = () => {}) {
  const loops = game.loops;
  game.player.yaw = Math.atan2(x - game.player.x, -(z - game.player.z));
  game.move(x - game.player.x, z - game.player.z);
  close(game.player.x, x, 'walked x'); close(game.player.z, z, 'walked z');
  assert(!game.collides(game.player.x, game.player.z), 'real movement must not finish inside a wall');
  assert.equal(game.loops, loops, 'ordinary chunk travel must not trigger an occluded fold');
  onStep(game);
}
function moveWithinChunk(game, goalIndex, onStep) {
  const cx = Math.floor(game.player.x / CHUNK_METRES), cz = Math.floor(game.player.z / CHUNK_METRES);
  const chunk = game.world.chunk(cx, cz), n = CHUNK_CELLS;
  const x = Math.floor(game.player.x / CELL) - cx * n, z = Math.floor(game.player.z / CELL) - cz * n;
  const start = z * n + x, parents = new Map([[start, null]]), queue = [start];
  for (const index of queue) {
    if (index === goalIndex) break;
    chunk.cells[index].open.forEach((open, direction) => {
      if (!open) return;
      const [dx, dz] = DIRECTIONS[direction], xx = index % n + dx, zz = Math.floor(index / n) + dz;
      if (xx < 0 || xx >= n || zz < 0 || zz >= n) return;
      const next = zz * n + xx;
      if (chunk.cells[next].active && !parents.has(next)) {parents.set(next, index); queue.push(next);}
    });
  }
  assert(parents.has(goalIndex), `missing local route in ${chunk.key} to ${goalIndex}`);
  const route = [];
  for (let index = goalIndex; index !== null; index = parents.get(index)) route.unshift(index);
  for (const index of route) moveTo(game, ...cellCenter(chunk.cells[index]), onStep);
}
function crossChunk(game, direction, onStep) {
  const cx = Math.floor(game.player.x / CHUNK_METRES), cz = Math.floor(game.player.z / CHUNK_METRES);
  const slot = game.world.portal(cx, cz, direction), index = portalIndex(direction, slot);
  moveWithinChunk(game, index, onStep);
  const [dx, dz] = DIRECTIONS[direction], before = {...game.player};
  moveTo(game, before.x + dx * CELL, before.z + dz * CELL, onStep);
  assert.equal(Math.floor(game.player.x / CHUNK_METRES), cx + dx);
  assert.equal(Math.floor(game.player.z / CHUNK_METRES), cz + dz);
  assert.equal(game.entered, false, 'crossing an eastern chunk is not entering Manila');
  assert.equal(game.changed, false);
}
function tick(game, seconds) {for (let left = seconds; left > 1e-9; left -= .02) game.update(Math.min(left, .02));}

function schedulerFixture({yields = 4, clockStep = 1} = {}) {
  let time = 0, serial = 0;
  const resources = [], disposals = [];
  const stream = new RenderChunkStream({
    clock: () => {const now = time; time += clockStep; return now;},
    create: (x, z) => {
      const value = {id: ++serial, key: keyOf(x, z), steps: 0, finished: false, finalized: false, disposed: false};
      resources.push(value);
      return {value, iterator: (function* () {
        try {for (let i = 0; i < yields; i++) {value.steps++; yield i;} value.finished = true;}
        finally {value.finalized = true;}
      })()};
    },
    dispose: value => {
      assert.equal(value.disposed, false, `resource ${value.id} disposed twice`);
      value.disposed = true; disposals.push(value);
    },
  });
  return {stream, resources, disposals};
}
function drain(stream) {
  for (let count = 0; stream.stats().pending && count < 100; count++) stream.process(Infinity, 64);
  assert.equal(stream.stats().pending, 0, 'finite build jobs must finish');
}

test('256 seeds: chunks are deterministic after reversed requests and LRU eviction, with connected reciprocal seams across negative coordinates', () => {
  const points = [];
  for (let z = -2; z <= 2; z++) for (let x = -2; x <= 2; x++) points.push([x, z]);
  assert.equal(CHUNK_CELLS, SIZE); assert.equal(CHUNK_METRES, CELL * SIZE);
  for (let seed = 0; seed < 256; seed++) {
    const landmark = makeMaze(seed), unchangedLandmark = JSON.stringify(landmark);
    const first = new ChunkWorld(seed, landmark), reverse = new ChunkWorld(seed, makeMaze(seed));
    const snapshots = new Map();
    for (const [cx, cz] of points) {
      const chunk = first.chunk(cx, cz), context = `seed ${seed}, chunk ${cx},${cz}`;
      assert.equal(chunk.cells.length, CHUNK_CELLS ** 2, context);
      assertConnectedChunk(chunk, context);
      assert.equal(chunk.cells.filter(c => !c.active).length, cx === 1 && cz === 0 ? 2 : 0, context);
      snapshots.set(chunk.key, chunkSnapshot(chunk));
      assert(first.stats().resident <= DATA_CACHE_LIMIT);
    }
    assert(first.stats().evicted > 0, 'the first requests must really exceed the cache');
    for (const [cx, cz] of points.slice().reverse()) {
      assert.equal(chunkSnapshot(reverse.chunk(cx, cz)), snapshots.get(keyOf(cx, cz)), `seed ${seed}: request order changes geometry`);
    }
    for (const [cx, cz] of points) {
      const chunk = first.chunk(cx, cz);
      assert.equal(chunkSnapshot(chunk), snapshots.get(chunk.key), `seed ${seed}: regenerated geometry differs`);
      for (let direction = 0; direction < 4; direction++) {
        const [dx, dz] = DIRECTIONS[direction], opposite = (direction + 2) % 4;
        const neighbor = first.chunk(cx + dx, cz + dz), slot = first.portal(cx, cz, direction);
        assert.equal(slot, first.portal(cx + dx, cz + dz, opposite), `seed ${seed}: canonical seam mismatch`);
        for (let i = 0; i < CHUNK_CELLS; i++) {
          const cell = chunk.cells[portalIndex(direction, i)], other = neighbor.cells[portalIndex(opposite, i)];
          assert.equal(cell.open[direction], i === slot, `seed ${seed}, ${chunk.key}: unexpected boundary opening`);
          assert.equal(cell.open[direction], other.open[opposite], `seed ${seed}: nonreciprocal chunk boundary`);
          if (i === slot) {
            assert(cell.active && other.active, `seed ${seed}: a portal cannot enter reserved Manila cells`);
            assert.equal(other.x - cell.x, dx); assert.equal(other.z - cell.z, dz);
          }
        }
      }
    }
    assert.equal(JSON.stringify(landmark), unchangedLandmark, 'opening streamed seams must not rewrite the fixed Manila route or original fold blueprint');
  }
});

test('long coordinate travel keeps the real procedural data LRU at 16 and regenerates identical negative chunks', () => {
  const world = new ChunkWorld(0xDEADBEEF, makeMaze(0xDEADBEEF));
  const original = chunkSnapshot(world.chunk(-17, -9));
  for (let i = 0; i < 800; i++) {
    const cx = i - 400, cz = i % 2 ? -i - 1 : i + 1;
    const cell = world.cell(cx * CHUNK_CELLS + 3, cz * CHUNK_CELLS + 7);
    assert.equal(cell.x, cx * CHUNK_CELLS + 3); assert.equal(cell.z, cz * CHUNK_CELLS + 7);
    assert(world.stats().resident <= DATA_CACHE_LIMIT);
  }
  assert.equal(world.stats().resident, 16);
  assert(world.stats().evicted >= 785);
  assert(!world.cache.has('-17,-9'), 'the original chunk must actually have been unloaded');
  assert.equal(chunkSnapshot(world.chunk(-17, -9)), original);
  assert.equal(world.stats().resident, 16);
  const retained = world.chunk(-17, -9);
  assert.equal(world.chunk(-17, -9), retained, 'a live cache hit reuses its chunk');
  assert.equal([...world.cache.keys()].at(-1), '-17,-9', 'hits refresh LRU order');
});

test('Game.move physically crosses real east, west, north, and south portals outside the original 11×11 map and still stops at closed walls', () => {
  for (const seed of [0, 1, 10, 12, 39, 42, 20261006, 0xFFFFFFFF]) {
    const game = new Game(seed); game.start();
    // All four directions, including negative axes and returning from the east.
    for (const direction of [1, 0, 2, 3, 3, 0, 3, 0, 1, 1, 1, 1, 2, 2, 3]) crossChunk(game, direction, g => {
      g.update(.001); assert.equal(g.entered, false); assert.equal(g.mode, 'playing');
    });
    assert.equal(Math.floor(game.player.x / CHUNK_METRES), 1);
    assert.equal(Math.floor(game.player.z / CHUNK_METRES), 0);
    // Walk to the active cell immediately east of the reserved room strip.
    const goalZ = game.maze.cells[game.maze.goal].z;
    moveWithinChunk(game, goalZ * CHUNK_CELLS + 2);
    game.move(-CELL * 2, 0); game.update(.02);
    assert(game.player.x >= (SIZE + 2) * CELL + RADIUS, 'the eastern maze cannot enter the back of Manila');
    assert.equal(game.inRoom(), false); assert.equal(game.entered, false); assert.equal(game.door, 0);
    assert.equal(game.changed, false); assert.equal(game.loops, 0);
    crossChunk(game, 2);
    const cx = 1, cz = 1, portal = game.world.portal(cx, cz, 1), closedSlot = (portal + 1) % CHUNK_CELLS;
    moveWithinChunk(game, portalIndex(1, closedSlot));
    const boundaryX = (cx + 1) * CHUNK_METRES, z = game.player.z;
    assert(game.collides(boundaryX, z), 'a closed exterior wall must be real collision geometry');
    game.move(CELL * 2, 0);
    assert(game.player.x < boundaryX - RADIUS);
    assert(!game.collides(game.player.x, game.player.z));
    assert.equal(Math.floor(game.player.x / CHUNK_METRES), cx, 'large movement cannot tunnel through a wall');
  }
});

test('item ledger survives actual long walking, render unload, data eviction, revisit, drop, pickup, and consumption without resurrection', () => {
  const game = new Game(42); game.start();
  const {stream, resources, disposals} = schedulerFixture({yields: 1});
  const renderAtPlayer = () => {stream.update(game.player.x, game.player.z); drain(stream);};
  renderAtPlayer(); game.renderReady = (x, z) => stream.readyAt(x, z);
  const objects = game.items.slice(), water = game.items.filter(i => i.kind === 'water').map(i => ({...i}));
  assert.equal(game.drop('food-1'), 'food-1');
  const marker = game.items.find(i => i.id === 'food-1'), savedMarker = {...marker};
  game.food = 50; assert.equal(game.consume('food', 'food-2'), 'food-2');
  // Update the ready neighborhood after each real walking leg.
  const streamAhead = () => {stream.update(game.player.x, game.player.z); drain(stream);};
  for (let i = 0; i < 20; i++) crossChunk(game, 3, streamAhead);
  assert(!game.world.cache.has('0,0'), 'long physical travel evicts the origin data chunk');
  assert.equal(game.worldItemVisible(marker), false, 'unloaded render chunks hide their existing markers');
  assert.deepEqual(marker, savedMarker); assert(disposals.length > 0);
  assert.equal(game.drop('food-3'), 'food-3');
  const farMarker = game.items.find(i => i.id === 'food-3'), farPosition = {...farMarker};
  assert.equal(game.pickupItem('food-3'), 'food-3');
  game.food = 40; assert.equal(game.consume('food', 'food-3'), 'food-3');
  for (let i = 0; i < 20; i++) crossChunk(game, 1, streamAhead);
  moveWithinChunk(game, game.maze.start, streamAhead);
  assert.equal(game.worldItemVisible(marker), true);
  assert.deepEqual(marker, savedMarker); assert.equal(game.nearestItem(), marker);
  assert.equal(game.pickupItem(marker.id), marker.id);
  assert.equal(game.drop(marker.id), marker.id);
  assert.equal(game.pickupItem(marker.id), marker.id);
  game.food = 40; assert.equal(game.consume('food', marker.id), marker.id);
  const ledger = JSON.stringify(game.items);
  for (let i = 1; i <= 80; i++) game.world.chunk(i, -i);
  game.world.cell(Math.floor(farPosition.x / CELL), Math.floor(farPosition.z / CELL));
  game.world.chunk(0, 0);
  stream.update(10000, -10000); drain(stream); renderAtPlayer();
  assert.equal(JSON.stringify(game.items), ledger, 'regenerated data and render chunks cannot recreate consumed items');
  assert.deepEqual(game.items.map(i => i.id), FIXED_IDS);
  assert(game.items.every((item, i) => item === objects[i]), 'all ledger object identities remain stable');
  assert.deepEqual(game.items.filter(i => i.kind === 'water'), water, 'streaming produces no water away from Manila');
  assert.equal(new Set(game.items.map(i => i.id)).size, 7);
  assert.equal(game.pickupItem('food-1'), undefined); assert.equal(game.pickupItem('food-3'), undefined);
  stream.clear(); assert.equal(resources.length, disposals.length, 'every created render resource is released');
});

test('the original Manila route and finite water remain usable after origin eviction, and reset creates a clean world and ledger', () => {
  const game = new Game(12); game.start();
  const route = game.maze.route.slice(), blueprint = JSON.stringify(game.maze), oldWorld = game.world;
  for (let i = 1; i <= 64; i++) game.world.chunk(i, -i);
  assert(!game.world.cache.has('0,0'));
  for (const index of route) moveTo(game, ...cellCenter(game.maze.cells[index]));
  assert.equal(JSON.stringify(game.maze), blueprint);
  moveTo(game, game.maze.doorX - 1.25, game.maze.doorZ);
  assert.equal(game.interact(), 'door'); tick(game, 1); assert.equal(game.door, 1);
  moveTo(game, game.maze.doorX + 2.1, game.maze.doorZ); tick(game, .02);
  assert.equal(game.entered, true); assert.equal(game.changed, false);
  assert.equal(game.interact(), 'door'); tick(game, 1); assert.equal(game.changed, true);
  moveTo(game, game.maze.doorX + 3.6, game.maze.doorZ - .65);
  for (const id of ['water-1', 'water-2']) {
    assert.equal(game.pickupItem(id), id);
    game.hydration = 20; assert.equal(game.consume('water', id), id);
  }
  for (let i = 1; i <= 64; i++) game.world.chunk(-i, i);
  assert.equal(game.items.filter(i => i.kind === 'water' && i.state !== 'consumed').length, 0);
  assert.deepEqual(game.items.map(i => i.id), FIXED_IDS);
  game.renderReady = () => false; game.inventoryOpen = true;
  assert.equal(game.reset(12), game);
  assert.notEqual(game.world, oldWorld); assert.equal(game.renderReady, null);
  assert.equal(game.world.stats().resident, 1); assert.equal(game.world.stats().evicted, 0);
  assert.deepEqual(game.snapshot(), new Game(12).snapshot());
  assert.deepEqual(game.maze.route, route);
  assert.equal(game.inventory('food').length, 4); assert.equal(game.inventory('water').length, 0);
  assert.equal(game.items.filter(i => i.kind === 'water' && i.state === 'world').length, 2);
});

test('exported RenderChunkStream applies time and step budgets, prioritizes the center, and gates pending cells including negative coordinates', () => {
  const {stream} = schedulerFixture();
  stream.update(0, 0);
  assert.equal(stream.stats().resident, RENDER_LIMIT); assert.equal(stream.stats().pending, 25);
  assert.equal(stream.readyAt(0, 0), false);
  assert.equal(stream.process(3, 99), 3, 'one-millisecond work checks stop at the three-millisecond budget');
  assert.equal(stream.records.get('0,0').value.steps, 3);
  assert.equal([...stream.records.values()].filter(r => r.value).length, 1, 'the center builds before peripheral regions');
  assert.equal(stream.readyAt(0, 0), false, 'a yielded, partially built region is still pending');
  assert.equal(stream.process(Infinity, 1), 1); assert.equal(stream.readyAt(0, 0), false);
  assert.equal(stream.process(Infinity, 1), 1); assert.equal(stream.readyAt(0, 0), true);
  assert.equal(stream.readyAt(RENDER_METRES - .001, RENDER_METRES - .001), true);
  assert.equal(stream.readyAt(RENDER_METRES, 0), false);
  assert.equal(stream.process(Infinity, 0), 0);
  const readyValue = stream.records.get('0,0').value;
  stream.update(-.001, -.001); assert.equal(stream.center, '-1,-1');
  assert.equal(stream.records.get('0,0').value, readyValue, 'overlapping regions are retained');
  drain(stream);
  assert.equal(stream.readyAt(-.001, -.001), true);
  assert.equal(stream.readyAt(-RENDER_METRES, -RENDER_METRES), true);
  assert.equal(stream.readyAt(-4 * RENDER_METRES, 0), false);
  assert.equal(stream.stats().ready, 25); assert.equal(stream.stats().pending, 0);
  stream.clear();
});

test('the real render scheduler keeps ready plus pending at 25, disposes unloaded and canceled resources, and never revives stale jobs', () => {
  const {stream, resources, disposals} = schedulerFixture({yields: 5});
  stream.update(0, 0); drain(stream);
  const firstGeneration = resources.slice();
  stream.update(20 * RENDER_METRES, -20 * RENDER_METRES);
  assert(firstGeneration.every(value => value.disposed && value.finalized));
  assert.equal(disposals.length, 25, 'completed geometry invokes the supplied disposer on unload');
  assert.equal(stream.process(Infinity, 2), 2);
  const canceled = resources.at(-1), stoppedAt = canceled.steps;
  assert.equal(canceled.finished, false);
  stream.update(-20 * RENDER_METRES, 20 * RENDER_METRES);
  assert(canceled.disposed && canceled.finalized, 'iterator.return and geometry disposal both run on cancellation');
  for (let i = 0; i < 300; i++) {
    stream.update((i - 150) * RENDER_METRES * 3, (i % 2 ? -i : i) * RENDER_METRES * 3);
    const steps = stream.process(3, 2), stats = stream.stats();
    assert(steps <= 2); assert.equal(stats.ready + stats.pending, stats.resident);
    assert.equal(stats.resident, 25); assert(stats.maxResident <= 25);
    assert([...stream.records.values()].every(record => !record.value?.disposed));
  }
  assert.equal(canceled.steps, stoppedAt, 'an unloaded generator is never advanced again');
  assert(![...stream.records.values()].some(record => record.value === canceled));
  drain(stream); assert.equal(stream.stats().ready, 25);
  stream.clear();
  assert.equal(stream.records.size, 0); assert.equal(stream.center, null);
  assert.equal(stream.stats().ready, 0); assert.equal(stream.stats().pending, 0);
  assert.equal(stream.readyAt(0, 0), false);
  assert.equal(stream.process(Infinity, 100), 0, 'clearing removes queued work as well as completed chunks');
  assert.equal(resources.length, disposals.length);
  assert(resources.every(value => value.disposed && value.finalized));
  stream.clear(); assert.equal(resources.length, disposals.length, 'clear is idempotent');
  stream.update(0, 0); assert.equal(stream.stats().pending, 25);
  stream.process(Infinity, 1);
  const freshPending = resources.at(-1);
  assert(!firstGeneration.includes(freshPending)); assert.equal(freshPending.finished, false);
  stream.clear();
  assert(freshPending.finalized && freshPending.disposed, 'full clear also cancels a newly started build');
  assert.equal(resources.length, disposals.length);
});


test('Game.move cannot enter a pending render region and resumes through the same open passage when its real scheduler finishes', () => {
  const game = new Game(42); game.start();
  const {stream} = schedulerFixture();
  stream.update(game.player.x, game.player.z);
  game.renderReady = (x, z) => stream.readyAt(x, z);
  const origin = {...game.player};
  assert(game.collides(origin.x, origin.z), 'the spawn is gated until its surfaces finish');
  game.move(.4, 0); assert.deepEqual(game.player, origin);
  stream.process(Infinity, 4);
  assert(game.collides(origin.x, origin.z), 'yielding the last construction step is not completion');
  stream.process(Infinity, 1);
  assert(!game.collides(origin.x, origin.z));
  moveTo(game, 32.5, 27.5);
  assert(game.world.cell(6, 5).open[1] && game.world.cell(7, 5).open[3], 'the tested east passage has no physical wall');
  assert.equal(stream.readyAt(37.5, 27.5), false);
  game.move(CELL, 0);
  assert(game.player.x > 34 && game.player.x < 35, 'movement stops at the pending region boundary');
  close(game.player.z, origin.z, 'gated movement keeps z');
  drain(stream);
  moveTo(game, 37.5, 27.5);
  stream.clear();
  const before = {...game.player}; game.move(.4, 0);
  assert.deepEqual(game.player, before, 'cleared render readiness blocks movement again');
});

test('a retained partial build stays the sole active iterator when the render center changes', () => {
  const {stream, resources} = schedulerFixture({yields: 10});
  stream.update(0, 0); stream.process(Infinity, 2);
  const original = resources[0];
  for (let i = 1; i <= 2; i++) {
    stream.update(i * RENDER_METRES, 0); stream.process(Infinity, 2);
    assert.equal(resources.length, 1, 'center reprioritization must not start concurrent builders');
    assert.equal(original.steps, 2 + i * 2);
    assert.equal([...stream.records.values()].filter(record => record.iterator).length, 1);
  }
  stream.update(3 * RENDER_METRES, 0);
  assert(original.finalized && original.disposed, 'the old builder is canceled when it leaves the retained window');
  stream.process(Infinity, 2);
  assert.equal(resources.length, 2); assert.equal(resources[1].key, '3,0');
  assert.equal(original.steps, 6); assert.equal(stream.stats().completed, 0);
  assert.equal([...stream.records.values()].filter(record => record.iterator).length, 1);
  drain(stream); stream.clear();
});

test('clearRadius never exposes unloaded or partial regions and becomes zero on a full clear', () => {
  const {stream} = schedulerFixture(), metres = RENDER_METRES, half = metres / 2;
  assert.equal(stream.clearRadius(half, half), 0, 'an uninitialized stream has no visible radius');
  stream.update(0, 0);
  assert.equal(stream.clearRadius(half, half), 0);
  stream.process(Infinity, 5);
  close(stream.clearRadius(half, half), half, 'center-only ready radius');
  close(stream.clearRadius(metres - 1, half), 1, 'distance to the pending east neighbor');
  assert.equal(stream.clearRadius(metres + 1, half), 0);
  drain(stream);
  close(stream.clearRadius(half, half), metres * 2.5, 'fully ready window radius');
  assert.equal(stream.clearRadius(-2 * metres, 0), 0); assert.equal(stream.clearRadius(-2 * metres - 1, 0), 0);
  stream.update(metres, 0);
  close(stream.clearRadius(3 * metres - 1, half), 1, 'the new pending strip remains hidden');
  drain(stream);
  close(stream.clearRadius(3 * metres - 1, half), metres + 1, 'the radius expands only after the strip finishes');
  stream.clear(); assert.equal(stream.clearRadius(3 * metres - 1, half), 0);
});

const viewPoint = (x, z = 0, required = true) => ({x, z, required});

test('view requests prioritize all required regions, cap optional prefetch at 49, and reject overflowing required sets atomically', () => {
  assert.equal(RENDER_CELLS, 7); assert.equal(RENDER_METRES, 35); assert.equal(VIEW_REGION_LIMIT, 49);
  const {stream, resources, disposals} = schedulerFixture({yields: 1});
  const required = [viewPoint(-3, -2), viewPoint(4, 3), viewPoint(0, 0)];
  const prefetch = Array.from({length: 80}, (_, i) => viewPoint(i + 20, 10, false));
  assert.equal(stream.request([prefetch[0], required[0], ...prefetch.slice(1), ...required.slice(1)], 0, 0), true);
  assert.equal(stream.stats().resident, 49); assert.equal(stream.stats().limit, 49);
  assert.equal(stream.required.size, 3); assert.equal(stream.desired.size, 49);
  assert.deepEqual([...stream.desired.keys()].slice(0, 3), required.map(p => keyOf(p.x, p.z)));
  assert.equal(stream.requiredReady(), false);
  stream.process(Infinity, 6);
  assert.deepEqual(resources.map(r => r.key), required.map(p => keyOf(p.x, p.z)));
  assert.equal(stream.requiredReady(), true, 'optional unfinished prefetch does not hold the visible frame');
  assert.equal(stream.stats().pending, 46);
  stream.process(Infinity, 1);
  const inFlight = resources.at(-1);
  assert.equal(inFlight.finished, false);
  const priorRecords = [...stream.records], priorDesired = stream.desired, priorRequired = stream.required, priorCenter = stream.center, priorStats = stream.stats();
  assert.equal(stream.request(Array.from({length: 50}, (_, i) => viewPoint(-i - 100, -100)), -10000, -10000), false);
  assert.deepEqual([...stream.records], priorRecords); assert.equal(stream.desired, priorDesired);
  assert.equal(stream.required, priorRequired); assert.equal(stream.center, priorCenter);
  assert.deepEqual(stream.stats(), priorStats); assert.equal(disposals.length, 0);
  assert.equal(inFlight.disposed, false); assert.equal(inFlight.finalized, false, 'overflow cannot cancel an accepted in-flight build');
  assert.equal(stream.requiredReady(), true, 'a rejected view cannot replace the accepted required set');
  drain(stream); assert.equal(stream.stats().ready, 49); stream.clear();
});

test('view request LRU retains recently seen ready regions for revisit and evicts only old unrequested entries when needed', () => {
  const {stream, resources, disposals} = schedulerFixture({yields: 0});
  const initial = Array.from({length: 49}, (_, i) => viewPoint(i));
  assert(stream.request(initial, 0, 0)); drain(stream);
  const original = new Map([...stream.records].map(([key, record]) => [key, record.value]));
  assert(stream.request([viewPoint(0)], 0, 0));
  assert.equal(stream.records.size, 49); assert.equal(disposals.length, 0);
  assert.equal([...stream.records.keys()].at(-1), '0,0');
  assert(stream.request([viewPoint(49)], 49 * RENDER_METRES, 0));
  assert.equal(stream.records.size, 49); assert(!stream.records.has('1,0'), 'least recently requested entry is evicted');
  assert(original.get('1,0').disposed); assert.equal(stream.records.get('0,0').value, original.get('0,0'));
  drain(stream);
  const createdBeforeRevisit = resources.length;
  assert(stream.request([viewPoint(0)], 0, 0)); assert(stream.requiredReady());
  assert.equal(stream.process(Infinity, 64), 0); assert.equal(resources.length, createdBeforeRevisit);
  assert.equal(stream.records.get('0,0').value, original.get('0,0'), 'a retained revisit reuses geometry');
  for (let i = 50; i < 250; i++) {
    assert(stream.request([viewPoint(i), viewPoint(i + 1, 0, false)], i * RENDER_METRES, 0));
    drain(stream);
    assert.equal(stream.stats().ready + stream.stats().pending, stream.stats().resident);
    assert.equal(stream.stats().resident, 49); assert(stream.stats().maxResident <= 49);
  }
  assert(!stream.records.has('0,0')); assert(original.get('0,0').disposed);
  assert(stream.request([viewPoint(0)], 0, 0)); assert.equal(stream.requiredReady(), false);
  drain(stream); assert.notEqual(stream.records.get('0,0').value, original.get('0,0'));
  assert.equal(stream.readyAt(.1, .1), true); assert.equal(stream.readyAt(-.1, -.1), false);
  stream.clear(); assert.equal(resources.length, disposals.length);
  assert.equal(stream.desired.size, 0); assert.equal(stream.required.size, 0);
});

test('turning a requested view cancels stale partial work while retaining completed regions and a single overlapping builder', () => {
  const {stream, resources} = schedulerFixture({yields: 4});
  assert(stream.request([viewPoint(0), viewPoint(1), viewPoint(2, 0, false)], 0, 0));
  stream.process(Infinity, 7);
  const complete = resources[0], partial = resources[1];
  assert.equal(complete.finished, true); assert.equal(partial.steps, 2);
  assert(stream.request([viewPoint(-1), viewPoint(-2, 0, false)], 0, 0));
  assert(partial.finalized && partial.disposed); assert.equal(complete.disposed, false);
  assert.equal(stream.records.has('1,0'), false); assert.equal(stream.records.has('2,0'), false);
  assert.equal(stream.readyAt(.1, .1), true, 'recent ready geometry remains local even outside the requested view');
  assert.equal(stream.requiredReady(), false);
  stream.process(Infinity, 2);
  const retainedPartial = resources.at(-1);
  assert(stream.request([viewPoint(-3), viewPoint(-1)], 0, 0));
  stream.process(Infinity, 1);
  assert.equal(retainedPartial.steps, 3); assert.equal(resources.length, 3, 'retained partial work is the only active builder');
  assert.equal([...stream.records.values()].filter(record => record.iterator).length, 1);
  drain(stream); assert(stream.requiredReady());
  assert.equal(partial.steps, 2, 'canceled work never advances on a later frame');
  assert.equal([...stream.records.values()].some(record => record.value === partial), false);
  assert(stream.request([], 0, 0)); assert(stream.requiredReady());
  assert.equal(stream.process(Infinity, 100), 0, 'unrequested cached records never create background jobs');
  stream.clear(); assert(resources.every(value => value.disposed && value.finalized));
});

test('duplicate view points upgrade to required without wasting capacity and square-window compatibility survives mode switches', () => {
  const {stream} = schedulerFixture({yields: 0});
  assert(stream.request([viewPoint(2, -1, false), viewPoint(3), viewPoint(2, -1, true)], 0, 0));
  assert.equal(stream.records.size, 2); assert.equal(stream.required.size, 2);
  assert.deepEqual([...stream.desired.keys()], ['2,-1', '3,0']);
  drain(stream); assert(stream.requiredReady());
  stream.update(0, 0); assert.equal(stream.stats().limit, 25); assert.equal(stream.records.size, 25);
  assert.equal(stream.required.size, 25); assert.equal(stream.requiredReady(), false);
  drain(stream); assert(stream.requiredReady());
  assert(stream.request([viewPoint(0)], 0, 0)); assert.equal(stream.stats().limit, 49);
  assert.equal(stream.records.size, 25); assert(stream.requiredReady());
  stream.clear();
});
