# Candidate publication, 2026-10-23

Publish the complete October 12 review candidate, including PR #1 local playtest recording and the terminal export / retry fixes. This remains a candidate, not a final v1.0 acceptance.

Runtime version and offline cache: demo-v1.0-rc2-review-20261023. Existing sessions are not interrupted; finish the current session, close every game tab and installed app window, then reopen to activate the update. In-progress games are not saved across reloads.

Source package SHA-256: 973284e0c30c2bfe37ffc60a2c253fb77656a8be05b5d7ddea10cce572739fc6. The archive is complete; candidate.patch is historical reference and was not reapplied. Publication changes only the visible version, service-worker cache identifier, recorder build identifier and matching cache regression checks beyond that candidate.

Existing gh-pages deployment layout, .nojekyll and preview-room are preserved. Only changed runtime files are replaced, with existing assets retained.

Real phone touch/audio, sustained FPS/thermals, installed PWA offline relaunch and human first-play 8–12-minute pacing acceptance remain unverified. Node/DOM-harness checks are not evidence of these.

Fresh publication checks: 447/447 Node tests passed, zero failures/skips/cancellations. JavaScript syntax checks passed. Scripted walking/sprinting routes both reached the pipe exit with six clues and ten crates (401.18 / 253.02 active seconds); not human first-play evidence. See evidence/release-2026-10-23/.
