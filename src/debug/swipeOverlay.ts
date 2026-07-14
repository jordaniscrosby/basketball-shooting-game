import * as THREE from 'three';
import { tuning } from '../config/tuning';
import type { PointerSample } from '../input/velocityTracker';
import type { AimedShot } from '../systems/aim';

/**
 * Dev-only 2D overlay: live swipe path while dragging, then the released
 * gesture + the predicted arc (3D parabola projected through the camera).
 * Fades out after release.
 */
export class SwipeOverlay {
  private readonly ctx: CanvasRenderingContext2D;
  private fade = 0;
  private path: PointerSample[] = [];
  private arc: THREE.Vector3[] = [];
  private steer: { budgetFrac: number; vx: number; vy: number; bx: number; by: number } | null =
    null;
  private sling: {
    bx: number;
    by: number;
    dx: number;
    dy: number;
    len: number;
    valid: boolean;
  } | null = null;
  private clickMeter: {
    bx: number;
    by: number;
    azimuth: number;
    meter: number;
    charging: boolean;
  } | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
  }

  showLive(samples: readonly PointerSample[]): void {
    if (!tuning.debug.swipeOverlay) return;
    this.path = [...samples];
    this.arc = [];
    this.fade = 1;
  }

  showRelease(
    shot: AimedShot,
    launch: THREE.Vector3,
    samples: readonly PointerSample[],
    predicted?: readonly THREE.Vector3[],
  ): void {
    if (!tuning.debug.swipeOverlay) return;
    this.path = [...samples];
    this.fade = 1.6; // linger a bit after release
    this.arc = [];
    if (!tuning.debug.predictedArc) return;
    // Preferred: the ghost-world prediction (real physics, bounces included).
    // Fallback: the drag-free parabola, for callers without a predictor.
    if (predicted) {
      this.arc = predicted.map((p) => p.clone());
      return;
    }
    const g = tuning.world.gravity;
    const steps = 30;
    const tMax = shot.solution.flightTime * 1.15;
    for (let i = 0; i <= steps; i++) {
      const t = (tMax * i) / steps;
      this.arc.push(
        new THREE.Vector3(
          launch.x + shot.velocity.x * t,
          launch.y + shot.velocity.y * t - 0.5 * g * t * t,
          launch.z + shot.velocity.z * t,
        ),
      );
    }
  }

  /** Mid-flight steering readout: budget bar + live steer vector at the ball. */
  showSteerState(budgetFrac: number, vx: number, vy: number, ballScreen: { x: number; y: number }): void {
    if (!tuning.debug.swipeOverlay) return;
    this.steer = { budgetFrac, vx, vy, bx: ballScreen.x, by: ballScreen.y };
  }

  clearSteerState(): void {
    this.steer = null;
  }

  /**
   * Slingshot pull feedback (gameplay UI, not debug-gated): rubber band to the
   * grip, dashed aim guide opposite the pull, and a power meter with a notch
   * at the solved-perfect pull length.
   */
  showSlingshot(
    ballScreen: { x: number; y: number },
    drag: { dx: number; dy: number; len: number; valid: boolean },
  ): void {
    this.sling = { bx: ballScreen.x, by: ballScreen.y, ...drag };
  }

  clearSlingshot(): void {
    this.sling = null;
  }

  /**
   * Click-click aim feedback (gameplay UI, not debug-gated): dashed aim guide
   * — faint hover preview before the first click, solid once locked — plus
   * the sweeping arcade power meter while charging. Pushed every render frame.
   */
  showClickMeter(
    ballScreen: { x: number; y: number },
    state: { azimuth: number; meter: number; charging: boolean },
  ): void {
    this.clickMeter = { bx: ballScreen.x, by: ballScreen.y, ...state };
  }

  clearClickMeter(): void {
    this.clickMeter = null;
  }

  render(dt: number, camera: THREE.Camera): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.renderSlingshot();
    this.renderClickMeter();
    this.renderSteer();
    if (this.fade <= 0 || !tuning.debug.swipeOverlay) return;
    this.fade = Math.max(0, this.fade - dt);
    const alpha = Math.min(1, this.fade);

    if (this.path.length > 1) {
      ctx.strokeStyle = `rgba(120, 220, 255, ${0.85 * alpha})`;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < this.path.length; i++) {
        const p = this.path[i]!;
        const x = p.x * canvas.width;
        const y = p.y * canvas.height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Chord for curvature reading.
      const a = this.path[0]!;
      const b = this.path[this.path.length - 1]!;
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 * alpha})`;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
      ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    this.renderArc(camera);
  }

  private renderSlingshot(): void {
    const { ctx, canvas } = this;
    const s = this.sling;
    if (!s) return;
    const ss = tuning.slingshot;
    const x0 = s.bx * canvas.width;
    const y0 = s.by * canvas.height;
    const px = x0 + s.dx * canvas.width;
    const py = y0 + s.dy * canvas.height;

    // Rubber band: ball → grip. Fades when the pull wouldn't fire.
    const bandAlpha = s.valid ? 0.85 : 0.35;
    ctx.strokeStyle = `rgba(43, 29, 22, ${bandAlpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(px, py);
    ctx.stroke();
    // The grip knob under the cursor.
    ctx.fillStyle = '#f8f2e2';
    ctx.beginPath();
    ctx.arc(px, py, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (!s.valid) return;

    // Aim guide: dashed line opposite the pull (screen space), arrowhead tip.
    const gx = x0 - px;
    const gy = y0 - py;
    const gl = Math.hypot(gx, gy);
    if (gl > 1) {
      const ux = gx / gl;
      const uy = gy / gl;
      const powerFrac = Math.min(1.4, s.len / ss.referenceDragFrac);
      const guideLen = canvas.height * ss.guideLenFrac * (0.5 + 0.5 * powerFrac);
      this.drawAimGuide(x0, y0, ux, uy, guideLen);
    }

    // Arcade power meter beside the ball: red→green→red gradient with the
    // sweet spot (perfect power) at the notch, pointer at the current pull.
    // Offset scales with the viewport so it clears the (large) held ball.
    const mh = canvas.height * 0.15;
    const fill = Math.min(1, s.len / ss.maxDragFrac);
    const sweet = ss.referenceDragFrac / ss.maxDragFrac;
    this.drawArcadeMeter(x0 + canvas.height * 0.09, y0 - mh / 2, 12, mh, sweet, fill);
  }

  private renderClickMeter(): void {
    const { canvas } = this;
    const c = this.clickMeter;
    if (!c) return;
    const cc = tuning.clickclick;
    const x0 = c.bx * canvas.width;
    const y0 = c.by * canvas.height;

    // Aim guide: faint while it still follows the cursor, solid once the
    // first click locks it in.
    const ux = Math.sin(c.azimuth);
    const uy = -Math.cos(c.azimuth);
    this.drawAimGuide(x0, y0, ux, uy, canvas.height * cc.guideLenFrac, c.charging ? 0.95 : 0.5);
    if (!c.charging) return;

    // The sweeping meter — big and arcade, clamped onto the screen (the held
    // ball sits near the bottom edge) and offset to clear the ball.
    const mh = canvas.height * 0.24;
    const mw = 18;
    const my = Math.max(16, Math.min(y0 - mh * 0.5, canvas.height - mh - 20));
    this.drawArcadeMeter(x0 + canvas.height * 0.09, my, mw, mh, cc.sweetFrac, c.meter);
  }

  /** Dashed comic-red aim line with an arrowhead tip (slingshot + click-click). */
  private drawAimGuide(
    x0: number,
    y0: number,
    ux: number,
    uy: number,
    len: number,
    alpha = 0.95,
  ): void {
    const { ctx } = this;
    const tx = x0 + ux * len;
    const ty = y0 + uy * len;
    ctx.strokeStyle = `rgba(201, 86, 60, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 9]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrowhead.
    const ah = 14;
    ctx.fillStyle = `rgba(201, 86, 60, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(tx + ux * ah, ty + uy * ah);
    ctx.lineTo(tx - uy * ah * 0.55, ty + ux * ah * 0.55);
    ctx.lineTo(tx + uy * ah * 0.55, ty - ux * ah * 0.55);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Hit-the-middle color ramp: green at the sweet spot, through yellow and
   * orange to red at both ends. Each side normalizes independently so both
   * edges reach full red even when the sweet spot is off-center.
   */
  private static meterColorAt(f: number, sweet: number): string {
    const side = f < sweet ? Math.max(1e-6, sweet) : Math.max(1e-6, 1 - sweet);
    const d = Math.min(1, Math.abs(f - sweet) / side);
    // Distance stops: green → yellow → orange → red.
    const stops: [number, [number, number, number]][] = [
      [0, [47, 191, 79]],
      [0.25, [247, 201, 72]],
      [0.55, [242, 132, 46]],
      [1, [209, 52, 43]],
    ];
    for (let i = 1; i < stops.length; i++) {
      const [d1, c1] = stops[i]!;
      if (d > d1) continue;
      const [d0, c0] = stops[i - 1]!;
      const t = (d - d0) / (d1 - d0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * t);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * t);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }
    return 'rgb(209, 52, 43)';
  }

  /**
   * Arcade vertical power meter: full red→green→red gradient track (sweet
   * spot = perfect power), ink border, sweet-spot notch, chunky white pointer
   * at the current value. Meter fraction 0 = bottom, 1 = top.
   */
  private drawArcadeMeter(
    mx: number,
    my: number,
    mw: number,
    mh: number,
    sweet: number,
    value: number,
  ): void {
    const { ctx } = this;
    // Gradient track (f = 1 at the top edge).
    const grad = ctx.createLinearGradient(0, my, 0, my + mh);
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const yFrac = i / steps;
      grad.addColorStop(yFrac, SwipeOverlay.meterColorAt(1 - yFrac, sweet));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(43, 29, 22, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(mx, my, mw, mh);

    // Sweet-spot notch: ink wings flanking the green center.
    const sy = my + mh * (1 - sweet);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - 6, sy);
    ctx.lineTo(mx + mw + 6, sy);
    ctx.stroke();

    // Pointer: ink-outlined white bar + a triangle nub on the left edge.
    const py = my + mh * (1 - Math.max(0, Math.min(1, value)));
    ctx.strokeStyle = 'rgba(43, 29, 22, 0.95)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(mx - 5, py);
    ctx.lineTo(mx + mw + 5, py);
    ctx.stroke();
    ctx.strokeStyle = '#f8f2e2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mx - 5, py);
    ctx.lineTo(mx + mw + 5, py);
    ctx.stroke();
    ctx.fillStyle = '#f8f2e2';
    ctx.strokeStyle = 'rgba(43, 29, 22, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mx - 6, py);
    ctx.lineTo(mx - 14, py - 6);
    ctx.lineTo(mx - 14, py + 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  private renderSteer(): void {
    const { ctx, canvas } = this;
    const s = this.steer;
    if (!s || !tuning.debug.swipeOverlay) return;
    // Budget bar, bottom-center.
    const bw = canvas.width * 0.22;
    const bh = 8;
    const bx = (canvas.width - bw) / 2;
    const by = canvas.height - 34;
    ctx.fillStyle = 'rgba(43, 29, 22, 0.35)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = 'rgba(201, 86, 60, 0.95)';
    ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, s.budgetFrac)), bh);
    // Live steer vector from the ball.
    const mag = Math.hypot(s.vx, s.vy);
    if (mag > 0.02) {
      const x0 = s.bx * canvas.width;
      const y0 = s.by * canvas.height;
      const x1 = x0 + s.vx * canvas.width * 0.25;
      const y1 = y0 + s.vy * canvas.height * 0.25;
      ctx.strokeStyle = 'rgba(201, 86, 60, 0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  private renderArc(camera: THREE.Camera): void {
    const { ctx, canvas } = this;
    const alpha = Math.min(1, this.fade);
    if (this.arc.length > 1) {
      ctx.strokeStyle = `rgba(255, 190, 80, ${0.9 * alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      const v = new THREE.Vector3();
      for (const p of this.arc) {
        v.copy(p).project(camera);
        if (v.z > 1) continue; // behind camera
        const x = (v.x * 0.5 + 0.5) * canvas.width;
        const y = (-v.y * 0.5 + 0.5) * canvas.height;
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}
