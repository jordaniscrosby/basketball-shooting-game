# src/core/ — loop + game state machine

## ease.ts
Shared easing vocabulary for visual tweens: `clamp01`, `easeOutCubic`, `easeInOutCubic`, `easeOutBack(t, s)` (the Balatro-style overshoot — lands past target, springs back; used by the HUD digit roll). Camera rig and HUD import from here — don't re-inline easings per file.

## loop.ts
`class FixedLoop` — gaffer-style fixed-timestep accumulator. Calls `update(dt)` zero-or-more times per animation frame at exactly `h = 1/tuning.world.stepHz` (60 Hz), then `render(alpha, frameDt)` once, where `alpha` is the leftover accumulator fraction for interpolation. `frameDt` is clamped to `tuning.world.maxFrameDt` (spiral-of-death guard). Public `smoothedFps` EMA for the readout.

The determinism contract lives here: identical inputs → identical trajectories. This is what makes the shot-replay tool and shot battery trustworthy. Never step physics outside `update`; never mutate game state in `render`.

## state.ts
`class GameRun` — the pure game FSM. `Phase = 'positioning' | 'aiming' | 'flight' | 'resolved' | 'gameover'`; `Heat = 'cold' | 'warm' | 'fire' | 'superstar'`. Transitions: `beginAiming()` → `release()` → `resolve(result, facts)` → `nextShot()`; plus `endSession()` / `retry()`. Getters: `stars`, `multiplier`, `heat`, `isNewBest`.

Invariants:
- A miss ends the RUN (streak/stars/runScore → 0, prior run returned as `EndedRun`) but the phase stays `resolved` and play continues. `gameover` is reachable **only** via `endSession()` (wired to the HUD stats toggle in main.ts).
- Every transition guards via private `assert(expected)` which **throws** on out-of-order calls. Callers must check phase first (main.ts's `resolveShot` early-returns unless `phase === 'flight'`).
- Scoring math is delegated to `systems/scoreEngine.scoreShot()` — this class owns sequencing, not point values.

## state.test.ts
Test pattern to follow repo-wide: asserts against the real `tuning.score` constants instead of hardcoded numbers, uses helpers (`toFlight(run)`, `plainMake()`), and verifies rejected out-of-order transitions.
