import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { evaluateBuild, gunPart, type GunPartDef, type PlacedPart, type Rarity } from '../data/guns';
import type { LocalCollider } from '../physics/Collision';
import { box, cyl, group, sphere, torus } from './build';
import { mat, uniqueMat, type MaterialKey } from './materials';

const CELL = CONFIG.guns.cell;
const THICK = 0.055;

const BODY: Record<Rarity, MaterialKey> = {
  rusted: 'rust',
  standard: 'gunMetal',
  military: 'whiteMetal',
  prototype: 'copper',
  lab: 'toxicGlow',
};

const TRIM: Record<Rarity, MaterialKey> = {
  rusted: 'iron',
  standard: 'metalDark',
  military: 'metalDark',
  prototype: 'chip',
  lab: 'gunMetal',
};

function body(r: Rarity): THREE.MeshStandardMaterial {
  return mat(BODY[r]);
}
function trim(r: Rarity): THREE.MeshStandardMaterial {
  return mat(TRIM[r]);
}

/** Local part space: origin at the min corner, +X along the barrel, +Y up. */
function buildPartMesh(def: GunPartDef): THREE.Group {
  const w = def.w * CELL;
  const h = def.h * CELL;
  const cx = w / 2;
  const cy = h / 2;
  const r = def.rarity;
  const g = group(def.id);

  switch (def.category) {
    case 'receiver':
      g.add(
        box(w * 0.96, h * 0.72, THICK, body(r), { pos: [cx, cy * 0.95, 0] }),
        box(w * 0.55, h * 0.28, THICK * 0.8, trim(r), { pos: [cx * 0.7, h * 0.22, 0] }),
        box(w * 0.18, h * 0.2, THICK * 0.5, mat('iron'), { pos: [w * 0.22, h * 0.18, THICK * 0.25] }),
      );
      break;
    case 'barrel':
      g.add(cyl(h * 0.32, h * 0.28, w * 0.96, body(r), { pos: [cx, cy, 0], rot: [0, 0, Math.PI / 2], segments: 10 }));
      if (def.w >= 3) g.add(cyl(h * 0.38, h * 0.38, w * 0.12, trim(r), { pos: [w * 0.18, cy, 0], rot: [0, 0, Math.PI / 2], segments: 10 }));
      if (r === 'prototype' || r === 'lab') {
        const glow = uniqueMat('toxicGlow');
        g.add(cyl(h * 0.12, h * 0.12, w * 0.7, glow, { pos: [cx, cy, 0], rot: [0, 0, Math.PI / 2], segments: 8 }));
      }
      break;
    case 'grip':
      g.add(
        box(w * 0.7, h * 0.92, THICK * 0.85, mat('gunGrip'), { pos: [cx, cy, 0], rot: [0, 0, 0.18] }),
        box(w * 0.78, h * 0.16, THICK * 0.95, mat('tape'), { pos: [cx, h * 0.72, 0] }),
      );
      break;
    case 'handle':
      g.add(
        box(w * 0.7, h * 0.55, THICK * 0.7, r === 'military' ? mat('rubber') : mat('woodDark'), { pos: [cx, cy, 0] }),
        cyl(Math.min(w, h) * 0.22, Math.min(w, h) * 0.22, THICK * 0.9, trim(r), { pos: [cx, cy, 0], rot: [Math.PI / 2, 0, 0], segments: 8 }),
      );
      break;
    case 'stock':
      g.add(
        box(w * 0.92, h * 0.55, THICK * 0.9, r === 'military' ? mat('gunMetal') : mat('wood'), { pos: [cx, cy * 1.05, 0] }),
        box(w * 0.28, h * 0.85, THICK * 0.7, trim(r), { pos: [w * 0.18, cy, 0] }),
      );
      break;
    case 'trigger':
      g.add(
        box(w * 0.7, h * 0.35, THICK * 0.5, trim(r), { pos: [cx, h * 0.72, 0] }),
        box(w * 0.28, h * 0.45, THICK * 0.35, body(r), { pos: [cx, h * 0.35, 0], rot: [0, 0, 0.25] }),
      );
      break;
    case 'magazine':
      g.add(
        box(w * 0.78, h * 0.92, THICK * 0.8, body(r), { pos: [cx, cy, 0] }),
        box(w * 0.5, h * 0.08, THICK * 0.9, trim(r), { pos: [cx, h * 0.12, 0] }),
      );
      if (def.w >= 2) g.add(cyl(w * 0.32, w * 0.32, THICK * 0.7, trim(r), { pos: [cx, cy, 0], rot: [Math.PI / 2, 0, 0], segments: 12 }));
      break;
    case 'sight':
      if (r === 'military' || r === 'prototype' || r === 'lab') {
        const glass = uniqueMat(r === 'lab' ? 'toxicGlow' : 'lens');
        g.add(
          box(w * 0.7, h * 0.35, THICK * 0.7, trim(r), { pos: [cx, h * 0.22, 0] }),
          box(w * 0.55, h * 0.42, THICK * 0.55, body(r), { pos: [cx, h * 0.58, 0] }),
          cyl(h * 0.16, h * 0.16, THICK * 0.2, glass, { pos: [cx, h * 0.62, THICK * 0.2], rot: [Math.PI / 2, 0, 0], segments: 10 }),
        );
      } else {
        g.add(
          box(w * 0.55, h * 0.2, THICK * 0.4, trim(r), { pos: [cx, h * 0.18, 0] }),
          box(w * 0.12, h * 0.7, THICK * 0.25, body(r), { pos: [w * 0.3, h * 0.5, 0] }),
          box(w * 0.22, h * 0.12, THICK * 0.25, body(r), { pos: [w * 0.7, h * 0.72, 0] }),
        );
      }
      break;
    case 'muzzle':
      g.add(
        cyl(h * 0.38, h * 0.42, w * 0.7, body(r), { pos: [cx, cy, 0], rot: [0, 0, Math.PI / 2], segments: 10 }),
        cyl(h * 0.48, h * 0.48, w * 0.18, trim(r), { pos: [w * 0.78, cy, 0], rot: [0, 0, Math.PI / 2], segments: 10 }),
      );
      break;
    case 'underbarrel':
      g.add(box(w * 0.94, h * 0.35, THICK * 0.55, trim(r), { pos: [cx, h * 0.35, 0] }));
      if (def.id === 'laserModule') {
        const glow = uniqueMat('toxicGlow');
        g.add(cyl(h * 0.18, h * 0.18, w * 0.4, glow, { pos: [cx * 1.1, h * 0.55, 0], rot: [0, 0, Math.PI / 2], segments: 8 }));
      }
      break;
    case 'converter':
      g.add(
        box(w * 0.8, h * 0.7, THICK * 0.75, body(r), { pos: [cx, cy, 0] }),
        cyl(w * 0.18, w * 0.18, h * 0.35, trim(r), { pos: [cx, h * 0.75, 0], segments: 8 }),
      );
      if (def.id === 'slugConverter') g.add(box(w * 0.3, h * 0.2, THICK * 0.2, mat('hazardYellow'), { pos: [cx, cy, THICK * 0.4] }));
      break;
    default:
      g.add(box(w * 0.9, h * 0.9, THICK, body(r), { pos: [cx, cy, 0] }));
  }
  return g;
}

export function buildGunPart(id: string): THREE.Object3D {
  const def = gunPart(id);
  if (!def) return group(id);
  const mesh = buildPartMesh(def);
  // Inventory / hand items sit with the grip at the origin and the long axis along +Y.
  const w = def.w * CELL;
  const h = def.h * CELL;
  mesh.position.set(-w / 2, 0.04, -h / 2);
  const wrap = group(`item.${id}`);
  wrap.add(mesh);
  wrap.rotation.z = -Math.PI / 2;
  return wrap;
}

/**
 * Assembled gun in grid space: +X toward the muzzle, +Y up, origin at the
 * primary grip (or the receiver) so it can drop into a hand or a preview.
 */
export function assembleGun(parts: readonly PlacedPart[]): THREE.Group {
  const root = group('assembledGun');
  if (parts.length === 0) return root;

  let originX = 0;
  let originY = 0;
  const grip = parts.find((p) => gunPart(p.part)?.category === 'grip')
    ?? parts.find((p) => gunPart(p.part)?.category === 'handle')
    ?? parts.find((p) => gunPart(p.part)?.category === 'receiver');
  if (grip) {
    const d = gunPart(grip.part);
    if (d) {
      originX = (grip.x + d.w * 0.45) * CELL;
      originY = (grip.y + d.h * 0.35) * CELL;
    }
  }

  for (const p of parts) {
    const def = gunPart(p.part);
    if (!def) continue;
    const mesh = buildPartMesh(def);
    mesh.position.set(p.x * CELL - originX, p.y * CELL - originY, 0);
    root.add(mesh);
  }
  return root;
}

/** Same assembly, rotated so the barrel runs along +Y like every other held item. */
export function assembleGunHeld(parts: readonly PlacedPart[]): THREE.Group {
  const gun = assembleGun(parts);
  const wrap = group('heldGun');
  wrap.add(gun);
  wrap.rotation.z = -Math.PI / 2;
  wrap.rotation.x = 0.08;
  return wrap;
}

export function buildAmmoItem(): THREE.Object3D {
  return group(
    'ammo',
    box(0.22, 0.08, 0.14, mat('gunGrip'), { pos: [0, 0.04, 0] }),
    cyl(0.018, 0.018, 0.07, mat('copper'), { pos: [-0.06, 0.09, 0.02], segments: 8 }),
    cyl(0.018, 0.018, 0.07, mat('copper'), { pos: [0, 0.09, -0.02], segments: 8 }),
    cyl(0.018, 0.018, 0.07, mat('copper'), { pos: [0.06, 0.09, 0.03], segments: 8 }),
    cyl(0.02, 0.016, 0.02, mat('hazardYellow'), { pos: [-0.06, 0.125, 0.02], segments: 8 }),
    cyl(0.02, 0.016, 0.02, mat('hazardYellow'), { pos: [0, 0.125, -0.02], segments: 8 }),
    cyl(0.02, 0.016, 0.02, mat('hazardYellow'), { pos: [0.06, 0.125, 0.03], segments: 8 }),
  );
}

export function buildCraftedGunItem(): THREE.Object3D {
  return group(
    'craftedGun',
    box(0.08, 0.1, 0.28, mat('gunMetal'), { pos: [0, 0.12, 0] }),
    cyl(0.02, 0.02, 0.22, mat('iron'), { pos: [0, 0.14, 0.22], rot: [Math.PI / 2, 0, 0], segments: 8 }),
    box(0.06, 0.14, 0.06, mat('gunGrip'), { pos: [0, 0.02, -0.02], rot: [0.35, 0, 0] }),
  );
}

export function buildGunBench(): THREE.Object3D {
  const g = group('gunBench');
  g.add(box(1.45, 0.08, 0.72, mat('hazardYellow'), { pos: [0, 0.92, 0] }));
  for (const [x, z] of [
    [-0.62, -0.28],
    [0.62, -0.28],
    [-0.62, 0.28],
    [0.62, 0.28],
  ]) {
    g.add(box(0.08, 0.9, 0.08, mat('iron'), { pos: [x, 0.45, z] }));
  }
  g.add(box(1.35, 0.06, 0.62, mat('woodDark'), { pos: [0, 0.28, 0] }));
  g.add(box(1.45, 0.7, 0.05, mat('woodRot'), { pos: [0, 1.32, -0.34] }));

  const lamp = uniqueMat('bulbWarm');
  g.add(
    cyl(0.012, 0.012, 0.42, mat('iron'), { pos: [0.52, 1.2, -0.22], rot: [0, 0, 0.6] }),
    sphere(0.045, lamp, { pos: [0.38, 1.05, -0.12], shadow: false }),
  );

  g.add(
    box(0.7, 0.02, 0.32, mat('hazardYellow'), { pos: [-0.22, 0.965, 0.05] }),
    box(0.04, 0.04, 0.32, mat('iron'), { pos: [-0.54, 0.97, 0.05] }),
    box(0.04, 0.04, 0.32, mat('iron'), { pos: [0.1, 0.97, 0.05] }),
  );

  const vice = group(
    'vice',
    box(0.18, 0.07, 0.2, mat('iron'), { pos: [0, 0.04, 0] }),
    box(0.2, 0.1, 0.04, mat('whiteMetal'), { pos: [0, 0.12, -0.05] }),
    box(0.2, 0.1, 0.04, mat('whiteMetal'), { pos: [0, 0.12, 0.05] }),
    cyl(0.012, 0.012, 0.22, mat('metalDark'), { pos: [0, 0.11, 0.14], rot: [0, 0, Math.PI / 2] }),
  );
  vice.position.set(0.48, 0.96, 0.18);
  g.add(vice);

  g.add(
    box(0.22, 0.05, 0.07, mat('gunMetal'), { pos: [-0.15, 0.99, 0.12], rot: [0, 0.3, 0] }),
    cyl(0.015, 0.015, 0.16, mat('iron'), { pos: [0.02, 0.99, 0.06], rot: [Math.PI / 2, 0, 0.4], segments: 8 }),
    torus(0.04, 0.008, mat('copper'), { pos: [-0.48, 0.99, 0.18], rot: [Math.PI / 2, 0, 0] }),
  );

  g.userData.colliders = [{ kind: 'box', x: 0, z: 0, hw: 0.74, hd: 0.38 }] satisfies LocalCollider[];
  g.userData.lights = [{ pos: [0.38, 1.05, 0.05], color: '#ffb35a', intensity: 8, distance: 5.5, style: 'faulty', emissive: lamp }];
  return g;
}

export function gunNameFromParts(parts: readonly PlacedPart[]): string {
  const ev = evaluateBuild(parts);
  const n = ev.counts;
  if (ev.stats.projectiles >= 3) return 'SCATTERGUN';
  if (ev.stats.fireMode === 'auto') return 'RIPPER';
  if (n.barrel >= 2 && ev.stats.range > 22) return 'LONG RIFLE';
  if (ev.stats.range > 24) return 'LANCER';
  if (n.stock === 0 && ev.stats.weight < 5) return 'PIPE PISTOL';
  if (ev.stats.damage > 28) return 'BRICK';
  return 'PIPE GUN';
}
