import { tuning } from '../config/tuning';
import type { DistanceBand } from '../config/positions';
import type { CurveTelemetry } from './curve';

/** Everything the detectors need to know about a made shot. */
export interface ShotFacts {
  result: 'swish' | 'make';
  band: DistanceBand;
  /** Backboard touched this possession (bank on a make). */
  bankUsed: boolean;
  /** Rim contacts this possession (≥3 = lucky roll). */
  rimContacts: number;
  /** Mid-flight curve telemetry (null/unsteered = no curve bonuses). */
  curve: CurveTelemetry | null;
}

export interface BonusLine {
  label: string;
  points: number;
}

export interface ScoreBreakdown {
  base: number;
  bonuses: BonusLine[];
  stars: number;
  multiplier: number;
  total: number;
}

/** Stars earned at a streak (milestones in tuning.score.starMilestones). */
export function starsForStreak(streak: number): number {
  let stars = 0;
  for (const m of tuning.score.starMilestones) {
    if (streak >= m) stars++;
  }
  return stars;
}

export function multiplierForStars(stars: number): number {
  const table = tuning.score.starMultipliers;
  return table[Math.min(stars, table.length - 1)] ?? 1;
}

/**
 * Scoring v2: (base + Σ bonuses) × star multiplier. Every bonus traces to an
 * observable event — no hidden score RNG. Distance bonuses are mutually
 * exclusive by construction (one band per position); the curve tiers are
 * mutually exclusive with each other; STEEZ stacks on top of curve + swish.
 *
 * `streak` is the streak count INCLUDING this make — the milestone shot earns
 * its new multiplier (pairs with the star celebration).
 */
export function scoreShot(facts: ShotFacts, streak: number): ScoreBreakdown {
  const s = tuning.score;
  const bonuses: BonusLine[] = [];

  if (facts.result === 'swish') bonuses.push({ label: 'SWISH!', points: s.bonus.swish });

  if (facts.band === 'mid') bonuses.push({ label: 'MID-RANGE', points: s.bonus.mid });
  else if (facts.band === 'three') bonuses.push({ label: '3-POINTER!', points: s.bonus.three });
  else if (facts.band === 'deep') bonuses.push({ label: 'DEEP!!', points: s.bonus.deep });

  if (facts.bankUsed) bonuses.push({ label: 'BANK!', points: s.bonus.bank });

  if (facts.rimContacts >= s.luckyRollContacts) {
    bonuses.push({ label: 'LUCKY ROLL', points: s.bonus.luckyRoll });
  }

  // Curve tiers: player input only — deviation is measured against the
  // deterministic unsteered ghost, so every card traces to a swipe.
  const curve = facts.curve;
  let curved = false;
  if (curve?.steered && curve.maxLateralDev >= s.curveDevThreshold) {
    curved = true;
    const nearMax = tuning.curve.budget > 0 && curve.dvSpent / tuning.curve.budget >= s.benderBudgetFrac;
    if (nearMax) bonuses.push({ label: 'FULL BENDER!!', points: s.bonus.fullBender });
    else bonuses.push({ label: 'CURVE!', points: s.bonus.curve });
  }
  if (curved && facts.result === 'swish') {
    bonuses.push({ label: 'STEEZ!!', points: s.bonus.steez });
  }

  const stars = starsForStreak(streak);
  const multiplier = multiplierForStars(stars);
  const sum = s.base + bonuses.reduce((acc, b) => acc + b.points, 0);
  return { base: s.base, bonuses, stars, multiplier, total: sum * multiplier };
}
