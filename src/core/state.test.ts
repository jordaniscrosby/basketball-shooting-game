import { describe, it, expect } from 'vitest';
import { GameRun } from './state';
import { tuning } from '../config/tuning';
import type { ShotFacts } from '../systems/scoreEngine';

const s = tuning.score;

function toFlight(run: GameRun): void {
  run.beginAiming();
  run.release();
}

function plainMake(): ShotFacts {
  return { result: 'make', band: 'close', bankUsed: false, rimContacts: 1, curve: null };
}

describe('GameRun FSM (continuous session)', () => {
  it('scores makes through the engine and accumulates the run score', () => {
    const run = new GameRun();
    toFlight(run);
    const out = run.resolve('make', plainMake());
    expect(out.points).toBe(s.base);
    expect(run.runScore).toBe(s.base);
    expect(run.streak).toBe(1);
    run.nextShot();
    toFlight(run);
    const out2 = run.resolve('swish', { ...plainMake(), result: 'swish', rimContacts: 0 });
    expect(out2.points).toBe(s.base + s.bonus.swish);
    expect(run.runScore).toBe(s.base * 2 + s.bonus.swish);
  });

  it('a miss ends the RUN, not the session: play continues via nextShot', () => {
    const run = new GameRun();
    toFlight(run);
    run.resolve('make', plainMake());
    run.nextShot();
    toFlight(run);
    const out = run.resolve('miss');
    expect(run.phase).toBe('resolved'); // NOT gameover
    expect(out.endedRun).toEqual({ runScore: s.base, streak: 1, isNewBest: true });
    expect(run.streak).toBe(0);
    expect(run.runScore).toBe(0);
    expect(run.bestRun).toBe(s.base);
    run.nextShot(); // continuous play — straight back to positioning
    expect(run.phase).toBe('positioning');
  });

  it('an ended run beating the best reports isNewBest', () => {
    const run = new GameRun(10_000);
    toFlight(run);
    run.resolve('make', plainMake());
    run.nextShot();
    toFlight(run);
    const out = run.resolve('miss');
    expect(out.endedRun!.isNewBest).toBe(false);
    expect(run.bestRun).toBe(10_000);
  });

  it('awards star milestones exactly once, on the crossing make', () => {
    const run = new GameRun();
    const milestones: Array<number | null> = [];
    for (let i = 0; i < 10; i++) {
      toFlight(run);
      milestones.push(run.resolve('make', plainMake()).starMilestone);
      run.nextShot();
    }
    // Streak milestones 3/7/10 → stars 1/2/3 on those shots, null elsewhere.
    expect(milestones[2]).toBe(1);
    expect(milestones[6]).toBe(2);
    expect(milestones[9]).toBe(3);
    expect(milestones.filter((m) => m !== null)).toHaveLength(3);
    expect(run.stars).toBe(3);
    expect(run.multiplier).toBe(4);
    expect(run.heat).toBe('fire');
  });

  it('heat states key off stars: ★1 warm, ★3 fire, ★5 superstar', () => {
    const run = new GameRun();
    expect(run.heat).toBe('cold');
    const play = (n: number) => {
      for (let i = 0; i < n; i++) {
        toFlight(run);
        run.resolve('make', plainMake());
        run.nextShot();
      }
    };
    play(3);
    expect(run.heat).toBe('warm');
    play(7);
    expect(run.heat).toBe('fire');
    play(10);
    expect(run.streak).toBe(20);
    expect(run.heat).toBe('superstar');
    expect(run.multiplier).toBe(6);
  });

  it('gameover is only reachable via the deliberate endSession', () => {
    const run = new GameRun();
    run.beginAiming();
    run.endSession();
    expect(run.phase).toBe('gameover');
    run.retry();
    expect(run.phase).toBe('positioning');
    // The session pause does not touch the run.
    expect(run.streak).toBe(0);
    expect(run.runScore).toBe(0);
  });

  it('the milestone make earns its new multiplier immediately', () => {
    const run = new GameRun();
    for (let i = 0; i < 2; i++) {
      toFlight(run);
      run.resolve('make', plainMake());
      run.nextShot();
    }
    toFlight(run);
    const out = run.resolve('make', plainMake()); // streak → 3, ★1, ×2
    expect(out.breakdown!.multiplier).toBe(2);
    expect(out.points).toBe(s.base * 2);
  });

  it('rejects out-of-order transitions', () => {
    const run = new GameRun();
    expect(() => run.release()).toThrow();
    expect(() => run.resolve('make')).toThrow();
    run.beginAiming();
    expect(() => run.beginAiming()).toThrow();
    expect(() => run.retry()).toThrow();
  });
});
