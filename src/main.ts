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
import { isCurveTrick, type ScoreBreakdown } from './systems/scoreEngine';
import { annotateShot } from './fx/annotations';
import { ShotReplay } from './systems/shotReplay';
import { runShotBattery } from './systems/shotBattery';
import { pickNextPosition } from './systems/scheduler';
import { TrajectoryPredictor } from './systems/trajectory';
import { TrajectoryLine } from './scene/trajectoryLine';
import { SwipeInput, type Gesture } from './input/swipe';
import { SlingshotInput, pullAim, type SlingshotDrag } from './input/slingshot';
import { ClickClickInput, meterUpSpeed, type ClickClickState } from './input/clickclick';
import { KeySteer } from './input/keySteer';
import {
  loadControlMode,
  saveControlMode,
  nextControlMode,
  type ControlMode,
} from './input/controlMode';
import { Hud } from './ui/hud';
import { applyThemeToCss } from './ui/themeBridge';
import {
  loadBestRun,
  loadLeaderboard,
  loadStats,
  saveStats,
  pushRun,
  loadMuted,
  saveMuted,
} from './ui/persist';
import { AudioBank } from './systems/audio';
import { VerletNet } from './net/verletNet';
import { BallTrail } from './scene/trail';
import { OutlineBoiler } from './scene/outlines';
import { BlobShadow } from './scene/blobShadow';
import { ComicFx } from './fx/comicFx';
import { screenShake } from './fx/shake';
import { SwirlCanvas } from './fx/swirl';
import { PhysicsDebugRenderer } from './debug/physicsDebug';
import { SwipeOverlay } from './debug/swipeOverlay';
import { createDebugPanel } from './debug/panel';
import { applySavedTheme } from './debug/themeStore';
import { artReviewFromUrl, applyArtReview } from './debug/artReview';
import { loadArtOverrides } from './scene/artAssets';

async function boot(): Promise<void> {
  // Saved theme overrides merge in before anything paints from artTheme.
  applySavedTheme();
  applyThemeToCss();
  const artReview = artReviewFromUrl();
  const [, artOverrides] = await Promise.all([initRapier(), loadArtOverrides()]);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const { scene, camera, renderer } = createScene(canvas);
  const physics = createPhysicsWorld();
  const debugRenderer = new PhysicsDebugRenderer(scene);
  const overlay = new SwipeOverlay(document.getElementById('swipe-overlay') as HTMLCanvasElement);
  const court = createCourt(scene, artOverrides);
  let hoop = createHoop(physics.world);
  let rimHandles = new Set(hoop.rimColliders.map((c) => c.handle));
  // Ghost world + dotted ink arc: the aim-time preview simulates the real
  // shot ahead of release (rim/board bounces included).
  const predictor = new TrajectoryPredictor();
  const trajLine = new TrajectoryLine(scene);

  const positions = getPositions();
  const ball = createBall(physics.world, launchPointFor(positions[0]!));
  // Ball hierarchy: root carries position, stretch node carries the
  // velocity-aligned squash & stretch (visual only — collider untouched),
  // the mesh inside carries the body's spin.
  const ballMesh = createBallMesh(artOverrides.ball);
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
  const swirl = new SwirlCanvas();
  fx.attachSwirl(swirl);
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
  let muted = loadMuted();
  const hud = new Hud(
    () => toggleStats(),
    () => {
      controlMode = nextControlMode(controlMode);
      saveControlMode(controlMode);
      hud.setControlMode(controlMode);
      overlay.clearSlingshot();
      clickClick.cancel();
    },
    () => {
      muted = !muted;
      saveMuted(muted);
      audio.setMuted(muted);
      hud.setMuted(muted);
    },
  );
  hud.setControlMode(controlMode);
  hud.attachSwirl(swirl);
  const audio = new AudioBank();
  audio.setMuted(muted);
  hud.setMuted(muted);
  const net = new VerletNet(scene, hoop.rimCenter);
  const trail = new BallTrail(scene);
  const ballMat = ballMesh.material as THREE.MeshToonMaterial;
  const rimMat = court.rimMesh.material as THREE.MeshToonMaterial;
  let boardTouched = false;

  // Cartoon layer: ink outlines that boil, plus the boiling court/blob textures.
  const boiler = new OutlineBoiler();
  boiler.outline(ballMesh, artTheme.outline.ball);
  boiler.outline(court.rimMesh, artTheme.outline.rim);
  boiler.outline(court.backboardMesh, artTheme.outline.board);
  boiler.outline(court.poleMesh, artTheme.outline.pole);
  boiler.outline(court.armMesh, artTheme.outline.pole);
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
      rimMat.emissiveIntensity = artTheme.heatFx.rimEmissiveSuperstar; // joins the cycle
    } else if (heat === 'fire') {
      ballMat.emissive.set(0xff4400);
      ballMat.emissiveIntensity = 0.55;
      rimMat.emissive.set(0xff4400);
      rimMat.emissiveIntensity = artTheme.heatFx.rimEmissiveFire;
    } else if (heat === 'warm') {
      ballMat.emissive.set(0x662200);
      ballMat.emissiveIntensity = 0.3;
      rimMat.emissive.set(0x662200);
      rimMat.emissiveIntensity = artTheme.heatFx.rimEmissiveWarm;
    } else {
      ballMat.emissive.set(0x000000);
      ballMat.emissiveIntensity = 0;
      rimMat.emissive.set(0x000000);
      rimMat.emissiveIntensity = 0;
    }
    audio.setCrowdLevel(heat === 'superstar' ? 1 : heat === 'fire' ? 0.85 : heat === 'warm' ? 0.35 : 0);
    fx.setFocusLines(heat === 'fire' || heat === 'superstar');
  }

  let currentPos: ShotPosition = pickNextPosition(positions, 0, 0, null);
  let flightTimer = 0;

  // Bullet time: engaged while a steer input is live mid-flight. Depth scales
  // with the star multiplier — a hot run literally buys more wall-clock time
  // to bend the shot into bonus territory.
  let timeScale = 1;
  let slowmoEngaged = false;
  function slowmoTarget(): number {
    if (!tuning.slowmo.enabled || run.phase !== 'flight' || !steer.steeringActive) return 1;
    const table = tuning.score.starMultipliers;
    const maxMult = table[table.length - 1] ?? 1;
    const k = maxMult > 1 ? (run.multiplier - 1) / (maxMult - 1) : 0;
    return tuning.slowmo.scaleAtX1 + (tuning.slowmo.scaleAtMax - tuning.slowmo.scaleAtX1) * k;
  }

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
    // Click-click aims 1:1 — the arrow IS the shot direction, no assist pull.
    const lateral = controlMode === 'clickclick' ? tuning.clickclick : tuning.input;
    const shot = aimShot(launch, hoop.rimCenter, g, lateral);
    const body = ball.tracked.body;
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    body.setLinvel({ x: shot.velocity.x, y: shot.velocity.y, z: shot.velocity.z }, true);
    body.setAngvel(
      { x: shot.angularVelocity.x, y: shot.angularVelocity.y, z: shot.angularVelocity.z },
      true,
    );
    replay.record(launch, shot.velocity, shot.angularVelocity);
    steer.beginFlight(launch, shot.velocity);
    // Release flash: the predicted path (same truncation the aim preview
    // showed) relights solid gold and fades — works in swipe mode too, where
    // there was no aim-time preview to ignite.
    const wantDebugArc = tuning.debug.swipeOverlay && tuning.debug.predictedArc;
    const predicted =
      tuning.trajectory.enabled || wantDebugArc
        ? predictor.predict(launch, shot.velocity, shot.angularVelocity)
        : null;
    if (predicted && tuning.trajectory.enabled) trajLine.ignite(predicted);
    overlay.showRelease(shot, launch, g.samples, wantDebugArc && predicted ? predicted : undefined);
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

  // Aim-time trajectory preview: once per render frame the live aim scheme
  // synthesizes the gesture a release-right-now would fire (the SAME mapping
  // the release path uses — pullAim / meterUpSpeed), and the ghost world
  // simulates it. Keyed so a held-still aim doesn't re-simulate every frame.
  let slingDrag: SlingshotDrag | null = null;
  let previewKey = '';
  function updateAimPreview(ccState: ClickClickState | null): void {
    let azimuth: number | null = null;
    let upSpeed = 0;
    if (tuning.trajectory.enabled && run.phase === 'aiming') {
      if (controlMode === 'slingshot' && slingDrag?.valid) {
        ({ azimuth, upSpeed } = pullAim(slingDrag));
      } else if (controlMode === 'clickclick' && ccState) {
        azimuth = ccState.azimuth;
        // Hover shows the solved-perfect-power path; charging tracks the meter.
        upSpeed = ccState.charging
          ? meterUpSpeed(ccState.meter)
          : tuning.input.referenceFlickSpeed;
      }
    }
    if (azimuth === null) {
      trajLine.hide();
      previewKey = '';
      return;
    }
    const key = `${controlMode}|${azimuth.toFixed(5)}|${upSpeed.toFixed(5)}`;
    if (key === previewKey) return;
    previewKey = key;
    const launch = launchPointFor(currentPos);
    const lateral = controlMode === 'clickclick' ? tuning.clickclick : tuning.input;
    const shot = aimShot(
      launch,
      hoop.rimCenter,
      { azimuth, upSpeed, curvature: 0, samples: [] },
      lateral,
    );
    trajLine.show(predictor.predict(launch, shot.velocity, shot.angularVelocity));
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
    onDrag: (d) => {
      slingDrag = d;
      overlay.showSlingshot(ballScreenPos(), d);
    },
    onRelease: (g) => {
      slingDrag = null;
      overlay.clearSlingshot();
      fireShot(g);
    },
    onCancel: () => {
      slingDrag = null;
      overlay.clearSlingshot();
    },
  });

  // Arcade scheme: click to aim, click again to stop the sweeping power meter.
  const clickClick = new ClickClickInput(canvas, {
    active: () => controlMode === 'clickclick' && run.phase === 'aiming',
    ballScreen: () => ballScreenPos(),
    onFire: (g) => {
      overlay.clearClickMeter();
      fireShot(g);
    },
    onCancel: () => overlay.clearClickMeter(),
  });

  const keySteer = new KeySteer();
  let keySteerHeld = false;

  // Receipt/HUD timers from the previous resolve — cleared at the top of the
  // next resolveShot so a stale deferred HUD roll can't fire after a reset.
  let pendingFxTimers: number[] = [];
  function clearPendingFx(): void {
    for (const t of pendingFxTimers) clearTimeout(t);
    pendingFxTimers = [];
  }
  function later(fn: () => void, ms: number): void {
    pendingFxTimers.push(window.setTimeout(fn, ms));
  }

  /**
   * The score receipt, numbers only: +base, each +bonus, the ×mult, then the
   * +total — revealed one at a time (sequential causality), each term wearing
   * its semantic color (artTheme.score — color, not text, says what a term
   * is; the mapping never breaks). Returns the delay (ms) at which the total
   * card lands, the receipt's climax beat.
   */
  function showScoreMath(bd: ScoreBreakdown): number {
    let delay = artTheme.fx.receiptFirstMs;
    let stack = 1; // stack 0 is the onomatopoeia card
    const spawn = (text: string, style: 'base' | 'bonus' | 'mult' | 'total', scale = 1): void => {
      const s = stack++;
      later(() => {
        fx.card(text, hoop.rimCenter, { style, stack: s, scale });
        // Each term sounds its meaning: rising ticks, a ding for the ×mult,
        // bass for the total — the receipt audibly climbs.
        if (style === 'mult') audio.play('multhit', tuning.juice.multHitVolume, 0);
        else if (style === 'total') audio.play('basshit', tuning.juice.bassHitVolume, 0);
        else audio.playTick(s - 1);
      }, delay);
      delay += artTheme.fx.receiptStepMs;
    };
    spawn(`+${bd.base}`, 'base');
    for (const b of bd.bonuses) spawn(`+${b.points}`, 'bonus');
    if (bd.multiplier > 1) spawn(`×${bd.multiplier}`, 'mult');
    if (bd.multiplier > 1 || bd.bonuses.length > 0)
      spawn(`+${bd.total}`, 'total', artTheme.fx.receiptTotalScale);
    return delay - artTheme.fx.receiptStepMs;
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
    clearPendingFx();
    replay.attachSteerTimeline(steer.getTimeline());
    endSteerDrag();
    if (tuning.debug.shotLog) {
      console.log(`[result] ${result}`);
      if (lastCurve.steered) {
        console.log(
          `[curve] dv=${lastCurve.dvSpent.toFixed(2)} latDev=${lastCurve.maxLateralDev.toFixed(2)} ` +
            `smooth=${lastCurve.smoothness.toFixed(2)} ` +
            `lat±=${lastCurve.dvLatPos.toFixed(2)}/${lastCurve.dvLatNeg.toFixed(2)} combo=${run.curveCombo}`,
        );
      }
    }
    trail.stop();

    if (result === 'miss') {
      // The miss moment: sound dies, run resets, play continues — no menu.
      audio.silenceCut();
      applyHeatVisuals();
      // The heckle card: air ball / brick / rim-out, with the miss-streak
      // quip underneath once the bricks start stacking.
      const ann = annotateShot({
        result,
        bankUsed: boardTouched,
        rimContacts: scoring.rimContactCount,
        anyContact: boardTouched || scoring.hasRimContact,
        curved: isCurveTrick(lastCurve),
        missStreak: run.missStreak,
        seed: run.shotIndex,
      });
      fx.card(ann.text, hoop.rimCenter, { sub: ann.sub, style: ann.style, burst: ann.burst });
      screenShake('small');
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
      hud.setRun(0, 0);
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

    // Comic beat: the annotation card (swish / bank / ugly-roll comedy per
    // observed facts) + the stacking score-math receipt.
    const ann = annotateShot({
      result,
      bankUsed: boardTouched,
      rimContacts: scoring.rimContactCount,
      anyContact: true,
      curved: isCurveTrick(lastCurve),
      missStreak: 0,
      seed: run.shotIndex,
    });
    fx.card(ann.text, hoop.rimCenter, { style: ann.style, burst: ann.burst });
    // Shake NOW, with the onomatopoeia — before the receipt finishes rolling,
    // so a big make is felt pre-cognitively. Tier scales with magnitude.
    screenShake(
      out.starMilestone !== null ||
        run.heat === 'fire' ||
        run.heat === 'superstar' ||
        bd.total >= artTheme.shake.largeScore
        ? 'large'
        : result === 'swish' || boardTouched || bd.total >= artTheme.shake.mediumScore
          ? 'medium'
          : 'small',
    );
    const climaxMs = showScoreMath(bd);

    audio.play('swish', result === 'swish' ? 1 : 0.55, 0);
    net.ripple(result === 'swish' ? 0.07 : 0.04);
    if (out.starMilestone !== null) {
      // Star milestone: ~0.25 s freeze-frame + annotation panel.
      freezeTimer = artTheme.fx.freezeSec;
      fx.panel(starLabel(out.starMilestone), undefined, out.starMilestone >= 3 ? 'fire' : 'star');
      if (out.starMilestone >= 3) audio.play('swell', 1, 0);
    }
    applyHeatVisuals();
    // The HUD roll fires as the receipt's total card lands — one climax beat.
    later(() => {
      hud.setRun(run.runScore, run.streak, true);
      hud.setHeat(run.heat);
    }, climaxMs);
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
      predictor.rebuildHoop();
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
      // Superstar: the rainbow ball — emissive hue cycles; the rim joins in.
      if (run.heat === 'superstar') {
        ballMat.emissive.setHSL((performance.now() * 0.0004) % 1, 0.9, 0.5);
        rimMat.emissive.setHSL((performance.now() * 0.0004 + 0.35) % 1, 0.9, 0.5);
      }
      // Click-click charge: the meter sweeps on wall time, so push the fresh
      // value to the overlay every frame while charging.
      const ccState = clickClick.state(performance.now());
      if (ccState) overlay.showClickMeter(ballScreenPos(), ccState);
      else overlay.clearClickMeter();
      updateAimPreview(ccState);
      // Bullet time: ease world time toward the slow-mo target. Warp lines,
      // camera zoom and audio pitch all ride the same strength signal; this
      // layer and the HUD keep running at real speed over the slowed world.
      const slowTarget = slowmoTarget();
      if (slowTarget < 1 && !slowmoEngaged) audio.play('slowmo', tuning.juice.slowmoVolume, 250);
      slowmoEngaged = slowTarget < 1;
      const slowRate = slowTarget < timeScale ? tuning.slowmo.easeIn : tuning.slowmo.easeOut;
      timeScale += (slowTarget - timeScale) * Math.min(1, frameDt * slowRate);
      if (slowTarget === 1 && Math.abs(1 - timeScale) < 0.005) timeScale = 1;
      loop.timeScale = timeScale;
      audio.setTimeScale(timeScale);
      const slowStrength = Math.min(
        1,
        Math.max(0, (1 - timeScale) / Math.max(0.05, 1 - tuning.slowmo.scaleAtMax)),
      );
      fx.setWarp(slowStrength);
      if (!artReview) {
        // The zoom cue: FOV pinches toward the ball while time is slowed.
        const fov = tuning.camera.fov * (1 - (1 - artTheme.slowmoFx.fovScale) * slowStrength);
        if (camera.fov !== fov) {
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }
      }
      boiler.update(frameDt);
      blobShadow.update(ballRoot.position);
      trajLine.update(frameDt, camera);
      net.render(camera);
      trail.render(camera);
      if (!artReview) rig.update(frameDt);
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
  if (artReview) {
    // Art review: deterministic position (free throw), fixed preset camera,
    // frozen boil, no HUD — reproducible screenshots for art iteration.
    currentPos = positions[0]!;
    holdBallAt(currentPos);
    applyArtReview(artReview, camera, launchPointFor(currentPos), hoop.rimCenter);
    document.body.classList.add('art-review');
  } else {
    holdBallAt(currentPos);
    rig.snapTo(currentPos);
  }
  run.beginAiming();
  hud.setRun(0, 0);
  loop.start();
}

void boot();
