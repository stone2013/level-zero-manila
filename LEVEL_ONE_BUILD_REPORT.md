# Level 1 playable candidate · v1.7.0

2026-10-07. Publication authorized by the user on 2026-10-07. Repository, deployment and Library outcomes are recorded separately after verification.

## Scope

The existing HTML/Three.js PWA has been extended, not ported to Unity. Main was verified at `219c2b9b2a678e9bb2b73f30d4f887cab7c42bad`; source archive was v1.6.4 (Library version 14). Original 338 tests passed before edits.

Two routes now reach the same artificial Level 1:

1. Level 0 → existing Manila discovery, door closure and changed connection → gray corridor → blue-wall/wood-floor connection room → separate right-wall Level 1 door.
2. A single subtle abnormal wall close to the original Level 0 spawn → hold E or the touch interaction for two seconds → direct Level 1 entry.

The seven reference doors are Level 130, 3, 5, !, 48, 54 and 399. They are inactive. Level 130 is not a playable level; it is not relabeled Level 1. The active Level 1 door is a separate eighth doorway with a green frame/sign. A player fully enters the connection room before its rear portal becomes a solid wall.

Level 1 contains a bounded 16×28 m column/warehouse hall, north continuation, west refuge branch and a narrow pipe transition. Its four finite supply boxes contain two waters and two foods in total. Current inventory, stable item identities, phone battery, hunger and hydration survive both routes. Ground items stay in their original zone; transitions do not duplicate them, grant water, or reset survival. The new end screen explicitly says the pipe transition is the Level 1 Demo endpoint and Level 2 is not open.

The old Level 0 chase and 7:30 developer test remain. No Level 0 cable entity is reused in Level 1. There are no resident NPCs, traders, new entity AI, multiplayer networking, prologue, real-Backrooms levels or Level 2 gameplay.

## EASY blackout and controls

Level 1 uses 28 seconds lit, six seconds of warning, eight seconds dark, then restoration. Emergency green markers stay illuminated. Blackout itself causes no damage. Movement uses the existing 1.63 m eye height, 76° camera and survival rules. Map corners, columns, shelving, crates, benches, risers and door boundaries have solid collision.

The hold-to-traverse action cancels on release, moving away, bag/phone opening, pause, background, orientation block or loading. A new run restores all zones, supplies, devices, doors, timer and cues. Loading freezes gameplay and device time and hides the old view. A failed load can be retried with the on-screen message; obsolete late completions after restart are discarded and disposed.

## Assets, performance and offline cache

- Actual approved GLB buffers, transforms, indexed geometry, normals, UVs, maps and emissive materials are read by the official local Three r180 GLTFLoader. Runtime dependencies are local and covered by the v1.7.0 service worker; no runtime CDN is used.
- The original packed Level 1 far wall is opened geometrically and rebuilt around a four-metre portal. Module instances build the refuge and pipe extension; no invisible passage through an unchanged wall is used.
- Current candidate: hub 51 mesh objects / approximately 20,416 triangles; Level 1 209 mesh objects / approximately 17,220 triangles. Two real lights, no real-time shadows or postprocessing. These are object counts, not GPU draw-call or FPS measurements.
- Hub assets fetched are approximately 1.38 MB; Level 1 approximately 2.22 MB. Runtime asset closure and current measured statistics are in `audit/zone-assets-evidence.json`.
- CPU GLB parsing/assembly was approximately 38.57 ms hub / 65.85 ms Level 1 in one Node run, excluding PNG decoding, GPU upload, shader compile and rendering. This cannot establish mobile startup time or frame rate.
- Each zone load owns its resource instances. Geometry/material/texture disposal is counted once per resource; decoded images are closed, root children and resource references removed. Level 0 streamed meshes and room geometry are released when leaving that zone. Shared small player-item materials remain available.
- Offline cache includes local loader utilities and all 14 runtime GLBs. Existing active PWA sessions are not force-replaced; close all old game windows before activating the newer cache.

## Verification

Final full suite:358/358 passed,zero failed/skipped. See the updated `TEST_REPORT.md`, new simulation and production-input tests, actual GLB parsing tests, geometry audit and benchmark evidence. The production-input harness uses the real app handlers/frame loop with mocked DOM/GPU and controlled loading; it is not a browser screenshot or device test.

Actual assembled scene geometry was exported and rendered in Blender CPU for layout inspection under `evidence/level1-preview`. Those images use separate review lighting and cannot establish runtime WebGL appearance. They are explicitly CPU layout reviews, not in-game screenshots.

No verified cloud GPU browser was available for this candidate, and tools identifying the user's computer were not used without the required route. Real GPU rendering, browser audio, multi-touch, iPhone/Android installation, offline restart, frame rate, power draw and thermals remain unverified.

## Before publication

Publication was authorized. Verify the exact remote commit and deploy result before treating the release as live. On a target phone, check the Level 130 plaque and distinct Level 1 side door, lamp/green-sign legibility during darkness, hold cancellation, loading retries, touch controls, collision, supply boxes, completion/restart, and first-load/offline relaunch.
