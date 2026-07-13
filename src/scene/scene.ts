import * as THREE from 'three';
import { tuning } from '../config/tuning';

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
}

export function createScene(canvas: HTMLCanvasElement): GameScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10131a);
  scene.fog = new THREE.Fog(0x10131a, 30, 60);

  const camera = new THREE.PerspectiveCamera(
    tuning.camera.fov,
    window.innerWidth / window.innerHeight,
    0.05,
    120,
  );
  camera.position.set(0, 1.7, 6);
  camera.lookAt(0, 2.2, -10);

  // Lighting: cool ambient bed + warm key light angled like arena rigging.
  scene.add(new THREE.HemisphereLight(0x8899bb, 0x223311, 0.55));
  const key = new THREE.DirectionalLight(0xfff2df, 2.2);
  key.position.set(6, 12, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.far = 40;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbdd4ff, 0.5);
  fill.position.set(-8, 6, -6);
  scene.add(fill);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer };
}
