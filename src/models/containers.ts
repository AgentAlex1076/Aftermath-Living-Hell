import type * as THREE from 'three';
import type { LocalCollider } from '../physics/Collision';
import { box, cyl, group, torus } from './build';
import { mat } from './materials';

export function buildCabinet(): THREE.Object3D {
  const g = group('cabinet');
  g.add(
    box(0.7, 1.3, 0.4, mat('whiteMetal'), { pos: [0, 0.75, 0] }),
    box(0.02, 1.2, 0.02, mat('metalDark'), { pos: [0, 0.75, 0.205] }),
    box(0.26, 0.07, 0.02, mat('redPaint'), { pos: [0.18, 1.15, 0.21] }),
    box(0.07, 0.26, 0.02, mat('redPaint'), { pos: [0.18, 1.15, 0.21] }),
    box(0.04, 0.12, 0.04, mat('metalDark'), { pos: [-0.06, 0.8, 0.22] }),
  );
  for (const [x, z] of [
    [-0.3, -0.15],
    [0.3, -0.15],
    [-0.3, 0.15],
    [0.3, 0.15],
  ]) {
    g.add(box(0.05, 0.1, 0.05, mat('metalDark'), { pos: [x, 0.05, z] }));
  }
  const colliders: LocalCollider[] = [{ kind: 'box', x: 0, z: 0, hw: 0.38, hd: 0.24 }];
  g.userData.colliders = colliders;
  return g;
}

export function buildToolbox(): THREE.Object3D {
  const g = group('toolbox');
  g.add(
    box(0.56, 0.24, 0.28, mat('redPaint'), { pos: [0, 0.12, 0] }),
    box(0.58, 0.07, 0.3, mat('redPaint'), { pos: [0, 0.27, 0] }),
    box(0.58, 0.02, 0.3, mat('metalDark'), { pos: [0, 0.235, 0] }),
    torus(0.1, 0.018, mat('metalDark'), { pos: [0, 0.31, 0], arc: Math.PI }),
    box(0.05, 0.06, 0.02, mat('tin'), { pos: [-0.18, 0.22, 0.15] }),
    box(0.05, 0.06, 0.02, mat('tin'), { pos: [0.18, 0.22, 0.15] }),
  );
  const colliders: LocalCollider[] = [{ kind: 'circle', x: 0, z: 0, r: 0.34 }];
  g.userData.colliders = colliders;
  return g;
}

/** Raid reward: a hazard-striped footlocker with a scrap tarp lashed over one end. */
export function buildSalvageCache(): THREE.Object3D {
  const g = group('salvageCache');
  g.add(
    box(1.0, 0.46, 0.56, mat('metalDark'), { pos: [0, 0.25, 0] }),
    box(1.04, 0.08, 0.6, mat('hazardYellow'), { pos: [0, 0.5, 0] }),
    box(0.12, 0.47, 0.58, mat('hazardYellow'), { pos: [-0.3, 0.25, 0] }),
    box(0.12, 0.47, 0.58, mat('hazardYellow'), { pos: [0.3, 0.25, 0] }),
    box(0.5, 0.06, 0.64, mat('clothStain'), { pos: [0.28, 0.56, 0.02], rot: [0, 0, -0.08] }),
    box(0.1, 0.08, 0.04, mat('tin'), { pos: [0, 0.4, 0.3] }),
    torus(0.06, 0.012, mat('iron'), { pos: [-0.52, 0.32, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI }),
    torus(0.06, 0.012, mat('iron'), { pos: [0.52, 0.32, 0], rot: [0, Math.PI / 2, 0], arc: Math.PI }),
    box(0.06, 0.04, 0.04, mat('redPaint'), { pos: [-0.12, 0.555, 0.25] }),
  );
  const colliders: LocalCollider[] = [{ kind: 'box', x: 0, z: 0, hw: 0.54, hd: 0.32 }];
  g.userData.colliders = colliders;
  return g;
}

export function buildLabLocker(): THREE.Object3D {
  const g = group('labLocker');
  g.add(
    box(0.62, 1.9, 0.5, mat('whiteMetal'), { pos: [0, 0.95, 0] }),
    box(0.02, 1.8, 0.02, mat('metalDark'), { pos: [0, 0.95, 0.255] }),
    box(0.22, 0.04, 0.02, mat('metalDark'), { pos: [-0.15, 1.65, 0.255] }),
    box(0.22, 0.04, 0.02, mat('metalDark'), { pos: [-0.15, 1.58, 0.255] }),
    box(0.22, 0.04, 0.02, mat('metalDark'), { pos: [0.15, 1.65, 0.255] }),
    box(0.22, 0.04, 0.02, mat('metalDark'), { pos: [0.15, 1.58, 0.255] }),
    box(0.2, 0.18, 0.015, mat('hazardYellow'), { pos: [0.14, 1.25, 0.26], rot: [0, 0, Math.PI / 4] }),
    box(0.07, 0.08, 0.04, mat('tin'), { pos: [0, 1.0, 0.29] }),
    torus(0.03, 0.008, mat('tin'), { pos: [0, 1.06, 0.29] }),
    cyl(0.25, 0.25, 0.02, mat('metalDark'), { pos: [0, 1.91, 0], segments: 4, rot: [0, Math.PI / 4, 0], scale: [1.2, 1, 0.95] }),
  );
  const colliders: LocalCollider[] = [{ kind: 'box', x: 0, z: 0, hw: 0.33, hd: 0.27 }];
  g.userData.colliders = colliders;
  return g;
}
