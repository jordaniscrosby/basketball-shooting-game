import { tuning } from '../config/tuning';
import { hash01 } from '../scene/toon';

/** Subset of ComicFx card styles the annotation picker speaks. */
export type AnnotationStyle = 'paper' | 'accent' | 'fire' | 'star';

export interface Annotation {
  text: string;
  /** Optional small hand-written line under the card (miss-streak quips). */
  sub?: string | undefined;
  style: AnnotationStyle;
  burst: boolean;
}

/** Everything the picker needs to editorialize one resolved shot. */
export interface AnnotationFacts {
  result: 'swish' | 'make' | 'miss';
  /** Backboard touched this possession. */
  bankUsed: boolean;
  rimContacts: number;
  /** Any rim OR board contact (false on a miss = air ball). */
  anyContact: boolean;
  /** The flight earned a curve-family trick (scoreEngine.isCurveTrick). */
  curved: boolean;
  /** Consecutive misses INCLUDING this one; 0 on a make. */
  missStreak: number;
  /** Variety seed — pass run.shotIndex so picks are deterministic per shot. */
  seed: number;
}

/** Deterministic pick — same shot always gets the same line. */
function pick<T>(pool: readonly T[], seed: number, salt: number): T {
  return pool[Math.floor(hash01(seed * 31 + salt) * pool.length) % pool.length]!;
}

// ── Makes ────────────────────────────────────────────────────────────────
const CURVED_SWISH = ['FILTHY!!', 'SAUCE!!', 'DISGUSTING!!'] as const;
const SWISH = ['SWISH!!', 'SPLASH!!', 'BUTTER!'] as const;
/** Rolled around the rim before dropping — the toilet-bowl family. */
const SLOPPY = ['FLUSH!', '...I GUESS', 'UGLY. COUNTS.', 'RATTLE RATTLE', 'PHEW!'] as const;
const BANK = ['BANK!', 'GLASS!', 'OFF THE WINDOW!'] as const;
const PLAIN_MAKE = ['COUNT IT!', 'BUCKETS!', 'IN!'] as const;

// ── Misses ───────────────────────────────────────────────────────────────
const AIRBALL = ['AIR BALL!', 'NOT. CLOSE.', 'WHIFF!'] as const;
const BRICK = ['BRICK!', 'CLUNK!', 'OFF THE HOUSE!'] as const;
const RIM_OUT = ['CLANK!', 'RIMMED OUT!', 'SO CLOSE!'] as const;

/** Escalating trash talk as the misses stack — any make wipes the slate. */
const MISS_QUIPS: ReadonlyArray<readonly [number, string]> = [
  [8, 'legally, that was defense'],
  [6, 'the hoop moved. probably.'],
  [5, 'call a timeout'],
  [4, 'you good?'],
  [3, 'brick city, population: you'],
  [2, 'two in a row...'],
];

export function missStreakQuip(missStreak: number): string | undefined {
  for (const [at, quip] of MISS_QUIPS) {
    if (missStreak >= at) return quip;
  }
  return undefined;
}

/**
 * The onomatopoeia editor: turns observed shot facts into the comic card's
 * headline. Priority mirrors how a heckling friend would call it — style
 * first (swish), then comedy (the ugly roll beats the clean bank), then the
 * plain call. Misses get meaner as the streak grows via `sub`.
 */
export function annotateShot(f: AnnotationFacts): Annotation {
  if (f.result === 'miss') {
    const sub = missStreakQuip(f.missStreak);
    if (!f.anyContact) return { text: pick(AIRBALL, f.seed, 5), sub, style: 'fire', burst: true };
    if (f.bankUsed) return { text: pick(BRICK, f.seed, 6), sub, style: 'fire', burst: false };
    return { text: pick(RIM_OUT, f.seed, 7), sub, style: 'fire', burst: false };
  }

  const swish = f.result === 'swish';
  if (swish && f.curved) return { text: pick(CURVED_SWISH, f.seed, 1), style: 'star', burst: true };
  if (swish) return { text: pick(SWISH, f.seed, 2), style: 'accent', burst: true };
  // The roll-in beats the bank: a shot that circled the drain is the story.
  if (f.rimContacts >= tuning.score.luckyRollContacts)
    return { text: pick(SLOPPY, f.seed, 3), style: 'paper', burst: false };
  if (f.bankUsed) return { text: pick(BANK, f.seed, 4), style: 'paper', burst: false };
  return { text: pick(PLAIN_MAKE, f.seed, 8), style: 'paper', burst: false };
}
