import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';

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
 */
export class VerletNet {
  private readonly particles: Particle[] = [];
  private readonly constraints: Array<[number, number, number]> = []; // a, b, restLen
  private readonly lines: THREE.LineSegments;
  private readonly positions: Float32Array;
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

    this.positions = new Float32Array(this.constraints.length * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xf2f4f6, transparent: true, opacity: 0.85 }),
    );
    this.lines.frustumCulled = false;
    scene.add(this.lines);
    this.writeGeometry();
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

    this.writeGeometry();
  }

  /** Extra downward tug for the swish moment. */
  ripple(strength = 0.05): void {
    for (const p of this.particles) {
      if (!p.pinned) p.pos.y -= strength * Math.random();
    }
  }

  private writeGeometry(): void {
    let i = 0;
    for (const [ai, bi] of this.constraints) {
      const a = this.particles[ai]!.pos;
      const b = this.particles[bi]!.pos;
      this.positions[i++] = a.x;
      this.positions[i++] = a.y;
      this.positions[i++] = a.z;
      this.positions[i++] = b.x;
      this.positions[i++] = b.y;
      this.positions[i++] = b.z;
    }
    this.lines.geometry.attributes.position!.needsUpdate = true;
  }
}
