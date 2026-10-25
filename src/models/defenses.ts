import type * as THREE from 'three';
import type { Rng } from '../core/random';
import type { LightDesc } from '../render/LightPool';
import type { LocalCollider } from '../physics/Collision';
import { box, cyl, group, sphere } from './build';
import { mat, uniqueMat } from './materials';

function solid(w: number, d: number, tag?: string): LocalCollider[] {
  return [{ kind: 'box', x: 0, z: 0, hw: w / 2 + 0.03, hd: d / 2 + 0.03, tag }];
}

export function buildSandbags(rng: Rng): THREE.Object3D {
  const g = group('sandbags');
  const bags: [number, number, number, number][] = [
    [-0.55, 0.22, -0.08, 0.04],
    [0.02, 0.22, 0.04, -0.05],
    [0.56, 0.22, -0.02, 0.06],
    [-0.28, 0.58, 0.02, 0.08],
    [0.3, 0.58, -0.04, -0.06],
    [0.02, 0.86, 0.01, 0.02],
  ];
  for (const [x, y, z, yaw] of bags) {
    const w = rng.range(0.58, 0.7);
    const h = rng.range(0.3, 0.36);
    const d = rng.range(0.34, 0.42);
    g.add(box(w, h, d, mat(rng.chance(0.45) ? 'sack' : 'clothStain'), { pos: [x, y, z], rot: [0, yaw, rng.range(-0.04, 0.04)] }));
    g.add(box(w * 0.7, 0.04, d * 0.35, mat('cloth'), { pos: [x, y + h * 0.42, z], rot: [0, yaw, 0] }));
  }
  g.add(box(0.18, 0.08, 0.18, mat('hazardYellow'), { pos: [0.62, 0.42, 0.18] }));
  g.userData.colliders = solid(1.7, 0.62, 'half');
  return g;
}

export function buildSpikeStrip(rng: Rng): THREE.Object3D {
  const g = group('spikeStrip');
  g.add(box(1.86, 0.05, 0.62, mat('metalDark'), { pos: [0, 0.03, 0] }));
  g.add(box(1.9, 0.03, 0.66, mat('iron'), { pos: [0, 0.015, 0] }));
  for (let i = 0; i < 9; i++) {
    const x = -0.8 + i * 0.2;
    for (const z of [-0.16, 0.16]) {
      const h = rng.range(0.16, 0.24);
      g.add(cyl(0.012, 0.002, h, mat(rng.chance(0.3) ? 'whiteMetal' : 'iron'), {
        pos: [x + rng.range(-0.02, 0.02), 0.05 + h / 2, z + rng.range(-0.03, 0.03)],
        rot: [rng.range(-0.15, 0.15), 0, rng.range(-0.12, 0.12)],
        segments: 6,
      }));
    }
  }
  g.add(box(0.22, 0.04, 0.08, mat('hazardYellow'), { pos: [-0.82, 0.06, 0] }));
  g.add(box(0.22, 0.04, 0.08, mat('hazardYellow'), { pos: [0.82, 0.06, 0] }));
  return g;
}

export function buildBarbedWire(rng: Rng): THREE.Object3D {
  const g = group('barbedWire');
  for (const x of [-1.05, 1.05]) {
    g.add(box(0.06, 0.82, 0.06, mat('iron'), { pos: [x, 0.41, 0] }));
    g.add(box(0.1, 0.04, 0.1, mat('metalDark'), { pos: [x, 0.02, 0] }));
  }
  for (const y of [0.22, 0.48, 0.72]) {
    g.add(box(2.12, 0.012, 0.012, mat('whiteMetal'), { pos: [0, y, 0] }));
    for (let i = 0; i < 8; i++) {
      const x = -0.9 + i * 0.26;
      g.add(box(0.08, 0.04, 0.04, mat('iron'), { pos: [x, y, rng.range(-0.04, 0.04)], rot: [0, rng.range(-0.6, 0.6), 0.8] }));
    }
  }
  g.add(box(0.16, 0.08, 0.04, mat('hazardYellow'), { pos: [-1.05, 0.7, 0.04] }));
  return g;
}

export function buildLandmine(): THREE.Object3D {
  const g = group('landmine');
  g.add(cyl(0.22, 0.24, 0.07, mat('metalDark'), { pos: [0, 0.045, 0], segments: 10 }));
  g.add(cyl(0.16, 0.16, 0.04, mat('iron'), { pos: [0, 0.09, 0], segments: 10 }));
  const lamp = uniqueMat('ember');
  g.add(cyl(0.05, 0.05, 0.03, lamp, { pos: [0, 0.115, 0], segments: 8, shadow: false }));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    g.add(box(0.08, 0.02, 0.04, mat('hazardYellow'), { pos: [Math.sin(a) * 0.18, 0.08, Math.cos(a) * 0.18] }));
  }
  g.userData.lights = [{ pos: [0, 0.14, 0], color: '#ff5a1a', intensity: 2.2, distance: 2.4, style: 'pulse', emissive: lamp }] satisfies LightDesc[];
  return g;
}

export function buildTripwire(): THREE.Object3D {
  const g = group('tripwire');
  for (const x of [-1.22, 1.22]) {
    g.add(box(0.05, 0.62, 0.05, mat('iron'), { pos: [x, 0.31, 0] }));
    g.add(box(0.1, 0.04, 0.1, mat('metalDark'), { pos: [x, 0.02, 0] }));
    g.add(cyl(0.07, 0.08, 0.16, mat('rust'), { pos: [x, 0.18, 0.08], segments: 8 }));
  }
  g.add(box(2.4, 0.01, 0.01, mat('whiteMetal'), { pos: [0, 0.28, 0] }));
  g.add(box(0.14, 0.1, 0.1, mat('hazardYellow'), { pos: [1.22, 0.42, 0.02] }));
  return g;
}

export function buildGasTrap(): THREE.Object3D {
  const g = group('gasTrap');
  g.add(cyl(0.22, 0.24, 0.52, mat('rust'), { pos: [0, 0.3, 0], segments: 10 }));
  g.add(cyl(0.24, 0.24, 0.06, mat('iron'), { pos: [0, 0.06, 0], segments: 10 }));
  g.add(cyl(0.2, 0.2, 0.05, mat('iron'), { pos: [0, 0.56, 0], segments: 10 }));
  const glow = uniqueMat('toxicGlow');
  g.add(cyl(0.08, 0.08, 0.1, glow, { pos: [0, 0.64, 0], segments: 8, shadow: false }));
  g.add(box(0.18, 0.08, 0.04, mat('hazardYellow'), { pos: [0, 0.36, 0.23] }));
  g.add(box(0.06, 0.16, 0.06, mat('metalDark'), { pos: [0.18, 0.5, 0] }));
  g.userData.lights = [{ pos: [0, 0.68, 0], color: '#79ff3a', intensity: 3, distance: 3.2, style: 'pulse', emissive: glow }] satisfies LightDesc[];
  return g;
}

export function buildShotgunTrap(): THREE.Object3D {
  const g = group('shotgunTrap');
  g.add(box(0.18, 0.95, 0.18, mat('woodDark'), { pos: [0, 0.48, -0.12] }));
  g.add(box(0.28, 0.08, 0.28, mat('iron'), { pos: [0, 0.04, -0.12] }));
  g.add(box(0.34, 0.22, 0.55, mat('gunMetal'), { pos: [0, 0.92, 0.08] }));
  g.add(cyl(0.045, 0.04, 0.42, mat('iron'), { pos: [-0.06, 0.94, 0.38], rot: [Math.PI / 2, 0, 0], segments: 8 }));
  g.add(cyl(0.045, 0.04, 0.42, mat('iron'), { pos: [0.06, 0.94, 0.38], rot: [Math.PI / 2, 0, 0], segments: 8 }));
  g.add(box(0.16, 0.1, 0.08, mat('hazardYellow'), { pos: [0, 0.92, -0.16] }));
  g.add(box(0.08, 0.14, 0.08, mat('wood'), { pos: [0, 0.78, -0.02], rot: [0.4, 0, 0] }));
  g.userData.colliders = solid(0.7, 0.7);
  return g;
}

export function buildGenerator(): THREE.Object3D {
  const g = group('generator');
  g.add(box(1.05, 0.55, 0.72, mat('metalDark'), { pos: [0, 0.38, 0] }));
  g.add(box(1.1, 0.08, 0.78, mat('iron'), { pos: [0, 0.08, 0] }));
  g.add(box(0.42, 0.38, 0.42, mat('gunMetal'), { pos: [-0.22, 0.72, 0] }));
  g.add(cyl(0.08, 0.1, 0.28, mat('rust'), { pos: [0.28, 0.82, -0.12], segments: 8 }));
  g.add(cyl(0.05, 0.05, 0.18, mat('iron'), { pos: [0.28, 1.02, -0.12], segments: 8 }));
  const fire = uniqueMat('ember');
  g.add(cyl(0.04, 0.05, 0.06, fire, { pos: [0.28, 1.12, -0.12], segments: 6, shadow: false }));
  g.add(box(0.28, 0.32, 0.28, mat('rust'), { pos: [0.32, 0.4, 0.18] }));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.14, 0.04, 0.72, mat(i % 2 ? 'tape' : 'hazardYellow'), { pos: [0, 0.22 + i * 0.08, 0] }));
  }
  g.add(box(0.16, 0.1, 0.04, mat('hazardYellow'), { pos: [0, 0.55, 0.38] }));
  g.userData.colliders = solid(1.15, 0.85);
  g.userData.lights = [{ pos: [0.28, 1.14, -0.12], color: '#ff7a2a', intensity: 5, distance: 4.5, style: 'fire', emissive: fire }] satisfies LightDesc[];
  return g;
}

export function buildAutoTurret(): THREE.Object3D {
  const g = group('autoTurret');
  g.add(cyl(0.22, 0.28, 0.1, mat('iron'), { pos: [0, 0.06, 0], segments: 8 }));
  for (const a of [0, 2.1, 4.2]) {
    g.add(box(0.08, 0.06, 0.55, mat('metalDark'), { pos: [Math.sin(a) * 0.22, 0.06, Math.cos(a) * 0.22], rot: [0, a, 0] }));
  }
  g.add(cyl(0.07, 0.09, 0.62, mat('gunMetal'), { pos: [0, 0.42, 0], segments: 8 }));
  g.add(box(0.22, 0.12, 0.22, mat('iron'), { pos: [0, 0.76, 0] }));

  const head = group('head');
  head.position.set(0, 0.92, 0);
  head.add(box(0.42, 0.22, 0.36, mat('gunMetal'), { pos: [0, 0.06, 0] }));
  head.add(box(0.18, 0.14, 0.22, mat('metalDark'), { pos: [0, 0.2, -0.02] }));
  head.add(cyl(0.035, 0.03, 0.38, mat('iron'), { pos: [0, 0.08, 0.28], rot: [Math.PI / 2, 0, 0], segments: 8 }));
  const lamp = uniqueMat('toxicGlow');
  head.add(sphere(0.035, lamp, { pos: [0.14, 0.16, 0.12], shadow: false }));
  const mount = group('gunMount');
  mount.position.set(0, 0.1, 0.06);
  head.add(mount);
  g.add(head);

  g.userData.animated = ['head'];
  g.userData.colliders = [{ kind: 'circle', x: 0, z: 0, r: 0.42 }];
  g.userData.lights = [{ pos: [0.14, 1.08, 0.12], color: '#79ff3a', intensity: 2.4, distance: 3, style: 'steady', emissive: lamp }] satisfies LightDesc[];
  return g;
}

export function buildFloodlight(): THREE.Object3D {
  const g = group('floodlight');
  g.add(cyl(0.14, 0.18, 0.08, mat('iron'), { pos: [0, 0.04, 0], segments: 8 }));
  g.add(cyl(0.05, 0.06, 1.7, mat('metalDark'), { pos: [0, 0.9, 0], segments: 8 }));
  g.add(box(0.16, 0.08, 0.16, mat('iron'), { pos: [0, 1.76, 0] }));
  const lamp = uniqueMat('bulbWarm');
  g.add(box(0.28, 0.2, 0.34, mat('gunMetal'), { pos: [0, 1.92, 0.1] }));
  g.add(box(0.22, 0.16, 0.08, lamp, { pos: [0, 1.92, 0.28], shadow: false }));
  g.add(box(0.08, 0.06, 0.04, mat('hazardYellow'), { pos: [0, 1.78, 0.08] }));
  g.userData.colliders = [{ kind: 'circle', x: 0, z: 0, r: 0.2 }];
  g.userData.lights = [{ pos: [0, 1.92, 0.28], color: '#ffd9a0', intensity: 16, distance: 18, style: 'faulty', emissive: lamp }] satisfies LightDesc[];
  return g;
}

export function buildFlameVent(): THREE.Object3D {
  const g = group('flameVent');
  g.add(box(0.78, 0.22, 0.58, mat('metalDark'), { pos: [0, 0.16, 0] }));
  g.add(box(0.82, 0.06, 0.62, mat('iron'), { pos: [0, 0.04, 0] }));
  g.add(cyl(0.1, 0.14, 0.28, mat('gunMetal'), { pos: [0, 0.28, 0.22], rot: [Math.PI / 2.4, 0, 0], segments: 8 }));
  g.add(cyl(0.08, 0.08, 0.16, mat('iron'), { pos: [0, 0.36, 0.38], rot: [Math.PI / 2.2, 0, 0], segments: 8 }));
  const fire = uniqueMat('ember');
  g.add(sphere(0.05, fire, { pos: [0, 0.4, 0.48], shadow: false }));
  g.add(box(0.2, 0.08, 0.04, mat('hazardYellow'), { pos: [0, 0.22, -0.28] }));
  g.add(box(0.12, 0.18, 0.12, mat('rust'), { pos: [-0.28, 0.28, -0.1] }));
  g.userData.colliders = solid(0.85, 0.7);
  g.userData.lights = [{ pos: [0, 0.4, 0.48], color: '#ff7a2a', intensity: 6, distance: 5, style: 'fire', emissive: fire }] satisfies LightDesc[];
  return g;
}
