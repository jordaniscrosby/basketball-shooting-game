import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { FlightSteer } from './curve';
import { tuning } from '../config/tuning';

const H = 1 / tuning.world.stepHz;
const RIGHT = new THREE.Vector3(1, 0, 0);
const FWD = new THREE.Vector3(0, 0, -1);

/** Ball state comfortably above the rim plane, rising — steering allowed. */
const airborne = { x: 0, y: tuning.rim.height + 1, z: 0 };
const rising = { x: 0, y: 2, z: -7 };

function launchState(): { launch: THREE.Vector3; vel: THREE.Vector3 } {
  return { launch: new THREE.Vector3(0, 2, 4), vel: new THREE.Vector3(0, 6, -6) };
}

describe('FlightSteer', () => {
  let saved: typeof tuning.curve;

  beforeEach(() => {
    saved = { ...tuning.curve };
    tuning.curve.enabled = true;
  });

  afterEach(() => {
    Object.assign(tuning.curve, saved);
  });

  it('zero input applies zero force and reports unsteered telemetry', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    for (let i = 0; i < 60; i++) {
      const f = s.step(H, RIGHT, FWD, airborne, rising);
      expect(f).toBeNull();
    }
    const t = s.telemetry();
    expect(t.steered).toBe(false);
    expect(t.dvSpent).toBe(0);
    expect(t.maxLateralDev).toBe(0);
    expect(s.getTimeline()).toHaveLength(0);
  });

  it('drains the budget and never exceeds it', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    for (let i = 0; i < 240; i++) {
      s.setCommand(3, 0); // hard rightward drag, refreshed every step
      s.step(H, RIGHT, FWD, airborne, rising);
    }
    const t = s.telemetry();
    expect(t.steered).toBe(true);
    expect(t.dvSpent).toBeGreaterThan(tuning.curve.budget * 0.95);
    expect(t.dvSpent).toBeLessThanOrEqual(tuning.curve.budget + 1e-6);
    // Budget empty → no further force.
    s.setCommand(3, 0);
    expect(s.step(H, RIGHT, FWD, airborne, rising)).toBeNull();
  });

  it('fades force smoothly as the budget empties (no hard cutoff pop)', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    const mags: number[] = [];
    for (let i = 0; i < 400; i++) {
      s.setCommand(3, 0);
      const f = s.step(H, RIGHT, FWD, airborne, rising);
      mags.push(f ? f.length() : 0);
      if (!f && i > 5) break;
    }
    // Once the fade starts, magnitudes decrease monotonically to ~0 — the
    // last applied force must already be small, not a full-strength pop.
    const applied = mags.filter((m) => m > 0);
    const last = applied[applied.length - 1]!;
    const peak = Math.max(...applied);
    expect(last).toBeLessThan(peak * 0.25);
  });

  it('respects the per-step accel cap', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    s.setCommand(500, -500); // absurd drag speed
    const f = s.step(H, RIGHT, FWD, airborne, rising);
    expect(f).not.toBeNull();
    expect(f!.length() / tuning.ball.mass).toBeLessThanOrEqual(tuning.curve.maxAccel + 1e-9);
  });

  it('splits lateral Δv by direction: one-way arcs load one side, an S-curve loads both', () => {
    tuning.curve.budget = 4; // roomy budget so the switch-back half isn't starved
    const oneWay = new FlightSteer();
    const { launch, vel } = launchState();
    oneWay.beginFlight(launch, vel);
    for (let i = 0; i < 30; i++) {
      oneWay.setCommand(1.5, 0); // steady rightward drag
      oneWay.step(H, RIGHT, FWD, airborne, rising);
    }
    // Shot fired down -z: lateralAxis = (-vz, 0, vx)/|v| = +x, so a rightward
    // (camRight = +x) drag accumulates on the positive side only.
    const t1 = oneWay.telemetry();
    expect(t1.dvLatPos).toBeGreaterThan(0.1);
    expect(t1.dvLatNeg).toBe(0);

    const sCurve = new FlightSteer();
    sCurve.beginFlight(launch, vel);
    for (let i = 0; i < 60; i++) {
      sCurve.setCommand(i < 30 ? 1.5 : -1.5, 0); // right, then hard back left
      sCurve.step(H, RIGHT, FWD, airborne, rising);
    }
    const t2 = sCurve.telemetry();
    expect(t2.dvLatPos).toBeGreaterThan(0.1);
    expect(t2.dvLatNeg).toBeGreaterThan(0.1);
    expect(t2.dvLatPos + t2.dvLatNeg).toBeCloseTo(t2.dvSpent, 6);
  });

  it('smoothness ≈ 1 for one clean arc, low for frantic zigzag', () => {
    const clean = new FlightSteer();
    const { launch, vel } = launchState();
    clean.beginFlight(launch, vel);
    for (let i = 0; i < 30; i++) {
      clean.setCommand(1.5, 0);
      clean.step(H, RIGHT, FWD, airborne, rising);
    }
    expect(clean.telemetry().smoothness).toBeGreaterThan(0.95);

    const zigzag = new FlightSteer();
    zigzag.beginFlight(launch, vel);
    for (let i = 0; i < 30; i++) {
      zigzag.setCommand(i % 2 === 0 ? 1.5 : -1.5, 0);
      zigzag.step(H, RIGHT, FWD, airborne, rising);
    }
    expect(zigzag.telemetry().smoothness).toBeLessThan(0.3);
  });

  it('cuts off after rim/board contact', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    s.setCommand(2, 0);
    expect(s.step(H, RIGHT, FWD, airborne, rising)).not.toBeNull();
    s.markContact();
    s.setCommand(2, 0);
    expect(s.step(H, RIGHT, FWD, airborne, rising)).toBeNull();
  });

  it('refuses to steer below the rim plane while falling (no U-turns)', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    s.setCommand(2, 0);
    const below = { x: 0, y: tuning.rim.height - 0.5, z: -10 };
    const falling = { x: 0, y: -4, z: -3 };
    expect(s.step(H, RIGHT, FWD, below, falling)).toBeNull();
    // Same height while still rising is fine.
    s.setCommand(2, 0);
    expect(s.step(H, RIGHT, FWD, below, rising)).not.toBeNull();
  });

  it('a stale command stops steering after the hold window', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    s.setCommand(2, 0);
    const holdSteps = Math.max(1, Math.round(tuning.curve.commandHoldMs / (H * 1000)));
    let applied = 0;
    for (let i = 0; i < holdSteps + 10; i++) {
      if (s.step(H, RIGHT, FWD, airborne, rising)) applied++;
    }
    expect(applied).toBeGreaterThan(0);
    expect(applied).toBeLessThanOrEqual(holdSteps + 1);
  });

  it('tracks lateral deviation against the ballistic ghost', () => {
    const s = new FlightSteer();
    // Shot fired straight down -z: lateral axis is ±x.
    const launch = new THREE.Vector3(0, 2, 4);
    const vel = new THREE.Vector3(0, 6, -6);
    s.beginFlight(launch, vel);
    // Simulate the real ball drifting +x off the ghost.
    for (let i = 0; i < 30; i++) {
      const t = i * H;
      const ghost = {
        x: launch.x + vel.x * t,
        y: launch.y + vel.y * t - 0.5 * tuning.world.gravity * t * t,
        z: launch.z + vel.z * t,
      };
      s.setCommand(1, 0); // must be "steered" for deviation to count
      s.step(H, RIGHT, FWD, { x: ghost.x + 0.01 * i, y: ghost.y, z: ghost.z }, rising);
    }
    const t = s.telemetry();
    expect(t.maxLateralDev).toBeGreaterThan(0.25);
    expect(t.maxLateralDev).toBeLessThan(0.35);
  });

  it('replays a recorded timeline exactly, ignoring live input', () => {
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    for (let i = 0; i < 20; i++) {
      s.setCommand(1.2, -0.4);
      s.step(H, RIGHT, FWD, airborne, rising);
    }
    const timeline = s.getTimeline();
    expect(timeline.length).toBeGreaterThan(0);

    const r = new FlightSteer();
    r.beginFlight(launch, vel, timeline);
    r.setCommand(99, 99); // live input must be ignored during replay
    const replayed: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < 25; i++) {
      const f = r.step(H, RIGHT, FWD, airborne, rising);
      if (f) replayed.push({ x: f.x, y: f.y, z: f.z });
    }
    expect(replayed.length).toBe(timeline.length);
    for (let i = 0; i < timeline.length; i++) {
      expect(replayed[i]!.x).toBeCloseTo(timeline[i]!.x, 12);
      expect(replayed[i]!.y).toBeCloseTo(timeline[i]!.y, 12);
      expect(replayed[i]!.z).toBeCloseTo(timeline[i]!.z, 12);
    }
  });

  it('does nothing when disabled', () => {
    tuning.curve.enabled = false;
    const s = new FlightSteer();
    const { launch, vel } = launchState();
    s.beginFlight(launch, vel);
    s.setCommand(3, 0);
    expect(s.step(H, RIGHT, FWD, airborne, rising)).toBeNull();
  });
});
