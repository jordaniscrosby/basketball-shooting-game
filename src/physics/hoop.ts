import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';

export interface Hoop {
  body: RAPIER.RigidBody;
  rimColliders: RAPIER.Collider[];
  boardCollider: RAPIER.Collider;
  /** World position of the rim centre (on the rim plane). */
  rimCenter: THREE.Vector3;
  /** Remove all hoop colliders/body from the world (for live rebuilds). */
  dispose: () => void;
}

/**
 * Procedural collision hoop: the rim is a ring of capsules approximating the
 * 16 mm steel torus (no trimesh — convex shapes keep CCD honest), plus a
 * backboard cuboid. All dimensions come from tuning.ts.
 */
export function createHoop(world: RAPIER.World): Hoop {
  const rimY = tuning.rim.height;
  const rimZ = derived.rimCenterZ;
  const rimCenter = new THREE.Vector3(0, rimY, rimZ);

  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());

  // Ring of capsules. Capsule axis is local Y; rotate Y onto the ring tangent.
  const n = Math.round(tuning.rim.capsuleCount);
  const rodR = tuning.rim.rodRadius;
  const ringR = derived.rimInnerRadius + rodR; // centreline of the rod
  const halfLen = (Math.PI * ringR) / n; // half of arc length, slight overlap
  const up = new THREE.Vector3(0, 1, 0);
  const rimColliders: RAPIER.Collider[] = [];
  for (let i = 0; i < n; i++) {
    const phi = (i / n) * Math.PI * 2;
    const cx = Math.cos(phi) * ringR;
    const cz = rimZ + Math.sin(phi) * ringR;
    const tangent = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
    const q = new THREE.Quaternion().setFromUnitVectors(up, tangent);
    const collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(halfLen, rodR)
        .setTranslation(cx, rimY, cz)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setRestitution(tuning.rim.restitution)
        .setFriction(tuning.rim.friction)
        .setContactSkin(tuning.rim.contactSkin)
        // Min: the rim's dead restitution must win over the lively ball.
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
      body,
    );
    rimColliders.push(collider);
  }

  // Backboard: face toward the court (+z side), rim gap per spec.
  const bb = tuning.backboard;
  const faceZ = derived.backboardFaceZ;
  const boardCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(bb.width / 2, bb.height / 2, bb.thickness / 2)
      .setTranslation(0, bb.bottomEdge + bb.height / 2, faceZ - bb.thickness / 2)
      .setRestitution(bb.restitution)
      .setFriction(bb.friction)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min),
    body,
  );

  return {
    body,
    rimColliders,
    boardCollider,
    rimCenter,
    dispose: () => world.removeRigidBody(body),
  };
}

/** Apply live tuning (restitution/friction) to existing hoop colliders. */
export function applyHoopMaterials(hoop: Hoop): void {
  for (const c of hoop.rimColliders) {
    c.setRestitution(tuning.rim.restitution);
    c.setFriction(tuning.rim.friction);
  }
  hoop.boardCollider.setRestitution(tuning.backboard.restitution);
  hoop.boardCollider.setFriction(tuning.backboard.friction);
}
