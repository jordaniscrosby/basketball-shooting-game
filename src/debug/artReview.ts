import * as THREE from 'three';
import { artTheme } from '../config/artTheme';

/**
 * Art-review mode (`?art=<preset>`): fixed camera poses for reproducible
 * before/after screenshots of each visual element. Activating a preset pins
 * the ball at the free-throw spot, freezes the line boil, hides the HUD
 * (body.art-review in hud.css), and parks the camera — so two captures of
 * the same preset are pixel-comparable.
 *
 * Poses are dev chrome, deliberately outside artTheme (same rule as the
 * swipe overlay's colors). bench/cow poses mirror the prop positions
 * hardcoded in scene/court.buildParkProps.
 */

export const ART_REVIEW_PRESETS = [
  'ball',
  'hoop',
  'wide',
  'court',
  'bench',
  'cow',
  'backdrop',
] as const;

export type ArtReviewPreset = (typeof ART_REVIEW_PRESETS)[number];

export function artReviewFromUrl(): ArtReviewPreset | null {
  try {
    const v = new URLSearchParams(window.location.search).get('art');
    return v !== null && (ART_REVIEW_PRESETS as readonly string[]).includes(v)
      ? (v as ArtReviewPreset)
      : null;
  } catch {
    return null;
  }
}

type Pose = { eye: [number, number, number]; look: [number, number, number] };

export function applyArtReview(
  preset: ArtReviewPreset,
  camera: THREE.PerspectiveCamera,
  ballPos: THREE.Vector3,
  rimCenter: THREE.Vector3,
): void {
  // Freeze the boil clock — captures must be identical frame to frame.
  artTheme.boil.rateHz = 0;
  const rz = rimCenter.z;
  const poses: Record<ArtReviewPreset, Pose> = {
    ball: {
      eye: [ballPos.x + 0.55, ballPos.y + 0.18, ballPos.z + 0.9],
      look: [ballPos.x, ballPos.y, ballPos.z],
    },
    hoop: { eye: [1.9, rimCenter.y + 0.45, rz + 3.2], look: [rimCenter.x, rimCenter.y, rz] },
    wide: { eye: [0, 4.2, rz + 20], look: [0, 2.4, rz] },
    court: { eye: [0, 13, rz + 7.5], look: [0, 0, rz + 3] },
    bench: { eye: [-8.0, 1.4, -9.4], look: [-10.6, 0.55, -11.2] },
    cow: { eye: [8.2, 1.5, -12.2], look: [10.5, 1.0, -14.2] },
    backdrop: { eye: [0, 2.2, 4], look: [0, 7.5, -28] },
  };
  const p = poses[preset];
  camera.position.set(...p.eye);
  camera.lookAt(new THREE.Vector3(...p.look));
}
