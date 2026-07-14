import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { createPhysicsWorld, createBall, type PhysicsWorld, type Ball } from '../physics/world';
import { createHoop, applyHoopMaterials, type Hoop } from '../physics/hoop';
import { applyFlightForces } from './spin';

/**
 * Ghost-world flight prediction. A private headless Rapier world built with
 * the exact same constructors as the live one (floor, rim capsules, board,
 * CCD ball — same creation order), stepped at the same fixed rate with the
 * same per-step forces (Magnus via applyFlightForces). Rapier's local
 * determinism therefore makes a predicted path the actual future of the real
 * shot — rim and backboard bounces included.
 *
 * The one thing it cannot know is mid-flight steering; the prediction is the
 * unsteered flight, same contract as curve.ts's fairness ghost.
 */
export class TrajectoryPredictor {
  private readonly physics: PhysicsWorld;
  private hoop: Hoop;
  private readonly ball: Ball;

  constructor() {
    this.physics = createPhysicsWorld();
    this.hoop = createHoop(this.physics.world);
    this.ball = createBall(this.physics.world, new THREE.Vector3(0, 1, 0));
  }

  /** Mirror a live hoop geometry rebuild (capsuleCount etc. — panel hook). */
  rebuildHoop(): void {
    this.hoop.dispose();
    this.hoop = createHoop(this.physics.world);
  }

  /** Mirror the live material/gravity dials — cheap, run before every predict. */
  private syncTuning(): void {
    this.physics.world.gravity = { x: 0, y: -tuning.world.gravity, z: 0 };
    this.ball.collider.setRestitution(tuning.ball.restitution);
    this.ball.collider.setFriction(tuning.ball.friction);
    this.ball.tracked.body.setAngularDamping(tuning.ball.angularDamping);
    this.physics.floorCollider.setRestitution(tuning.floor.restitution);
    this.physics.floorCollider.setFriction(tuning.floor.friction);
    applyHoopMaterials(this.hoop);
  }

  /**
   * Simulate a release and return the ball centre after each fixed step, up
   * to tuning.trajectory.horizonSec ahead — deliberately shorter than a full
   * flight (a guide, not a spoiler). Extra early-outs: a backboard touch
   * keeps only boardFollowSec more of the path (show the bank kiss, not the
   * rebound outcome), and the floor-height miss condition mirrors main.ts.
   */
  predict(
    launch: THREE.Vector3,
    velocity: THREE.Vector3,
    angularVelocity: THREE.Vector3,
  ): THREE.Vector3[] {
    this.syncTuning();
    const body = this.ball.tracked.body;
    body.setTranslation({ x: launch.x, y: launch.y, z: launch.z }, true);
    body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    body.setAngvel({ x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z }, true);
    body.resetForces(true);
    body.resetTorques(true);

    const t = tuning.trajectory;
    const followSteps = Math.max(0, Math.round(t.boardFollowSec * tuning.world.stepHz));
    let cutoff = Math.max(1, Math.round(t.horizonSec * tuning.world.stepHz));
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < cutoff; i++) {
      applyFlightForces(body);
      this.physics.world.step(this.physics.events);
      let boardHit = false;
      const boardHandle = this.hoop.boardCollider.handle;
      this.physics.events.drainCollisionEvents((h1, h2, started) => {
        if (started && (h1 === boardHandle || h2 === boardHandle)) boardHit = true;
      });
      if (boardHit) cutoff = Math.min(cutoff, i + 1 + followSteps);
      const p = body.translation();
      points.push(new THREE.Vector3(p.x, p.y, p.z));
      if (p.y < tuning.ball.radius * 1.2) break;
    }
    return points;
  }
}
