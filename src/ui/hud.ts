import type { Heat } from '../core/state';
import type { ControlMode } from '../input/controlMode';
import type { LeaderboardEntry, CareerStats } from './persist';
import { multiplierForStars } from '../systems/scoreEngine';

const HEATS: Heat[] = ['warm', 'fire', 'superstar'];

/** Segment bitmasks for digits 0-9; bit i lights segment SEG_NAMES[i]. */
const DIGIT_SEGMENTS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
const SEG_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
const ROLL_MS = 450;

/**
 * One seven-segment scoreboard cell: builds `count` digits (7 <i> segments
 * each, styled in hud.css) into `root`, shows values right-aligned with unlit
 * leading digits, and can roll to a new value like a mechanical counter.
 */
class SegmentCell {
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
      const segs: HTMLElement[] = [];
      for (const name of SEG_NAMES) {
        const seg = document.createElement('i');
        seg.className = `seg seg-${name}`;
        digit.appendChild(seg);
        segs.push(seg);
      }
      root.appendChild(digit);
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
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / ROLL_MS, 1);
      const eased = 1 - (1 - t) ** 3;
      this.render(Math.round(from + (value - from) * eased));
      if (t < 1) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private render(value: number): void {
    const max = 10 ** this.digits.length - 1;
    const text = String(Math.max(0, Math.min(value, max)));
    this.root.setAttribute('aria-label', text);
    const pad = this.digits.length - text.length;
    this.digits.forEach((segs, i) => {
      const mask = i < pad ? 0 : (DIGIT_SEGMENTS[Number(text[i - pad])] ?? 0);
      segs.forEach((seg, bit) => seg.classList.toggle('lit', (mask & (1 << bit)) !== 0));
    });
  }
}

/**
 * DOM HUD: the scoreboard (seven-segment points/streak/mult cells, heat lamp)
 * and the deliberately-opened stats screen (leaderboard + career stats).
 * Score math receipts live on the comic FX layer, not here.
 */
export class Hud {
  private readonly scoreboard = document.getElementById('scoreboard')!;
  private readonly score = document.getElementById('run-score')!;
  private readonly scoreCell = new SegmentCell(this.score, 4);
  private readonly streakCell = new SegmentCell(document.getElementById('streak-count')!, 2);
  private readonly multBadge = document.getElementById('mult-badge')!;
  private readonly multCount = document.getElementById('mult-count')!;
  private lastMult = 1;
  private readonly heatLabel = document.getElementById('heat-label')!;
  private readonly heatText = document.getElementById('heat-text')!;
  private readonly scoreScreen = document.getElementById('score-screen')!;
  private readonly bestRunEl = document.getElementById('best-run')!;
  private readonly bestLine = document.getElementById('best-line')!;
  private readonly leaderboardEl = document.getElementById('leaderboard')!;
  private readonly careerEl = document.getElementById('career-stats')!;
  private readonly controlsBtn = document.getElementById('controls-btn')!;

  constructor(onToggleStats: () => void, onToggleControls: () => void) {
    this.multBadge.addEventListener('animationend', (e) => {
      if (e.animationName === 'badge-pop') this.multBadge.classList.remove('pop');
    });
    document.getElementById('stats-btn')!.addEventListener('click', onToggleStats);
    document.getElementById('retry-btn')!.addEventListener('click', onToggleStats);
    this.controlsBtn.addEventListener('click', onToggleControls);
  }

  setControlMode(mode: ControlMode): void {
    this.controlsBtn.textContent = mode === 'slingshot' ? 'input: drag' : 'input: swipe';
  }

  /** `punch` also opts into the roll-up animation; resets snap instantly. */
  setRun(runScore: number, streak: number, stars: number, punch = false): void {
    this.scoreCell.set(runScore, punch);
    this.streakCell.set(streak, punch);
    const mult = multiplierForStars(stars);
    this.multCount.textContent = `×${mult}`;
    this.multBadge.dataset.tier = String(mult >= 6 ? 3 : mult >= 4 ? 2 : mult >= 2 ? 1 : 0);
    if (mult > this.lastMult) {
      this.multBadge.classList.remove('pop');
      void this.multBadge.offsetWidth; // restart animation
      this.multBadge.classList.add('pop');
    }
    this.lastMult = mult;
    if (punch) {
      this.score.classList.remove('punch');
      void (this.score as HTMLElement).offsetWidth; // restart animation
      this.score.classList.add('punch');
    }
  }

  setHeat(heat: Heat): void {
    if (heat === 'superstar') this.heatText.textContent = 'superstar';
    else if (heat === 'fire') this.heatText.textContent = 'on fire';
    else if (heat === 'warm') this.heatText.textContent = 'heating up';
    this.heatLabel.classList.toggle('visible', heat !== 'cold');
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
    this.scoreScreen.classList.remove('hidden');
  }

  hideStatsScreen(): void {
    this.scoreScreen.classList.add('hidden');
  }
}
