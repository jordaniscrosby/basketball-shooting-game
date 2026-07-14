# src/input/ — gesture input schemes

Four input schemes, one contract: `SwipeInput` (touch), `SlingshotInput` (mouse pull-back), and `ClickClickInput` (two-click arcade meter) all emit the same `Gesture` type (defined in `swipe.ts`: `azimuth`, `upSpeed`, `curvature`, `samples`), and `KeySteer` (WASD) emits the same screen-space drag-velocity units as the touch steer-drag. Downstream `systems/aim.aimShot` and `systems/curve.FlightSteer` are therefore shared untouched across all schemes. **If you add an input scheme, emit `Gesture` — don't add a parallel path.**

Units: viewport-fraction coordinates (x/width, y/height) with **screen-y positive DOWN**; velocities in viewport-heights/s; timestamps in ms. Expect sign flips at the boundary (e.g. `upSpeed = -v.vy`).

## swipe.ts
`class SwipeInput` — primary Pointer-Events path. On pointer-down decides aim-gesture vs mid-flight steer-drag via callbacks (`steerActive()`/`steerGrabCheck()`). Private `evaluate()` validates gestures (min upward length `tuning.input.minSwipeFrac`, predominantly vertical, min flick speed) and computes azimuth from release-velocity direction + signed curvature as max perpendicular deviation from the start→end chord. Gotcha: the pointer-**up** event is deliberately NOT fed to the velocity estimator — matches Android, where it would drag release velocity toward 0.

## slingshot.ts
`class SlingshotInput` — press anywhere (`tuning.slingshot.grabRadius` is large = whole screen, same convention as `curve.grabRadius`), pull down/back, release fires opposite. Synthesizes a `Gesture`: pull direction → azimuth, pull length vs `tuning.slingshot.referenceDragFrac` → synthetic `upSpeed` via `input.referenceFlickSpeed`, `curvature: 0` (in-air spin belongs to WASD). The pull → aim mapping is the exported pure `pullAim(drag)` (tested in slingshot.test.ts), shared by the release path AND main.ts's aim-time trajectory preview — so the previewed shot IS the shot a release would fire. Keep them on the same function. Its pull feedback renders through `debug/swipeOverlay.ts` but is real gameplay UI (not debug-gated).

## clickclick.ts
`class ClickClickInput` — arcade two-click aim: first click anywhere sets azimuth (angle of the ball→click direction off vertical, `clickAzimuth`), which starts the power meter sweeping 0→1→0 (`meterValueAt` triangle wave on wall time — the freeze value comes from the second click's own `e.timeStamp`, so it's framerate-independent); second click freezes the meter and fires (`meterUpSpeed`: `tuning.clickclick.sweetFrac` maps exactly to `input.referenceFlickSpeed`, edges swing by `powerSpan`). `curvature: 0` (in-air spin belongs to WASD). Aim is 1:1, not assisted: main.ts fires click-click gestures through `aimShot` with `tuning.clickclick`'s own `lateralGain`/`lateralMax` (gain 1, wide clamp) so the shot follows the aim arrow exactly — the meter, not the direction, is this mode's forgiveness. `state(nowMs)` is polled per render frame by main.ts to feed the overlay's gradient meter (`SwipeOverlay.showClickMeter`), and auto-cancels a charge if `active()` goes false. Before the first click it returns a hover preview (mouse only — `charging: false`, azimuth follows the cursor) so the aim guide shows where the shot would go; the overlay draws it fainter until the click locks it. Escape or the HUD mode toggle cancels via `cancel()`. Pure helpers exported for tests.

## keySteer.ts
`class KeySteer` — WASD air steering. `poll()` returns `{vx, vy} | null`; **polled from the loop's `update`** (main.ts), not event-pushed. Clears held keys on window `blur` (backgrounded-tab keyup loss). Diagonals normalized to `tuning.curve.keySpeed`.

## velocityTracker.ts
`estimateVelocity(samples)` — Android-parity Lsq2 estimator: least-squares quadratic fit, velocity = derivative at the latest sample. The quadratic term matters: a linear fit underestimates an accelerating flick (verified analytically in the test). Falls back to linear when near-singular; `windowSamples()` keeps ≤`estimatorMaxSamples` within `estimatorWindowMs`. Kept Android-parity deliberately so the eventual iOS port preserves feel.

## controlMode.ts
`ControlMode = 'swipe' | 'slingshot' | 'clickclick'`. `detectControlMode()` via `(pointer: fine)` media query (never auto-picks clickclick); `nextControlMode()` cycles the HUD toggle through all three; `load/saveControlMode()` persist to localStorage key `streak.controlMode`. All browser API access try/catch-guarded, falls back to `'swipe'`.
