import * as THREE from 'three';
import { tuning, derived } from '../config/tuning';

export interface CourtVisual {
  group: THREE.Group;
  /** The rim torus mesh — the Verlet net pins to this later. */
  rimMesh: THREE.Mesh;
  backboardMesh: THREE.Mesh;
}

/**
 * Procedural court + hoop visuals with correct markings (FT line at 4.19 m
 * from rim centre, NBA 3PT arc), drawn into a canvas texture. Visual hoop is
 * aligned to the procedural colliders — both read the same tuning values.
 */
export function createCourt(scene: THREE.Scene): CourtVisual {
  const group = new THREE.Group();

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(tuning.court.width, tuning.court.length),
    new THREE.MeshStandardMaterial({ map: paintCourtTexture(), roughness: 0.55 }),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // Out-of-bounds apron so the world doesn't end at the sideline.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.9 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.002;
  apron.receiveShadow = true;
  group.add(apron);

  const hoop = buildHoopVisual();
  group.add(hoop.group);

  scene.add(group);
  return { group, rimMesh: hoop.rim, backboardMesh: hoop.board };
}

function buildHoopVisual(): { group: THREE.Group; rim: THREE.Mesh; board: THREE.Mesh } {
  const group = new THREE.Group();
  const rimY = tuning.rim.height;
  const rimZ = derived.rimCenterZ;
  const faceZ = derived.backboardFaceZ;
  const bb = tuning.backboard;

  // Rim torus matches the capsule ring: centreline radius = inner + rod.
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(derived.rimInnerRadius + tuning.rim.rodRadius, tuning.rim.rodRadius, 12, 48),
    new THREE.MeshStandardMaterial({ color: 0xe8471d, roughness: 0.4, metalness: 0.6 }),
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.set(0, rimY, rimZ);
  rim.castShadow = true;
  group.add(rim);

  // Backboard: tempered-glass look + painted borders via canvas texture.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(bb.width, bb.height, bb.thickness),
    [
      plainBoardMat(), plainBoardMat(), plainBoardMat(), plainBoardMat(),
      new THREE.MeshStandardMaterial({
        map: paintBackboardTexture(),
        transparent: true,
        opacity: 0.92,
        roughness: 0.15,
      }),
      plainBoardMat(),
    ],
  );
  board.position.set(0, bb.bottomEdge + bb.height / 2, faceZ - bb.thickness / 2);
  board.castShadow = true;
  group.add(board);

  // Rim-to-board bracket.
  const bracket = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.1, tuning.rim.centerFromBoard - derived.rimInnerRadius),
    new THREE.MeshStandardMaterial({ color: 0xd0d3d8, roughness: 0.5, metalness: 0.5 }),
  );
  bracket.position.set(0, rimY - 0.06, (faceZ + (rimZ - derived.rimInnerRadius)) / 2);
  group.add(bracket);

  // Stanchion: base behind the baseline, arm reaching over to the board.
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x30343d, roughness: 0.6, metalness: 0.4 });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.6, 16), poleMat);
  pole.position.set(0, 1.8, faceZ - 1.5);
  pole.castShadow = true;
  group.add(pole);
  const armLen = 1.5 - bb.thickness;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, armLen, 12), poleMat);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 3.55, faceZ - 0.75);
  group.add(arm);

  return { group, rim, board };
}

function plainBoardMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: 0xf4f6f8, transparent: true, opacity: 0.92, roughness: 0.15 });
}

/** Backboard face: white border + shooter's square (0.61 × 0.46 m). */
function paintBackboardTexture(): THREE.CanvasTexture {
  const bb = tuning.backboard;
  const scale = 400; // px per metre
  const c = document.createElement('canvas');
  c.width = Math.round(bb.width * scale);
  c.height = Math.round(bb.height * scale);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(238, 242, 246, 0.85)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#e8471d';
  ctx.lineWidth = 0.05 * scale;
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, c.width - ctx.lineWidth, c.height - ctx.lineWidth);
  // Shooter's square: bottom edge at rim height (rim - board bottom above board bottom).
  const sqW = 0.61 * scale;
  const sqH = 0.46 * scale;
  const sqBottomFromBoardBottom = (tuning.rim.height - bb.bottomEdge) * scale;
  ctx.strokeRect((c.width - sqW) / 2, c.height - sqBottomFromBoardBottom - sqH, sqW, sqH);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Full court markings for the half we play toward (mirrored to the far end). */
function paintCourtTexture(): THREE.CanvasTexture {
  const w = tuning.court.width;
  const l = tuning.court.length;
  const scale = 70; // px per metre
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale);
  c.height = Math.round(l * scale);
  const ctx = c.getContext('2d')!;

  // Hardwood base with subtle plank striping.
  ctx.fillStyle = '#c98a4b';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < c.height; i += 18) {
    ctx.fillStyle = i % 36 === 0 ? 'rgba(122, 72, 28, 0.08)' : 'rgba(255, 226, 180, 0.05)';
    ctx.fillRect(0, i, c.width, 9);
  }

  // World → canvas: x ∈ [-w/2, w/2] → px, z ∈ [-l/2, l/2] → py (canvas top = -z end, our hoop).
  const px = (x: number) => (x + w / 2) * scale;
  const py = (z: number) => (z + l / 2) * scale;

  ctx.strokeStyle = '#f7f3ea';
  ctx.lineWidth = 0.05 * scale;
  ctx.lineCap = 'round';

  // Boundary + half-court.
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, c.width - ctx.lineWidth, c.height - ctx.lineWidth);
  line(ctx, px(-w / 2), py(0), px(w / 2), py(0));
  circle(ctx, px(0), py(0), 1.8 * scale);

  // Both ends, mirrored.
  drawEnd(ctx, px, py, scale, -1);
  drawEnd(ctx, px, py, scale, 1);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** end = -1 draws the hoop end at -z (ours), +1 the far end. */
function drawEnd(
  ctx: CanvasRenderingContext2D,
  px: (x: number) => number,
  py: (z: number) => number,
  scale: number,
  end: -1 | 1,
) {
  const l = tuning.court.length;
  const baseline = (l / 2) * end;
  const rimZ = end * Math.abs(derived.rimCenterZ);
  const dir = -end; // toward mid-court
  const ftZ = rimZ + dir * tuning.court.ftDistance;

  // Key (the paint): 4.88 m wide, from baseline to the FT line.
  const keyW = 4.88;
  const keyTop = py(ftZ);
  const keyBase = py(baseline);
  ctx.strokeRect(
    px(-keyW / 2),
    Math.min(keyTop, keyBase),
    keyW * scale,
    Math.abs(keyTop - keyBase),
  );
  // FT circle.
  circle(ctx, px(0), py(ftZ), 1.8 * scale);

  // 3PT: arc radius 7.24 m around the rim point, corner lines at |x| = 6.71.
  const r3 = tuning.court.threePointRadius;
  const xCorner = 6.71;
  const dzBreak = Math.sqrt(r3 * r3 - xCorner * xCorner); // where arc meets corner line
  ctx.beginPath();
  const a0 = Math.atan2(dir * dzBreak, -xCorner);
  const a1 = Math.atan2(dir * dzBreak, xCorner);
  // Canvas arc in px space centred on the rim point.
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const x = Math.cos(a) * r3;
    const z = rimZ + Math.sin(a) * r3;
    if (i === 0) ctx.moveTo(px(x), py(z));
    else ctx.lineTo(px(x), py(z));
  }
  ctx.stroke();
  for (const side of [-1, 1]) {
    line(ctx, px(side * xCorner), py(baseline), px(side * xCorner), py(rimZ + dir * dzBreak));
  }

  // Restricted area arc (1.22 m) for looks.
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) {
    const a = a0 + ((a1 - a0) * i) / 32;
    const x = Math.cos(a) * 1.22;
    const z = rimZ + Math.sin(a) * 1.22;
    if (i === 0) ctx.moveTo(px(x), py(z));
    else ctx.lineTo(px(x), py(z));
  }
  ctx.stroke();
}

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
