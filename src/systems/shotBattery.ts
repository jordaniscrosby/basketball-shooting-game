import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { initRapier, createPhysicsWorld, createBall } from '../physics/world';
import { createHoop } from '../physics/hoop';
import { ScoringTracker } from './scoring';
import { solveToRim } from './shotSolver';
import { releaseAngularVelocity } from './spin';
import { getPositions, launchPointFor, type ShotPosition } from '../config/positions';

export interface BatteryShotResult {
  id: string;
  name: string;
  tier: number;
  result: 'swish' | 'make' | 'miss';
  flightTime: number;
}

export interface BatteryResult {
  shots: BatteryShotResult[];
  makes: number;
  total: number;
  makeRate: number;
}

/**
 * Physics regression harness: fire a solved "perfect" shot from every curated
 * position in a fresh headless world and verify it scores. Runs identically
 * under vitest (node) and from the debug panel in the browser. Any tuning
 * change that breaks ≥99% here is a regression.
 */
export async function runShotBattery(
  positions: ShotPosition[] = getPositions(),
): Promise<BatteryResult> {
  await initRapier();
  const physics = createPhysicsWorld();
  const hoop = createHoop(physics.world);
  const rim = hoop.rimCenter;

  const shots: BatteryShotResult[] = [];
  const h = 1 / tuning.world.stepHz;

  for (const pos of positions) {
    const launch = launchPointFor(pos);
    const sol = solveToRim(launch, rim);
    const ball = createBall(physics.world, launch);
    const spin = releaseAngularVelocity(sol.dir, 1);
    ball.tracked.body.setLinvel({ x: sol.v0.x, y: sol.v0.y, z: sol.v0.z }, true);
    ball.tracked.body.setAngvel({ x: spin.x, y: spin.y, z: spin.z }, true);

    const tracker = new ScoringTracker();
    const rimHandles = new Set(hoop.rimColliders.map((c) => c.handle));
    let result: BatteryShotResult['result'] = 'miss';
    const maxSteps = Math.ceil((sol.flightTime + 3) / h);
    for (let i = 0; i < maxSteps; i++) {
      physics.world.step(physics.events);
      physics.events.drainCollisionEvents((h1, h2, started) => {
        if (started && (rimHandles.has(h1) || rimHandles.has(h2))) tracker.markRimContact();
      });
      const p = ball.tracked.body.translation();
      const v = ball.tracked.body.linvel();
      const ev = tracker.update({ x: p.x, y: p.y, z: p.z, velY: v.y }, rim.x, rim.y, rim.z);
      if (ev) {
        result = ev;
        break;
      }
      if (p.y < tuning.ball.radius * 1.5 && v.y < 0.5 && i * h > sol.flightTime) break; // dead on floor
    }
    shots.push({ id: pos.id, name: pos.name, tier: pos.tier, result, flightTime: sol.flightTime });
    physics.world.removeRigidBody(ball.tracked.body);
  }

  const makes = shots.filter((s) => s.result !== 'miss').length;
  return { shots, makes, total: shots.length, makeRate: makes / shots.length };
}
