import * as THREE from 'three';
import { tuning, derived } from './tuning';

export interface ShotPosition {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  /** Floor position (x, z) where the shooter stands. */
  x: number;
  z: number;
  /** Court octant (0–7 by angle around the hoop) for anti-repeat shuffling. */
  octant: number;
}

/**
 * Hand-placed tiered position pool (Around-the-World template). z values are
 * offsets from the rim centre toward mid-court; every position is validated
 * makeable by the shot battery test.
 */
export function getPositions(): ShotPosition[] {
  const rimZ = derived.rimCenterZ;
  const raw: Array<[string, string, 1 | 2 | 3, number, number]> = [
    // Tier 1 — the comfort zone
    ['ft', 'Free throw', 1, 0, 4.19],
    ['elbow-l', 'Left elbow', 1, -2.44, 4.19],
    ['elbow-r', 'Right elbow', 1, 2.44, 4.19],
    ['base-l', 'Left short baseline', 1, -3.0, 0.9],
    ['base-r', 'Right short baseline', 1, 3.0, 0.9],
    // Tier 2 — mid-range and the top
    ['wing-l', 'Left wing', 2, -3.9, 3.9],
    ['wing-r', 'Right wing', 2, 3.9, 3.9],
    ['key-top', 'Top of the key', 2, 0, 5.8],
    ['mid-l', 'Left mid baseline', 2, -4.6, 1.6],
    ['mid-r', 'Right mid baseline', 2, 4.6, 1.6],
    // Tier 3 — behind the arc
    ['corner3-l', 'Left corner 3', 3, -6.6, 1.5],
    ['corner3-r', 'Right corner 3', 3, 6.6, 1.5],
    ['arc3-l', 'Left arc 3', 3, -5.3, 5.3],
    ['arc3-r', 'Right arc 3', 3, 5.3, 5.3],
    ['deep3', 'Deep top 3', 3, 0, 7.9],
  ];
  return raw.map(([id, name, tier, x, dz]) => ({
    id,
    name,
    tier,
    x,
    z: rimZ + dz,
    octant: octantOf(x, dz),
  }));
}

function octantOf(x: number, dz: number): number {
  const a = Math.atan2(x, dz); // 0 = straight on, ± toward baselines
  return Math.min(7, Math.max(0, Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8)));
}

/** Ball launch point when shooting from a position. */
export function launchPointFor(pos: ShotPosition): THREE.Vector3 {
  return new THREE.Vector3(pos.x, tuning.game.releaseHeight, pos.z);
}
