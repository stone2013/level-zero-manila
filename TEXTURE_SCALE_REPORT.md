# Level 1 texture scale correction

## Confirmed cause

The embedded concrete/paint swatches are authored at one tile per 2 metres in the GLB asset builder. `zone-render.js` then scales 4m kit meshes to larger spans without changing their UV coordinates. For example, a 12m wall has 6m horizontal tiles but 2m vertical tiles; a 16m wall has 8m horizontal tiles. Independently scaled floor dimensions similarly stretch the grain. This is a UV-density issue, not a texture resolution issue.

## Change

- `dist/zone-texture-scale.js` bakes static world-space UVs after full scene assembly, using final world matrices and 2m repeats.
- `dist/zone-render.js` calls it once before scene resource counting.
- Explicit material allowlist: Concrete warm aggregate and Blue textured paint. Other texture materials, lettering, signs, wood, brushed metal, and mixed-material atlas meshes keep their original mapping.
- Adjacent coplanar surfaces share coordinate phase, including negative coordinates, preventing tile-offset seams.
- Uses existing PNGs and existing materials/textures, without shader changes, extra draws, or per-frame work. UV buffers are private to each transformed instance. Axis-aligned architectural faces maintain exact isotropic density; tiny authored bevels use the adjacent dominant planar projection.
- Geometry topology is unindexed to allow each triangle its appropriate planar projection. Triangle count is unchanged; shared geometry becomes per-instance for independent UVs. Old shared buffers are disposed once after remapping, with retained/excluded consumers protected.

## Verification

`node --test tests/zone-texture-scale.test.mjs tests/zone-render.test.mjs`: 9 passing tests at initial integration.

Checks cover real GLB 2–32m walls, anisotropic floors and ceilings, nested transforms, scaled columns, adjacent module phase, original label/wood/metal mapping, no new texture/material resources, unchanged triangle counts, and shared-buffer ownership/disposal. The scene-wide density test automatically traverses future expansion geometry loaded by `loadZoneVisual`.

`node tests/zone-render-benchmark.mjs`: passed CPU scene assembly, navigation ray/floor samples, and exact-once resource disposal. CPU timing excludes image decoding and rendering; it is not an FPS benchmark.

Full-suite initial integration: 412 passed / 1 failed (offline module closure pending new helper inclusion in the lead's service-worker cache update). The lead owns final aggregate verification after layout integration.

## Visual evidence and limits

`evidence/texture-scale/texture-scale-cpu-comparison.png` is a deterministic CPU orthographic comparison of original and corrected UVs on actual transformed GLB module triangles, sampling the exact embedded concrete PNG. It is labelled as CPU evidence, and has no lighting. It verifies texture shape/density without pretending to be Three.js pixel QA. Reproduce via the adjacent export-comparison.mjs and render-comparison.py.

Browser/WebGL pixel QA was not run: the previously verified cloud Chromium socket restriction remains in effect; no alternative route was attempted to bypass it. No publication or deployment was performed.

## Final expanded-layout verification

The six-sector assembly extending beyond z=-600 is now integrated. A strict density test exposed Float32 UV quantization at that distance (0.150024414 rather than 0.15 tile on a 0.3m edge). The helper now subtracts a per-mesh whole-tile origin before storing UVs. This keeps UV magnitudes small and preserves the same global repeated texture phase; it does not loosen density thresholds.

Final run: `node --test tests/zone-texture-scale.test.mjs tests/zone-render.test.mjs tests/level-one-area-render.test.mjs` passed **18/18**. Added regressions cover z=-606 and z=-10000.3 with the original strict 0.00002 UV tolerance. The all-scene test covers the actual six-sector geometry before streaming detach. Phase tests compare modulo integer tiles, which is the exact equivalence for repeat-wrapped textures.

Evidence: `evidence/texture-scale/expanded-focused-tests.txt`. The helper is now included in the lead's service-worker cache. Initial-suite results above are historical; final aggregate tests are owned by the lead.
