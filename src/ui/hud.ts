import type { Heat } from '../core/state';
import type { LeaderboardEntry, CareerStats } from './persist';

const STAR_COUNT = 5;

/**
 * DOM HUD: run score, star meter, streak line, heat label, and the
 * deliberately-opened stats screen (leaderboard + career stats). Score math
 * receipts live on the comic FX layer, not here.
 */
export class Hud {
  private readonly score = document.getElementById('run-score')!;
  private readonly starMeter = document.getElementById('star-meter')!;
  private readonly streakLine = document.getElementById('streak-line')!;
  private readonly heatLabel = document.getElementById('heat-label')!;
  private readonly scoreScreen = document.getElementById('score-screen')!;
  private readonly bestRunEl = document.getElementById('best-run')!;
  private readonly bestLine = document.getElementById('best-line')!;
  private readonly leaderboardEl = document.getElementById('leaderboard')!;
  private readonly careerEl = document.getElementById('career-stats')!;
  private readonly stars: HTMLSpanElement[] = [];

  constructor(onToggleStats: () => void) {
    for (let i = 0; i < STAR_COUNT; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      this.starMeter.appendChild(s);
      this.stars.push(s);
    }
    document.getElementById('stats-btn')!.addEventListener('click', onToggleStats);
    document.getElementById('retry-btn')!.addEventListener('click', onToggleStats);
  }

  setRun(runScore: number, streak: number, stars: number, punch = false): void {
    this.score.textContent = String(runScore);
    this.streakLine.textContent = streak > 0 ? `streak ${streak}` : '';
    this.stars.forEach((el, i) => el.classList.toggle('lit', i < stars));
    if (punch) {
      this.score.classList.remove('punch');
      void (this.score as HTMLElement).offsetWidth; // restart animation
      this.score.classList.add('punch');
    }
  }

  setHeat(heat: Heat): void {
    this.score.classList.toggle('on-fire', heat === 'fire' || heat === 'superstar');
    if (heat === 'superstar') this.heatLabel.textContent = 'superstar';
    else if (heat === 'fire') this.heatLabel.textContent = 'on fire';
    else if (heat === 'warm') this.heatLabel.textContent = 'heating up';
    this.heatLabel.classList.toggle('visible', heat !== 'cold');
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
