import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { tuning } from './config/tuning';
import { getPositions, launchPointFor, type ShotPosition } from './config/positions';
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
import { aimShot, classifyShot } from './systems/aim';
import { applyMagnus } from './systems/spin';
import { ShotReplay } from './systems/shotReplay';
import { runShotBattery } from './systems/shotBattery';
import { SwipeInput } from './input/swipe';
import { PhysicsDebugRenderer } from './debug/physicsDebug';
import { SwipeOverlay } from './debug/swipeOverlay';
import { createDebugPanel } from './debug/panel';

type Phase = 'aiming' | 'flight' | 'resolved';

async function boot(): Promise<void> {
  await initRapier();

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const { scene, camera, renderer } = createScene(canvas);
  const physics = createPhysicsWorld();
  const debugRenderer = new PhysicsDebugRenderer(scene);
  const overlay = new SwipeOverlay(document.getElementById('swipe-overlay') as HTMLCanvasElement);
  createCourt(scene);
  let hoop = createHoop(physics.world);
  let rimHandles = new Set(hoop.rimColliders.map((c) => c.handle));

  const positions = getPositions();
  const ball = createBall(physics.world, launchPointFor(positions[0]!));
  const ballMesh = createBallMesh();
  scene.add(ballMesh);

  const scoring = new ScoringTracker();
  const replay = new ShotReplay();

  let phase: Phase = 'aiming';
  let currentPos: ShotPosition = positions[0]!;
  let flightTimer = 0;
  let score = 0;
  const streakEl = document.getElementById('streak-counter')!;

  function holdBallAt(pos: ShotPosition): void {
    const launch = launchPointFor(pos);
    const body = ball.tracked.body;
    body.setBodyType(RAPIER.RigidBodyType.Fixed, true);
    body.setTranslation({ x: launch.x, y: launch.y, z: launch.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    resetTracking(ball.tracked);
    scoring.reset();
  }

  function placeCamera(pos: ShotPosition): void {
    const launch = launchPointFor(pos);
    const toHoop = new THREE.Vector3().subVectors(hoop.rimCenter, launch).setY(0).normalize();
    camera.position
      .copy(launch)
      .addScaledVector(toHoop, -tuning.camera.back)
      .setY(launch.y + tuning.camera.up - tuning.game.releaseHeight + 1.6);
    camera.lookAt(hoop.rimCenter.x, hoop.rimCenter.y + 0.15, hoop.rimCenter.z);
  }

  function goToPosition(pos: ShotPosition): void {
    currentPos = pos;
    holdBallAt(pos);
    placeCamera(pos);
    phase = 'aiming';
  }

  function nextPosition(): void {
    let next = currentPos;
    while (next === currentPos) next = positions[Math.floor(Math.random() * positions.length)]!;
    goToPosition(next);
  }

  const swipe = new SwipeInput(canvas, {
    onMove: (samples) => overlay.showLive(samples),
    onGesture: (g) => {
      if (phase !== 'aiming') return;
      const launch = launchPointFor(currentPos);
      const shot = aimShot(launch, hoop.rimCenter, g);
      const body = ball.tracked.body;
      body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      body.setLinvel({ x: shot.velocity.x, y: shot.velocity.y, z: shot.velocity.z }, true);
      body.setAngvel(
        { x: shot.angularVelocity.x, y: shot.angularVelocity.y, z: shot.angularVelocity.z },
        true,
      );
      replay.record(launch, shot.velocity, shot.angularVelocity);
      overlay.showRelease(shot, launch, g.samples);
      phase = 'flight';
      flightTimer = 0;
      if (tuning.debug.shotLog) {
        console.log(
          `[shot] ${currentPos.id} ${classifyShot(shot)} power=${shot.power.toFixed(3)} ` +
            `lat=${((shot.lateralError * 180) / Math.PI).toFixed(2)}° ` +
            `spin=${shot.sidespin.toFixed(2)} v0=${shot.velocity.length().toFixed(2)}m/s`,
        );
      }
    },
  });
  void swipe;

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
      if (!replay.hasShot) return;
      ball.tracked.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      scoring.reset();
      replay.fire(ball);
      phase = 'flight';
      flightTimer = 0;
    },
    runBattery: () => {
      void runShotBattery().then((r) => {
        console.table(r.shots);
        console.log(`battery: ${r.makes}/${r.total} (${(r.makeRate * 100).toFixed(1)}%)`);
      });
    },
  });

  const fpsEl = document.getElementById('fps')!;
  let fpsTimer = 0;

  function resolveShot(result: 'swish' | 'make' | 'miss'): void {
    if (phase !== 'flight') return;
    phase = 'resolved';
    if (result !== 'miss') {
      score += result === 'swish' ? tuning.game.pointsSwish : tuning.game.pointsMake;
      streakEl.textContent = String(score);
    }
    if (tuning.debug.shotLog) console.log(`[result] ${result}`);
    setTimeout(() => nextPosition(), 650);
  }

  const loop = new FixedLoop({
    update: (dt) => {
      physics.world.gravity = { x: 0, y: -tuning.world.gravity, z: 0 };
      if (phase === 'flight') applyMagnus(ball.tracked.body);
      physics.world.step(physics.events);
      physics.events.drainCollisionEvents((h1, h2, started) => {
        if (started && (rimHandles.has(h1) || rimHandles.has(h2))) scoring.markRimContact();
      });
      snapshotBody(ball.tracked);

      if (phase === 'flight') {
        flightTimer += dt;
        const p = ball.tracked.body.translation();
        const v = ball.tracked.body.linvel();
        const ev = scoring.update(
          { x: p.x, y: p.y, z: p.z, velY: v.y },
          hoop.rimCenter.x,
          hoop.rimCenter.y,
          hoop.rimCenter.z,
        );
        if (ev) resolveShot(ev);
        else if (flightTimer > 6) resolveShot('miss');
        else if (
          flightTimer > 1 &&
          p.y < tuning.ball.radius * 1.6 &&
          Math.abs(v.y) < 0.4 &&
          Math.hypot(v.x, v.z) < 2
        ) {
          resolveShot('miss');
        }
      }
    },
    render: (alpha, frameDt) => {
      applyInterpolated(ball.tracked, ballMesh, alpha);
      debugRenderer.update(physics.world);
      overlay.render(frameDt, camera);
      fpsTimer += frameDt;
      if (fpsTimer > 0.5) {
        fpsTimer = 0;
        fpsEl.textContent = `${loop.smoothedFps.toFixed(0)} fps`;
      }
      renderer.render(scene, camera);
    },
  });

  goToPosition(positions[0]!);
  loop.start();
}

void boot();
