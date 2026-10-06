# v1.4.0: larger map and spatial connections

Status: user approved publication on 2026-10-06. Deployment outcome is recorded separately after verification. Baseline: main 7877f74907e650b4327a56f458857d425334c142 / v1.3.7. The preview-room folder, Unity work and the private Site remain outside the modification scope.

## Gameplay

- 11×11 cells at 5 metres each, covering 55×55 metres instead of 35×35 metres; 2.47× the previous maze area.
- Spawn is exactly in the central cell, (27.5, 27.5) metres, with three initial directions available and no collision.
- Seeded maze generation retains all ordinary tree edges and a smaller density of extra shortcuts. The farthest eastern boundary cell becomes the Manila entrance. Short ordinary routes trigger a bounded deterministic regeneration; generationAttempt is retained for diagnostics.
- A 10,000-seed probe found 23–97 route cells, median 50, and at most four retries. This is a measured sample, not exhaustive coverage of all 32-bit seeds. The theoretical retry cap is 16; an exceptionally short final candidate would still remain connected.
- Food, water, movement speed, view height, field of view, and survival rates are unchanged. Difficulty comes from exploration and the space itself, not increased depletion.

## Spatial behavior

Three south-opening, full-height, U-shaped vestibules sit near the central area. Their upper corridors use matching local coordinates, wallpaper/floor texture phase, fixture appearance and local baked colors. Opaque walls hide the surrounding maze at the seam. No additional render pass or portal camera is used.

The initial west/near pair is bidirectional. Crossing translates the player and remaining movement rigidly without turning the view. Reversing immediately returns correctly, including exact-plane floating-point boundaries. After the first crossing, both seam apertures must be out of line of sight and at least 4.5 metres away before the connection changes once to west/east. It stays stable thereafter. The inactive vestibule remains an ordinary traversable dead end.

The ordinary graph never changes, so every vestibule can be left from either side and the Manila route remains available in either state. A nearby circuit returns to the original dropped food object with the same ID and coordinates. The settled circuit is repeatable. No food object is copied or moved by space changes.

The loop contains turns. It is not a completely straight endless corridor. The old full-screen blink has been removed; crossing instead briefly changes the fluorescent hum. No map or complete route hint was added.

## Related door-wall repair

The two door flanks and the lintel keep their persistent room-group membership. Their outward-facing surfaces use the approved small, faded wallpaper and outer maze lighting. The inward-facing surface keeps the original room material. The room's other walls, furniture, two finite bottles, note, moving door and gray-exit transition remain.

The lintel now fills the 1.8-metre opening, with thickness aligned to the 0.16-metre side walls. The top trim is continued over the door. This removes the former plain exterior patch and the two 10-centimetre gaps above the old 1.6-metre lintel. Door leaf, hinge, frame, handles and collision mechanism retain their dimensions and behavior; their world location follows the larger maze's chosen room.

## Performance constraints

The larger floor is cell-tiled for local UV alignment, then static wall/floor surfaces are merged in 15-metre chunks. Walls use four vertical lighting subdivisions instead of eight. Static fixtures and trim retain instancing. The existing hemisphere and directional lights remain the only real lights; no point lights, real-time shadows, GI, reflection or post-processing was added. Pixel budgets and power-saving controls are unchanged.

Five actual Three.js scene-data builds measured 25,906–26,194 unique geometry triangles and an upper bound of 101 material-group draw calls including hidden exit/items, below the regression limits of 30,000 and 110. These are geometry/scene-data counts. They are not actual GPU draw statistics or FPS measurements. Node mocked scene build times are recorded only as diagnostics, not phone performance claims.

## Verification

57 tests pass. Relevant coverage:

- 256 deterministic, connected, reciprocal 121-cell mazes and clear central spawns
- 100 physically walked ordinary routes to Manila
- Both transfer states and both directions, residual movement/view preservation, immediate inverse crossing and exact-plane reversal
- Initial and repeated settled circuits returning to the same dropped object
- Every vestibule's ordinary exit from either side in both states
- One-time hidden reconnection, with a denser independent aperture sample at the actual change
- Additional analytic rectangle/ray visibility probe: 4,355 eligible positions, zero visible-aperture counterexamples
- Manual door, complete-close-inside requirement, blocked-leaf reopening, finite water and escape completion
- Pause, note, background and portrait freezing; repeated menu/continue/restart; item identity and wall collision
- Full floor/ceiling extent, geometry and draw budgets, matching local seam surface samples, persistent door facade and room group
- Approved wallpaper shader, textures, yellow ceiling, menu CSS, lighting algorithm and landscape manifest regressions
- Versioned service worker and visible menu version both 1.4.0

Evidence is in evidence/expanded-maze-node-tests.txt, evidence/expanded-maze-probe.json, and evidence/expanded-maze-scene-budget.json. The probe and scene inspection scripts are included.

## Verification limits

Real WebGL rasterization, actual seam appearance, iPhone frame rate/heat, touch play on a physical phone and PWA update behavior were not tested. The known cloud browser WebGLDisabled limitation is not a GPU pass. A material/geometry match is not proof of perfect visual continuity. Dynamic dropped items remain unique world objects; this is not a multi-camera portal renderer.
