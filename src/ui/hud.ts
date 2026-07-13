import * as THREE from 'three';

const BEST_KEY = 'streak.best';

export function loadBest(): number {
  const raw = localStorage.getItem(BEST_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function saveBest(best: number): void {
  localStorage.setItem(BEST_KEY, String(best));
}

/** DOM HUD over the canvas: streak counter, floaters, heat label, score screen. */
export class Hud {
  private readonly counter = document.getElementById('streak-counter')!;
  private readonly heatLabel = document.getElementById('heat-label')!;
  private readonly floatLayer = document.getElementById('floating-layer')!;
  private readonly scoreScreen = document.getElementById('score-screen')!;
  private readonly finalStreak = document.getElementById('final-streak')!;
  private readonly bestLine = document.getElementById('best-line')!;

  constructor(onRetry: () => void) {
    document.getElementById('retry-btn')!.addEventListener('click', onRetry);
  }

  setScore(score: number, punch = false): void {
    this.counter.textContent = String(score);
    if (punch) {
      this.counter.classList.remove('punch');
      void (this.counter as HTMLElement).offsetWidth; // restart animation
      this.counter.classList.add('punch');
    }
  }

  setHeat(heat: 'cold' | 'warm' | 'fire'): void {
    this.counter.classList.toggle('on-fire', heat === 'fire');
    if (heat === 'fire') this.heatLabel.textContent = 'on fire';
    else if (heat === 'warm') this.heatLabel.textContent = 'heating up';
    this.heatLabel.classList.toggle('visible', heat !== 'cold');
  }

  /** Floating "+1" / "SWISH +2" anchored at the hoop's screen position. */
  floatAtHoop(text: string, swish: boolean, rimCenter: THREE.Vector3, camera: THREE.Camera): void {
    const p = rimCenter.clone().project(camera);
    const el = document.createElement('div');
    el.className = swish ? 'floater swish' : 'floater';
    el.textContent = text;
    el.style.left = `${(p.x * 0.5 + 0.5) * 100}%`;
    el.style.top = `${(-p.y * 0.5 + 0.5) * 100 - 6}%`;
    this.floatLayer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  showScoreScreen(score: number, best: number, isNewBest: boolean): void {
    this.finalStreak.textContent = String(score);
    this.bestLine.textContent = isNewBest ? 'new best!' : `best ${best}`;
    this.bestLine.classList.toggle('new-best', isNewBest);
    this.scoreScreen.classList.remove('hidden');
  }

  hideScoreScreen(): void {
    this.scoreScreen.classList.add('hidden');
  }
}
