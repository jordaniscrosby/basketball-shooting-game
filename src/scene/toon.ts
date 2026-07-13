import * as THREE from 'three';
import { artTheme } from '../config/artTheme';

let gradientMap: THREE.DataTexture | null = null;

function writeGradient(tex: THREE.DataTexture): void {
  const steps = Math.max(2, Math.round(artTheme.cel.steps));
  const data = tex.image.data as Uint8Array;
  for (let i = 0; i < steps; i++) {
    const t = artTheme.cel.lowestStep + (1 - artTheme.cel.lowestStep) * (i / (steps - 1));
    const v = Math.round(t * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  tex.needsUpdate = true;
}

/**
 * Shared N-step gradient map (NearestFilter) — the whole cel look in one
 * texture. Steps and darkest-tone depth come from artTheme.
 */
export function toonGradientMap(): THREE.DataTexture {
  if (gradientMap) return gradientMap;
  const steps = Math.max(2, Math.round(artTheme.cel.steps));
  const tex = new THREE.DataTexture(new Uint8Array(steps * 4), steps, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  writeGradient(tex);
  gradientMap = tex;
  return tex;
}

/** Live-update the shared gradient map after artTheme.cel changes (GUI hook). */
export function refreshGradientMap(): void {
  if (gradientMap) writeGradient(gradientMap);
}

/** Flat cel material — the only lit material type in the v2 look. */
export function toonMaterial(
  opts: { color?: string | number; map?: THREE.Texture } = {},
): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({ gradientMap: toonGradientMap() });
  if (opts.color !== undefined) mat.color.set(opts.color);
  if (opts.map) mat.map = opts.map;
  return mat;
}

/** Deterministic per-index hash → [0, 1). Keeps boil/wobble stable across frames. */
export function hash01(n: number): number {
  let x = (n | 0) * 0x9e3779b1;
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca77);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

/** Seeded mulberry32 RNG for pre-baked jitter variants. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
