import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { seededRng } from './toon';

/**
 * Hand-drawn blob shadow under the ball — shadow maps are off in the cartoon
 * pipeline. An ink ellipse with a rough boiling edge that spreads and fades
 * as the ball rises.
 */
export class BlobShadow {
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly variants: THREE.CanvasTexture[] = [];

  constructor(scene: THREE.Scene) {
    for (let v = 0; v < artTheme.boil.variants; v++) {
      this.variants.push(paintBlob(0x5ade + v * 977));
    }
    this.mat = new THREE.MeshBasicMaterial({
      map: this.variants[0]!,
      transparent: true,
      opacity: artTheme.blobShadow.opacity,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 24), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  applyBoilFrame(frame: number): void {
    this.mat.map = this.variants[frame % this.variants.length]!;
  }

  update(ballPos: THREE.Vector3): void {
    const s = artTheme.blobShadow;
    const h = Math.max(0, ballPos.y - tuning.ball.radius);
    const r = tuning.ball.radius * s.radiusScale * (1 + s.growPerMeter * h);
    this.mesh.position.set(ballPos.x, 0.004, ballPos.z);
    this.mesh.scale.setScalar(r);
    const fade = Math.max(0, 1 - h / s.fadeHeight);
    this.mat.opacity = s.opacity * fade;
    this.mesh.visible = fade > 0.01;
  }
}

function paintBlob(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(seed);
  ctx.fillStyle = artTheme.palette.ink;
  ctx.beginPath();
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 52 * (0.92 + rng() * 0.14);
    const x = 64 + Math.cos(a) * r;
    const y = 64 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
