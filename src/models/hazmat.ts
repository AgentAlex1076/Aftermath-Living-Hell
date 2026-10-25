import * as THREE from 'three';
import { box, capsule, cyl, group, sphere, torus } from './build';
import { mat } from './materials';

/**
 * Hazmat survivor, built facing +Z. Named nodes are driven by PlayerAnimator:
 * rollPivot, hips, head, armL/armR, forearmL/forearmR, legL/legR, shinL/shinR, gun.
 */
export function buildHazmat(): THREE.Object3D {
  const suit = mat('hazmat');
  const shade = mat('hazmatShade');
  const tape = mat('tape');
  const rubber = mat('rubber');

  const root = group('hazmat');
  const rollPivot = group('rollPivot');
  rollPivot.position.y = 0.9;
  const body = group('body');
  body.position.y = -0.9;
  rollPivot.add(body);
  root.add(rollPivot);

  const hips = group('hips');
  hips.position.y = 0.9;
  body.add(hips);

  hips.add(
    capsule(0.27, 0.32, suit, { pos: [0, 0.3, 0], scale: [1.12, 1, 0.84], name: 'torso' }),
    box(0.06, 0.48, 0.03, shade, { pos: [0, 0.3, 0.225] }),
    box(0.11, 0.11, 0.03, rubber, { pos: [0.14, 0.46, 0.2], rot: [0.15, 0.25, 0] }),
    cyl(0.29, 0.29, 0.08, tape, { pos: [0, 0.02, 0], scale: [1.12, 1, 0.86], segments: 18 }),
    box(0.13, 0.11, 0.08, rubber, { pos: [0.21, 0.0, 0.2], rot: [0, 0.35, 0] }),
    box(0.11, 0.1, 0.07, rubber, { pos: [-0.24, 0.0, 0.14], rot: [0, -0.6, 0] }),
    torus(0.17, 0.04, tape, { pos: [0, 0.66, 0], rot: [Math.PI / 2, 0, 0] }),
  );

  const tank = group(
    'tank',
    cyl(0.1, 0.1, 0.5, mat('tank'), { pos: [0, 0, 0], segments: 14 }),
    sphere(0.1, mat('tank'), { pos: [0, 0.25, 0], scale: [1, 0.5, 1] }),
    sphere(0.1, mat('tank'), { pos: [0, -0.25, 0], scale: [1, 0.5, 1] }),
    cyl(0.03, 0.03, 0.08, mat('metalDark'), { pos: [0, 0.32, 0] }),
    box(0.3, 0.05, 0.04, tape, { pos: [0, 0.12, 0.08] }),
    box(0.3, 0.05, 0.04, tape, { pos: [0, -0.12, 0.08] }),
  );
  tank.position.set(0, 0.36, -0.29);
  tank.rotation.x = -0.08;
  hips.add(tank);

  const head = group('head');
  head.position.y = 0.72;
  head.add(
    sphere(0.2, suit, { pos: [0, 0.08, -0.01], scale: [1, 1.08, 1], name: 'hood' }),
    sphere(0.15, mat('maskBody'), { pos: [0, 0.06, 0.11], scale: [1.05, 1, 0.72] }),
  );
  for (const side of [-1, 1]) {
    head.add(
      cyl(0.05, 0.05, 0.04, mat('lens'), { pos: [side * 0.066, 0.1, 0.2], rot: [Math.PI / 2, 0, 0], segments: 16 }),
      torus(0.052, 0.012, rubber, { pos: [side * 0.066, 0.1, 0.221] }),
    );
  }
  const filter = group(
    'filter',
    cyl(0.062, 0.062, 0.11, mat('filter'), { rot: [Math.PI / 2, 0, 0], segments: 16 }),
    cyl(0.066, 0.066, 0.025, rubber, { pos: [0, 0, 0.055], rot: [Math.PI / 2, 0, 0], segments: 16 }),
    cyl(0.045, 0.045, 0.01, mat('metalDark'), { pos: [0, 0, 0.07], rot: [Math.PI / 2, 0, 0], segments: 12 }),
  );
  filter.position.set(0, -0.02, 0.24);
  filter.rotation.x = 0.35;
  head.add(filter);
  hips.add(head);

  for (const side of [1, -1] as const) {
    const s = side === 1 ? 'L' : 'R';
    const arm = group(`arm${s}`);
    arm.position.set(side * 0.33, 0.52, 0);
    arm.add(
      sphere(0.1, suit, { pos: [0, 0, 0] }),
      capsule(0.085, 0.2, suit, { pos: [0, -0.15, 0] }),
    );
    const forearm = group(`forearm${s}`);
    forearm.position.y = -0.31;
    forearm.add(
      capsule(0.078, 0.18, suit, { pos: [0, -0.13, 0] }),
      cyl(0.086, 0.086, 0.045, tape, { pos: [0, -0.24, 0] }),
      sphere(0.074, rubber, { pos: [0, -0.3, 0.01], scale: [1, 1.2, 0.9] }),
    );
    // Held items are authored with the grip at the origin and the handle along +Y; this points it forward.
    const hand = group(`hand${s}`);
    hand.position.set(0, -0.31, 0.02);
    hand.rotation.x = Math.PI / 2;
    forearm.add(hand);
    arm.add(forearm);
    hips.add(arm);

    const leg = group(`leg${s}`);
    leg.position.set(side * 0.14, 0.84, 0);
    leg.add(capsule(0.11, 0.24, suit, { pos: [0, -0.2, 0] }));
    const shin = group(`shin${s}`);
    shin.position.y = -0.4;
    shin.add(
      capsule(0.095, 0.22, suit, { pos: [0, -0.16, 0] }),
      cyl(0.102, 0.102, 0.05, tape, { pos: [0, -0.3, 0] }),
      box(0.16, 0.13, 0.28, rubber, { pos: [0, -0.375, 0.04] }),
    );
    leg.add(shin);
    body.add(leg);
  }

  const gun = group(
    'gun',
    box(0.07, 0.11, 0.42, mat('gunMetal'), { pos: [0, 0, 0] }),
    cyl(0.022, 0.022, 0.32, mat('gunMetal'), { pos: [0, 0.02, 0.36], rot: [Math.PI / 2, 0, 0], segments: 10 }),
    box(0.05, 0.16, 0.07, mat('gunMetal'), { pos: [0, -0.12, 0.06], rot: [0.2, 0, 0] }),
    box(0.05, 0.12, 0.06, mat('gunGrip'), { pos: [0, -0.1, -0.12], rot: [-0.35, 0, 0] }),
    box(0.06, 0.09, 0.22, mat('gunGrip'), { pos: [0, -0.02, -0.3] }),
    box(0.03, 0.04, 0.1, mat('metalDark'), { pos: [0, 0.075, 0.02] }),
  );
  gun.position.set(-0.07, 0.34, 0.44);
  gun.visible = false;
  hips.add(gun);

  return root;
}
