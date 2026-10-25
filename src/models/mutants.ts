import * as THREE from 'three';
import type { Rng } from '../core/random';
import { box, capsule, cyl, group, sphere, torus } from './build';
import { mat, uniqueMat } from './materials';

/** Named nodes the animator drives: body, hips, head, armL/armR, legL/legR. */
const ANIMATED = ['body', 'hips', 'head', 'armL', 'armR', 'legL', 'legR'];
const _box = new THREE.Box3();

/**
 * Legs are modelled hanging from a pivot at y = 0. Lift each pivot up under the hips and
 * stretch the leg so the foot lands on the ground.
 */
function markAnimated<T extends THREE.Object3D>(root: T): T {
  root.userData.animated = ANIMATED;
  const hips = root.getObjectByName('hips');
  if (hips) {
    const pivot = hips.position.y * 0.9;
    for (const name of ['legL', 'legR']) {
      const leg = root.getObjectByName(name);
      if (!leg || leg.parent?.name !== 'body') continue;
      leg.updateMatrixWorld(true);
      _box.setFromObject(leg);
      const foot = _box.min.y - leg.position.y;
      if (foot > -0.05) continue;
      leg.position.y = pivot;
      leg.scale.y = pivot / -foot;
    }
  }
  return root;
}

export function buildShambler(rng: Rng): THREE.Object3D {
  const flesh = mat(rng.chance(0.5) ? 'hide' : 'hideDark');
  const sick = mat('meat');
  const root = group('shambler');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 0.95;
  hips.add(
    capsule(0.22, 0.38, flesh, { pos: [0, 0.18, -0.08], rot: [0.35, 0, 0], scale: [1.15, 1, 0.85] }),
    box(0.08, 0.28, 0.04, sick, { pos: [0.08, 0.2, 0.12], rot: [0.2, 0.3, 0] }),
    sphere(0.07, mat('toxicGlow'), { pos: [0.16, 0.28, 0.1], wSeg: 8, hSeg: 6 }),
  );
  const head = group('head');
  head.position.set(0, 0.48, -0.02);
  head.add(
    sphere(0.16, flesh, { pos: [0, 0.04, 0.04], scale: [1, 1.1, 1.15], wSeg: 10, hSeg: 8 }),
    box(0.12, 0.05, 0.08, mat('bone'), { pos: [0, -0.02, 0.14] }),
  );
  for (const s of [-1, 1]) {
    head.add(sphere(0.03, mat('toxicGlow'), { pos: [s * 0.06, 0.08, 0.14], wSeg: 6, hSeg: 5 }));
  }
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.28, 0.32, -0.06);
    arm.add(
      capsule(0.07, 0.42, flesh, { pos: [0, -0.28, 0.08], rot: [0.45, 0, s * 0.15] }),
      sphere(0.08, sick, { pos: [0, -0.52, 0.18], wSeg: 8, hSeg: 6 }),
    );
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.12, 0, 0);
    leg.add(
      capsule(0.09, 0.36, flesh, { pos: [0, -0.28, 0.04], rot: [0.15, 0, 0] }),
      box(0.14, 0.08, 0.22, mat('hideDark'), { pos: [0, -0.52, 0.06] }),
    );
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildCrawler(rng: Rng): THREE.Object3D {
  const flesh = mat('hideDark');
  const root = group('crawler');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 0.28;
  hips.add(
    capsule(0.16, 0.55, flesh, { pos: [0, 0, 0.04], rot: [1.15, 0, 0], scale: [1.1, 1, 0.8] }),
    sphere(0.09, mat('meat'), { pos: [0.1, 0.08, -0.1], wSeg: 8, hSeg: 6 }),
  );
  const head = group('head');
  head.position.set(0, 0.06, 0.42);
  head.add(
    sphere(0.12, flesh, { pos: [0, 0, 0], scale: [1.1, 0.7, 1.3], wSeg: 8, hSeg: 6 }),
    box(0.1, 0.03, 0.08, mat('bone'), { pos: [0, -0.02, 0.1] }),
    sphere(0.025, mat('toxicGlow'), { pos: [-0.05, 0.04, 0.1], wSeg: 6, hSeg: 5 }),
    sphere(0.025, mat('toxicGlow'), { pos: [0.05, 0.04, 0.1], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  const limb = (name: string, x: number, z: number, yaw: number) => {
    const a = group(name);
    a.position.set(x, 0.02, z);
    a.rotation.y = yaw;
    const len = rng.range(0.38, 0.5);
    a.add(capsule(0.04, len, flesh, { pos: [0.18, -0.02, 0], rot: [0, 0, 1.15] }));
    a.add(box(0.1, 0.04, 0.08, mat('bone'), { pos: [0.38, -0.08, 0] }));
    hips.add(a);
    return a;
  };
  limb('armL', -0.12, 0.18, 0.4);
  limb('armR', 0.12, 0.18, -0.4);
  const legL = limb('legL', -0.1, -0.22, 2.5);
  const legR = limb('legR', 0.1, -0.22, -2.5);
  body.attach(legL);
  body.attach(legR);
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildBloater(_rng: Rng): THREE.Object3D {
  const flesh = mat('hide');
  const root = group('bloater');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 0.85;
  const glow = uniqueMat('toxicGlow');
  hips.add(
    sphere(0.48, flesh, { pos: [0, 0.05, 0.06], scale: [1.15, 0.95, 1], wSeg: 12, hSeg: 10 }),
    sphere(0.12, glow, { pos: [0.28, 0.18, 0.22], wSeg: 8, hSeg: 6 }),
    sphere(0.09, glow, { pos: [-0.22, -0.05, 0.32], wSeg: 8, hSeg: 6 }),
    sphere(0.07, glow, { pos: [0.05, 0.32, 0.18], wSeg: 8, hSeg: 6 }),
  );
  const head = group('head');
  head.position.set(0, 0.42, 0.12);
  head.add(
    sphere(0.16, mat('hideDark'), { pos: [0, 0.02, 0], scale: [1, 0.9, 1], wSeg: 10, hSeg: 8 }),
    sphere(0.03, glow, { pos: [-0.05, 0.06, 0.13], wSeg: 6, hSeg: 5 }),
    sphere(0.03, glow, { pos: [0.05, 0.06, 0.13], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.42, 0.15, 0);
    arm.add(capsule(0.08, 0.28, flesh, { pos: [s * 0.05, -0.2, 0.08], rot: [0.4, 0, s * 0.3] }));
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.16, 0, 0);
    leg.add(capsule(0.1, 0.28, mat('hideDark'), { pos: [0, -0.22, 0] }), box(0.16, 0.08, 0.2, mat('hideDark'), { pos: [0, -0.42, 0.04] }));
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildBrute(_rng: Rng): THREE.Object3D {
  const flesh = mat('hideDark');
  const root = group('brute');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 1.15;
  hips.add(
    capsule(0.38, 0.5, flesh, { pos: [0, 0.2, -0.04], scale: [1.25, 1, 0.85] }),
    box(0.7, 0.16, 0.2, mat('bone'), { pos: [0, 0.42, -0.02] }),
  );
  const head = group('head');
  head.position.set(0, 0.52, 0.08);
  head.add(
    sphere(0.14, flesh, { pos: [0, 0.02, 0], scale: [1.15, 1, 1], wSeg: 8, hSeg: 6 }),
    box(0.16, 0.06, 0.1, mat('bone'), { pos: [0, -0.04, 0.1] }),
    sphere(0.025, mat('ember'), { pos: [-0.05, 0.05, 0.12], wSeg: 6, hSeg: 5 }),
    sphere(0.025, mat('ember'), { pos: [0.05, 0.05, 0.12], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.42, 0.28, -0.04);
    arm.add(
      capsule(0.14, 0.42, flesh, { pos: [0, -0.28, 0.06], rot: [0.25, 0, s * 0.1] }),
      sphere(0.14, mat('hide'), { pos: [0, -0.54, 0.14], wSeg: 8, hSeg: 6 }),
    );
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.18, 0, 0);
    leg.add(
      capsule(0.14, 0.42, flesh, { pos: [0, -0.32, 0] }),
      box(0.22, 0.12, 0.3, mat('hideDark'), { pos: [0, -0.6, 0.04] }),
    );
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildSpitter(rng: Rng): THREE.Object3D {
  const flesh = mat('hideSick');
  const root = group('spitter');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 0.82;
  const sac = uniqueMat('acidSac');
  hips.add(
    capsule(0.2, 0.34, flesh, { pos: [0, 0.2, -0.06], rot: [0.75, 0, 0], scale: [1.1, 1, 0.9] }),
    sphere(0.08, mat('meat'), { pos: [-0.12, 0.3, -0.12], wSeg: 8, hSeg: 6 }),
  );
  const head = group('head');
  head.position.set(0, 0.36, 0.26);
  head.add(
    capsule(0.07, 0.18, flesh, { pos: [0, 0, -0.06], rot: [1.1, 0, 0] }),
    sphere(0.22, sac, { pos: [0, -0.08, 0.08], scale: [1, 0.85, 1.05], wSeg: 12, hSeg: 10 }),
    sphere(0.13, flesh, { pos: [0, 0.1, 0.16], scale: [1, 0.8, 1.2], wSeg: 10, hSeg: 8 }),
    cyl(0.05, 0.07, 0.08, mat('blood'), { pos: [0, 0.06, 0.3], rot: [Math.PI / 2, 0, 0], segments: 8 }),
    sphere(0.025, mat('toxicGlow'), { pos: [-0.06, 0.16, 0.26], wSeg: 6, hSeg: 5 }),
    sphere(0.025, mat('toxicGlow'), { pos: [0.06, 0.16, 0.26], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.24, 0.26, 0.06);
    arm.add(
      capsule(0.06, 0.36 + rng.range(-0.04, 0.04), flesh, { pos: [0, -0.24, 0.1], rot: [0.6, 0, s * 0.2] }),
      box(0.1, 0.04, 0.12, mat('bone'), { pos: [0, -0.46, 0.22] }),
    );
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.12, 0, 0);
    leg.add(
      capsule(0.08, 0.32, flesh, { pos: [0, -0.26, 0.04], rot: [0.2, 0, 0] }),
      box(0.13, 0.07, 0.2, mat('hideDark'), { pos: [0, -0.48, 0.08] }),
    );
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildScreamer(rng: Rng): THREE.Object3D {
  const flesh = mat('hidePale');
  const root = group('screamer');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 1.05;
  hips.add(
    capsule(0.15, 0.44, flesh, { pos: [0, 0.22, -0.02], rot: [0.12, 0, 0], scale: [1, 1, 0.8] }),
    box(0.04, 0.5, 0.04, mat('bone'), { pos: [0, 0.24, -0.15] }),
  );
  for (let i = 0; i < 4; i++) {
    hips.add(torus(0.17 - i * 0.012, 0.018, mat('bone'), { pos: [0, 0.4 - i * 0.08, 0.02], rot: [Math.PI / 2, 0, 0], arc: Math.PI * 1.2 }));
  }
  const head = group('head');
  head.position.set(0, 0.6, 0.02);
  head.add(
    sphere(0.13, flesh, { pos: [0, 0.08, 0], scale: [0.9, 1.2, 1], wSeg: 10, hSeg: 8 }),
    box(0.14, 0.2, 0.1, mat('hideDark'), { pos: [0, -0.1, 0.08], rot: [0.5, 0, 0] }),
    box(0.1, 0.12, 0.02, mat('blood'), { pos: [0, -0.04, 0.12], rot: [0.3, 0, 0] }),
    box(0.1, 0.02, 0.03, mat('bone'), { pos: [0, 0.0, 0.13] }),
    sphere(0.028, mat('ember'), { pos: [-0.045, 0.14, 0.1], wSeg: 6, hSeg: 5 }),
    sphere(0.028, mat('ember'), { pos: [0.045, 0.14, 0.1], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.2, 0.42, 0);
    arm.add(
      capsule(0.04, 0.55 + rng.range(-0.05, 0.05), flesh, { pos: [s * 0.04, -0.34, 0.04], rot: [0.15, 0, s * 0.12] }),
      box(0.07, 0.12, 0.03, mat('bone'), { pos: [s * 0.08, -0.68, 0.06] }),
    );
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.09, 0, 0);
    leg.add(
      capsule(0.06, 0.5, flesh, { pos: [0, -0.4, 0] }),
      box(0.1, 0.06, 0.18, mat('hideDark'), { pos: [0, -0.7, 0.04] }),
    );
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildStalker(rng: Rng): THREE.Object3D {
  const flesh = mat('hidePale');
  const root = group('stalker');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 1.0;
  hips.add(
    capsule(0.16, 0.48, flesh, { pos: [0, 0.22, 0.04], rot: [0.55, 0, 0], scale: [1, 1, 0.75] }),
    box(0.03, 0.42, 0.05, mat('bone'), { pos: [0, 0.24, -0.1], rot: [0.55, 0, 0] }),
  );
  const head = group('head');
  head.position.set(0, 0.48, 0.28);
  head.add(
    sphere(0.12, flesh, { pos: [0, 0, 0.04], scale: [0.9, 0.85, 1.35], wSeg: 10, hSeg: 8 }),
    box(0.08, 0.03, 0.1, mat('bone'), { pos: [0, -0.06, 0.16] }),
    sphere(0.03, mat('toxicGlow'), { pos: [-0.05, 0.03, 0.17], wSeg: 6, hSeg: 5 }),
    sphere(0.03, mat('toxicGlow'), { pos: [0.05, 0.03, 0.17], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.2, 0.34, 0.12);
    arm.add(
      capsule(0.045, 0.62 + rng.range(-0.04, 0.04), flesh, { pos: [0, -0.32, 0.16], rot: [0.75, 0, s * 0.1] }),
      box(0.04, 0.03, 0.2, mat('bone'), { pos: [s * 0.03, -0.58, 0.42], rot: [0.3, 0, 0] }),
    );
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.11, 0, 0);
    leg.add(
      capsule(0.065, 0.5, flesh, { pos: [0, -0.36, -0.02], rot: [-0.1, 0, 0] }),
      box(0.09, 0.05, 0.22, mat('hideDark'), { pos: [0, -0.68, 0.06] }),
    );
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildClimber(rng: Rng): THREE.Object3D {
  const flesh = mat('hide');
  const root = group('climber');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 0.78;
  hips.add(
    capsule(0.17, 0.36, flesh, { pos: [0, 0.2, 0.02], rot: [0.5, 0, 0], scale: [1.1, 1, 0.8] }),
  );
  for (let i = 0; i < 4; i++) {
    hips.add(cyl(0, 0.035, 0.16 + rng.range(0, 0.06), mat('bone'), { pos: [0, 0.38 - i * 0.09, -0.12 - i * 0.04], rot: [-0.9, 0, 0], segments: 5 }));
  }
  const head = group('head');
  head.position.set(0, 0.42, 0.18);
  head.add(
    sphere(0.12, flesh, { pos: [0, 0, 0.02], scale: [1, 0.85, 1.15], wSeg: 10, hSeg: 8 }),
    box(0.1, 0.04, 0.08, mat('bone'), { pos: [0, -0.06, 0.12] }),
    sphere(0.025, mat('ember'), { pos: [-0.05, 0.03, 0.12], wSeg: 6, hSeg: 5 }),
    sphere(0.025, mat('ember'), { pos: [0.05, 0.03, 0.12], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.24, 0.32, 0.06);
    arm.add(
      capsule(0.055, 0.6, flesh, { pos: [s * 0.03, -0.34, 0.08], rot: [0.3, 0, s * 0.15] }),
      box(0.03, 0.18, 0.03, mat('bone'), { pos: [s * 0.04, -0.7, 0.16], rot: [0.7, 0, 0] }),
      box(0.03, 0.16, 0.03, mat('bone'), { pos: [s * 0.1, -0.68, 0.14], rot: [0.7, 0, s * 0.3] }),
    );
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.13, 0, 0);
    leg.add(
      capsule(0.07, 0.32, flesh, { pos: [0, -0.26, 0.04], rot: [0.3, 0, 0] }),
      box(0.12, 0.06, 0.2, mat('hideDark'), { pos: [0, -0.46, 0.1] }),
    );
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildPatientZero(_rng: Rng): THREE.Object3D {
  const flesh = mat('hide');
  const sick = mat('meat');
  const veins = uniqueMat('veinGlow');
  const root = group('patientZero');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 1.55;
  hips.add(
    capsule(0.6, 0.6, flesh, { pos: [0, 0.32, -0.04], scale: [1.2, 1, 0.9] }),
    box(1.05, 0.9, 0.12, mat('gown'), { pos: [0, 0.05, 0.42], rot: [0.08, 0, 0] }),
    box(0.9, 0.2, 0.1, mat('gown'), { pos: [0, -0.4, 0.38] }),
    sphere(0.26, sick, { pos: [0.42, 0.62, -0.18], wSeg: 10, hSeg: 8 }),
    sphere(0.18, sick, { pos: [-0.5, 0.2, 0.1], wSeg: 10, hSeg: 8 }),
    sphere(0.14, sick, { pos: [-0.2, 0.7, -0.4], wSeg: 8, hSeg: 6 }),
    box(0.04, 0.7, 0.04, veins, { pos: [0.2, 0.35, 0.5], rot: [0, 0, 0.3] }),
    box(0.04, 0.6, 0.04, veins, { pos: [-0.28, 0.3, 0.48], rot: [0, 0, -0.4] }),
    box(0.04, 0.5, 0.04, veins, { pos: [0.5, 0.25, 0.2], rot: [0.3, 0, 0.1] }),
    cyl(0.03, 0.03, 0.5, mat('tin'), { pos: [-0.62, 0.55, -0.1], rot: [0, 0, 0.5], segments: 6 }),
  );
  const head = group('head');
  head.position.set(0.05, 0.95, 0.16);
  head.add(
    sphere(0.2, flesh, { pos: [0, 0.02, 0], scale: [1.1, 0.95, 1], wSeg: 10, hSeg: 8 }),
    box(0.22, 0.08, 0.12, mat('bone'), { pos: [0, -0.08, 0.14] }),
    sphere(0.035, veins, { pos: [-0.07, 0.06, 0.17], wSeg: 6, hSeg: 5 }),
    sphere(0.035, veins, { pos: [0.07, 0.06, 0.17], wSeg: 6, hSeg: 5 }),
    sphere(0.12, sick, { pos: [-0.26, 0.1, -0.04], wSeg: 8, hSeg: 6 }),
    sphere(0.025, mat('toxicGlow'), { pos: [-0.3, 0.14, 0.06], wSeg: 6, hSeg: 5 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.78, 0.6, -0.02);
    arm.add(
      capsule(0.2, 0.7, flesh, { pos: [s * 0.04, -0.46, 0.08], rot: [0.2, 0, s * 0.12] }),
      sphere(0.26, mat('hideDark'), { pos: [s * 0.08, -0.95, 0.2], scale: [1, 0.9, 1.1], wSeg: 10, hSeg: 8 }),
      box(0.04, 0.5, 0.04, veins, { pos: [s * 0.1, -0.45, 0.24], rot: [0.2, 0, 0] }),
    );
    if (s > 0) arm.add(box(0.3, 0.1, 0.3, mat('bandage'), { pos: [0.04, -0.2, 0.06] }));
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.32, 0, 0);
    leg.add(
      capsule(0.22, 0.72, flesh, { pos: [0, -0.62, 0] }),
      box(0.36, 0.16, 0.48, mat('hideDark'), { pos: [0, -1.38, 0.08] }),
    );
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}

export function buildChemist(_rng: Rng): THREE.Object3D {
  const coat = mat('cloth');
  const flesh = mat('hide');
  const root = group('chemist');
  const body = group('body');
  const hips = group('hips');
  hips.position.y = 1.05;
  hips.add(
    capsule(0.24, 0.5, coat, { pos: [0, 0.22, 0], scale: [1.1, 1, 0.8] }),
    box(0.42, 0.55, 0.08, mat('clothStain'), { pos: [0, 0.1, 0.16] }),
    cyl(0.1, 0.1, 0.42, mat('tank'), { pos: [0.08, 0.22, -0.22], segments: 10 }),
    sphere(0.06, uniqueMat('toxicGlow'), { pos: [0.08, 0.48, -0.22], wSeg: 8, hSeg: 6 }),
  );
  const head = group('head');
  head.position.set(0, 0.55, 0.04);
  head.add(
    sphere(0.16, coat, { pos: [0, 0.08, 0], wSeg: 10, hSeg: 8 }),
    sphere(0.13, mat('maskBody'), { pos: [0, 0.04, 0.08], scale: [1, 1, 0.8], wSeg: 10, hSeg: 8 }),
    cyl(0.05, 0.05, 0.03, mat('lens'), { pos: [-0.05, 0.08, 0.16], rot: [Math.PI / 2, 0, 0], segments: 10 }),
    cyl(0.05, 0.05, 0.03, mat('lens'), { pos: [0.05, 0.08, 0.16], rot: [Math.PI / 2, 0, 0], segments: 10 }),
    cyl(0.05, 0.05, 0.1, mat('filter'), { pos: [0, -0.02, 0.2], rot: [Math.PI / 2, 0, 0], segments: 10 }),
  );
  hips.add(head);
  for (const s of [-1, 1] as const) {
    const arm = group(s < 0 ? 'armL' : 'armR');
    arm.position.set(s * 0.28, 0.38, 0);
    arm.add(capsule(0.07, s < 0 ? 0.5 : 0.34, flesh, { pos: [0, s < 0 ? -0.32 : -0.22, 0.04], rot: [0.2, 0, 0] }));
    hips.add(arm);
    const leg = group(s < 0 ? 'legL' : 'legR');
    leg.position.set(s * 0.12, 0, 0);
    leg.add(capsule(0.09, 0.4, coat, { pos: [0, -0.3, 0] }), box(0.14, 0.08, 0.24, mat('rubber'), { pos: [0, -0.56, 0.04] }));
    body.add(leg);
  }
  body.add(hips);
  root.add(body);
  return markAnimated(root);
}
