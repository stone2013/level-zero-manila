# Level 1 expansion + texture correction — approved stage release

Build: demo-v1.0-rc2-dev, 2026-10-08. Publication to the existing official site was approved on2026-10-08. This remains a development stage, not final Demo v1.0 or mobile acceptance. See RELEASE_DEMO_V1_RC2.md and the deployment evidence for actual publication status.

## Result
Six physically connected warehouse sectors replace the sub-one-minute Level 1. They include ten finite supply/service branches, six optional route notices, structural cover, and a quiet refuge section. No keys, repeated maintenance switches, slower movement or timed gates were added. Existing Level 0, Manila, hub, inventory, phone, survival and both entry routes remain intact.

Selected crossings trigger one warning/blackout encounter, rather than repeatedly cycling the entire long level. One entity uses sight, limited hearing and remembered positions; corners and quiet movement can break pursuit. Green routes remain safe. Retry preserves supply identities and restores only the existing minimum survival allowance.

The stretching was caused by scaling architectural meshes without compensating UVs. Concrete and blue paint now retain two metres per tile. Whole-tile UV origins avoid Float32 precision loss far from spawn. Original artwork, signs, wood and metal atlases are preserved.

## Pacing evidence, with limits
- Independent whole-level 0.5m-grid search and visibility simplification: 727.15m, about5:55 walking /3:44 sprinting. This is not an exact continuous-space optimum proof.
- Original measured known route with actual game hazards: about6:00 walking /3:47 sprinting; no forced waiting.
- A clean scripted route visits all six notices and all ten supply branches in6:41 walking /4:13 sprinting. It contains no arbitrary repeated sectors, idle time or reading dwell. It survives from26 hydration using two finite water bottles.
- Separate8–12minute resource-endurance tests intentionally repeat sectors and retrieve dropped supplies. They test survival/inventory robustness; they are NOT normal completion-time or human pacing evidence.
- An8–12minute first play remains a design target, not a verified result. Human route-finding, reading, tension and repetition must still be assessed. Some long concrete passages remain visually repetitive.

## Performance and rendering
Only the current sector and a nearby portal neighbor remain attached to the scene. Resident assets are shared; this is visibility culling, not disk/network streaming. Shelf geometry was compacted from61 meshes to4 with identical triangles, materials, UVs and bounds.

Current area counts:169,168,130,168,166,127 meshes; worst portal pair337, plus the separate17-mesh entity when active. Full resident scene:945 meshes and35,540 triangles. Canvas labels use approximately6.34MB raw pixel storage. These are object/resource counts, not measured GPU draw calls or phone FPS.

Actual-geometry audit checks59,898 collision-clear positions with body-height probes, including wall-hug positions. No body/surface intersections were found. All2,007 sampled floor positions have floor geometry. Detached sectors and shared resources dispose exactly once.

## Visual review
The CPU contact sheet shows exported Three geometry with corrected UVs, approximate canvas signs and separate review lights. It is not a browser screenshot. Review fixed the empty entrance appearance, narrow loading flank, header obstruction risk, wall-paint intrusion and floating/overlapping emergency lights. A final overhead-pipe placement adjustment makes pipe landmarks visible over walkable aisles; the CPU sheet predates that minor placement adjustment, while its main layout, UV and lighting fixtures are unchanged.

Browser/WebGL rendering, actual phone touch/audio, PWA install/offline relaunch, frame rate and thermal behavior remain unverified. The cloud Chromium environment could not launch due to its socket restriction.

## Verification and next review
Final aggregate: **430/430 passed**, zero failed/skipped/cancelled.
See evidence/expansion/full-tests-release-candidate.txt for the final aggregate result, geometry-audit.json, scene-benchmark.json, global-shortest-route.json and natural-coverage-runtime.json for measured evidence. Texture tests include far-coordinate density and atlas/phase preservation.

Before publication: play both route styles on a real phone; test route-note legibility, encounter fairness, backtracking, checkpoint recovery and offline update. Assess whether the long sections justify their travel time. The user approved publication of this exact candidate on2026-10-08.

## Run locally
Extract the playable ZIP, then run an existing Python3 static server in that directory:
python3 -m http.server 4173 --bind 127.0.0.1
Open http://localhost:4173. Windows may use `py` instead of `python3`. Direct file:// opening is not supported by the ES-module loader.
