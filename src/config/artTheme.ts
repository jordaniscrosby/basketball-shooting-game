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
    /** Flat painted gym wall behind the hoop. */
    gymWall: '#3f7d8c',
    gymWallDark: '#356b78',
    gymWallLight: '#4b8d9c',
    /** Paper/cream — UI cards, floor apron. */
    paper: '#f8f2e2',
    star: '#f7c948',
    fire: '#e8542f',
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

  /** Comic FX overlay: the choppy 2D cartoon layer over the 60 fps world. */
  fx: {
    /** Stepped animation rate (fps) — "on twos", the layer's signature chop. */
    stepHz: 10,
    /** Onomatopoeia card lifetime (ms). */
    cardLifeMs: 700,
    /** Pop-in overshoot duration (ms). */
    popMs: 140,
    /** Milestone freeze-frame: world freeze (s) and panel lifetime (ms). */
    freezeSec: 0.25,
    freezePanelMs: 1100,
    /** Focus-line vignette while on fire. */
    focusLineCount: 44,
    /** Release smear ghost lifetime (s). */
    smearSec: 0.12,
    /** Ball squash/stretch: velocity stretch cap and impact squash floor. */
    stretchMax: 1.15,
    squashMin: 0.8,
  },

  /** Paper-grain overlay opacity (0–1) — subtle multiply noise. */
  grainOpacity: 0.05,
};

export type ArtTheme = typeof artTheme;
