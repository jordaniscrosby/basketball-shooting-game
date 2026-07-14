import * as THREE from 'three';
import { tuning } from '../config/tuning';

/** Live steer command from the input layer (viewport fractions/s). */
export interface SteerCommand {
  /** Screen-x drag velocity (viewport widths/s, positive right). */
  vx: number;
  /** Screen-y drag velocity (viewport heights/s, positive DOWN — raw screen). */
  vy: number;
  /** Physics-step timestamp the command was received at (steps since release). */
  atStep: number;
}

/** One applied steering force sample — the deterministic replay unit. */
export interface SteerTimelineEntry {
  /** Physics step index since release. */
  step: number;
  /** Applied world-space force (N). */
  x: number;
  y: number;
  z: number;
}

/** Per-flight curve record, consumed by Phase 7 bonus detectors. */
export interface CurveTelemetry {
  /** Total steering Δv actually applied (m/s). */
  dvSpent: number;
  /** Max |deviation| from the unsteered ballistic ghost, lateral axis (m). */
  maxLateralDev: number;
  /** Max 3D deviation from the ghost (m). */
  maxDev: number;
  /**
   * Direction coherence of the applied steering, |Σ Δv⃗| / Σ |Δv⃗| ∈ [0, 1]:
   * 1 = one clean arc, → 0 = frantic zigzag. The steez signal.
   */
  smoothness: number;
  /** Δv spent along +lateralAxis (m/s) — one half of the SNAKE!! signal. */
  dvLatPos: number;
  /** Δv spent along −lateralAxis (m/s) — the other half. */
  dvLatNeg: number;
  /** True once any meaningful Δv was applied. */
  steered: boolean;
}

const EPS_DV = 1e-3;

/**
 * Mid-flight curve steering (body English). Owns the per-flight Δv budget,
 * converts live screen-space drag commands into camera-relative world forces,
 * integrates the unsteered ballistic ghost for fairness-grade telemetry, and
 * records the applied-force timeline so curved shots replay deterministically.
 *
 * Pure math — no Rapier types — so the whole thing unit-tests in node.
 */
export class FlightSteer {
  private budgetLeft = 0;
  private stepIndex = 0;
  private command: SteerCommand | null = null;
  private contactCutoff = false;
  private timeline: SteerTimelineEntry[] = [];
  private replayTimeline: SteerTimelineEntry[] | null = null;

  // Ghost state: analytic ballistic from release.
  private readonly ghostP0 = new THREE.Vector3();
  private readonly ghostV0 = new THREE.Vector3();
  /** Horizontal unit vector perpendicular to the original shot direction. */
  private readonly lateralAxis = new THREE.Vector3();

  // Telemetry accumulators.
  private dvSpent = 0;
  private dvNet = new THREE.Vector3();
  private maxLateralDev = 0;
  private maxDev = 0;
  private dvLatPos = 0;
  private dvLatNeg = 0;

  private readonly accel = new THREE.Vector3();
  private readonly ghostPos = new THREE.Vector3();
  private readonly dev = new THREE.Vector3();

  /** Arm for a new flight. Pass a recorded timeline to replay it instead of live input. */
  beginFlight(
    launch: THREE.Vector3,
    releaseVelocity: THREE.Vector3,
    replayTimeline: SteerTimelineEntry[] | null = null,
  ): void {
    this.budgetLeft = tuning.curve.budget;
    this.stepIndex = 0;
    this.command = null;
    this.contactCutoff = false;
    this.timeline = [];
    this.replayTimeline = replayTimeline;
    this.ghostP0.copy(launch);
    this.ghostV0.copy(releaseVelocity);
    this.lateralAxis.set(releaseVelocity.x, 0, releaseVelocity.z);
    if (this.lateralAxis.lengthSq() > 1e-12) {
      this.lateralAxis.normalize();
      this.lateralAxis.set(-this.lateralAxis.z, 0, this.lateralAxis.x);
    }
    this.dvSpent = 0;
    this.dvNet.set(0, 0, 0);
    this.maxLateralDev = 0;
    this.maxDev = 0;
    this.dvLatPos = 0;
    this.dvLatNeg = 0;
  }

  /** Live input: the latest drag-velocity sample (ignored during replay). */
  setCommand(vx: number, vy: number): void {
    if (this.replayTimeline) return;
    this.command = { vx, vy, atStep: this.stepIndex };
  }

  clearCommand(): void {
    this.command = null;
  }

  /** First rim/board contact — rim physics stays pure after this. */
  markContact(): void {
    if (tuning.curve.cutoffAfterContact) this.contactCutoff = true;
  }

  get budgetFrac(): number {
    return tuning.curve.budget > 0 ? this.budgetLeft / tuning.curve.budget : 0;
  }

  get steeringActive(): boolean {
    return this.command !== null && !this.contactCutoff && this.budgetLeft > EPS_DV;
  }

  /**
   * One fixed physics step. Returns the world-space force (N) to add this
   * step (zero vector when idle — caller adds nothing, keeping the zero-steer
   * path bit-identical to pre-curve builds).
   *
   * camRight/camForward: camera basis projected to the horizontal plane.
   * ballPos/ballVel: current body state (guardrails + ghost deviation).
   */
  step(
    h: number,
    camRight: THREE.Vector3,
    camForward: THREE.Vector3,
    ballPos: { x: number; y: number; z: number },
    ballVel: { x: number; y: number; z: number },
  ): THREE.Vector3 | null {
    const stepIdx = this.stepIndex++;

    // Ghost deviation (always tracked while steering is still possible —
    // after contact the real path diverges for physics reasons, not input).
    if (!this.contactCutoff) {
      const t = stepIdx * h;
      this.ghostPos
        .copy(this.ghostV0)
        .multiplyScalar(t)
        .add(this.ghostP0);
      this.ghostPos.y -= 0.5 * tuning.world.gravity * t * t;
      this.dev.set(ballPos.x, ballPos.y, ballPos.z).sub(this.ghostPos);
      const lat = Math.abs(this.dev.dot(this.lateralAxis));
      if (lat > this.maxLateralDev) this.maxLateralDev = lat;
      const d = this.dev.length();
      if (d > this.maxDev) this.maxDev = d;
    }

    if (!tuning.curve.enabled) return null;

    // Replay path: re-apply the recorded force for this step exactly.
    if (this.replayTimeline) {
      const entry = this.replayTimeline.find((e) => e.step === stepIdx);
      if (!entry) return null;
      this.accel.set(entry.x, entry.y, entry.z);
      this.recordApplied(stepIdx, this.accel, h);
      return this.accel;
    }

    if (this.contactCutoff || this.budgetLeft <= EPS_DV) return null;
    const cmd = this.command;
    if (!cmd) return null;
    // A command steers for a bounded number of steps without a fresh sample.
    const holdSteps = Math.max(1, Math.round(tuning.curve.commandHoldMs / (h * 1000)));
    if (stepIdx - cmd.atStep > holdSteps) return null;

    // Guardrail: once the ball is below the rim plane and falling, the
    // outcome is decided — no U-turns from underneath.
    if (ballPos.y < tuning.rim.height && ballVel.y < 0) return null;

    // Camera-basis mapping: screen-x → lateral curve, screen-y (up) → depth.
    this.accel
      .copy(camRight)
      .multiplyScalar(cmd.vx * tuning.curve.lateralGain)
      .addScaledVector(camForward, -cmd.vy * tuning.curve.depthGain);
    const a = this.accel.length();
    if (a < 1e-6) return null;
    if (a > tuning.curve.maxAccel) this.accel.multiplyScalar(tuning.curve.maxAccel / a);

    // Budget drain with a smooth fade as it empties (no hard cutoff pop).
    const fadeKnee = tuning.curve.budget * tuning.curve.fadeBelowFrac;
    const fade = fadeKnee > 0 ? Math.min(1, this.budgetLeft / fadeKnee) : 1;
    this.accel.multiplyScalar(fade);
    let dv = this.accel.length() * h;
    if (dv > this.budgetLeft) {
      this.accel.multiplyScalar(this.budgetLeft / dv);
      dv = this.budgetLeft;
    }
    if (dv < 1e-9) return null;
    this.budgetLeft -= dv;

    // Force = mass · accel (Rapier addForce takes newtons).
    this.accel.multiplyScalar(tuning.ball.mass);
    this.recordApplied(stepIdx, this.accel, h);
    return this.accel;
  }

  private recordApplied(stepIdx: number, force: THREE.Vector3, h: number): void {
    this.timeline.push({ step: stepIdx, x: force.x, y: force.y, z: force.z });
    const dvStep = (force.length() / tuning.ball.mass) * h;
    this.dvSpent += dvStep;
    this.dvNet.addScaledVector(force, h / tuning.ball.mass);
    const latDv = (force.dot(this.lateralAxis) / tuning.ball.mass) * h;
    if (latDv >= 0) this.dvLatPos += latDv;
    else this.dvLatNeg -= latDv;
  }

  /** The applied-force timeline for deterministic replay of this flight. */
  getTimeline(): SteerTimelineEntry[] {
    return [...this.timeline];
  }

  telemetry(): CurveTelemetry {
    const steered = this.dvSpent > EPS_DV;
    return {
      dvSpent: this.dvSpent,
      maxLateralDev: steered ? this.maxLateralDev : 0,
      maxDev: steered ? this.maxDev : 0,
      smoothness: steered ? this.dvNet.length() / this.dvSpent : 1,
      dvLatPos: steered ? this.dvLatPos : 0,
      dvLatNeg: steered ? this.dvLatNeg : 0,
      steered,
    };
  }
}
