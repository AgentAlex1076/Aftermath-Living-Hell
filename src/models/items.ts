import type * as THREE from 'three';
import { box, cyl, group, rock, sphere, torus } from './build';
import { mat } from './materials';

/**
 * Item models are authored around the grip point at the origin, with the handle along +Y,
 * so the same model works for inventory icons and for holding in the player's hand.
 */
export const ITEM_MODELS: Record<string, () => THREE.Object3D> = {
  'item.wood': () =>
    group(
      'wood',
      cyl(0.07, 0.07, 0.5, mat('deadWood'), { pos: [0, 0.07, -0.08], rot: [0, 0, Math.PI / 2], segments: 7 }),
      cyl(0.065, 0.065, 0.46, mat('wood'), { pos: [0.03, 0.07, 0.08], rot: [0, 0, Math.PI / 2], segments: 7 }),
      cyl(0.06, 0.06, 0.48, mat('woodDark'), { pos: [-0.02, 0.19, 0], rot: [0, 0.15, Math.PI / 2], segments: 7 }),
    ),
  'item.stone': () =>
    group(
      'stone',
      rock(0.16, mat('rock'), { pos: [-0.05, 0.12, 0], rot: [0.4, 0.3, 0.2], scale: [1, 0.8, 1] }),
      rock(0.11, mat('rockDark'), { pos: [0.14, 0.08, 0.06], rot: [0.9, 0.1, 0.5] }),
    ),
  'item.scrap': () =>
    group(
      'scrap',
      box(0.36, 0.025, 0.24, mat('rust'), { pos: [0, 0.05, 0], rot: [0.1, 0.3, 0.15] }),
      box(0.26, 0.025, 0.2, mat('corrugated'), { pos: [0.04, 0.11, 0.02], rot: [-0.3, -0.4, 0.1] }),
      cyl(0.025, 0.025, 0.06, mat('iron'), { pos: [-0.08, 0.16, 0.05], segments: 6 }),
      torus(0.05, 0.015, mat('metalDark'), { pos: [0.12, 0.18, -0.05], rot: [1.2, 0, 0] }),
    ),
  'item.cloth': () =>
    group(
      'cloth',
      cyl(0.09, 0.09, 0.32, mat('cloth'), { pos: [0, 0.09, 0], rot: [0, 0, Math.PI / 2], segments: 10 }),
      box(0.2, 0.012, 0.22, mat('clothStain'), { pos: [0.18, 0.02, 0.05], rot: [0, 0.3, 0] }),
      torus(0.092, 0.012, mat('tape'), { pos: [-0.06, 0.09, 0], rot: [0, Math.PI / 2, 0] }),
    ),
  'item.chemicals': () =>
    group(
      'chemicals',
      cyl(0.1, 0.1, 0.26, mat('glass'), { pos: [0, 0.13, 0], segments: 12 }),
      cyl(0.085, 0.085, 0.17, mat('toxicGlow'), { pos: [0, 0.1, 0], segments: 12 }),
      cyl(0.08, 0.08, 0.04, mat('tin'), { pos: [0, 0.28, 0], segments: 12 }),
    ),
  'item.electronics': () =>
    group(
      'electronics',
      box(0.32, 0.02, 0.22, mat('greenBoard'), { pos: [0, 0.02, 0] }),
      box(0.08, 0.025, 0.08, mat('chip'), { pos: [-0.07, 0.045, 0.02] }),
      box(0.05, 0.02, 0.1, mat('chip'), { pos: [0.08, 0.04, -0.03] }),
      cyl(0.02, 0.02, 0.05, mat('whiteMetal'), { pos: [0.1, 0.06, 0.07], segments: 8 }),
      torus(0.06, 0.008, mat('copper'), { pos: [-0.12, 0.05, -0.07], rot: [Math.PI / 2, 0, 0] }),
    ),
  'item.gunpowder': () =>
    group(
      'gunpowder',
      sphere(0.15, mat('sack'), { pos: [0, 0.13, 0], scale: [1, 0.9, 1], wSeg: 10, hSeg: 8 }),
      cyl(0.05, 0.08, 0.09, mat('sack'), { pos: [0, 0.27, 0], segments: 8 }),
      torus(0.05, 0.012, mat('rubber'), { pos: [0, 0.27, 0], rot: [Math.PI / 2, 0, 0] }),
      cyl(0.12, 0.12, 0.01, mat('powder'), { pos: [0.14, 0.005, 0.08], segments: 10 }),
    ),
  'item.cannedBeans': () =>
    group(
      'cannedBeans',
      cyl(0.09, 0.09, 0.22, mat('tin'), { pos: [0, 0.11, 0], segments: 14 }),
      cyl(0.092, 0.092, 0.14, mat('canLabel'), { pos: [0, 0.11, 0], segments: 14 }),
    ),
  'item.mutantMeat': () =>
    group(
      'mutantMeat',
      sphere(0.13, mat('meat'), { pos: [0, 0.1, 0], scale: [1.2, 0.7, 1], wSeg: 10, hSeg: 8 }),
      sphere(0.07, mat('meatFat'), { pos: [0.08, 0.15, 0.04], wSeg: 8, hSeg: 6 }),
      sphere(0.05, mat('toxicGlow'), { pos: [-0.08, 0.15, -0.03], wSeg: 8, hSeg: 6 }),
      cyl(0.025, 0.025, 0.2, mat('bandage'), { pos: [-0.16, 0.08, 0], rot: [0, 0, Math.PI / 2], segments: 6 }),
    ),
  'item.gasFilter': () =>
    group(
      'gasFilter',
      cyl(0.1, 0.1, 0.16, mat('filter'), { pos: [0, 0.1, 0], segments: 14 }),
      cyl(0.105, 0.105, 0.03, mat('hazardYellow'), { pos: [0, 0.1, 0], segments: 14 }),
      cyl(0.05, 0.06, 0.06, mat('rubber'), { pos: [0, 0.2, 0], segments: 12 }),
      torus(0.1, 0.012, mat('rubber'), { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] }),
    ),
  'item.bandage': () =>
    group(
      'bandage',
      cyl(0.08, 0.08, 0.12, mat('bandage'), { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], segments: 14 }),
      box(0.22, 0.008, 0.11, mat('bandage'), { pos: [0.14, 0.005, 0] }),
      box(0.04, 0.009, 0.04, mat('redPaint'), { pos: [0.18, 0.01, 0] }),
    ),
  'item.rustyHatchet': () =>
    group(
      'rustyHatchet',
      cyl(0.022, 0.026, 0.6, mat('woodDark'), { pos: [0, 0.2, 0], segments: 8 }),
      box(0.05, 0.11, 0.035, mat('tape'), { pos: [0, -0.02, 0] }),
      box(0.16, 0.1, 0.04, mat('rust'), { pos: [0.06, 0.45, 0] }),
      box(0.05, 0.15, 0.025, mat('iron'), { pos: [0.15, 0.45, 0] }),
    ),
  'item.rustyPickaxe': () =>
    group(
      'rustyPickaxe',
      cyl(0.024, 0.028, 0.66, mat('wood'), { pos: [0, 0.22, 0], segments: 8 }),
      box(0.05, 0.11, 0.035, mat('tape'), { pos: [0, -0.02, 0] }),
      box(0.07, 0.07, 0.07, mat('iron'), { pos: [0, 0.52, 0] }),
      box(0.22, 0.04, 0.04, mat('rust'), { pos: [0.12, 0.5, 0], rot: [0, 0, -0.25] }),
      box(0.22, 0.04, 0.04, mat('rust'), { pos: [-0.12, 0.5, 0], rot: [0, 0, 0.25] }),
    ),
  'item.charcoal': () =>
    group(
      'charcoal',
      rock(0.09, mat('char'), { pos: [-0.06, 0.06, 0], rot: [0.4, 0.2, 0.7], scale: [1.4, 0.8, 1] }),
      rock(0.07, mat('char'), { pos: [0.08, 0.05, 0.05], rot: [1.1, 0.5, 0.2] }),
      rock(0.06, mat('ash'), { pos: [0.02, 0.12, -0.04], rot: [0.2, 1.4, 0.9] }),
      rock(0.035, mat('ember'), { pos: [-0.04, 0.12, 0.06], rot: [0.5, 0.5, 0.5] }),
      rock(0.03, mat('ember'), { pos: [0.1, 0.09, 0.07], rot: [0.9, 0.2, 0.5] }),
    ),
  'item.metalPlate': () =>
    group(
      'metalPlate',
      box(0.34, 0.03, 0.24, mat('whiteMetal'), { pos: [0, 0.015, 0] }),
      box(0.32, 0.03, 0.22, mat('tin'), { pos: [0.02, 0.048, 0.01], rot: [0, 0.12, 0] }),
      box(0.3, 0.03, 0.2, mat('whiteMetal'), { pos: [-0.01, 0.081, -0.01], rot: [0, -0.08, 0] }),
      cyl(0.015, 0.015, 0.01, mat('iron'), { pos: [0.12, 0.1, 0.07], segments: 6 }),
      cyl(0.015, 0.015, 0.01, mat('iron'), { pos: [-0.12, 0.1, -0.07], segments: 6 }),
    ),
  'item.cookedMeat': () =>
    group(
      'cookedMeat',
      sphere(0.13, mat('cooked'), { pos: [0, 0.09, 0], scale: [1.25, 0.65, 1], wSeg: 10, hSeg: 8 }),
      box(0.18, 0.012, 0.02, mat('char'), { pos: [0.02, 0.15, 0.03], rot: [0, 0.6, 0] }),
      box(0.16, 0.012, 0.02, mat('char'), { pos: [-0.03, 0.15, -0.03], rot: [0, 0.6, 0] }),
      cyl(0.025, 0.025, 0.2, mat('bone'), { pos: [-0.17, 0.08, 0], rot: [0, 0, Math.PI / 2], segments: 6 }),
      sphere(0.035, mat('bone'), { pos: [-0.27, 0.08, 0], wSeg: 6, hSeg: 5 }),
    ),
  'item.medkit': () =>
    group(
      'medkit',
      box(0.32, 0.16, 0.22, mat('whiteMetal'), { pos: [0, 0.08, 0] }),
      box(0.33, 0.02, 0.23, mat('metalDark'), { pos: [0, 0.12, 0] }),
      box(0.12, 0.035, 0.012, mat('redPaint'), { pos: [0, 0.07, 0.112] }),
      box(0.035, 0.12, 0.012, mat('redPaint'), { pos: [0, 0.07, 0.112] }),
      torus(0.05, 0.012, mat('rubber'), { pos: [0, 0.17, 0], arc: Math.PI }),
    ),
  'item.salvagedAxe': () =>
    group(
      'salvagedAxe',
      cyl(0.024, 0.026, 0.66, mat('iron'), { pos: [0, 0.22, 0], segments: 8 }),
      box(0.055, 0.14, 0.04, mat('tape'), { pos: [0, -0.02, 0] }),
      box(0.12, 0.12, 0.05, mat('metalDark'), { pos: [0.05, 0.5, 0] }),
      box(0.13, 0.22, 0.025, mat('whiteMetal'), { pos: [0.16, 0.5, 0] }),
      cyl(0.012, 0.012, 0.06, mat('copper'), { pos: [0.05, 0.53, 0], rot: [Math.PI / 2, 0, 0], segments: 6 }),
    ),
  'item.salvagedPickaxe': () =>
    group(
      'salvagedPickaxe',
      cyl(0.026, 0.028, 0.72, mat('iron'), { pos: [0, 0.24, 0], segments: 8 }),
      box(0.055, 0.14, 0.04, mat('tape'), { pos: [0, -0.02, 0] }),
      box(0.09, 0.09, 0.08, mat('metalDark'), { pos: [0, 0.57, 0] }),
      box(0.28, 0.05, 0.05, mat('whiteMetal'), { pos: [0.15, 0.55, 0], rot: [0, 0, -0.28] }),
      box(0.28, 0.05, 0.05, mat('whiteMetal'), { pos: [-0.15, 0.55, 0], rot: [0, 0, 0.28] }),
    ),
  'item.hammer': () =>
    group(
      'hammer',
      cyl(0.022, 0.026, 0.5, mat('woodLight'), { pos: [0, 0.16, 0], segments: 8 }),
      box(0.05, 0.13, 0.04, mat('tape'), { pos: [0, -0.03, 0] }),
      box(0.06, 0.08, 0.06, mat('iron'), { pos: [0, 0.42, 0] }),
      cyl(0.036, 0.036, 0.1, mat('whiteMetal'), { pos: [0.09, 0.42, 0], rot: [0, 0, Math.PI / 2], segments: 10 }),
      box(0.13, 0.03, 0.035, mat('iron'), { pos: [-0.08, 0.45, 0], rot: [0, 0, -0.45] }),
      box(0.012, 0.03, 0.03, mat('hazardYellow'), { pos: [0, 0.3, 0.02] }),
    ),
  'item.crowbar': () =>
    group(
      'crowbar',
      cyl(0.018, 0.018, 0.7, mat('redPaint'), { pos: [0, 0.23, 0], segments: 8 }),
      torus(0.06, 0.018, mat('redPaint'), { pos: [0.06, 0.58, 0], arc: Math.PI }),
      box(0.03, 0.06, 0.02, mat('iron'), { pos: [0.12, 0.55, 0] }),
      box(0.05, 0.02, 0.025, mat('iron'), { pos: [0.02, -0.12, 0], rot: [0, 0, 0.4] }),
    ),
};

export { buildAmmoItem, buildCraftedGunItem } from './guns';
