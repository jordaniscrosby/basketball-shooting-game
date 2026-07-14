import { describe, it, expect } from 'vitest';
import { tuning } from '../config/tuning';
import { annotateShot, missStreakQuip, type AnnotationFacts } from './annotations';

function facts(over: Partial<AnnotationFacts> = {}): AnnotationFacts {
  return {
    result: 'make',
    bankUsed: false,
    rimContacts: 1,
    anyContact: true,
    curved: false,
    missStreak: 0,
    seed: 1,
    ...over,
  };
}

describe('annotateShot priority', () => {
  it('a curved swish outranks a plain swish', () => {
    const a = annotateShot(facts({ result: 'swish', rimContacts: 0, curved: true }));
    expect(a.style).toBe('star');
    expect(a.burst).toBe(true);
    const plain = annotateShot(facts({ result: 'swish', rimContacts: 0 }));
    expect(plain.style).toBe('accent');
    expect(a.text).not.toBe(plain.text);
  });

  it('the ugly roll-in beats the bank call', () => {
    const a = annotateShot(
      facts({ bankUsed: true, rimContacts: tuning.score.luckyRollContacts }),
    );
    // Sloppy pool, not the BANK pool.
    expect(['FLUSH!', '...I GUESS', 'UGLY. COUNTS.', 'RATTLE RATTLE', 'PHEW!']).toContain(a.text);
  });

  it('a clean bank is called as glass', () => {
    const a = annotateShot(facts({ bankUsed: true, rimContacts: 0 }));
    expect(['BANK!', 'GLASS!', 'OFF THE WINDOW!']).toContain(a.text);
  });

  it('misses: air ball when nothing was touched, brick off the board', () => {
    const air = annotateShot(facts({ result: 'miss', anyContact: false, missStreak: 1 }));
    expect(air.burst).toBe(true);
    expect(air.style).toBe('fire');
    const brick = annotateShot(
      facts({ result: 'miss', bankUsed: true, anyContact: true, missStreak: 1 }),
    );
    expect(brick.style).toBe('fire');
    expect(air.text).not.toBe(brick.text);
  });

  it('is deterministic per seed', () => {
    const f = facts({ result: 'swish', rimContacts: 0 });
    expect(annotateShot(f)).toEqual(annotateShot({ ...f }));
    // Different seeds eventually pick different lines from the pool.
    const texts = new Set(
      Array.from({ length: 12 }, (_, i) => annotateShot(facts({ ...f, seed: i })).text),
    );
    expect(texts.size).toBeGreaterThan(1);
  });
});

describe('miss-streak comedy ladder', () => {
  it('quips start at 2 and escalate', () => {
    expect(missStreakQuip(0)).toBeUndefined();
    expect(missStreakQuip(1)).toBeUndefined();
    expect(missStreakQuip(2)).toBe('two in a row...');
    expect(missStreakQuip(5)).toBe('call a timeout');
    expect(missStreakQuip(20)).toBe('legally, that was defense');
  });

  it('the miss card carries the quip as its sub line', () => {
    const a = annotateShot(facts({ result: 'miss', missStreak: 3 }));
    expect(a.sub).toBe('brick city, population: you');
  });
});
