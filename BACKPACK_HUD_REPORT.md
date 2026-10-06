# v1.5.0: backpack and minimal exploration HUD

Status: user approved GitHub and Pages publication on 2026-10-06. Deployment outcome is verified separately. GitHub main was checked at 5a9be7adaa38eb4b0801e7cd5b06a6306b4f7b48, Pages at 79d370dc32f563e232351a570bb75d02ea321f59. These v1.4.0 heads are the expected publication parents. The previous source folder is preserved separately.

## Implemented

The actual pixels of the approved original backpack concept and simplified exploration-HUD preview were inspected. The backpack follows the original 4×4 grid and right-side detail layout. It is interactive HTML/CSS, with local SVG item illustrations, not a flattened reference image. The rejected simplified-backpack variant was not used.

- Six original item instances remain: four 1×1 food portions initially in the backpack and two finite 1×2 water bottles on the Manila bench. No new cans, loot, stacks, crafting, weights, persistence or nested containers.
- Selecting an instance shows its number, icon, dimensions, description and valid consume/drop actions. A free-cell tap moves the selection; dragging also moves it. Sorting is planned atomically before committing.
- Only a drag past the whole backpack card’s left boundary activates the contextual drop region. Merely dragging left of the grid, but still inside the card, does not discard anything. Release in the region commits a drop; cancellation, lost pointer capture, rotation, resize or invalid release preserves the item. A second finger cannot seize or commit the first finger’s transaction.
- Drop placement checks the whole short path against current solid geometry, including the moving door and bench. It checks item footprints to avoid stacking multiple ground objects. Candidates stay within 0.7 metres of the player’s feet/front. If all candidates are blocked, no item is removed.
- Food and water use the same object and ID through drop/pickup/consume. A dropped bottle has ground height 0.005 metres; only the original uncollected bench bottles start at 0.68 metres. Pickup needs contiguous grid space and fails without removing the world object. No automatic respawn.
- Drops crossing the doorway into Manila are classified by the chosen landing location, so they remain recoverable after the room changes. Markers dropped in the changed exit also remain recoverable; original maze markers retain their old world identities and coordinates.
- Backpack opening independently freezes movement, hunger, thirst, door animation and the existing approach timer. Closing only clears that backpack freeze. Background/manual pauses and orientation blocking are preserved. It does not reset chase progress. Inputs and drag captures clear at interrupted transitions.
- Tab or I opens the backpack. Within it, Tab cycles focus and I/Escape closes; the first Escape closes the backpack instead of opening pause. E remains the nearby-world interaction. The permanent Q/F/R action clutter is removed; survival actions now live in the backpack.
- Exploration HUD now has thin upper-left survival bars, a translucent joystick, right-side interaction/fast-walk/backpack circles and compact pause. Full contextual action wording remains in the centre prompt and accessibility label; short circle labels avoid small-screen overflow. Goals last six seconds of simulation time, and reappear only when the goal changes. No persistent seed/debug display.

## Preserved scope

Main-menu markup is identical except the version string. Prior menu, note, pause, settings and orientation styles are retained; new styles are scoped to the backpack and gameplay HUD. The 11×11 map, ordinary route, spatial folds, movement and survival rates remain unchanged. The reference wallpaper, its shader/UV scale, lighting, yellow ceiling, maze/room/door geometry and camera are unchanged.

A five-seed comparison hashes actual Three.js scene buffers, UVs, matrices, baked colours and initial visibility against v1.4.0. All five match. Lighting data, material colours, maze and wall data also match. Protected textures, source wallpaper, lighting.js, manifest and Three.js vendor files are byte-identical. Existing gameplay tests remain byte-identical.

The preview-room folder, private Site and Unity project are outside this candidate. The service-worker cache version and visible menu version are 1.5.0; the two local SVG icons are in the offline asset list. No forced skipWaiting was added.

## Verification

86 Node tests pass in the final aggregate run: the 57 existing tests, with assertions adapted only where the requested HUD replaces prior UI, plus 20 inventory-simulation tests and 9 inventory-input tests.

Coverage includes rectangular occupancy, bounds/overlap, two-cell bottles, atomic sorting, full and fragmented pickup failure, exact-instance consumption, repeated same-ID drop/pickup, collision-path and crowded-ground failures, original-food routes through repeated spatial folds, finite Manila water, doorway transition recovery, reset, independent pause, orientation/background interruptions, pointer cancellation/multitouch, desktop pointer-lock release, keyboard focus/close order, contextual feedback and temporary goals. Existing map, lighting, geometry, survival, door and PWA regressions pass.

Evidence:
- evidence/inventory-hud-tests.txt: final aggregate test output
- evidence/inventory-hud-scope.json: five-seed unchanged-scene and protected-file checks
- evidence/check-inventory-scope.mjs: repeatable scope comparison, requiring the preserved v1.4.0 sibling source folder
- tests/inventory.test.mjs and tests/inventory-ui.test.mjs: new regression cases

Static layout budgets were checked for 568×280 and 844×390, including a 21-pixel bottom safe inset. Grid cells and close/arrange/consume/drop buttons are at least 44 CSS pixels. At 568×280 the short-height card budget is 246 pixels; available height with that bottom inset is 251 pixels. At 844×390 the calculated card height is approximately 339 pixels versus 359 available. These are CSS sizing calculations, not browser measurements.

## Verification limits

No permitted browser preview route was available. The cloud browser’s previously observed WebGLDisabled result does not verify this candidate. No browser screenshots, real DOM layout measurements, GPU rasterization, phone touch play, frame rate, heat, iOS install or physical-device offline-update tests were performed. The application harness uses real Three.js geometry with a mocked renderer and DOM: it verifies state transitions and geometry, not rendered images or real-browser pointer dispatch.

Publication was approved on 2026-10-06. After deployment, real-browser layout and phone gameplay remain the visual acceptance step.
