# src/debug/ — live tuning + dev overlays

## panel.ts
`createDebugPanel(hooks: PanelHooks): GUI` — lil-gui panel (top right, starts closed) bound **directly** to the `tuning` and `artTheme` objects, so edits apply live. When you add a constant to config, add its GUI binding here if it's worth dialing.

- `PanelHooks = { applyMaterials?, rebuild?, replayShot?, runBattery? }`, wired in main.ts: material dials call `applyMaterials` (push restitution/friction onto live colliders); geometry dials call `rebuild` (dispose + recreate hoop); action buttons "replay last shot" / "run shot battery".
- Art folder: `cel.lowestStep` changes must call `refreshGradientMap()` (the gradient texture is cached) — the existing binding does this.
- Debug folder toggles: `tuning.debug.physicsWireframe`, `swipeOverlay`, `predictedArc`, `shotLog`.

## physicsDebug.ts
`class PhysicsDebugRenderer(scene)` — renders Rapier `world.debugRender()` as LineSegments (renderOrder 999, depthTest off), gated by `tuning.debug.physicsWireframe`. Called every render tick; cheap when off.

## swipeOverlay.ts
`class SwipeOverlay(canvas)` — 2D canvas overlay for input introspection: live swipe samples, release gesture + predicted parabola, steer state. Gated by `tuning.debug.swipeOverlay`/`predictedArc` — **except** `showSlingshot`/`clearSlingshot`, which draw the slingshot pull-back feedback and are real always-on gameplay UI. Colors here are hardcoded RGBA (dev chrome, deliberately outside artTheme).
