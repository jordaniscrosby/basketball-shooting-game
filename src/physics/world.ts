import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';

let rapierReady: Promise<void> | null = null;

export function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

/** Interpolation bookkeeping for one dynamic body rendered by three.js. */
export interface TrackedBody {
  body: RAPIER.RigidBody;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
}

export function snapshotBody(t: TrackedBody): void {
  t.prevPos.copy(t.currPos);
  t.prevRot.copy(t.currRot);
  const p = t.body.translation();
  const r = t.body.rotation();
  t.currPos.set(p.x, p.y, p.z);
  t.currRot.set(r.x, r.y, r.z, r.w);
}

export function applyInterpolated(t: TrackedBody, target: THREE.Object3D, alpha: number): void {
  target.position.lerpVectors(t.prevPos, t.currPos, alpha);
  target.quaternion.slerpQuaternions(t.prevRot, t.currRot, alpha);
}

/** Force interpolation state to the body's current transform (teleports). */
export function resetTracking(t: TrackedBody): void {
  const p = t.body.translation();
  const r = t.body.rotation();
  t.currPos.set(p.x, p.y, p.z);
  t.currRot.set(r.x, r.y, r.z, r.w);
  t.prevPos.copy(t.currPos);
  t.prevRot.copy(t.currRot);
}

export interface PhysicsWorld {
  world: RAPIER.World;
  events: RAPIER.EventQueue;
  floorCollider: RAPIER.Collider;
}

export function createPhysicsWorld(): PhysicsWorld {
  const world = new RAPIER.World({ x: 0, y: -tuning.world.gravity, z: 0 });
  world.timestep = 1 / tuning.world.stepHz;

  const events = new RAPIER.EventQueue(true);

  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const floorCollider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(60, 0.5, 60)
      .setTranslation(0, -0.5, 0)
      .setRestitution(tuning.floor.restitution)
      .setFriction(tuning.floor.friction),
    floorBody,
  );

  return { world, events, floorCollider };
}

export interface Ball {
  tracked: TrackedBody;
  collider: RAPIER.Collider;
}

export function createBall(world: RAPIER.World, position: THREE.Vector3): Ball {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .setAngularDamping(tuning.ball.angularDamping)
      .setLinearDamping(tuning.ball.linearDamping)
      .setCcdEnabled(true)
      .setSoftCcdPrediction(tuning.ball.softCcdPrediction),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.ball(derived.ballCollisionRadius)
      .setMass(tuning.ball.mass)
      .setRestitution(tuning.ball.restitution)
      .setFriction(tuning.ball.friction)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
    body,
  );
  const tracked: TrackedBody = {
    body,
    prevPos: position.clone(),
    currPos: position.clone(),
    prevRot: new THREE.Quaternion(),
    currRot: new THREE.Quaternion(),
  };
  return { tracked, collider };
}
