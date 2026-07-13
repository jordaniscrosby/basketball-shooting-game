import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { toonMaterial, seededRng } from './toon';

/**
 * Cartoon basketball: flat orange cel with bold, slightly wobbly ink seams —
 * the seam texture is what makes backspin readable in flight. An authored
 * `public/art/ball.png` (equirect, see artAssets.ts) replaces the painting.
 */
export function createBallMesh(skinOverride?: THREE.Texture): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.SphereGeometry(tuning.ball.radius, 48, 32),
    toonMaterial({ map: skinOverride ?? paintBallTexture() }),
  );
}

function paintBallTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(0xba11);

  ctx.fillStyle = artTheme.palette.ball;
  ctx.fillRect(0, 0, c.width, c.height);

  ctx.strokeStyle = artTheme.palette.ink;
  ctx.lineCap = 'round';
  const wobble = () => (rng() - 0.5) * 5;
  const width = () => 11 * (0.8 + rng() * 0.4);

  // Equator seam (v = 0.5) and two meridians (u = 0.25, 0.75 wrap at 0/0.5),
  // each drawn in short hand-inked segments.
  const seamPath = (pts: Array<[number, number]>) => {
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = width();
      ctx.beginPath();
      ctx.moveTo(pts[i - 1]![0] + wobble(), pts[i - 1]![1] + wobble());
      ctx.lineTo(pts[i]![0] + wobble(), pts[i]![1] + wobble());
      ctx.stroke();
    }
  };
  const horiz: Array<[number, number]> = [];
  for (let i = 0; i <= 32; i++) horiz.push([(i / 32) * c.width, c.height / 2]);
  seamPath(horiz);
  for (const u of [0, 0.25, 0.5, 0.75]) {
    const vert: Array<[number, number]> = [];
    for (let i = 0; i <= 16; i++) vert.push([u * c.width, (i / 16) * c.height]);
    seamPath(vert);
  }
  // Two curved "hook" seams mirrored around the equator.
  for (const side of [-1, 1]) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 64; i++) {
      const u = i / 64;
      const v = 0.5 + side * (0.18 + 0.13 * Math.sin(u * Math.PI * 2));
      pts.push([u * c.width, v * c.height]);
    }
    seamPath(pts);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
