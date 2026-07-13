---
name: verify
description: Drive the running game in a browser to verify changes end-to-end — launch recipe, synthetic shot input, and the gotchas that waste time (backgrounded-tab throttling, breathing buttons vs Playwright).
---

# Verifying Streak in a real browser

## Launch

```sh
npm run dev        # http://localhost:5173 (background it)
```

Console logging of every shot is ON by default (`tuning.debug.shotLog`): watch for `[shot] <pos> <classification> power=…` and `[result] make|swish|miss`.

## Gotchas (each of these cost real debugging time)

- **Backgrounded/occluded window = 1 fps.** rAF throttling makes the game advance at a crawl and CSS transitions freeze at their start value (e.g. `#score-screen` stuck at computed `opacity: 0` while "visible"). Symptom: swipes "do nothing", state never changes. Fix: `page.bringToFront()` and check `#fps` says ~60 before trusting anything.
- **Playwright can't click the HUD buttons normally.** The idle breathe animation (hud.css `sb-breathe-half`) means buttons never pass the actionability "stable" check → 30 s timeout. Use `page.click(sel, { force: true })`.
- **Input mode gates shooting.** `#controls-btn` text shows the CURRENT mode: `input: drag` = slingshot (press ON the ball + pull), `input: swipe` = flick anywhere. Synthetic center-screen swipes only work in swipe mode — force-click the button until it reads `input: swipe`.
- **`#run-score.punch` is never removed** after the first make — don't use it as a "score just changed" signal. Poll the `aria-label` on `#run-score`/`#streak-count` instead (note: aria updates when the roll ANIMATION finishes, ~0.6 s after the change starts).

## Driving shots

Synthetic swipe (swipe mode): `mouse.down` at (w/2, 0.78h), 8 moves up to (w/2, 0.30h) at ~12 ms apart, `mouse.up`.

Deterministic makes/misses — the app's live tuning singleton is importable from the page (same module instance Vite serves to the app):

```js
await page.evaluate(async () => {
  const { tuning } = await import('/src/config/tuning.ts');
  tuning.input.powerSensitivity = 0;  // every decent swipe = PURE make
  tuning.input.lateralGain = 0;
  // …or 1.0 + a very fast flick = guaranteed LONG miss
});
```

## What to observe per feature area

- Receipt/HUD beat: screenshot ~0.3–1 s after `[result] make` — receipt cards stack at the hoop in semantic colors (ink base, clay bonus, gold ×N, fire total), HUD digits cascade-roll as the total lands.
- Milestone panels (freeze + dim + swirl fill): panel lifetime is only ~1.1 s from resolve — trigger screenshots off the `[result]` console event, not off HUD aria changes (those lag past the panel).
- Heat states: streak 3/7 = warm, 10 = fire (digits scale+glow), 20 = superstar (hue-cycle + ignite jitter). Check `getComputedStyle('.sb-digits').scale/animationName`.
- Shake tiers: MutationObserver on `<body>` class for `shake-sm|md|lg`.
- Stats screen swirl: force-click `#stats-btn`, `#score-screen .swirl-bg` should be a 256×256 canvas; close via `#retry-btn`.
- Regression: `?art=hoop` must hide all chrome (`body.art-review`, `#hud` display none) and stay static.
