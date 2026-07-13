import { tuning } from '../config/tuning';

export interface PointerSample {
  /** Viewport-fraction coordinates (x/width, y/height, screen-y down). */
  x: number;
  y: number;
  /** Milliseconds (performance.now()). */
  t: number;
}

export interface Velocity2 {
  /** Viewport fractions per second. */
  vx: number;
  vy: number;
}

/**
 * Android-style Lsq2 velocity estimation: least-squares fit a degree-2
 * polynomial to position-vs-time over the recent gesture tail (≤20 samples
 * within a 100 ms horizon) and report the derivative at the latest sample.
 * The quadratic term keeps accelerating flicks honest — same algorithm as
 * native mobile trackers, so the eventual iOS port keeps the feel.
 */
export function estimateVelocity(samples: readonly PointerSample[]): Velocity2 {
  const windowed = windowSamples(samples);
  const n = windowed.length;
  if (n < 2) return { vx: 0, vy: 0 };
  const latest = windowed[n - 1]!;
  if (n === 2) {
    const a = windowed[0]!;
    const dt = (latest.t - a.t) / 1000;
    if (dt <= 0) return { vx: 0, vy: 0 };
    return { vx: (latest.x - a.x) / dt, vy: (latest.y - a.y) / dt };
  }
  // Times in seconds relative to the latest sample (t ≤ 0); the fitted
  // linear coefficient IS the velocity at release.
  const ts = windowed.map((s) => (s.t - latest.t) / 1000);
  return {
    vx: lsq2DerivativeAtZero(ts, windowed.map((s) => s.x)),
    vy: lsq2DerivativeAtZero(ts, windowed.map((s) => s.y)),
  };
}

/** Keep only the last ≤maxSamples within the time horizon. */
export function windowSamples(samples: readonly PointerSample[]): PointerSample[] {
  if (samples.length === 0) return [];
  const latest = samples[samples.length - 1]!;
  const horizon = tuning.input.estimatorWindowMs;
  const max = tuning.input.estimatorMaxSamples;
  const out: PointerSample[] = [];
  for (let i = samples.length - 1; i >= 0 && out.length < max; i--) {
    const s = samples[i]!;
    if (latest.t - s.t > horizon) break;
    out.push(s);
  }
  return out.reverse();
}

/**
 * Fit p(t) = b0 + b1·t + b2·t² by least squares; return b1 (dp/dt at t = 0).
 * Solves the 3×3 normal equations with Cramer's rule. Falls back to a linear
 * fit when the system is near-singular (e.g. all timestamps equal).
 */
function lsq2DerivativeAtZero(ts: readonly number[], ps: readonly number[]): number {
  const n = ts.length;
  let s1 = 0, st = 0, st2 = 0, st3 = 0, st4 = 0;
  let sp = 0, spt = 0, spt2 = 0;
  for (let i = 0; i < n; i++) {
    const t = ts[i]!;
    const p = ps[i]!;
    const t2 = t * t;
    s1 += 1; st += t; st2 += t2; st3 += t2 * t; st4 += t2 * t2;
    sp += p; spt += p * t; spt2 += p * t2;
  }
  const det =
    s1 * (st2 * st4 - st3 * st3) - st * (st * st4 - st2 * st3) + st2 * (st * st3 - st2 * st2);
  if (Math.abs(det) < 1e-12) {
    const meanT = st / n;
    const meanP = sp / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (ts[i]! - meanT) * (ps[i]! - meanP);
      den += (ts[i]! - meanT) ** 2;
    }
    return den > 1e-12 ? num / den : 0;
  }
  // b1 numerator: replace the second column with the RHS vector.
  const detB1 =
    s1 * (spt * st4 - spt2 * st3) - st * (sp * st4 - spt2 * st2) + st2 * (sp * st3 - spt * st2);
  return detB1 / det;
}
