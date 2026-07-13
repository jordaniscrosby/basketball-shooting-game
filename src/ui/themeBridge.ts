import { artTheme } from '../config/artTheme';

/**
 * Runtime bridge: artTheme is the single source of truth for every UI color
 * and HUD motion dial; this writes them onto :root as CSS custom properties
 * so hud.css reads live values. The literals in the hud.css :root block are
 * pre-boot fallbacks only. Called at boot (after applySavedTheme merges
 * overrides) and from debug-panel onChange hooks so color/motion dials reach
 * the DOM HUD without the save-and-reload cycle baked dials need.
 */
export function applyThemeToCss(): void {
  const s = document.documentElement.style;
  const P = artTheme.palette;
  s.setProperty('--ink', P.ink);
  s.setProperty('--paper', P.paper);
  s.setProperty('--accent', P.courtAccent);
  s.setProperty('--fire', P.fire);
  s.setProperty('--star', P.star);
  s.setProperty('--sb-panel', P.sbPanel);
  s.setProperty('--sb-chips', P.sbChips);
  s.setProperty('--sb-mult', P.sbMult);
  s.setProperty('--sb-digit', P.sbDigit);
  s.setProperty('--grain-opacity', String(artTheme.grainOpacity));
  const S = artTheme.score;
  s.setProperty('--score-base', S.base);
  s.setProperty('--score-bonus', S.bonus);
  s.setProperty('--score-mult', S.mult);
  s.setProperty('--score-total', S.total);
  s.setProperty('--digit-pop-scale', String(artTheme.hud.digitPopScale));
  s.setProperty('--sb-breathe-deg', `${artTheme.hud.breatheDeg}deg`);
  s.setProperty('--sb-breathe-sec', `${artTheme.hud.breatheSec}s`);
  s.setProperty('--sb-heat-scale-fire', String(artTheme.hud.heatScaleFire));
  s.setProperty('--sb-heat-scale-superstar', String(artTheme.hud.heatScaleSuperstar));
  s.setProperty('--sb-ignite-px', `${artTheme.hud.igniteJitterPx}px`);
  s.setProperty('--sb-flame-em', `${artTheme.hud.flameEm}em`);
  s.setProperty('--swirl-screen-alpha', String(artTheme.swirl.screenAlpha));
}
