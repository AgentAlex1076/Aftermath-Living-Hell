import type * as THREE from 'three';
import type { Rng } from '../core/random';
import { box, capsule, cyl, group, sphere } from './build';
import { mat, uniqueMat } from './materials';

/** Named nodes the animator drives: body, hips, head, armL/armR, legL/legR. */
const ANIMATED = ['body', 'hips', 'head', 'armL', 'armR', 'legL', 'legR'];

function markAnimated<T extends { userData: Record<string, unknown> }>(root: T): T {
  root.userData.animated = ANIMATED;
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
