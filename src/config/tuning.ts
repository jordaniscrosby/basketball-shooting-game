/**
 * ALL magic numbers live here. lil-gui binds to this object; nothing outside
 * this module hardcodes a physical constant, threshold, or gameplay dial.
 * This module is the artifact that survives the iOS rewrite.
 *
 * Sources: vault research "Basketball Physics and Ballistics" (real NBA/FIBA
 * dimensions, measured CORs, Noah 45°/11" targeting).
 */

export const tuning = {
  world: {
    /** Real gravity. If pacing ever feels slow, scale this AND the solver's g together. */
    gravity: 9.81,
    /** Fixed physics step rate (Hz). */
    stepHz: 60,
    /** Max frame dt fed to the accumulator (s) — spiral-of-death guard. */
    maxFrameDt: 0.25,
  },

  ball: {
    /** Render radius (m) — size 7 ball. */
    radius: 0.121,
    /**
     * Collision radius = radius * collisionRadiusScale. Shrinking 5–10% below
     * render radius is the honest forgiveness lever (grows the W(θ) window).
     */
    collisionRadiusScale: 0.95,
    mass: 0.62,
    restitution: 0.8, // vs floor → COR ~0.78–0.82
    friction: 0.6,
    angularDamping: 0.05,
    linearDamping: 0.0,
    /** Soft-CCD prediction distance (m). */
    softCcdPrediction: 0.4,
  },

  rim: {
    height: 3.048,
    innerDiameter: 0.4572,
    /** Rim rod is 16 mm steel; capsule collider radius (m). */
    rodRadius: 0.008,
    /** Number of capsules approximating the torus. */
    capsuleCount: 14,
    /** Horizontal gap from backboard face to rim centre (m). */
    centerFromBoard: 0.38,
    restitution: 0.4,
    friction: 0.5,
    /** Contact skin (m) keeps fast contacts from popping through thin capsules. */
    contactSkin: 0.005,
  },

  backboard: {
    width: 1.829,
    height: 1.067,
    bottomEdge: 2.9,
    thickness: 0.04,
    restitution: 0.7,
    friction: 0.4,
  },

  floor: {
    restitution: 0.8,
    friction: 0.55,
  },

  court: {
    length: 28.65, // NBA, along z
    width: 15.24,
    /** Backboard face distance from baseline (m). */
    boardFromBaseline: 1.22,
    /** FT line horizontal distance to rim centre (m). */
    ftDistance: 4.19,
    threePointRadius: 7.24,
    threePointCorner: 6.7,
  },

  scoring: {
    /** Above-rim sensor: height of its centre above rim plane (m). */
    aboveSensorOffset: 0.08,
    /** Below-rim sensor: depth of its centre below rim plane (m). */
    belowSensorOffset: 0.12,
    sensorHalfHeight: 0.02,
    /** Sensor radius as a fraction of rim inner radius. */
    sensorRadiusScale: 1.0,
    /** Radius of the "possession reset" region around the hoop (m). */
    resetRegionRadius: 1.2,
  },

  solver: {
    /** Desired entry angle below horizontal (deg). Noah optimum. */
    entryAngleDeg: 45,
    /** Aim past rim centre toward the far rim (m) — Noah 11-inch depth ≈ +5 cm. */
    targetDepthOffset: 0.05,
  },

  input: {
    /** Velocity-estimator window (ms) and max samples — Android Lsq2 parity. */
    estimatorWindowMs: 100,
    estimatorMaxSamples: 20,
    /** Min swipe length as fraction of viewport height. */
    minSwipeFrac: 0.1,
    /** Min upward release speed (viewport heights / s). */
    minFlickSpeed: 0.4,
    /** Reference flick speed (viewport heights / s) mapping to perfect power. */
    referenceFlickSpeed: 1.6,
    /** Power multiplier clamp around the solved-perfect shot. */
    powerMin: 0.85,
    powerMax: 1.15,
    /**
     * How strongly flick-speed deviation from reference moves power.
     * 0 = Messenger-style full normalization; 1 = raw. Difficulty dial.
     * Range error ≈ 2× speed error and the 45°-entry depth window is ~±1.3%
     * of range, so this starts low: ±10% natural swipe variance → ~±1.8%
     * power → makeable-with-rattle. Raise with streak, never past ~0.5.
     */
    powerSensitivity: 0.18,
    /** Swipe azimuth (rad off vertical) → lateral aim error gain (rad/rad). */
    lateralGain: 0.35,
    /** Max lateral angle error (rad). */
    lateralMax: 0.12,
  },

  curve: {
    /** Master switch for mid-flight steering (body English). */
    enabled: true,
    /**
     * Screen-x drag velocity (viewport heights/s) → lateral accel (m/s²).
     * SOFT by design: a guide, not a joystick — the headline playtest dial.
     */
    lateralGain: 4.0,
    /** Screen-y drag velocity (up) → depth accel toward/away from the hoop (m/s²). */
    depthGain: 2.2,
    /** Total steering Δv budget per flight (m/s). The other headline dial. */
    budget: 1.0,
    /** Per-step steering accel cap (m/s²). */
    maxAccel: 6.0,
    /**
     * Drag must start within this distance of the ball's screen position
     * (viewport-height units). Large value = swipe anywhere (default — touch
     * precision on a moving ball is an open design question).
     */
    grabRadius: 9,
    /** Kill steering after the first rim/board contact — rim physics stays pure. */
    cutoffAfterContact: true,
    /** Below this fraction of budget remaining, force fades linearly (no cutoff pop). */
    fadeBelowFrac: 0.35,
    /** A steer move sample steers for at most this long without a newer one (ms). */
    commandHoldMs: 90,
    /** Visual sidespin: extra mesh spin (rad/s) per m/s² of lateral steer accel. */
    visualSpinGain: 0.9,
  },

  spin: {
    /** Auto-backspin at perfect power (Hz, converted to rad/s at release). */
    backspinHz: 2.5,
    /** Sidespin from gesture curvature: Hz at full chord deviation. */
    sidespinMaxHz: 3,
    /** Chord deviation (fraction of viewport height) mapping to max sidespin. */
    sidespinFullDeviation: 0.08,
    /** Magnus coefficient F = k·(ω × v). Start ~0; optional flavor only. */
    magnusK: 0.0,
  },

  camera: {
    /** Behind-ball hover offset (m): back along shot line, and up. */
    back: 1.9,
    up: 0.85,
    /** Fly-to duration between positions (s). */
    flyTime: 0.65,
    /** Push-in toward hoop after release (m). */
    releasePushIn: 0.5,
    fov: 55,
  },

  game: {
    /** Ball release height above the floor at the shooter position (m). */
    releaseHeight: 2.0,
    /** After a miss (run reset), the next shot arrives within this (ms). */
    continueDelayMs: 1200,
  },

  /**
   * Linear difficulty ramp: the sampling target difficulty rises linearly
   * with streak (capped) over the rated position pool — shots get
   * progressively, probabilistically farther. No stepped tier cliffs; the
   * stars announce progress, the sampling ramps smoothly underneath.
   */
  difficulty: {
    /** Target difficulty at streak 0. */
    t0: 0.12,
    /** Target difficulty gained per streak point (the ramp slope k). */
    perStreak: 0.045,
    /** Ramp ceiling — a long run lives here, not beyond. */
    cap: 0.85,
    /** Gaussian sampling width around the target (difficulty units). */
    sigma: 0.22,
    /** Every Nth shot (once the ramp is underway) draws an easier breather. */
    breatherEvery: 5,
    breatherTarget: 0.15,
    /** Rating map: difficulty = clamp((dist − distFloor) / distSpan, 0.05, 1). */
    distFloor: 2.5,
    distSpan: 8,
  },

  /**
   * Scoring v2: points = (base + Σ bonuses) × starMultiplier. Legibility-first
   * round numbers — a player must be able to recompute any popup in their head.
   */
  score: {
    base: 50,
    bonus: {
      swish: 25,
      mid: 20,
      three: 50,
      deep: 100,
      bank: 20,
      luckyRoll: 15,
      curve: 25,
      fullBender: 60,
      steez: 30,
    },
    /** Rim contacts ≥ this on a make = LUCKY ROLL (rattle-in drama). */
    luckyRollContacts: 3,
    /** Lateral deviation from the unsteered ghost (m) that earns CURVE!. */
    curveDevThreshold: 0.25,
    /** Δv budget fraction spent that upgrades to FULL BENDER!!. */
    benderBudgetFrac: 0.85,
    /** Distance bands (m from rim centre): close < mid < three < deep. */
    bandMid: 4.5,
    bandThree: 6.5,
    bandDeep: 8.5,
    /** Streak milestones that earn stars; multiplier = starMultipliers[stars]. */
    starMilestones: [3, 7, 10, 15, 20],
    starMultipliers: [1, 2, 3, 4, 5, 6],
  },

  juice: {
    netCols: 10,
    netRows: 5,
    netLength: 0.42,
    /** Verlet constraint iterations per step. */
    netIterations: 3,
    trailLength: 24,
    slowMoScale: 1.0, // reserved for v1.1 milestones
    audioVolume: 0.9,
  },

  debug: {
    physicsWireframe: false,
    shotLog: true,
    swipeOverlay: true,
    predictedArc: true,
  },
};

export type Tuning = typeof tuning;

/** Derived, always computed from live tuning values. */
export const derived = {
  get ballCollisionRadius(): number {
    return tuning.ball.radius * tuning.ball.collisionRadiusScale;
  },
  get rimInnerRadius(): number {
    return tuning.rim.innerDiameter / 2;
  },
  /** World position of rim centre. Hoop sits at -z end of the court. */
  get rimCenterZ(): number {
    // Baseline at z = -courtLength/2; board face 1.22 m in; rim centre 0.38 m further.
    return -tuning.court.length / 2 + tuning.court.boardFromBaseline + tuning.rim.centerFromBoard;
  },
  get backboardFaceZ(): number {
    return -tuning.court.length / 2 + tuning.court.boardFromBaseline;
  },
};
