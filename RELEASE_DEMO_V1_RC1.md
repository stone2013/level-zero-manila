# Demo v1.0 RC1 — Level 1 stage update

2026-10-08. Explicitly authorized for the existing official site, rather than a separate preview. The visible build remains `demo-v1.0-rc1` / 候选版. This is an iterative stage update, not a declaration that final Demo v1.0 or mobile acceptance is complete.

## Scope and verification
Runtime is unchanged from the reviewed 408-test RC1 candidate. See DEMO_V1_CANDIDATE.md for implementation, measured traversal, remaining playtesting, and the real-device acceptance checklist. Candidate source/playable archives and CPU review images remain separately preserved.

Existing Level 0, Manila, hub, finite supplies and inventory/phone behavior are retained. The Level 1 loop adds warehouse routing, refuge bypass, blackout entity, meaningful retreat, checkpoint retry and the pipe Demo endpoint. No multiplayer, resident NPCs or Level 2.

## Rollback and preservation
- Previous source main: ca62fbe686d0d258d60789b1963e12b7050373e7
- Previous gh-pages: 16260faea26aa942b88bfa595db65871d2a933ac
- Existing preview-room subtree: 1bfeb9efd232b6a57d27c26cac91d1b4998f7c31
- Both updates are normal fast-forwards from these checked heads, with expected-head guards. No tree-wide replacement or force push.
- Rollback, if later authorized, should make a new forward commit restoring the previous runtime tree. Preserve preview-room and unrelated files.

PWA cache is versioned `level-zero-manila-demo-v1.0-rc1`, with no forced takeover of running sessions. Close old game windows to permit the new cache to activate.

Final deployment evidence must verify exact branch commits, Pages workflow success and live runtime byte hashes. HTTP/assets verification is not browser rendering or mobile testing.
