# Audio repair

## Verified original coverage and failure handling

The original production app contained a 60 Hz sine hum (gain about 0.012), 85→35 Hz triangle footsteps (gain 0.015), and 60→35 Hz pursuit taps (up to 0.028). There was no door interaction or latch sound. The pursuit used the same clock as player footsteps and was only scheduled when the player was not moving. Arrow-key movement was absent from the old footstep-trigger condition. AudioContext.resume() was called without handling its Promise; asynchronous rejection had no retry feedback, and new touch gestures did not provide a general recovery path.

These are source-verified limitations. Reduced audibility of the bass-only cues on a small speaker is plausible, but this work does not establish the exact cause of the user's physical iPhone silence.

## Changes

- Added a small, local, asset-free `dist/audio.js` controller, with six bounded synthesized cues: lamp hum, carpet footsteps, approaching footsteps, door creak, door latch, and a quiet lamp-loop cue.
- Footsteps have a restrained mid-range body plus short noisy contact. Hum includes 120/240/600 Hz partials. The master gain is 0.8 and fades in over 160 ms. No opening sting or sudden loud startup was added.
- Footsteps track actual player travel, so keyboard arrows and touch movement work and stationary/colliding/teleporting players do not generate false footsteps. Pursuit uses an independent cadence and stops when the world changes.
- Door interaction triggers a creak; reaching the open or closed animation endpoint triggers one latch cue. Picking up/reading/empty interaction does not trigger a door cue.
- AudioContext creation/resume is initiated directly in explicit start/resume and gameplay gestures, before fullscreen can consume activation. Promise rejections and synchronous failures are caught. A later touch/key gesture can retry. Stale completion/rejection cannot start queued audio or override a newer successful attempt.
- Pause, inventory, phone, portrait gate, pagehide, background, mute, and terminal/menu state changes immediately zero the master and stop/disconnect every active source. Interrupted audio requires a fresh gesture before returning. Sound-enable state survives reset/restart/continue within the session.
- Successful repeated gestures keep one context and one hum; one-shot voices are capped and disconnected when finished.
- New module is added to the offline asset list and harness imports. The existing master setting is labelled “音效” and controls all cues.

## Verification

The two new audio suites contribute 18 tests, including simultaneous movement and pursuit. Focused audio results are recorded in `evidence/audio-final-focused-tests.txt`; the final complete candidate result is in `evidence/flow-polish-final-tests.txt` and `TEST_REPORT.md`.

Production PCM is directly tested at 22.05, 44.1, and 48 kHz. All six cues contain finite nonzero samples with a pre-master peak below 0.31, and footsteps/door cues contain short higher-frequency texture. Numeric results are in `evidence/audio-pcm.json`. These are PCM data measurements, not physical loudness measurements.

Mocked AudioContext tests exercise same-call resume invocation, quiet construction, startup fade, one-hum deduplication, rejected/stale resume, synchronous unsupported/throw paths, pending completion after pause/mute/background, interruptions, complete node cleanup, movement/pursuit/latch wiring, voice bounds, settings preservation, and repeated navigation/restarts. App-level tests dispatch actual production handlers against the game's model and mocked DOM/GPU.

An isolated real Chromium graph test was prepared and attempted, but the executor disallowed Chromium's required local IPC socket. A single supported escalation request produced the same blocker. No browser-engine or iPhone audibility claim is made. The exact blocker is preserved in `evidence/audio-browser-blocker.txt`; `tests/audio-browser.html` is a runnable real-engine check for a permitted browser. Serve the project root over local HTTP and open that page, then click its button. It uses that actual user click, AudioContext + OfflineAudioContext, analyser RMS/peak, and zero-output stop/mute measurements. This manual browser test is separate from `npm test`.

## Status

Included in v1.6.1, approved for publication on 2026-10-06. Deployment verification is tracked separately. No physical iPhone audibility or actual browser-engine result is claimed.
