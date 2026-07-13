import * as THREE from 'three';
import { tuning } from '../config/tuning';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Release angular velocity: auto-backspin about the lateral axis (d̂ × ŷ is
 * the axis whose positive rotation moves the top of the ball backward),
 * scaled to shot power, plus sidespin about the vertical axis from gesture
 * curvature (−1..1).
 */
export function releaseAngularVelocity(
  shotDir: THREE.Vector3,
  power: number,
  sidespin = 0,
): THREE.Vector3 {
  const horizontal = new THREE.Vector3(shotDir.x, 0, shotDir.z).normalize();
  const lateral = horizontal.clone().cross(UP); // d̂ × ŷ
  const backspin = lateral.multiplyScalar(2 * Math.PI * tuning.spin.backspinHz * power);
  const side = UP.clone().multiplyScalar(2 * Math.PI * tuning.spin.sidespinMaxHz * sidespin);
  return backspin.add(side);
}

/**
 * Optional per-step Magnus force F = k·(ω × v). Rapier forces PERSIST across
 * steps, so the caller must resetForces() first — this helper does both.
 */
export function applyMagnus(body: {
  resetForces(wakeUp: boolean): void;
  addForce(force: { x: number; y: number; z: number }, wakeUp: boolean): void;
  angvel(): { x: number; y: number; z: number };
  linvel(): { x: number; y: number; z: number };
}): void {
  body.resetForces(true);
  const k = tuning.spin.magnusK;
  if (k <= 0) return;
  const w = body.angvel();
  const v = body.linvel();
  body.addForce(
    {
      x: k * (w.y * v.z - w.z * v.y),
      y: k * (w.z * v.x - w.x * v.z),
      z: k * (w.x * v.y - w.y * v.x),
    },
    true,
  );
}
