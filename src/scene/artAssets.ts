import * as THREE from 'three';

/**
 * Authored-texture override slots. Every procedurally painted canvas texture
 * has a named slot; dropping `public/art/<slot>.png` replaces the procedural
 * painting with the authored image — no code change, missing files fall back
 * silently. See public/art/README.md for each slot's canvas size/orientation.
 *
 * Ownership rule: files under public/art/ are hand-authored — never generated
 * or overwritten by tooling.
 */

export const ART_SLOTS = [
  'ball',
  'court-floor',
  'backboard',
  'grass',
  'backdrop',
  'cow-hide',
] as const;

export type ArtSlot = (typeof ART_SLOTS)[number];
export type ArtOverrides = Partial<Record<ArtSlot, THREE.CanvasTexture>>;

async function loadSlot(slot: ArtSlot): Promise<THREE.CanvasTexture | null> {
  try {
    const res = await fetch(`/art/${slot}.png`);
    if (!res.ok || !(res.headers.get('content-type') ?? '').startsWith('image/')) return null;
    const bmp = await createImageBitmap(await res.blob());
    // Draw onto a canvas so overrides go through the exact same texture
    // pathway (CanvasTexture, flipY) as the procedural paintings they replace.
    const c = document.createElement('canvas');
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  } catch {
    return null;
  }
}

export async function loadArtOverrides(): Promise<ArtOverrides> {
  const out: ArtOverrides = {};
  const found: string[] = [];
  await Promise.all(
    ART_SLOTS.map(async (slot) => {
      const tex = await loadSlot(slot);
      if (tex) {
        out[slot] = tex;
        found.push(slot);
      }
    }),
  );
  if (found.length > 0) console.log(`[art] authored overrides active: ${found.join(', ')}`);
  return out;
}
