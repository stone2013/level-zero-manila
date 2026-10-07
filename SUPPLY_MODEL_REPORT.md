# Food and water visual refinement · v1.7.1

2026-10-07. Publication approved by the user after reviewing the actual-model previews. Remote deployment and Library outcomes are verified separately in RELEASE_V1.7.1.md.

## Baseline and scope

Read-only GitHub verification: main `81294a1238d4543e0a77d48c54e2d2a1d9d984b1`, gh-pages `d47a042e1f3deff0b7478b4ea7dd122ba62b7fd0`, both existing v1.7.0. The candidate is in a separate directory.

Only the food/water models, water inventory icon, model lifecycle integration, candidate version/cache and tests changed. The phone, map, lighting, HUD layout and gameplay files remain unchanged. Inventory still uses food 1×1 and water 1×2. IDs, quantity, pickup range, hunger/hydration, phone batteries, collision, spawn locations and Level 1 supplies are unchanged.

## Models

`dist/assets/supplies/supply-models.js` is the reusable Three.js source. `createSupplyModels().create('food'|'water')` returns a Y-up, metre-scale group resting on y=0. The factory owns two shared geometries and one vertex-colour Lambert material, lazily created. Call `dispose()` once at reset/shutdown; repeated disposal is safe and later creation gets fresh resources. All instances are detached before shared resources are used again. The app marks shared meshes so its old generic scene disposal does not free them repeatedly.

- Water: a 16-sided rounded PET profile, shoulder, neck, collar/tamper ring, closed cap with grip ribs, recessed body ribs, lower foot and wraparound label with geometric water drop and reverse barcode. Opaque pale blue, no refraction, no stacked alpha shells. It does not simulate water depletion.
- Food: the same generic sealed biscuit pack represented by the existing inventory icon. Rounded pillow-package volume, biscuit face/holes, pale film-style highlights, flattened serrated end seals, folded corners and reverse longitudinal seam. No new consumable category or real brand.
- Water icon: adds the matching pale band/blue drop badge. Food icon is unchanged.

## Measured geometry budget

Per item, no shadows or extra render passes:

| Item | Before triangles | Before draws | Candidate triangles | Candidate draws |
|---|---:|---:|---:|---:|
| Food | 38 | 4 | 1,880 | 1 |
| Water | 36 | 3 | 1,422 | 1 |
| Five of each | 370 | 35 | 16,510 | 10 |

The original food had a separate per-item number texture; the new model requires no textures. Individual identities remain in the data and existing inventory labels. Source module is approximately 6.2 KB. Geometry attribute buffers are shared between all items of a kind. More triangles improve the silhouette and folds while fewer separate meshes reduce draw overhead. These counts do not prove mobile FPS, power usage or thermal performance.

Bounds: water approximately 0.133×0.348×0.136 m; food 0.336×0.056×0.186 m. Both local minima are y=0. The existing game world/table placement offset is retained.

## Verification

- Full existing suite plus five new tests: 363/363 passed, no skips/failures. See `evidence/supply-models/full-tests.txt`.
- Geometry coordinates/normals/colours finite, bounded, grounded and opaque.
- Ten objects share exactly two geometries and one material; disposal events fire once each, and rebuilding gets fresh resources.
- Actual app rebuild verifies shared disposal and the unchanged three-mesh phone.
- Creation does not mutate game state; original footprint, drop/pickup, collision and unique IDs checked. Existing complete normal/escape and Level 1 supply routes pass.
- Candidate PWA version v1.7.1 matches visible version; new module is in offline asset closure; old v1.7.0 cache eviction is tested in mocked Cache API.
- `game.js`, `world.js`, `zones.js`, `zone-render.js`, `developer.js`, `escape.js`, `audio.js`, `monster.js`, `style.css` are byte-identical to the baseline.

Actual Three.js geometry is exported for Blender CPU front/reverse/floor previews under `evidence/supply-models`. These use separate review lighting. They are actual asset previews, not gameplay screenshots. Real WebGL appearance, target-phone FPS, install/offline restart and touch interaction are not claimed verified.

## Publication

The parent reviewed the rendered previews and the user approved publication. Verify remote heads, Pages CI and live runtime hashes before marking deployment complete. Preserve the source Library identity on replacement.
