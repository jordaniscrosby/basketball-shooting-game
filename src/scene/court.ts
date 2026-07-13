import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { toonMaterial, seededRng } from './toon';
import type { ArtOverrides } from './artAssets';

export interface CourtVisual {
  group: THREE.Group;
  /** The rim torus mesh — the Verlet net pins to this later. */
  rimMesh: THREE.Mesh;
  backboardMesh: THREE.Mesh;
  poleMesh: THREE.Mesh;
  armMesh: THREE.Mesh;
  /** Park props (bench, cow) that want ink outlines like the hoop hardware. */
  propMeshes: THREE.Mesh[];
  /** Swap pre-baked jittered texture variants — the court's line boil. */
  applyBoilFrame(frame: number): void;
}

/**
 * Hand-drawn cartoon court dropped into a rural country park: flat fills,
 * markings as wobbly jittered ink polylines (pre-baked variants cycled for
 * line boil), grass lawn with paved trails, painted countryside backdrop,
 * a bench and a cow. Visual hoop stays aligned to the procedural colliders —
 * both read the same tuning values.
 *
 * Every painted texture has an authored-override slot (see artAssets.ts):
 * an override replaces the procedural painting AND its boil variants (an
 * authored texture doesn't boil — only its ink outline hulls do).
 */
export function createCourt(scene: THREE.Scene, art: ArtOverrides = {}): CourtVisual {
  const group = new THREE.Group();

  const floorOverride = art['court-floor'];
  const boardOverride = art['backboard'];
  const floorVariants: THREE.CanvasTexture[] = [];
  const boardVariants: THREE.CanvasTexture[] = [];
  for (let v = 0; v < artTheme.boil.variants; v++) {
    if (!floorOverride) floorVariants.push(paintCourtTexture(0xc0947 + v * 131));
    if (!boardOverride) boardVariants.push(paintBackboardTexture(0xb0a4d + v * 733));
  }

  // Flat fills want no lighting at all — MeshBasicMaterial is the "painted cel".
  const floorMat = new THREE.MeshBasicMaterial({ map: floorOverride ?? floorVariants[0]! });
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(tuning.court.width, tuning.court.length),
    floorMat,
  );
  floorMesh.rotation.x = -Math.PI / 2;
  group.add(floorMesh);

  // Park lawn around the court: painted grass with tufts, flowers, and
  // winding paved trails.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshBasicMaterial({ map: art['grass'] ?? paintGrassTexture(0x9a55e) }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.002;
  group.add(apron);

  const backdrop = buildBackdrop(art['backdrop']);
  group.add(backdrop);

  const props = buildParkProps(art);
  group.add(props.group);

  const hoop = buildHoopVisual(boardVariants, boardOverride);
  group.add(hoop.group);

  scene.add(group);
  return {
    group,
    rimMesh: hoop.rim,
    backboardMesh: hoop.board,
    poleMesh: hoop.pole,
    armMesh: hoop.arm,
    propMeshes: props.outlined,
    applyBoilFrame(frame: number) {
      const i = frame % artTheme.boil.variants;
      if (!floorOverride) floorMat.map = floorVariants[i]!;
      if (!boardOverride) hoop.boardFaceMat.map = boardVariants[i]!;
    },
  };
}

function buildHoopVisual(
  boardVariants: THREE.CanvasTexture[],
  boardOverride?: THREE.CanvasTexture,
): {
  group: THREE.Group;
  rim: THREE.Mesh;
  board: THREE.Mesh;
  pole: THREE.Mesh;
  arm: THREE.Mesh;
  boardFaceMat: THREE.MeshToonMaterial;
} {
  const group = new THREE.Group();
  const rimY = tuning.rim.height;
  const rimZ = derived.rimCenterZ;
  const faceZ = derived.backboardFaceZ;
  const bb = tuning.backboard;

  // Rim torus matches the capsule ring: centreline radius = inner + rod.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(derived.rimInnerRadius + tuning.rim.rodRadius, tuning.rim.rodRadius, 12, 48),
    toonMaterial({ color: artTheme.palette.rim }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, rimY, rimZ);
  group.add(rim);

  // Backboard: opaque paper white with hand-drawn border + shooter's square.
  const boardFaceMat = toonMaterial({ map: boardOverride ?? boardVariants[0]! });
  const plain = () => toonMaterial({ color: artTheme.palette.backboard });
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(bb.width, bb.height, bb.thickness),
    [plain(), plain(), plain(), plain(), boardFaceMat, plain()],
  );
  board.position.set(0, bb.bottomEdge + bb.height / 2, faceZ - bb.thickness / 2);
  group.add(board);

  // Rim-to-board bracket.
  const poleMat = toonMaterial({ color: artTheme.palette.pole });
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.1, tuning.rim.centerFromBoard - derived.rimInnerRadius),
    poleMat,
  );
  bracket.position.set(0, rimY - 0.06, (faceZ + (rimZ - derived.rimInnerRadius)) / 2);
  group.add(bracket);

  // Stanchion: base behind the baseline, arm reaching over to the board.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.6, 16), poleMat);
  pole.position.set(0, 1.8, faceZ - 1.5);
  group.add(pole);
  const armLen = 1.5 - bb.thickness;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, armLen, 12), poleMat);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 3.55, faceZ - 0.75);
  group.add(arm);

  return { group, rim, board, pole, arm, boardFaceMat };
}

/**
 * Painted countryside wrapped around the whole park as an inward-facing
 * cylinder: sky, sun, clouds, rolling hills, barn, split-rail fence. A
 * cylinder (not a plane) because corner-shot cameras look at the horizon
 * from steep side angles — a flat backdrop would show its edges.
 *
 * The canvas wraps 360°, so every silhouette uses whole sine cycles across
 * the width and doodles keep clear of the u = 0 seam (placed behind the
 * player). Horizontal px/m is ~0.65× the vertical, so circular doodles are
 * drawn as ellipses (KX) to stay round in world space.
 */
const BACKDROP_KX = 0.65;

function buildBackdrop(override?: THREE.CanvasTexture): THREE.Mesh {
  const tex = override ?? paintBackdropTexture();
  // Inward-facing wall: u = 0 sits at +z, behind the player; u = 0.5 is the
  // view straight past the hoop. Grass at the canvas bottom meets the lawn,
  // sky at the top meets scene.background — no visible edges anywhere.
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(30, 30, 19, 96, 1, true),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide }),
  );
  mesh.position.set(0, 9.5, 0);
  return mesh;
}

function paintBackdropTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(0xfacade);
  const P = artTheme.palette;
  const W = c.width;
  const H = c.height;
  const KX = BACKDROP_KX;

  // Sky matches scene.background exactly, so the wall top vanishes into it.
  ctx.fillStyle = P.sky;
  ctx.fillRect(0, 0, W, H);

  // Sun, up and left of the hoop: yellow rays, disc, wobbly ink outline.
  const sunX = W * 0.66;
  const sunY = H * 0.22;
  const sunR = 70;
  ctx.strokeStyle = P.star;
  ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const r0 = sunR + 12 + rng() * 6;
    const r1 = r0 + 26 + rng() * 18;
    ctx.lineWidth = 7 + rng() * 3;
    ctx.beginPath();
    ctx.moveTo(sunX + Math.cos(a) * r0 * KX, sunY + Math.sin(a) * r0);
    ctx.lineTo(sunX + Math.cos(a) * r1 * KX, sunY + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.fillStyle = P.star;
  ctx.beginPath();
  ctx.ellipse(sunX, sunY, sunR * KX, sunR, 0, 0, Math.PI * 2);
  ctx.fill();
  wobblyStroke(
    ctx,
    sampleArc(sunX, sunY, sunR, 0, Math.PI * 2, 40).map((p) => ({
      x: sunX + (p.x - sunX) * KX,
      y: p.y,
    })),
    rng, 4, 2.5, P.ink,
  );

  // Clouds: flat paper blobs with an ink underline.
  for (const [cx, cy, s] of [
    [W * 0.3, H * 0.16, 1.2],
    [W * 0.46, H * 0.26, 0.9],
    [W * 0.7, H * 0.12, 1.05],
  ] as const) {
    ctx.fillStyle = P.paper;
    for (const [dx, dy, r] of [[-46, 6, 34], [0, -10, 46], [48, 8, 32]] as const) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * s, cy + dy * s, r * s, r * 0.72 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    wobblyStroke(
      ctx,
      sampleLine(cx - 72 * s, cy + 22 * s, cx + 72 * s, cy + 22 * s, 30),
      rng, 3.5, 2.5, P.ink,
    );
  }

  // Rolling hills: far band, then the near lawn the fence sits on. Whole
  // sine cycles across W keep the wrap seam continuous.
  const farLine: Array<{ x: number; y: number }> = [];
  for (let x = 0; x <= W; x += 32) {
    farLine.push({ x, y: H * 0.62 + Math.sin((x / W) * Math.PI * 2 * 5 + 1.2) * H * 0.05 });
  }
  ctx.fillStyle = P.hillFar;
  fillBelow(ctx, farLine, H);
  wobblyStroke(ctx, farLine, rng, 4, 2.5, P.ink);

  // Trees dotted along the far hill.
  for (const tx of [0.1, 0.28, 0.45, 0.62, 0.8, 0.88]) {
    paintTree(ctx, W * tx, H * (0.7 + rng() * 0.06), 0.8 + rng() * 0.5, rng);
  }

  // Little red barn — it's a farm town after all.
  paintBarn(ctx, W * 0.37, H * 0.72, rng);

  const nearLine: Array<{ x: number; y: number }> = [];
  for (let x = 0; x <= W; x += 32) {
    nearLine.push({ x, y: H * 0.82 + Math.sin((x / W) * Math.PI * 2 * 7 + 4) * H * 0.03 });
  }
  ctx.fillStyle = P.grass;
  fillBelow(ctx, nearLine, H);
  wobblyStroke(ctx, nearLine, rng, 4, 2.5, P.ink);

  // Split-rail fence running along the near lawn.
  const fenceY = (x: number) => H * 0.88 + Math.sin((x / W) * Math.PI * 2 * 4 + 2) * H * 0.02;
  for (const dy of [-26, -14]) {
    const rail = [];
    for (let x = 0; x <= W; x += 32) rail.push({ x, y: fenceY(x) + dy });
    wobblyStroke(ctx, rail, rng, 4.5, 2.5, P.ink);
  }
  for (let x = 24; x < W - 40; x += 68 + rng() * 30) {
    wobblyStroke(ctx, sampleLine(x, fenceY(x) - 34, x, fenceY(x) + 4, 12), rng, 6, 2, P.ink);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Fill from a silhouette polyline down to the canvas bottom. */
function fillBelow(
  ctx: CanvasRenderingContext2D,
  line: Array<{ x: number; y: number }>,
  bottom: number,
): void {
  ctx.beginPath();
  ctx.moveTo(line[0]!.x, line[0]!.y);
  for (const p of line.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.lineTo(line[line.length - 1]!.x, bottom);
  ctx.lineTo(line[0]!.x, bottom);
  ctx.closePath();
  ctx.fill();
}

/** Doodle tree: trunk + blob canopy with a wobbly ink crown. */
function paintTree(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  s: number,
  rng: () => number,
): void {
  const P = artTheme.palette;
  const KX = BACKDROP_KX;
  ctx.fillStyle = P.treeTrunk;
  ctx.fillRect(x - 5 * s * KX, baseY - 30 * s, 10 * s * KX, 30 * s);
  ctx.fillStyle = P.treeLeaf;
  for (const [dx, dy, r] of [[-18, -38, 22], [0, -56, 28], [18, -38, 22]] as const) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s * KX, baseY + dy * s, r * s * KX, r * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  wobblyStroke(
    ctx,
    sampleArc(x, baseY - 46 * s, 32 * s, Math.PI * 0.9, Math.PI * 2.1, 26).map((p) => ({
      x: x + (p.x - x) * KX,
      y: p.y,
    })),
    rng, 3.5, 2.5, P.ink,
  );
}

/** Doodle barn: red body, slate roof, paper door with a cross-plank X. */
function paintBarn(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  rng: () => number,
): void {
  const P = artTheme.palette;
  const w = 150;
  const h = 130;
  ctx.fillStyle = P.courtAccent;
  ctx.fillRect(x - w / 2, baseY - h, w, h);
  ctx.fillStyle = P.pole;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 - 14, baseY - h);
  ctx.lineTo(x - w / 4, baseY - h - 46);
  ctx.lineTo(x + w / 4, baseY - h - 46);
  ctx.lineTo(x + w / 2 + 14, baseY - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = P.paper;
  ctx.fillRect(x - 26, baseY - 56, 52, 56);
  wobblyStroke(ctx, sampleRect(x - w / 2, baseY - h, w, h, 30), rng, 4, 2.5, P.ink);
  wobblyStroke(ctx, sampleRect(x - 26, baseY - 56, 52, 56, 20), rng, 3.5, 2, P.ink);
  wobblyStroke(ctx, sampleLine(x - 26, baseY - 56, x + 26, baseY, 16), rng, 3, 2, P.ink);
  wobblyStroke(ctx, sampleLine(x + 26, baseY - 56, x - 26, baseY, 16), rng, 3, 2, P.ink);
}

/** Park lawn: flat grass, mow patches, tuft doodles, wildflowers, paved trails. */
function paintGrassTexture(seed: number): THREE.CanvasTexture {
  const size = 80; // m — matches the apron plane
  const scale = 20; // px per metre
  const c = document.createElement('canvas');
  c.width = size * scale;
  c.height = size * scale;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(seed);
  const P = artTheme.palette;
  const px = (x: number) => (x + size / 2) * scale;
  const py = (z: number) => (z + size / 2) * scale; // canvas top = -z end, our hoop

  ctx.fillStyle = P.grass;
  ctx.fillRect(0, 0, c.width, c.height);

  // Sun/mow patches: big irregular flat-tone blobs.
  for (let k = 0; k < 14; k++) {
    const cx = rng() * c.width;
    const cy = rng() * c.height;
    const r = (2.5 + rng() * 5) * scale;
    ctx.fillStyle = k % 2 === 0 ? P.grassLight : P.grassDark;
    ctx.beginPath();
    for (let i = 0; i <= 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = r * (0.55 + rng() * 0.6);
      const mx = cx + Math.cos(a) * rr;
      const my = cy + Math.sin(a) * rr * 0.7;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Grass tufts: little three-blade doodles.
  ctx.strokeStyle = P.grassDark;
  ctx.lineCap = 'round';
  for (let k = 0; k < 900; k++) {
    const x = rng() * c.width;
    const y = rng() * c.height;
    const s = 4 + rng() * 5;
    ctx.lineWidth = 2 + rng() * 1.5;
    for (const dx of [-0.7, 0, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx * s + (rng() - 0.5) * 2, y - s * (0.8 + rng() * 0.5));
      ctx.stroke();
    }
  }

  // Wildflowers: sparse yellow/white dots.
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = rng() < 0.5 ? P.star : P.paper;
    ctx.beginPath();
    ctx.arc(rng() * c.width, rng() * c.height, 2.5 + rng() * 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Paved trails, drawn last so they read as laid over the lawn: one winding
  // behind the hoop, one branching off toward the player's side.
  const main: Array<{ x: number; z: number }> = [];
  for (let x = -size / 2; x <= size / 2; x += 2) {
    main.push({ x, z: -18.5 + Math.sin(x * 0.13) * 1.7 });
  }
  const branch: Array<{ x: number; z: number }> = [];
  for (let z = -19.5; z <= size / 2; z += 2) {
    branch.push({ x: -23 + Math.sin(z * 0.1) * 2.5, z });
  }
  paintTrail(ctx, main, 1.9, scale, px, py, rng);
  paintTrail(ctx, branch, 1.6, scale, px, py, rng);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Paved trail: flat fill along a polyline with wobbly ink kerbs + joint ticks. */
function paintTrail(
  ctx: CanvasRenderingContext2D,
  world: Array<{ x: number; z: number }>,
  widthM: number,
  scale: number,
  px: (x: number) => number,
  py: (z: number) => number,
  rng: () => number,
): void {
  const P = artTheme.palette;
  const pts = world.map((p) => ({ x: px(p.x), y: py(p.z) }));
  const half = (widthM * scale) / 2;

  ctx.strokeStyle = P.trail;
  ctx.lineWidth = half * 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
  ctx.stroke();

  // Kerb ink on both edges, offset along the local normal.
  const normal = (i: number) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  };
  for (const side of [-1, 1]) {
    const edge = pts.map((p, i) => {
      const n = normal(i);
      return { x: p.x + n.x * half * side, y: p.y + n.y * half * side };
    });
    wobblyStroke(ctx, edge, rng, 2.5, 2, P.ink);
  }

  // Expansion joints: a tick across the slab every few metres.
  for (let i = 3; i < pts.length - 1; i += 3) {
    const n = normal(i);
    const p = pts[i]!;
    wobblyStroke(
      ctx,
      sampleLine(
        p.x - n.x * half * 0.8, p.y - n.y * half * 0.8,
        p.x + n.x * half * 0.8, p.y + n.y * half * 0.8,
        14,
      ),
      rng, 2, 1.5, P.ink,
    );
  }
}

/** Park furniture + livestock: a bench facing the court and a grazing cow. */
function buildParkProps(art: ArtOverrides): { group: THREE.Group; outlined: THREE.Mesh[] } {
  const group = new THREE.Group();
  const outlined: THREE.Mesh[] = [];
  const P = artTheme.palette;

  // Wooden bench on the lawn beside the court, angled toward the action.
  const bench = new THREE.Group();
  const wood = () => toonMaterial({ color: P.benchWood });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.07, 0.5), wood());
  seat.position.set(0, 0.46, 0);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 0.06), wood());
  back.position.set(0, 0.78, -0.26);
  back.rotation.x = -0.13;
  bench.add(seat, back);
  outlined.push(seat, back);
  for (const sx of [-0.72, 0.72]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.46, 0.46),
      toonMaterial({ color: P.pole }),
    );
    leg.position.set(sx, 0.23, 0);
    bench.add(leg);
  }
  bench.position.set(-10.6, 0, -11.2);
  bench.rotation.y = Math.PI / 2 - 0.35;
  group.add(bench);

  // The resident cow, grazing on the lawn between the court and the trail.
  const cow = buildCow(outlined, art['cow-hide']);
  cow.position.set(10.5, 0, -14.2);
  cow.rotation.y = -Math.PI / 3;
  group.add(cow);

  return { group, outlined };
}

/** Boxy cartoon cow: spotted hide texture, pink muzzle, ink hooves. */
function buildCow(outlined: THREE.Mesh[], hideOverride?: THREE.CanvasTexture): THREE.Group {
  const g = new THREE.Group();
  const P = artTheme.palette;
  const white = () => toonMaterial({ color: P.paper });
  const inkMat = () => toonMaterial({ color: P.ink });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.85, 0.8),
    toonMaterial({ map: hideOverride ?? paintCowHide(0xc0ffee) }),
  );
  body.position.set(0, 1.0, 0);
  g.add(body);
  outlined.push(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.4), white());
  head.position.set(0.95, 1.32, 0);
  g.add(head);
  outlined.push(head);

  const muzzle = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.24, 0.34),
    toonMaterial({ color: P.cowMuzzle }),
  );
  muzzle.position.set(1.18, 1.22, 0);
  g.add(muzzle);

  for (const s of [-1, 1] as const) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.2), white());
    ear.position.set(0.92, 1.5, s * 0.28);
    ear.rotation.x = s * 0.5;
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), inkMat());
    eye.position.set(1.13, 1.4, s * 0.12);
    g.add(eye);
    for (const fx of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.62, 10), white());
      leg.position.set(fx, 0.31, s * 0.26);
      g.add(leg);
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.1, 10), inkMat());
      hoof.position.set(fx, 0.05, s * 0.26);
      g.add(hoof);
    }
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.55, 6), white());
  tail.position.set(-0.85, 1.0, 0);
  tail.rotation.z = 0.35;
  g.add(tail);

  return g;
}

/** Holstein hide: paper base with irregular ink patches. */
function paintCowHide(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(seed);
  ctx.fillStyle = artTheme.palette.paper;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = artTheme.palette.ink;
  for (let k = 0; k < 6; k++) {
    const cx = 30 + rng() * 196;
    const cy = 30 + rng() * 196;
    const r = 22 + rng() * 26;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const rr = r * (0.55 + rng() * 0.7);
      const mx = cx + Math.cos(a) * rr;
      const my = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.lineTo(mx, my);
    }
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Backboard face: paper fill, wobbly ink border + shooter's square. */
function paintBackboardTexture(seed: number): THREE.CanvasTexture {
  const bb = tuning.backboard;
  const scale = 400; // px per metre
  const c = document.createElement('canvas');
  c.width = Math.round(bb.width * scale);
  c.height = Math.round(bb.height * scale);
  const ctx = c.getContext('2d')!;
  const rng = seededRng(seed);
  ctx.fillStyle = artTheme.palette.backboard;
  ctx.fillRect(0, 0, c.width, c.height);

  const inset = 0.045 * scale;
  wobblyStroke(
    ctx,
    sampleRect(inset, inset, c.width - inset * 2, c.height - inset * 2, 40),
    rng,
    0.035 * scale,
    artTheme.boil.markingJitterPx * 2,
    artTheme.palette.ink,
  );
  // Shooter's square: bottom edge at rim height.
  const sqW = 0.61 * scale;
  const sqH = 0.46 * scale;
  const sqBottomFromBoardBottom = (tuning.rim.height - bb.bottomEdge) * scale;
  wobblyStroke(
    ctx,
    sampleRect((c.width - sqW) / 2, c.height - sqBottomFromBoardBottom - sqH, sqW, sqH, 30),
    rng,
    0.03 * scale,
    artTheme.boil.markingJitterPx * 2,
    artTheme.palette.ink,
  );
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Full court: flat fills + all markings as wobbly hand-ruled ink lines. */
function paintCourtTexture(seed: number): THREE.CanvasTexture {
  const w = tuning.court.width;
  const l = tuning.court.length;
  const scale = 70; // px per metre
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(l * scale);
  const ctx = c.getContext('2d')!;
  const rng = seededRng(seed);
  const P = artTheme.palette;

  // One flat wood tone — no grain, no striping.
  ctx.fillStyle = P.courtWood;
  ctx.fillRect(0, 0, c.width, c.height);

  // World → canvas: x ∈ [-w/2, w/2] → px, z ∈ [-l/2, l/2] → py (canvas top = -z end, our hoop).
  const px = (x: number) => (x + w / 2) * scale;
  const py = (z: number) => (z + l / 2) * scale;

  // Accent fills: center circle + both keys.
  ctx.fillStyle = P.courtAccent;
  ctx.beginPath();
  ctx.arc(px(0), py(0), 1.8 * scale, 0, Math.PI * 2);
  ctx.fill();
  const keyW = 4.88;
  for (const end of [-1, 1] as const) {
    const rimZ = end * Math.abs(derived.rimCenterZ);
    const ftZ = rimZ + -end * tuning.court.ftDistance;
    const keyTop = py(ftZ);
    const keyBase = py((l / 2) * end);
    ctx.fillRect(px(-keyW / 2), Math.min(keyTop, keyBase), keyW * scale, Math.abs(keyTop - keyBase));
  }

  const inkW = 0.055 * scale;
  const jit = artTheme.boil.markingJitterPx;
  const stroke = (pts: Array<{ x: number; y: number }>) =>
    wobblyStroke(ctx, pts, rng, inkW, jit, P.ink);

  // Boundary + half-court + center circle.
  stroke(sampleRect(inkW, inkW, c.width - inkW * 2, c.height - inkW * 2, 40));
  stroke(sampleLine(px(-w / 2), py(0), px(w / 2), py(0), 24));
  stroke(sampleArc(px(0), py(0), 1.8 * scale, 0, Math.PI * 2, 56));

  // Both ends, mirrored.
  for (const end of [-1, 1] as const) {
    drawEnd(ctx, px, py, scale, end, stroke);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** end = -1 draws the hoop end at -z (ours), +1 the far end. */
function drawEnd(
  _ctx: CanvasRenderingContext2D,
  px: (x: number) => number,
  py: (z: number) => number,
  scale: number,
  end: -1 | 1,
  stroke: (pts: Array<{ x: number; y: number }>) => void,
) {
  const l = tuning.court.length;
  const baseline = (l / 2) * end;
  const rimZ = end * Math.abs(derived.rimCenterZ);
  const dir = -end; // toward mid-court
  const ftZ = rimZ + dir * tuning.court.ftDistance;

  // Key (the paint): 4.88 m wide, from baseline to the FT line.
  const keyW = 4.88;
  const x0 = px(-keyW / 2);
  const x1 = px(keyW / 2);
  const yTop = Math.min(py(ftZ), py(baseline));
  const yBase = Math.max(py(ftZ), py(baseline));
  stroke(sampleRect(x0, yTop, x1 - x0, yBase - yTop, 30));
  // FT circle.
  stroke(sampleArc(px(0), py(ftZ), 1.8 * scale, 0, Math.PI * 2, 56));

  // 3PT: arc radius 7.24 m around the rim point, corner lines at |x| = 6.71.
  const r3 = tuning.court.threePointRadius;
  const xCorner = 6.71;
  const dzBreak = Math.sqrt(r3 * r3 - xCorner * xCorner);
  const a0 = Math.atan2(dir * dzBreak, -xCorner);
  const a1 = Math.atan2(dir * dzBreak, xCorner);
  const arcPts: Array<{ x: number; y: number }> = [];
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    arcPts.push({ x: px(Math.cos(a) * r3), y: py(rimZ + Math.sin(a) * r3) });
  }
  stroke(arcPts);
  for (const side of [-1, 1]) {
    stroke(sampleLine(px(side * xCorner), py(baseline), px(side * xCorner), py(rimZ + dir * dzBreak), 20));
  }

  // Restricted area arc (1.22 m) for looks.
  const raPts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= 32; i++) {
    const a = a0 + ((a1 - a0) * i) / 32;
    raPts.push({ x: px(Math.cos(a) * 1.22), y: py(rimZ + Math.sin(a) * 1.22) });
  }
  stroke(raPts);
}

// --- wobbly ink helpers -----------------------------------------------------

/** Jitter each point and stroke segment-by-segment with varying width. */
function wobblyStroke(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  rng: () => number,
  baseWidth: number,
  jitterPx: number,
  color: string,
): void {
  if (pts.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  const jp = pts.map((p) => ({
    x: p.x + (rng() - 0.5) * 2 * jitterPx,
    y: p.y + (rng() - 0.5) * 2 * jitterPx,
  }));
  for (let i = 1; i < jp.length; i++) {
    ctx.lineWidth = baseWidth * (0.72 + rng() * 0.56);
    ctx.beginPath();
    ctx.moveTo(jp[i - 1]!.x, jp[i - 1]!.y);
    ctx.lineTo(jp[i]!.x, jp[i]!.y);
    ctx.stroke();
  }
}

function sampleLine(
  x1: number, y1: number, x2: number, y2: number, stepPx: number,
): Array<{ x: number; y: number }> {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / stepPx));
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
  }
  return pts;
}

function sampleArc(
  cx: number, cy: number, r: number, a0: number, a1: number, steps: number,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}

function sampleRect(
  x: number, y: number, w: number, h: number, stepPx: number,
): Array<{ x: number; y: number }> {
  return [
    ...sampleLine(x, y, x + w, y, stepPx),
    ...sampleLine(x + w, y, x + w, y + h, stepPx),
    ...sampleLine(x + w, y + h, x, y + h, stepPx),
    ...sampleLine(x, y + h, x, y, stepPx),
  ];
}
