# v1.6.2 · Generation and turning performance

Build prepared 2026-10-06. Publication status is tracked in the release record.

## Root cause

v1.6.1 made every region touched by the full mathematical camera frustum a blocking dependency, including regions fully hidden behind opaque corridor walls. The conservative frustum-box test's union during a 360° phone turn exceeded the 49-region LRU. Turning repeatedly evicted and rebuilt the same invisible regions. The loading state also cleared held input, making the pause especially disruptive on touch controls.

## Changes

- Use bounded, continuous 2D portal clipping through the deterministic maze to prepare complete 360° corridor visibility. This is geometric interval clipping, not a finite ray approximation. Whole-height walls are legitimate occluders. Internal fold walls, the Manila doorway and reserved room strip are treated conservatively.
- Include closed-boundary cells plus a one-cell ownership halo. Both sides of region seams, wall endpoints, floor and ceiling remain available. Camera yaw and pitch no longer invalidate the ready corridor selection.
- Keep the original full-frustum selector as a safe fallback if bounded traversal cannot establish a complete result or the result would exceed capacity. No visible region is silently dropped.
- Warm one neighboring region ring in the background, ordered by proximity. Newly required regions preempt optional work at the next yield. Cache limits remain 49 render regions and 16 layout chunks.
- Preallocate final typed geometry buffers and yield while merging each source surface. This avoids temporary large JavaScript number arrays and a single long merge step.
- Reuse light-bake wall bounds, source arrays and bins; hoist unchanged light arithmetic and skip irrelevant nearest-wall work. Lighting samples and output are unchanged.

Camera FOV 76°, near/far .06/65 m, fog 16–80 m, light radius 9 m, four area samples, surfaces, texture coordinates, mesh buffers, materials and simulation are unchanged. No worker, external dependency, new feature or UI redesign was introduced.

## Reproducible results

Cloud Node v24.19.0 CPU measurements, not browser FPS or phone performance. Benchmark scripts run shipped application geometry under the existing DOM/renderer harness. No GPU rendering is involved.

### Turning

Run `node benchmarks/turn-readiness.mjs` in each version. Same seed 42, 844×390 viewport, four positions (spawn, another corridor, inside Manila, and 10 km away), 128 orientation changes/four full turns per position with simultaneous pitch variation. Rendering tasks are empty for this benchmark; it measures actual selector/scheduler reload events and region churn.

- v1.6.1: 57, 59, 58, 58 blocking loads; 441, 454, 422, 460 newly built region records.
- v1.6.2: 0 blocking loads and 0 newly built records at every position after initial readiness.
- Required region unions fall from 97–102 to 4–7; observed resident counts are 16–32, still capped at 49.

Raw results: `evidence/turns-before.json`, `evidence/turns-after.json`.

### Production generation

Run `node benchmarks/generation.mjs` in each version, sequentially. Fixed seed 5; regions (0,0), (2,-1), (-3,4), (285,-286); one warm-up and five measured builds per location. Layout cache starts cold for each build. Per-sample timers intentionally permit separating lighting from mesh work; their overhead is included equally in both versions. Individual phase medians are not additive.

Median per region, baseline → candidate:

- Total CPU: 127.19 → 104.31 ms (18.0% less)
- Layout: 0.81 → 0.73 ms
- Light sample calls: 90.14 → 80.32 ms
- Mesh and other work: 36.27 → 22.67 ms
- Merge subset: 9.05 → 1.99 ms (78.0% less)
- Median of each region's longest yielded step: 8.18 → 3.74 ms
- Worst observed yielded step over all 20 regions: 24.24 → 7.06 ms
- Median sample calls 9,424 and final buffer bytes 526,664 are unchanged

Timing fluctuates and includes VM/harness and garbage-collection effects. A 3 ms active-play / 8 ms loading scheduler target is checked after every yielded operation, not a hard real-time guarantee. Reducing unnecessary generation is the primary turning fix.

Raw results: `evidence/generation-before.json`, `evidence/generation-after.json`.

## Correctness

- Four representative complete region snapshots match v1.6.1 byte-for-byte, including positions, normals, UVs, vertex colours, indices and instance matrices/colours.
- 87,822 production RGB samples across seeds 0, 42, 0xDEADBEEF match the original Float64 values bit-for-bit. Identical 1,299,822 rays and 1,334,937 box tests; additional 4,000 contact cases and 24,000 randomized ray directions pass.
- Corridor tests compare 172,032 independent DDA rays across 32 seeds, physical wall rectangles and exact/tangent/sliver rays, positive/negative seams, doorway views inside/outside Manila, loops, grid-corner origins and bounded fallback. 128 spawn seeds require at most 12 regions with the halo.
- Original frustum/far-corner coverage test remains, now directed at the unchanged fallback selector.
- Real mesh disposal, stable item IDs, drop/pickup, phone battery/charger, door collision/space commit, exit/death priority, input focus, pause/audio and deferred resize regressions remain in the aggregate suite.

## Limits

No actual phone FPS, iPhone GPU screenshot, audible audio or hardware verification is claimed. The available cloud browser was previously verified WebGL-disabled, and local preview access was restricted. Test harness rendering is mocked; shipped Three.js geometry, world, lighting, input and scheduler code run directly. Rare safe-fallback views can still load; moving into genuinely unprepared corridors retains the complete-frame loading safeguard.
