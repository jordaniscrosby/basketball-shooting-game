import { describe, it, expect } from 'vitest';
import { pickNextPosition } from './scheduler';
import { getPositions } from '../config/positions';
import { tuning } from '../config/tuning';

const pool = getPositions();
const seq = (...vals: number[]) => {
  let i = 0;
  return () => vals[i++ % vals.length]!;
};

describe('tier scheduler', () => {
  it('serves only tier 1 before the first milestone', () => {
    for (let i = 0; i < 50; i++) {
      const p = pickNextPosition(pool, 0, i, null);
      expect(p.tier).toBe(1);
    }
  });

  it('mixes tiers 1–2 after heatAt and 2–3 after mixAt', () => {
    const tiersAtHeat = new Set<number>();
    const tiersAtMix = new Set<number>();
    for (let i = 0; i < 200; i++) {
      tiersAtHeat.add(pickNextPosition(pool, tuning.game.heatAt, 1, null).tier);
      tiersAtMix.add(pickNextPosition(pool, tuning.game.mixAt, 1, null).tier);
    }
    expect([...tiersAtHeat].sort()).toEqual([1, 2]);
    expect([...tiersAtMix].sort()).toEqual([2, 3]);
  });

  it('never repeats the same position and avoids the same octant when possible', () => {
    let prev = pickNextPosition(pool, 12, 1, null);
    for (let i = 2; i < 100; i++) {
      const next = pickNextPosition(pool, 12, i, prev);
      expect(next.id).not.toBe(prev.id);
      const isBreather = i % tuning.game.breatherEvery === 0;
      const alternatives = pool.filter(
        (p) => (p.tier === 2 || p.tier === 3) && p.id !== prev.id && p.octant !== prev.octant,
      );
      if (!isBreather && alternatives.length > 0) {
        expect(next.octant).not.toBe(prev.octant);
      }
      prev = next;
    }
  });

  it('injects a lower-tier breather on the cadence', () => {
    const idx = tuning.game.breatherEvery * 2; // a breather step
    for (let i = 0; i < 50; i++) {
      const p = pickNextPosition(pool, tuning.game.mixAt + 2, idx, null);
      expect(p.tier).toBe(2); // dropped from the 2–3 mix to tier 2 only
    }
    for (let i = 0; i < 50; i++) {
      const p = pickNextPosition(pool, tuning.game.heatAt, idx, null);
      expect(p.tier).toBe(1); // dropped from the 1–2 mix to tier 1 only
    }
  });

  it('is deterministic under an injected rng', () => {
    const a = pickNextPosition(pool, 0, 1, null, seq(0.1));
    const b = pickNextPosition(pool, 0, 1, null, seq(0.1));
    expect(a.id).toBe(b.id);
  });
});
