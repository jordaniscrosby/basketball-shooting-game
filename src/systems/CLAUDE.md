# src/systems/ — the shot pipeline

Pure, composable game logic. Modules here take structural interfaces (`ForceBody`, `BallSample`), not Rapier types — that's why everything except the shot battery unit-tests fast without booting Rapier. All constants come from `config/tuning.ts`. Orchestration (who calls what per tick) lives in `src/main.ts`, not here.

## Pipeline order (gesture → score)

`scheduler` picks position → input `Gesture` → `aim.aimShot` (perfect arc via `shotSolver`, perturbed by gesture, spin from `spin.releaseAngularVelocity`) → per-step flight: `curve.FlightSteer.step` + `spin.applyFlightForces` → `world.step` → `scoring.ScoringTracker.update` detects make/swish → `scoreEngine.scoreShot` prices it → `shotReplay` can re-fire the exact shot.

## Files

- **aim.ts** — `aimShot(launch, rimCenter, gesture)`: the assisted-aim core. Solves the perfect arc then lets the gesture perturb it — azimuth → lateral error (rotates v0 about +Y), flick speed → clamped power (scales v0), curvature → sidespin. Difficulty tunes *tolerance*, never input feel. `classifyShot()` labels the miss mode for the `[shot]` console log — misses must stay explainable.
- **shotSolver.ts** — closed-form ballistic solver, pure parabola (no drag/Magnus). `solveShot(launch, target, entryAngleDeg, g)` returns the exact release velocity for the desired entry angle; `shotTarget()` applies the Noah 11-inch depth offset; `solveToRim()` composes them. The solver's `g` must equal `tuning.world.gravity`.
- **spin.ts** — `releaseAngularVelocity()` (auto-backspin + gesture sidespin) and `applyFlightForces(body, steerForce?)` — the **single owner of Rapier persistent forces**: resets, then adds Magnus `k·(ω×v)` + steering. Never apply forces elsewhere.
- **curve.ts** — `class FlightSteer`: mid-flight "body English". Owns the per-flight Δv budget, converts screen-drag to camera-relative world force, integrates an unsteered analytic ghost for fairness telemetry (`CurveTelemetry`: dvSpent, maxLateralDev, smoothness), records a `SteerTimelineEntry[]` for deterministic replay. `markContact()` freezes steering on rim/board touch so rim physics stays pure. Invariant: idle `step()` returns null ⇒ zero-steer flights are bit-identical to pre-curve builds (asserted in curve.test.ts).
- **scoring.ts** — `class ScoringTracker`: pure make/swish detector. Two *virtual* horizontal sensor planes above/below the rim (no Rapier sensors); crossing detected by interpolating between fixed-step samples so a fast ball can't skip one; latches once per possession. Swish = make with zero rim contacts (`markRimContact()` fed from collision events in main.ts).
- **scoreEngine.ts** — pure pricing: `scoreShot(facts, streak)` = `(base + Σ bonuses) × star-multiplier`, returning an itemized `ScoreBreakdown`. Every bonus traces to an observable `ShotFacts` field — no score RNG. `starsForStreak` / `multiplierForStars` (index-coupled tuning arrays).
- **scheduler.ts** — `pickNextPosition(pool, streak, shotIndex, prev, rng?)`: linear difficulty ramp (`targetDifficulty`), Gaussian weights around the target, anti-repeat, every-Nth breather. `rng` injectable — tests use seeded mulberry32.
- **shotReplay.ts** — `class ShotReplay`: records exact release state (+ attached steer timeline) and re-fires it via `fire(ball)`. The debugging backbone for physics tuning; relies on Rapier local determinism + the fixed timestep.
- **shotBattery.ts** — `runShotBattery()`: fires solved perfect shots from **every** curated position in a fresh headless Rapier world and checks they all score. Runs in vitest AND from the debug panel. Test asserts zero misses and makeRate ≥ 0.99. **This is the regression gate for any change to tuning physics, the solver, hoop colliders, scoring geometry, or the position pool.**
- **audio.ts** — Howler SFX bank (`play` with throttle, `playTick(step)` — score-receipt tick at rising pitch via playbackRate `1 + step·tuning.juice.tickPitchStep`, `setCrowdLevel` by heat, `silenceCut` on miss). Not part of the shot math; WAVs live in `public/audio/`.

## Test conventions

- Assert against the live `tuning` object, not literals (a few intentional pinned "design target" literals exist, e.g. the free-throw 7.31 m/s in shotSolver.test and the streak-12 corner-3 = 500 worked example in scoreEngine.test — keep those human-legible).
- Tuning is a shared mutable singleton: tests that mutate dials (curve.test, aim.test) save in `beforeEach` and restore in `afterEach`. Do the same.
- Only `shotBattery.test.ts` boots Rapier (60 s timeout); keep everything else pure.
