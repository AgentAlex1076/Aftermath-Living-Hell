import { CONFIG } from '../data/config';
import type { ContainerId } from '../data/loot';
import type { NodeId } from '../data/nodes';
import { Rng } from '../core/random';
import type { BiomeId, Biomes } from './Biomes';

export type Spawn =
  | { kind: 'node'; uid: string; node: NodeId; x: number; z: number; rot: number; seed: number }
  | { kind: 'container'; uid: string; container: ContainerId; x: number; z: number; rot: number; seed: number }
  | { kind: 'prop'; model: string; x: number; z: number; rot: number; seed: number }
  | { kind: 'structure'; uid: string; model: string; x: number; z: number; rot: number; seed: number };

export interface GasZone {
  x: number;
  z: number;
  r: number;
  intensity: number;
}

export interface ChunkPlan {
  cx: number;
  cz: number;
  spawns: Spawn[];
  gas: GasZone[];
}

type Entry = { w: number; node?: NodeId; container?: ContainerId; prop?: string };

const FOOTPRINT: Record<string, number> = {
  deadTree: 0.7, rock: 1.3, rubble: 1.2, carcass: 1.1, scrapPile: 1.3, car: 2.7, barrel: 0.5, toxicBarrel: 0.9,
  crate: 0.7, toolbox: 0.5, cabinet: 0.6, labLocker: 0.6,
  'prop.fence': 1.8, 'prop.lampPost': 0.5, 'prop.barrier': 1.2,
};

const TABLES: Record<BiomeId, { density: number; entries: Entry[] }> = {
  deadwood: {
    density: 20,
    entries: [
      { w: 12, node: 'deadTree' }, { w: 3, node: 'rock' }, { w: 1, node: 'rubble' }, { w: 0.6, node: 'barrel' },
      { w: 0.3, node: 'scrapPile' }, { w: 0.5, container: 'crate' }, { w: 0.6, prop: 'prop.fence' },
      { w: 0.9, node: 'carcass' },
    ],
  },
  suburb: {
    density: 15,
    entries: [
      { w: 3.5, node: 'deadTree' }, { w: 3, node: 'rubble' }, { w: 1.4, node: 'car' }, { w: 1.5, node: 'barrel' },
      { w: 1, node: 'scrapPile' }, { w: 0.6, node: 'rock' }, { w: 1.5, container: 'crate' }, { w: 0.3, container: 'toolbox' },
      { w: 2.5, prop: 'prop.fence' }, { w: 0.4, prop: 'prop.lampPost' }, { w: 0.5, prop: 'prop.barrier' },
      { w: 0.5, node: 'carcass' },
    ],
  },
  industrial: {
    density: 15,
    entries: [
      { w: 3, node: 'scrapPile' }, { w: 3, node: 'rubble' }, { w: 3, node: 'barrel' }, { w: 1, node: 'toxicBarrel' },
      { w: 1, node: 'car' }, { w: 1, node: 'rock' }, { w: 1, node: 'deadTree' }, { w: 1, container: 'crate' },
      { w: 0.6, container: 'toolbox' }, { w: 1.2, prop: 'prop.barrier' }, { w: 0.5, prop: 'prop.lampPost' },
    ],
  },
  toxic: {
    density: 13,
    entries: [
      { w: 3.5, node: 'toxicBarrel' }, { w: 3, node: 'deadTree' }, { w: 2.5, node: 'rock' }, { w: 1.5, node: 'rubble' },
      { w: 1, node: 'scrapPile' }, { w: 1, node: 'barrel' }, { w: 0.4, container: 'crate' },
      { w: 1.2, node: 'carcass' },
    ],
  },
};

const STRUCTURES: Record<BiomeId, { model: string; chance: number; minDist: number }[]> = {
  deadwood: [{ model: 'structure.ruinHouse', chance: 0.08, minDist: 30 }],
  suburb: [{ model: 'structure.ruinHouse', chance: 0.42, minDist: 30 }],
  industrial: [
    { model: 'structure.labRuin', chance: 0.26, minDist: 70 },
    { model: 'structure.ruinHouse', chance: 0.15, minDist: 30 },
  ],
  toxic: [{ model: 'structure.labRuin', chance: 0.4, minDist: 70 }],
};

const STRUCTURE_RADIUS: Record<string, number> = { 'structure.ruinHouse': 5.2, 'structure.labRuin': 7 };
const LAB_GAS = { r: 11, intensity: 0.85 };

export function chunkSeed(seed: number, cx: number, cz: number): number {
  return (Math.imul(cx + 7919, 73856093) ^ Math.imul(cz - 3571, 19349663) ^ seed) >>> 0;
}

/** Deterministic content for one chunk. Same seed + chunk coords always give the same plan. */
export function generateChunk(seed: number, biomes: Biomes, cx: number, cz: number): ChunkPlan {
  const { chunkSize: S, halfSize, starterClearRadius, roadZ, roadWidth } = CONFIG.world;
  const rng = new Rng(chunkSeed(seed, cx, cz));
  const x0 = cx * S;
  const z0 = cz * S;
  const spawns: Spawn[] = [];
  const gas: GasZone[] = [];
  const taken: { x: number; z: number; r: number }[] = [];
  let n = 0;
  const uid = () => `${cx},${cz}:${n++}`;

  const free = (x: number, z: number, r: number, onRoad = false): boolean => {
    if (Math.abs(x) > halfSize - r || Math.abs(z) > halfSize - r) return false;
    if (Math.hypot(x, z) < starterClearRadius + r) return false;
    if (!onRoad && Math.abs(z - roadZ) < roadWidth / 2 + r + 0.4) return false;
    for (const t of taken) if (Math.hypot(t.x - x, t.z - z) < t.r + r + 0.6) return false;
    return true;
  };

  const center = biomes.sample(x0 + S / 2, z0 + S / 2);

  // Structure first, so scatter flows around it.
  const roll = rng.next();
  let acc = 0;
  for (const s of STRUCTURES[center.biome]) {
    acc += s.chance;
    if (roll >= acc) continue;
    const r = STRUCTURE_RADIUS[s.model];
    const x = x0 + S / 2 + rng.range(-S / 2 + r + 1, S / 2 - r - 1);
    const z = z0 + S / 2 + rng.range(-S / 2 + r + 1, S / 2 - r - 1);
    if (Math.hypot(x, z) > s.minDist && free(x, z, r)) {
      spawns.push({ kind: 'structure', uid: uid(), model: s.model, x, z, rot: rng.int(0, 3) * (Math.PI / 2), seed: rng.int(0, 1e9) });
      taken.push({ x, z, r });
      if (s.model === 'structure.labRuin') gas.push({ x, z, ...LAB_GAS });
    }
    break;
  }

  if (center.biome === 'industrial' && rng.chance(0.15) && Math.hypot(x0, z0) > 60) {
    gas.push({ x: x0 + rng.range(6, S - 6), z: z0 + rng.range(6, S - 6), r: rng.range(6, 10), intensity: 0.6 });
  }

  // Wrecks and barriers along the road.
  if (roadZ >= z0 && roadZ < z0 + S && Math.abs(x0 + S / 2) > 34) {
    if (rng.chance(0.55)) {
      const x = x0 + rng.range(4, S - 4);
      const z = roadZ + rng.range(-1.6, 1.6);
      if (free(x, z, 2.7, true)) {
        spawns.push({ kind: 'node', uid: uid(), node: 'car', x, z, rot: rng.sign() * Math.PI / 2 + rng.range(-0.4, 0.4) + Math.PI / 2, seed: rng.int(0, 1e9) });
        taken.push({ x, z, r: 2.7 });
      }
    }
    if (rng.chance(0.5)) {
      const x = x0 + rng.range(2, S - 2);
      const z = roadZ + rng.range(-2.4, 2.4);
      if (free(x, z, 1.2, true)) {
        spawns.push({ kind: 'prop', model: 'prop.barrier', x, z, rot: Math.PI / 2 + rng.range(-0.3, 0.3), seed: rng.int(0, 1e9) });
        taken.push({ x, z, r: 1.2 });
      }
    }
  }

  const count = Math.round(TABLES[center.biome].density * (0.85 + center.danger * 0.3));
  for (let i = 0, tries = 0; i < count && tries < count * 4; tries++) {
    const px = x0 + rng.range(0, S);
    const pz = z0 + rng.range(0, S);
    const { biome } = biomes.sample(px, pz);
    const e = pickWeighted(rng, TABLES[biome].entries);
    const key = e.node ?? e.container ?? e.prop!;
    const r = FOOTPRINT[key] ?? 1;
    // Keep footprints inside the chunk so neighbors never overlap.
    const x = Math.min(x0 + S - r, Math.max(x0 + r, px));
    const z = Math.min(z0 + S - r, Math.max(z0 + r, pz));
    if (!free(x, z, r)) continue;
    const rot = rng.range(0, Math.PI * 2);
    const seedV = rng.int(0, 1e9);
    if (e.node) spawns.push({ kind: 'node', uid: uid(), node: e.node, x, z, rot, seed: seedV });
    else if (e.container) spawns.push({ kind: 'container', uid: uid(), container: e.container, x, z, rot, seed: seedV });
    else spawns.push({ kind: 'prop', model: e.prop!, x, z, rot, seed: seedV });
    taken.push({ x, z, r });
    i++;
  }

  return { cx, cz, spawns, gas };
}

function pickWeighted(rng: Rng, entries: Entry[]): Entry {
  let total = 0;
  for (const e of entries) total += e.w;
  let r = rng.next() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}
