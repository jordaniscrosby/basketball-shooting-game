import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { solveToRim, type ShotSolution } from './shotSolver';
import { releaseAngularVelocity } from './spin';
import type { Gesture } from '../input/swipe';

export interface AimedShot {
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  /** Power multiplier actually applied (1 = solved-perfect). */
  power: number;
  /** Lateral angle error applied (rad, positive = pushed right of target). */
  lateralError: number;
  /** Normalized sidespin −1..1. */
  sidespin: number;
  solution: ShotSolution;
}

/** Per-scheme override of the lateral assist (click-click aims 1:1). */
export interface LateralMapping {
  /** Gesture azimuth (rad) → lateral aim error gain (rad/rad). */
  lateralGain: number;
  /** Max lateral angle error (rad). */
  lateralMax: number;
}

/**
 * Assisted mapping — the core design. Per shot we solve the perfect ballistic
 * arc to the rim, then let the gesture PERTURB that solution:
 *   - swipe azimuth → lateral angle error (clamped),
 *   - flick speed vs the reference → power multiplier (clamped 0.85–1.15,
 *     eased by powerSensitivity; 0 = Messenger-style full normalization),
 *   - chord curvature → sidespin.
 * Difficulty tunes tolerance, never input feel. `lateral` defaults to the
 * swipe assist (tuning.input); click-click passes its own 1:1 mapping — its
 * arrow is an explicit aim, not a flick to be forgiven.
 */
export function aimShot(
  launch: THREE.Vector3,
  rimCenter: THREE.Vector3,
  gesture: Gesture,
  lateral: LateralMapping = tuning.input,
): AimedShot {
  const inp = tuning.input;
  const solution = solveToRim(launch, rimCenter);

  const lateralError = THREE.MathUtils.clamp(
    gesture.azimuth * lateral.lateralGain,
    -lateral.lateralMax,
    lateral.lateralMax,
  );

  const speedRatio = gesture.upSpeed / inp.referenceFlickSpeed;
  const power = THREE.MathUtils.clamp(
    1 + inp.powerSensitivity * (speedRatio - 1),
    inp.powerMin,
    inp.powerMax,
  );

  const sidespin = THREE.MathUtils.clamp(
    gesture.curvature / tuning.spin.sidespinFullDeviation,
    -1,
    1,
  );

  // Rotate the solved velocity about +Y: positive lateral error pushes the
  // shot to the shooter's right of the target line.
  const velocity = solution.v0
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), -lateralError)
    .multiplyScalar(power);

  const angularVelocity = releaseAngularVelocity(solution.dir, power, sidespin);

  return { velocity, angularVelocity, power, lateralError, sidespin, solution };
}

export type MissMode = 'PURE' | 'SHORT' | 'LONG' | 'LEFT' | 'RIGHT';

/** Human-readable dominant miss cause for the debug log. */
export function classifyShot(shot: AimedShot): MissMode {
  const powerDev = shot.power - 1;
  const latDeg = (shot.lateralError * 180) / Math.PI;
  if (Math.abs(powerDev) < 0.02 && Math.abs(latDeg) < 1) return 'PURE';
  if (Math.abs(powerDev) * 100 >= Math.abs(latDeg)) return powerDev < 0 ? 'SHORT' : 'LONG';
  return latDeg < 0 ? 'LEFT' : 'RIGHT';
}
