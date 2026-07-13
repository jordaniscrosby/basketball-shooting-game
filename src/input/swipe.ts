import { tuning } from '../config/tuning';
import { estimateVelocity, type PointerSample } from './velocityTracker';

export interface Gesture {
  /** Swipe angle off screen-vertical (rad); positive = rightward. */
  azimuth: number;
  /** Upward release speed (viewport heights/s, positive up). */
  upSpeed: number;
  /** Signed curvature: max perpendicular deviation from the start→end chord,
   * in viewport fractions; positive = bowed rightward. */
  curvature: number;
  /** Full sample path (for the debug overlay). */
  samples: PointerSample[];
}

export interface SwipeCallbacks {
  onGesture: (g: Gesture) => void;
  onCancel?: () => void;
  /** Live feedback during the drag (overlay). */
  onMove?: (samples: readonly PointerSample[]) => void;
  /**
   * When this returns true at pointer-down, the drag becomes a free-direction
   * steer drag (mid-flight curve) instead of an aim gesture. The aiming
   * validation path is untouched.
   */
  steerActive?: () => boolean;
  /** Gate a steer drag by its start point (grab radius around the ball). */
  steerGrabCheck?: (x: number, y: number) => boolean;
  /** Live per-move steer sample: drag velocity in viewport fractions/s. */
  onSteer?: (vx: number, vy: number) => void;
  /** The steer drag lifted or was cancelled. */
  onSteerEnd?: () => void;
}

/**
 * Single Pointer Events path (mouse + touch): capture on down, ring-buffer
 * viewport-normalized samples, validate on release. Invalid gestures cancel
 * (ball stays). Validation: net-upward motion, min length as a fraction of
 * screen height, min upward release velocity.
 */
export class SwipeInput {
  private samples: PointerSample[] = [];
  private active = false;
  private steering = false;
  private pointerId = -1;
  enabled = true;

  constructor(
    private readonly el: HTMLElement,
    private readonly cb: SwipeCallbacks,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancelEvt);
  }

  private push(e: PointerEvent): void {
    this.samples.push({
      x: e.clientX / window.innerWidth,
      y: e.clientY / window.innerHeight,
      t: e.timeStamp,
    });
    if (this.samples.length > 512) this.samples.shift();
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.active) return;
    const steer = this.cb.steerActive?.() ?? false;
    if (steer) {
      const x = e.clientX / window.innerWidth;
      const y = e.clientY / window.innerHeight;
      if (this.cb.steerGrabCheck && !this.cb.steerGrabCheck(x, y)) return;
    }
    this.active = true;
    this.steering = steer;
    this.pointerId = e.pointerId;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for exotic/synthetic pointers — tracking still works.
    }
    this.samples = [];
    this.push(e);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.push(e);
    if (this.steering) {
      // Live velocity of the drag tail — the ball answers the finger now,
      // not at release.
      const v = estimateVelocity(this.samples);
      this.cb.onSteer?.(v.vx, v.vy);
      return;
    }
    this.cb.onMove?.(this.samples);
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.push(e);
    this.active = false;
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      // Mirror of setPointerCapture above.
    }
    if (this.steering) {
      this.steering = false;
      this.cb.onSteerEnd?.();
      return;
    }
    const g = this.evaluate();
    if (g) this.cb.onGesture(g);
    else this.cb.onCancel?.();
  };

  private readonly onCancelEvt = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.active = false;
    if (this.steering) {
      this.steering = false;
      this.cb.onSteerEnd?.();
      return;
    }
    this.cb.onCancel?.();
  };

  private evaluate(): Gesture | null {
    const s = this.samples;
    if (s.length < 3) return null;
    const first = s[0]!;
    const last = s[s.length - 1]!;
    const dx = last.x - first.x;
    const dy = last.y - first.y; // screen-y down: negative = upward

    // Net-upward, long enough, and predominantly vertical.
    if (-dy < tuning.input.minSwipeFrac) return null;
    if (Math.abs(dx) > -dy * 1.2) return null;

    const v = estimateVelocity(s);
    const upSpeed = -v.vy;
    if (upSpeed < tuning.input.minFlickSpeed) return null;

    // Azimuth from the release-velocity direction (the tail is the intent).
    const azimuth = Math.atan2(v.vx, upSpeed);

    // Curvature: max signed perpendicular deviation from the start→end chord.
    const chordLen = Math.hypot(dx, dy);
    let curvature = 0;
    if (chordLen > 1e-6) {
      const nx = dx / chordLen;
      const ny = dy / chordLen;
      for (const p of s) {
        // 2D cross product (chord × point-offset): sign = side of the chord.
        const off = (p.x - first.x) * ny - (p.y - first.y) * nx;
        if (Math.abs(off) > Math.abs(curvature)) curvature = off;
      }
      // Screen-y is flipped vs math convention; positive should mean "bowed right".
      curvature = -curvature;
    }

    return { azimuth, upSpeed, curvature, samples: [...s] };
  }
}
