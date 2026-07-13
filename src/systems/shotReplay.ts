import * as THREE from 'three';
import type { Ball } from '../physics/world';
import { resetTracking } from '../physics/world';
import type { SteerTimelineEntry } from './curve';

export interface RecordedShot {
  launch: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  /** Per-step steering forces applied in flight (empty = pure ballistic shot). */
  steerTimeline: SteerTimelineEntry[];
}

/**
 * Deterministic shot replay: capture the exact release state and re-fire it.
 * Rapier is locally deterministic, so an identical release + the recorded
 * steer-force timeline reproduces the identical trajectory — the debugging
 * backbone for all physics tuning.
 */
export class ShotReplay {
  private last: RecordedShot | null = null;

  record(launch: THREE.Vector3, velocity: THREE.Vector3, angularVelocity: THREE.Vector3): void {
    this.last = {
      launch: launch.clone(),
      velocity: velocity.clone(),
      angularVelocity: angularVelocity.clone(),
      steerTimeline: [],
    };
  }

  /** Attach the flight's applied steering timeline once it resolves. */
  attachSteerTimeline(timeline: SteerTimelineEntry[]): void {
    if (this.last) this.last.steerTimeline = timeline;
  }

  /** The recorded steering timeline for the pending replay (empty if none). */
  get steerTimeline(): SteerTimelineEntry[] {
    return this.last ? [...this.last.steerTimeline] : [];
  }

  get hasShot(): boolean {
    return this.last !== null;
  }

  /** The full recorded shot (null before the first release). */
  get recordedShot(): RecordedShot | null {
    return this.last;
  }

  /** Re-fire the recorded shot. Returns false if nothing recorded. */
  fire(ball: Ball): boolean {
    if (!this.last) return false;
    const { launch, velocity, angularVelocity } = this.last;
    const body = ball.tracked.body;
    body.setTranslation({ x: launch.x, y: launch.y, z: launch.z }, true);
    body.setLinvel({ x: velocity.x, y: velocity.y, z: velocity.z }, true);
    body.setAngvel({ x: angularVelocity.x, y: angularVelocity.y, z: angularVelocity.z }, true);
    body.resetForces(true);
    body.resetTorques(true);
    resetTracking(ball.tracked);
    return true;
  }
}
