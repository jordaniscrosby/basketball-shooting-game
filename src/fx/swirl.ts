import * as THREE from 'three';
import { artTheme } from '../config/artTheme';

/**
 * The Balatro paint-swirl, ported from the community Godot recreation of the
 * original shader (vault "Balatro — Background Shader"). Used ONLY as garnish
 * — freeze-panel fills and the stats/game-over backdrop — never the world.
 * Two comic-ink concessions: time advances on the FX step clock ("on twos")
 * and pixelFilter quantizes chunky, so it reads painted, not GLSL-demo.
 */
const VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

const FRAG = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform float uSpinAmount;
uniform float uContrast;
uniform float uPixelFilter;

#define SPIN_EASE 1.0
#define LIGHTING 0.4

void main() {
  // Pixel quantize — even the shader obeys the chunky grid.
  float pixel_size = length(uResolution) / uPixelFilter;
  vec2 uv = (floor(gl_FragCoord.xy * (1.0 / pixel_size)) * pixel_size - 0.5 * uResolution) / length(uResolution);
  float uv_len = length(uv);

  // Center swirl: angle offset grows with distance from center.
  float speed = 302.2;
  float new_angle = atan(uv.y, uv.x) + speed - SPIN_EASE * 20.0 * (uSpinAmount * uv_len + (1.0 - uSpinAmount));
  vec2 mid = (uResolution / length(uResolution)) / 2.0;
  uv = vec2(uv_len * cos(new_angle) + mid.x, uv_len * sin(new_angle) + mid.y) - mid;

  // Paint warp: 5-iteration domain-warping loop marbles the UVs.
  uv *= 30.0;
  float t = uTime;
  vec2 uv2 = vec2(uv.x + uv.y);
  for (int i = 0; i < 5; i++) {
    uv2 += sin(max(uv.x, uv.y)) + uv;
    uv += 0.5 * vec2(cos(5.1123314 + 0.353 * uv2.y + t * 0.131121), sin(uv2.x - 0.113 * t));
    uv -= 1.0 * cos(uv.x + uv.y) - 1.0 * sin(uv.x * 0.711 - uv.y);
  }

  // Paint amount 0-2 → three blend weights; contrast sharpens boundaries.
  float contrast_mod = 0.25 * uContrast + 0.5 * uSpinAmount + 1.2;
  float paint_res = min(2.0, max(0.0, length(uv) * 0.035 * contrast_mod));
  float c1p = max(0.0, 1.0 - contrast_mod * abs(1.0 - paint_res));
  float c2p = max(0.0, 1.0 - contrast_mod * abs(paint_res));
  float c3p = 1.0 - min(1.0, c1p + c2p);
  float light = (LIGHTING - 0.2) * max(c1p * 5.0 - 4.0, 0.0) + LIGHTING * max(c2p * 5.0 - 4.0, 0.0);
  vec3 col = (0.3 / uContrast) * uColor1
    + (1.0 - 0.3 / uContrast) * (uColor1 * c1p + uColor2 * c2p + c3p * uColor3)
    + light;
  gl_FragColor = vec4(col, 1.0);
}
`;

type SwirlUse = 'panel' | 'screen';

/**
 * Small offscreen swirl renderer. The second WebGL context is the cost, so
 * everything is gated: the renderer is created lazily on first use, renders
 * only while some owner `want()`s it, and only when the FX step clock ticks
 * (~stepHz uploads/s, not 60). `canvas` is consumed two ways: drawImage'd
 * into freeze-panel fills (comicFx) and DOM-mounted behind the stats card
 * (hud). Uses never overlap in time, so the colors are per-owner.
 */
export class SwirlCanvas {
  readonly canvas = document.createElement('canvas');
  private renderer: THREE.WebGLRenderer | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly wants = new Set<SwirlUse>();
  private time = 0;
  private lastStep = -1;

  get active(): boolean {
    return this.wants.size > 0;
  }

  /** Enable/disable one use of the cameo; the enabling owner sets its palette. */
  want(use: SwirlUse, on: boolean, colors?: [string, string, string]): void {
    if (!on) {
      this.wants.delete(use);
      return;
    }
    this.wants.add(use);
    this.init();
    if (colors) this.setColors(...colors);
    this.lastStep = -1; // render immediately on the next update
  }

  setColors(c1: string, c2: string, c3: string): void {
    if (!this.material) return;
    const u = this.material.uniforms;
    (u.uColor1!.value as THREE.Color).set(c1);
    (u.uColor2!.value as THREE.Color).set(c2);
    (u.uColor3!.value as THREE.Color).set(c3);
  }

  /** Advance on the FX step clock — renders only when the step ticks. */
  update(dt: number): void {
    if (!this.active || !this.renderer || !this.material) return;
    this.time += dt;
    const step = Math.floor(this.time * artTheme.fx.stepHz);
    if (step === this.lastStep) return;
    this.lastStep = step;
    const u = this.material.uniforms;
    u.uTime!.value = (step / artTheme.fx.stepHz) * artTheme.swirl.speed;
    u.uSpinAmount!.value = artTheme.swirl.spinAmount;
    u.uContrast!.value = artTheme.swirl.contrast;
    u.uPixelFilter!.value = artTheme.swirl.pixelFilter;
    this.renderer.render(this.scene, this.camera);
  }

  private init(): void {
    if (this.renderer) return;
    const size = artTheme.swirl.size;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false });
    this.renderer.setSize(size, size, false);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(size, size) },
        uColor1: { value: new THREE.Color(artTheme.palette.fire) },
        uColor2: { value: new THREE.Color(artTheme.palette.star) },
        uColor3: { value: new THREE.Color(artTheme.palette.ink) },
        uSpinAmount: { value: artTheme.swirl.spinAmount },
        uContrast: { value: artTheme.swirl.contrast },
        uPixelFilter: { value: artTheme.swirl.pixelFilter },
      },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }
}
