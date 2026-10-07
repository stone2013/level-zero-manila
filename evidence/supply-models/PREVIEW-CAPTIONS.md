# Actual supply asset geometry previews

These are CPU Blender renders of the actual food/water mesh attributes exported from `createSupplyModels().create()` in `dist/assets/supplies/supply-models.js`. They are **not gameplay screenshots**. The geometry, vertex colors, and normals are the runtime asset data; only placement, camera, room backdrop, and lighting are authored for inspection. No additional supply details or textures were added in Blender.

- `actual-assets-front-closeup.png`: Actual asset geometry, front closeup. Sealed biscuit wrapper and capped water bottle shown at their original relative metre scale, resting on the floor. Not a gameplay screenshot.
- `actual-assets-reverse-closeup.png`: Actual asset geometry, reverse closeup. The water bottle is turned around and the biscuit pack is turned over to expose their reverse-side seams/barcodes. Both are grounded after turning. Not a gameplay screenshot.
- `actual-assets-ground-scale-10-items.png`: Actual asset geometry, floor-scale arrangement of five food packs and five water bottles, all at original metre scale and resting on a muted warm room floor. Not a gameplay screenshot.

## Reproduction

Run from the repository root:

```sh
node evidence/supply-models/export-actual-geometry.mjs
blender -b -t 8 --python evidence/supply-models/render-actual-geometry.py
```

The export preserves the original non-indexed mesh position, normal, and linear vertex color arrays. The Blender import maps Three.js Y-up `(x,y,z)` to Blender Z-up `(x,-z,y)`, a handedness-preserving rotation. A diffuse node uses the original vertex colors, matching the Lambert-style runtime material. Runtime/browser lighting will differ from these neutral inspection renders.

Food: 1,880 triangles, one shared mesh/material draw call, approximately 33.6 × 18.6 × 5.56 cm. Water: 1,422 triangles, one shared mesh/material draw call, approximately 13.32 × 13.57 × 34.75 cm. Both factory geometry bounding boxes have minimum Y exactly zero. The preview script also checks every placed asset has minimum world Z within 0.0000001 m of the floor.

`actual-geometry.json`, `geometry-stats.json`, `render-verification.json`, and `render-log.txt` provide the reproducible source export and render checks. `actual-supply-previews.blend` contains the final ten-item scene.
