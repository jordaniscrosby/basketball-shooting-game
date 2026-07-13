import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { tuning } from '../config/tuning';

/** Renders Rapier's world.debugRender() wireframe as a line overlay. */
export class PhysicsDebugRenderer {
  private readonly lines: THREE.LineSegments;

  constructor(scene: THREE.Scene) {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false });
    this.lines = new THREE.LineSegments(geometry, material);
    this.lines.renderOrder = 999;
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  update(world: RAPIER.World): void {
    this.lines.visible = tuning.debug.physicsWireframe;
    if (!this.lines.visible) return;
    const { vertices, colors } = world.debugRender();
    this.lines.geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    this.lines.geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(colors), 4),
    );
  }
}
