import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { aimShot, classifyShot } from './aim';
import { tuning } from '../config/tuning';
import type { Gesture } from '../input/swipe';

const LAUNCH = new THREE.Vector3(0, 2, -8.5);
const RIM = new THREE.Vector3(0, 3.048, -12.7);

function gesture(over: Partial<Gesture> = {}): Gesture {
  return {
    azimuth: 0,
    upSpeed: tuning.input.referenceFlickSpeed,
    curvature: 0,
    samples: [],
    ...over,
  };
}

describe('assisted aim mapping', () => {
  it('a reference-speed straight swipe reproduces the solved shot exactly', () => {
    const shot = aimShot(LAUNCH, RIM, gesture());
    expect(shot.power).toBeCloseTo(1, 10);
    expect(shot.lateralError).toBeCloseTo(0, 10);
    expect(shot.velocity.distanceTo(shot.solution.v0)).toBeLessThan(1e-9);
  });

  it('clamps power into the tuned window however hard the flick', () => {
    const soft = aimShot(LAUNCH, RIM, gesture({ upSpeed: 0.01 }));
    const hard = aimShot(LAUNCH, RIM, gesture({ upSpeed: 50 }));
    expect(soft.power).toBe(tuning.input.powerMin);
    expect(hard.power).toBe(tuning.input.powerMax);
  });

  it('clamps lateral error however sideways the swipe', () => {
    const left = aimShot(LAUNCH, RIM, gesture({ azimuth: -2 }));
    const right = aimShot(LAUNCH, RIM, gesture({ azimuth: 2 }));
    expect(left.lateralError).toBe(-tuning.input.lateralMax);
    expect(right.lateralError).toBe(tuning.input.lateralMax);
    expect(left.velocity.length()).toBeCloseTo(left.solution.speed, 6);
  });

  it('lateral error changes direction, not speed', () => {
    const shot = aimShot(LAUNCH, RIM, gesture({ azimuth: 0.2 }));
    expect(shot.velocity.length()).toBeCloseTo(shot.solution.speed * shot.power, 9);
    expect(shot.velocity.x).not.toBeCloseTo(0, 4);
  });

  it('powerSensitivity 0 gives Messenger-style full normalization', () => {
    const prev = tuning.input.powerSensitivity;
    tuning.input.powerSensitivity = 0;
    try {
      const wild = aimShot(LAUNCH, RIM, gesture({ upSpeed: 3.4 }));
      expect(wild.power).toBeCloseTo(1, 10);
    } finally {
      tuning.input.powerSensitivity = prev;
    }
  });

  it('curvature maps to clamped sidespin', () => {
    const s = aimShot(LAUNCH, RIM, gesture({ curvature: tuning.spin.sidespinFullDeviation / 2 }));
    expect(s.sidespin).toBeCloseTo(0.5, 6);
    const capped = aimShot(LAUNCH, RIM, gesture({ curvature: 10 }));
    expect(capped.sidespin).toBe(1);
  });

  it('a lateral-mapping override bypasses the swipe assist (click-click aims 1:1)', () => {
    const az = 0.5; // past the swipe assist's clamp (0.5 × 0.35 > lateralMax)
    const assisted = aimShot(LAUNCH, RIM, gesture({ azimuth: az }));
    expect(assisted.lateralError).toBe(tuning.input.lateralMax);

    const direct = aimShot(LAUNCH, RIM, gesture({ azimuth: az }), {
      lateralGain: 1,
      lateralMax: tuning.clickclick.lateralMax,
    });
    expect(direct.lateralError).toBeCloseTo(az, 10);

    // The tuning.clickclick object itself satisfies the mapping shape.
    const viaTuning = aimShot(LAUNCH, RIM, gesture({ azimuth: az }), tuning.clickclick);
    expect(viaTuning.lateralError).toBeCloseTo(az * tuning.clickclick.lateralGain, 10);
  });

  it('classifies miss modes readably', () => {
    expect(classifyShot(aimShot(LAUNCH, RIM, gesture()))).toBe('PURE');
    expect(classifyShot(aimShot(LAUNCH, RIM, gesture({ upSpeed: 0.5 })))).toBe('SHORT');
    expect(classifyShot(aimShot(LAUNCH, RIM, gesture({ upSpeed: 5 })))).toBe('LONG');
    expect(classifyShot(aimShot(LAUNCH, RIM, gesture({ azimuth: 0.6 })))).toBe('RIGHT');
    expect(classifyShot(aimShot(LAUNCH, RIM, gesture({ azimuth: -0.6 })))).toBe('LEFT');
  });
});
