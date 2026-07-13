import { artTheme } from '../config/artTheme';

export type ShakeTier = 'small' | 'medium' | 'large';

let cleanupTimer = 0;

/**
 * Magnitude-tiered screen shake: a CSS-transform thump of the whole comic
 * panel — #game, #fx-overlay, and #hud move as one object (keyframes in
 * hud.css), which is the comic-ink read: the page gets thumped, not the
 * camera. Tier values come from artTheme.shake; the large tier adds a ±deg
 * roll with a baked scale so rotation never exposes canvas corners.
 * No-op in art-review mode so screenshots stay reproducible.
 */
export function screenShake(tier: ShakeTier): void {
  const body = document.body;
  if (body.classList.contains('art-review')) return;
  const S = artTheme.shake;
  const px = tier === 'large' ? S.largePx : tier === 'medium' ? S.mediumPx : S.smallPx;
  const ms = tier === 'large' ? S.largeMs : tier === 'medium' ? S.mediumMs : S.smallMs;
  const root = document.documentElement.style;
  root.setProperty('--shake-px', `${px}px`);
  root.setProperty('--shake-ms', `${ms}ms`);
  root.setProperty('--shake-deg', `${S.largeDeg}deg`);
  body.classList.remove('shake-sm', 'shake-md', 'shake-lg');
  void body.offsetWidth; // restart the animation
  body.classList.add(tier === 'large' ? 'shake-lg' : tier === 'medium' ? 'shake-md' : 'shake-sm');
  clearTimeout(cleanupTimer);
  cleanupTimer = window.setTimeout(
    () => body.classList.remove('shake-sm', 'shake-md', 'shake-lg'),
    ms + 60,
  );
}
