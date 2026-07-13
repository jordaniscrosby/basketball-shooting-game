import { describe, it, expect, beforeEach } from 'vitest';
import { ScoringTracker } from './scoring';
import { tuning } from '../config/tuning';

const RIM = { x: 0, y: 3.048, z: -12.7 };

/** Feed a vertical pass through the rim axis from yStart to yEnd. */
function feed(
  tracker: ScoringTracker,
  yStart: number,
  yEnd: number,
  velY: number,
  steps = 40,
  x = RIM.x,
  z = RIM.z,
) {
  let event: ReturnType<ScoringTracker['update']> = null;
  for (let i = 0; i <= steps; i++) {
    const y = yStart + ((yEnd - yStart) * i) / steps;
    const ev = tracker.update({ x, y, z, velY }, RIM.x, RIM.y, RIM.z);
    if (ev) event = ev;
  }
  return event;
}

describe('ScoringTracker', () => {
  let tracker: ScoringTracker;
  beforeEach(() => {
    tracker = new ScoringTracker();
  });

  it('scores a clean downward pass as a swish', () => {
    const ev = feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5);
    expect(ev).toBe('swish');
  });

  it('scores as a make when the rim was touched', () => {
    tracker.markRimContact();
    const ev = feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5);
    expect(ev).toBe('make');
  });

  it('never double counts within one possession', () => {
    expect(feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5)).toBe('swish');
    expect(feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5)).toBeNull();
  });

  it('rejects a ball coming up through the net, even if it falls back through', () => {
    expect(feed(tracker, RIM.y - 0.5, RIM.y + 0.5, 4)).toBeNull(); // up through
    expect(feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -4)).toBeNull(); // falls back
  });

  it('ignores passes outside the sensor cylinder', () => {
    const offAxis = RIM.x + tuning.rim.innerDiameter; // well outside
    const ev = feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5, 40, offAxis);
    expect(ev).toBeNull();
  });

  it('cannot skip the sensors at high fall speed (crossing-based)', () => {
    // 3 samples ~0.5 m apart: sensors sit between samples, must still fire.
    const ev = feed(tracker, RIM.y + 0.6, RIM.y - 0.6, -9, 3);
    expect(ev).toBe('swish');
  });

  it('re-arms after the possession resets away from the hoop', () => {
    expect(feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5)).toBe('swish');
    // Ball rolls far away → leaves reset region.
    tracker.update({ x: RIM.x + 3, y: 0.2, z: RIM.z + 3, velY: 0 }, RIM.x, RIM.y, RIM.z);
    expect(feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5)).toBe('swish');
  });

  it('reset() clears the rim-contact flag', () => {
    tracker.markRimContact();
    tracker.reset();
    expect(feed(tracker, RIM.y + 0.5, RIM.y - 0.5, -5)).toBe('swish');
  });
});
