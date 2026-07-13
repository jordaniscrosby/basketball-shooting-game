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
     */
    powerSensitivity: 0.55,
    /** Swipe azimuth (rad off vertical) → lateral aim error gain (rad/rad). */
    lateralGain: 0.35,
    /** Max lateral angle error (rad). */
    lateralMax: 0.12,
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
    /** Streak milestones that escalate the tier mix. */
    heatAt: 3,
    mixAt: 7,
    fireAt: 10,
    /** Every Nth shot after escalation begins, inject a lower-tier breather. */
    breatherEvery: 5,
    pointsMake: 1,
    pointsSwish: 2,
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
