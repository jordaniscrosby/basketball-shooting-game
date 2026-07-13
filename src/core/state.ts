import { scoreShot, starsForStreak, multiplierForStars, type ShotFacts, type ScoreBreakdown } from '../systems/scoreEngine';

export type Phase = 'positioning' | 'aiming' | 'flight' | 'resolved' | 'gameover';

/** Heat states are keyed to stars: ★1 heating up, ★3 on fire, ★5 superstar. */
export type Heat = 'cold' | 'warm' | 'fire' | 'superstar';

export interface EndedRun {
  runScore: number;
  streak: number;
  isNewBest: boolean;
}

export interface ResolveOutcome {
  result: 'swish' | 'make' | 'miss';
  /** Full score math for the popup receipt (null on a miss). */
  breakdown: ScoreBreakdown | null;
  /** Points added to the run score this shot. */
  points: number;
  /** Star count reached BY this shot (for freeze-frame celebration), if it grew. */
  starMilestone: number | null;
  /** Set on a miss: the run that just ended (RUN OVER panel data). */
  endedRun: EndedRun | null;
}

/**
 * The continuous-session FSM: Positioning → Aiming → BallInFlight → Resolved
 * → Positioning, forever. A miss ends the RUN (streak, stars, run score → 0,
 * captured in `endedRun`) but play continues — `gameover` is only entered by
 * the deliberate `endSession()` (stats screen), never by a miss.
 * Pure logic — rendering, physics and timers live outside.
 */
export class GameRun {
  phase: Phase = 'positioning';
  /** Consecutive makes this run — drives stars and the difficulty ramp. */
  streak = 0;
  /** Cumulative arcade score this run — the leaderboard number. */
  runScore = 0;
  shotIndex = 0;
  bestRun: number;

  constructor(bestRun = 0) {
    this.bestRun = bestRun;
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

  /**
   * BallInFlight → Resolved. On a make, `facts` feeds the scoring engine;
   * on a miss the run resets and its final numbers come back in `endedRun`.
   */
  resolve(result: 'swish' | 'make' | 'miss', facts: ShotFacts | null = null): ResolveOutcome {
    this.assert('flight');
    this.phase = 'resolved';

    if (result === 'miss') {
      const isNewBest = this.runScore > 0 && this.runScore >= this.bestRun;
      const ended: EndedRun = { runScore: this.runScore, streak: this.streak, isNewBest };
      this.bestRun = Math.max(this.bestRun, this.runScore);
      this.streak = 0;
      this.runScore = 0;
      return { result, breakdown: null, points: 0, starMilestone: null, endedRun: ended };
    }

    const starsBefore = starsForStreak(this.streak);
    this.streak++;
    const breakdown = facts
      ? scoreShot(facts, this.streak)
      : scoreShot(
          { result, band: 'close', bankUsed: false, rimContacts: 0, curve: null },
          this.streak,
        );
    this.runScore += breakdown.total;
    const starsNow = starsForStreak(this.streak);
    return {
      result,
      breakdown,
      points: breakdown.total,
      starMilestone: starsNow > starsBefore ? starsNow : null,
      endedRun: null,
    };
  }

  /** Resolved → Positioning (fly to the next spot; also the post-miss continue). */
  nextShot(): void {
    this.assert('resolved');
    this.phase = 'positioning';
  }

  /** Deliberate exit to the stats/score screen — the ONLY way into gameover. */
  endSession(): void {
    this.assert('aiming');
    this.phase = 'gameover';
  }

  /** GameOver → Positioning (leave the stats screen, back to play). */
  retry(): void {
    this.assert('gameover');
    this.phase = 'positioning';
  }

  get stars(): number {
    return starsForStreak(this.streak);
  }

  get multiplier(): number {
    return multiplierForStars(this.stars);
  }

  get heat(): Heat {
    const s = this.stars;
    if (s >= 5) return 'superstar';
    if (s >= 3) return 'fire';
    if (s >= 1) return 'warm';
    return 'cold';
  }

  get isNewBest(): boolean {
    return this.runScore > 0 && this.runScore >= this.bestRun;
  }

  private assert(expected: Phase): void {
    if (this.phase !== expected) {
      throw new Error(`invalid transition: expected ${expected}, in ${this.phase}`);
    }
  }
}
