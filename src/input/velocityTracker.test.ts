import { describe, it, expect } from 'vitest';
import { estimateVelocity, windowSamples, type PointerSample } from './velocityTracker';
import { tuning } from '../config/tuning';

function track(fn: (tMs: number) => { x: number; y: number }, dtMs = 8, count = 15): PointerSample[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i * dtMs;
    return { ...fn(t), t };
  });
}

describe('Lsq2 velocity estimator', () => {
  it('recovers constant velocity exactly', () => {
    // 1.2 viewport-fractions/s upward (screen y decreasing).
    const s = track((t) => ({ x: 0.5, y: 0.9 - (1.2 * t) / 1000 }));
    const v = estimateVelocity(s);
    expect(v.vx).toBeCloseTo(0, 6);
    expect(v.vy).toBeCloseTo(-1.2, 6);
  });

  it('reports the release-instant velocity of an accelerating flick', () => {
    // y(t) = y0 − a·t² → vy(T) = −2aT. Linear fit would underestimate.
    const a = 40; // fractions/s²
    const T = 14 * 8; // ms of gesture
    const s = track((t) => ({ x: 0.5, y: 0.9 - a * (t / 1000) ** 2 }));
    const v = estimateVelocity(s);
    expect(v.vy).toBeCloseTo(-2 * a * (T / 1000), 4);
  });

  it('windows to the recent tail only', () => {
    const stale: PointerSample[] = [{ x: 0, y: 0, t: 0 }];
    const recent = track((t) => ({ x: 0.5 + t / 1000, y: 0.5 }), 10, 5).map((s) => ({
      ...s,
      t: s.t + 500,
    }));
    const w = windowSamples([...stale, ...recent]);
    expect(w).toHaveLength(5);
    expect(w[0]!.t).toBe(500);
  });

  it('caps the window at estimatorMaxSamples', () => {
    const s = track((t) => ({ x: 0.5, y: 0.5 }), 4, 30);
    expect(windowSamples(s).length).toBeLessThanOrEqual(tuning.input.estimatorMaxSamples);
  });

  it('handles degenerate input without NaN', () => {
    expect(estimateVelocity([])).toEqual({ vx: 0, vy: 0 });
    expect(estimateVelocity([{ x: 0.5, y: 0.5, t: 10 }])).toEqual({ vx: 0, vy: 0 });
    const same = [
      { x: 0.5, y: 0.5, t: 10 },
      { x: 0.5, y: 0.5, t: 10 },
      { x: 0.5, y: 0.5, t: 10 },
    ];
    const v = estimateVelocity(same);
    expect(Number.isFinite(v.vx)).toBe(true);
    expect(Number.isFinite(v.vy)).toBe(true);
  });
});
