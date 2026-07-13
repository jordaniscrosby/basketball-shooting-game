import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { toonMaterial, seededRng } from './toon';

export interface CourtVisual {
  group: THREE.Group;
  /** The rim torus mesh — the Verlet net pins to this later. */
  rimMesh: THREE.Mesh;
  backboardMesh: THREE.Mesh;
  poleMesh: THREE.Mesh;
  armMesh: THREE.Mesh;
  /** Swap pre-baked jittered texture variants — the court's line boil. */
  applyBoilFrame(frame: number): void;
}

/**
 * Hand-drawn cartoon court: flat fills, markings as wobbly jittered ink
 * polylines (pre-baked variants cycled for line boil), painted gym-wall
 * backdrop. Visual hoop stays aligned to the procedural colliders — both
 * read the same tuning values.
 */
export function createCourt(scene: THREE.Scene): CourtVisual {
  const group = new THREE.Group();

  const floorVariants: THREE.CanvasTexture[] = [];
  const boardVariants: THREE.CanvasTexture[] = [];
  for (let v = 0; v < artTheme.boil.variants; v++) {
    floorVariants.push(paintCourtTexture(0xc0947 + v * 131));
    boardVariants.push(paintBackboardTexture(0xb0a4d + v * 733));
  }

  // Flat fills want no lighting at all — MeshBasicMaterial is the "painted cel".
  const floorMat = new THREE.MeshBasicMaterial({ map: floorVariants[0]! });
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(tuning.court.width, tuning.court.length),
    floorMat,
  );
  floorMesh.rotation.x = -Math.PI / 2;
  group.add(floorMesh);

  // Out-of-bounds apron: flat paper tone, like the cel's unpainted margin.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(artTheme.palette.paper).multiplyScalar(0.82) }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.002;
  group.add(apron);

  const backdrop = buildBackdrop();
  group.add(backdrop);

  const hoop = buildHoopVisual(boardVariants);
  group.add(hoop.group);

  scene.add(group);
  return {
    group,
    rimMesh: hoop.rim,
    backboardMesh: hoop.board,
    poleMesh: hoop.pole,
    armMesh: hoop.arm,
    applyBoilFrame(frame: number) {
      const i = frame % artTheme.boil.variants;
      floorMat.map = floorVariants[i]!;
      hoop.boardFaceMat.map = boardVariants[i]!;
    },
  };
}

function buildHoopVisual(boardVariants: THREE.CanvasTexture[]): {
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
  const boardFaceMat = toonMaterial({ map: boardVariants[0]! });
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

/** Flat painted gym wall on a far plane: bleacher stripes + scoreboard doodle. */
function buildBackdrop(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 640;
  const ctx = c.getContext('2d')!;
  const rng = seededRng(0xfacade);
  const P = artTheme.palette;

  // Wall base + darker wainscot band at the bottom.
  ctx.fillStyle = P.gymWall;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = P.gymWallDark;
  ctx.fillRect(0, c.height * 0.85, c.width, c.height * 0.15);

  // Bleachers: big simple stripes with wobbly ink separators + head doodles.
  const bleachTop = c.height * 0.45;
  const bleachBottom = c.height * 0.85;
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y0 = bleachTop + ((bleachBottom - bleachTop) * r) / rows;
    const y1 = bleachTop + ((bleachBottom - bleachTop) * (r + 1)) / rows;
    ctx.fillStyle = r % 2 === 0 ? P.gymWallLight : P.gymWall;
    ctx.fillRect(0, y0, c.width, y1 - y0);
    // Crowd: sparse ink blob heads sitting on each row.
    ctx.fillStyle = P.ink;
    for (let x = 30 + rng() * 40; x < c.width - 30; x += 34 + rng() * 55) {
      if (rng() < 0.4) continue;
      const rr = 5.5 + rng() * 4;
      ctx.beginPath();
      ctx.arc(x, y1 - rr - 3 + rng() * 3, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    wobblyStroke(ctx, sampleLine(0, y1, c.width, y1, 60), rng, 4, 2.5, P.ink);
  }
  wobblyStroke(ctx, sampleLine(0, bleachTop, c.width, bleachTop, 60), rng, 4, 2.5, P.ink);

  // Scoreboard doodle, hung on the wall just above the bleachers.
  const sw = 340;
  const sh = 120;
  const sx = (c.width - sw) / 2;
  const sy = c.height * 0.16;
  ctx.fillStyle = P.paper;
  ctx.fillRect(sx, sy, sw, sh);
  wobblyStroke(ctx, sampleRect(sx, sy, sw, sh, 40), rng, 7, 3, P.ink);
  for (const side of [0, 1]) {
    const bx = sx + 30 + side * (sw - 30 - 130);
    ctx.fillStyle = P.courtAccent;
    ctx.fillRect(bx, sy + 34, 130, 62);
    // Blocky "digits".
    ctx.fillStyle = P.paper;
    ctx.fillRect(bx + 18, sy + 46, 30, 38);
    ctx.fillRect(bx + 76, sy + 46, 30, 38);
  }
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  ctx.arc(sx + sw / 2, sy + sh / 2 + 12, 16, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(76, 19), new THREE.MeshBasicMaterial({ map: tex }));
  mesh.position.set(0, 9.4, -tuning.court.length / 2 - 8);
  return mesh;
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
