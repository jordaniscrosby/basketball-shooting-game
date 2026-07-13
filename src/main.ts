import * as THREE from 'three';
import { tuning } from './config/tuning';
import { FixedLoop } from './core/loop';
import { createScene } from './scene/scene';
import {
  initRapier,
  createPhysicsWorld,
  createBall,
  snapshotBody,
  applyInterpolated,
} from './physics/world';
import { PhysicsDebugRenderer } from './debug/physicsDebug';
import { createDebugPanel } from './debug/panel';

async function boot(): Promise<void> {
  await initRapier();

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const { scene, camera, renderer } = createScene(canvas);
  const physics = createPhysicsWorld();
  const debugRenderer = new PhysicsDebugRenderer(scene);

  // Placeholder ground plane (Phase 1 replaces this with the court).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.85 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Phase 0 gate scene: drop a ball and watch it bounce believably.
  const dropFrom = new THREE.Vector3(0, 3, 2);
  const ball = createBall(physics.world, dropFrom);
  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(tuning.ball.radius, 32, 32),
    new THREE.MeshStandardMaterial({ color: 0xd35400, roughness: 0.65 }),
  );
  ballMesh.castShadow = true;
  scene.add(ballMesh);

  createDebugPanel({
    applyMaterials: () => {
      ball.collider.setRestitution(tuning.ball.restitution);
      ball.collider.setFriction(tuning.ball.friction);
      ball.tracked.body.setAngularDamping(tuning.ball.angularDamping);
      physics.floorCollider.setRestitution(tuning.floor.restitution);
      physics.floorCollider.setFriction(tuning.floor.friction);
    },
  });

  // Re-drop on click so bounce tuning is quick to iterate.
  window.addEventListener('pointerdown', () => {
    ball.tracked.body.setTranslation({ x: dropFrom.x, y: dropFrom.y, z: dropFrom.z }, true);
    ball.tracked.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    ball.tracked.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  });

  const fpsEl = document.getElementById('fps')!;
  let fpsTimer = 0;

  const loop = new FixedLoop({
    update: () => {
      physics.world.gravity = { x: 0, y: -tuning.world.gravity, z: 0 };
      physics.world.step(physics.events);
      snapshotBody(ball.tracked);
    },
    render: (alpha, frameDt) => {
      applyInterpolated(ball.tracked, ballMesh, alpha);
      debugRenderer.update(physics.world);
      fpsTimer += frameDt;
      if (fpsTimer > 0.5) {
        fpsTimer = 0;
        fpsEl.textContent = `${loop.smoothedFps.toFixed(0)} fps`;
      }
      renderer.render(scene, camera);
    },
  });
  loop.start();
}

void boot();
