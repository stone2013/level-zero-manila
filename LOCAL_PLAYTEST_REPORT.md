# RC2 optional local Level 1 playtest recording

## Use
Open Settings → enable Developer Tools → Start Local Test Recording before entering Level 1. This does not enable movement cheats. Resume and play normally. Return to Settings → View Statistics or Export JSON before closing/reloading the page. Export is an explicit browser Blob download, with no network request. Nothing is stored on a server or browser storage. Normal HUD is unchanged. Recording defaults off; the switch survives a full restart within the page. Closing the page discards unexported records.

The export contains the current run and up to 20 archived runs. A full restart archives the run; checkpoint retry stays within it and adds an attempt. Stopping and re-enabling creates a partial record. Mid-Level-1 enable always marks partial. Pre-enable clue/crate IDs and elapsed time are in baseline; counts include those baseline discoveries and must not be treated as newly observed discoveries in a partial record. Attempt numbers in visits are one-based; warehouse IDs are zero-based. Time is seconds.

## Measurement
The observer reuses level1.elapsed deltas, readClues and opened crate identities. It records cumulative active time across deaths/retries, per-attempt active time/outcome, ordered area transitions (including backtracking), visited sectors, clue/crate IDs and counts, deaths, successful checkpoint retries, and actual pipe-exit completion. Counts are unique discoveries, not interaction clicks. Read/export never changes a gameplay snapshot. Existing sector.time describes encounter phases and is deliberately not presented as exploration dwell.

Timing follows the existing simulation gate: pause/settings, backpack, phone, hidden page, portrait mobile and world loading do not advance it. The existing 0.05s frame cap remains in effect; a stalled frame is not caught up. This is effective simulation time, not total wall-clock duration or moving-only time. Unpaused idle/route-note toast reading counts. Hidden-page, pagehide and blur pause remain unchanged. Retry resets original level1.elapsed but not the observer's cumulative total. A real terminal result freezes time. Visits at the exit are observed even though the original move path returns before progression updates.

Exports distinguish scripted from human-unverified sources and mark known developer actions as debug-assisted. There is no verification of a participant's first play, device type, prior experience or mobile acceptance. Use full, non-debug, genuinely first-play human records for pacing assessment; inspect retries and route coverage rather than pooling everything into a claimed mean. No names, account IDs, device fingerprint or wall-clock timestamps are collected.

## Validation
Full regression: 439/439 passed, zero failed/skipped/cancelled (evidence/playtest/tests.txt). Nine dedicated tests cover default-off behavior, detached JSON, pause/inventory/phone/invalid deltas, ordered visits and identities, death/retry timing, real pipe exit and restart, partial/bounded history, identical paired simulation snapshots, app loading/background/portrait gates, and local download cleanup. Existing keyboard focus test includes the new controls.

The existing collision-planned exploration script now enables recording with source `scripted`. Both routes reach the exit, read all 6 clues and open all 10 crates, with zero deaths. Walking: 401.17559374546033 seconds (6:41); sprinting: 253.02121931946272 seconds (4:13). Observer cumulative time matches original elapsed exactly in both runs. See evidence/playtest/scripted-exploration.json. The script uses no added dwell and no arbitrary repeats. These results verify recording, not human first-play pacing.

No human playthrough, real mobile touch/audio/WebGL, sustained FPS or thermal validation was performed. The 8–12 minute design target remains unverified.

## Deployment
Changes are limited to existing cached runtime files, tests, benchmark and this report. No new runtime dependency, asset, service endpoint or telemetry. Service worker cache name, asset list, installation/activation/fetch behavior, manifest and GitHub Pages structure are unchanged. This independent source branch does not update gh-pages. Any later website release must follow the existing coherent PWA version release procedure; an already installed RC2 cache is not claimed to have updated automatically.
