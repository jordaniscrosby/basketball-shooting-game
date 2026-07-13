import * as THREE from 'three';
import { artTheme } from '../config/artTheme';
import { seededRng } from './toon';

/**
 * Inverted-hull ink outlines with line boil. Each outlined mesh gets
 * artTheme.boil.variants pre-jittered hull copies (BackSide, flat ink);
 * the boiler cycles which variant is visible at boil.rateHz — hand-drawn
 * "animation on threes" without per-frame geometry work.
 *
 * Hulls displace along *smoothed* normals (normals averaged across vertices
 * sharing a position) so hard-edged meshes (box backboard) don't split open
 * at the corners.
 */
export class OutlineBoiler {
  private readonly groups: THREE.Mesh[][] = [];
  private readonly cycleCbs: Array<(frame: number) => void> = [];
  private clock = 0;
  private frame = 0;

  /** Register other boiling elements (court/board texture swaps, blob shadow). */
  onCycle(cb: (frame: number) => void): void {
    this.cycleCbs.push(cb);
  }

  /** Adds boiling outline hulls as children of the mesh. Returns them for disposal. */
  outline(mesh: THREE.Mesh, width: number): THREE.Mesh[] {
    const variants: THREE.Mesh[] = [];
    const base = mesh.geometry;
    const smoothed = smoothedNormals(base);
    for (let v = 0; v < artTheme.boil.variants; v++) {
      const geo = base.clone();
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const rng = seededRng(0xa11ce + v * 7919);
      for (let i = 0; i < pos.count; i++) {
        const n = smoothed[i]!;
        const j = artTheme.boil.hullJitter;
        pos.setXYZ(
          i,
          pos.getX(i) + n.x * width + (rng() - 0.5) * 2 * j,
          pos.getY(i) + n.y * width + (rng() - 0.5) * 2 * j,
          pos.getZ(i) + n.z * width + (rng() - 0.5) * 2 * j,
        );
      }
      pos.needsUpdate = true;
      const hull = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ color: artTheme.palette.ink, side: THREE.BackSide }),
      );
      hull.visible = v === 0;
      // Render the hull just before its parent so ink never z-fights the fill.
      hull.renderOrder = (mesh.renderOrder ?? 0) - 1;
      mesh.add(hull);
      variants.push(hull);
    }
    this.groups.push(variants);
    return variants;
  }

  /** Advance the boil clock (call once per render frame). */
  update(dt: number): void {
    this.clock += dt;
    const step = 1 / Math.max(0.001, artTheme.boil.rateHz);
    if (this.clock < step) return;
    this.clock %= step;
    this.frame++;
    for (const variants of this.groups) {
      for (let i = 0; i < variants.length; i++) {
        variants[i]!.visible = i === this.frame % variants.length;
      }
    }
    for (const cb of this.cycleCbs) cb(this.frame);
  }
}

/** Per-vertex normals averaged across all vertices sharing a position. */
function smoothedNormals(geo: THREE.BufferGeometry): THREE.Vector3[] {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const byKey = new Map<string, THREE.Vector3>();
  const keys: string[] = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    keys.push(key);
    let acc = byKey.get(key);
    if (!acc) {
      acc = new THREE.Vector3();
      byKey.set(key, acc);
    }
    acc.add(new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)));
  }
  for (const v of byKey.values()) v.normalize();
  return keys.map((k) => byKey.get(k)!);
}
