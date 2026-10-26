import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { createNoise2D, fbm } from '../core/noise';
import { smoothstep } from '../core/math';
import type { District, Regions } from './Regions';

export type BiomeId = 'deadwood' | 'suburb' | 'industrial' | 'toxic';

export interface BiomeSample {
  biome: BiomeId;
  /** 0 at the hut, 1 (100%) at `threatFull`, and keeps rising past it. Scales loot, density and (later) enemies. */
  danger: number;
  /** 0..1 strength of the toxic field at this point (gas lives where this is high). */
  toxicity: number;
  district: District;
}

export const BIOME_LABEL: Record<BiomeId, string> = {
  deadwood: 'Deadwood',
  suburb: 'Ruined Suburb',
  industrial: 'Industrial Wastes',
  toxic: 'Toxic Marsh',
};

const COLORS = {
  mud: new THREE.Color('#4a453c'),
  deadGrass: new THREE.Color('#5e5940'),
  darkDirt: new THREE.Color('#38332b'),
  ash: new THREE.Color('#62625c'),
  concrete: new THREE.Color('#57564f'),
  oil: new THREE.Color('#2f2e2b'),
  toxic: new THREE.Color('#4f6a1f'),
  toxicDeep: new THREE.Color('#3c5a14'),
};

/** How industrial (+) or wild (−) the ground of each district looks. */
const GRIT: Record<District, number> = { home: -0.12, town: 0.03, industrial: 0.3, farm: -0.06, wilds: -0.3, marsh: 0 };
/** How readily each district turns toxic: a lower threshold on the toxic noise. */
const TAINT: Record<District, number> = { home: -0.1, town: -0.35, industrial: 0.12, farm: -0.3, wilds: 0.02, marsh: 0.5 };
const MIX = [[22, 0], [-22, 0], [0, 22], [0, -22]] as const;

/**
 * Deterministic biome / danger / toxicity for a run seed. The four biomes follow the region
 * districts (towns are suburb, industrial districts industrial, wilds deadwood, marshes toxic),
 * blended across district borders so ground colours never seam.
 */
export class Biomes {
  private readonly toxicField: ReturnType<typeof createNoise2D>;
  private readonly detail: ReturnType<typeof createNoise2D>;
  private readonly patches: ReturnType<typeof createNoise2D>;
  private readonly pocket: ReturnType<typeof createNoise2D>;

  constructor(seed: number, private readonly regions: Regions) {
    this.toxicField = createNoise2D(seed + 2002);
    this.detail = createNoise2D(seed + 3003);
    this.patches = createNoise2D(seed + 4004);
    this.pocket = createNoise2D(seed + 1001);
  }

  danger(x: number, z: number): number {
    const { threatFull, threatPerMetre } = CONFIG.world;
    const d = Math.hypot(x, z);
    return smoothstep(25, threatFull, d) + Math.max(0, d - threatFull) * threatPerMetre;
  }

  /** District grit and taint averaged over a few nearby points, so they blend over ~40 m. */
  private mix(x: number, z: number): { grit: number; taint: number } {
    let grit = 0;
    let taint = 0;
    for (const [dx, dz] of MIX) {
      const d = this.regions.districtAt(x + dx, z + dz).district;
      grit += GRIT[d];
      taint += TAINT[d];
    }
    return { grit: grit / MIX.length, taint: taint / MIX.length };
  }

  toxicity(x: number, z: number): number {
    const d = Math.hypot(x, z);
    if (d < 45) return 0;
    const t = fbm(this.toxicField, x * 0.009, z * 0.009, 3);
    const threshold = 0.36 - Math.min(1, this.danger(x, z)) * 0.1 - this.mix(x, z).taint;
    return smoothstep(threshold, threshold + 0.14, t) * smoothstep(45, 70, d);
  }

  sample(x: number, z: number): BiomeSample {
    const danger = this.danger(x, z);
    const toxicity = this.toxicity(x, z);
    const district = this.regions.districtAt(x, z).district;
    let biome: BiomeId;
    if (toxicity > 0.45) biome = 'toxic';
    else if (district === 'industrial') biome = 'industrial';
    else if (district === 'town' || district === 'farm') biome = 'suburb';
    else if (district === 'home') biome = fbm(this.pocket, x * 0.0065, z * 0.0065, 3) > 0.05 ? 'suburb' : 'deadwood';
    else biome = 'deadwood';
    return { biome, danger, toxicity, district };
  }

  groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
    const r = this.mix(x, z).grit + fbm(this.pocket, x * 0.0065, z * 0.0065, 3) * 0.12;
    const n = fbm(this.detail, x * 0.05, z * 0.05, 3);
    const p = fbm(this.patches, x * 0.02, z * 0.02, 2);

    out.copy(COLORS.mud).lerp(COLORS.deadGrass, smoothstep(-0.2, 0.35, p));
    out.lerp(COLORS.darkDirt, smoothstep(0.1, 0.6, n) * 0.6);
    out.lerp(COLORS.ash, smoothstep(0.3, 0.7, -n) * 0.4);
    // Deadwood: darker, leafless forest floor. Industrial: concrete and oil stains.
    out.lerp(COLORS.darkDirt, smoothstep(-0.1, -0.35, r) * 0.25);
    const ind = smoothstep(0.0, 0.18, r);
    out.lerp(COLORS.concrete, ind * smoothstep(-0.3, 0.2, p) * 0.75);
    out.lerp(COLORS.oil, ind * smoothstep(0.35, 0.6, n) * 0.6);

    const t = this.toxicity(x, z);
    out.lerp(COLORS.toxic, smoothstep(0.1, 0.5, t) * 0.8);
    out.lerp(COLORS.toxicDeep, smoothstep(0.6, 0.95, t) * 0.6);
    return out;
  }
}
