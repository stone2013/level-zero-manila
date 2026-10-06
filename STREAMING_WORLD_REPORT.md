# Historical first streaming patch

This report describes an intermediate implementation, not the final v1.6.0 settings. CLEAR_VIEW_REPORT.md and PHONE_STREAMING_REPORT.md supersede its 15 m / 25-region / adaptive-fog configuration. The intermediate fog reduction was not published.

Prepared against the unchanged v1.5.0 source copy, for combination with the separate phone update. This work does not publish a release or change a remote repository.

## Behavior

- The world now addresses procedural 11×11-cell chunks in all four directions. Each chunk has its own connected maze, ordinary extra loops, and a seeded reciprocal portal on every side. Crossing the old 55×55 m footprint walks into new world coordinates, without a wrapping teleport or a physical outer boundary.
- The original central maze, safe central spawn, occluded spatial folds and their existing one-time hidden rewire are preserved. Revisited procedural layouts are deterministic in this implementation. The user allowed changes on revisiting but did not require extra random rebuilding.
- Manila remains a guaranteed reachable landmark on the original central ordinary route. It is a persistent independent scene group; streaming neither rebuilds its furniture/door nor recreates its two finite water objects. Room detection now checks the actual rectangle, so arbitrary far-eastern chunks are ordinary Level 0.
- One item ledger remains in Game.items. Streaming never creates loot, moves a dropped item, clones an ID, or revives a consumed item. This version has only the existing six finite items; the phone integration appends its own seventh. The ledger therefore stays finite. If future work adds unlimited new items, retaining their modifications will require growing history or a separately designed persistence policy; this patch does not silently delete markers.
- Pause, inventory behavior, survival rates, ordinary movement, manual door closure, and the changed exit remain unchanged. Restart creates a new run; refresh persistence was not added.

## Resident budgets and build work

- Procedural collision/layout LRU: 16 chunks maximum. The small original landmark description and central collision patch also stay resident.
- Render region: 3×3 cells, or 15×15 m. A 5×5 region window has at most 25 ready/pending records, corresponding to at most 225 cell floors. Only one generator is actively building at a time.
- Frame work target: 3 ms, capped at 24 yielded work units. Jobs yield after a surface or cell operation; this is a soft CPU budget, not a preemptive guarantee or an FPS claim. A single operation, allocation or garbage collection can exceed the target.
- The initial spawn region and original menu-camera region are prepared before first paint. Other regions are generated incrementally. Pending floors are blocked by the same movement path used by controls. Fog temporarily shortens to the nearest unfinished edge, then expands when geometry is available, so startup or a delayed build does not expose an empty floor edge.
- Fog maximum is 29 m; camera far plane is 40 m. The approved menu camera position/rotation and eye height remain unchanged. Frustum culling applies to region groups; ceiling panels and repeated props are instanced, and baked floors/walls are merged within each region.
- Existing seeded lamp coloring, four-sample static occlusion bake, faded wallpaper shader, ceiling height, two global lights, no-shadow policy, and pixel budget remain. Light sampling is limited to a local halo and discarded after each build; no lamp-specific point lights are introduced.
- Unloading or canceling a region disposes its own geometries and instance resources. Shared box geometry, materials and textures remain shared. The persistent Manila scene is untouched. Restart disposes its old scene and cancels stale builders.
- Camera origins rebase at 15 m intervals. Procedural vertex buffers, instance translations, and repeating UV coordinates are kept local to the region; item coordinates remain absolute. Tests reach both signs of 10 km. This is practical ongoing generation with ordinary finite numeric precision, not literal mathematical infinity; no claim of arbitrary astronomical coordinates is made.

## Verification

Run npm test and the syntax checks from this folder. Tests execute the actual simulation, actual exported scheduler, application functions and real Three.js geometry. DOM, WebGL and browser inputs are mocked.

Coverage includes 256 seeds across 25 chunks each, reversed generation order and eviction, reciprocal active seams at negative coordinates, collision-driven ordinary portal walking, 40-chunk item round trips, consumed-item non-resurrection, Manila route and reset, scheduler timing/step limits, canceled jobs, real scene resource disposal, local geometry at 10 km, missing-floor gating, and pause/orientation behavior. Existing central-maze tests still physically walk 100 ordinary routes to Manila and exercise the original fold and door sequences.

The new tests found and fixed two edge cases before handoff: north/south seams into reserved Manila cells at extreme landmark rows, and a stale clear-radius result after scheduler clear. Procedural walls overlapping the persistent room sides are cropped to avoid coplanar faces.

Cloud WebGL is unavailable in the known test environment. No GPU image, real-phone FPS, thermal behavior, touch-device performance, or iOS installation/offline result is claimed. Node geometry timings are CPU checks only.

## Integration boundaries

- New: dist/world.js, tests/streaming.test.mjs, tests/stream-render.test.mjs, this report.
- dist/game.js: import ChunkWorld; replace reset's finite wall-building tail with persistent room walls plus world; add roomContains/inRoom/worldItemVisible; replace collides and lineClear; classify dropped items with roomContains. No phone methods or existing inventory transaction methods are replaced.
- dist/app.js: import stream constants; local geometry/UV changes; streaming lighting/build/disposal helpers; build only persistent room/exit globally; budget stream work before movement; keep original menu camera; rebase camera/scene; use worldItemVisible for item meshes. Preserve the phone owner's extra materials/meshes, overlay state, updateDevices call and controls when merging.
- dist/sw.js: add ./world.js to ASSETS. The release owner must apply the combined release version bump and all phone assets.
- tests/app-harness.mjs: import/inject world exports and remove the new browser import for the VM harness. Existing app rendering assertions now inspect nested streamed meshes rather than assuming one finite global maze. The PWA asset count increases by one before adding phone assets.

No shared material/texture or geometry file was overwritten. The original source copy and phone workspace were not edited.

### Final standalone verification result

100/100 tests passed, with no failures or skips; syntax checks passed for game.js, world.js, app.js and sw.js. One cloud-CPU/mock-WebGL profiling sample measured 162 ms initial preparation, 0.18 ms median yielded operation, 1.67 ms p95 and 4.33 ms maximum. These are isolated Node measurements, not a phone benchmark or a guaranteed frame budget. That sample's fully prepared window had 224 mesh objects and 25 render regions; normal frustum culling controls what is drawn. All test changes and baseline/result hashes are listed in streaming-integration.json.
