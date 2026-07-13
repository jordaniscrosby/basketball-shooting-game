import { tuning, derived } from '../config/tuning';

export interface BallSample {
  x: number;
  y: number;
  z: number;
  velY: number;
}

export type ScoreEvent = 'make' | 'swish' | null;

interface RelSample {
  dx: number;
  dy: number;
  dz: number;
}

/**
 * Make/reject logic for the stacked rim sensors, kept pure (no Rapier types)
 * so it unit-tests headlessly. The two sensors are horizontal planes on the
 * rim axis (one above the rim plane, one below); detection is by *crossing*
 * between consecutive fixed-step samples — with the crossing point
 * interpolated — so a fast ball can never skip a sensor between steps. A make
 * requires arming the above-sensor (downward crossing inside the rim opening)
 * and then crossing the below-sensor downward, latched once per possession.
 * Crossing the below-sensor upward first blocks the possession
 * (up-through-the-net). Continuity only counts while the ball is inside the
 * hoop region, so a ball wandering back from far away can't fake a crossing.
 */
export class ScoringTracker {
  private armedAbove = false;
  private blocked = false;
  private latched = false;
  private rimTouched = false;
  private prev: RelSample | null = null;

  /** Flag a rim contact this possession (from Rapier collision events). */
  markRimContact(): void {
    this.rimTouched = true;
  }

  get hasRimContact(): boolean {
    return this.rimTouched;
  }

  /** Start a fresh possession (new shot). */
  reset(): void {
    this.armedAbove = false;
    this.blocked = false;
    this.latched = false;
    this.rimTouched = false;
    this.prev = null;
  }

  /**
   * Feed one fixed-step ball sample; rim centre passed in so tests can place
   * the hoop anywhere. Returns 'swish' or 'make' exactly once per possession.
   */
  update(ball: BallSample, rimX: number, rimY: number, rimZ: number): ScoreEvent {
    const s = tuning.scoring;
    const dx = ball.x - rimX;
    const dy = ball.y - rimY;
    const dz = ball.z - rimZ;
    const distSq = dx * dx + dy * dy + dz * dz;

    // Outside the hoop region: possession state resolves, continuity breaks.
    if (distSq > s.resetRegionRadius ** 2) {
      if (this.latched || this.blocked) this.reset();
      this.prev = null;
      return null;
    }

    const prev = this.prev;
    this.prev = { dx, dy, dz };
    if (prev === null || this.latched || this.blocked) return null;

    const sensorR = derived.rimInnerRadius * s.sensorRadiusScale;
    /** Horizontal distance from the rim axis at the interpolated plane crossing. */
    const crossingInside = (planeY: number): boolean => {
      const t = (prev.dy - planeY) / (prev.dy - dy);
      const cx = prev.dx + (dx - prev.dx) * t;
      const cz = prev.dz + (dz - prev.dz) * t;
      return cx * cx + cz * cz <= sensorR * sensorR;
    };
    const aboveY = s.aboveSensorOffset;
    const belowY = -s.belowSensorOffset;
    const crossedDown = (planeY: number) => prev.dy > planeY && dy <= planeY;
    const crossedUp = (planeY: number) => prev.dy < planeY && dy >= planeY;

    if (crossedUp(belowY) && crossingInside(belowY) && !this.armedAbove) {
      this.blocked = true; // entered from underneath — dead possession
      return null;
    }
    if (crossedDown(aboveY) && crossingInside(aboveY)) {
      this.armedAbove = true;
    }
    if (crossedDown(belowY) && crossingInside(belowY) && this.armedAbove && ball.velY < 0) {
      this.latched = true;
      return this.rimTouched ? 'make' : 'swish';
    }
    return null;
  }
}
