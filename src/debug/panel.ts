import GUI from 'lil-gui';
import { tuning } from '../config/tuning';

export interface PanelHooks {
  /** Push material params (restitution/friction) onto live colliders. */
  applyMaterials?: () => void;
  /** Rebuild geometry that depends on dimensions (rim capsules etc.). */
  rebuild?: () => void;
  /** Re-fire the last recorded shot exactly. */
  replayShot?: () => void;
  /** Run the scripted shot battery. */
  runBattery?: () => void;
}

export function createDebugPanel(hooks: PanelHooks): GUI {
  const gui = new GUI({ title: 'tuning' });
  gui.close();

  const world = gui.addFolder('world');
  world.add(tuning.world, 'gravity', 4, 20, 0.01);
  world.close();

  const ball = gui.addFolder('ball');
  ball.add(tuning.ball, 'collisionRadiusScale', 0.85, 1, 0.01).onChange(() => hooks.rebuild?.());
  ball.add(tuning.ball, 'restitution', 0.4, 1, 0.01).onChange(() => hooks.applyMaterials?.());
  ball.add(tuning.ball, 'friction', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.());
  ball.add(tuning.ball, 'angularDamping', 0, 0.5, 0.01).onChange(() => hooks.applyMaterials?.());
  ball.close();

  const rim = gui.addFolder('rim / board / floor');
  rim.add(tuning.rim, 'restitution', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.());
  rim.add(tuning.rim, 'friction', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.());
  rim.add(tuning.rim, 'capsuleCount', 8, 24, 1).onChange(() => hooks.rebuild?.());
  rim.add(tuning.backboard, 'restitution', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.());
  rim.add(tuning.floor, 'restitution', 0, 1, 0.01).onChange(() => hooks.applyMaterials?.());
  rim.close();

  const solver = gui.addFolder('solver');
  solver.add(tuning.solver, 'entryAngleDeg', 35, 60, 0.5);
  solver.add(tuning.solver, 'targetDepthOffset', 0, 0.1, 0.005);
  solver.close();

  const input = gui.addFolder('input');
  input.add(tuning.input, 'powerSensitivity', 0, 1, 0.01);
  input.add(tuning.input, 'lateralGain', 0, 1, 0.01);
  input.add(tuning.input, 'lateralMax', 0, 0.3, 0.005);
  input.add(tuning.input, 'minSwipeFrac', 0.02, 0.3, 0.01);
  input.add(tuning.input, 'referenceFlickSpeed', 0.5, 4, 0.05);
  input.close();

  const spin = gui.addFolder('spin');
  spin.add(tuning.spin, 'backspinHz', 0, 6, 0.1);
  spin.add(tuning.spin, 'sidespinMaxHz', 0, 8, 0.1);
  spin.add(tuning.spin, 'magnusK', 0, 0.0005, 0.00001);
  spin.close();

  const dbg = gui.addFolder('debug');
  dbg.add(tuning.debug, 'physicsWireframe');
  dbg.add(tuning.debug, 'swipeOverlay');
  dbg.add(tuning.debug, 'predictedArc');
  dbg.add(tuning.debug, 'shotLog');
  if (hooks.replayShot) dbg.add({ replay: hooks.replayShot }, 'replay').name('replay last shot');
  if (hooks.runBattery) dbg.add({ battery: hooks.runBattery }, 'battery').name('run shot battery');
  dbg.close();

  return gui;
}
