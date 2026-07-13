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

  render(dt: number, camera: THREE.Camera): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
