import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { solveShot } from './shotSolver';

describe('shotSolver', () => {
  it('reproduces the free-throw sanity numbers (7.31 m/s, 1.04 s, 56.3°)', () => {
    // FT: release at 2.0 m, horizontal d = 4.19 m, rim at 3.048 m, 45° entry.
    const launch = new THREE.Vector3(0, 2.0, 0);
    const target = new THREE.Vector3(0, 3.048, -4.19);
    const sol = solveShot(launch, target, 45, 9.81);
    expect(sol.speed).toBeCloseTo(7.31, 1);
    expect(sol.flightTime).toBeCloseTo(1.04, 1);
    expect((sol.launchAngle * 180) / Math.PI).toBeCloseTo(56.3, 0);
  });

  it('lands the parabola exactly on the target', () => {
    const launch = new THREE.Vector3(2, 1.8, 5);
    const target = new THREE.Vector3(0, 3.048, -12.7);
    const g = 9.81;
    const sol = solveShot(launch, target, 45, g);
    const t = sol.flightTime;
    const end = new THREE.Vector3(
      launch.x + sol.v0.x * t,
      launch.y + sol.v0.y * t - 0.5 * g * t * t,
      launch.z + sol.v0.z * t,
    );
    expect(end.distanceTo(target)).toBeLessThan(1e-9);
  });

  it('arrives at the requested entry angle', () => {
    const launch = new THREE.Vector3(0, 2, 0);
    const target = new THREE.Vector3(0, 3.048, -6.7);
    const g = 9.81;
    const sol = solveShot(launch, target, 45, g);
    const t = sol.flightTime;
    const vy = sol.v0.y - g * t;
    const vh = Math.hypot(sol.v0.x, sol.v0.z);
    const entry = (Math.atan2(-vy, vh) * 180) / Math.PI;
    expect(entry).toBeCloseTo(45, 5);
  });

  it('steeper entry angle demands more speed', () => {
    const launch = new THREE.Vector3(0, 2, 0);
    const target = new THREE.Vector3(0, 3.048, -4.19);
    const s45 = solveShot(launch, target, 45, 9.81);
    const s55 = solveShot(launch, target, 55, 9.81);
    expect(s55.speed).toBeGreaterThan(s45.speed);
  });
});
