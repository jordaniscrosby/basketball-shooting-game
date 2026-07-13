/** Shared easing vocabulary for visual tweens (HUD rolls, camera moves). */

export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Back-out overshoot — lands past the target and springs back. The signature
 * Balatro curve: nothing eases in politely. `s` sets overshoot strength
 * (1.70158 ≈ the classic 10% overshoot).
 */
export const easeOutBack = (t: number, s = 1.70158): number => {
  const c3 = s + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
};
