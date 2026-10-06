# Level 0 Lighting Polish — v1.3.4

**Real GPU / mobile acceptance is NOT TESTED. Publication approved on 2026-10-06.**

Based on production main `52c1d6b0606d44f17257fbc61e6925d6ca597cf2` (v1.3.3), checked on 2026-10-06. Release deployment is verified separately against the exact Pages commit. The separate `preview-room/` on gh-pages is preserved.

## Scope

Lighting/shading/environment brightness and directly related materials only. No changes to maze generation, collision, walls, door model or animation, trim dimensions, camera, UI, movement, objectives, food/water or game rules. Height 3.6 m, eye height 1.63 m, FOV 76°, top trim 16 cm and bottom trim 14 cm remain.

All geometry position/normal/UV/index buffers and expanded world transforms match the baseline across seeds 0, 1, 5, 42 and 3735928559. `game.js`, UI CSS, manifest, textures and Three.js are byte-identical. App code from `sync()` to EOF is byte-identical. HTML changes only the version token. Service-worker behavior is unchanged: only cache version and the additional local lighting module are updated.

## Exact before / after

| Parameter | v1.3.3 | v1.3.4 |
|---|---|---|
| Wall/floor/ceiling shading | Lambert plus broad nearest-XZ lamp tint | Existing vertices/instances output a once-computed diffuse bake; no second global fill multiplier |
| Hemisphere sky / ground | #fff5e2 / #cdcdc2 | Unchanged |
| Hemisphere intensity | 1.9 for all Lambert surfaces | 1.65 for remaining Lambert props, trim, housings and room/exit wall boxes |
| Directional intensity | 0.28 | 0.18; same position and color |
| Exposure / tone mapping | 1.0 / ACES | Unchanged |
| Static direct lamp sampling | Nearest lamp XZ distance only | Four rectangular samples per nearby lamp, true 3D distance and surface normal, fixed-wall/lintel segment occlusion |
| Static lamp power / radius | Not applicable | 5.4 / 9 m; smooth falloff; neighboring lamps add |
| Lamp intensity variation | None | Deterministic 0.92–1.08, independent of gameplay RNG |
| Lamp linear RGB variation | Uniform | R 1.000, G 0.977–0.995, B 0.916–0.976 |
| Wall / floor / ceiling ambient bake | Not applicable | 0.43 / 0.34 / 0.40 |
| Bake component minima | Not applicable | Wall 0.32, floor 0.27, ceiling 0.35 |
| Bake upper bound | Tint multiplied by global Lambert light | 0.86 wall/floor; ceiling bounce at most 0.16 above 0.40 base |
| Contact shade | Module-height-only wall gradient | Nearby perpendicular-wall/floor contact; nominal corner factor about 0.80, combined factor floor 0.76 |
| Door surroundings | No local factor | Smooth 0.93–1.00 factor on nearby baked surfaces plus existing doorway flank/lintel instance colors |
| Wooden frame / door colors | #665033 / inset #4b3a26 | Unchanged; no added spotlight, light, model or movement |
| Ceiling grid / geometry | 25 mm seams, 20 mm backing separation | Unchanged; neutral grid coefficient 0.44, locally varied ceiling bounce |
| Fixture display | Uniform #fff5df, tone mapping bypassed | Shared #ffffff material, per-instance seeded tint 0.86–0.94 × lamp RGB, normal ACES tone mapping |
| Fog / background | #8b825c, 14–44 m | #626354, 16–80 m; no full-screen effect or added pass |
| Flicker | None | None; optional flicker omitted |

This is a deliberately bounded diffuse approximation, not full GI or real-time shadowing. A moving door is not frozen into the static blockers. Door/prop shading remains Lambert so opening the door cannot leave a baked closed-door shadow. Carpet uses only its texture and baked diffuse response; no specular term is added.

## Checks actually performed

- **PASS: 38 / 38 Node tests.** Existing 29-test coverage retained with updated lighting/version expectations; 9 additional numerical/scope checks.
- **PASS: JavaScript syntax.** App, lighting module, simulation and service worker.
- **PASS: deterministic lamp variation.** Seeds repeat, reordered fixtures retain their values, intensity/color bounds hold and Game state is not mutated.
- **PASS: numerical pools/occlusion/contact.** Two-lamp sample has linear luminance 0.803 under a fixture and 0.604 between; ceiling 0.556 / 0.488. Specific wall-occlusion sample is about 24% darker; corner contact factor about 0.80. These numbers do not establish perceived screen contrast.
- **PASS: nonblack numerical floor.** Sampled values stay finite and within configured bounds; this cannot guarantee visibility after textures, tone mapping, device display and overlays.
- **PASS: resource scope.** Still two real lights; no point/spot lights, shadow maps or extra render passes. Same 15 instanced batches, 21 material objects, 115–117 mesh objects and 1308–1314 expanded instances in the five tested seeds. This is a scene-count proxy, not a measured draw-call or GPU timing report.
- **PASS: bounded build-only work.** Cache limited to 24000 entries and cleared after build. Tested scenes perform roughly 139000–145000 rays and 109000–119000 box tests once per build. No baking or ray work enters the render loop. Observed cloud Node builds around 106–131 ms are not mobile startup or FPS measurements.
- **PASS: offline manifest simulation.** The new lighting module is cached alongside the coherent v1.3.4 assets; existing reload, waiting and activation semantics preserved.

Machine-readable numerical evidence: `evidence/lighting-numeric-checks.json`.

## Required visual acceptance

| Requested acceptance item | Actual rendered status |
|---|---|
| No overexposure / balanced bright atmosphere | NOT TESTED |
| Corners readable, not black | NOT TESTED |
| Perceived corner/occluded-wall contrast | NOT TESTED |
| Visible under-fixture versus between-fixture pools | NOT TESTED |
| Wooden door silhouette and panel readability | NOT TESTED |
| Carpet brightness and absorbent appearance | NOT TESTED |
| Ceiling whiteness, grid visibility and local variation | NOT TESTED |
| Gradual distant darkening / lower contrast | NOT TESTED |
| Mobile FPS, frame pacing, heat and battery behavior | NOT TESTED |
| UI readable over the actual rendered scene | NOT TESTED |

The available cloud browser previously returned WebGLDisabled. No real GPU frame or new screenshot was produced for this release, and no disabled/browser security setting was bypassed. The actual user screenshots were inspected as references; a fixed-room prototype screenshot is not evidence that this production patch renders correctly.

**Do not mark “Lighting Polish Complete / 光照验收通过” until the real rendered checks above pass.** Open the candidate on a WebGL-capable phone/browser, inspect lamps/corners/door/carpet/ceiling and the longest corridor, and check mobile frame behavior. The source package itself is not evidence of successful hosting; verify the exact release deployment separately.
