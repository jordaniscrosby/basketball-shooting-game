import { artTheme } from '../config/artTheme';

/**
 * artTheme persistence for the live-tuning workflow: dial in a look via the
 * lil-gui panel, "save & reload" to bake it (palette/outline/boil edits need
 * a reload — their values are painted into textures and hull geometry at
 * startup), "copy theme JSON" to hand the diff to whoever commits it into
 * artTheme.ts. Only the diff from the shipped defaults is stored, so a saved
 * theme survives unrelated artTheme.ts edits.
 */

const KEY = 'streak.artThemeOverrides.v1';

type Dict = Record<string, unknown>;

// Pristine defaults, captured at module import — before boot() merges any
// saved overrides into the live artTheme object.
const defaults = structuredClone(artTheme) as unknown as Dict;

/** Nested object of leaves where the live theme differs from the defaults. */
function diffFrom(cur: Dict, def: Dict): Dict | null {
  const out: Dict = {};
  let any = false;
  for (const k of Object.keys(def)) {
    const c = cur[k];
    const d = def[k];
    if (typeof d === 'object' && d !== null) {
      const sub = diffFrom(c as Dict, d as Dict);
      if (sub) {
        out[k] = sub;
        any = true;
      }
    } else if (c !== d) {
      out[k] = c;
      any = true;
    }
  }
  return any ? out : null;
}

/** Merge saved leaves into the live theme; unknown keys are dropped silently. */
function mergeInto(target: Dict, src: Dict): void {
  for (const k of Object.keys(src)) {
    if (!(k in target)) continue;
    const t = target[k];
    const s = src[k];
    if (typeof t === 'object' && t !== null) {
      if (typeof s === 'object' && s !== null) mergeInto(t as Dict, s as Dict);
    } else if (typeof s === typeof t) {
      target[k] = s;
    }
  }
}

export function themeDiff(): Dict | null {
  return diffFrom(artTheme as unknown as Dict, defaults);
}

/** Call first thing in boot(), before any module paints from artTheme. */
export function applySavedTheme(): void {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) mergeInto(artTheme as unknown as Dict, JSON.parse(raw) as Dict);
  } catch {
    /* corrupt or unavailable storage — run the shipped defaults */
  }
}

export function saveThemeAndReload(): void {
  try {
    const d = themeDiff();
    if (d) localStorage.setItem(KEY, JSON.stringify(d));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable — reload still applies nothing */
  }
  window.location.reload();
}

export function resetThemeAndReload(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

/** Copy the diff-from-defaults JSON (clipboard + console) for committing. */
export function copyThemeDiff(): void {
  const text = JSON.stringify(themeDiff() ?? {}, null, 2);
  console.log(`[artTheme] diff from defaults:\n${text}`);
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* console log above is the fallback */
  }
}
