import { CONFIG } from '../data/config';
import type { ContainerId } from '../data/loot';
import type { NodeId } from '../data/nodes';
import { Rng } from '../core/random';
import type { BiomeId, Biomes } from './Biomes';
import type { HeightField, Pad } from './Height';
import type { Decal, Regions } from './Regions';

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
  /** Ground levelled under structures; read by `HeightField` when it fills this chunk's cache. */
  pads: Pad[];
  /** Marks draped on the ground: yard concrete, fields, puddles, tyre tracks, scorches, spills. */
  decals: Decal[];
}

type Entry = { w: number; node?: NodeId; container?: ContainerId; prop?: string };

const FOOTPRINT: Record<string, number> = {
  deadTree: 0.7, rock: 1.3, rubble: 1.2, carcass: 1.1, scrapPile: 1.3, car: 2.7, barrel: 0.5, toxicBarrel: 0.9,
  crate: 0.7, toolbox: 0.5, cabinet: 0.6, labLocker: 0.6,
  fence: 1.8, barrier: 1.2, 'prop.lampPost': 0.5,
};

const TABLES: Record<BiomeId, { density: number; entries: Entry[] }> = {
  deadwood: {
    density: 20,
    entries: [
      { w: 12, node: 'deadTree' }, { w: 3, node: 'rock' }, { w: 1, node: 'rubble' }, { w: 0.6, node: 'barrel' },
      { w: 0.3, node: 'scrapPile' }, { w: 0.5, container: 'crate' }, { w: 0.6, node: 'fence' },
      { w: 0.9, node: 'carcass' },
    ],
  },
  suburb: {
    density: 15,
    entries: [
      { w: 3.5, node: 'deadTree' }, { w: 3, node: 'rubble' }, { w: 1.4, node: 'car' }, { w: 1.5, node: 'barrel' },
      { w: 1, node: 'scrapPile' }, { w: 0.6, node: 'rock' }, { w: 1.5, container: 'crate' }, { w: 0.3, container: 'toolbox' },
      { w: 2.5, node: 'fence' }, { w: 0.4, prop: 'prop.lampPost' }, { w: 0.5, node: 'barrier' },
      { w: 0.5, node: 'carcass' },
    ],
  },
  industrial: {
    density: 15,
    entries: [
      { w: 3, node: 'scrapPile' }, { w: 3, node: 'rubble' }, { w: 3, node: 'barrel' }, { w: 1, node: 'toxicBarrel' },
      { w: 1, node: 'car' }, { w: 1, node: 'rock' }, { w: 1, node: 'deadTree' }, { w: 1, container: 'crate' },
      { w: 0.6, container: 'toolbox' }, { w: 1.2, node: 'barrier' }, { w: 0.5, prop: 'prop.lampPost' },
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

/** Stray ruins out between the planned settlements (towns, yards and farms bring their own). */
const STRUCTURES: Record<BiomeId, { model: string; chance: number; minDist: number }[]> = {
  deadwood: [{ model: 'structure.ruinHouse', chance: 0.06, minDist: 30 }],
  suburb: [{ model: 'structure.ruinHouse', chance: 0.14, minDist: 30 }],
  industrial: [
    { model: 'structure.labRuin', chance: 0.1, minDist: 70 },
    { model: 'structure.ruinHouse', chance: 0.06, minDist: 30 },
  ],
  toxic: [{ model: 'structure.labRuin', chance: 0.18, minDist: 70 }],
};

const STRUCTURE_RADIUS: Record<string, number> = { 'structure.ruinHouse': 5.2, 'structure.labRuin': 7 };
const LAB_GAS = { r: 11, intensity: 0.85 };

export function chunkSeed(seed: number, cx: number, cz: number): number {
  return (Math.imul(cx + 7919, 73856093) ^ Math.imul(cz - 3571, 19349663) ^ seed) >>> 0;
}

/** Deterministic content for one chunk. Same seed + chunk coords always give the same plan. */
export function generateChunk(seed: number, biomes: Biomes, height: HeightField, regions: Regions, cx: number, cz: number): ChunkPlan {
  const { chunkSize: S, starterClearRadius } = CONFIG.world;
  const rng = new Rng(chunkSeed(seed, cx, cz));
  const x0 = cx * S;
  const z0 = cz * S;
  const spawns: Spawn[] = [];
  const gas: GasZone[] = [];
  const pads: Pad[] = [];
  const decals: Decal[] = [];
  const taken: { x: number; z: number; r: number }[] = [];
  let n = 0;
  const uid = () => `${cx},${cz}:${n++}`;
  const inside = (x: number, z: number) => x >= x0 && x < x0 + S && z >= z0 && z < z0 + S;

  const dry = (x: number, z: number, r: number) =>
    [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => height.baseWaterDepth(x + dx, z + dz) < -0.3);
  const clear = (x: number, z: number, r: number) => {
    for (const t of taken) if (Math.hypot(t.x - x, t.z - z) < t.r + r + 0.6) return false;
    return true;
  };
  /** Scatter rules: off roads, out of planned yards / fields / lots, not on steep or wet ground. */
  const free = (x: number, z: number, r: number, onRoad = false): boolean => {
    if (Math.hypot(x, z) < starterClearRadius + r) return false;
    if (!onRoad && regions.clearance(x, z, r + 1) < r + 0.4) return false;
    if (!onRoad && regions.blocked(x, z, r)) return false;
    if (!onRoad && height.baseSlopeDeg(x, z) > 40) return false;
    if (!clear(x, z, r)) return false;
    return height.baseWaterDepth(x, z) <= -0.3;
  };

  // Bridges first: nothing else spawns on a deck.
  for (const b of height.roadBridgesIn(cx, cz)) {
    spawns.push({ kind: 'prop', model: `prop.roadBridge.${b.length}`, x: b.x, z: b.z, rot: b.rot, seed: rng.int(0, 1e9) });
    taken.push({ x: b.x, z: b.z, r: b.length / 2 });
  }
  for (const c of height.crossingsIn(x0, z0, S)) {
    spawns.push({ kind: 'prop', model: `prop.footbridge.${c.length}`, x: c.x, z: c.z, rot: Math.atan2(-c.nz, c.nx), seed: rng.int(0, 1e9) });
    taken.push({ x: c.x, z: c.z, r: c.hl });
  }

  // The pieces of towns, yards and farms that land in this chunk.
  for (const reg of regions.regionsNear(x0 + S / 2, z0 + S / 2)) {
    for (const p of reg.pads) {
      if (!inside(p.x, p.z)) continue;
      const y = height.padHeight(p.x, p.z, p.hw, p.hd, 4);
      if (y !== null && dry(p.x, p.z, Math.max(p.hw, p.hd))) pads.push({ ...p, y, blend: 8 });
    }
    for (const d of reg.decals) if (inside(d.x, d.z)) decals.push(d);
    for (const it of reg.items) {
      if (!inside(it.x, it.z)) continue;
      if (!dry(it.x, it.z, it.r) || regions.clearance(it.x, it.z, it.r + 1) < it.r * 0.6) continue;
      const seedV = rng.int(0, 1e9);
      switch (it.kind) {
        case 'structure': {
          const y = height.padHeight(it.x, it.z, it.r, it.r, 3);
          if (y === null) continue;
          spawns.push({ kind: 'structure', uid: it.uid, model: it.model, x: it.x, z: it.z, rot: it.rot, seed: seedV });
          pads.push({ x: it.x, z: it.z, hw: it.r + 0.4, hd: it.r + 0.4, y, blend: 7 });
          if (it.model === 'structure.labRuin') gas.push({ x: it.x, z: it.z, ...LAB_GAS });
          break;
        }
        case 'node':
          spawns.push({ kind: 'node', uid: it.uid, node: it.node, x: it.x, z: it.z, rot: it.rot, seed: seedV });
          break;
        case 'container':
          spawns.push({ kind: 'container', uid: it.uid, container: it.container, x: it.x, z: it.z, rot: it.rot, seed: seedV });
          break;
        default:
          spawns.push({ kind: 'prop', model: it.model, x: it.x, z: it.z, rot: it.rot, seed: seedV });
      }
      taken.push({ x: it.x, z: it.z, r: it.r });
    }
    // Planned pieces just over the border still keep this chunk's scatter off them.
    for (const it of reg.items) {
      if (!inside(it.x, it.z) && it.x > x0 - 8 && it.x < x0 + S + 8 && it.z > z0 - 8 && it.z < z0 + S + 8) taken.push({ x: it.x, z: it.z, r: it.r });
    }
  }

  const center = biomes.sample(x0 + S / 2, z0 + S / 2);

  // A stray ruin, so scatter flows around it.
  const roll = rng.next();
  let acc = 0;
  for (const s of STRUCTURES[center.biome]) {
    acc += s.chance;
    if (roll >= acc) continue;
    const r = STRUCTURE_RADIUS[s.model];
    const x = x0 + S / 2 + rng.range(-S / 2 + r + 1, S / 2 - r - 1);
    const z = z0 + S / 2 + rng.range(-S / 2 + r + 1, S / 2 - r - 1);
    const y = Math.hypot(x, z) > s.minDist && free(x, z, r) && dry(x, z, r + 2) ? height.padHeight(x, z, r, r) : null;
    if (y !== null) {
      spawns.push({ kind: 'structure', uid: uid(), model: s.model, x, z, rot: rng.int(0, 3) * (Math.PI / 2), seed: rng.int(0, 1e9) });
      pads.push({ x, z, hw: r + 0.4, hd: r + 0.4, y, blend: 7 });
      taken.push({ x, z, r });
      if (s.model === 'structure.labRuin') gas.push({ x, z, ...LAB_GAS });
    }
    break;
  }

  if (center.biome === 'industrial' && rng.chance(0.15) && Math.hypot(x0, z0) > 60) {
    gas.push({ x: x0 + rng.range(6, S - 6), z: z0 + rng.range(6, S - 6), r: rng.range(6, 10), intensity: 0.6 });
  }

  // Wrecks, barriers and tyre tracks along whatever road runs through here.
  for (const road of regions.roadsIn(cx, cz)) {
    const pts: number[] = [];
    for (let k = 0; k < road.n - 1; k++) if (inside(road.pts[k * 2], road.pts[k * 2 + 1])) pts.push(k);
    if (!pts.length || Math.hypot(x0 + S / 2, z0 + S / 2) < 40) continue;
    const at = () => {
      const k = pts[rng.int(0, pts.length - 1)];
      const ax = road.pts[k * 2];
      const az = road.pts[k * 2 + 1];
      const dx = road.pts[k * 2 + 2] - ax;
      const dz = road.pts[k * 2 + 3] - az;
      const len = Math.hypot(dx, dz) || 1;
      return { x: ax, z: az, tx: dx / len, tz: dz / len };
    };
    const busy = road.kind === 'highway' ? 1 : 0.6;
    if (rng.chance(0.4 * busy)) {
      const p = at();
      const off = rng.range(-1.6, 1.6);
      const x = p.x - p.tz * off;
      const z = p.z + p.tx * off;
      if (free(x, z, 2.7, true)) {
        spawns.push({ kind: 'node', uid: uid(), node: 'car', x, z, rot: Math.atan2(p.tx, p.tz) + (rng.chance(0.5) ? Math.PI : 0) + rng.range(-0.4, 0.4), seed: rng.int(0, 1e9) });
        taken.push({ x, z, r: 2.7 });
      }
    }
    if (rng.chance(0.35 * busy)) {
      const p = at();
      const off = rng.range(-2.4, 2.4);
      const x = p.x - p.tz * off;
      const z = p.z + p.tx * off;
      if (free(x, z, 1.2, true)) {
        spawns.push({ kind: 'node', uid: uid(), node: 'barrier', x, z, rot: Math.atan2(p.tx, p.tz) + Math.PI / 2 + rng.range(-0.3, 0.3), seed: rng.int(0, 1e9) });
        taken.push({ x, z, r: 1.2 });
      }
    }
    if (rng.chance(0.45)) {
      const p = at();
      const off = rng.range(-1.4, 1.4);
      decals.push({ kind: 'tracks', x: p.x - p.tz * off, z: p.z + p.tx * off, rot: Math.atan2(-p.tz, p.tx), w: rng.range(7, 14), d: 2.1, seed: rng.int(0, 1e9) });
    }
    if (rng.chance(0.3)) {
      const p = at();
      const off = (road.width / 2 + rng.range(0.5, 2)) * rng.sign();
      decals.push({ kind: 'puddle', x: p.x - p.tz * off, z: p.z + p.tx * off, rot: rng.range(0, 6.3), w: rng.range(1.6, 3.4), d: rng.range(1.2, 2.6), seed: rng.int(0, 1e9) });
    }
  }

  // Loose marks: puddles in the dips, old burns, and spills where the chemicals ran.
  for (let k = rng.int(0, 2); k > 0; k--) {
    const x = x0 + rng.range(3, S - 3);
    const z = z0 + rng.range(3, S - 3);
    const kind = center.biome === 'industrial' || center.biome === 'toxic' ? (rng.chance(0.6) ? 'spill' : 'scorch') : rng.chance(0.55) ? 'puddle' : 'scorch';
    if (height.baseWaterDepth(x, z) > -0.4 || regions.blocked(x, z, 1)) continue;
    const w = rng.range(1.8, 4.2);
    decals.push({ kind, x, z, rot: rng.range(0, 6.3), w, d: w * rng.range(0.7, 1), seed: rng.int(0, 1e9) });
  }

  const count = Math.round(TABLES[center.biome].density * (0.85 + Math.min(center.danger, 1.5) * 0.3));
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

  return { cx, cz, spawns, gas, pads, decals };
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
