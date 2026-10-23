# Backrooms Demo v1.0 — local review candidate, 2026-10-12

This is an unpublished review copy based on PR #1, not the final Demo v1.0 release.

## Changes

1. When local recording is enabled, both the Level 1 completion screen and the death screen offer **导出本地测试 JSON** directly. No restart or return through pause/settings is required. Export still works if developer controls were subsequently hidden.
2. Settings and ending buttons reuse the same local download function. A failed Blob/download attempt leaves the record intact, reports a retry message and releases any created object URL. “Download requested” deliberately does not claim that the browser saved the file.
3. The recorder now adds an immediate visit row for each successful checkpoint retry, including retries within the same warehouse area. Its attempt number and cumulative timestamp are retained on repeated exports.
4. Added seven terminal-export/input tests and one multi-retry recording test. No new recorder, telemetry, persistence, runtime dependency or game content.

Level 0, Manila chase, Level 1 routes, encounter timings, hunger/water, 4×4 backpack, phone, textures and models are unchanged. Existing retry survival floors remain unchanged. No pacing values were changed without human/browser evidence.

## Source and publication

Verified at the start of this work:
- main: 2d1a888a19861319657c39490c9851a9b7fd1b5b
- fix/rc2-local-playtest / PR #1: cf2f2e951d20c0336ffd436a86fc86d99b4a3059
- gh-pages: 029a7d35b01ab7d78c7f8c4446ea66fe753a7c59
- PR #1 is open and unmerged: https://github.com/stone2013/level-zero-manila/pull/1

Remote source was reconstructed against its Git blob hashes, reusing only exact matching local assets. The repository has no AGENTS.md or .agents/skills entries in the retrieved tree. Modified runtime files are dist/app.js, dist/index.html and dist/game.js. No push, merge, deployment or replacement of the official Library source occurred. The included candidate.patch applies to PR #1's exact head, not directly to main.

The service worker/cache version is intentionally unchanged in this unpublished review copy. Do not replace a live deployed folder with it. A future authorized release needs its own coherent version/cache rollout. For isolated local review, run from this directory:

    python3 -m http.server 4186 --bind 127.0.0.1 --directory dist

Open http://localhost:4186 in a browser with no previous game cache on that origin. Direct file opening is unsupported by the game’s module loader.

## Fresh verification

See evidence/review-2026-10-12/full-tests.txt for the final complete npm test run, and scripted-exploration.json for the rerun of the existing collision-planned all-notes/all-supplies route.

Final fresh regression: **447/447 passed**, zero failed, skipped or cancelled. Full run duration: 51.924 seconds. Syntax checks passed for the two changed JavaScript runtime modules.

Focused coverage includes:
- Default-off/hidden export; active gameplay cannot invoke the terminal action.
- Pipe completion → repeated export, with developer controls off and no gameplay mutation.
- Death → export → repeated retry taps → second death → export: one run, two deaths, one accepted retry and stable item identities.
- Hidden-page, portrait and settings guards; terminal effective time remains frozen.
- Held movement/look/sprint interrupted by pause: input clears, paused time is excluded, stale pointer movement cannot resume walking.
- Failed download → successful retry yields the same record and releases object URLs.
- Same-area retries get exact immediate attempt-2/3 visit rows; repeated exports create no extra rows; consumed/dropped items and phone identity/battery are preserved.

The baseline fails the new same-area visit regression, and the candidate passes it. Existing complete game/route, inventory, phone, loading, input, rendering-geometry and PWA mocked-cache suites remain included.

## What these checks do not prove

These are Node simulation and DOM-harness tests, not a full browser playthrough. The harness uses a mock renderer and browser APIs. Its injected touch/pointer events are not physical-phone or browser-emulated multi-touch acceptance. Blob creation, anchor clicking and URL cleanup are mocked; an actual browser-saved JSON file was not verified.

Supported cloud browser attempts were blocked:
- The local candidate HTTP URL returned net::ERR_CONNECTION_REFUSED.
- A file URL was rejected by the browser protocol policy, which permits only HTTP(S).

No workaround bypassed this denial, no candidate browser screenshot was produced, and no full browser route was completed. Real browser/WebGL, phone touch/audio, PWA installation/offline relaunch, sustained FPS and thermals remain unverified.

The scripted all-notes/all-supplies route reaches the pipe exit with six clues and ten crates: walking 401.17559374546033 seconds (6:41), sprinting 253.02121931946272 seconds (4:13). Recorder and original simulation time agree. These are known-route scripted results, with no reading dwell. The human first-play 8–12-minute target is still unvalidated.

## Next acceptance pass

On a suitable browser/phone, enable recording before entering Level 1, follow a normal first-play route, interrupt with bag/phone/pause/background/rotation, intentionally retry once, and export directly from the final screen. Verify the downloaded JSON and item identities. Keep genuine human, non-debug, first-play records separate from scripted or developer-assisted runs before making pacing decisions.
