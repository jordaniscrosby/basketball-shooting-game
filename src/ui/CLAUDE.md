# src/ui/ — DOM HUD + persistence

## hud.ts
`class Hud(onToggleStats, onToggleControls)` — drives pre-existing DOM elements from `index.html` by id (`run-score`, `star-meter`, `streak-line`, `heat-label`, `score-screen`, ...); styles in `hud.css`. Methods: `setControlMode`, `setRun(score, streak, stars, punch?)`, `setHeat(heat)`, `showStatsScreen(bestRun, leaderboard, stats)`, `hideStatsScreen()`.

- The `.punch` score animation re-triggers by forcing reflow (`void offsetWidth`) — keep that idiom if you add animated counters.
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
