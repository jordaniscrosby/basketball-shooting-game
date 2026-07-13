# src/scene/ — rendering + comic-ink art stack

Everything here is visual-only — no gameplay state, no physics. All style constants come from `config/artTheme.ts` (never hardcode a color/width here); geometry dims that mirror colliders read the same `tuning`/`derived` values as `physics/`.

## The art stack (how the hand-drawn look is built)

1. **Cel fills** — `toon.ts`: one shared N-step `NearestFilter` gradient `DataTexture`; `toonMaterial()` (`MeshToonMaterial`) is the only lit material; flat environment fills use `MeshBasicMaterial`. The gradient is a cached module singleton — after mutating `artTheme.cel`, call `refreshGradientMap()`. Lighting in `scene.ts` (ambient 1.35 + directional 1.85, shadows OFF, `NoToneMapping`) is tuned purely to place the cel step bands — don't "fix" it.
2. **Ink outlines** — `outlines.ts` `class OutlineBoiler`: inverted-hull BackSide copies per mesh (`outline(mesh, width)`), with `smoothedNormals()` so box corners don't split, renderOrder parent−1 to avoid z-fighting.
3. **Line boil** — `artTheme.boil.variants` pre-jittered variants cycled at `boil.rateHz` ("on threes"). One clock: `OutlineBoiler.update(dt)` cycles hulls and fires `onCycle(cb)` which main.ts fans out to `court.applyBoilFrame` and `blobShadow.applyBoilFrame` (texture-variant swaps, not per-frame geometry work).
4. **Thick ink strokes** — `inkRibbon.ts` `class RibbonBatch`: batched camera-facing quads (`begin(camera)` → `quad(...)` → `end()`), rebuilt every frame by callers. Exists because Windows/ANGLE locks GL line width to 1px — fat strokes must be geometry. Used by `trail.ts` and `net/verletNet.ts`.
5. **Comic 2D layer** — `src/fx/comicFx.ts` (separate canvas, see its CLAUDE.md).

## Files

- **scene.ts** — `createScene(canvas)` returns the bare `{scene, camera, renderer}` shell only. Scene *composition* (court, ball, net, trail, outlines...) happens in `main.ts`.
- **toon.ts** — cel gradient + `toonMaterial` + deterministic randomness helpers `hash01(n)` / `seededRng(seed)` used across all visual modules (stable boil/wobble, reproducible textures).
- **court.ts** — `createCourt(scene)`: the entire rural-park environment, procedurally painted via 2D canvas textures (court + wobbly hand-inked markings, grass, 360° cylindrical backdrop, bench + cow props, hoop hardware visuals). Markings pre-baked into boil variants. Backdrop is an inward cylinder with a 0.65 horizontal correction factor so painted circles stay round. `wobblyStroke()` is the shared hand-drawn-line helper.
- **ballVisual.ts** — `createBallMesh()`: toon sphere with hand-inked seams (the seams make backspin readable). Note main.ts wraps it in a 3-node hierarchy: `ballRoot` (position) → `ballStretch` (squash/stretch scale) → `ballMesh` (spin) — scaling must never touch the physics-interpolated node.
- **blobShadow.ts** — `class BlobShadow`: ink ellipse under the ball (real shadow maps are off); spreads/fades with height; boils via `applyBoilFrame`.
- **cameraRig.ts** — `class CameraRig(camera, rimCenter)`: hoop-centered choreography — `snapTo`, `flyTo(pos, onArrive)` (the between-shots pacing beat), `startReleasePush()`, `update(dt)`. Reads `tuning.camera.*`; the only scene module with no artTheme coupling.
- **trail.ts** — `class BallTrail`: dash speed-line trail on `RibbonBatch`; recolors by heat tier (`setHeat`) and while steering (`setSteering`).

## Per-frame render order (wired in main.ts render callback)

boil clock first (so texture swaps land before draw) → blob shadow → net ribbons → trail ribbons → camera rig → physics wireframe → swipe overlay → comic FX → `renderer.render`. Keep new per-frame visuals in this block, after the boil update.
