import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { createNoise2D, fbm } from '../core/noise';
import { smoothstep } from '../core/math';

export type BiomeId = 'deadwood' | 'suburb' | 'industrial' | 'toxic';

export interface BiomeSample {
  biome: BiomeId;
  /** 0 at the hut, 1 at the edge of the world. Scales loot, density and (later) enemies. */
  danger: number;
  /** 0..1 strength of the toxic field at this point (gas lives where this is high). */
  toxicity: number;
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
  edge: new THREE.Color('#2a2c27'),
};

/** Deterministic biome / danger / toxicity fields for a run seed. */
export class Biomes {
  private readonly region: ReturnType<typeof createNoise2D>;
  private readonly toxicField: ReturnType<typeof createNoise2D>;
  private readonly detail: ReturnType<typeof createNoise2D>;
  private readonly patches: ReturnType<typeof createNoise2D>;

  constructor(seed: number) {
    this.region = createNoise2D(seed + 1001);
    this.toxicField = createNoise2D(seed + 2002);
    this.detail = createNoise2D(seed + 3003);
    this.patches = createNoise2D(seed + 4004);
  }

  danger(x: number, z: number): number {
    return smoothstep(25, CONFIG.world.halfSize * 0.95, Math.hypot(x, z));
  }

  /** Raw region value: negative leans deadwood, positive leans industrial. */
  private regionValue(x: number, z: number): number {
    return fbm(this.region, x * 0.0065, z * 0.0065, 3);
  }

  toxicity(x: number, z: number): number {
    const d = Math.hypot(x, z);
    if (d < 45) return 0;
    const t = fbm(this.toxicField, x * 0.009, z * 0.009, 3);
    const threshold = 0.31 - this.danger(x, z) * 0.16;
    return smoothstep(threshold, threshold + 0.14, t) * smoothstep(45, 70, d);
  }

  sample(x: number, z: number): BiomeSample {
    const danger = this.danger(x, z);
    const toxicity = this.toxicity(x, z);
    let biome: BiomeId;
    if (toxicity > 0.45) biome = 'toxic';
    else {
      const r = this.regionValue(x, z);
      biome = r > 0.07 ? 'industrial' : r < -0.15 ? 'deadwood' : 'suburb';
    }
    return { biome, danger, toxicity };
  }

  groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
    const r = this.regionValue(x, z);
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

    const edge = Math.max(Math.abs(x), Math.abs(z)) - CONFIG.world.halfSize;
    out.lerp(COLORS.edge, smoothstep(-14, 6, edge));
    return out;
  }
}
