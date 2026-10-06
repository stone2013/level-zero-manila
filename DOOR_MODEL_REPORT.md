# Manila wooden door model refinement

Implemented locally against main `42b39c2cf47c544cbd8839cdef72f676eb4f93b6`. Publication approved on 2026-10-06; deployment verification is tracked separately.

## Model

- Preserved the original 0.11 × 2.56 × 1.60 m wooden leaf envelope and Y-axis pivot at `(doorX, 0, doorZ - 0.8)`. Animation remains `game.door * Math.PI / 2`.
- Replaced applied rectangles with four recessed panels on both faces, sloped inner borders, three stiles and cross-grain rails.
- Added a stepped wooden casing and recessed jamb. Structural frame stays inside the previous frame volume; no threshold crosses the walkable passage.
- Added two-sided muted-brass lever handles, backplates, stems, keyholes and small fasteners at the latch edge.
- Added three hinges with fixed jamb parts and leaf-attached parts. Alternating knuckles share exactly the preserved hinge pin axis.
- Subtle 1–3 cm grain variation is baked into geometry vertex colours, with mild lower-edge wear. No new texture file, shader customization, real light or emissive material.
- Door-only Lambert materials leave existing wood furniture, approved wallpaper, lighting, camera, UI and simulation files unchanged by this patch.

## Cost

Complete new frame and door: 4 mesh draw calls, 5,628 triangles. Moving leaf: 2 draw calls, 3,796 triangles.

Measured with the existing Three.js Node harness: persistent Manila room draw calls 41 → 36 (5 fewer); rendered room triangles 1,026 → 6,510 (+5,484). This is geometry accounting, not FPS. New geometry and buffers are built once and use the existing scene disposal path.

## Verification

Five focused real-Three.js geometry tests pass: leaf/frame bounds, true panel recesses and bevel normals, rigid hardware and hinge pin at five opening angles, bounded draw/triangle/colour data, and unchanged animation/space-change attachment.

The final combined candidate result is recorded in `evidence/flow-polish-final-tests.txt` and `TEST_REPORT.md`.

An actual local browser preview was attempted in dot’s cloud browser at `http://127.0.0.1:4187`. The browser refused navigation with `net::ERR_BLOCKED_BY_CLIENT`. No workaround was used to bypass the restriction. Actual GPU scene appearance, real-phone frame rate, and touch play are NOT TESTED. No screenshot or image-generation mockup is presented as rendered-game evidence.

## Status

The model is included in v1.6.1, approved for publication on 2026-10-06. Deployment verification is tracked separately.
