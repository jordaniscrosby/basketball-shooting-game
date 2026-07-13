import { tuning } from '../config/tuning';

/**
 * Keyboard air control: while the ball flies, WASD holds feed the same
 * FlightSteer curve system the touch steer-drag drives — A/D curve left/right,
 * W/S push the shot long/short. Emits equivalent screen-space drag velocities
 * (viewport fractions/s, y positive DOWN) so gains, budget, and telemetry are
 * shared with touch.
 */
export class KeySteer {
  private readonly held = new Set<string>();

  constructor() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    // A backgrounded tab never delivers the keyup — drop everything.
    window.addEventListener('blur', () => this.held.clear());
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'KeyW':
      case 'KeyA':
      case 'KeyS':
      case 'KeyD':
        if (e.type === 'keydown') this.held.add(e.code);
        else this.held.delete(e.code);
        break;
    }
  };

  /** Current steer command, or null when no key is held. Diagonals normalized. */
  poll(): { vx: number; vy: number } | null {
    const vx = (this.held.has('KeyD') ? 1 : 0) - (this.held.has('KeyA') ? 1 : 0);
    const vy = (this.held.has('KeyS') ? 1 : 0) - (this.held.has('KeyW') ? 1 : 0);
    if (vx === 0 && vy === 0) return null;
    const inv = tuning.curve.keySpeed / Math.hypot(vx, vy);
    return { vx: vx * inv, vy: vy * inv };
  }
}
