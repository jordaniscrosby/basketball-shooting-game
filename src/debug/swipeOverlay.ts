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

  render(dt: number, camera: THREE.Camera): void {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
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
