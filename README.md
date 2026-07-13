# Streak — Basketball Shooting Game

3D swipe-to-shoot basketball with real physics: swipe up to shoot, one miss ends
your run, chase your best streak. Three.js + Rapier + TypeScript, no framework.

## Run

```sh
npm install
npm run dev       # http://localhost:5173
```

- **Swipe up** (mouse-drag or touch) to shoot. Swipe angle = aim, flick speed = power.
- Make +1, swish +2. Positions escalate in tiers at 3 / 7 / 10 consecutive makes.
- `npm run verify` — typecheck + unit tests (incl. the physics shot battery) + build.
- `node scripts/genAudio.mjs` — regenerate the placeholder SFX WAVs.

## Play on your phone (LAN)

No nginx/proxy needed — Vite serves on the LAN directly:

```sh
npm run dev -- --host   # then open http://<your-LAN-IP>:5173 on the phone
```

Vite prints the network URLs on startup (the `192.168.x.x` one is your Wi‑Fi).
Hot reload works over LAN. One-time setup on Windows — allow the port through
the firewall (elevated terminal); required especially when the Wi‑Fi network
profile is **Public**, which blocks all inbound by default:

```powershell
New-NetFirewallRule -DisplayName "Vite dev 5173" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Any
```

Gotchas:
- **VPN (e.g. NordVPN)** on either device can drop inbound LAN traffic — enable
  its "LAN discovery"/allow-local-network setting or disconnect it.
- Phone and PC must be on the same Wi‑Fi.
- Off-network alternative: `npx localtunnel --port 5173` (or `cloudflared`)
  gives a public HTTPS URL, bypassing LAN/firewall entirely.

## How it works

- **Fixed 60 Hz timestep** (`core/loop.ts`) with render interpolation; deterministic,
  so the debug panel's shot replay re-fires trajectories exactly.
- **All constants live in `config/tuning.ts`** — bound to the lil-gui panel (top right),
  including a Rapier debug-wireframe toggle.
- **Assisted aiming** (`systems/aim.ts`): each shot solves the perfect 45°-entry arc
  (`systems/shotSolver.ts`); the gesture perturbs it — azimuth → lateral error,
  flick speed → clamped power, curvature → sidespin. Misses are always explainable
  (see the `[shot]` console log).
- **Swipe velocity** uses the Android-style Lsq2 estimator (`input/velocityTracker.ts`).
- **Rim** is a ring of capsule colliders; **scoring** is two stacked crossing-plane
  sensors with an anti-cheese possession latch (`systems/scoring.ts`).
- **Shot battery** (`systems/shotBattery.ts`): fires solved shots from all 15 curated
  positions headlessly and asserts they score — the regression harness for any
  physics tuning change. Runs in vitest and from the debug panel.
- **Net** is a visual-only Verlet lattice (`net/verletNet.ts`); audio is howler with
  synthesized WAVs (swap files in `public/audio/` to upgrade).

Design docs live in the Obsidian vault under "Basketball Shooting Game".
