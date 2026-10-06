# Clear-view compatibility correction

This follow-up supersedes the earlier streaming report's 15 m regions, 25-region application window, adaptive 29 m fog and synchronous initial tile preparation. It is an isolated delta from the frozen streaming handoff, for the phone integration owner.

## Preserved visibility

The earlier user instruction forbids dense fog obscuring vision. The application therefore retains the original fog start/end of 16/80 m, 76° vertical field of view and 65 m camera far plane. There is no adaptive fog masking or permanently shortened fog distance.

A perspective far plane is not a circular horizon. The request selector uses the real Three.js camera frustum, including yaw, pitch and viewport aspect, intersected with the actual floor/ceiling/wall height range. Visible region requests are never silently discarded.

The selector supports viewport ratios up to 4:1. A wider window, or any request requiring more than the hard cap, pauses presentation with “视口过宽，请缩窄窗口后继续。” The user can resize the window; graphics settings, menus and existing overlays remain available. This is an explicit technical limit, not an invisible outer wall in the game world.

## Bounded working set

- Render regions are now 7×7 cells / 35×35 m.
- Up to 49 ready/pending regions are held in an LRU, including recently viewed regions. Required view regions are prioritized. Optional 8 m prefetch fits only within remaining capacity.
- At most 2,401 cell floors can be resident. Typical requested views use fewer regions; the exact sampled counts are in evidence/clear-view-frustum-probe.json.
- One floor batch, one wall batch, one ceiling-panel instance batch, and shared-material prop batches are retained per region. Owned geometry and instance buffers are disposed on eviction; shared assets and Manila persist.
- Collision-layout LRU remains 16 chunks. Item IDs, positions and consumed state remain in the finite Game.items ledger.
- The scheduler still has only one active iterator. Loading work targets 8 ms / 48 yielded steps per frame; ready exploration uses 3 ms / 24 steps. These are soft CPU budgets, not preemptive deadlines or FPS guarantees.

## Loading behavior

Initial world construction is asynchronous. The canvas is hidden until the requested view is complete, with a small, non-focus-stealing status message. During later view changes the last completed canvas presentation is retained until the new view is ready. Turning or entering a cold region can briefly pause the view while the cache warms.

The global worldLoading flag freezes canPlay(), and therefore movement, survival, door and approach timers. The combined candidate includes !worldLoading in the phone device timer's active predicate. Background and portrait states do not advance construction or simulation. Restart cancels old builders and starts a fresh asynchronous request.

Item visibility continues to use only local tile readiness, not a whole-view radius, so a visible marker is not hidden merely because an unrelated edge is pending. Movement's immediate floor neighborhood is always requested. Near an active fold, the destination floor is required even if behind the camera; an unexpected missing landing rolls the crossing back and requests it instead of silently losing the transfer. After a transfer the new view must complete before it is presented.

The status has pointer-events:none and never calls focus or dismisses phone/backpack overlays.

## Validation scope

- Real Three.js frustum probe across six viewport ratios, four sub-tile offsets, five pitches and 32 yaw samples. Independently intersected rays at five screen X/Y samples with floor and ceiling planes to check requested region coverage.
- Required-request overflow is atomic; every required tile is preserved. Optional prefetch truncates safely. Ready LRU reuse and canceled-turn work are tested using the shipped scheduler.
- Real application checks cover initial/restart loading, unchanged survival while waiting, background/portrait pause, clear fog and far clip, input focus, off-camera fold landing after eviction, and rollback/retry when a destination is unexpectedly unavailable.
- Existing DOM/input-only suites can explicitly use bootControls(), which replaces world mesh construction in the test harness only. Lighting, geometry, disposal, coordinate and clear-view tests use boot() and the real chunk generator. This keeps test runtime bounded without describing mocked UI checks as GPU validation.

Cloud WebGL and real-phone performance remain unverified. This correction increases the bounded working set and may load longer than the rejected dense-fog version. No claim of measured phone FPS, no-stall turning, or iOS runtime validation is made.
