import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { RibbonBatch } from './inkRibbon';
import { hash01 } from './toon';

/**
 * Ball motion trail, cartoon edition: hand-drawn speed-line dashes that
 * taper toward the tail. Cold = ink strokes; heat swaps them for flame
 * doodle colors.
 */
export class BallTrail {
  private readonly batch: RibbonBatch;
  private readonly points: THREE.Vector3[] = [];
  private color: string = artTheme.palette.ink;
  private steering = false;
  private active = false;

  constructor(scene: THREE.Scene) {
    this.batch = new RibbonBatch(scene, tuning.juice.trailLength, { opacity: 0.9 });
  }

  setHeat(heat: 'cold' | 'warm' | 'fire' | 'superstar'): void {
    this.color =
      heat === 'superstar' || heat === 'fire'
        ? artTheme.palette.star
        : heat === 'warm'
          ? artTheme.palette.fire
          : artTheme.palette.ink;
  }

  /** Tint shift while the player is curving the ball — the visible "why". */
  setSteering(active: boolean): void {
    this.steering = active;
  }

  start(): void {
    this.points.length = 0;
    this.active = true;
    this.steering = false;
    this.batch.visible = true;
  }

  stop(): void {
    this.active = false;
    this.batch.visible = false;
  }

  push(pos: THREE.Vector3): void {
    if (!this.active) return;
    this.points.push(pos.clone());
    if (this.points.length > tuning.juice.trailLength) this.points.shift();
  }

  /** Per-render-frame: rebuild the dash ribbons facing the camera. */
  render(camera: THREE.Camera): void {
    if (!this.active) return;
    this.batch.begin(camera);
    const n = this.points.length;
    const every = Math.max(1, artTheme.trail.dashEvery);
    for (let i = 1; i < n; i++) {
      // Dash pattern: draw `every` segments, skip `every`.
      if (Math.floor(i / every) % 2 === 1) continue;
      const a = this.points[i - 1]!;
      const b = this.points[i]!;
      const k = n > 1 ? i / (n - 1) : 0; // 0 tail → 1 head
      const w = artTheme.trail.dashWidth * (0.25 + 0.75 * k) * (0.85 + 0.3 * hash01(i));
      const color = this.steering ? artTheme.palette.courtAccent : this.color;
      this.batch.quad(a.x, a.y, a.z, b.x, b.y, b.z, w, w, color);
    }
    this.batch.end();
  }
}
