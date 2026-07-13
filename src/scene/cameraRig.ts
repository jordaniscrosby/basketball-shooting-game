import * as THREE from 'three';
import { tuning } from '../config/tuning';
import type { ShotPosition } from '../config/positions';
import { launchPointFor } from '../config/positions';

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Hoop-centered camera rig. Behind-ball hover at each position (auto-aligned
 * so the hoop is screen-centered), eased fly-to between positions — the
 * pacing beat — and a gentle push-in toward the hoop after release.
 */
export class CameraRig {
  private readonly eye = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fromEye = new THREE.Vector3();
  private readonly fromLook = new THREE.Vector3();
  private readonly toEye = new THREE.Vector3();
  private readonly toLook = new THREE.Vector3();
  private flyT = 1;
  private flyDuration = 1;
  private pushT = 1;
  private pushFrom = new THREE.Vector3();
  private onArrive: (() => void) | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly rimCenter: THREE.Vector3,
  ) {}

  /** Camera pose for hovering at a shot position. */
  poseFor(pos: ShotPosition): { eye: THREE.Vector3; look: THREE.Vector3 } {
    const launch = launchPointFor(pos);
    const toHoop = new THREE.Vector3().subVectors(this.rimCenter, launch).setY(0).normalize();
    const eye = launch
      .clone()
      .addScaledVector(toHoop, -tuning.camera.back)
      .setY(tuning.camera.up + 1.6);
    const look = this.rimCenter.clone().add(new THREE.Vector3(0, 0.15, 0));
    return { eye, look };
  }

  /** Snap instantly (initial spawn, instant retry). */
  snapTo(pos: ShotPosition): void {
    const { eye, look } = this.poseFor(pos);
    this.eye.copy(eye);
    this.look.copy(look);
    this.flyT = 1;
    this.pushT = 1;
    this.apply();
  }

  /** Eased fly-to; onArrive fires once when the transition lands. */
  flyTo(pos: ShotPosition, onArrive?: () => void): void {
    const { eye, look } = this.poseFor(pos);
    this.fromEye.copy(this.eye);
    this.fromLook.copy(this.look);
    this.toEye.copy(eye);
    this.toLook.copy(look);
    this.flyT = 0;
    this.flyDuration = tuning.camera.flyTime;
    this.pushT = 1;
    this.onArrive = onArrive ?? null;
  }

  /** Gentle push-in toward the hoop while the ball flies. */
  startReleasePush(): void {
    this.pushFrom.copy(this.eye);
    this.pushT = 0;
  }

  update(dt: number): void {
    if (this.flyT < 1) {
      this.flyT = Math.min(1, this.flyT + dt / this.flyDuration);
      const k = easeInOutCubic(this.flyT);
      this.eye.lerpVectors(this.fromEye, this.toEye, k);
      this.look.lerpVectors(this.fromLook, this.toLook, k);
      if (this.flyT >= 1 && this.onArrive) {
        const cb = this.onArrive;
        this.onArrive = null;
        cb();
      }
    } else if (this.pushT < 1) {
      this.pushT = Math.min(1, this.pushT + dt / 1.1);
      const k = easeOutCubic(this.pushT);
      const dir = new THREE.Vector3().subVectors(this.rimCenter, this.pushFrom).normalize();
      this.eye.copy(this.pushFrom).addScaledVector(dir, tuning.camera.releasePushIn * k);
    }
    this.apply();
  }

  private apply(): void {
    this.camera.position.copy(this.eye);
    this.camera.lookAt(this.look);
  }
}
