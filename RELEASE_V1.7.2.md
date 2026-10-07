# v1.7.2 — Real Manila endpoint and black wall arrows

## Requested changes
- The regenerated escape road ends at the actual Manila room, with its visible, operable wooden door.
- Black arrows are painted on walls instead of the floor, with turn cues visible on approach.

## Implementation
- During the existing initial blackout, relocate the single room to the final east-facing escape cell. Open the final cell boundary and reserve the two cells covering the room footprint.
- Translate the existing room walls, table obstacle and world-state room items once. Preserve object identities, inventory and consumed states, battery and all maze drops. The existing charger follows the room coordinates.
- Translate the existing room and post-closure exit visuals. No duplicate room, water, charger or door is created.
- Remove the final hidden seam/blackout teleport. Final cell entry changes only the guidance/pursuit phase; the player must physically approach, open, enter and close the real door.
- Keep pursuit on the escape route through the final approach.
- Replace floor arrows with 84 flat black wall arrows covering 51 route cells, all ten turns and the final door direction. Update Chinese guidance to refer to black wall arrows.
- Bump visible release/offline cache to v1.7.2, retaining coherent running-session cache behavior.

## Verification
- Six seeds at 20/50/60 Hz: continuous actual-input routes, 47.53–48.30 seconds; physical door interaction, both finite bottles, original phone charging, hub entry.
- Three seeds: retry, consumed items, dropped maze/escape-route items, battery, object identity and reset restoration.
- Actual Three.js generated geometry: raycast from 7.5 m down final corridor sees the real closed door; after opening, no procedural wall blocks entry. Exactly one door leaf appears at the relocated coordinates.
- Wall arrows: black upright triangles, actual interior wall faces, correct outgoing cardinal directions, all route cells and turn cues, final room direction, lifecycle/disposal.
- Production frame/input journey covers full 480-second trigger, continuous room entry, hub, Level 1 and pipe demo ending.
- Full regression: 378/378 tests passed, no skipped/cancelled tests (48.39 seconds). Output: evidence/v172-full-tests.txt.

## Limits and release state
No live browser/WebGL pixel or real-phone verification was performed in this environment. Three.js matrix/raycast tests use the production geometry with the test harness's fake GPU/DOM; they are not screenshots. Candidate is local only, with no publication performed.
