# src/debug/ — live tuning + dev overlays

## panel.ts
`createDebugPanel(hooks: PanelHooks): GUI` — lil-gui panel (top right, starts closed) bound **directly** to the `tuning` and `artTheme` objects, so edits apply live. When you add a constant to config, add its GUI binding here if it's worth dialing — wrap it in `tip(ctrl, text)`, which adds a hover tooltip (label `title`) and a per-dial ↺ reset button (`ctrl.reset()` restores the boot-time default and fires onChange hooks, so applyMaterials/rebuild still run).

- `PanelHooks = { applyMaterials?, rebuild?, replayShot?, runBattery? }`, wired in main.ts: material dials call `applyMaterials` (push restitution/friction onto live colliders); geometry dials call `rebuild` (dispose + recreate hoop); action buttons "replay last shot" / "run shot battery".
- Art folder: `cel.lowestStep` changes must call `refreshGradientMap()` (the gradient texture is cached) — the existing binding does this. Palette/outline/bake dials are startup-baked, so their subfolders route through the themeStore buttons: "apply theme (save + reload)", "copy theme JSON", "reset theme".
- Debug folder toggles: `tuning.debug.physicsWireframe`, `swipeOverlay`, `predictedArc`, `shotLog`.

## themeStore.ts
The live-tune → commit loop for `artTheme`: persists the **diff-from-defaults** to localStorage (`streak.artThemeOverrides.v1`), re-applied by `applySavedTheme()` first thing in boot() (before anything paints). `copyThemeDiff()` puts the diff JSON on the clipboard for committing back into `artTheme.ts`. Pristine defaults are `structuredClone`d at module import — which runs before boot merges overrides, so the diff stays stable.

## artReview.ts
Art-review mode: `?art=ball|hoop|wide|court|bench|cow|backdrop` gives reproducible screenshots for art iteration — pins the ball at free throw (`positions[0]`), freezes the boil (`rateHz = 0`), hides HUD + panel (`body.art-review`, rule in `ui/hud.css`), parks the camera at a fixed pose (main.ts skips `rig.update`). Poses are dev chrome, outside artTheme; bench/cow poses mirror the prop positions hardcoded in `court.buildParkProps`. Workflow doc: vault "Basketball Shooting Game/Art Assets & Workflow".

## physicsDebug.ts
`class PhysicsDebugRenderer(scene)` — renders Rapier `world.debugRender()` as LineSegments (renderOrder 999, depthTest off), gated by `tuning.debug.physicsWireframe`. Called every render tick; cheap when off.

## swipeOverlay.ts
`class SwipeOverlay(canvas)` — 2D canvas overlay for input introspection: live swipe samples, release gesture + predicted parabola, steer state. Gated by `tuning.debug.swipeOverlay`/`predictedArc` — **except** `showSlingshot`/`clearSlingshot`, which draw the slingshot pull-back feedback and are real always-on gameplay UI. Colors here are hardcoded RGBA (dev chrome, deliberately outside artTheme).
