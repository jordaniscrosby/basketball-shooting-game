# src/fx/ — 2D comic overlay

## comicFx.ts
`class ComicFx(canvas)` — pure-2D-canvas comic layer over the WebGL canvas (`#fx-overlay`), zero WebGL budget.

API: `card(text, world, opts)` (world-anchored onomatopoeia — "SWISH!", score receipts), `panel(text, sub?, style?)` (screen-centered freeze-frame card), `impact(world, 'stars'|'dust', strength)`, `setFocusLines(on)`, `render(dt, camera)`.

- **Signature gotcha:** FX animation is deliberately quantized to `artTheme.fx.stepHz` ("on twos") while the 3D world runs 60 fps — that framerate contrast IS the style. Don't smooth it.
- Card styles map to `artTheme.palette` via `styleColors()`; fonts `Bangers` + `Patrick Hand` are warmed in the constructor (loaded from `public/fonts/`).
- Randomness uses `toon.seededRng`/`hash01` — deterministic per element.
- Score-math "receipts" render here, not in the DOM HUD (`src/ui/hud.ts` owns persistent chrome; this layer owns transient beats).
