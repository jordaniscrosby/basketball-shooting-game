import { Howl, Howler } from 'howler';
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
  | 'basshit'
  | 'slowmo';

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
  /** Bullet-time pitch: world SFX play at this rate while time is slowed. */
  private worldRate = 1;

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
      slowmo: load('slowmo'),
    };
    this.crowd = new Howl({ src: ['audio/crowd.wav'], loop: true, volume: 0 });
  }

  play(name: Sfx, volume = 1, throttleMs = 60): void {
    const now = performance.now();
    const last = this.lastPlayed.get(name) ?? -Infinity;
    if (now - last < throttleMs) return;
    this.lastPlayed.set(name, now);
    const master = tuning.juice.audioVolume;
    // World sounds live inside slowed time — they pitch down with it. UI/receipt
    // sounds (and the slow-mo whoosh itself) stay at full speed with the HUD.
    const world = name === 'bounce' || name === 'clank' || name === 'rattle' || name === 'thud';
    if (name === 'swish') {
      const h = this.swishes[Math.floor(Math.random() * this.swishes.length)]!;
      h.volume(Math.min(1, volume * master));
      h.rate(this.worldRate);
      h.play();
      return;
    }
    const h = this.sfx[name];
    h.volume(Math.min(1, volume * master));
    h.rate((0.94 + Math.random() * 0.12) * (world ? this.worldRate : 1));
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

  /**
   * Bullet time on the soundscape: world SFX and the crowd bed pitch down
   * with the world's time scale (Howler playbackRate — slower AND deeper,
   * exactly the tape-slow feel). When music lands, route its Howl through
   * here too — `music.rate(scale)` — so the track distorts with time.
   */
  setTimeScale(scale: number): void {
    const s = Math.max(0.3, Math.min(1, scale));
    if (Math.abs(s - this.worldRate) < 0.01) return;
    this.worldRate = s;
    if (this.crowdId !== null) this.crowd.rate(s, this.crowdId);
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

  /**
   * Master mute (the HUD sound toggle): Howler-global, so it covers every
   * sample including the crowd loop. Playback logic keeps running — unmuting
   * mid-run picks the soundscape back up where it is.
   */
  setMuted(muted: boolean): void {
    Howler.mute(muted);
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
      this.sfx.slowmo,
    ])
      h.stop();
    if (this.crowdId !== null) {
      this.crowd.stop();
      this.crowdId = null;
    }
  }
}
