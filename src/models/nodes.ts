import type * as THREE from 'three';
import type { Rng } from '../core/random';
import type { LocalCollider } from '../physics/Collision';
import { box, capsule, cyl, group, mesh, rock, sphere, torus } from './build';
import { mat, type MaterialKey } from './materials';
import { blobGeometry } from './props';

const q = (v: number, step = 0.1) => Math.max(step, Math.round(v / step) * step);

export function buildBoulder(rng: Rng): THREE.Object3D {
  const g = group('boulder');
  const big = q(rng.range(0.7, 1.05));
  g.add(
    rock(big, mat(rng.chance(0.5) ? 'rock' : 'rockDark'), {
      pos: [0, big * 0.45, 0],
      rot: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
      scale: [1, rng.range(0.6, 0.85), rng.range(0.8, 1.1)],
    }),
  );
  for (let i = 0; i < rng.int(1, 3); i++) {
    const r = q(rng.range(0.25, 0.45));
    const a = rng.range(0, Math.PI * 2);
    g.add(
      rock(r, mat(rng.chance(0.5) ? 'rock' : 'rockDark'), {
        pos: [Math.cos(a) * (big * 0.9), r * 0.4, Math.sin(a) * (big * 0.9)],
        rot: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
        scale: [1, rng.range(0.6, 0.9), 1],
      }),
    );
  }
  const colliders: LocalCollider[] = [{ kind: 'circle', x: 0, z: 0, r: big * 0.95 }];
  g.userData.colliders = colliders;
  return g;
}

/** A dead mutated beast on its side: bloated hide, exposed ribs, stiff legs, glowing pustules. */
export function buildCarcass(rng: Rng): THREE.Object3D {
  const g = group('carcass');
  g.add(mesh(blobGeometry(rng, 1.1), mat('blood'), { pos: [0.1, 0.012, 0.1], shadow: false }));
  g.add(sphere(0.5, mat('hide'), { pos: [0, 0.38, 0], scale: [1.6, 0.75, 0.95], wSeg: 12, hSeg: 9 }));
  g.add(sphere(0.32, mat('hideDark'), { pos: [-0.55, 0.34, 0.05], scale: [1.2, 0.8, 1], wSeg: 10, hSeg: 8 }));
  // Torn-open flank with ribs.
  g.add(sphere(0.28, mat('meat'), { pos: [0.1, 0.55, 0.32], scale: [1.4, 0.7, 0.5], wSeg: 10, hSeg: 8 }));
  for (let i = 0; i < 5; i++) {
    g.add(torus(0.3, 0.025, mat('bone'), { pos: [-0.3 + i * 0.16, 0.42, 0.18], rot: [0, Math.PI / 2, 0], arc: Math.PI * 0.95 }));
  }
  // Head with a long jaw.
  const head = group('head');
  head.add(
    sphere(0.22, mat('hide'), { scale: [1.5, 0.9, 1], wSeg: 10, hSeg: 8 }),
    box(0.34, 0.06, 0.16, mat('bone'), { pos: [0.3, -0.1, 0] }),
    sphere(0.045, mat('toxicGlow'), { pos: [0.18, 0.08, 0.13], wSeg: 6, hSeg: 5, shadow: false }),
  );
  head.position.set(0.95, 0.32, -0.05);
  head.rotation.set(0.3, rng.range(-0.4, 0.4), -0.35);
  g.add(head);
  for (const [x, z, a] of [
    [0.45, -0.2, -0.5],
    [0.25, 0.25, 0.4],
    [-0.5, -0.25, -0.6],
    [-0.65, 0.2, 0.3],
  ]) {
    g.add(capsule(0.06, 0.6, mat('hideDark'), { pos: [x, 0.3, z + Math.sign(z) * 0.35], rot: [Math.PI / 2 + a, 0, rng.range(-0.3, 0.3)] }));
  }
  for (let i = 0; i < rng.int(3, 6); i++) {
    g.add(sphere(rng.range(0.05, 0.1), mat('toxicGlow'), { pos: [rng.range(-0.6, 0.5), rng.range(0.55, 0.7), rng.range(-0.3, 0.2)], wSeg: 6, hSeg: 5, shadow: false }));
  }
  const colliders: LocalCollider[] = [{ kind: 'circle', x: 0, z: 0, r: 0.75 }];
  g.userData.colliders = colliders;
  return g;
}

export function buildScrapPile(rng: Rng): THREE.Object3D {
  const g = group('scrapPile');
  const sheetMats: MaterialKey[] = ['rust', 'rustLight', 'corrugated', 'metalDark'];
  g.add(rock(0.8, mat('rockDark'), { pos: [0, 0.05, 0], scale: [1.3, 0.35, 1.1], rot: [0, rng.range(0, 3), 0] }));
  for (let i = 0; i < rng.int(6, 9); i++) {
    g.add(
      box(q(rng.range(0.5, 1.1)), 0.03, q(rng.range(0.3, 0.6)), mat(rng.pick(sheetMats)), {
        pos: [rng.range(-0.6, 0.6), rng.range(0.15, 0.55), rng.range(-0.5, 0.5)],
        rot: [rng.range(-0.7, 0.7), rng.range(0, 3), rng.range(-0.7, 0.7)],
      }),
    );
  }
  for (let i = 0; i < 2; i++) {
    g.add(
      cyl(0.06, 0.06, q(rng.range(0.9, 1.5)), mat('metalDark'), {
        pos: [rng.range(-0.4, 0.4), 0.35, rng.range(-0.4, 0.4)],
        rot: [rng.range(-1.4, 1.4), rng.range(0, 3), Math.PI / 2 + rng.range(-0.3, 0.3)],
        segments: 8,
      }),
    );
  }
  g.add(torus(0.28, 0.1, mat('rubber'), { pos: [rng.range(-0.7, 0.7), 0.12, rng.range(-0.7, 0.7)], rot: [Math.PI / 2 + rng.range(-0.3, 0.3), 0, 0] }));
  if (rng.chance(0.5)) {
    g.add(box(0.6, 0.9, 0.55, mat('whiteMetal'), { pos: [0.5, 0.35, -0.4], rot: [0.2, rng.range(0, 3), 1.2] }));
  }
  const colliders: LocalCollider[] = [{ kind: 'circle', x: 0, z: 0, r: 1.0 }];
  g.userData.colliders = colliders;
  return g;
}
