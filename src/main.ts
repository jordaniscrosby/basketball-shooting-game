import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { tuning } from './config/tuning';
import { getPositions, launchPointFor, type ShotPosition } from './config/positions';
import { FixedLoop } from './core/loop';
import { GameRun } from './core/state';
import { createScene } from './scene/scene';
import { createCourt } from './scene/court';
import { createBallMesh } from './scene/ballVisual';
import { CameraRig } from './scene/cameraRig';
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
import { pickNextPosition } from './systems/scheduler';
import { SwipeInput, type Gesture } from './input/swipe';
import { Hud, loadBest, saveBest } from './ui/hud';
import { PhysicsDebugRenderer } from './debug/physicsDebug';
import { SwipeOverlay } from './debug/swipeOverlay';
import { createDebugPanel } from './debug/panel';

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
  const rig = new CameraRig(camera, hoop.rimCenter);
  const run = new GameRun(loadBest());
  const hud = new Hud(() => retry());

  let currentPos: ShotPosition = pickNextPosition(positions, 0, 0, null);
  let flightTimer = 0;

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

  function flyToNext(): void {
    currentPos = pickNextPosition(positions, run.makes, run.shotIndex, currentPos);
    holdBallAt(currentPos);
    rig.flyTo(currentPos, () => run.beginAiming());
  }

  function retry(): void {
    run.retry();
    hud.hideScoreScreen();
    hud.setScore(0);
    hud.setHeat('cold');
    currentPos = pickNextPosition(positions, 0, 0, currentPos);
    holdBallAt(currentPos);
    rig.snapTo(currentPos);
    run.beginAiming();
  }

  function fireShot(g: Gesture): void {
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
    run.release();
    flightTimer = 0;
    rig.startReleasePush();
    if (tuning.debug.shotLog) {
      console.log(
        `[shot] ${currentPos.id} ${classifyShot(shot)} power=${shot.power.toFixed(3)} ` +
          `lat=${((shot.lateralError * 180) / Math.PI).toFixed(2)}°`,
      );
    }
  }

  new SwipeInput(canvas, {
    onMove: (samples) => {
      if (run.phase === 'aiming') overlay.showLive(samples);
    },
    onGesture: (g) => {
      if (run.phase === 'aiming') fireShot(g);
    },
  });

  function resolveShot(result: 'swish' | 'make' | 'miss'): void {
    if (run.phase !== 'flight') return;
    const out = run.resolve(result);
    if (tuning.debug.shotLog) console.log(`[result] ${result}`);
    if (out.gameOver) {
      saveBest(run.best);
      setTimeout(() => hud.showScoreScreen(run.score, run.best, run.isNewBest), 700);
      return;
    }
    hud.setScore(run.score, true);
    hud.setHeat(run.heat);
    hud.floatAtHoop(
      result === 'swish' ? `SWISH +${out.points}` : `+${out.points}`,
      result === 'swish',
      hoop.rimCenter,
      camera,
    );
    setTimeout(() => {
      run.nextShot();
      flyToNext();
    }, 550);
  }

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
      if (!replay.hasShot || run.phase !== 'aiming') return;
      ball.tracked.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      scoring.reset();
      replay.fire(ball);
      run.release();
      flightTimer = 0;
      rig.startReleasePush();
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

  const loop = new FixedLoop({
    update: (dt) => {
      physics.world.gravity = { x: 0, y: -tuning.world.gravity, z: 0 };
      if (run.phase === 'flight') applyMagnus(ball.tracked.body);
      physics.world.step(physics.events);
      physics.events.drainCollisionEvents((h1, h2, started) => {
        if (started && (rimHandles.has(h1) || rimHandles.has(h2))) scoring.markRimContact();
      });
      snapshotBody(ball.tracked);

      if (run.phase === 'flight') {
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
        else if (p.y < tuning.ball.radius * 1.2 || flightTimer > 6) resolveShot('miss');
      }
    },
    render: (alpha, frameDt) => {
      applyInterpolated(ball.tracked, ballMesh, alpha);
      rig.update(frameDt);
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

  // Spawn: hold at the first position, snap the camera, start aiming.
  holdBallAt(currentPos);
  rig.snapTo(currentPos);
  run.beginAiming();
  hud.setScore(0);
  loop.start();
}

void boot();
