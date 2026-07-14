import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { clickAzimuth, meterUpSpeed, meterValueAt } from './clickclick';

const cc = tuning.clickclick;
const inp = tuning.input;

describe('meterValueAt', () => {
  it('is a triangle wave: 0 → 1 → 0 over one full cycle', () => {
    const T = 1 / cc.meterSpeed; // seconds for a full 0→1 traversal
    expect(meterValueAt(0)).toBe(0);
    expect(meterValueAt(T / 2)).toBeCloseTo(0.5, 10);
    expect(meterValueAt(T)).toBeCloseTo(1, 10);
    expect(meterValueAt(1.5 * T)).toBeCloseTo(0.5, 10);
    expect(meterValueAt(2 * T)).toBeCloseTo(0, 10);
  });

  it('is periodic and stays inside [0, 1]', () => {
    const T = 1 / cc.meterSpeed;
    for (let i = 0; i <= 100; i++) {
      const t = i * 0.173;
      const v = meterValueAt(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(meterValueAt(t + 2 * T)).toBeCloseTo(v, 10);
    }
  });

  it('clamps negative elapsed time to the start', () => {
    expect(meterValueAt(-1)).toBe(0);
  });

  it('respects an explicit speed argument', () => {
    expect(meterValueAt(0.5, 1)).toBeCloseTo(0.5, 10);
    expect(meterValueAt(0.5, 2)).toBeCloseTo(1, 10);
  });
});

describe('meterUpSpeed', () => {
  it('maps the sweet spot exactly to the reference flick speed (perfect power)', () => {
    expect(meterUpSpeed(cc.sweetFrac)).toBeCloseTo(inp.referenceFlickSpeed, 10);
  });

  it('swings by powerSpan around the sweet spot', () => {
    expect(meterUpSpeed(1)).toBeCloseTo(
      inp.referenceFlickSpeed * (1 + (1 - cc.sweetFrac) * cc.powerSpan),
      10,
    );
    expect(meterUpSpeed(0)).toBeCloseTo(
      inp.referenceFlickSpeed * (1 - cc.sweetFrac * cc.powerSpan),
      10,
    );
  });

  it('is monotonically increasing in meter fill', () => {
    let prev = -Infinity;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const v = meterUpSpeed(f);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe('clickAzimuth', () => {
  const ball = { x: 0.5, y: 0.9 };

  it('clicking straight above the ball aims straight (azimuth 0)', () => {
    expect(clickAzimuth(ball, { x: 0.5, y: 0.3 })).toBeCloseTo(0, 10);
  });

  it('clicking right of vertical is a positive azimuth, left is negative', () => {
    expect(clickAzimuth(ball, { x: 0.7, y: 0.3 })).toBeGreaterThan(0);
    expect(clickAzimuth(ball, { x: 0.3, y: 0.3 })).toBeLessThan(0);
  });

  it('matches the swipe convention: angle off screen-vertical toward the click', () => {
    // 45° up-and-right of the ball.
    expect(clickAzimuth(ball, { x: 0.6, y: 0.8 })).toBeCloseTo(Math.PI / 4, 10);
  });
});
