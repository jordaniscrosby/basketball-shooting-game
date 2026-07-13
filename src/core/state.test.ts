import { describe, it, expect } from 'vitest';
import { GameRun } from './state';
import { tuning } from '../config/tuning';

function toFlight(run: GameRun): void {
  run.beginAiming();
  run.release();
}

describe('GameRun FSM', () => {
  it('walks the happy path and scores makes/swishes', () => {
    const run = new GameRun();
    toFlight(run);
    expect(run.resolve('make').points).toBe(tuning.game.pointsMake);
    expect(run.score).toBe(1);
    run.nextShot();
    toFlight(run);
    expect(run.resolve('swish').points).toBe(tuning.game.pointsSwish);
    expect(run.score).toBe(3);
    expect(run.makes).toBe(2);
  });

  it('one miss ends the run and records best', () => {
    const run = new GameRun(2);
    toFlight(run);
    run.resolve('swish');
    run.nextShot();
    toFlight(run);
    const out = run.resolve('miss');
    expect(out.gameOver).toBe(true);
    expect(run.phase).toBe('gameover');
    expect(run.best).toBe(2); // score 2 ties previous best
  });

  it('retry resets the run instantly but keeps best', () => {
    const run = new GameRun();
    toFlight(run);
    run.resolve('swish');
    run.nextShot();
    toFlight(run);
    run.resolve('miss');
    run.retry();
    expect(run.phase).toBe('positioning');
    expect(run.score).toBe(0);
    expect(run.makes).toBe(0);
    expect(run.best).toBe(2);
  });

  it('reports heat milestones exactly once, on the crossing shot', () => {
    const run = new GameRun();
    const milestones: Array<string | null> = [];
    for (let i = 0; i < tuning.game.fireAt; i++) {
      toFlight(run);
      milestones.push(run.resolve('make').milestone);
      run.nextShot();
    }
    expect(milestones.filter((m) => m === 'heat')).toHaveLength(1);
    expect(milestones.filter((m) => m === 'fire')).toHaveLength(1);
    expect(milestones[tuning.game.heatAt - 1]).toBe('heat');
    expect(milestones[tuning.game.fireAt - 1]).toBe('fire');
    expect(run.heat).toBe('fire');
  });

  it('rejects out-of-order transitions', () => {
    const run = new GameRun();
    expect(() => run.release()).toThrow();
    expect(() => run.resolve('make')).toThrow();
    run.beginAiming();
    expect(() => run.beginAiming()).toThrow();
  });
});
