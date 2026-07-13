# Streak — Basketball Shooting Game

3D swipe-to-shoot basketball with real physics: swipe up to shoot, one miss ends
your run, chase your best streak. Three.js + Rapier + TypeScript, no framework.

## Run

```sh
npm install
npm run dev       # http://localhost:5173
```

- **Swipe up** (mouse-drag or touch) to shoot. Swipe angle = aim, flick speed = power.
- Make +1, swish +2. Positions escalate in tiers at 3 / 7 / 10 consecutive makes.
- `npm run verify` — typecheck + unit tests (incl. the physics shot battery) + build.
- `node scripts/genAudio.mjs` — regenerate the placeholder SFX WAVs.

## How it works

- **Fixed 60 Hz timestep** (`core/loop.ts`) with render interpolation; deterministic,
  so the debug panel's shot replay re-fires trajectories exactly.
- **All constants live in `config/tuning.ts`** — bound to the lil-gui panel (top right),
  including a Rapier debug-wireframe toggle.
- **Assisted aiming** (`systems/aim.ts`): each shot solves the perfect 45°-entry arc
  (`systems/shotSolver.ts`); the gesture perturbs it — azimuth → lateral error,
  flick speed → clamped power, curvature → sidespin. Misses are always explainable
  (see the `[shot]` console log).
- **Swipe velocity** uses the Android-style Lsq2 estimator (`input/velocityTracker.ts`).
- **Rim** is a ring of capsule colliders; **scoring** is two stacked crossing-plane
  sensors with an anti-cheese possession latch (`systems/scoring.ts`).
- **Shot battery** (`systems/shotBattery.ts`): fires solved shots from all 15 curated
  positions headlessly and asserts they score — the regression harness for any
  physics tuning change. Runs in vitest and from the debug panel.
- **Net** is a visual-only Verlet lattice (`net/verletNet.ts`); audio is howler with
  synthesized WAVs (swap files in `public/audio/` to upgrade).

Design docs live in the Obsidian vault under "Basketball Shooting Game".
