import { tuning } from '../config/tuning';
import type { ShotPosition } from '../config/positions';

/**
 * Tier scheduler: streak milestones escalate the tier mix, an occasional
 * breather shot drops back a tier, and the anti-repeat shuffle never serves
 * the same position twice in a row nor the same court octant twice in a row.
 * rng injectable for deterministic tests.
 */
export function pickNextPosition(
  pool: readonly ShotPosition[],
  makes: number,
  shotIndex: number,
  prev: ShotPosition | null,
  rng: () => number = Math.random,
): ShotPosition {
  const g = tuning.game;
  let tiers: ReadonlyArray<1 | 2 | 3>;
  if (makes >= g.fireAt) tiers = [2, 3];
  else if (makes >= g.mixAt) tiers = [2, 3];
  else if (makes >= g.heatAt) tiers = [1, 2];
  else tiers = [1];

  // Breather: past the first milestone, periodically drop back a tier.
  const escalated = makes >= g.heatAt;
  if (escalated && shotIndex > 0 && shotIndex % g.breatherEvery === 0) {
    tiers = makes >= g.mixAt ? [2] : [1];
  }

  let candidates = pool.filter((p) => tiers.includes(p.tier));
  if (prev) {
    const noRepeat = candidates.filter((p) => p.id !== prev.id && p.octant !== prev.octant);
    // Relax octant rule if it empties the pool; never relax same-position.
    candidates =
      noRepeat.length > 0 ? noRepeat : candidates.filter((p) => p.id !== prev.id);
  }
  if (candidates.length === 0) candidates = pool.filter((p) => p.id !== prev?.id);

  return candidates[Math.floor(rng() * candidates.length)]!;
}
