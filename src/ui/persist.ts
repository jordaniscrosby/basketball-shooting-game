/**
 * localStorage persistence: top-10 leaderboard + aggregate career stats.
 * Migrates the v1 best-streak key into career stats on first load.
 * All reads defensive — corrupt/missing storage degrades to empty state.
 */

export interface LeaderboardEntry {
  runScore: number;
  streak: number;
  /** ISO date string (yyyy-mm-dd). */
  date: string;
}

export interface CareerStats {
  totalPoints: number;
  attempts: number;
  makes: number;
  swishes: number;
  threes: number;
  banks: number;
  bestStreak: number;
  bestRun: number;
  sessions: number;
}

const LEADERBOARD_KEY = 'streak.leaderboard';
const STATS_KEY = 'streak.stats';
const LEGACY_BEST_KEY = 'streak.best';
const MUTED_KEY = 'streak.muted';
const TOP_N = 10;

export function emptyStats(): CareerStats {
  return {
    totalPoints: 0,
    attempts: 0,
    makes: 0,
    swishes: 0,
    threes: 0,
    banks: 0,
    bestStreak: 0,
    bestRun: 0,
    sessions: 0,
  };
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  const raw = readJson<LeaderboardEntry[]>(LEADERBOARD_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e) => typeof e?.runScore === 'number' && e.runScore > 0)
    .slice(0, TOP_N);
}

/** Insert a finished run; keeps the list sorted desc and capped at 10. */
export function pushRun(runScore: number, streak: number): LeaderboardEntry[] {
  if (runScore <= 0) return loadLeaderboard();
  const list = loadLeaderboard();
  list.push({ runScore, streak, date: new Date().toISOString().slice(0, 10) });
  list.sort((a, b) => b.runScore - a.runScore);
  const top = list.slice(0, TOP_N);
  localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(top));
  return top;
}

export function loadStats(): CareerStats {
  const stats = { ...emptyStats(), ...(readJson<Partial<CareerStats>>(STATS_KEY) ?? {}) };
  // v1 migration: fold the old best-streak number into career stats once.
  const legacy = localStorage.getItem(LEGACY_BEST_KEY);
  if (legacy !== null) {
    const n = Number(legacy);
    if (Number.isFinite(n) && n > stats.bestStreak) stats.bestStreak = n;
    localStorage.removeItem(LEGACY_BEST_KEY);
    saveStats(stats);
  }
  return stats;
}

export function saveStats(stats: CareerStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

/** Best run on record (leaderboard top entry, falling back to stats). */
export function loadBestRun(): number {
  const lb = loadLeaderboard();
  return Math.max(lb[0]?.runScore ?? 0, loadStats().bestRun);
}

export function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Storage unavailable — the choice just won't persist.
  }
}
