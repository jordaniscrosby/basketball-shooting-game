import * as THREE from 'three';
import { tuning } from '../config/tuning';

/**
 * Basketball mesh with painted seams — the seam texture is what makes
 * backspin readable in flight.
 */
export function createBallMesh(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(tuning.ball.radius, 48, 32),
    new THREE.MeshStandardMaterial({ map: paintBallTexture(), roughness: 0.62 }),
  );
  mesh.castShadow = true;
  return mesh;
}

function paintBallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;

  // Pebbled leather base with slight vertical shading.
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#e06a28');
  grad.addColorStop(0.5, '#d95f1e');
  grad.addColorStop(1, '#c8541a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = '#2b2018';
  ctx.lineWidth = 7;

  // Equator seam (v = 0.5) and two meridians (u = 0.25, 0.75 wrap at 0/0.5).
  ctx.beginPath();
  ctx.moveTo(0, c.height / 2);
  ctx.lineTo(c.width, c.height / 2);
  ctx.stroke();
  for (const u of [0, 0.25, 0.5, 0.75]) {
    ctx.beginPath();
    ctx.moveTo(u * c.width, 0);
    ctx.lineTo(u * c.width, c.height);
    ctx.stroke();
  }
  // Two curved "hook" seams mirrored around the equator.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= 128; i++) {
      const u = i / 128;
      const v = 0.5 + side * (0.18 + 0.13 * Math.sin(u * Math.PI * 2));
      const x = u * c.width;
      const y = v * c.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
