/**
 * Control scheme selection: touch swipe vs mouse slingshot. Auto-detected
 * from the primary pointer, overridable via the HUD toggle (persisted).
 */

export type ControlMode = 'swipe' | 'slingshot';

const KEY = 'streak.controlMode';

/** Fine primary pointer (mouse/trackpad) → slingshot; coarse (touch) → swipe. */
export function detectControlMode(): ControlMode {
  try {
    return window.matchMedia('(pointer: fine)').matches ? 'slingshot' : 'swipe';
  } catch {
    return 'swipe';
  }
}

export function loadControlMode(): ControlMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'swipe' || v === 'slingshot') return v;
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
