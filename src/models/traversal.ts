import * as THREE from 'three';
import { CONFIG } from '../data/config';
import type { Rng } from '../core/random';
import { box, cyl, group } from './build';
import { mat, type MaterialKey } from './materials';

/**
 * A plank footbridge along local X, deck top at y = 0. Plank skirts drop into the river so the
 * built-up bank under the deck reads as part of the crossing.
 */
export function buildFootbridge(rng: Rng, length: number): THREE.Object3D {
  const g = group('footbridge');
  const half = length / 2;
  const woods: MaterialKey[] = ['wood', 'woodLight', 'woodRot', 'woodDark'];
  for (let x = -half + 0.16; x < half; x += 0.32) {
    if (rng.chance(0.04)) continue;
    g.add(box(0.28, 0.07, 2.5, mat(rng.pick(woods)), { pos: [x, -0.035, rng.range(-0.06, 0.06)], rot: [0, rng.range(-0.04, 0.04), 0] }));
  }
  for (const z of [-1.08, 1.08]) {
    g.add(box(length, 0.22, 0.16, mat('woodDark'), { pos: [0, -0.18, z] }));
    g.add(box(length, 1.5, 0.08, mat('woodRot'), { pos: [0, -0.85, z * 1.26] }));
    g.add(box(length, 0.07, 0.07, mat('wood'), { pos: [0, 1.0, z * 1.1] }));
    for (let x = -half + 0.2; x <= half - 0.2 + 1e-3; x += (length - 0.4) / Math.round(length / 2.2)) {
      g.add(box(0.09, 1.04, 0.09, mat('woodDark'), { pos: [x, 0.5, z * 1.1], rot: [0, 0, rng.range(-0.05, 0.05)] }));
      g.add(box(0.16, 2, 0.16, mat('woodDark'), { pos: [x, -1, z * 1.2] }));
    }
  }
  g.userData.noSeat = true;
  return g;
}

/** Parapets, side girders and abutments where the road crosses a river. The asphalt runs on top. */
export function buildRoadBridge(rng: Rng, length: number): THREE.Object3D {
  const g = group('roadBridge');
  const half = length / 2;
  const side = CONFIG.world.roadWidth / 2 + 0.22;
  for (const z of [-side, side]) {
    g.add(box(length, 0.7, 0.34, mat('concrete'), { pos: [0, 0.33, z] }));
    g.add(box(length, 0.06, 0.38, mat('hazardYellow'), { pos: [0, 0.7, z] }));
    g.add(box(length, 2, 0.5, mat('concreteDark'), { pos: [0, -1, z] }));
    for (let x = -half + 2; x < half - 1; x += rng.range(2.5, 4.5)) {
      if (rng.chance(0.5)) g.add(cyl(0.02, 0.02, rng.range(0.4, 0.9), mat('rust'), { pos: [x, 0.85, z], rot: [rng.range(-0.5, 0.5), 0, rng.range(-0.5, 0.5)], segments: 4 }));
    }
  }
  for (const x of [-half, half]) g.add(box(1.2, 2.4, side * 2 + 0.6, mat('concreteDark'), { pos: [x, -1.2, 0] }));
  g.userData.noSeat = true;
  return g;
}
