# src/ui/ — DOM HUD + persistence

## hud.ts
`class Hud(onToggleStats, onToggleControls)` — drives pre-existing DOM elements from `index.html` by id; styles in `hud.css`. The top chrome is a hand-drawn white scoreboard (`#scoreboard`): streak cell on the left (`streak-count` ×2 seven-segment digits), points cell on the right (`run-score` ×4 digits with the `#mult-badge` comic-starburst multiplier inline after the digits, digit-height, no label), and the `heat-label` lamp. `SegmentCell` (private, in hud.ts) builds each digit as seven `<i class="seg seg-a…g">` bars, lit via `DIGIT_SEGMENTS` bitmasks; unlit bars stay faintly visible (LCD ghost). Layout: top-left panel on desktop, full-width top bar ≤640px (media query in hud.css). Methods: `setControlMode`, `setRun(score, streak, stars, punch?)`, `setHeat(heat)`, `showStatsScreen(bestRun, leaderboard, stats)`, `hideStatsScreen()`.

- `setRun` with `punch=true` rolls each segment cell to the new value over ~450 ms (rAF ease-out tween in `SegmentCell.set`) and re-triggers the score punch by forcing reflow (`void offsetWidth`); without `punch` (miss reset) values snap instantly.
- `setHeat` mirrors the heat state onto `#scoreboard` as a `heat-warm|fire|superstar` class — CSS colors the segment digits off it (ink → amber → fire → rainbow hue-cycle) and drives the blinking heat lamp.
- The mult badge: `setRun` derives the multiplier from stars via `scoreEngine.multiplierForStars` (pure import), writes `×N` text, and sets `data-tier` 0–3 — tier 0 (×1) sits dimmed at 25% opacity; tiers 1–3 (gold/fire/red) light up with paired `badge-bounce` (transform) + `badge-glow` (filter) animations, kept as separate keyframes so superstar can swap the filter track for `badge-glow-hue` without property conflicts. A `.pop` class (removed on `animationend`) re-triggers the pop animation whenever the multiplier increases.
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
