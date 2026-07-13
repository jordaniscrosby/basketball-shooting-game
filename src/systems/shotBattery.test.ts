import { describe, it, expect } from 'vitest';
import { runShotBattery } from './shotBattery';

describe('shot battery (physics regression)', () => {
  it('makes ≥99% of solved perfect shots from every curated position', async () => {
    const result = await runShotBattery();
    const misses = result.shots.filter((s) => s.result === 'miss');
    // Surface which positions failed, not just a rate.
    expect(misses.map((m) => `${m.id} (${m.name})`)).toEqual([]);
    expect(result.total).toBeGreaterThanOrEqual(15);
    expect(result.makeRate).toBeGreaterThanOrEqual(0.99);
  }, 60_000);
});
