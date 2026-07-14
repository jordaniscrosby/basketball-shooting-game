import { describe, it, expect } from 'vitest';
import { scoreShot, starsForStreak, multiplierForStars, type ShotFacts } from './scoreEngine';
import { tuning } from '../config/tuning';
import type { CurveTelemetry } from './curve';

const s = tuning.score;

function facts(over: Partial<ShotFacts> = {}): ShotFacts {
  return { result: 'make', band: 'close', bankUsed: false, rimContacts: 1, curve: null, ...over };
}

function curved(over: Partial<CurveTelemetry> = {}): CurveTelemetry {
  return {
    dvSpent: 0.4,
    maxLateralDev: s.curveDevThreshold + 0.1,
    maxDev: 0.5,
    smoothness: 0.9,
    dvLatPos: 0.4,
    dvLatNeg: 0,
    steered: true,
    ...over,
  };
}

/** An S-curve: meaningful lateral Δv both ways (the SNAKE!! signal). */
function snaked(over: Partial<CurveTelemetry> = {}): CurveTelemetry {
  return curved({
    dvSpent: s.snakeMinDvEach * 2 + 0.1,
    dvLatPos: s.snakeMinDvEach + 0.05,
    dvLatNeg: s.snakeMinDvEach + 0.05,
    smoothness: 0.1,
    ...over,
  });
}

describe('star track', () => {
  it('awards stars exactly at the streak milestones', () => {
    expect(starsForStreak(0)).toBe(0);
    expect(starsForStreak(2)).toBe(0);
    expect(starsForStreak(3)).toBe(1);
    expect(starsForStreak(7)).toBe(2);
    expect(starsForStreak(10)).toBe(3);
    expect(starsForStreak(15)).toBe(4);
    expect(starsForStreak(20)).toBe(5);
    expect(starsForStreak(99)).toBe(5);
  });

  it('maps stars to the ×2…×6 multipliers', () => {
    expect(multiplierForStars(0)).toBe(1);
    expect(multiplierForStars(1)).toBe(2);
    expect(multiplierForStars(5)).toBe(6);
    expect(multiplierForStars(9)).toBe(6); // clamped
  });
});

describe('scoreShot', () => {
  it('plain close-range make is base × 1', () => {
    const bd = scoreShot(facts(), 1);
    expect(bd.base).toBe(s.base);
    expect(bd.bonuses).toHaveLength(0);
    expect(bd.multiplier).toBe(1);
    expect(bd.total).toBe(s.base);
  });

  it('reproduces the design worked example: streak 12 corner-3 swish = 500', () => {
    // (50 + 3PT 50 + SWISH 25) × ★3(×4) = 500
    const bd = scoreShot(facts({ result: 'swish', band: 'three', rimContacts: 0 }), 12);
    expect(bd.stars).toBe(3);
    expect(bd.multiplier).toBe(4);
    expect(bd.total).toBe((s.base + s.bonus.three + s.bonus.swish) * 4);
    expect(bd.total).toBe(500);
  });

  it('distance bonuses are mutually exclusive by band', () => {
    for (const [band, pts] of [
      ['mid', s.bonus.mid],
      ['three', s.bonus.three],
      ['deep', s.bonus.deep],
    ] as const) {
      const bd = scoreShot(facts({ band }), 1);
      expect(bd.bonuses).toHaveLength(1);
      expect(bd.bonuses[0]!.points).toBe(pts);
    }
  });

  it('bank and lucky roll stack', () => {
    const bd = scoreShot(facts({ bankUsed: true, rimContacts: s.luckyRollContacts }), 1);
    const labels = bd.bonuses.map((b) => b.label);
    expect(labels).toContain('BANK!');
    expect(labels).toContain('LUCKY ROLL');
    expect(bd.total).toBe(s.base + s.bonus.bank + s.bonus.luckyRoll);
  });

  it('swish + bank cannot co-occur physically, but engine simply reports facts', () => {
    // The physics makes this impossible (a swish never touches the board);
    // the engine is a pure function of facts and does not enforce it.
    const bd = scoreShot(facts({ result: 'swish', bankUsed: false, rimContacts: 0 }), 1);
    expect(bd.bonuses.map((b) => b.label)).toEqual(['SWISH!']);
  });

  it('CURVE! requires steering above the deviation threshold', () => {
    const below = scoreShot(
      facts({ curve: curved({ maxLateralDev: s.curveDevThreshold - 0.05 }) }),
      1,
    );
    expect(below.bonuses).toHaveLength(0);

    const above = scoreShot(facts({ curve: curved() }), 1);
    expect(above.bonuses.map((b) => b.label)).toEqual(['CURVE!']);
  });

  it('unsteered flights never earn curve bonuses', () => {
    const bd = scoreShot(facts({ curve: curved({ steered: false }) }), 1);
    expect(bd.bonuses).toHaveLength(0);
  });

  it('FULL BENDER!! replaces CURVE! near max budget (mutually exclusive tiers)', () => {
    const bd = scoreShot(
      facts({ curve: curved({ dvSpent: tuning.curve.budget * s.benderBudgetFrac }) }),
      1,
    );
    const labels = bd.bonuses.map((b) => b.label);
    expect(labels).toContain('FULL BENDER!!');
    expect(labels).not.toContain('CURVE!');
  });

  it('STEEZ!! stacks on curve + swish', () => {
    const bd = scoreShot(facts({ result: 'swish', rimContacts: 0, curve: curved() }), 1);
    const labels = bd.bonuses.map((b) => b.label);
    expect(labels).toEqual(['SWISH!', 'CURVE!', 'STEEZ!!']);
    expect(bd.total).toBe(s.base + s.bonus.swish + s.bonus.curve + s.bonus.steez);
  });

  it('SNAKE!! requires meaningful lateral Δv in BOTH directions', () => {
    const oneWay = scoreShot(facts({ curve: curved({ dvLatPos: 0.9, dvLatNeg: 0.05 }) }), 1);
    expect(oneWay.bonuses.map((b) => b.label)).not.toContain('SNAKE!!');

    const bd = scoreShot(facts({ curve: snaked() }), 1);
    expect(bd.bonuses.map((b) => b.label)).toContain('SNAKE!!');
  });

  it('SNAKE!! stacks on the curve tier and counts as a curve trick for STEEZ', () => {
    // Big deviation AND a direction switch: tier + snake together.
    const both = scoreShot(facts({ curve: snaked() }), 1);
    expect(both.bonuses.map((b) => b.label)).toEqual(['CURVE!', 'SNAKE!!']);

    // A tight S below the deviation threshold still earns SNAKE!! alone,
    // and a snaked swish earns STEEZ even without the CURVE! tier.
    const tightS = snaked({ maxLateralDev: s.curveDevThreshold - 0.1 });
    const bd = scoreShot(facts({ result: 'swish', rimContacts: 0, curve: tightS }), 1);
    expect(bd.bonuses.map((b) => b.label)).toEqual(['SWISH!', 'SNAKE!!', 'STEEZ!!']);
  });

  it('CURVE COMBO pays from level 2 and grows per level until the cap', () => {
    const one = scoreShot(facts({ curve: curved() }), 1, 1);
    expect(one.bonuses.some((b) => b.label.startsWith('CURVE COMBO'))).toBe(false);

    const two = scoreShot(facts({ curve: curved() }), 1, 2);
    const comboLine = two.bonuses.find((b) => b.label.startsWith('CURVE COMBO'))!;
    expect(comboLine.label).toBe('CURVE COMBO ×2');
    expect(comboLine.points).toBe(s.bonus.curveCombo);

    const atCap = scoreShot(facts({ curve: curved() }), 1, s.curveComboCap);
    const beyondCap = scoreShot(facts({ curve: curved() }), 1, s.curveComboCap + 3);
    const capPts = s.bonus.curveCombo * (s.curveComboCap - 1);
    expect(atCap.bonuses.find((b) => b.label.startsWith('CURVE COMBO'))!.points).toBe(capPts);
    expect(beyondCap.bonuses.find((b) => b.label.startsWith('CURVE COMBO'))!.points).toBe(capPts);
    // The label keeps counting past the cap — the points stop growing.
    expect(beyondCap.bonuses.find((b) => b.label.startsWith('CURVE COMBO'))!.label)
      .toBe(`CURVE COMBO ×${s.curveComboCap + 3}`);
  });

  it('applies the multiplier to the full bonus sum', () => {
    // Streak 20 (★5, ×6) deep swish: the marquee payout.
    const bd = scoreShot(facts({ result: 'swish', band: 'deep', rimContacts: 0 }), 20);
    expect(bd.multiplier).toBe(6);
    expect(bd.total).toBe((s.base + s.bonus.swish + s.bonus.deep) * 6);
  });
});
