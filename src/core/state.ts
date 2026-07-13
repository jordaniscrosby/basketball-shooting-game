import { tuning } from '../config/tuning';

export type Phase = 'positioning' | 'aiming' | 'flight' | 'resolved' | 'gameover';

export interface ResolveOutcome {
  result: 'swish' | 'make' | 'miss';
  points: number;
  gameOver: boolean;
  /** Milestone crossed by THIS shot (for celebrations), if any. */
  milestone: 'heat' | 'fire' | null;
}

/**
 * The run FSM: Positioning → Aiming → BallInFlight → Resolved → (next |
 * GameOver). Pure logic — rendering, physics and timers live outside.
 * `makes` (consecutive baskets) drives tier escalation and heat states;
 * `score` (make +1 / swish +2) is the displayed number and what "best" means.
 */
export class GameRun {
  phase: Phase = 'positioning';
  makes = 0;
  score = 0;
  shotIndex = 0;
  best: number;

  constructor(best = 0) {
    this.best = best;
  }

  /** Positioning → Aiming (camera arrived, ball in hand). */
  beginAiming(): void {
    this.assert('positioning');
    this.phase = 'aiming';
  }

  /** Aiming → BallInFlight (gesture released). */
  release(): void {
    this.assert('aiming');
    this.phase = 'flight';
    this.shotIndex++;
  }

  /** BallInFlight → Resolved | GameOver. */
  resolve(result: 'swish' | 'make' | 'miss'): ResolveOutcome {
    this.assert('flight');
    if (result === 'miss') {
      this.phase = 'gameover';
      this.best = Math.max(this.best, this.score);
      return { result, points: 0, gameOver: true, milestone: null };
    }
    const before = this.makes;
    this.makes++;
    const points = result === 'swish' ? tuning.game.pointsSwish : tuning.game.pointsMake;
    this.score += points;
    this.phase = 'resolved';
    const g = tuning.game;
    const milestone =
      before < g.fireAt && this.makes >= g.fireAt
        ? 'fire'
        : before < g.heatAt && this.makes >= g.heatAt
          ? 'heat'
          : null;
    return { result, points, gameOver: false, milestone };
  }

  /** Resolved → Positioning (fly to the next spot). */
  nextShot(): void {
    this.assert('resolved');
    this.phase = 'positioning';
  }

  /** GameOver → Positioning with a fresh run (instant retry). */
  retry(): void {
    this.assert('gameover');
    this.makes = 0;
    this.score = 0;
    this.shotIndex = 0;
    this.phase = 'positioning';
  }

  get heat(): 'cold' | 'warm' | 'fire' {
    if (this.makes >= tuning.game.fireAt) return 'fire';
    if (this.makes >= tuning.game.heatAt) return 'warm';
    return 'cold';
  }

  get isNewBest(): boolean {
    return this.score > 0 && this.score >= this.best;
  }

  private assert(expected: Phase): void {
    if (this.phase !== expected) {
      throw new Error(`invalid transition: expected ${expected}, in ${this.phase}`);
    }
  }
}
