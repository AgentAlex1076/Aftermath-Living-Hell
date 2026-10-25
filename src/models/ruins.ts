import type * as THREE from 'three';
import type { Rng } from '../core/random';
import type { LocalCollider } from '../physics/Collision';
import type { LightDesc } from '../render/LightPool';
import { box, cyl, group, rock } from './build';
import { mat, uniqueMat, type MaterialKey } from './materials';

/** Container placement inside a structure, in the structure's local space. */
export interface ContainerSlot {
  type: 'crate' | 'cabinet' | 'toolbox' | 'labLocker';
  x: number;
  z: number;
  rot: number;
}

interface Gap {
  from: number;
  to: number;
}

const COLUMN = 0.5;
const q = (v: number, step = 0.1) => Math.max(step, Math.round(v / step) * step);

/**
 * A broken wall along local +X made of columns with a jagged, random-walk top edge.
 * Returns the solid spans so colliders can follow the actual gaps.
 */
function brokenWall(
  rng: Rng,
  name: string,
  length: number,
  gaps: Gap[],
  mats: MaterialKey[],
  minH: number,
  maxH: number,
  thickness: number,
  stripe?: MaterialKey,
): { group: THREE.Group; spans: Gap[] } {
  const g = group(name);
  const spans: Gap[] = [];
  const count = Math.round(length / COLUMN);
  let h = rng.range(minH, maxH);
  let spanStart: number | null = null;
  for (let i = 0; i < count; i++) {
    const x0 = -length / 2 + i * COLUMN;
    const x = x0 + COLUMN / 2;
    const inGap = gaps.some((gp) => x > gp.from && x < gp.to);
    h += rng.range(-0.45, 0.45);
    if (rng.chance(0.08)) h = minH * 0.5;
    h = Math.min(maxH, Math.max(minH * 0.5, h));
    const solid = !inGap && h > 0.35;
    if (solid) {
      const hq = q(h);
      g.add(box(COLUMN * 1.01, hq, thickness, mat(rng.pick(mats)), { pos: [x, hq / 2, 0] }));
      if (stripe && hq > 1.2) g.add(box(COLUMN * 1.01, 0.18, thickness + 0.04, mat(stripe), { pos: [x, 1.0, 0] }));
      if (spanStart === null) spanStart = x0;
    } else if (spanStart !== null) {
      spans.push({ from: spanStart, to: x0 });
      spanStart = null;
    }
  }
  if (spanStart !== null) spans.push({ from: spanStart, to: length / 2 });
  return { group: g, spans };
}

interface WallPlacement {
  x: number;
  z: number;
  rot: number;
}

function spanColliders(spans: Gap[], p: WallPlacement, thickness: number): LocalCollider[] {
  const cos = Math.cos(p.rot);
  const sin = Math.sin(p.rot);
  return spans.map((s) => {
    const c = (s.from + s.to) / 2;
    const half = (s.to - s.from) / 2;
    const alongX = Math.abs(cos) > 0.5;
    return {
      kind: 'box' as const,
      x: p.x + c * cos,
      z: p.z - c * sin,
      hw: alongX ? half : thickness / 2 + 0.03,
      hd: alongX ? thickness / 2 + 0.03 : half,
    };
  });
}

interface RuinSpec {
  name: string;
  width: number;
  depth: number;
  minH: number;
  maxH: number;
  thickness: number;
  wallMats: MaterialKey[];
  floorMat: MaterialKey;
  doorX: number;
  doorWidth: number;
  stripe?: MaterialKey;
}

function buildShell(rng: Rng, spec: RuinSpec): { root: THREE.Group; colliders: LocalCollider[] } {
  const { width: W, depth: D, thickness: T } = spec;
  const root = group(spec.name);
  root.add(box(W, 0.08, D, mat(spec.floorMat), { pos: [0, 0.02, 0], shadow: false }));

  const walls: { name: string; length: number; gaps: Gap[]; place: WallPlacement }[] = [
    { name: 'wallS', length: W, gaps: [{ from: spec.doorX - spec.doorWidth / 2, to: spec.doorX + spec.doorWidth / 2 }], place: { x: 0, z: D / 2, rot: 0 } },
    { name: 'wallN', length: W, gaps: [], place: { x: 0, z: -D / 2, rot: Math.PI } },
    { name: 'wallE', length: D, gaps: [{ from: -0.8, to: 0.6 }], place: { x: W / 2, z: 0, rot: Math.PI / 2 } },
    { name: 'wallW', length: D, gaps: [], place: { x: -W / 2, z: 0, rot: -Math.PI / 2 } },
  ];

  const colliders: LocalCollider[] = [];
  const occluders: string[] = [];
  for (const w of walls) {
    const { group: g, spans } = brokenWall(rng, w.name, w.length, w.gaps, spec.wallMats, spec.minH, spec.maxH, T, spec.stripe);
    g.position.set(w.place.x, 0, w.place.z);
    g.rotation.y = w.place.rot;
    root.add(g);
    occluders.push(w.name);
    colliders.push(...spanColliders(spans, w.place, T));
  }
  root.userData.occluders = occluders;

  for (let i = 0; i < rng.int(3, 6); i++) {
    const r = q(rng.range(0.2, 0.5));
    root.add(
      rock(r, mat(rng.pick<MaterialKey>(['concrete', 'concreteDark', 'brick'])), {
        pos: [rng.range(-W / 2 + 0.8, W / 2 - 0.8), r * 0.3, rng.range(-D / 2 + 0.8, D / 2 - 0.8)],
        rot: [rng.range(0, 3), rng.range(0, 3), rng.range(0, 3)],
        scale: [1, 0.5, 1],
      }),
    );
  }
  return { root, colliders };
}

export function buildRuinHouse(rng: Rng): THREE.Object3D {
  const W = 7;
  const D = 6;
  const { root, colliders } = buildShell(rng, {
    name: 'ruinHouse',
    width: W,
    depth: D,
    minH: 0.8,
    maxH: 2.7,
    thickness: 0.25,
    wallMats: ['brick', 'brick', 'plaster', 'concreteDark'],
    floorMat: 'tile',
    doorX: rng.range(-1.5, 1.5),
    doorWidth: 1.4,
  });

  root.add(
    box(W * 0.8, 0.18, 0.2, mat('woodDark'), { pos: [rng.range(-0.5, 0.5), 1.0, rng.range(-1, 1)], rot: [0, rng.range(-0.4, 0.4), 0.28] }),
  );
  if (rng.chance(0.7)) {
    root.add(box(1.2, 0.5, 0.6, mat('woodRot'), { pos: [-W / 2 + 1.0, 0.25, -D / 2 + 0.6], rot: [0, 0.1, 0] }));
    colliders.push({ kind: 'box', x: -W / 2 + 1.0, z: -D / 2 + 0.6, hw: 0.62, hd: 0.34 });
  }

  const slots: ContainerSlot[] = [{ type: rng.chance(0.5) ? 'cabinet' : 'crate', x: W / 2 - 0.7, z: -D / 2 + 0.6, rot: 0 }];
  if (rng.chance(0.65)) slots.push({ type: rng.chance(0.6) ? 'toolbox' : 'crate', x: -W / 2 + 0.8, z: D / 2 - 1.0, rot: rng.range(-0.4, 0.4) });

  root.userData.colliders = colliders;
  root.userData.containers = slots;
  root.userData.minimap = { kind: 'ruin', w: W, d: D };
  return root;
}

export function buildLabRuin(rng: Rng): THREE.Object3D {
  const W = 10;
  const D = 8;
  const { root, colliders } = buildShell(rng, {
    name: 'labRuin',
    width: W,
    depth: D,
    minH: 1.4,
    maxH: 3.2,
    thickness: 0.32,
    wallMats: ['concrete', 'concrete', 'concreteDark'],
    floorMat: 'tile',
    doorX: rng.range(-2, 2),
    doorWidth: 2.0,
    stripe: 'hazardYellow',
  });

  const signX = -W / 2 + 1.5;
  const signZ = D / 2 + 0.9;
  root.add(
    cyl(0.04, 0.04, 1.6, mat('metalDark'), { pos: [signX, 0.8, signZ - 0.05], segments: 6 }),
    box(0.75, 0.75, 0.05, mat('hazardYellow'), { pos: [signX, 1.55, signZ], rot: [0, 0, Math.PI / 4] }),
    box(0.22, 0.22, 0.06, mat('rubber'), { pos: [signX, 1.55, signZ + 0.01] }),
  );
  colliders.push({ kind: 'circle', x: signX, z: signZ, r: 0.12 });

  for (const [x, z] of [
    [-2.2, -1.2],
    [1.6, 0.4],
  ]) {
    root.add(
      box(2.2, 0.08, 0.9, mat('whiteMetal'), { pos: [x, 0.92, z] }),
      box(2.0, 0.85, 0.08, mat('metalDark'), { pos: [x, 0.45, z - 0.38] }),
      cyl(0.06, 0.06, 0.22, mat('glass'), { pos: [x - 0.5, 1.07, z + 0.1], segments: 10 }),
      cyl(0.045, 0.045, 0.16, uniqueMat('toxicGlow'), { pos: [x + 0.4, 1.04, z], segments: 10, shadow: false }),
    );
    colliders.push({ kind: 'box', x, z, hw: 1.12, hd: 0.48 });
  }
  for (let i = 0; i < 6; i++) {
    root.add(box(q(rng.range(0.1, 0.3), 0.05), 0.01, q(rng.range(0.1, 0.25), 0.05), mat('glass'), { pos: [rng.range(-W / 2 + 1, W / 2 - 1), 0.07, rng.range(-D / 2 + 1, D / 2 - 1)], rot: [0, rng.range(0, 3), 0], shadow: false }));
  }

  const alarmMat = uniqueMat('ember');
  alarmMat.color.set('#ff2a1a');
  alarmMat.emissive.set('#ff1a0a');
  root.add(box(0.2, 0.12, 0.12, alarmMat, { pos: [W / 2 - 0.5, 2.4, -D / 2 + 0.3], shadow: false }));
  const lights: LightDesc[] = [{ pos: [W / 2 - 0.6, 2.2, -D / 2 + 0.7], color: '#ff2a1a', intensity: 10, distance: 9, style: 'pulse', emissive: alarmMat }];
  root.userData.lights = lights;

  const slots: ContainerSlot[] = [
    { type: 'labLocker', x: -W / 2 + 0.6, z: -D / 2 + 0.6, rot: 0 },
    { type: 'labLocker', x: -W / 2 + 1.35, z: -D / 2 + 0.6, rot: 0 },
    { type: 'cabinet', x: W / 2 - 0.6, z: 1.6, rot: -Math.PI / 2 },
  ];
  root.userData.colliders = colliders;
  root.userData.containers = slots;
  root.userData.gasRadius = 11;
  root.userData.minimap = { kind: 'lab', w: W, d: D };
  return root;
}
