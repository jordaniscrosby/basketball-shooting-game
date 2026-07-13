import type { Heat } from '../core/state';
import type { ControlMode } from '../input/controlMode';
import type { LeaderboardEntry, CareerStats } from './persist';
import { artTheme } from '../config/artTheme';
import { clamp01, easeOutBack } from '../core/ease';
import type { SwirlCanvas } from '../fx/swirl';

const HEATS: Heat[] = ['warm', 'fire', 'superstar'];

/** Segment bitmasks for digits 0-9; bit i lights segment SEG_NAMES[i]. */
const DIGIT_SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
const SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

/**
 * One seven-segment scoreboard cell: builds `count` digits (7 <i> segments
 * each, styled in hud.css) into `root`, shows values right-aligned with unlit
 * leading digits, and can roll to a new value like a mechanical counter.
 */
class SegmentCell {
  private readonly digitEls: HTMLElement[] = [];
  private readonly digits: HTMLElement[][] = [];
  private shown = 0;
  private raf = 0;

  constructor(
    private readonly root: HTMLElement,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const digit = document.createElement('span');
      digit.className = 'seg-digit';
      digit.addEventListener('animationend', () => digit.classList.remove('digit-pop'));
      const segs: HTMLElement[] = [];
      for (const name of SEG_NAMES) {
        const seg = document.createElement('i');
        seg.className = `seg seg-${name}`;
        digit.appendChild(seg);
        segs.push(seg);
      }
      root.appendChild(digit);
      this.digitEls.push(digit);
      this.digits.push(segs);
    }
    this.render(0);
  }

  set(value: number, animate: boolean): void {
    cancelAnimationFrame(this.raf);
    const from = this.shown;
    this.shown = value;
    if (!animate || value === from) {
      this.render(value);
      return;
    }
    // Staggered slot-reel roll: every column tracks its own easeOutBack tween
    // of the full value, offset by digitStaggerMs from the ones column — so
    // the display cascades right-to-left, rolls PAST the target, and snaps
    // back. A column whose glyph changed pops as it settles.
    const { rollMs, digitStaggerMs, rollOvershoot } = artTheme.hud;
    const n = this.digits.length;
    const fromGlyphs = this.glyphs(from);
    const toGlyphs = this.glyphs(value);
    const totalMs = rollMs + digitStaggerMs * (n - 1);
    const settled: boolean[] = new Array(n).fill(false);
    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      for (let col = 0; col < n; col++) {
        const t = clamp01((elapsed - (n - 1 - col) * digitStaggerMs) / rollMs);
        const v = Math.round(from + (value - from) * easeOutBack(t, rollOvershoot));
        this.renderColumn(col, this.glyphs(v)[col]!);
        if (t >= 1 && !settled[col]) {
          settled[col] = true;
          if (fromGlyphs[col] !== toGlyphs[col]) this.popColumn(col);
        }
      }
      if (elapsed < totalMs) this.raf = requestAnimationFrame(tick);
      else this.render(value);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Per-column glyphs for a value; '' for unlit leading digits. */
  private glyphs(value: number): string[] {
    const max = 10 ** this.digits.length - 1;
    const text = String(Math.max(0, Math.min(value, max)));
    const pad = this.digits.length - text.length;
    return this.digits.map((_, i) => (i < pad ? '' : text[i - pad]!));
  }

  private renderColumn(col: number, glyph: string): void {
    const mask = glyph === '' ? 0 : (DIGIT_SEGMENTS[Number(glyph)] ?? 0);
    this.digits[col]!.forEach((seg, bit) => seg.classList.toggle('lit', (mask & (1 << bit)) !== 0));
  }

  private popColumn(col: number): void {
    const el = this.digitEls[col]!;
    el.classList.remove('digit-pop');
    void el.offsetWidth; // restart animation
    el.classList.add('digit-pop');
  }

  private render(value: number): void {
    const max = 10 ** this.digits.length - 1;
    this.root.setAttribute('aria-label', String(Math.max(0, Math.min(value, max))));
    this.glyphs(value).forEach((glyph, col) => this.renderColumn(col, glyph));
  }
}

/**
 * DOM HUD: the Balatro-style split scoreboard — one dark panel, blue chips
 * half (run score) × red mult half (streak), white seven-segment digits, no
 * labels. Heat is shown, never said: it lights comic flame tongues behind
 * the panel and scales/jitters the digits. Also owns the deliberately-opened
 * stats screen (leaderboard + career stats). Score math receipts live on the
 * comic FX layer, not here.
 */
export class Hud {
  private readonly scoreboard = document.getElementById('scoreboard')!;
  private readonly score = document.getElementById('run-score')!;
  private readonly scoreCell = new SegmentCell(this.score, 4);
  private readonly streakCell = new SegmentCell(document.getElementById('streak-count')!, 2);
  private readonly scoreScreen = document.getElementById('score-screen')!;
  private readonly bestRunEl = document.getElementById('best-run')!;
  private readonly bestLine = document.getElementById('best-line')!;
  private readonly leaderboardEl = document.getElementById('leaderboard')!;
  private readonly careerEl = document.getElementById('career-stats')!;
  private readonly controlsBtn = document.getElementById('controls-btn')!;

  constructor(onToggleStats: () => void, onToggleControls: () => void) {
    document.getElementById('stats-btn')!.addEventListener('click', onToggleStats);
    document.getElementById('retry-btn')!.addEventListener('click', onToggleStats);
    this.controlsBtn.addEventListener('click', onToggleControls);
    this.buildFlames();
  }

  /** Comic flame tongues behind the panel (Balatro fire) — heat classes on
   *  #scoreboard drive their size/visibility in hud.css. Deterministic
   *  per-index variation, no RNG (same flames every boot). */
  private buildFlames(): void {
    const root = document.getElementById('sb-fire')!;
    const n = artTheme.hud.flameCount;
    for (let i = 0; i < n; i++) {
      const flame = document.createElement('i');
      flame.className = 'flame';
      flame.style.left = `${((i + 0.5) / n) * 100}%`;
      flame.style.animationDelay = `${-((i * 0.173) % 0.5)}s`;
      flame.style.setProperty(
        '--flame-scale',
        (0.65 + 0.45 * Math.abs(Math.sin(i * 2.399))).toFixed(3),
      );
      root.appendChild(flame);
    }
  }

  setControlMode(mode: ControlMode): void {
    this.controlsBtn.textContent = mode === 'slingshot' ? 'input: drag' : 'input: swipe';
  }

  /** Optional swirl cameo: paints behind the stats/game-over card. */
  attachSwirl(swirl: SwirlCanvas): void {
    this.swirl = swirl;
    swirl.canvas.classList.add('swirl-bg');
    this.scoreScreen.prepend(swirl.canvas);
  }
  private swirl: SwirlCanvas | null = null;

  /** `punch` also opts into the roll-up animation; resets snap instantly. */
  setRun(runScore: number, streak: number, punch = false): void {
    this.scoreCell.set(runScore, punch);
    this.streakCell.set(streak, punch);
    if (punch) {
      this.score.classList.remove('punch');
      void (this.score as HTMLElement).offsetWidth; // restart animation
      this.score.classList.add('punch');
    }
  }

  /** Heat is never spelled out — the digit color/glow/jitter says it. */
  setHeat(heat: Heat): void {
    for (const h of HEATS) this.scoreboard.classList.toggle(`heat-${h}`, heat === h);
  }

  showStatsScreen(bestRun: number, leaderboard: LeaderboardEntry[], stats: CareerStats): void {
    this.bestRunEl.textContent = String(bestRun);
    this.bestLine.textContent = 'best run';
    this.leaderboardEl.replaceChildren(
      ...leaderboard.map((e) => {
        const li = document.createElement('li');
        li.textContent = `${e.runScore.toLocaleString()} — streak ${e.streak} · ${e.date}`;
        return li;
      }),
    );
    const fg = stats.attempts > 0 ? ((stats.makes / stats.attempts) * 100).toFixed(1) : '0.0';
    const rows: Array<[string, string]> = [
      ['career points', stats.totalPoints.toLocaleString()],
      ['makes / attempts', `${stats.makes} / ${stats.attempts} (${fg}%)`],
      ['swishes', String(stats.swishes)],
      ['threes', String(stats.threes)],
      ['banks', String(stats.banks)],
      ['best streak', String(stats.bestStreak)],
      ['sessions', String(stats.sessions)],
    ];
    this.careerEl.replaceChildren(
      ...rows.map(([k, v]) => {
        const div = document.createElement('div');
        const key = document.createElement('span');
        key.textContent = k;
        const val = document.createElement('b');
        val.textContent = v;
        div.append(key, val);
        return div;
      }),
    );
    const P = artTheme.palette;
    this.swirl?.want('screen', true, [P.paper, P.courtAccent, P.ink]);
    this.scoreScreen.classList.remove('hidden');
  }

  hideStatsScreen(): void {
    this.swirl?.want('screen', false);
    this.scoreScreen.classList.add('hidden');
  }
}
