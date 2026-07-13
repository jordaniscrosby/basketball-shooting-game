// Synthesizes the game's placeholder SFX as 16-bit mono WAVs into public/audio/.
// Deterministic, dependency-free: run `node scripts/genAudio.mjs` after cloning.
// Swap any file for a sourced/recorded sound of the same name to upgrade audio.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');
mkdirSync(outDir, { recursive: true });

function writeWav(name, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(join(outDir, name), buf);
  console.log(`wrote ${name} (${(n / SR).toFixed(2)}s)`);
}

// Mulberry32 — deterministic noise so builds are reproducible.
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const secs = (s) => Math.round(s * SR);
const env = (i, attack, decay) => {
  const t = i / SR;
  return t < attack ? t / attack : Math.exp(-(t - attack) / decay);
};

/** One-pole band-ish filter for noise coloring. */
function bandNoise(len, freq, q, random) {
  const out = new Float64Array(len);
  let lp = 0, bp = 0;
  const f = 2 * Math.sin((Math.PI * Math.min(freq, SR / 4)) / SR);
  for (let i = 0; i < len; i++) {
    const white = random() * 2 - 1;
    lp += f * bp;
    const hp = white - lp - q * bp;
    bp += f * hp;
    out[i] = bp;
  }
  return out;
}

// --- floor bounce: thumpy pitch-dropping sine + click
{
  const len = secs(0.16);
  const s = new Float64Array(len);
  const random = rng(1);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 90 - 45 * t * 6;
    s[i] =
      Math.sin(2 * Math.PI * Math.max(f, 35) * t) * env(i, 0.002, 0.045) * 0.9 +
      (random() * 2 - 1) * env(i, 0.0005, 0.004) * 0.25;
  }
  writeWav('bounce.wav', s);
}

// --- rim clank: inharmonic metal partials
{
  const len = secs(0.5);
  const s = new Float64Array(len);
  const partials = [
    [812, 1, 0.09],
    [1219, 0.6, 0.07],
    [1583, 0.45, 0.055],
    [2114, 0.3, 0.04],
    [3170, 0.18, 0.03],
  ];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, a, d] of partials) v += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d);
    s[i] = v * env(i, 0.0008, 0.12) * 0.5;
  }
  writeWav('clank.wav', s);
}

// --- rim rattle: three staggered soft clanks
{
  const len = secs(0.55);
  const s = new Float64Array(len);
  const hits = [
    [0, 1],
    [0.11, 0.65],
    [0.24, 0.4],
  ];
  for (const [at, amp] of hits) {
    const off = secs(at);
    for (let i = 0; i < secs(0.25) && off + i < len; i++) {
      const t = i / SR;
      let v = 0;
      for (const [f, a, d] of [
        [724, 1, 0.05],
        [1330, 0.5, 0.04],
        [1890, 0.3, 0.03],
      ]) {
        v += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d);
      }
      s[off + i] += v * amp * env(i, 0.0008, 0.06) * 0.4;
    }
  }
  writeWav('rattle.wav', s);
}

// --- backboard thud: low knock + short noise
{
  const len = secs(0.22);
  const s = new Float64Array(len);
  const random = rng(2);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    s[i] =
      Math.sin(2 * Math.PI * (140 - 60 * t * 4) * t) * env(i, 0.001, 0.05) * 0.8 +
      Math.sin(2 * Math.PI * 320 * t) * env(i, 0.001, 0.02) * 0.3 +
      (random() * 2 - 1) * env(i, 0.0005, 0.008) * 0.2;
  }
  writeWav('thud.wav', s);
}

// --- swish variants: band-passed noise whoosh, falling center
for (let variant = 0; variant < 3; variant++) {
  const len = secs(0.28 + variant * 0.04);
  const random = rng(10 + variant);
  const noise = bandNoise(len, 2600 - variant * 350, 0.45, random);
  const s = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const body = Math.sin(Math.PI * Math.min(1, t / (len / SR))); // swell-fade
    s[i] = noise[i] * body * 0.85;
  }
  writeWav(`swish${variant + 1}.wav`, s);
}

// --- receipt tick: short woodblock-ish click, pitched up at play time
//     (audio.ts playTick raises playbackRate per receipt term)
{
  const len = secs(0.07);
  const s = new Float64Array(len);
  const random = rng(7);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    s[i] =
      Math.sin(2 * Math.PI * 1120 * t) * env(i, 0.001, 0.014) * 0.7 +
      Math.sin(2 * Math.PI * 1680 * t) * env(i, 0.0008, 0.008) * 0.3 +
      (random() * 2 - 1) * env(i, 0.0004, 0.003) * 0.2;
  }
  writeWav('tick.wav', s);
}

// --- mult hit: bright ringing ding for the ×multiplier receipt card
{
  const len = secs(0.38);
  const s = new Float64Array(len);
  const partials = [
    [1568, 1, 0.11],
    [2352, 0.5, 0.08],
    [3140, 0.3, 0.06],
    [4710, 0.15, 0.04],
  ];
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    let v = 0;
    for (const [f, a, d] of partials) v += a * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / d);
    s[i] = v * env(i, 0.0008, 0.14) * 0.45;
  }
  writeWav('multhit.wav', s);
}

// --- bass hit: low pitch-dropping thump for the receipt total
{
  const len = secs(0.42);
  const s = new Float64Array(len);
  const random = rng(8);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const f = 82 - 40 * Math.min(1, t * 5);
    s[i] =
      Math.sin(2 * Math.PI * Math.max(f, 40) * t) * env(i, 0.003, 0.13) * 0.95 +
      (random() * 2 - 1) * env(i, 0.0005, 0.006) * 0.12;
  }
  writeWav('basshit.wav', s);
}

// --- crowd bed: loopable murmur (low noise with slow undulation)
{
  const len = secs(3.0);
  const random = rng(42);
  const noise = bandNoise(len, 420, 0.2, random);
  const s = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const und = 0.75 + 0.25 * Math.sin(2 * Math.PI * t / 1.5) * Math.sin(2 * Math.PI * t / 0.9 + 1.3);
    // Crossfade head/tail so it loops seamlessly.
    const edge = Math.min(1, Math.min(i, len - 1 - i) / secs(0.08));
    s[i] = noise[i] * und * edge * 0.5;
  }
  writeWav('crowd.wav', s);
}

// --- crowd swell: rising cheer burst for milestones/makes on fire
{
  const len = secs(1.4);
  const random = rng(43);
  const noise = bandNoise(len, 900, 0.3, random);
  const s = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const shape = Math.pow(Math.sin(Math.PI * Math.min(1, t / 1.4)), 0.7);
    s[i] = noise[i] * shape * 0.8;
  }
  writeWav('swell.wav', s);
}

console.log('done');
