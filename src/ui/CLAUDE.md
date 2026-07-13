# src/ui/ — DOM HUD + persistence

## themeBridge.ts
`applyThemeToCss()` — the runtime bridge that closes the old hud.css/artTheme color-duplication seam: writes artTheme palette roles (including the scoreboard split colors `--sb-panel/chips/mult/digit`), the semantic score colors (`--score-base/bonus/mult/total`), and HUD motion dials (`--digit-pop-scale`, `--sb-breathe-*`, `--sb-heat-scale-*`, `--sb-ignite-px`, `--sb-flame-em`, `--swirl-screen-alpha`) onto `:root` as CSS custom properties. Called in `boot()` right after `applySavedTheme()`, and from debug-panel color/motion `onChange` hooks so those dials go live without a reload. The `:root` literals in hud.css are pre-boot fallbacks only — artTheme is the source of truth.

## hud.ts
`class Hud(onToggleStats, onToggleControls)` — drives pre-existing DOM elements from `index.html` by id; styles in `hud.css`. The top chrome is a Balatro-style split scoreboard: one dark `.sb-panel` holding two colored inset halves — blue chips half (`run-score` ×4 seven-segment digits) `×` red mult half (`streak-count` ×2 digits), white digits, no labels. Meaning comes from the color split, and heat is *shown*, never said. `SegmentCell` (private, in hud.ts) builds each digit as seven `<i class="seg seg-a…g">` bars, lit via `DIGIT_SEGMENTS` bitmasks; unlit bars stay faintly visible (LCD ghost). `buildFlames()` fills `#sb-fire` with `artTheme.hud.flameCount` comic flame tongues (deterministic per-index variation) that live behind the panel. Layout: top-left on desktop, centered along the top edge ≤640px (media query in hud.css). Methods: `setControlMode`, `setRun(score, streak, punch?)`, `setHeat(heat)`, `showStatsScreen(bestRun, leaderboard, stats)`, `hideStatsScreen()`.

- `setRun` with `punch=true` rolls each segment cell to the new value (staggered slot-reel roll in `SegmentCell.set`: each column tracks its own `easeOutBack` tween of the full value, offset `artTheme.hud.digitStaggerMs` from the ones column, so digits cascade right-to-left, roll PAST the target, and snap back; a column whose glyph changed retriggers `.digit-pop`) and re-triggers the score punch by forcing reflow (`void offsetWidth`); without `punch` (miss reset) values snap instantly. Roll timing/overshoot dials live in `artTheme.hud`. Note main.ts defers the punchy `setRun` to fire when the receipt's total card lands (`later(...)`/`pendingFxTimers` in main.ts) — receipt climax and HUD roll are one beat.
- `setHeat` mirrors the heat state onto `#scoreboard` as a `heat-warm|fire|superstar` class — the digits stay white; heat drives the FIRE (`--flame-heat` scales the flame tongues: embers → blaze → bigger, faster, white-hot blaze) plus a fire glow on the panel. The burning board IS the heat readout; there is no text label or mult chip (the ×N multiplier appears only in the receipt cards on the FX layer).
- Heat escalation theater (hud.css): fire scales the digits (`--sb-heat-scale-fire`) + glow pulse; superstar scales more + `digit-ignite` chunky jitter (`steps(1)`) while the flames go white-hot. Flames flicker with `steps(3)` (`flame-lick`) — comic fire, not a particle sim. Panel and buttons idle-breathe (`sb-breathe*` keyframes on the standalone `rotate` property so base transforms survive). **Gotcha:** the infinite breathe animation makes buttons "unstable" to Playwright's actionability check — automated tests must click with `force: true`.
- `attachSwirl(swirl)` mounts the swirl cameo canvas behind the stats/game-over card; `showStatsScreen`/`hideStatsScreen` start/stop it (`want('screen', ...)`).
- Division of labor: this HUD is persistent chrome; transient score "receipts"/onomatopoeia belong to `src/fx/comicFx.ts`.
- The stats-screen toggle is the ONLY path into/out of the `gameover` phase (`GameRun.endSession()`/`retry()` via main.ts).

## persist.ts
localStorage layer, all reads defensive (corrupt JSON degrades to empty state). Keys:

| Key | Contents |
|---|---|
| `streak.leaderboard` | `LeaderboardEntry[]` (`{runScore, streak, date}`), sorted desc, capped at top 10 |
| `streak.stats` | `CareerStats` (totalPoints, attempts, makes, swishes, threes, banks, bestStreak, bestRun, sessions) |
| `streak.best` | legacy v1 key — `loadStats()` folds it into `bestStreak` once, then deletes it |

(Also `streak.controlMode`, owned by `src/input/controlMode.ts`.)

Exports: `emptyStats()`, `loadLeaderboard()`, `pushRun(runScore, streak)`, `loadStats()`, `saveStats(stats)`, `loadBestRun()`.
