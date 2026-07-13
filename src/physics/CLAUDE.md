# src/physics/ — Rapier world + colliders

SI units throughout: metres, seconds, 9.81 m/s² gravity, fixed timestep `1/tuning.world.stepHz`. Any change here ⇒ re-run the shot battery (`npx vitest run src/systems/shotBattery.test.ts`).

## world.ts
- `initRapier()` — memoized WASM init; must be awaited before anything else (the one async gate in boot).
- `createPhysicsWorld()` — Rapier `World` + `EventQueue(true)` + floor (fixed cuboid, top at y=0). Gravity is set from tuning **every tick** in main.ts, so the GUI dial works live.
- `createBall()` — dynamic body with **CCD enabled + soft-CCD prediction** (required for the thin rim). Collision radius = `derived.ballCollisionRadius`, deliberately ~5% smaller than the render radius — this is the "forgiveness lever". `ActiveEvents.COLLISION_EVENTS` on so contacts raise events.
- Interpolation bookkeeping: `TrackedBody`, `snapshotBody()` (call after each `world.step`), `applyInterpolated()` (call in render with alpha), `resetTracking()` (call on teleports, or the ball visually lerps across the court).

## hoop.ts
`createHoop(world)` — one fixed body carrying:
- **Rim**: a ring of `tuning.rim.capsuleCount` (14) capsule colliders approximating the torus — deliberately convex, **no trimesh** ("keeps CCD honest"). Capsule axes rotated onto ring tangents; half-length `π·ringR/n` for slight overlap; `CoefficientCombineRule.Min` on restitution so the dead rim wins over the lively ball; `contactSkin` prevents fast pop-through.
- **Backboard**: single cuboid, face toward +z, also Min restitution rule.
- `rimCenter` at `(0, tuning.rim.height, derived.rimCenterZ)` — hoop is at the −z baseline.

`applyHoopMaterials(hoop)` re-applies restitution/friction live (GUI hook); `dispose()` + re-`createHoop` for geometry rebuilds (main.ts keeps `hoop`/`rimHandles` as `let` for this — rebuilds must refresh the handle sets used for collision classification).

**No Rapier sensor colliders exist.** Make/swish detection is analytic (`systems/scoring.ts` virtual crossing planes); rim/board *contact* detection uses real collision events matched against `hoop.rimColliders` handles / `boardCollider.handle` in main.ts.

Force convention: Rapier forces **persist across steps**. `systems/spin.applyFlightForces()` is the single owner — it calls `resetForces()` then re-adds Magnus + steering each step. Never add forces anywhere else.
