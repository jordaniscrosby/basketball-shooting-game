import { describe, expect, it } from 'vitest';
import { tuning } from '../config/tuning';
import { pullAim } from './slingshot';

// pullAim is shared by the release path AND the aim-time trajectory preview —
// these pin the mapping both depend on.
describe('pullAim', () => {
  it('straight-down pull aims straight (azimuth 0)', () => {
    const a = pullAim({ dx: 0, dy: 0.1, len: 0.1 });
    expect(a.azimuth).toBeCloseTo(0, 12);
  });

  it('reference pull length maps exactly to the reference flick speed', () => {
    const len = tuning.slingshot.referenceDragFrac;
    const a = pullAim({ dx: 0, dy: len, len });
    expect(a.upSpeed).toBeCloseTo(tuning.input.referenceFlickSpeed, 10);
  });

  it('upSpeed scales linearly with pull length', () => {
    const len = tuning.slingshot.referenceDragFrac * 1.5;
    const a = pullAim({ dx: 0, dy: len, len });
    expect(a.upSpeed).toBeCloseTo(tuning.input.referenceFlickSpeed * 1.5, 10);
  });

  it('pulling down-left fires right (positive azimuth), opposite the pull', () => {
    const left = pullAim({ dx: -0.05, dy: 0.08, len: Math.hypot(0.05, 0.08) });
    expect(left.azimuth).toBeGreaterThan(0);
    const right = pullAim({ dx: 0.05, dy: 0.08, len: Math.hypot(0.05, 0.08) });
    expect(right.azimuth).toBeCloseTo(-left.azimuth, 10);
  });
});
