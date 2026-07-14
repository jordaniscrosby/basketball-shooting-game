import * as THREE from 'three';
import { artTheme } from '../config/artTheme';
import { RibbonBatch } from './inkRibbon';

/**
 * The aim-time flight preview: a dotted ink arc through the predicted ball
 * positions (systems/trajectory.ts), dots shrinking toward the future.
 * At release, ignite() relights the same path as one CONTINUOUS solid-gold
 * ribbon (never dotted) that fades out — the shot's afterimage. The ribbon
 * is a RibbonBatch (camera-facing quads) so it needs the camera each frame.
 * Visual-only — never a collider.
 */
export class TrajectoryLine {
  private readonly mesh: THREE.InstancedMesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly ribbon: RibbonBatch;
  private readonly dummy = new THREE.Object3D();
  private readonly capacity: number;
  private mode: 'off' | 'aim' | 'flash' = 'off';
  private flashT = 0;
  private flashPoints: readonly THREE.Vector3[] = [];

  constructor(scene: THREE.Scene, capacity = 256) {
    this.capacity = capacity;
    const t = artTheme.trajectory;
    this.mat = new THREE.MeshBasicMaterial({
      color: t.color,
      transparent: true,
      opacity: t.opacity,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.mat, capacity);
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false; // instances span the court; skip stale-bounds culling
    scene.add(this.mesh);
    this.ribbon = new RibbonBatch(scene, capacity, { opacity: 1 });
    this.ribbon.visible = false;
  }

  /** Aim preview: ink dots along the predicted points (every Nth, shrinking). */
  show(points: readonly THREE.Vector3[]): void {
    const t = artTheme.trajectory;
    this.mode = 'aim';
    this.layDots(points);
    this.mat.color.set(t.color);
    this.mat.opacity = t.opacity;
  }

  /** Hide the aim preview. A release flash owns the line until it fades. */
  hide(): void {
    if (this.mode !== 'aim') return;
    this.clear();
  }

  /** The shot fired: relight the path as a solid ribbon, then fade (update). */
  ignite(points: readonly THREE.Vector3[]): void {
    this.mode = 'flash';
    this.flashT = artTheme.trajectory.releaseFadeSec;
    this.flashPoints = points;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.ribbon.visible = true;
  }

  /** Per render frame: rebuild the camera-facing ribbon and decay the flash. */
  update(frameDt: number, camera: THREE.Camera): void {
    if (this.mode !== 'flash') return;
    const t = artTheme.trajectory;
    this.flashT -= frameDt;
    if (this.flashT <= 0) {
      this.clear();
      return;
    }
    this.ribbon.opacity =
      t.releaseOpacity * Math.min(1, this.flashT / Math.max(1e-6, t.releaseFadeSec));
    const pts = this.flashPoints;
    const last = Math.max(1, pts.length - 1);
    this.ribbon.begin(camera);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      const wA = t.releaseWidth * (1 - (1 - t.endScale) * ((i - 1) / last));
      const wB = t.releaseWidth * (1 - (1 - t.endScale) * (i / last));
      this.ribbon.quad(a.x, a.y, a.z, b.x, b.y, b.z, wA, wB, t.releaseColor);
    }
    this.ribbon.end();
  }

  private layDots(points: readonly THREE.Vector3[]): void {
    const t = artTheme.trajectory;
    const every = Math.max(1, Math.round(t.everyN));
    const last = Math.max(1, points.length - 1);
    let n = 0;
    for (let i = 0; i < points.length && n < this.capacity; i += every) {
      const k = i / last;
      this.dummy.position.copy(points[i]!);
      this.dummy.scale.setScalar(t.dotRadius * (1 - (1 - t.endScale) * k));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n++, this.dummy.matrix);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = n > 0;
  }

  private clear(): void {
    this.mode = 'off';
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.ribbon.visible = false;
    this.flashPoints = [];
  }
}
