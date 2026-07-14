# src/config/ — all constants live here

The two-registry constant discipline: **every** magic number in the codebase belongs in one of these files. If you find yourself typing a physical threshold, gain, color, or timing literal anywhere else, move it here instead. The lil-gui debug panel (`src/debug/panel.ts`) binds directly to these objects, so they are live-editable at runtime.

## tuning.ts
`export const tuning` — physics + gameplay registry, grouped by section: `world`, `ball`, `rim`, `backboard`, `floor`, `court`, `scoring`, `solver`, `input`, `slingshot`, `curve`, `spin`, `camera`, `game`, `difficulty`, `score`, `juice`, `debug`. Also `export const derived` — live getters computed from tuning: `ballCollisionRadius`, `rimInnerRadius`, `rimCenterZ`, `backboardFaceZ`. `type Tuning = typeof tuning`.

Depended on by essentially everything. Explicitly designed as "the artifact that survives the iOS rewrite" — real-world SI units sourced from vault physics research.

Coupled constants (move together):
- `world.gravity` ↔ the solver's `g` default — solved shots miss if they diverge.
- `derived.rimCenterZ` couples `court.length` + `court.boardFromBaseline` + `rim.centerFromBoard`.
- `score.bandMid/bandThree/bandDeep` drive positions.ts's internal `bandOf()`; `difficulty.distFloor/distSpan` drive its internal `difficultyOf()`, which the scheduler's ramp samples over.
- `score.starMilestones` and `score.starMultipliers` are index-coupled (`multiplierForStars` indexes one by the other).
- `input.powerSensitivity` is the "difficulty via tolerance" dial (never past ~0.5); `powerMin`/`powerMax` clamp it.
- Any physics-section change ⇒ re-run the shot battery (`npx vitest run src/systems/shotBattery.test.ts`).

## artTheme.ts
`export const artTheme` — visual/style registry, same discipline as tuning. Sections: `palette`, `score` (the semantic score colors — base/bonus/mult/total; the Balatro rule: the mapping never breaks across HUD, receipt cards, particles), `hud` (digit roll/stagger/overshoot/pop, idle breathe, heat escalation scales, superstar jitter, flame tongues `flameCount`/`flameEm`), `shake` (3 shake tiers + score thresholds), `cel`, `outline`, `boil`, `blobShadow`, `net`, `trail`, `fx` (stepHz "on twos", receipt pacing, panel dim/spotlight, freezeSec, smearSec, stretch/squash, starTwinkle), `swirl` (paint-swirl cameo dials), `heatFx` (rim emissive per heat tier), `grainOpacity`. After mutating `artTheme.cel`, call `scene/toon.refreshGradientMap()` — the cel gradient texture is cached (the panel already does this). Colors + HUD motion dials reach the DOM via `ui/themeBridge.applyThemeToCss()` (CSS custom properties) — call it after mutating those outside the debug panel.

Coupled: `score.mult` should stay visually identical to `palette.star` (the mult badge, star particles, and ×N receipt card all read as "the gold"). Audio counterparts of the receipt (tick pitch ramp, volumes) live in `tuning.juice`, not here — audio isn't visual.

## positions.ts
The curated shot-position pool. `getPositions()` builds 18 hand-placed spots from raw `[id, name, tier, x, dz]` tuples, computing `dist`/`octant`/`band`/`difficulty`. `launchPointFor(pos)` returns the THREE.Vector3 launch point at `tuning.game.releaseHeight`. Types: `ShotPosition`, `DistanceBand` (`'close'|'mid'|'three'|'deep'`).

Coordinate gotcha: raw `dz` is an offset from rim centre toward mid-court; final `z = derived.rimCenterZ + dz`. The hoop sits at the −z end.

Consumers: `main.ts`, `systems/scheduler.pickNextPosition`, the shot battery (fires from every position — adding a position adds a battery assertion).
