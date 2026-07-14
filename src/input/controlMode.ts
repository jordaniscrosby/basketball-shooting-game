/**
 * Control scheme selection: touch swipe, mouse slingshot, or click-click
 * (aim click + power-meter click). Auto-detected from the primary pointer,
 * overridable via the HUD toggle (persisted), which cycles all modes.
 */

export type ControlMode = 'swipe' | 'slingshot' | 'clickclick';

const MODES: readonly ControlMode[] = ['swipe', 'slingshot', 'clickclick'];

const KEY = 'streak.controlMode';

/** Fine primary pointer (mouse/trackpad) → slingshot; coarse (touch) → swipe. */
export function detectControlMode(): ControlMode {
  try {
    return window.matchMedia('(pointer: fine)').matches ? 'slingshot' : 'swipe';
  } catch {
    return 'swipe';
  }
}

/** HUD toggle order: swipe → slingshot → clickclick → swipe. */
export function nextControlMode(mode: ControlMode): ControlMode {
  return MODES[(MODES.indexOf(mode) + 1) % MODES.length]!;
}

export function loadControlMode(): ControlMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'swipe' || v === 'slingshot' || v === 'clickclick') return v;
  } catch {
    // Storage unavailable — fall through to detection.
  }
  return detectControlMode();
}

export function saveControlMode(mode: ControlMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage unavailable — the choice just won't persist.
  }
}
