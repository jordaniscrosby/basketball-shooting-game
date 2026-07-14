import GUI, { Controller } from 'lil-gui';
import { tuning } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { refreshGradientMap } from '../scene/toon';
import { applyThemeToCss } from '../ui/themeBridge';
import { copyThemeDiff, saveThemeAndReload, resetThemeAndReload } from './themeStore';

export interface PanelHooks {
  /** Push material params (restitution/friction) onto live colliders. */
  applyMaterials?: () => void;
  /** Rebuild geometry that depends on dimensions (rim capsules etc.). */
  rebuild?: () => void;
  /** Re-fire the last recorded shot exactly. */
  replayShot?: () => void;
  /** Run the scripted shot battery. */
  runBattery?: () => void;
}

/**
 * Hover tooltip on the dial's label + a ↺ button that resets the dial to
 * its boot-time default (lil-gui's `reset()` also fires onChange hooks, so
 * material/geometry rebuilds happen). Function buttons get the tooltip only.
 */
function tip(ctrl: Controller, text: string): Controller {
  ctrl.$name.title = text;
  if (typeof ctrl.initialValue === 'function') return ctrl;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'dial-reset';
  btn.textContent = '↺';
  btn.title = `reset to default (${String(ctrl.initialValue)})`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    ctrl.reset();
  });
  ctrl.domElement.appendChild(btn);
  return ctrl;
}

/* Dev chrome, deliberately outside artTheme (same policy as swipeOverlay). */
const DIAL_RESET_CSS = `
.lil-gui .lil-controller .dial-reset {
  flex: 0 0 auto;
  margin-left: 5px;
  padding: 0;
  width: 16px;
  height: 16px;
  line-height: 16px;
  border: none;
  border-radius: 3px;
  background: none;
  color: var(--text-color);
  font-size: 13px;
  cursor: pointer;
  opacity: 0.35;
}
.lil-gui .lil-controller .dial-reset:hover {
  opacity: 1;
  background: var(--widget-color);
}
`;

function injectDialResetCss(): void {
  if (document.getElementById('dial-reset-css')) return;
  const style = document.createElement('style');
  style.id = 'dial-reset-css';
  style.textContent = DIAL_RESET_CSS;
  document.head.appendChild(style);
}

export function createDebugPanel(hooks: PanelHooks): GUI {
  injectDialResetCss();
  const gui = new GUI({ title: 'tuning' });
  gui.close();

  const world = gui.addFolder('world');
  tip(world.add(tuning.world, 'gravity', 4, 20, 0.01),
    'Downward gravity (m/s²). The arc solver\'s g must scale with it — change both or solved shots miss.');
  world.close();

  const ball = gui.addFolder('ball');
  tip(ball.add(tuning.ball, 'collisionRadiusScale', 0.85, 1, 0.01).onChange(() => hooks.rebuild?.()),
    'Collision radius as a fraction of the render radius. Shrinking it is the forgiveness lever — widens the rim entry window.');
  tip(ball.add(tuning.ball, 'restitution', 0.4, 1, 0.01).onChange(() => hooks.applyMaterials?.()),
    'Ball bounciness (0 = dead, 1 = superball). A real ball vs hardwood is ~0.8.');
  tip(ball.add(tuning.ball, 'friction', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.()),
    'Ball surface grip — how much contacts convert spin into bounce direction.');
  tip(ball.add(tuning.ball, 'angularDamping', 0, 0.5, 0.01).onChange(() => hooks.applyMaterials?.()),
    'How quickly the ball\'s spin decays in flight.');
  ball.close();

  const rim = gui.addFolder('rim / board / floor');
  tip(rim.add(tuning.rim, 'restitution', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.()),
    'Rim bounciness — higher = livelier rattles, lower = softer rim that swallows shots.');
  tip(rim.add(tuning.rim, 'friction', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.()),
    'Rim grip on contact — affects how spin kicks the ball off the iron.');
  tip(rim.add(tuning.rim, 'capsuleCount', 8, 24, 1).onChange(() => hooks.rebuild?.()),
    'Capsule colliders approximating the rim torus. More = rounder rim, slightly costlier. Rebuilds the hoop.');
  tip(rim.add(tuning.backboard, 'restitution', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.()),
    'Backboard bounciness — how lively bank shots come off the glass.');
  tip(rim.add(tuning.floor, 'restitution', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.()),
    'Floor bounciness for post-shot bounces (cosmetic — a floor hit is already a miss).');
  rim.close();

  const solver = gui.addFolder('solver');
  tip(solver.add(tuning.solver, 'entryAngleDeg', 35, 60, 0.5),
    'Downward entry angle the solved perfect arc aims for. 45° is the Noah-system optimum.');
  tip(solver.add(tuning.solver, 'targetDepthOffset', 0, 0.1, 0.005),
    'Aim point past rim centre toward the back iron (m). ~5 cm mirrors the Noah 11-inch depth finding.');
  solver.close();

  const input = gui.addFolder('input');
  tip(input.add(tuning.input, 'powerSensitivity', 0, 1, 0.01),
    'How strongly flick-speed deviation from reference moves shot power. 0 = fully normalized (easy); keep below ~0.5. The difficulty dial.');
  tip(input.add(tuning.input, 'lateralGain', 0, 1, 0.01),
    'Swipe angle off vertical → sideways aim error (rad per rad). Higher = aim direction matters more.');
  tip(input.add(tuning.input, 'lateralMax', 0, 0.3, 0.005),
    'Cap on the sideways aim error (rad).');
  tip(input.add(tuning.input, 'minSwipeFrac', 0.02, 0.3, 0.01),
    'Minimum swipe length (fraction of screen height) to register as a shot.');
  tip(input.add(tuning.input, 'referenceFlickSpeed', 0.5, 4, 0.05),
    'Flick speed (screen heights/s) that maps to solved-perfect power.');
  input.close();

  const sling = gui.addFolder('slingshot');
  tip(sling.add(tuning.slingshot, 'grabRadius', 0.05, 9, 0.05),
    'How close to the ball (screen-height units) a press must land to grab the slingshot. Large = press anywhere.');
  tip(sling.add(tuning.slingshot, 'minDragFrac', 0.01, 0.2, 0.005),
    'Minimum pull-back (fraction of screen height) for a valid shot.');
  tip(sling.add(tuning.slingshot, 'referenceDragFrac', 0.05, 0.5, 0.01),
    'Pull-back length that maps to solved-perfect power.');
  tip(sling.add(tuning.slingshot, 'maxDragFrac', 0.1, 0.6, 0.01),
    'Pull-back length where the power meter tops out.');
  sling.close();

  const click = gui.addFolder('clickclick');
  tip(click.add(tuning.clickclick, 'meterSpeed', 0.2, 3, 0.05),
    'Power meter sweep speed (full bottom-to-top traversals per second).');
  tip(click.add(tuning.clickclick, 'sweetFrac', 0.1, 0.9, 0.01),
    'Meter fill that maps to solved-perfect power — the green center of the gradient.');
  tip(click.add(tuning.clickclick, 'powerSpan', 0.2, 2, 0.05),
    'Power swing across the whole meter; edges land this far (×sweet-spot distance) from perfect.');
  tip(click.add(tuning.clickclick, 'lateralGain', 0, 2, 0.05),
    'Clicked angle → shot angle gain. 1 = the aim arrow is the shot direction, exactly.');
  tip(click.add(tuning.clickclick, 'lateralMax', 0, 1.2, 0.01),
    'Cap on the click-click aim angle (rad).');
  click.close();

  const curve = gui.addFolder('curve');
  tip(curve.add(tuning.curve, 'enabled'),
    'Master switch for mid-flight steering (body English).');
  tip(curve.add(tuning.curve, 'lateralGain', 0, 20, 0.1),
    'Sideways drag speed → lateral steering accel (m/s²). Soft by design — the headline steering feel dial.');
  tip(curve.add(tuning.curve, 'depthGain', 0, 20, 0.1),
    'Vertical drag speed → depth steering accel toward/away from the hoop (m/s²).');
  tip(curve.add(tuning.curve, 'budget', 0, 5, 0.05),
    'Total steering Δv allowed per flight (m/s). The other headline dial.');
  tip(curve.add(tuning.curve, 'maxAccel', 0, 25, 0.25),
    'Per-step cap on steering acceleration (m/s²).');
  tip(curve.add(tuning.curve, 'grabRadius', 0.05, 9, 0.05),
    'How close to the ball a steer drag must start (screen-height units). Large = drag anywhere.');
  tip(curve.add(tuning.curve, 'keySpeed', 0, 4, 0.05),
    'WASD air-steer strength — the drag speed a held key emulates.');
  tip(curve.add(tuning.curve, 'cutoffAfterContact'),
    'Kill steering after the first rim/board contact so rim physics stays pure.');
  tip(curve.add(tuning.curve, 'fadeBelowFrac', 0, 1, 0.01),
    'Below this fraction of budget remaining, steering force fades linearly (no cutoff pop).');
  tip(curve.add(tuning.curve, 'visualSpinGain', 0, 4, 0.05),
    'Extra visual mesh spin per m/s² of lateral steer — cosmetic only, never touches physics.');
  curve.close();

  const slowmo = gui.addFolder('slowmo');
  tip(slowmo.add(tuning.slowmo, 'enabled'),
    'Bullet time while curve-steering mid-flight — deeper at higher star multipliers.');
  tip(slowmo.add(tuning.slowmo, 'scaleAtX1', 0.2, 1, 0.01),
    'World time scale while steering at ×1 multiplier (1 = no slowdown).');
  tip(slowmo.add(tuning.slowmo, 'scaleAtMax', 0.1, 1, 0.01),
    'World time scale while steering at the max star multiplier — the deepest dive.');
  tip(slowmo.add(tuning.slowmo, 'easeIn', 1, 20, 0.5),
    'How fast time dips into slow-mo when steering engages (per second).');
  tip(slowmo.add(tuning.slowmo, 'easeOut', 1, 20, 0.5),
    'How fast time snaps back to real speed when steering ends (per second).');
  slowmo.close();

  const traj = gui.addFolder('trajectory');
  tip(traj.add(tuning.trajectory, 'enabled'),
    'Aim-time flight preview: a ghost physics world simulates the real shot ahead of release — rim and backboard bounces included.');
  tip(traj.add(tuning.trajectory, 'horizonSec', 0.3, 4, 0.1),
    'How far into the future the preview shows (s) — kept short so the line guides without spoiling the verdict.');
  tip(traj.add(tuning.trajectory, 'boardFollowSec', 0, 0.6, 0.02),
    'After the predicted path touches the backboard, keep only this much more of it (s).');
  tip(traj.add(artTheme.trajectory, 'releaseFadeSec', 0.1, 2, 0.05),
    'Release flash: how long the solid-gold afterimage takes to fade (s).');
  tip(traj.add(artTheme.trajectory, 'dotRadius', 0.01, 0.08, 0.002),
    'Preview dot radius (m) at the release end of the arc.');
  tip(traj.add(artTheme.trajectory, 'everyN', 1, 6, 1),
    'Draw a dot every N predicted physics steps — the dotted-line spacing.');
  tip(traj.add(artTheme.trajectory, 'opacity', 0, 1, 0.05),
    'Preview dot opacity.');
  traj.close();

  const spin = gui.addFolder('spin');
  tip(spin.add(tuning.spin, 'backspinHz', 0, 6, 0.1),
    'Automatic backspin applied at release (rev/s) at perfect power.');
  tip(spin.add(tuning.spin, 'sidespinMaxHz', 0, 8, 0.1),
    'Max sidespin earned by a curved swipe gesture (rev/s).');
  tip(spin.add(tuning.spin, 'magnusK', 0, 0.0005, 0.00001),
    'Magnus coefficient F = k·(ω × v) — how much spin bends the flight. 0 = off (default flavor).');
  spin.close();

  const art = gui.addFolder('art');
  tip(art.add(artTheme.boil, 'rateHz', 0, 16, 0.5),
    'Line-boil rate (Hz) — how fast ink outlines wobble between jittered variants.');
  tip(art.add(artTheme.cel, 'lowestStep', 0.2, 0.9, 0.01).onChange(() => refreshGradientMap()),
    'Darkest cel-shading step brightness (0–1) — lower = deeper shadow tone.');
  tip(art.add(artTheme.blobShadow, 'opacity', 0, 0.8, 0.01),
    'Darkness of the hand-drawn blob shadow under the ball.');
  tip(art.add(artTheme.net, 'cordWidth', 0.004, 0.03, 0.001),
    'Net cord ribbon width (m).');
  tip(art.add(artTheme.trail, 'dashWidth', 0.01, 0.1, 0.005),
    'Ball trail dash ribbon width (m) at the head.');

  // Semantic score colors are fully live: the FX canvas reads artTheme.score
  // each draw and themeBridge pushes them onto the HUD's CSS vars on change.
  const scoreCols = art.addFolder('score colors (live)');
  for (const key of Object.keys(artTheme.score) as Array<keyof typeof artTheme.score>) {
    tip(scoreCols.addColor(artTheme.score, key).onChange(applyThemeToCss),
      'Semantic score color — same role everywhere (HUD, receipt cards, particles). Live.');
  }
  scoreCols.close();

  // Palette/outline/bake dials are painted into textures and hull geometry at
  // startup — tweak, then "apply theme" (persists the diff + reloads) to see
  // them. "copy theme JSON" exports the diff for committing into artTheme.ts.
  // (The HUD/FX side of palette colors does go live via the CSS bridge.)
  const pal = art.addFolder('palette (apply to see)');
  for (const key of Object.keys(artTheme.palette) as Array<keyof typeof artTheme.palette>) {
    tip(pal.addColor(artTheme.palette, key).onChange(applyThemeToCss),
      'Baked into materials/textures at startup — use "apply theme" to see it (HUD colors update live).');
  }
  pal.close();

  const outline = art.addFolder('ink & bake (apply to see)');
  tip(outline.add(artTheme.outline, 'ball', 0, 0.03, 0.001),
    'Ink outline width on the ball (m) — the hero object, thickest by design.');
  tip(outline.add(artTheme.outline, 'rim', 0, 0.03, 0.001),
    'Ink outline width on the rim (m).');
  tip(outline.add(artTheme.outline, 'board', 0, 0.03, 0.001),
    'Ink outline width on the backboard (m).');
  tip(outline.add(artTheme.outline, 'pole', 0, 0.03, 0.001),
    'Ink outline width on the stanchion pole and arm (m).');
  tip(outline.add(artTheme.cel, 'steps', 2, 5, 1),
    'Cel-shading bands in the toon gradient. The gradient texture is sized at startup — apply to see.');
  tip(outline.add(artTheme.boil, 'variants', 2, 5, 1),
    'Pre-baked jitter variants per boiling element. More = less repetitive boil, more startup paint work.');
  tip(outline.add(artTheme.boil, 'hullJitter', 0, 0.02, 0.0005),
    'Outline hull vertex jitter (m) — how much the ink lines wobble.');
  tip(outline.add(artTheme.boil, 'markingJitterPx', 0, 6, 0.1),
    'Court/backboard marking jitter (px on the painted canvas) — hand-ruled line wobble.');
  outline.close();

  const hudDials = art.addFolder('hud (live)');
  tip(hudDials.add(artTheme.hud, 'rollMs', 100, 1200, 10),
    'Scoreboard digit roll duration (ms).');
  tip(hudDials.add(artTheme.hud, 'digitStaggerMs', 0, 200, 5),
    'Per-column roll start offset (ms) — the slot-reel cascade, ones column first.');
  tip(hudDials.add(artTheme.hud, 'rollOvershoot', 0, 4, 0.05),
    'easeOutBack overshoot strength — how far the roll lands past the target before snapping back.');
  tip(hudDials.add(artTheme.hud, 'digitPopScale', 1, 1.6, 0.01).onChange(applyThemeToCss),
    'Pop scale of a digit column as it settles on a new glyph.');
  tip(hudDials.add(artTheme.hud, 'breatheDeg', 0, 2, 0.05).onChange(applyThemeToCss),
    'Scoreboard idle breathe amplitude (±deg) — subliminal, not seasick.');
  tip(hudDials.add(artTheme.hud, 'breatheSec', 1, 12, 0.5).onChange(applyThemeToCss),
    'Scoreboard idle breathe period (s).');
  tip(hudDials.add(artTheme.hud, 'heatScaleFire', 1, 1.3, 0.01).onChange(applyThemeToCss),
    'Digit scale while on fire — escalation theater.');
  tip(hudDials.add(artTheme.hud, 'heatScaleSuperstar', 1, 1.4, 0.01).onChange(applyThemeToCss),
    'Digit scale at superstar.');
  tip(hudDials.add(artTheme.hud, 'igniteJitterPx', 0, 4, 0.1).onChange(applyThemeToCss),
    'Superstar digit jitter amplitude (px) — chunky comic ignition.');
  tip(hudDials.add(artTheme.hud, 'flameEm', 0.5, 3, 0.05).onChange(applyThemeToCss),
    'Scoreboard flame tongue height (em) at full fire.');
  tip(hudDials.add(artTheme.hud, 'flameCount', 4, 20, 1),
    'Flame tongues behind the scoreboard — built at boot, reload to see.');
  hudDials.close();

  const shakeDials = art.addFolder('shake (live)');
  tip(shakeDials.add(artTheme.shake, 'smallPx', 0, 12, 0.5),
    'Small-tier shake offset (px) — plain makes, bricks.');
  tip(shakeDials.add(artTheme.shake, 'mediumPx', 0, 16, 0.5),
    'Medium-tier shake offset (px) — swishes, banks, solid scores.');
  tip(shakeDials.add(artTheme.shake, 'largePx', 0, 24, 0.5),
    'Large-tier shake offset (px) — milestones, on-fire makes.');
  tip(shakeDials.add(artTheme.shake, 'largeDeg', 0, 3, 0.1),
    'Large-tier roll (±deg).');
  tip(shakeDials.add(artTheme.shake, 'mediumScore', 0, 500, 10),
    'Score total that promotes a make to the medium shake tier.');
  tip(shakeDials.add(artTheme.shake, 'largeScore', 0, 1500, 10),
    'Score total that promotes a make to the large shake tier.');
  shakeDials.close();

  const fxDials = art.addFolder('fx (live)');
  tip(fxDials.add(artTheme.fx, 'stepHz', 4, 30, 1),
    'Comic overlay stepped-animation rate (fps) — "on twos" chop of the 2D layer.');
  tip(fxDials.add(artTheme.fx, 'receiptStepMs', 60, 400, 10),
    'Score-receipt per-card reveal step (ms) — the sequential-causality pacing.');
  tip(fxDials.add(artTheme.fx, 'receiptTotalScale', 1, 2, 0.05),
    'Size multiplier of the receipt "= total" card vs the term cards.');
  tip(fxDials.add(artTheme.fx, 'panelDimAlpha', 0, 0.8, 0.01),
    'World dim darkness while a freeze panel is up (reward-reveal staging).');
  tip(fxDials.add(artTheme.fx, 'panelSpotScale', 1, 3, 0.05),
    'Spotlight ellipse size around the freeze panel, relative to the card.');
  tip(fxDials.add(artTheme.heatFx, 'rimEmissiveWarm', 0, 1, 0.01),
    'Rim glow while heating up (applies on next heat change).');
  tip(fxDials.add(artTheme.heatFx, 'rimEmissiveFire', 0, 1, 0.01),
    'Rim glow while on fire.');
  tip(fxDials.add(artTheme.heatFx, 'rimEmissiveSuperstar', 0, 1, 0.01),
    'Rim glow at superstar (hue-cycles with the ball).');
  tip(fxDials.add(artTheme.swirl, 'pixelFilter', 40, 700, 10),
    'Swirl cameo pixelation — lower = chunkier, more painted.');
  tip(fxDials.add(artTheme.swirl, 'spinAmount', 0, 1, 0.01),
    'Swirl cameo curvature.');
  tip(fxDials.add(artTheme.swirl, 'contrast', 0.5, 5, 0.1),
    'Swirl cameo paint-boundary sharpness.');
  tip(fxDials.add(artTheme.swirl, 'speed', 0, 3, 0.05),
    'Swirl cameo churn speed.');
  tip(fxDials.add(artTheme.swirl, 'panelFillAlpha', 0, 1, 0.05),
    'Swirl opacity inside freeze panels.');
  tip(fxDials.add(artTheme.swirl, 'screenAlpha', 0, 1, 0.05).onChange(applyThemeToCss),
    'Swirl backdrop opacity behind the stats/game-over card.');
  tip(fxDials.add(artTheme.slowmoFx, 'fovScale', 0.6, 1, 0.01),
    'Camera FOV multiplier at full slow-mo strength — lower = harder zoom onto the ball.');
  tip(fxDials.add(artTheme.slowmoFx, 'warpAlpha', 0, 1, 0.05),
    'Bullet-time warp streak-line opacity at full strength.');
  tip(fxDials.add(artTheme.slowmoFx, 'vignetteAlpha', 0, 0.8, 0.01),
    'Bullet-time ink vignette opacity at full strength.');
  tip(fxDials.add(artTheme.fx, 'freezeSec', 0, 1, 0.05),
    'Milestone freeze-frame duration (s).');
  tip(fxDials.add(artTheme.fx, 'stretchMax', 1, 1.5, 0.01),
    'Max velocity stretch of the ball visual (1 = off).');
  tip(fxDials.add(artTheme.fx, 'squashMin', 0.5, 1, 0.01),
    'Impact squash floor of the ball visual (1 = off).');
  fxDials.close();

  tip(art.add({ apply: saveThemeAndReload }, 'apply').name('apply theme (save + reload)'),
    'Persist the current theme edits to localStorage and reload so baked dials take effect.');
  tip(art.add({ copy: copyThemeDiff }, 'copy').name('copy theme JSON'),
    'Copy the diff-from-defaults JSON to the clipboard (also logged to console) — paste it to Claude to commit into artTheme.ts.');
  tip(art.add({ reset: resetThemeAndReload }, 'reset').name('reset theme'),
    'Discard saved theme edits and reload with the shipped artTheme defaults.');
  art.close();

  const dbg = gui.addFolder('debug');
  tip(dbg.add(tuning.debug, 'physicsWireframe'),
    'Draw Rapier collider wireframes over the scene.');
  tip(dbg.add(tuning.debug, 'swipeOverlay'),
    'Show the input introspection overlay (swipe samples, steer state).');
  tip(dbg.add(tuning.debug, 'predictedArc'),
    'Draw the predicted shot parabola at release.');
  tip(dbg.add(tuning.debug, 'shotLog'),
    'Log the per-shot solve/perturbation breakdown to the console.');
  if (hooks.replayShot)
    tip(dbg.add({ replay: hooks.replayShot }, 'replay').name('replay last shot'),
      'Re-fire the last recorded shot exactly (deterministic replay).');
  if (hooks.runBattery)
    tip(dbg.add({ battery: hooks.runBattery }, 'battery').name('run shot battery'),
      'Fire the scripted shot battery from every pool position.');
  dbg.close();

  return gui;
}
