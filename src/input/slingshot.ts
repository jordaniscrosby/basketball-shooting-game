import { tuning } from '../config/tuning';
import type { PointerSample } from './velocityTracker';
import type { Gesture } from './swipe';

export interface SlingshotDrag {
  /** Pull vector from the press point, viewport fractions (y positive DOWN). */
  dx: number;
  dy: number;
  /** Pull length (viewport fractions). */
  len: number;
  /** Releasing now would fire (net-downward pull of minimum length). */
  valid: boolean;
}

export interface SlingshotCallbacks {
  /** Gate at pointer-down: slingshot mode selected and the run is aiming. */
  active: () => boolean;
  /** Press must land near the ball (viewport fractions). */
  grabCheck: (x: number, y: number) => boolean;
  /** Live feedback while pulling (guide line + power meter). */
  onDrag: (d: SlingshotDrag) => void;
  onRelease: (g: Gesture) => void;
  /** Drag ended without a valid shot (too short / pulled upward). */
  onCancel: () => void;
}

/**
 * Mouse/keyboard aim: press on the ball, pull down-and-back like a slingshot,
 * release to fire opposite the pull. Emits the same Gesture the swipe path
 * produces, so the assisted-aim mapping (aimShot) is shared untouched:
 *   - pull direction off vertical → azimuth (lateral aim),
 *   - pull length vs reference → flick speed → power multiplier,
 *   - no release curvature — in-air spin belongs to the WASD steer keys.
 */
export class SlingshotInput {
  private active = false;
  private pointerId = -1;
  private startX = 0;
  private startY = 0;
  private startT = 0;
  private curX = 0;
  private curY = 0;
  enabled = true;

  constructor(
    private readonly el: HTMLElement,
    private readonly cb: SlingshotCallbacks,
  ) {
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancelEvt);
  }

  private drag(): SlingshotDrag {
    const dx = this.curX - this.startX;
    const dy = this.curY - this.startY;
    const len = Math.hypot(dx, dy);
    const valid = dy >= tuning.slingshot.minDragFrac;
    return { dx, dy, len, valid };
  }

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled || this.active || !this.cb.active()) return;
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    if (!this.cb.grabCheck(x, y)) return;
    this.active = true;
    this.pointerId = e.pointerId;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for exotic/synthetic pointers — tracking still works.
    }
    this.startX = this.curX = x;
    this.startY = this.curY = y;
    this.startT = e.timeStamp;
    this.el.style.cursor = 'grabbing';
    this.cb.onDrag(this.drag());
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.curX = e.clientX / window.innerWidth;
    this.curY = e.clientY / window.innerHeight;
    this.cb.onDrag(this.drag());
  };

  private readonly onUp = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.curX = e.clientX / window.innerWidth;
    this.curY = e.clientY / window.innerHeight;
    this.end(e);
    const d = this.drag();
    if (!d.valid) {
      this.cb.onCancel();
      return;
    }
    // Pull → Gesture: azimuth off straight-down mirrors swipe's off-vertical
    // convention; pull length maps through the reference flick speed so
    // aimShot's power clamp/easing applies identically.
    const azimuth = Math.atan2(-d.dx, d.dy);
    const upSpeed =
      tuning.input.referenceFlickSpeed * (d.len / tuning.slingshot.referenceDragFrac);
    const samples: PointerSample[] = [
      { x: this.startX, y: this.startY, t: this.startT },
      { x: this.curX, y: this.curY, t: e.timeStamp },
    ];
    this.cb.onRelease({ azimuth, upSpeed, curvature: 0, samples });
  };

  private readonly onCancelEvt = (e: PointerEvent): void => {
    if (!this.active || e.pointerId !== this.pointerId) return;
    this.end(e);
    this.cb.onCancel();
  };

  private end(e: PointerEvent): void {
    this.active = false;
    this.el.style.cursor = '';
    try {
      this.el.releasePointerCapture(e.pointerId);
    } catch {
      // Mirror of setPointerCapture above.
    }
  }
}
