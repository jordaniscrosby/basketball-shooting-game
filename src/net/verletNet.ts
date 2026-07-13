import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { RibbonBatch } from '../scene/inkRibbon';
import { hash01 } from '../scene/toon';

interface Particle {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  pinned: boolean;
}

/**
 * Visual-only Verlet net: a cols × rows particle lattice pinned to the rim,
 * tapering toward the bottom like a real net. The ball pushes particles as a
 * sphere; structural constraints (rings + verticals + diagonals) snap it
 * back. Never a gameplay collider — the rim capsules own the physics.
 *
 * Rendered as hand-drawn cords: each constraint is an ink stroke with a
 * paper-white core, widths slightly varied per cord.
 */
export class VerletNet {
  private readonly particles: Particle[] = [];
  private readonly constraints: Array<[number, number, number]> = []; // a, b, restLen
  private readonly inkBatch: RibbonBatch;
  private readonly coreBatch: RibbonBatch;
  private readonly camPos = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();
  private readonly cols = tuning.juice.netCols;
  private readonly rows = tuning.juice.netRows;

  constructor(scene: THREE.Scene, private readonly rimCenter: THREE.Vector3) {
    const { cols, rows } = this;
    const topR = derived.rimInnerRadius * 0.98;
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1);
      const radius = topR * (1 - 0.38 * t);
      const y = rimCenter.y - tuning.juice.netLength * t;
      for (let c = 0; c < cols; c++) {
        const a = (c / cols) * Math.PI * 2;
        const p = new THREE.Vector3(
          rimCenter.x + Math.cos(a) * radius,
          y,
          rimCenter.z + Math.sin(a) * radius,
        );
        this.particles.push({ pos: p, prev: p.clone(), pinned: r === 0 });
      }
    }

    const idx = (r: number, c: number) => r * cols + ((c + cols) % cols);
    const link = (a: number, b: number) => {
      const len = this.particles[a]!.pos.distanceTo(this.particles[b]!.pos);
      this.constraints.push([a, b, len]);
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        link(idx(r, c), idx(r, c + 1)); // ring
        if (r + 1 < rows) {
          link(idx(r, c), idx(r + 1, c)); // vertical
          link(idx(r, c), idx(r + 1, c + 1)); // diagonal (cord look + shear)
        }
      }
    }

    this.inkBatch = new RibbonBatch(scene, this.constraints.length);
    this.coreBatch = new RibbonBatch(scene, this.constraints.length);
  }

  /** Fixed-step update; ballPos/ballR push the cords aside. */
  update(dt: number, ballPos: THREE.Vector3, ballR: number): void {
    const damping = 0.985;
    const g = tuning.world.gravity * 0.6; // net cords are light + air-dragged
    const dt2 = dt * dt;
    for (const p of this.particles) {
      if (p.pinned) continue;
      const vx = (p.pos.x - p.prev.x) * damping;
      const vy = (p.pos.y - p.prev.y) * damping;
      const vz = (p.pos.z - p.prev.z) * damping;
      p.prev.copy(p.pos);
      p.pos.x += vx;
      p.pos.y += vy - g * dt2;
      p.pos.z += vz;
    }

    // Ball sphere push (slightly inflated so cords wrap, not clip).
    const rr = ballR * 1.08;
    for (const p of this.particles) {
      if (p.pinned) continue;
      const dx = p.pos.x - ballPos.x;
      const dy = p.pos.y - ballPos.y;
      const dz = p.pos.z - ballPos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < rr * rr && d2 > 1e-12) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / d;
        p.pos.x += dx * push;
        p.pos.y += dy * push;
        p.pos.z += dz * push;
      }
    }

    for (let it = 0; it < tuning.juice.netIterations; it++) {
      for (const [ai, bi, rest] of this.constraints) {
        const a = this.particles[ai]!;
        const b = this.particles[bi]!;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const dz = b.pos.z - a.pos.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const diff = (d - rest) / d;
        const wa = a.pinned ? 0 : b.pinned ? 1 : 0.5;
        const wb = b.pinned ? 0 : a.pinned ? 1 : 0.5;
        a.pos.x += dx * diff * wa;
        a.pos.y += dy * diff * wa;
        a.pos.z += dz * diff * wa;
        b.pos.x -= dx * diff * wb;
        b.pos.y -= dy * diff * wb;
        b.pos.z -= dz * diff * wb;
      }
    }
  }

  /** Extra downward tug for the swish moment. */
  ripple(strength = 0.05): void {
    for (const p of this.particles) {
      if (!p.pinned) p.pos.y -= strength * Math.random();
    }
  }

  /** Per-render-frame: rebuild the camera-facing cord ribbons. */
  render(camera: THREE.Camera): void {
    camera.getWorldPosition(this.camPos);
    this.inkBatch.begin(camera);
    this.coreBatch.begin(camera);
    const P = artTheme.palette;
    for (let i = 0; i < this.constraints.length; i++) {
      const [ai, bi] = this.constraints[i]!;
      const a = this.particles[ai]!.pos;
      const b = this.particles[bi]!.pos;
      const w = artTheme.net.cordWidth * (1 + (hash01(i) - 0.5) * 2 * artTheme.net.cordWidthVariance);
      this.inkBatch.quad(a.x, a.y, a.z, b.x, b.y, b.z, w * 1.9, w * 1.9, P.ink);
      // Paper core nudged toward the camera so it always sits on the ink.
      this.toCam
        .subVectors(this.camPos, a)
        .normalize()
        .multiplyScalar(0.004);
      this.coreBatch.quad(
        a.x + this.toCam.x, a.y + this.toCam.y, a.z + this.toCam.z,
        b.x + this.toCam.x, b.y + this.toCam.y, b.z + this.toCam.z,
        w, w, P.net,
      );
    }
    this.inkBatch.end();
    this.coreBatch.end();
  }
}
