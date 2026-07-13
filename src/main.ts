import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { tuning } from './config/tuning';
import { artTheme } from './config/artTheme';
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
import { applyFlightForces } from './systems/spin';
import { FlightSteer, type CurveTelemetry } from './systems/curve';
import type { ScoreBreakdown } from './systems/scoreEngine';
import { ShotReplay } from './systems/shotReplay';
import { runShotBattery } from './systems/shotBattery';
import { pickNextPosition } from './systems/scheduler';
import { SwipeInput, type Gesture } from './input/swipe';
import { SlingshotInput } from './input/slingshot';
import { KeySteer } from './input/keySteer';
import { loadControlMode, saveControlMode, type ControlMode } from './input/controlMode';
import { Hud } from './ui/hud';
import { loadBestRun, loadLeaderboard, loadStats, saveStats, pushRun } from './ui/persist';
import { AudioBank } from './systems/audio';
import { VerletNet } from './net/verletNet';
import { BallTrail } from './scene/trail';
import { OutlineBoiler } from './scene/outlines';
import { BlobShadow } from './scene/blobShadow';
import { ComicFx } from './fx/comicFx';
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
  const court = createCourt(scene);
  let hoop = createHoop(physics.world);
  let rimHandles = new Set(hoop.rimColliders.map((c) => c.handle));

  const positions = getPositions();
  const ball = createBall(physics.world, launchPointFor(positions[0]!));
  // Ball hierarchy: root carries position, stretch node carries the
  // velocity-aligned squash & stretch (visual only — collider untouched),
  // the mesh inside carries the body's spin.
  const ballMesh = createBallMesh();
  const ballStretch = new THREE.Group();
  const ballRoot = new THREE.Group();
  ballStretch.add(ballMesh);
  ballRoot.add(ballStretch);
  scene.add(ballRoot);
  let squashPulse = 0;

  // Release smear: 2 ghost echoes for a few frames after launch.
  const smearMat = new THREE.MeshBasicMaterial({
    color: artTheme.palette.ball,
    transparent: true,
    opacity: 0.28,
  });
  const smears = [1, 2].map(() => {
    const m = new THREE.Mesh(ballMesh.geometry, smearMat);
    m.visible = false;
    scene.add(m);
    return m;
  });
  let smearTimer = 0;

  const fx = new ComicFx(document.getElementById('fx-overlay') as HTMLCanvasElement);
  let freezeTimer = 0;

  const scoring = new ScoringTracker();
  const replay = new ShotReplay();
  const steer = new FlightSteer();
  let lastCurve: CurveTelemetry | null = null;
  let steerVx = 0;
  let steerVy = 0;
  let steerLateralAccel = 0;
  let steerVisualAngle = 0;
  const rig = new CameraRig(camera, hoop.rimCenter);
  const run = new GameRun(loadBestRun());
  const stats = loadStats();
  stats.sessions++;
  saveStats(stats);
  let controlMode: ControlMode = loadControlMode();
  const hud = new Hud(
    () => toggleStats(),
    () => {
      controlMode = controlMode === 'swipe' ? 'slingshot' : 'swipe';
      saveControlMode(controlMode);
      hud.setControlMode(controlMode);
      overlay.clearSlingshot();
    },
  );
  hud.setControlMode(controlMode);
  const audio = new AudioBank();
  const net = new VerletNet(scene, hoop.rimCenter);
  const trail = new BallTrail(scene);
  const ballMat = ballMesh.material as THREE.MeshToonMaterial;
  let boardTouched = false;

  // Cartoon layer: ink outlines that boil, plus the boiling court/blob textures.
  const boiler = new OutlineBoiler();
  boiler.outline(ballMesh, artTheme.outline.ball);
  boiler.outline(court.rimMesh, artTheme.outline.rim);
  boiler.outline(court.backboardMesh, artTheme.outline.board);
  boiler.outline(court.poleMesh, artTheme.outline.pole);
  boiler.outline(court.armMesh, artTheme.outline.pole);
  for (const mesh of court.propMeshes) boiler.outline(mesh, artTheme.outline.prop);
  const blobShadow = new BlobShadow(scene);
  boiler.onCycle((f) => {
    court.applyBoilFrame(f);
    blobShadow.applyBoilFrame(f);
  });

  function applyHeatVisuals(): void {
    const heat = run.heat;
    trail.setHeat(heat);
    if (heat === 'superstar') {
      ballMat.emissiveIntensity = 0.7; // hue cycles per-frame — rainbow ball
    } else if (heat === 'fire') {
      ballMat.emissive.set(0xff4400);
      ballMat.emissiveIntensity = 0.55;
    } else if (heat === 'warm') {
      ballMat.emissive.set(0x662200);
      ballMat.emissiveIntensity = 0.3;
    } else {
      ballMat.emissive.set(0x000000);
      ballMat.emissiveIntensity = 0;
    }
    audio.setCrowdLevel(heat === 'superstar' ? 1 : heat === 'fire' ? 0.85 : heat === 'warm' ? 0.35 : 0);
    fx.setFocusLines(heat === 'fire' || heat === 'superstar');
  }

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
    boardTouched = false;
    steerVisualAngle = 0;
    squashPulse = 0;
    ballMesh.rotation.set(0, 0, 0);
    ballStretch.quaternion.identity();
    ballStretch.scale.setScalar(1);
  }

  function flyToNext(): void {
    currentPos = pickNextPosition(positions, run.streak, run.shotIndex, currentPos);
    holdBallAt(currentPos);
    rig.flyTo(currentPos, () => run.beginAiming());
  }

  /** Deliberate stats screen — the only route into/out of the gameover phase. */
  function toggleStats(): void {
    if (run.phase === 'aiming') {
      run.endSession();
      hud.showStatsScreen(run.bestRun, loadLeaderboard(), stats);
    } else if (run.phase === 'gameover') {
      run.retry();
      hud.hideStatsScreen();
      run.beginAiming();
    }
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
    steer.beginFlight(launch, shot.velocity);
    overlay.showRelease(shot, launch, g.samples);
    run.release();
    stats.attempts++;
    flightTimer = 0;
    rig.startReleasePush();
    trail.start();
    // Release smear: ghost echoes strung back along the launch direction.
    const dir = shot.velocity.clone().normalize();
    smears.forEach((m, i) => {
      m.position.copy(launch).addScaledVector(dir, -0.14 * (i + 1));
      m.visible = true;
    });
    smearTimer = artTheme.fx.smearSec;
    if (tuning.debug.shotLog) {
      console.log(
        `[shot] ${currentPos.id} ${classifyShot(shot)} power=${shot.power.toFixed(3)} ` +
          `lat=${((shot.lateralError * 180) / Math.PI).toFixed(2)}°`,
      );
    }
  }

  const ballScreenV = new THREE.Vector3();
  function ballScreenPos(): { x: number; y: number } {
    ballScreenV.copy(ballRoot.position).project(camera);
    return { x: ballScreenV.x * 0.5 + 0.5, y: -ballScreenV.y * 0.5 + 0.5 };
  }

  function endSteerDrag(): void {
    steer.clearCommand();
    steerVx = 0;
    steerVy = 0;
    trail.setSteering(false);
    overlay.clearSteerState();
  }

  // Touch scheme: flick swipe to shoot. Aim path gated by control mode; the
  // mid-flight steer drag stays live in both modes.
  new SwipeInput(canvas, {
    onMove: (samples) => {
      if (controlMode === 'swipe' && run.phase === 'aiming') overlay.showLive(samples);
    },
    onGesture: (g) => {
      if (controlMode === 'swipe' && run.phase === 'aiming') fireShot(g);
    },
    steerActive: () => tuning.curve.enabled && run.phase === 'flight',
    steerGrabCheck: (x, y) => {
      const b = ballScreenPos();
      const aspect = window.innerWidth / window.innerHeight;
      const d = Math.hypot((x - b.x) * aspect, y - b.y);
      return d <= tuning.curve.grabRadius;
    },
    onSteer: (vx, vy) => {
      steerVx = vx;
      steerVy = vy;
      steer.setCommand(vx, vy);
    },
    onSteerEnd: () => endSteerDrag(),
  });

  // Mouse scheme: slingshot pull-back on the ball; WASD steers the air.
  new SlingshotInput(canvas, {
    active: () => controlMode === 'slingshot' && run.phase === 'aiming',
    grabCheck: (x, y) => {
      const b = ballScreenPos();
      const aspect = window.innerWidth / window.innerHeight;
      const d = Math.hypot((x - b.x) * aspect, y - b.y);
      return d <= tuning.slingshot.grabRadius;
    },
    onDrag: (d) => overlay.showSlingshot(ballScreenPos(), d),
    onRelease: (g) => {
      overlay.clearSlingshot();
      fireShot(g);
    },
    onCancel: () => overlay.clearSlingshot(),
  });

  const keySteer = new KeySteer();
  let keySteerHeld = false;

  /** The annotated score receipt: base, each bonus, then the multiplied total. */
  function showScoreMath(bd: ScoreBreakdown): void {
    let delay = 130;
    let stack = 1; // stack 0 is the onomatopoeia card
    const spawn = (text: string, style: 'paper' | 'star' | 'accent'): void => {
      const s = stack++;
      setTimeout(() => fx.card(text, hoop.rimCenter, { style, stack: s }), delay);
      delay += 140;
    };
    spawn(`+${bd.base}`, 'paper');
    for (const b of bd.bonuses) spawn(`${b.label} +${b.points}`, 'star');
    if (bd.multiplier > 1) spawn(`×${bd.multiplier} = ${bd.total}`, 'accent');
    else if (bd.bonuses.length > 0) spawn(`= ${bd.total}`, 'accent');
  }

  function starLabel(stars: number): string {
    if (stars >= 5) return 'SUPERSTAR!';
    if (stars >= 3) return 'ON FIRE!';
    if (stars === 1) return 'HEATING UP!';
    return `★${stars}!`;
  }

  function resolveShot(result: 'swish' | 'make' | 'miss'): void {
    if (run.phase !== 'flight') return;
    lastCurve = steer.telemetry();
    const facts =
      result === 'miss'
        ? null
        : {
            result,
            band: currentPos.band,
            bankUsed: boardTouched,
            rimContacts: scoring.rimContactCount,
            curve: lastCurve,
          };
    const out = run.resolve(result, facts);
    replay.attachSteerTimeline(steer.getTimeline());
    endSteerDrag();
    if (tuning.debug.shotLog) {
      console.log(`[result] ${result}`);
      if (lastCurve.steered) {
        console.log(
          `[curve] dv=${lastCurve.dvSpent.toFixed(2)} latDev=${lastCurve.maxLateralDev.toFixed(2)} ` +
            `smooth=${lastCurve.smoothness.toFixed(2)}`,
        );
      }
    }
    trail.stop();

    if (result === 'miss') {
      // The miss moment: sound dies, run resets, play continues — no menu.
      audio.silenceCut();
      applyHeatVisuals();
      if (boardTouched) {
        fx.card('BRICK!', hoop.rimCenter, { style: 'fire', burst: true });
        document.body.classList.add('shake');
        setTimeout(() => document.body.classList.remove('shake'), 220);
      } else if (scoring.hasRimContact) {
        fx.card('CLANK!', hoop.rimCenter, { style: 'fire' });
      }
      const ended = out.endedRun!;
      if (ended.runScore > 0) {
        pushRun(ended.runScore, ended.streak);
        stats.bestRun = Math.max(stats.bestRun, ended.runScore);
        if (ended.isNewBest) {
          freezeTimer = artTheme.fx.freezeSec;
          fx.panel('NEW BEST!', `${ended.runScore.toLocaleString()}`, 'star');
        } else {
          fx.panel('RUN OVER', `${ended.runScore.toLocaleString()} — best ${run.bestRun.toLocaleString()}`, 'fire');
        }
      }
      saveStats(stats);
      hud.setRun(0, 0, 0);
      hud.setHeat('cold');
      setTimeout(() => {
        run.nextShot();
        flyToNext();
      }, tuning.game.continueDelayMs);
      return;
    }

    // Career bookkeeping.
    const bd = out.breakdown!;
    stats.makes++;
    stats.totalPoints += bd.total;
    if (result === 'swish') stats.swishes++;
    if (currentPos.band === 'three' || currentPos.band === 'deep') stats.threes++;
    if (boardTouched) stats.banks++;
    stats.bestStreak = Math.max(stats.bestStreak, run.streak);
    stats.bestRun = Math.max(stats.bestRun, run.runScore);
    saveStats(stats);

    // Comic beat: onomatopoeia card + the stacking score-math receipt.
    if (result === 'swish') fx.card('SWISH!!', hoop.rimCenter, { style: 'accent', burst: true });
    else if (boardTouched) fx.card('BANK!', hoop.rimCenter, { style: 'paper' });
    else fx.card('COUNT IT!', hoop.rimCenter, { style: 'paper' });
    showScoreMath(bd);

    audio.play('swish', result === 'swish' ? 1 : 0.55, 0);
    net.ripple(result === 'swish' ? 0.07 : 0.04);
    if (out.starMilestone !== null) {
      // Star milestone: ~0.25 s freeze-frame + annotation panel.
      freezeTimer = artTheme.fx.freezeSec;
      fx.panel(
        starLabel(out.starMilestone),
        `★${out.starMilestone} — ×${run.multiplier}`,
        out.starMilestone >= 3 ? 'fire' : 'star',
      );
      if (out.starMilestone >= 3) audio.play('swell', 1, 0);
    }
    applyHeatVisuals();
    hud.setRun(run.runScore, run.streak, run.stars, true);
    hud.setHeat(run.heat);
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
      const rec = replay.recordedShot!;
      ball.tracked.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      scoring.reset();
      replay.fire(ball);
      // Replay the steering timeline too — curved shots replay exactly.
      steer.beginFlight(rec.launch, rec.velocity, replay.steerTimeline);
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
  const netBallPos = new THREE.Vector3();
  const camFwd = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const stretchDir = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  const fxWorldPos = new THREE.Vector3();

  const loop = new FixedLoop({
    update: (dt) => {
      // Milestone freeze-frame: the world holds its pose, the FX layer plays on.
      if (freezeTimer > 0) {
        freezeTimer -= dt;
        return;
      }
      physics.world.gravity = { x: 0, y: -tuning.world.gravity, z: 0 };
      if (run.phase === 'flight') {
        // WASD air steer: a held key is a synthetic steer drag, refreshed
        // every step so the commandHoldMs expiry never drops it.
        const keys = keySteer.poll();
        if (keys) {
          keySteerHeld = true;
          steerVx = keys.vx;
          steerVy = keys.vy;
          steer.setCommand(keys.vx, keys.vy);
        } else if (keySteerHeld) {
          keySteerHeld = false;
          steer.clearCommand();
          steerVx = 0;
          steerVy = 0;
        }
        // Camera basis for steering: screen-x → lateral, screen-y → depth.
        camera.getWorldDirection(camFwd);
        camFwd.y = 0;
        if (camFwd.lengthSq() < 1e-9) camFwd.set(0, 0, -1);
        camFwd.normalize();
        camRight.crossVectors(camFwd, WORLD_UP).normalize();
        const body = ball.tracked.body;
        const force = steer.step(dt, camRight, camFwd, body.translation(), body.linvel());
        steerLateralAccel = force ? (force.x * camRight.x + force.z * camRight.z) / tuning.ball.mass : 0;
        applyFlightForces(body, force);
      }
      physics.world.step(physics.events);
      const vNow = ball.tracked.body.linvel();
      const impact = Math.hypot(vNow.x, vNow.y, vNow.z);
      physics.events.drainCollisionEvents((h1, h2, started) => {
        if (!started) return;
        const bp = ball.tracked.body.translation();
        fxWorldPos.set(bp.x, bp.y, bp.z);
        squashPulse = Math.min(1, impact / 9);
        if (rimHandles.has(h1) || rimHandles.has(h2)) {
          scoring.markRimContact();
          steer.markContact();
          fx.impact(fxWorldPos, 'stars', Math.min(1.5, impact / 5));
          if (impact > 3.2) audio.play('clank', Math.min(1, impact / 8));
          else audio.play('rattle', Math.min(1, 0.3 + impact / 5));
        } else if (h1 === hoop.boardCollider.handle || h2 === hoop.boardCollider.handle) {
          boardTouched = true;
          steer.markContact();
          fx.impact(fxWorldPos, 'stars', Math.min(1.5, impact / 6));
          audio.play('thud', Math.min(1, impact / 9));
        } else if (h1 === physics.floorCollider.handle || h2 === physics.floorCollider.handle) {
          if (impact > 2) fx.impact(fxWorldPos, 'dust', Math.min(1.5, impact / 7));
          audio.play('bounce', Math.min(1, impact / 10), 90);
        }
      });
      snapshotBody(ball.tracked);
      {
        const bp = ball.tracked.body.translation();
        net.update(dt, netBallPos.set(bp.x, bp.y, bp.z), tuning.ball.radius);
      }

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
      // The mesh gets interpolated pose; position moves up to the root so the
      // stretch node between them can scale along world velocity.
      applyInterpolated(ball.tracked, ballMesh, alpha);
      ballRoot.position.copy(ballMesh.position);
      ballMesh.position.set(0, 0, 0);

      // Squash & stretch (visual only): stretch along velocity in flight,
      // squash pulse on contacts, spring back.
      squashPulse = Math.max(0, squashPulse - frameDt * 7);
      if (run.phase === 'flight') {
        const v = ball.tracked.body.linvel();
        const speed = Math.hypot(v.x, v.y, v.z);
        if (speed > 0.5) {
          stretchDir.set(v.x, v.y, v.z).divideScalar(speed);
          ballStretch.quaternion.setFromUnitVectors(WORLD_UP, stretchDir);
        }
        const st0 = Math.min(artTheme.fx.stretchMax, 1 + speed * 0.011);
        const st = st0 + (artTheme.fx.squashMin - st0) * squashPulse;
        const sq = 1 / Math.sqrt(Math.max(0.5, st));
        ballStretch.scale.set(sq, st, sq);
      } else {
        ballStretch.quaternion.identity();
        ballStretch.scale.setScalar(1);
      }

      if (smearTimer > 0) {
        smearTimer -= frameDt;
        if (smearTimer <= 0) for (const m of smears) m.visible = false;
      }

      if (run.phase === 'flight') {
        trail.push(ballRoot.position);
        // Steering readability: matching visual sidespin + trail tint + debug readout.
        if (steerLateralAccel !== 0) {
          steerVisualAngle -= tuning.curve.visualSpinGain * steerLateralAccel * frameDt;
          trail.setSteering(true);
        }
        if (steerVisualAngle !== 0) {
          ballMesh.rotateOnWorldAxis(WORLD_UP, steerVisualAngle * frameDt);
        }
        if (steer.steeringActive) {
          overlay.showSteerState(steer.budgetFrac, steerVx, steerVy, ballScreenPos());
        } else {
          trail.setSteering(false);
          overlay.clearSteerState();
        }
      }
      // Superstar: the rainbow ball — emissive hue cycles.
      if (run.heat === 'superstar') {
        ballMat.emissive.setHSL((performance.now() * 0.0004) % 1, 0.9, 0.5);
      }
      boiler.update(frameDt);
      blobShadow.update(ballRoot.position);
      net.render(camera);
      trail.render(camera);
      rig.update(frameDt);
      debugRenderer.update(physics.world);
      overlay.render(frameDt, camera);
      fx.render(frameDt, camera);
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
  hud.setRun(0, 0, 0);
  loop.start();
}

void boot();
