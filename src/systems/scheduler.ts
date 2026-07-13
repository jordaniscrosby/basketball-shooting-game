import { tuning } from '../config/tuning';
import type { ShotPosition } from '../config/positions';

/**
 * Linear difficulty ramp scheduler. Each position carries a distance-dominated
 * difficulty rating; the sampling target rises linearly with streak (capped)
 * and positions are drawn with Gaussian weights around that target —
 * probabilistic, monotonic, no tier cliffs. The anti-repeat shuffle (never the
 * same position, avoid the same octant) and the every-Nth breather survive
 * from the tier era. rng injectable for deterministic tests.
 */

/** The ramp: t = min(t0 + k·streak, cap). */
export function targetDifficulty(streak: number): number {
  const d = tuning.difficulty;
  return Math.min(d.t0 + d.perStreak * streak, d.cap);
}

export function pickNextPosition(
  pool: readonly ShotPosition[],
  streak: number,
  shotIndex: number,
  prev: ShotPosition | null,
  rng: () => number = Math.random,
): ShotPosition {
  const d = tuning.difficulty;

  // Breather: once the ramp is meaningfully underway, every Nth shot draws
  // from an easy target instead — pacing relief without a menu.
  const rampActive = targetDifficulty(streak) > d.breatherTarget + 0.1;
  const isBreather = rampActive && shotIndex > 0 && shotIndex % d.breatherEvery === 0;
  const target = isBreather ? d.breatherTarget : targetDifficulty(streak);

  // Anti-repeat: never the same position; avoid the same octant when possible.
  let candidates: readonly ShotPosition[] = pool;
  if (prev) {
    const noRepeat = pool.filter((p) => p.id !== prev.id && p.octant !== prev.octant);
    candidates = noRepeat.length > 0 ? noRepeat : pool.filter((p) => p.id !== prev.id);
    if (candidates.length === 0) candidates = pool;
  }

  // Gaussian weights around the target difficulty.
  const weights = candidates.map((p) => {
    const z = (p.difficulty - target) / d.sigma;
    return Math.exp(-z * z);
  });
  let total = 0;
  for (const w of weights) total += w;
  let roll = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return candidates[i]!;
  }
  return candidates[candidates.length - 1]!;
}
