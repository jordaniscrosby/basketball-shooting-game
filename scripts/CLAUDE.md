# scripts/

## genAudio.mjs
`node scripts/genAudio.mjs` — dependency-free Node script that synthesizes the placeholder SFX as 16-bit mono 44.1 kHz WAVs into `public/audio/`. Deterministic (mulberry32-seeded noise ⇒ reproducible builds).

Generates: `bounce` (floor), `clank` + `rattle` (rim), `thud` (backboard), `swish1-3`, `crowd` (3 s loopable, crossfaded head/tail), `swell` (milestone cheer). Helpers: `writeWav()`, `env()` (attack/decay), `bandNoise()`.

To upgrade audio, drop a real recording over the same filename in `public/audio/` — `systems/audio.ts` loads by name; no code change needed. Don't edit `dist/audio/` (build output).
