import * as THREE from 'three';

/**
 * Batch of camera-facing quads — the "thick ink line" primitive for the
 * hand-drawn look (GL line width is locked to 1px on ANGLE/Windows, so fat
 * strokes must be geometry). Rebuilt per frame by callers: begin() → quad()
 * per stroke → end().
 */
export class RibbonBatch {
  private readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly camPos = new THREE.Vector3();
  private quadCount = 0;
  private readonly maxQuads: number;

  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene, maxQuads: number, opts: { opacity?: number } = {}) {
    this.maxQuads = maxQuads;
    this.positions = new Float32Array(maxQuads * 6 * 3);
    this.colors = new Float32Array(maxQuads * 6 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: opts.opacity !== undefined,
        opacity: opts.opacity ?? 1,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  set visible(v: boolean) {
    this.mesh.visible = v;
  }

  begin(camera: THREE.Camera): void {
    this.quadCount = 0;
    camera.getWorldPosition(this.camPos);
  }

  /** One stroke from a→b, widths in metres at each end, flat color. */
  quad(
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    widthA: number, widthB: number,
    colorHex: string | number,
  ): void {
    if (this.quadCount >= this.maxQuads) return;
    this.a.set(ax, ay, az);
    this.b.set(bx, by, bz);
    this.dir.subVectors(this.b, this.a);
    this.mid.addVectors(this.a, this.b).multiplyScalar(0.5);
    this.side.subVectors(this.camPos, this.mid).cross(this.dir);
    const len = this.side.length();
    if (len < 1e-9) return;
    this.side.multiplyScalar(1 / len);
    this.color.set(colorHex);

    const ha = widthA / 2;
    const hb = widthB / 2;
    const p = this.positions;
    const o = this.quadCount * 18;
    // Triangles: (a-, a+, b+) and (a-, b+, b-).
    const write = (k: number, x: number, y: number, z: number) => {
      p[o + k * 3] = x;
      p[o + k * 3 + 1] = y;
      p[o + k * 3 + 2] = z;
    };
    write(0, this.a.x - this.side.x * ha, this.a.y - this.side.y * ha, this.a.z - this.side.z * ha);
    write(1, this.a.x + this.side.x * ha, this.a.y + this.side.y * ha, this.a.z + this.side.z * ha);
    write(2, this.b.x + this.side.x * hb, this.b.y + this.side.y * hb, this.b.z + this.side.z * hb);
    write(3, this.a.x - this.side.x * ha, this.a.y - this.side.y * ha, this.a.z - this.side.z * ha);
    write(4, this.b.x + this.side.x * hb, this.b.y + this.side.y * hb, this.b.z + this.side.z * hb);
    write(5, this.b.x - this.side.x * hb, this.b.y - this.side.y * hb, this.b.z - this.side.z * hb);
    const c = this.colors;
    for (let k = 0; k < 6; k++) {
      c[o + k * 3] = this.color.r;
      c[o + k * 3 + 1] = this.color.g;
      c[o + k * 3 + 2] = this.color.b;
    }
    this.quadCount++;
  }

  end(): void {
    const geo = this.mesh.geometry;
    geo.setDrawRange(0, this.quadCount * 6);
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}
