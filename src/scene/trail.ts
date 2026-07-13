import * as THREE from 'three';
import { tuning } from '../config/tuning';

/**
 * Ball motion trail: a fading ribbon of recent flight positions. Vertex
 * colors fade toward the tail; heat shifts the head color from white-orange
 * to flame.
 */
export class BallTrail {
  private readonly line: THREE.Line;
  private readonly points: THREE.Vector3[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly headColor = new THREE.Color(0xffc88a);
  private active = false;

  constructor(scene: THREE.Scene) {
    const n = tuning.juice.trailLength;
    this.positions = new Float32Array(n * 3);
    this.colors = new Float32Array(n * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8 }),
    );
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
  }

  setHeat(heat: 'cold' | 'warm' | 'fire'): void {
    this.headColor.set(heat === 'fire' ? 0xff5a1a : heat === 'warm' ? 0xffa64d : 0xffc88a);
  }

  start(): void {
    this.points.length = 0;
    this.active = true;
    this.line.visible = true;
  }

  stop(): void {
    this.active = false;
    this.line.visible = false;
  }

  push(pos: THREE.Vector3): void {
    if (!this.active) return;
    this.points.push(pos.clone());
    if (this.points.length > tuning.juice.trailLength) this.points.shift();
    const n = this.points.length;
    const c = new THREE.Color();
    for (let i = 0; i < tuning.juice.trailLength; i++) {
      const p = this.points[Math.min(i, n - 1)] ?? pos;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      const k = n > 1 ? i / (n - 1) : 0; // 0 tail → 1 head
      c.copy(this.headColor).multiplyScalar(k * k);
      this.colors[i * 3] = c.r;
      this.colors[i * 3 + 1] = c.g;
      this.colors[i * 3 + 2] = c.b;
    }
    this.line.geometry.attributes.position!.needsUpdate = true;
    this.line.geometry.attributes.color!.needsUpdate = true;
  }
}
