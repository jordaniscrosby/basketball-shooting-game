import { Howl } from 'howler';
import { tuning } from '../config/tuning';

type Sfx =
  | 'bounce'
  | 'clank'
  | 'rattle'
  | 'thud'
  | 'swish'
  | 'swell'
  | 'tick'
  | 'multhit'
  | 'basshit';

/**
 * SFX bank on howler. Contact sounds fire straight from collision events in
 * the fixed-step update — decoded buffers keep latency ≤20 ms. Swish picks a
 * random variant; contact sounds get slight rate variation so repeats don't
 * ring identical. Crowd bed loops under the run and scales with heat; a miss
 * cuts everything to silence (the design's "silence cut").
 */
export class AudioBank {
  private readonly swishes: Howl[];
  private readonly sfx: Record<Exclude<Sfx, 'swish'>, Howl>;
  private readonly crowd: Howl;
  private crowdId: number | null = null;
  /** Throttle per-sound so a rattle doesn't machine-gun the same sample. */
  private lastPlayed = new Map<string, number>();

  constructor() {
    const load = (n: string) => new Howl({ src: [`audio/${n}.wav`], preload: true });
    this.swishes = [load('swish1'), load('swish2'), load('swish3')];
    this.sfx = {
      bounce: load('bounce'),
      clank: load('clank'),
      rattle: load('rattle'),
      thud: load('thud'),
      swell: load('swell'),
      tick: load('tick'),
      multhit: load('multhit'),
      basshit: load('basshit'),
    };
    this.crowd = new Howl({ src: ['audio/crowd.wav'], loop: true, volume: 0 });
  }

  play(name: Sfx, volume = 1, throttleMs = 60): void {
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < throttleMs) return;
    this.lastPlayed.set(name, now);
    const master = tuning.juice.audioVolume;
    if (name === 'swish') {
      const h = this.swishes[Math.floor(Math.random() * this.swishes.length)]!;
      h.volume(Math.min(1, volume * master));
      h.play();
      return;
    }
    const h = this.sfx[name];
    h.volume(Math.min(1, volume * master));
    h.rate(0.94 + Math.random() * 0.12);
    h.play();
  }

  /**
   * Score-receipt tick at rising pitch: each stacked term plays the same
   * short sample with playbackRate climbing by tuning.juice.tickPitchStep per
   * step — a long receipt audibly climbs (the Balatro C→G escalation).
   */
  playTick(step: number): void {
    const h = this.sfx.tick;
    h.volume(Math.min(1, tuning.juice.tickVolume * tuning.juice.audioVolume));
    h.rate(1 + step * tuning.juice.tickPitchStep);
    h.play();
  }

  /** Crowd bed volume follows heat; 0 stops it entirely. */
  setCrowdLevel(level: number): void {
    const v = Math.min(1, level) * 0.6 * tuning.juice.audioVolume;
    if (v <= 0.001) {
      if (this.crowdId !== null) {
        this.crowd.stop();
        this.crowdId = null;
      }
      return;
    }
    if (this.crowdId === null) this.crowdId = this.crowd.play();
    this.crowd.fade(this.crowd.volume() as number, v, 400, this.crowdId);
  }

  /** The miss moment: everything stops dead. */
  silenceCut(): void {
    for (const h of [
      ...this.swishes,
      this.sfx.swell,
      this.sfx.rattle,
      this.sfx.tick,
      this.sfx.multhit,
      this.sfx.basshit,
    ])
      h.stop();
    if (this.crowdId !== null) {
      this.crowd.stop();
      this.crowdId = null;
    }
  }
}
