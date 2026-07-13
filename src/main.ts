import * as THREE from 'three';
import { tuning } from './config/tuning';
import { getPositions, launchPointFor } from './config/positions';
import { FixedLoop } from './core/loop';
import { createScene } from './scene/scene';
import { createCourt } from './scene/court';
import { createBallMesh } from './scene/ballVisual';
import {
  initRapier,
  createPhysicsWorld,
  createBall,
  snapshotBody,
  applyInterpolated,
  resetTracking,
} from './physics/world';
import { createHoop, applyHoopMaterials } from './physics/hoop';
import { ScoringTracker } from './systems/scoring';
import { solveToRim } from './systems/shotSolver';
import { releaseAngularVelocity, applyMagnus } from './systems/spin';
import { ShotReplay } from './systems/shotReplay';
import { runShotBattery } from './systems/shotBattery';
import { PhysicsDebugRenderer } from './debug/physicsDebug';
import { createDebugPanel } from './debug/panel';

async function boot(): Promise<void> {
  await initRapier();

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const { scene, camera, renderer } = createScene(canvas);
  const physics = createPhysicsWorld();
  const debugRenderer = new PhysicsDebugRenderer(scene);
  createCourt(scene);
  let hoop = createHoop(physics.world);
  let rimHandles = new Set(hoop.rimColliders.map((c) => c.handle));

  const positions = getPositions();
  const startPos = positions[0]!;
  const ball = createBall(physics.world, launchPointFor(startPos));
  const ballMesh = createBallMesh();
  scene.add(ballMesh);

  camera.position.set(startPos.x, 1.9, startPos.z + 2.2);
  camera.lookAt(hoop.rimCenter.x, hoop.rimCenter.y, hoop.rimCenter.z);

  const scoring = new ScoringTracker();
  const replay = new ShotReplay();

  // Phase 1 test-fire: click = solved shot from a random position with a
  // little error injected, so rim/board bounces get exercised by hand.
  function testFire(): void {
    const pos = positions[Math.floor(Math.random() * positions.length)]!;
    const launch = launchPointFor(pos);
    const sol = solveToRim(launch, hoop.rimCenter);
    const jitter = 1 + (Math.random() - 0.5) * 0.06; // ±3% power
    const vel = sol.v0.clone().multiplyScalar(jitter);
    const spin = releaseAngularVelocity(sol.dir, 1);
    const body = ball.tracked.body;
    body.setTranslation({ x: launch.x, y: launch.y, z: launch.z }, true);
    body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
    body.setAngvel({ x: spin.x, y: spin.y, z: spin.z }, true);
    resetTracking(ball.tracked);
    scoring.reset();
    replay.record(launch, vel, spin);
    camera.position.set(pos.x, 1.9, pos.z + 2.2);
    camera.lookAt(hoop.rimCenter.x, hoop.rimCenter.y, hoop.rimCenter.z);
  }
  window.addEventListener('pointerdown', testFire);

  createDebugPanel({
    applyMaterials: () => {
      ball.collider.setRestitution(tuning.ball.restitution);
      ball.collider.setFriction(tuning.ball.friction);
      ball.tracked.body.setAngularDamping(tuning.ball.angularDamping);
      physics.floorCollider.setRestitution(tuning.floor.restitution);
      physics.floorCollider.setFriction(tuning.floor.friction);
      applyHoopMaterials(hoop);
    },
    rebuild: () => {
      hoop.dispose();
      hoop = createHoop(physics.world);
      rimHandles = new Set(hoop.rimColliders.map((c) => c.handle));
    },
    replayShot: () => {
      scoring.reset();
      replay.fire(ball);
    },
    runBattery: () => {
      void runShotBattery().then((r) => {
        console.table(r.shots);
        console.log(`battery: ${r.makes}/${r.total} (${(r.makeRate * 100).toFixed(1)}%)`);
      });
    },
  });

  const fpsEl = document.getElementById('fps')!;
  const streakEl = document.getElementById('streak-counter')!;
  let fpsTimer = 0;
  let score = 0;

  const loop = new FixedLoop({
    update: () => {
      physics.world.gravity = { x: 0, y: -tuning.world.gravity, z: 0 };
      applyMagnus(ball.tracked.body);
      physics.world.step(physics.events);
      physics.events.drainCollisionEvents((h1, h2, started) => {
        if (started && (rimHandles.has(h1) || rimHandles.has(h2))) scoring.markRimContact();
      });
      snapshotBody(ball.tracked);
      const p = ball.tracked.body.translation();
      const v = ball.tracked.body.linvel();
      const ev = scoring.update(
        { x: p.x, y: p.y, z: p.z, velY: v.y },
        hoop.rimCenter.x,
        hoop.rimCenter.y,
        hoop.rimCenter.z,
      );
      if (ev) {
        score += ev === 'swish' ? tuning.game.pointsSwish : tuning.game.pointsMake;
        streakEl.textContent = String(score);
        if (tuning.debug.shotLog) console.log(`scored: ${ev}`);
      }
    },
    render: (alpha, frameDt) => {
      applyInterpolated(ball.tracked, ballMesh, alpha);
      debugRenderer.update(physics.world);
      fpsTimer += frameDt;
      if (fpsTimer > 0.5) {
        fpsTimer = 0;
        fpsEl.textContent = `${loop.smoothedFps.toFixed(0)} fps`;
      }
      renderer.render(scene, camera);
    },
  });
  loop.start();
}

void boot();
