# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Streak" — a 3D swipe-to-shoot basketball game. Three.js rendering + Rapier physics + TypeScript, no framework, no bundler config beyond Vite defaults. Comic-ink hand-drawn art style.

## Commands

```sh
npm run dev          # Vite dev server at http://localhost:5173
npm run dev -- --host   # expose on LAN for phone testing (no nginx needed) — see README "Play on your phone" for firewall/VPN gotchas
npm run verify       # tsc --noEmit && vitest run && vite build — run before committing
npm run test         # vitest run (all tests)
npx vitest run src/systems/aim.test.ts        # single test file
npx vitest run -t "name"                      # single test by name
npm run typecheck    # tsc --noEmit only
npm run build        # typecheck + vite build
node scripts/genAudio.mjs   # regenerate placeholder SFX WAVs into public/audio/
```

Tests are Vitest, colocated as `*.test.ts` next to their modules. All are pure-math unit tests **except** `src/systems/shotBattery.test.ts`, which boots real Rapier headlessly (60 s timeout) — it is the physics regression harness. **Re-run the shot battery after any change to physics tuning, the solver, hoop colliders, scoring sensors, or the position pool.**

## Directory index

Each directory has its own CLAUDE.md with per-file detail. Read the one for the area you're touching:

| Directory      | Owns                                                                                                           | CLAUDE.md                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `src/config/`  | ALL constants: `tuning.ts` (physics/gameplay), `artTheme.ts` (visual), `positions.ts` (shot pool)              | [src/config/CLAUDE.md](src/config/CLAUDE.md)   |
| `src/core/`    | Fixed-timestep loop, `GameRun` state machine                                                                   | [src/core/CLAUDE.md](src/core/CLAUDE.md)       |
| `src/input/`   | Swipe / slingshot / WASD input, velocity estimator, shared `Gesture` contract                                  | [src/input/CLAUDE.md](src/input/CLAUDE.md)     |
| `src/physics/` | Rapier world, ball body, hoop colliders                                                                        | [src/physics/CLAUDE.md](src/physics/CLAUDE.md) |
| `src/systems/` | The shot pipeline: aim, solver, spin, curve steering, scoring, score engine, scheduler, replay, battery, audio | [src/systems/CLAUDE.md](src/systems/CLAUDE.md) |
| `src/net/`     | Visual-only Verlet net                                                                                         | [src/net/CLAUDE.md](src/net/CLAUDE.md)         |
| `src/scene/`   | Rendering + comic-ink art stack: toon cel shading, boiling outlines, court, camera rig, trail                  | [src/scene/CLAUDE.md](src/scene/CLAUDE.md)     |
| `src/fx/`      | 2D-canvas comic overlay (onomatopoeia cards, freeze panels)                                                    | [src/fx/CLAUDE.md](src/fx/CLAUDE.md)           |
| `src/debug/`   | lil-gui panel, physics wireframe, swipe overlay                                                                | [src/debug/CLAUDE.md](src/debug/CLAUDE.md)     |
| `src/ui/`      | DOM HUD, localStorage persistence                                                                              | [src/ui/CLAUDE.md](src/ui/CLAUDE.md)           |
| `scripts/`     | `genAudio.mjs` SFX synthesizer                                                                                 | [scripts/CLAUDE.md](scripts/CLAUDE.md)         |

## Architecture

**`src/main.ts` is the orchestrator.** Everything is wired inside one big `boot()` closure (`main.ts:45`): init Rapier → scene → physics world → hoop → ball → systems → inputs → debug panel → `FixedLoop`. The systems modules are pure and composable; main.ts owns the game-flow glue (shot lifecycle closures `holdBallAt`, `flyToNext`, `fireShot`, `resolveShot`).

**Fixed 60 Hz timestep with render interpolation** (`core/loop.ts`, gaffer-style accumulator). `update(dt)` runs zero-or-more times per frame at exactly `1/stepHz` and owns all physics, state mutation, and scoring; `render(alpha, frameDt)` runs once per frame and owns all interpolation, camera, and drawing. This split is load-bearing: it makes shots deterministic, which is what makes the shot-replay debug tool and the shot battery possible. Tick-accurate quantities use `dt` in update; purely visual springs/decays use `frameDt` in render.

**The shot pipeline** (gesture → score), orchestrated by main.ts:

1. `scheduler.pickNextPosition()` picks a spot; `positions.launchPointFor()` gives the launch point.
2. Input emits a `Gesture` (shared contract in `input/swipe.ts` — both swipe and slingshot produce it).
3. `aim.aimShot()` solves the perfect 45°-entry arc (`shotSolver.solveToRim()`), then the gesture _perturbs_ it: azimuth → lateral error, flick speed → clamped power, curvature → sidespin. Misses are always explainable (`[shot]` console log).
4. Per fixed step in flight: `curve.FlightSteer.step()` (WASD/drag air steering with a Δv budget) → `spin.applyFlightForces()` (the SINGLE owner of Rapier persistent forces: resets then adds Magnus + steering) → `world.step()`.
5. Collision events classified by collider handle → rim/board contacts feed scoring marks, FX, audio.
6. `scoring.ScoringTracker.update()` detects make/swish via two virtual crossing planes (no Rapier sensors); floor-hit or 6 s timeout = miss.
7. `resolveShot()` assembles `ShotFacts` → `core/state.GameRun.resolve()` → `scoreEngine.scoreShot()` (pure, every bonus traces to an observable fact, no score RNG).

**Constants discipline (the most important convention):** every physical/gameplay number lives in `src/config/tuning.ts`; every visual/style number lives in `src/config/artTheme.ts`. Nothing else hardcodes a constant. The lil-gui debug panel binds directly to these objects for live editing. Tuning is "the artifact that survives the iOS rewrite."

**Key invariants:**

- A miss ends the RUN (streak/score → 0) but not the session; `gameover` phase is reachable only via `GameRun.endSession()`. `GameRun.assert()` throws on out-of-order phase transitions.
- The zero-steer flight path stays bit-identical to no-curve builds (idle `FlightSteer.step()` returns null, `applyFlightForces` adds nothing).
- The Verlet net and all of `scene/` are visual-only — never gameplay colliders.
- The ball visual is a 3-node hierarchy (`ballRoot` → `ballStretch` → `ballMesh`) so squash/stretch scaling never touches physics.
- `tuning.world.gravity` and the solver's `g` must scale together.

**Units:** SI (metres, seconds, radians) in physics/systems. Input layer uses viewport-fraction coordinates with screen-y positive DOWN (expect sign flips at the boundary). Hoop sits at the −z end of the court; `derived.rimCenterZ` computes its position.

## Conventions

- Tests import the real `tuning` object and assert against its values (`const s = tuning.score`) rather than hardcoding numbers, so tuning edits don't break tests. Tests that mutate tuning dials must save/restore them (`beforeEach`/`afterEach`) — tuning is a shared mutable singleton.
- Systems modules take structural interfaces (e.g. `ForceBody`, `BallSample`), not Rapier types, so they stay pure and unit-testable without booting Rapier.
- Randomness used for gameplay (scheduler) takes an injectable `rng`; visual randomness uses seeded/deterministic hashes (`toon.hash01`, `seededRng`).
- Browser API access (`localStorage`, `matchMedia`, `setPointerCapture`) is always try/catch-guarded with graceful fallbacks.

## Art asset workflow

- Authored PNG texture overrides live in `public/art/` (slot spec: `public/art/README.md`) — hand-authored files, **never generate or overwrite them**. Loader: `src/scene/artAssets.ts`, procedural fallback per slot.
- `?art=ball|hoop|wide|court|bench|cow|backdrop` = art-review mode: fixed camera, frozen boil, no HUD — reproducible screenshots for before/after art comparison (`src/debug/artReview.ts`).
- Live theme tuning: debug panel art folder → "apply theme (save + reload)" persists edits locally; "copy theme JSON" exports the diff to commit into `artTheme.ts` (`src/debug/themeStore.ts`).
- Process doc: vault "Basketball Shooting Game/Art Assets & Workflow".

## Documentation and planning

- Design docs and plans live in the Obsidian vault under "Basketball Shooting Game".
