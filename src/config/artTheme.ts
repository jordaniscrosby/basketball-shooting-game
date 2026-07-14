/**
 * ALL art-direction constants live here — the visual twin of tuning.ts.
 * Palette, outline widths, boil rate, cel steps: nothing outside this module
 * hardcodes a color or style dial. lil-gui binds to this object.
 *
 * Source: vault "Art Direction" — 90s hand-drawn cartoon (flat cels, ink
 * outlines, boiling lines, paper grain).
 */

export const artTheme = {
  palette: {
    /** Warm near-black — every outline, marking, and letter. True black reads digital. */
    ink: '#2b1d16',
    /** Court hardwood: one flat tone, no grain. */
    courtWood: '#e8a655',
    /** Key / center circle / 3PT accent fills. */
    courtAccent: '#c9563c',
    ball: '#f07f2d',
    backboard: '#f5efe0',
    rim: '#d94f30',
    pole: '#5a6570',
    net: '#f5efe0',
    /** Rural park grounds: sky, lawn, paved trails, painted countryside backdrop. */
    sky: '#7fc4e8',
    grass: '#85b968',
    grassLight: '#95c775',
    grassDark: '#6ca254',
    hillFar: '#a9d18a',
    trail: '#dbcfb2',
    treeLeaf: '#4f8f43',
    treeTrunk: '#7d5433',
    /** Paper/cream — UI cards, floor apron. */
    paper: '#f8f2e2',
    star: '#f7c948',
    fire: '#e8542f',
    /** Balatro-style scoreboard: dark slate panel, blue chips half (points) ×
     *  red mult half (streak), white digits. Color IS the split's meaning. */
    sbPanel: '#2e3440',
    sbChips: '#3d84c6',
    sbMult: '#d94f3d',
    sbDigit: '#ffffff',
  },

  /**
   * Semantic score colors — the Balatro rule: color IS meaning, and the
   * mapping never breaks. The same four roles color the scoreboard (via
   * ui/themeBridge CSS vars), the FX receipt cards, and score particles.
   * Source: vault "Balatro — Takeaways for Streak" §1.
   */
  score: {
    /** Base points — plain ink on paper. */
    base: '#2b1d16',
    /** Every bonus term (SWISH, 3PT, BANK…) — clay accent. */
    bonus: '#c9563c',
    /** The ★ multiplier — star gold (the ×N receipt card wears the same gold). */
    mult: '#f7c948',
    /** The final total — biggest + hottest. */
    total: '#e8542f',
  },

  /**
   * Scoreboard motion (numeric dials bridged to CSS vars by ui/themeBridge).
   * Timing vocabulary from vault "Balatro — Animation & Game Feel".
   */
  hud: {
    /** Digit roll duration (ms). */
    rollMs: 400,
    /** Per-column roll start offset (ms), staggered from the ones column. */
    digitStaggerMs: 50,
    /** easeOutBack overshoot strength — the roll lands past the target and snaps back. */
    rollOvershoot: 1.7,
    /** Pop scale of a digit column as it settles on a new glyph. */
    digitPopScale: 1.22,
    /** Idle breathe of the scoreboard/buttons (±deg, period s) — the
     *  "nothing is ever fully still" rule. Subliminal, not seasick. */
    breatheDeg: 0.5,
    breatheSec: 4.5,
    /** Escalation theater: the digits themselves grow with heat, and at
     *  superstar they jitter — magnitude rendered typographically. */
    heatScaleFire: 1.04,
    heatScaleSuperstar: 1.09,
    /** Superstar digit jitter amplitude (px), stepped chunky — comic, not vibration. */
    igniteJitterPx: 1.2,
    /** Balatro fire: comic flame tongues behind the scoreboard, lit by heat.
     *  Count of flame elements and their height (em, at full fire). */
    flameCount: 10,
    flameEm: 1.4,
  },

  /**
   * Magnitude-tiered screen shake (fx/shake.ts): the whole comic panel —
   * world canvas, FX overlay, HUD — thumps as one object. Tiers from vault
   * "Balatro — Animation & Game Feel"; the shake fires at resolve, BEFORE the
   * receipt finishes, so big moments are felt pre-cognitively.
   */
  shake: {
    smallPx: 2,
    smallMs: 200,
    mediumPx: 4,
    mediumMs: 300,
    largePx: 8,
    largeMs: 500,
    /** Large tier only: ±roll (deg). */
    largeDeg: 1,
    /** Score thresholds: breakdown total ≥ these promote the tier. */
    mediumScore: 120,
    largeScore: 350,
  },

  cel: {
    /** Gradient-map steps for MeshToonMaterial. */
    steps: 3,
    /** Darkest cel step brightness (0–1) — how deep the shadow tone goes. */
    lowestStep: 0.45,
  },

  /** Inverted-hull outline width per object (m). Ball is the hero — thickest. */
  outline: {
    ball: 0.013,
    rim: 0.007,
    board: 0.016,
    pole: 0.014,
  },

  boil: {
    /** Line-boil rate (Hz) — variants cycle at this speed. Drop first if perf hurts. */
    rateHz: 8,
    /** Pre-jittered variants per boiling element. */
    variants: 3,
    /** Outline hull vertex jitter (m). */
    hullJitter: 0.004,
    /** Court/backdrop marking jitter (px on the painted canvas). */
    markingJitterPx: 2.2,
  },

  /** Hand-drawn blob shadow under the ball (shadow maps are off). */
  blobShadow: {
    opacity: 0.32,
    /** Shadow radius at floor level, as a multiple of ball radius. */
    radiusScale: 1.45,
    /** Extra spread as the ball rises (fraction per metre of height). */
    growPerMeter: 0.12,
    /** Height (m) at which the shadow has fully faded. */
    fadeHeight: 7,
  },

  net: {
    /** Ink cord ribbon width (m), varied per cord for the hand-drawn read. */
    cordWidth: 0.011,
    cordWidthVariance: 0.35,
  },

  trail: {
    /** Dash ribbon width (m) at the head. */
    dashWidth: 0.035,
    /** Draw a dash every N trail samples (gap = the other N). */
    dashEvery: 2,
  },

  /** Aim-time trajectory preview: dotted ink arc along the predicted flight. */
  trajectory: {
    /** Dot color — ink, same as every other drawn line. */
    color: '#2b1d16',
    opacity: 0.55,
    /** Dot radius (m) at the release end of the arc. */
    dotRadius: 0.016,
    /** Draw a dot every N predicted physics steps — the dotted-line spacing. */
    everyN: 3,
    /** Dot scale at the far (future) end — dots shrink toward the future. */
    endScale: 0.4,
    /** Release flash: the moment the shot fires the path relights as one
     *  CONTINUOUS solid gold ribbon (never dotted — same gold as the
     *  star/mult family) and fades out. */
    releaseColor: '#f7c948',
    releaseOpacity: 1.0,
    releaseFadeSec: 0.6,
    /** Ribbon stroke width (m) at the release end; tapers by endScale. */
    releaseWidth: 0.03,
  },

  /** Comic FX overlay: the choppy 2D cartoon layer over the 60 fps world. */
  fx: {
    /** Stepped animation rate (fps) — "on twos", the layer's signature chop. */
    stepHz: 10,
    /** Onomatopoeia card lifetime (ms). */
    cardLifeMs: 700,
    /** Pop-in overshoot duration (ms). */
    popMs: 140,
    /** Score receipt: first-card delay and per-card reveal step (ms). */
    receiptFirstMs: 130,
    receiptStepMs: 140,
    /** The `= total` card renders bigger than the term cards. */
    receiptTotalScale: 1.35,
    /** Milestone freeze-frame: world freeze (s) and panel lifetime (ms). */
    freezeSec: 0.25,
    freezePanelMs: 1100,
    /** Reward-reveal staging: while a freeze panel is up the world dims to
     *  ink with a spotlight on the card — the pack-opening moment. */
    panelDimAlpha: 0.38,
    panelSpotScale: 1.55,
    /** Focus-line vignette while on fire. */
    focusLineCount: 44,
    /** Impact-star alpha twinkle depth (0 = steady, 1 = full flicker). */
    starTwinkle: 0.3,
    /** Release smear ghost lifetime (s). */
    smearSec: 0.12,
    /** Ball squash/stretch: velocity stretch cap and impact squash floor. */
    stretchMax: 1.15,
    squashMin: 0.8,
  },

  /**
   * Swirl-shader cameo (fx/swirl.ts, vault "Balatro — Background Shader"):
   * garnish only — freeze-panel fills + the stats/game-over backdrop. It
   * never replaces the painted backdrop or sky.
   */
  swirl: {
    /** Pixelation blocks along the diagonal — low = chunky/painted. */
    pixelFilter: 160,
    /** Swirl curvature. */
    spinAmount: 0.36,
    /** Sharpness of the paint boundaries. */
    contrast: 2.2,
    /** Churn speed multiplier. */
    speed: 0.8,
    /** Offscreen render-target size (px) — the perf dial. */
    size: 256,
    /** Swirl fill opacity inside freeze panels. */
    panelFillAlpha: 0.45,
    /** Backdrop opacity behind the stats/game-over card. */
    screenAlpha: 0.85,
  },

  /**
   * Bullet-time visual language (gameplay trigger/depth live in
   * tuning.slowmo): the camera pinches its FOV toward the ball and the FX
   * overlay draws a warp tunnel — streak lines rushing toward center plus an
   * ink vignette — all scaled by slow-mo strength (0 = real time, 1 = deepest).
   */
  slowmoFx: {
    /** Camera FOV multiplier at full slow-mo strength (<1 = zoom in). */
    fovScale: 0.86,
    /** Warp streak-line opacity at full strength. */
    warpAlpha: 0.5,
    /** Warp streak lines around the tunnel. */
    warpLineCount: 30,
    /** Ink vignette opacity at full strength. */
    vignetteAlpha: 0.26,
  },

  /** Heat mirrored onto the hoop: rim emissive intensity per tier — the rim
   *  comes alive with the streak but stays the same inked object at cold. */
  heatFx: {
    rimEmissiveWarm: 0.15,
    rimEmissiveFire: 0.35,
    rimEmissiveSuperstar: 0.6,
  },

  /** Paper-grain overlay opacity (0–1) — subtle multiply noise. */
  grainOpacity: 0.05,
};

export type ArtTheme = typeof artTheme;
