# src/net/ — visual-only Verlet net

## verletNet.ts
`class VerletNet(scene, rimCenter)` — a Verlet-integrated cord lattice pinned to the rim, drawn as hand-inked ribbons via `scene/inkRibbon.RibbonBatch`.

- `update(dt, ballPos, ballR)` runs in the fixed `update` (simulation); `render(camera)` rebuilds ribbons per frame; `ripple(strength)` for swish kicks.
- **Invariant (stated in the file header): the net is never a gameplay collider.** The rim capsules (`physics/hoop.ts`) own all physics; the net only reads the ball position and pushes cords aside visually. Don't "upgrade" it into collision geometry.
- Constants from `tuning` (rim dims) and `artTheme.net` (cord width etc.); per-cord jitter uses the deterministic `toon.hash01`.
