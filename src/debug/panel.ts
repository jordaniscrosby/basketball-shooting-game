import GUI from 'lil-gui';
import { tuning } from '../config/tuning';
import { artTheme } from '../config/artTheme';
import { refreshGradientMap } from '../scene/toon';

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

  const sling = gui.addFolder('slingshot');
  sling.add(tuning.slingshot, 'grabRadius', 0.05, 1, 0.01);
  sling.add(tuning.slingshot, 'minDragFrac', 0.01, 0.2, 0.005);
  sling.add(tuning.slingshot, 'referenceDragFrac', 0.05, 0.5, 0.01);
  sling.add(tuning.slingshot, 'maxDragFrac', 0.1, 0.6, 0.01);
  sling.close();

  const curve = gui.addFolder('curve');
  curve.add(tuning.curve, 'enabled');
  curve.add(tuning.curve, 'lateralGain', 0, 20, 0.1);
  curve.add(tuning.curve, 'depthGain', 0, 20, 0.1);
  curve.add(tuning.curve, 'budget', 0, 5, 0.05);
  curve.add(tuning.curve, 'maxAccel', 0, 25, 0.25);
  curve.add(tuning.curve, 'grabRadius', 0.05, 9, 0.05);
  curve.add(tuning.curve, 'keySpeed', 0, 4, 0.05);
  curve.add(tuning.curve, 'cutoffAfterContact');
  curve.add(tuning.curve, 'fadeBelowFrac', 0, 1, 0.01);
  curve.add(tuning.curve, 'visualSpinGain', 0, 4, 0.05);
  curve.close();

  const spin = gui.addFolder('spin');
  spin.add(tuning.spin, 'backspinHz', 0, 6, 0.1);
  spin.add(tuning.spin, 'sidespinMaxHz', 0, 8, 0.1);
  spin.add(tuning.spin, 'magnusK', 0, 0.0005, 0.00001);
  spin.close();

  const art = gui.addFolder('art');
  art.add(artTheme.boil, 'rateHz', 0, 16, 0.5);
  art.add(artTheme.cel, 'lowestStep', 0.2, 0.9, 0.01).onChange(() => refreshGradientMap());
  art.add(artTheme.blobShadow, 'opacity', 0, 0.8, 0.01);
  art.add(artTheme.net, 'cordWidth', 0.004, 0.03, 0.001);
  art.add(artTheme.trail, 'dashWidth', 0.01, 0.1, 0.005);
  art.close();

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
