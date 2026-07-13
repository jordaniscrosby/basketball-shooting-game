import { describe, it, expect } from 'vitest';
import { pickNextPosition, targetDifficulty } from './scheduler';
import { getPositions } from '../config/positions';
import { tuning } from '../config/tuning';

const pool = getPositions();

/** Seeded mulberry32 so distribution tests are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function meanSampledDist(streak: number, shotIndex: number, seed: number, n = 3000): number {
  const r = rng(seed);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += pickNextPosition(pool, streak, shotIndex, null, r).dist;
  return sum / n;
}

describe('linear difficulty ramp', () => {
  it('target rises linearly with streak and respects the cap', () => {
    const d = tuning.difficulty;
    expect(targetDifficulty(0)).toBeCloseTo(d.t0, 10);
    expect(targetDifficulty(5)).toBeCloseTo(d.t0 + 5 * d.perStreak, 10);
    expect(targetDifficulty(1000)).toBe(d.cap);
    // Monotonic, never above cap.
    let prev = -1;
    for (let s = 0; s <= 40; s++) {
      const t = targetDifficulty(s);
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t).toBeLessThanOrEqual(d.cap);
      prev = t;
    }
  });

  it('mean sampled distance increases monotonically with streak', () => {
    // Non-breather shot index; generous sample size per streak point.
    const means = [0, 4, 8, 12, 16, 20].map((s) => meanSampledDist(s, 1, 0xabc + s));
    for (let i = 1; i < means.length; i++) {
      expect(means[i]!).toBeGreaterThan(means[i - 1]!);
    }
    // And the ramp is substantial: a deep run shoots much farther than a fresh one.
    expect(means[means.length - 1]! - means[0]!).toBeGreaterThan(2);
  });

  it('caps: very long streaks sample like the cap, not beyond', () => {
    const atCap = meanSampledDist(30, 1, 0x111);
    const wayPast = meanSampledDist(90, 1, 0x111);
    expect(Math.abs(wayPast - atCap)).toBeLessThan(0.15);
  });

  it('breathers fire on the cadence with visibly easier draws', () => {
    const d = tuning.difficulty;
    const breatherIdx = d.breatherEvery * 3;
    const hot = meanSampledDist(15, 1, 0x222);
    const breather = meanSampledDist(15, breatherIdx, 0x222);
    expect(breather).toBeLessThan(hot - 1.5);
    // No breather while the ramp hasn't meaningfully started.
    const cold = meanSampledDist(0, breatherIdx, 0x333);
    const coldNormal = meanSampledDist(0, 1, 0x333);
    expect(Math.abs(cold - coldNormal)).toBeLessThan(0.2);
  });

  it('never repeats the same position and avoids the same octant when possible', () => {
    const r = rng(0x444);
    let prev = pickNextPosition(pool, 12, 1, null, r);
    for (let i = 2; i < 200; i++) {
      const next = pickNextPosition(pool, 12, i, prev, r);
      expect(next.id).not.toBe(prev.id);
      const alternatives = pool.filter((p) => p.id !== prev.id && p.octant !== prev.octant);
      if (alternatives.length > 0) expect(next.octant).not.toBe(prev.octant);
      prev = next;
    }
  });

  it('is deterministic under an injected rng', () => {
    const a = pickNextPosition(pool, 7, 1, null, rng(7));
    const b = pickNextPosition(pool, 7, 1, null, rng(7));
    expect(a.id).toBe(b.id);
  });

  it('the pool includes battery-validated deep positions for the DEEP!! bonus', () => {
    const deep = pool.filter((p) => p.band === 'deep');
    expect(deep.length).toBeGreaterThanOrEqual(2);
    for (const p of deep) expect(p.difficulty).toBeGreaterThan(0.8);
  });
});
