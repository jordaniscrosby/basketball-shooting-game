# src/fx/ — 2D comic overlay

## comicFx.ts
`class ComicFx(canvas)` — pure-2D-canvas comic layer over the WebGL canvas (`#fx-overlay`), zero WebGL budget.

API: `card(text, world, opts)` (world-anchored onomatopoeia — "SWISH!", score receipts; `opts.scale` sizes the receipt total card), `panel(text, sub?, style?)` (screen-centered freeze-frame card), `impact(world, 'stars'|'dust', strength)`, `setFocusLines(on)`, `attachSwirl(swirl)`, `render(dt, camera)`.

- **Signature gotcha:** FX animation is deliberately quantized to `artTheme.fx.stepHz` ("on twos") while the 3D world runs 60 fps — that framerate contrast IS the style. Don't smooth it.
- Card styles map to `artTheme.palette` via `styleColors()`; the semantic score styles `'base'|'bonus'|'mult'|'total'` map to `artTheme.score` — the same colors the HUD wears (the mapping never breaks). Fonts `Bangers` + `Patrick Hand` are warmed in the constructor (loaded from `public/fonts/`).
- Reward-reveal staging: while a big panel is alive, `drawPanelDim()` dims the world to ink with a spotlight ellipse (`artTheme.fx.panelDimAlpha`/`panelSpotScale`), and the panel interior fills with the swirl cameo if one is attached.
- Impact stars twinkle per step (`artTheme.fx.starTwinkle`) — idle-motion rule: nothing sits still.
- Randomness uses `toon.seededRng`/`hash01` — deterministic per element.
- Score-math "receipts" render here, not in the DOM HUD (`src/ui/hud.ts` owns persistent chrome; this layer owns transient beats).

## shake.ts
`screenShake(tier: 'small'|'medium'|'large')` — magnitude-tiered CSS screen shake (`artTheme.shake`). Sets `--shake-*` vars + retriggers a `shake-sm|md|lg` class on `<body>`; keyframes in hud.css move `#game + #fx-overlay + #hud` as ONE comic panel (the page gets thumped, not the camera — deliberately not the camera rig, which would tear the HUD/FX apart from the world). Large tier adds ±deg roll with baked `scale(1.02)` so corners never show. No-op in art-review mode. Fired in `resolveShot` at resolve time, *before* the receipt finishes (pre-cognitive rule); tier from `bd.total` vs `shake.mediumScore/largeScore`, floors at medium for swish/bank, forces large for milestones/on-fire.

## swirl.ts
`class SwirlCanvas` — the Balatro paint-swirl cameo (GLSL port in-file; source study in vault "Balatro — Background Shader"). Small offscreen `THREE.WebGLRenderer` (`artTheme.swirl.size`²), lazily created, renders ONLY while an owner `want('panel'|'screen', true, colors)`s it and only on FX step-clock ticks. Consumed two ways: `drawImage`d into big-panel fills (comicFx) and DOM-mounted behind the stats card (`Hud.attachSwirl`). Garnish only — never the world backdrop. Perf note: it's a second WebGL context; keep it gated.
