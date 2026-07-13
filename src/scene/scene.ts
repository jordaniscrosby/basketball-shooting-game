import * as THREE from 'three';
import { tuning } from '../config/tuning';
import { artTheme } from '../config/artTheme';

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createScene(canvas: HTMLCanvasElement): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Cartoon pipeline: no tone curve, no shadow maps — flat cels + blob shadow.
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(artTheme.palette.sky);

  const camera = new THREE.PerspectiveCamera(
    tuning.camera.fov,
    window.innerWidth / window.innerHeight,
    0.05,
    120,
  );
  camera.position.set(0, 1.7, 6);
  camera.lookAt(0, 2.2, -10);

  // Lighting exists only to place the cel step: with three's physical light
  // scaling, effective tone = (ambient + directional·step)/π — these values
  // put the lit band at 1.0 and leave the gradient steps visibly banded.
  scene.add(new THREE.AmbientLight(0xffffff, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.85);
  key.position.set(6, 12, 4);
  scene.add(key);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
