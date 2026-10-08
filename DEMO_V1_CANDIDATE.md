# Backrooms Demo v1.0 — Level 1 RC1

2026-10-08. RC1 stage update authorized for the existing official site; this is not the final Demo v1.0 acceptance. Based on engineering v1.7.2, with remote main verified at `ca62fbe686d0d258d60789b1963e12b7050373e7`. The formal Demo name is a separate milestone.

## Playable changes
- Three warehouse dividers replace the old straight sprint to the exit. Four existing finite supply crates still provide exactly two waters and two foods.
- Green-lit entry, east-hall and refuge areas provide safety. The refuge has a longer protected bypass reconnecting to the pipe passage; the direct passage remains available.
- First cycle: 14 seconds light, 6 seconds warning, 8 seconds dark. Subsequent cycles: 28 + 6 + 8 seconds. Warning uses slow, shallow dimming instead of hard flashing.
- One original Level 1 lurking entity appears at blackout onset, more than eight metres away. It prefers a clear sightline, fades in during a stationary two-second reaction window, then moves at 1.6 m/s versus the player's 2.05 m/s normal walk. It respects solid geometry; sustained close contact captures the player. Its body cannot simply be charged through, while retreat remains possible. Green areas exclude it. Restoration removes it. These are game-adaptation rules, not a canon claim.
- Capture has specific guidance and a retry from the most recent safe area. Retry preserves opened crates, consumed/dropped items and phone identity/battery. Hunger and hydration recover only to a minimum of 25; no supply item is created.
- Persistent Level 1 guidance, directional approach sound, a distinct low-poly silhouette, and the existing mobile controls.
- Navigation graph preparation happens behind the existing loading screen. No new runtime CDN, real-time shadows, post-processing or persistent external service.
- The pipe ending remains the Demo endpoint; Level 2 is not playable. No resident NPCs, multiplayer or new prologue.

## Verified
Final full regression: **408/408 passed**, zero failed/skipped/cancelled. See `evidence/demo-rc1-verified-tests.txt`.

Coverage includes Level 0/Manila/hub entry, the full 480-second chase clock, direct abnormal-wall entry, both continuous Level 1 routes, optional supply detours, natural capture, body blocking and retreat, retry/reset identity preservation, inventory/phone/pause/background/orientation/loading freezes, sound lifecycle, actual Three.js geometry, disposal and complete offline module/asset closure in a mocked Cache API.

Actual geometry audit: no body/wall overlaps on the sampled clear grid. GLTF benchmark: 591 clear Level 1 sample points, zero missing floors and zero unexpected nearby geometry. Scene: 253 meshes, 17,890 triangles, including the 318-triangle entity. These are object counts, not GPU draw-call or FPS measurements.

Continuous CPU simulation: direct route 37.7 s walking / 23.8 s sprinting; refuge route 42.6 s / 26.9 s. This is known-route traversal without leisurely exploration. First encounter offers about 3.2–3.7 seconds of line-of-sight opportunity on these routes; camera framing and human reaction are not measured. Walking directly into the entity can fail; an ordinary unobstructed route remains forgiving. Difficulty, duration and tension still need human playtesting.

On this executor, cached full game updates averaged roughly 0.04–0.10 ms; isolated maxima ranged to 12.4 ms. One-time navigation preparation measured roughly 52–77 ms and is hidden behind loading. These CPU figures exclude GPU rendering and cannot establish mobile 60 FPS.

## Visual review and limits
`evidence/demo-preview/level-one-cpu-contact-sheet.png` shows actual exported scene geometry in warehouse, refuge and dark-entity views. The images were pixel-inspected. They use Blender CPU review lights and ASCII approximations of canvas signs. They are **not browser screenshots** and do not establish runtime illumination or sign legibility.

Installed cloud Chromium could not launch because socket creation is restricted in this environment, including after the supported escalation attempt. Actual browser/WebGL rendering, phone touch hardware, audible speakers, PWA installation, offline relaunch, thermal load and mobile FPS remain unverified.

## Run
Source archive: run `npm start` from this folder, then open http://localhost:4173.

Playable archive: extract all files and use an existing Python 3 installation to run `python3 -m http.server 4173 --bind 127.0.0.1` in its root (Windows may use `py -m http.server 4173 --bind 127.0.0.1`). Open http://localhost:4173. Opening index.html directly as a file is not supported by the ES-module asset loader.

## Before formal release
1. On a real browser, confirm warehouse side openings and directional signs are obvious on first entry.
2. On a phone, test movement + look + sprint with multiple fingers; pause, background, rotate and reopen the bag during warning/blackout.
3. Check that the silhouette and approach sound disclose danger early enough. Try retreat, shelter, the direct route and the refuge bypass.
4. Deliberately get caught, retry, collect/drop/consume supplies, and ensure no duplication. Test complete restart separately.
5. Reach the pipe ending through both entrances and both branches. Confirm Level 2 is described as unavailable.
6. Install/relaunch offline from HTTPS; close all old game windows before checking cache updates.
7. Measure actual frame times and heat on the target phone. Tune scene batching/difficulty only from that evidence.

Publication was explicitly authorized on 2026-10-08 for the existing official site. See RELEASE_DEMO_V1_RC1.md and the deployment verification report for actual publication status.
