import * as THREE from 'three';
import type { Rng } from '../core/random';
import type { LocalCollider } from '../physics/Collision';
import { box, cyl, group, mesh, rock } from './build';
import { mat, uniqueMat, type MaterialKey } from './materials';
import type { LightDesc } from '../render/LightPool';

const q = (v: number, step = 0.1) => Math.max(step, Math.round(v / step) * step);

function setColliders(obj: THREE.Object3D, colliders: LocalCollider[]): void {
  obj.userData.colliders = colliders;
}

/** Flat, irregular puddle outline lying on the ground plane. */
export function blobGeometry(rng: Rng, radius: number, points = 22): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const p1 = rng.range(0, Math.PI * 2);
  const p2 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const r = radius * (1 + 0.2 * Math.sin(a * 3 + p1) + 0.1 * Math.sin(a * 5 + p2) + rng.range(-0.05, 0.05));
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape, 3);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

export function buildDeadTree(rng: Rng): THREE.Object3D {
  const g = group('deadTree');
  const h = q(rng.range(3.2, 5.6), 0.2);
  const trunk = group('trunk', cyl(0.1, 0.25, h, mat('deadWood'), { pos: [0, h / 2, 0], segments: 7 }));
  trunk.rotation.set(rng.range(-0.07, 0.07), 0, rng.range(-0.07, 0.07));
  g.add(trunk);

  const branches = rng.int(3, 6);
  for (let i = 0; i < branches; i++) {
    const len = q(rng.range(0.9, 1.9));
    const b = group('branch', cyl(0.025, 0.075, len, mat('deadWood'), { pos: [0, len / 2, 0], segments: 5 }));
    b.position.y = rng.range(0.45, 0.88) * h;
    b.rotation.set(0, rng.range(0, Math.PI * 2), 0);
    b.rotateZ(rng.range(0.55, 1.15));
    if (rng.chance(0.6)) {
      const tl = q(len * 0.5);
      const twig = group('twig', cyl(0.012, 0.03, tl, mat('deadWood'), { pos: [0, tl / 2, 0], segments: 4 }));
      twig.position.y = len * rng.range(0.5, 0.8);
      twig.rotation.z = rng.sign() * rng.range(0.5, 0.9);
      b.add(twig);
    }
    trunk.add(b);
  }
  for (let i = 0; i < 3; i++) {
    const root = cyl(0.03, 0.12, 0.7, mat('deadWood'), { pos: [0, 0.12, 0], segments: 5 });
    const holder = group('root', root);
    holder.rotation.set(0, (i / 3) * Math.PI * 2 + rng.range(0, 1), 0);
    root.position.set(0.25, 0.1, 0);
    root.rotation.z = 1.25;
    g.add(holder);
  }
  setColliders(g, [{ kind: 'circle', x: 0, z: 0, r: 0.32 }]);
  return g;
}

export function buildBarrel(rng: Rng, toxic = false): THREE.Object3D {
  const g = group(toxic ? 'barrelToxic' : 'barrel');
  const bodyKey: MaterialKey = toxic ? 'hazardYellow' : rng.pick<MaterialKey>(['rust', 'paintBlue', 'rustLight']);
  const barrel = group(
    'body',
    cyl(0.3, 0.3, 0.88, mat(bodyKey), { pos: [0, 0.44, 0], segments: 16 }),
    cyl(0.312, 0.312, 0.045, mat('metalDark'), { pos: [0, 0.22, 0], segments: 16 }),
    cyl(0.312, 0.312, 0.045, mat('metalDark'), { pos: [0, 0.66, 0], segments: 16 }),
    cyl(0.29, 0.29, 0.02, mat('metalDark'), { pos: [0, 0.885, 0], segments: 16 }),
  );
  barrel.rotation.set(rng.range(-0.05, 0.05), rng.range(0, Math.PI * 2), rng.range(-0.05, 0.05));
  g.add(barrel);

  if (toxic) {
    const goo = uniqueMat('toxicGlow');
    barrel.add(cyl(0.24, 0.24, 0.02, goo, { pos: [0, 0.9, 0], segments: 14, shadow: false }));
    barrel.add(box(0.06, 0.4, 0.02, goo, { pos: [0.1, 0.7, 0.3], shadow: false }));
    const rimMat = uniqueMat('toxicGlow');
    rimMat.color.set('#1f4410');
    rimMat.emissive.set('#2f8f10');
    rimMat.emissiveIntensity = 0.45;
    rimMat.roughness = 0.1;
    rimMat.transparent = true;
    rimMat.opacity = 0.8;
    const coreMat = uniqueMat('toxicGlow');
    coreMat.color.set('#4f9e1e');
    coreMat.emissive.set('#5ee01c');
    coreMat.emissiveIntensity = 1.1;
    coreMat.roughness = 0.08;

    const spill = group('spill');
    const size = rng.range(0.75, 1.1);
    spill.add(mesh(blobGeometry(rng, 0.85 * size), rimMat, { pos: [0, 0.01, 0], shadow: false }));
    spill.add(mesh(blobGeometry(rng, 0.48 * size), coreMat, { pos: [rng.range(-0.1, 0.1), 0.016, rng.range(-0.1, 0.1)], shadow: false }));
    if (rng.chance(0.7)) {
      spill.add(mesh(blobGeometry(rng, 0.3 * size), rimMat, { pos: [0.75 * size, 0.012, rng.range(-0.3, 0.3)], shadow: false }));
    }
    spill.position.set(0.35, 0, 0.3);
    spill.rotation.y = rng.range(0, Math.PI * 2);
    g.add(spill);

    const lights: LightDesc[] = [{ pos: [0.2, 0.9, 0.2], color: '#6dff3a', intensity: 4, distance: 6, style: 'pulse', emissive: coreMat }];
    g.userData.lights = lights;
  }
  setColliders(g, [{ kind: 'circle', x: 0, z: 0, r: 0.34 }]);
  return g;
}

export function buildCrate(rng: Rng): THREE.Object3D {
  const g = group('crate');
  const one = (size: number) =>
    group(
      'crateBox',
      box(size, size, size, mat(rng.pick<MaterialKey>(['wood', 'woodLight', 'woodRot'])), { pos: [0, size / 2, 0] }),
      box(size + 0.04, 0.08, size + 0.04, mat('woodDark'), { pos: [0, size * 0.12, 0] }),
      box(size + 0.04, 0.08, size + 0.04, mat('woodDark'), { pos: [0, size * 0.88, 0] }),
    );
  const base = one(0.9);
  base.rotation.y = rng.range(-0.3, 0.3);
  g.add(base);
  if (rng.chance(0.35)) {
    const top = one(0.6);
    top.position.set(rng.range(-0.1, 0.1), 0.9, rng.range(-0.1, 0.1));
    top.rotation.y = rng.range(0, Math.PI);
    g.add(top);
  }
  setColliders(g, [{ kind: 'box', x: 0, z: 0, hw: 0.5, hd: 0.5 }]);
  return g;
}

export function buildRubble(rng: Rng): THREE.Object3D {
  const g = group('rubble');
  const n = rng.int(5, 9);
  for (let i = 0; i < n; i++) {
    const r = q(rng.range(0.2, 0.6));
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 0.8);
    g.add(
      rock(r, mat(rng.chance(0.6) ? 'concrete' : 'concreteDark'), {
        pos: [Math.cos(a) * d, r * 0.35, Math.sin(a) * d],
        rot: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
        scale: [1, rng.range(0.45, 0.8), 1],
      }),
    );
  }
  for (let i = 0; i < rng.int(1, 3); i++) {
    g.add(
      cyl(0.015, 0.015, 1.2, mat('rust'), {
        pos: [rng.range(-0.4, 0.4), 0.4, rng.range(-0.4, 0.4)],
        rot: [rng.range(-0.9, 0.9), 0, rng.range(-0.9, 0.9)],
        segments: 5,
      }),
    );
  }
  setColliders(g, [{ kind: 'circle', x: 0, z: 0, r: 0.9 }]);
  return g;
}

export function buildCar(rng: Rng): THREE.Object3D {
  const g = group('car');
  const paint = mat(rng.pick<MaterialKey>(['paintRed', 'paintBlue', 'rust']));
  const shell = group('shell');
  shell.add(
    box(4.2, 0.6, 1.8, paint, { pos: [0, 0.6, 0] }),
    box(1.2, 0.08, 1.7, paint, { pos: [1.45, 0.93, 0], rot: [0, 0, -0.06] }),
    box(2.0, 0.5, 1.6, mat('glassDark'), { pos: [-0.25, 1.15, 0] }),
    box(2.1, 0.08, 1.66, paint, { pos: [-0.3, 1.43, 0] }),
    box(0.9, 0.3, 1.2, mat('rust'), { pos: [1.4, 0.95, 0.1], rot: [0, 0, -0.1] }),
    box(0.6, 0.02, 0.5, mat('rust'), { pos: [-0.6, 1.475, 0.3] }),
    box(0.08, 0.14, 0.4, mat('bulbWarm'), { pos: [2.1, 0.7, 0.6], shadow: false }),
    box(0.08, 0.14, 0.4, mat('glassDark'), { pos: [2.1, 0.7, -0.6], shadow: false }),
    box(0.1, 0.2, 1.84, mat('metalDark'), { pos: [2.12, 0.42, 0] }),
    box(0.1, 0.2, 1.84, mat('metalDark'), { pos: [-2.12, 0.42, 0] }),
  );
  const wheels: [number, number][] = [
    [1.35, 0.85],
    [1.35, -0.85],
    [-1.35, 0.85],
    [-1.35, -0.85],
  ];
  const missing = rng.int(0, 3);
  wheels.forEach(([x, z], i) => {
    if (i === missing) return;
    shell.add(cyl(0.36, 0.36, 0.26, mat('rubber'), { pos: [x, 0.33, z], rot: [Math.PI / 2, 0, 0], segments: 14 }));
  });
  const [mx, mz] = wheels[missing];
  shell.rotation.set(mz > 0 ? 0.06 : -0.06, 0, mx > 0 ? -0.04 : 0.04);
  shell.position.y = -0.05;
  g.add(shell);
  setColliders(g, [{ kind: 'box', x: 0, z: 0, hw: 2.15, hd: 0.95 }]);
  return g;
}

export function buildFence(rng: Rng): THREE.Object3D {
  const g = group('fence');
  const len = 3;
  for (const x of [-1.45, 0, 1.45]) {
    if (x === 0 && rng.chance(0.3)) continue;
    g.add(box(0.12, 1.3, 0.12, mat('woodDark'), { pos: [x, 0.65, 0], rot: [0, 0, rng.range(-0.08, 0.08)] }));
  }
  g.add(box(len, 0.09, 0.05, mat('wood'), { pos: [0, 0.4, 0.07] }));
  if (rng.chance(0.7)) g.add(box(len, 0.09, 0.05, mat('woodRot'), { pos: [0, 1.0, 0.07], rot: [0, 0, rng.range(-0.06, 0.06)] }));
  for (let x = -1.3; x <= 1.3; x += 0.22) {
    if (rng.chance(0.25)) continue;
    const h = q(rng.range(0.7, 1.25), 0.05);
    g.add(box(0.15, h, 0.03, mat(rng.pick<MaterialKey>(['wood', 'woodRot', 'woodLight'])), { pos: [x, h / 2, 0.1], rot: [0, 0, rng.range(-0.06, 0.06)] }));
  }
  g.rotation.z = rng.range(-0.05, 0.05);
  setColliders(g, [{ kind: 'box', x: 0, z: 0, hw: len / 2, hd: 0.14 }]);
  return g;
}

export function buildLampPost(): THREE.Object3D {
  const g = group('lampPost');
  g.add(
    cyl(0.18, 0.22, 0.3, mat('concrete'), { pos: [0, 0.15, 0], segments: 10 }),
    cyl(0.07, 0.1, 5.2, mat('metalDark'), { pos: [0, 2.6, 0], segments: 10 }),
    box(1.2, 0.08, 0.08, mat('metalDark'), { pos: [0.55, 5.1, 0] }),
    box(0.55, 0.12, 0.28, mat('metalDark'), { pos: [1.15, 5.02, 0] }),
  );
  const bulbMat = uniqueMat('bulbWarm');
  g.add(box(0.38, 0.04, 0.18, bulbMat, { pos: [1.15, 4.95, 0], shadow: false }));
  const lights: LightDesc[] = [{ pos: [1.15, 4.6, 0], color: '#ffb35a', intensity: 40, distance: 16, style: 'faulty', emissive: bulbMat }];
  g.userData.lights = lights;
  setColliders(g, [{ kind: 'circle', x: 0, z: 0, r: 0.22 }]);
  return g;
}

/** Hand-cranked air-raid siren on a pole. The red lamp is driven by the raid state (`gain`). */
export function buildSiren(): THREE.Object3D {
  const g = group('siren');
  g.add(
    cyl(0.3, 0.34, 0.22, mat('concrete'), { pos: [0, 0.11, 0], segments: 10 }),
    cyl(0.06, 0.08, 2.7, mat('metalDark'), { pos: [0, 1.45, 0], segments: 8 }),
    box(0.17, 0.32, 0.17, mat('hazardYellow'), { pos: [0, 0.5, 0] }),
    cyl(0.2, 0.2, 0.42, mat('redPaint'), { pos: [0, 2.75, -0.05], rot: [Math.PI / 2, 0, 0], segments: 12 }),
    cyl(0.3, 0.16, 0.28, mat('redPaint'), { pos: [0, 2.75, 0.3], rot: [Math.PI / 2, 0, 0], segments: 12 }),
    cyl(0.25, 0.25, 0.04, mat('iron'), { pos: [0, 2.75, 0.45], rot: [Math.PI / 2, 0, 0], segments: 12 }),
    box(0.22, 0.3, 0.16, mat('metalDark'), { pos: [0, 1.15, 0.1] }),
    box(0.04, 0.04, 0.3, mat('iron'), { pos: [0.13, 1.2, 0.2] }),
    box(0.06, 0.16, 0.06, mat('wood'), { pos: [0.13, 1.08, 0.34] }),
  );
  const lampMat = uniqueMat('veinGlow');
  g.add(box(0.14, 0.12, 0.14, lampMat, { pos: [0, 3.05, -0.05], shadow: false }));
  const lights: LightDesc[] = [{ pos: [0, 3.05, 0.1], color: '#ff2a1a', intensity: 12, distance: 10, style: 'pulse', emissive: lampMat }];
  g.userData.lights = lights;
  setColliders(g, [{ kind: 'circle', x: 0, z: 0, r: 0.3 }]);
  return g;
}

let barrierGeo: THREE.BufferGeometry | null = null;

export function buildBarrier(): THREE.Object3D {
  if (!barrierGeo) {
    const s = new THREE.Shape();
    const pts: [number, number][] = [
      [-0.32, 0],
      [0.32, 0],
      [0.32, 0.12],
      [0.12, 0.3],
      [0.1, 0.8],
      [-0.1, 0.8],
      [-0.12, 0.3],
      [-0.32, 0.12],
    ];
    s.moveTo(...pts[0]);
    for (const p of pts.slice(1)) s.lineTo(...p);
    s.closePath();
    barrierGeo = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false });
    barrierGeo.translate(0, 0, -1);
  }
  const g = group('barrier', mesh(barrierGeo, mat('concrete')));
  g.add(box(0.21, 0.12, 2.01, mat('hazardYellow'), { pos: [0, 0.68, 0] }));
  setColliders(g, [{ kind: 'box', x: 0, z: 0, hw: 0.33, hd: 1.0 }]);
  return g;
}
