import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';

export interface ShotSolution {
  /** Release velocity vector (m/s). */
  v0: THREE.Vector3;
  speed: number;
  /** Launch angle above horizontal (rad). */
  launchAngle: number;
  /** Time of flight to the target (s). */
  flightTime: number;
  /** Horizontal unit vector launch → target. */
  dir: THREE.Vector3;
}

/**
 * Closed-form ballistic solve for a desired entry angle (the "45° solver").
 * Vertical-plane geometry through launch point P and target T:
 *   tan θ0 = 2h/d + tan θe
 *   vx     = sqrt( g·d / (tan θ0 + tan θe) )
 *   v0     = vx / cos θ0
 * where d = horizontal distance, h = y_T − y_P, θe = entry angle below
 * horizontal. Assumes pure parabola (no drag/Magnus) — which is why gameplay
 * keeps aero off; the solver must stay exact.
 */
export function solveShot(
  launch: THREE.Vector3,
  target: THREE.Vector3,
  entryAngleDeg: number = tuning.solver.entryAngleDeg,
  g: number = tuning.world.gravity,
): ShotSolution {
  const dx = target.x - launch.x;
  const dz = target.z - launch.z;
  const d = Math.hypot(dx, dz);
  const h = target.y - launch.y;
  const tanE = Math.tan((entryAngleDeg * Math.PI) / 180);

  const tan0 = (2 * h) / d + tanE;
  const vx = Math.sqrt((g * d) / (tan0 + tanE));
  const launchAngle = Math.atan(tan0);
  const speed = vx / Math.cos(launchAngle);
  const flightTime = d / vx;

  const dir = new THREE.Vector3(dx / d, 0, dz / d);
  const v0 = new THREE.Vector3(dir.x * vx, vx * tan0, dir.z * vx);
  return { v0, speed, launchAngle, flightTime, dir };
}

/**
 * The standard aim point: rim centre pushed toward the far rim (Noah's
 * 11-inch depth ≈ rim centre + 5 cm along the shot direction).
 */
export function shotTarget(launch: THREE.Vector3, rimCenter: THREE.Vector3): THREE.Vector3 {
  const toRim = new THREE.Vector3(rimCenter.x - launch.x, 0, rimCenter.z - launch.z).normalize();
  return rimCenter.clone().addScaledVector(toRim, tuning.solver.targetDepthOffset);
}

/** Convenience: solve from launch to the tuned aim point above the rim. */
export function solveToRim(launch: THREE.Vector3, rimCenter: THREE.Vector3): ShotSolution {
  return solveShot(launch, shotTarget(launch, rimCenter));
}
