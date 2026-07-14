import * as THREE from 'three';
import { artTheme } from '../config/artTheme';
import { seededRng, hash01 } from '../scene/toon';
import type { SwirlCanvas } from './swirl';

/** 'base' | 'bonus' | 'mult' | 'total' are the semantic score roles
 *  (artTheme.score) — same colors as the HUD, the mapping never breaks. */
type CardStyle = 'paper' | 'accent' | 'fire' | 'star' | 'base' | 'bonus' | 'mult' | 'total';

interface FxCard {
  kind: 'card';
  text: string;
  sub: string | undefined;
  style: CardStyle;
  /** Anchored to a world point (projected live) or screen-centered panel. */
  world: THREE.Vector3 | null;
  burst: boolean;
  big: boolean;
  born: number;
  lifeMs: number;
  tilt: number;
  seed: number;
  /** Stack offset (px) so simultaneous cards don't overlap. */
  offsetY: number;
  /** Size multiplier — receipt total cards render bigger than term cards. */
  scale: number;
}

interface FxParticles {
  kind: 'stars' | 'dust';
  world: THREE.Vector3;
  born: number;
  lifeMs: number;
  seed: number;
  strength: number;
}

type FxItem = FxCard | FxParticles;

/**
 * Screen-space comic FX layer: onomatopoeia cards, halftone bursts, impact
 * stars, dust poofs, focus lines, freeze-frame panels. Deliberately animated
 * "on twos" (artTheme.fx.stepHz) with pop-in overshoot — the 3D world stays
 * 60 fps, this layer is choppy, and that contrast IS the style. Pure 2D
 * canvas: zero WebGL budget.
 */
export class ComicFx {
  private readonly ctx: CanvasRenderingContext2D;
  private items: FxItem[] = [];
  private time = 0;
  private focus = false;
  private warp = 0;
  private swirl: SwirlCanvas | null = null;
  private panelSwirlOn = false;
  private readonly v = new THREE.Vector3();

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    // Warm the comic fonts so first cards don't fall back.
    void document.fonts?.load('700 64px Bangers');
    void document.fonts?.load('400 32px "Patrick Hand"');
  }

  /** Onomatopoeia card anchored at a world point (the hoop, usually). */
  card(
    text: string,
    world: THREE.Vector3,
    opts: {
      sub?: string | undefined;
      style?: CardStyle;
      burst?: boolean;
      stack?: number;
      scale?: number;
    } = {},
  ): void {
    this.items.push({
      kind: 'card',
      text,
      sub: opts.sub,
      style: opts.style ?? 'paper',
      world: world.clone(),
      burst: opts.burst ?? false,
      big: false,
      born: this.time,
      lifeMs: artTheme.fx.cardLifeMs,
      tilt: (hash01(this.items.length + text.length) - 0.5) * 0.14,
      seed: (this.items.length * 7919) ^ text.length,
      offsetY: (opts.stack ?? 0) * 58,
      scale: opts.scale ?? 1,
    });
  }

  /** Big screen-centered freeze-frame panel (star milestones, NEW BEST). */
  panel(text: string, sub?: string, style: CardStyle = 'star'): void {
    this.items.push({
      kind: 'card',
      text,
      sub,
      style,
      world: null,
      burst: true,
      big: true,
      born: this.time,
      lifeMs: artTheme.fx.freezePanelMs,
      tilt: -0.035,
      seed: this.items.length * 104729,
      offsetY: 0,
      scale: 1,
    });
  }

  /** Impact stars (rim/board) or dust poof (floor) at a world point. */
  impact(world: THREE.Vector3, kind: 'stars' | 'dust', strength = 1): void {
    this.items.push({
      kind,
      world: world.clone(),
      born: this.time,
      lifeMs: kind === 'stars' ? 480 : 560,
      seed: this.items.length * 31337,
      strength,
    });
  }

  /** Comic focus-line vignette (on while on fire and above). */
  setFocusLines(on: boolean): void {
    this.focus = on;
  }

  /** Bullet-time warp tunnel, strength ∈ [0,1] (0 = off). */
  setWarp(strength: number): void {
    this.warp = Math.max(0, Math.min(1, strength));
  }

  /** Optional swirl cameo: big panels fill their interiors with it. */
  attachSwirl(swirl: SwirlCanvas): void {
    this.swirl = swirl;
  }

  render(dt: number, camera: THREE.Camera): void {
    this.time += dt * 1000;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.warp > 0.01) this.drawWarp();
    if (this.focus) this.drawFocusLines();

    this.items = this.items.filter((it) => this.time - it.born < it.lifeMs);
    // Reward-reveal staging: while a big freeze panel is up, dim the world to
    // ink with a spotlight hole — drawn under the cards so the panel is lit.
    let bigPanel: FxCard | null = null;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i]!;
      if (it.kind === 'card' && it.big) {
        bigPanel = it;
        break;
      }
    }
    if (bigPanel) this.drawPanelDim(bigPanel);
    // Swirl cameo lifecycle: runs only while a panel needs it.
    if (this.swirl) {
      if (!!bigPanel !== this.panelSwirlOn) {
        this.panelSwirlOn = !!bigPanel;
        const P = artTheme.palette;
        this.swirl.want('panel', this.panelSwirlOn, [P.fire, P.star, P.ink]);
      }
      this.swirl.update(dt);
    }
    for (const it of this.items) {
      // Quantize age to the step grid — animation on twos.
      const age = this.time - it.born;
      const stepMs = 1000 / artTheme.fx.stepHz;
      const stepped = Math.floor(age / stepMs) * stepMs;
      const stepIndex = Math.floor(age / stepMs);
      if (it.kind === 'card') this.drawCard(it, stepped, stepIndex, camera);
      else this.drawParticles(it, stepped, stepIndex, camera);
    }
  }

  private project(world: THREE.Vector3, camera: THREE.Camera): { x: number; y: number } | null {
    this.v.copy(world).project(camera);
    if (this.v.z > 1) return null;
    return {
      x: (this.v.x * 0.5 + 0.5) * this.canvas.width,
      y: (-this.v.y * 0.5 + 0.5) * this.canvas.height,
    };
  }

  private styleColors(style: CardStyle): { bg: string; fg: string } {
    const P = artTheme.palette;
    const S = artTheme.score;
    switch (style) {
      case 'accent':
        return { bg: P.courtAccent, fg: P.paper };
      case 'fire':
        return { bg: P.fire, fg: P.paper };
      case 'star':
        return { bg: P.star, fg: P.ink };
      case 'base':
        return { bg: P.paper, fg: S.base };
      case 'bonus':
        return { bg: S.bonus, fg: P.paper };
      case 'mult':
        return { bg: S.mult, fg: P.ink };
      case 'total':
        return { bg: S.total, fg: P.paper };
      default:
        return { bg: P.paper, fg: P.ink };
    }
  }

  /** Ink dim with a transparent spotlight ellipse at the panel anchor —
   *  fades in over the pop and out with the panel exit, on the step grid. */
  private drawPanelDim(panel: FxCard): void {
    const { ctx, canvas } = this;
    const stepMs = 1000 / artTheme.fx.stepHz;
    const stepped = Math.floor((this.time - panel.born) / stepMs) * stepMs;
    const exitStart = panel.lifeMs - 180;
    const fadeIn = Math.min(1, stepped / (artTheme.fx.popMs * 2));
    const fadeOut = stepped >= exitStart ? Math.max(0, 1 - (stepped - exitStart) / 180) : 1;
    const alpha = artTheme.fx.panelDimAlpha * fadeIn * fadeOut;
    if (alpha <= 0.01) return;
    const cx = canvas.width / 2;
    const cy = canvas.height * 0.42;
    const fontPx = Math.min(96, canvas.width * 0.085);
    const spot = fontPx * 2.6 * artTheme.fx.panelSpotScale;
    const g = ctx.createRadialGradient(cx, cy, spot * 0.55, cx, cy, spot * 1.7);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, artTheme.palette.ink);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  private drawCard(card: FxCard, stepped: number, stepIndex: number, camera: THREE.Camera): void {
    const { ctx, canvas } = this;
    let x: number;
    let y: number;
    if (card.world) {
      const p = this.project(card.world, camera);
      if (!p) return;
      x = p.x;
      y = p.y - 46 - card.offsetY;
    } else {
      x = canvas.width / 2;
      y = canvas.height * 0.42;
    }

    // Pop-in overshoot → settle → exit shrink, all on the step grid.
    const pop = artTheme.fx.popMs;
    const exitStart = card.lifeMs - 180;
    let scale: number;
    let alpha = 1;
    if (stepped < pop) scale = 0.35 + (1.22 - 0.35) * (stepped / pop);
    else if (stepped < pop * 2) scale = 1.22 - 0.27 * ((stepped - pop) / pop);
    else if (stepped < exitStart) scale = 0.95 + 0.05 * Math.min(1, (stepped - pop * 2) / pop);
    else {
      const k = (stepped - exitStart) / 180;
      scale = 1 - 0.35 * k;
      alpha = 1 - k;
    }

    const fontPx =
      (card.big ? Math.min(96, canvas.width * 0.085) : Math.min(52, canvas.width * 0.045)) *
      scale *
      card.scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(x, y);
    ctx.rotate(card.tilt);

    if (card.burst) this.drawBurst(fontPx * 2.6, card.seed, stepIndex);

    ctx.font = `700 ${fontPx}px Bangers, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(card.text);
    const padX = fontPx * 0.42;
    const padY = fontPx * 0.26;
    const w = metrics.width + padX * 2;
    const h = fontPx + padY * 2;
    const { bg, fg } = this.styleColors(card.style);

    // Paper card with a boiling wobbly ink border.
    ctx.fillStyle = bg;
    ctx.strokeStyle = artTheme.palette.ink;
    ctx.lineWidth = Math.max(2, fontPx * 0.06);
    const rng = seededRng(card.seed + stepIndex * 101);
    this.wobblyRect(-w / 2, -h / 2, w, h, rng);
    ctx.fill();
    // Big panels: swirl-paint fill clipped inside the wobbly border.
    if (card.big && this.swirl?.active) {
      ctx.save();
      ctx.clip();
      ctx.globalAlpha *= artTheme.swirl.panelFillAlpha;
      ctx.drawImage(this.swirl.canvas, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.fillText(card.text, 0, fontPx * 0.06);

    if (card.sub) {
      const subPx = fontPx * 0.34;
      ctx.font = `400 ${subPx}px "Patrick Hand", cursive`;
      ctx.fillStyle = artTheme.palette.ink;
      ctx.fillText(card.sub, 0, h / 2 + subPx * 0.9);
    }
    ctx.restore();
  }

  /** Halftone starburst: spiky polygon + dot rings, boiling with the steps. */
  private drawBurst(radius: number, seed: number, stepIndex: number): void {
    const { ctx } = this;
    const rng = seededRng(seed + stepIndex * 977);
    const spikes = 14;
    ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + rng() * 0.05;
      const r = (i % 2 === 0 ? radius : radius * 0.62) * (0.92 + rng() * 0.16);
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r * 0.82;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = artTheme.palette.paper;
    ctx.fill();
    ctx.strokeStyle = artTheme.palette.ink;
    ctx.lineWidth = 3;
    ctx.stroke();
    // Halftone dots ring.
    ctx.fillStyle = artTheme.palette.ink;
    const dots = 26;
    for (let i = 0; i < dots; i++) {
      const a = (i / dots) * Math.PI * 2 + rng() * 0.1;
      const rr = radius * (0.72 + rng() * 0.12);
      ctx.globalAlpha *= 0.35;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.82, 2.2 + rng() * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha /= 0.35;
    }
  }

  private drawParticles(
    p: FxParticles,
    stepped: number,
    stepIndex: number,
    camera: THREE.Camera,
  ): void {
    const { ctx } = this;
    const at = this.project(p.world, camera);
    if (!at) return;
    const t = Math.min(1, stepped / p.lifeMs);
    const rng = seededRng(p.seed);
    ctx.save();
    ctx.translate(at.x, at.y);
    if (p.kind === 'stars') {
      const n = 4 + Math.round(p.strength * 2);
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2;
        const dist = (26 + rng() * 40 * p.strength) * t;
        const size = (7 + rng() * 6) * (1 - t * 0.6);
        const jr = seededRng(p.seed + i * 13 + stepIndex * 7);
        // Per-star twinkle on the step grid — stars flicker, never sit still.
        ctx.globalAlpha = 1 - artTheme.fx.starTwinkle * jr();
        this.star(
          Math.cos(a) * dist + (jr() - 0.5) * 3,
          Math.sin(a) * dist * 0.7 + (jr() - 0.5) * 3,
          size,
          artTheme.palette.star,
        );
      }
      ctx.globalAlpha = 1;
    } else {
      const n = 3;
      ctx.strokeStyle = artTheme.palette.ink;
      ctx.lineWidth = 2.5;
      for (let i = 0; i < n; i++) {
        const a = Math.PI + (i - 1) * 0.7 + rng() * 0.3;
        const dist = (14 + rng() * 22) * t;
        const r = (8 + rng() * 7) * (0.4 + t);
        ctx.globalAlpha = (1 - t) * 0.9;
        ctx.fillStyle = artTheme.palette.paper;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * dist, Math.sin(a) * dist * 0.4 - 4 * t, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private star(x: number, y: number, r: number, color: string): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = artTheme.palette.ink;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  /**
   * Bullet-time warp: long ink streaks rushing from the screen edges toward
   * center (the tunnel) under a soft ink vignette. Both scale with strength,
   * and the streaks boil on the step grid like everything else here.
   */
  private drawWarp(): void {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.hypot(cx, cy);
    const k = this.warp;
    const stepIndex = Math.floor(this.time / (1000 / artTheme.fx.stepHz));
    const rng = seededRng(0x5107 + stepIndex * 613);

    // Vignette first — the world darkens toward the edges while time dips.
    const vAlpha = artTheme.slowmoFx.vignetteAlpha * k;
    if (vAlpha > 0.01) {
      const g = ctx.createRadialGradient(cx, cy, maxR * 0.45, cx, cy, maxR);
      g.addColorStop(0, 'transparent');
      g.addColorStop(1, artTheme.palette.ink);
      ctx.save();
      ctx.globalAlpha = vAlpha;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = artTheme.palette.ink;
    ctx.globalAlpha = artTheme.slowmoFx.warpAlpha * k;
    ctx.lineCap = 'round';
    const n = artTheme.slowmoFx.warpLineCount;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.09;
      // Streaks grow inward with strength — the tunnel closes in.
      const len = maxR * (0.18 + (0.2 + rng() * 0.22) * k);
      const r1 = maxR * (1.02 - rng() * 0.06);
      ctx.lineWidth = 1.5 + rng() * 3.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r1 - len), cy + Math.sin(a) * (r1 - len));
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFocusLines(): void {
    const { ctx, canvas } = this;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const maxR = Math.hypot(cx, cy);
    const stepIndex = Math.floor(this.time / (1000 / artTheme.fx.stepHz));
    const rng = seededRng(0xf0c05 + stepIndex * 331);
    ctx.save();
    ctx.strokeStyle = artTheme.palette.ink;
    ctx.globalAlpha = 0.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < artTheme.fx.focusLineCount; i++) {
      const a = (i / artTheme.fx.focusLineCount) * Math.PI * 2 + rng() * 0.06;
      const len = maxR * (0.1 + rng() * 0.1);
      const r0 = maxR - len * (0.6 + rng() * 0.4);
      ctx.lineWidth = 2 + rng() * 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * (r0 + len), cy + Math.sin(a) * (r0 + len));
      ctx.stroke();
    }
    ctx.restore();
  }

  private wobblyRect(x: number, y: number, w: number, h: number, rng: () => number): void {
    const { ctx } = this;
    const j = Math.max(1.5, Math.min(4, w * 0.012));
    const pts: Array<[number, number]> = [];
    const seg = (x0: number, y0: number, x1: number, y1: number) => {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        pts.push([x0 + (x1 - x0) * t + (rng() - 0.5) * 2 * j, y0 + (y1 - y0) * t + (rng() - 0.5) * 2 * j]);
      }
    };
    seg(x, y, x + w, y);
    seg(x + w, y, x + w, y + h);
    seg(x + w, y + h, x, y + h);
    seg(x, y + h, x, y);
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.closePath();
  }
}
