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

  showRelease(shot: AimedShot, launch: THREE.Vector3, samples: readonly PointerSample[]): void {
    if (!tuning.debug.swipeOverlay) return;
    this.path = [...samples];
    this.fade = 1.6; // linger a bit after release
    this.arc = [];
    if (!tuning.debug.predictedArc) return;
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

  render(dt: number, camera: THREE.Camera): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.renderSlingshot();
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
      const tx = x0 + ux * guideLen;
      const ty = y0 + uy * guideLen;
      ctx.strokeStyle = 'rgba(201, 86, 60, 0.95)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 9]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);
      // Arrowhead.
      const ah = 14;
      ctx.fillStyle = 'rgba(201, 86, 60, 0.95)';
      ctx.beginPath();
      ctx.moveTo(tx + ux * ah, ty + uy * ah);
      ctx.lineTo(tx - uy * ah * 0.55, ty + ux * ah * 0.55);
      ctx.lineTo(tx + uy * ah * 0.55, ty - ux * ah * 0.55);
      ctx.closePath();
      ctx.fill();
    }

    // Power meter beside the ball: fill vs max pull, notch at perfect power.
    const mh = canvas.height * 0.15;
    const mw = 10;
    const mx = x0 + 46;
    const my = y0 - mh / 2;
    const fill = Math.min(1, s.len / ss.maxDragFrac);
    const notch = ss.referenceDragFrac / ss.maxDragFrac;
    ctx.fillStyle = 'rgba(43, 29, 22, 0.3)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = 'rgba(247, 201, 72, 0.95)';
    ctx.fillRect(mx, my + mh * (1 - fill), mw, mh * fill);
    ctx.strokeStyle = 'rgba(43, 29, 22, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, mw, mh);
    // Perfect-power notch.
    const ny = my + mh * (1 - notch);
    ctx.beginPath();
    ctx.moveTo(mx - 4, ny);
    ctx.lineTo(mx + mw + 4, ny);
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
