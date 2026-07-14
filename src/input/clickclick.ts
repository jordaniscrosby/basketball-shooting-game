import { tuning } from '../config/tuning';
import type { PointerSample } from './velocityTracker';
import type { Gesture } from './swipe';

/** Live aim state for the overlay: current aim + meter fill while charging. */
export interface ClickClickState {
  /** Aim azimuth (rad off screen-vertical, positive = right): live from the
   * cursor before the first click, locked in by it after. */
  azimuth: number;
  /** Current meter fill 0..1 (triangle wave, framerate-independent). */
  meter: number;
  /** False = hover preview (first click not yet placed), true = meter sweeping. */
  charging: boolean;
}

export interface ClickClickCallbacks {
  /** Gate at pointer-down: click-click mode selected and the run is aiming. */
  active: () => boolean;
  /** Ball screen position (viewport fractions) — the aim click is read relative to it. */
  ballScreen: () => { x: number; y: number };
  onFire: (g: Gesture) => void;
  /** Charge abandoned (Escape, mode toggle, phase change) — clear the meter. */
  onCancel: () => void;
}

/**
 * Triangle wave 0→1→0: meter fill after `elapsedSec` of charging at `speed`
 * full traversals per second. Pure time function — the freeze value comes
 * from the click event's own timestamp, so it is framerate-independent.
 */
export function meterValueAt(elapsedSec: number, speed = tuning.clickclick.meterSpeed): number {
  const t = Math.max(0, elapsedSec) * speed;
  const phase = t % 2;
  return phase <= 1 ? phase : 2 - phase;
}

/**
 * Meter fill → synthetic upSpeed (viewport heights/s). sweetFrac maps to the
 * reference flick speed exactly (solved-perfect power); edges swing
 * ±powerSpan·distance around it. aimShot's easing/clamp applies downstream.
 */
export function meterUpSpeed(meter: number): number {
  const cc = tuning.clickclick;
  return tuning.input.referenceFlickSpeed * (1 + (meter - cc.sweetFrac) * cc.powerSpan);
}

/**
 * First-click aim: azimuth of the ball→click direction off screen-vertical
 * (up), matching the swipe convention — click where you want to shoot.
 */
export function clickAzimuth(
  ball: { x: number; y: number },
  click: { x: number; y: number },
): number {
  // Screen-y is positive DOWN; "up from the ball" is ball.y - click.y.
  return Math.atan2(click.x - ball.x, ball.y - click.y);
}

/**
 * Arcade two-click aim: first click anywhere sets direction (relative to the
 * ball), then the power meter sweeps up and down; the second click freezes it
 * and fires. Emits the same Gesture the swipe path produces, so the
 * assisted-aim mapping (aimShot) is shared untouched.
 */
export class ClickClickInput {
  private charging = false;
  private azimuth = 0;
  private startT = 0;
  private aimSample: PointerSample = { x: 0, y: 0, t: 0 };
  private curX = 0;
  private curY = 0;
  private hasPointer = false;
  enabled = true;

  constructor(
    private readonly el: HTMLElement,
    private readonly cb: ClickClickCallbacks,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    window.addEventListener('keydown', this.onKey);
  }

  /**
   * Current aim state for the overlay (polled per render frame), or null.
   * Before the first click this is a hover preview — the guide follows the
   * cursor to show where the shot would go; after it, the aim is locked and
   * the meter sweeps.
   */
  state(nowMs: number): ClickClickState | null {
    if (!this.cb.active()) {
      // Phase or mode changed under us — abandon any charge.
      if (this.charging) this.cancel();
      return null;
    }
    if (this.charging) {
      return {
        azimuth: this.azimuth,
        meter: meterValueAt((nowMs - this.startT) / 1000),
        charging: true,
      };
    }
    if (!this.hasPointer) return null; // touch / no mousemove yet — no hover preview
    return {
      azimuth: clickAzimuth(this.cb.ballScreen(), { x: this.curX, y: this.curY }),
      meter: 0,
      charging: false,
    };
  }

  /** Abandon an in-progress charge (mode toggle, Escape). */
  cancel(): void {
    if (!this.charging) return;
    this.charging = false;
    this.cb.onCancel();
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (!this.cb.active()) {
      if (this.charging) this.cancel();
      return;
    }
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    if (!this.charging) {
      // Click one: aim. The meter starts sweeping from zero.
      this.azimuth = clickAzimuth(this.cb.ballScreen(), { x, y });
      this.startT = e.timeStamp;
      this.aimSample = { x, y, t: e.timeStamp };
      this.charging = true;
      return;
    }
    // Click two: freeze the meter at this click's own timestamp and fire.
    const meter = meterValueAt((e.timeStamp - this.startT) / 1000);
    this.charging = false;
    this.cb.onFire({
      azimuth: this.azimuth,
      upSpeed: meterUpSpeed(meter),
      curvature: 0, // in-air spin belongs to the WASD steer keys
      samples: [this.aimSample, { x, y, t: e.timeStamp }],
    });
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') return; // hover preview is a mouse affordance
    this.curX = e.clientX / window.innerWidth;
    this.curY = e.clientY / window.innerHeight;
    this.hasPointer = true;
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.cancel();
  };
}
