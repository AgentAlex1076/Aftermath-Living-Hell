import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { clamp, lerp, smoothstep, TAU } from '../core/math';
import { createNoise2D, fbm, type Noise2D } from '../core/noise';
import { Rng } from '../core/random';
import type { RegionMeta, Regions, RoadHit, Road } from './Regions';

/** 1 m cells: the cache, the ground mesh and gameplay all read this. */
const CELL = 1;
/** Collision tag for merged steep-face boxes. Climbers ignore it. */
export const CLIFF_TAG = 'cliff';
/** Collision tag for merged deep-water boxes. Nothing gets through these. */
export const WATER_TAG = 'water';

export type WaterKind = 'none' | 'river' | 'lake' | 'crater';
const KINDS: readonly WaterKind[] = ['none', 'river', 'lake', 'crater'];

/** No water body reaches this point. */
const NONE = -1e6;
/** Banks stand this far above the waterline, so water never spills past them. */
const BANK_LIFT = 0.4;
const RIVER_FREQ = 0.0017;
/** Width of the bank zone beyond a river channel, metres. Wide, so banks stay gentle. */
const RIVER_BANK = 20;
const LAKE_CELL = 210;
/** Lake shore band, as a fraction of the radius. */
const LAKE_SHORE = 0.7;
const LAKE_REACH = 40 * (1 + LAKE_SHORE) * 1.25 + 2;
const CRATER_CELL = 250;
const CRATER_REACH = 18 * 1.6 + 1;
const CROSS_CELL = 170;
const CROSS_REACH = 16;
/** Footbridge and road bridge model lengths, metres. */
export const FOOTBRIDGE_LENGTHS = [14, 18, 22] as const;
export const ROAD_BRIDGE_LENGTHS = [14, 18, 22, 28] as const;

export interface HeightSpan {
  min: number;
  max: number;
  slope: number;
}

export interface CliffBox {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/** A levelled rectangle (ruin and lab floors) that blends back into the hills over `blend` metres. */
export interface Pad {
  x: number;
  z: number;
  hw: number;
  hd: number;
  y: number;
  blend: number;
}

/** Walk speed multiplier, whether sprint is allowed, and water depth when wading (0 on dry ground). */
export interface Footing {
  mul: number;
  sprint: boolean;
  wade: number;
}

export interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
  rim: number;
  /** Toxic pool surface, or null for a dry crater. */
  pool: number | null;
}

/** A footbridge over a river: the bank is built up into a narrow causeway under the deck. */
export interface Crossing {
  x: number;
  z: number;
  /** Unit direction across the river (along the deck). */
  nx: number;
  nz: number;
  hl: number;
  hw: number;
  deck: number;
  length: number;
}

export interface RoadBridge {
  x: number;
  z: number;
  /** Yaw that turns the bridge model's local X along the road. */
  rot: number;
  length: number;
}

interface Lake {
  x: number;
  z: number;
  r: number;
  level: number;
  depth: number;
}

interface River {
  /** Distance from the river's centre line. */
  d: number;
  /** Channel half-width. */
  w: number;
  depth: number;
  /** 0..1 strength: rivers fade out near home, in towns and where the mask is low. */
  s: number;
  /** Waterline. */
  wl: number;
  /** Unit direction across the river. */
  gx: number;
  gz: number;
}

interface Parts {
  h: number;
  /** The big shapes only (no roll or terrace steps). Water levels follow this. */
  macro: number;
  land: number;
}

interface Sample {
  h: number;
  water: number;
  kind: number;
}

interface Tile {
  h: Float32Array;
  /** Water surface per vertex, or ground - 5 where there is none. */
  w: Float32Array;
  k: Uint8Array;
  /** Some vertex here is under water. */
  wet: boolean;
}

const _n = new THREE.Vector3();
const newParts = (): Parts => ({ h: 0, macro: 0, land: 0 });
const newRiver = (): River => ({ d: Infinity, w: 0, depth: 0, s: 0, wl: 0, gx: 1, gz: 0 });
const _parts = newParts();
const _parts2 = newParts();
const _parts3 = newParts();
const _river = newRiver();
const _river2 = newRiver();
const _river3 = newRiver();
const _sample: Sample = { h: 0, water: NONE, kind: 0 };
const _probe: Sample = { h: 0, water: NONE, kind: 0 };
const _lakes: Lake[] = [];
const _hits: RoadHit[] = [];
const _hits2: RoadHit[] = [];
const _craters: Crater[] = [];
const _crossings: Crossing[] = [];

const cellKey = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
const cellSeed = (salt: number, i: number, j: number) => (Math.imul(i + 9151, 73856093) ^ Math.imul(j - 4421, 19349663) ^ salt) >>> 0;

/**
 * One height function for the run. Home is searched in generation space, then the world is
 * shifted so that site sits at the origin and the Home Zone is flattened. Everything else
 * (pathfinding, raids, threat) keeps assuming the hut is at (0, 0).
 *
 * Every slope is walkable: big rolling hills, no cliffs or peaks. Water lives here too (rivers
 * along winding noise lines, lakes in basins, crater pools), all shallow enough to wade, each
 * carved in with gentle banks above its surface so one water level per vertex (cached next to
 * the height) is enough to draw it and to wade through it. Roads from `Regions` are cut and
 * filled into the ground along their own smoothed grade; towns are levelled.
 */
export class HeightField {
  /** Generation-space point that maps to world (0, 0). */
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly siteHeight: number;
  private readonly seed: number;
  private readonly scale: number;
  private readonly land: Noise2D;
  private readonly warpX: Noise2D;
  private readonly warpZ: Noise2D;
  private readonly detail: Noise2D;
  private readonly ridge: Noise2D;
  private readonly high: Noise2D;
  private readonly rWarpX: Noise2D;
  private readonly rWarpZ: Noise2D;
  private readonly rLine: Noise2D;
  private readonly rWidth: Noise2D;
  private readonly rFord: Noise2D;
  private readonly rMask: Noise2D;
  private readonly lakeEdge: Noise2D;
  private readonly caches = new Map<string, Tile>();
  private readonly lakes = new Map<number, Lake | null>();
  private readonly craters = new Map<number, Crater | null>();
  private readonly crossings = new Map<number, Crossing | null>();
  private readonly townHeights = new Map<RegionMeta, number>();
  private padSource: ((cx: number, cz: number) => readonly Pad[]) | null = null;

  constructor(seed: number, readonly regions: Regions) {
    this.seed = seed;
    this.scale = CONFIG.world.heightScale;
    this.land = createNoise2D(seed + 5101);
    this.warpX = createNoise2D(seed + 5102);
    this.warpZ = createNoise2D(seed + 5103);
    this.detail = createNoise2D(seed + 5104);
    this.ridge = createNoise2D(seed + 5105);
    this.high = createNoise2D(seed + 5106);
    this.rWarpX = createNoise2D(seed + 5111);
    this.rWarpZ = createNoise2D(seed + 5112);
    this.rLine = createNoise2D(seed + 5113);
    this.rWidth = createNoise2D(seed + 5114);
    this.rFord = createNoise2D(seed + 5115);
    this.rMask = createNoise2D(seed + 5116);
    this.lakeEdge = createNoise2D(seed + 5117);

    const site = this.findHome();
    this.offsetX = site.x;
    this.offsetZ = site.z;
    this.siteHeight = site.h;
  }

  get cachedChunks(): number {
    return this.caches.size;
  }

  /**
   * Where structure pads come from (the chunk plans). Plans are laid out on `base`, never `at`,
   * so reading them while filling a height cache can't recurse.
   */
  setPadSource(fn: (cx: number, cz: number) => readonly Pad[]): void {
    this.padSource = fn;
    this.caches.clear();
  }

  /** Height before structure pads. Chunk generation reads this. */
  base(x: number, z: number): number {
    return this.sample(x, z).h;
  }

  baseSlopeDeg(x: number, z: number): number {
    const dx = this.base(x + 0.5, z) - this.base(x - 0.5, z);
    const dz = this.base(x, z + 0.5) - this.base(x, z - 0.5);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  }

  /** Water depth before structure pads (negative on dry ground). Chunk generation reads this. */
  baseWaterDepth(x: number, z: number): number {
    const s = this.sample(x, z);
    return s.water > NONE + 1 ? s.water - s.h : -5;
  }

  /** Uncached height and water at a point, for searches that would otherwise fill hundreds of caches. */
  probe(x: number, z: number): { h: number; depth: number; kind: WaterKind; land: number } {
    const s = this.sample(x, z, _probe);
    // `sample` reads the terrain into `_parts` first and nothing after it touches that scratch.
    return { h: s.h, depth: s.water > NONE + 1 ? s.water - s.h : -5, kind: KINDS[s.kind], land: _parts.land };
  }

  /** Raw land layer: low ground under 0, big hills past ~0.3. */
  landAt(x: number, z: number): number {
    return this.terrain(x + this.offsetX, z + this.offsetZ, _parts3).land;
  }

  /** Floor height for levelling a footprint, or null if the ground is too rough to cut and fill. */
  padHeight(x: number, z: number, hw: number, hd: number, maxRange = 2.5): number | null {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const h = this.base(x + i * hw, z + j * hd);
        sum += h;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    return max - min > maxRange ? null : sum / 9;
  }

  /** World-space ground height. Bilinear from the 1 m cache, so mesh and gameplay agree. */
  at(x: number, z: number): number {
    return this.lookup(x, z, false);
  }

  /** Water surface at a point; well under the ground where there is no water. */
  waterSurface(x: number, z: number): number {
    return this.lookup(x, z, true);
  }

  /** How deep the water is here. Negative on dry ground. */
  waterDepth(x: number, z: number): number {
    return this.lookup(x, z, true) - this.lookup(x, z, false);
  }

  waterKind(x: number, z: number): WaterKind {
    const S = CONFIG.world.chunkSize;
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    const t = this.tile(cx, cz);
    const n = S / CELL + 1;
    const ix = clamp(Math.round((x - cx * S) / CELL), 0, n - 1);
    const iz = clamp(Math.round((z - cz * S) / CELL), 0, n - 1);
    return KINDS[t.k[iz * n + ix]];
  }

  /** Whether any of this chunk's ground is under water (the ground tile draws a water sheet). */
  hasWater(cx: number, cz: number): boolean {
    return this.tile(cx, cz).wet;
  }

  /** Rise over 1 m, in degrees. */
  slopeDeg(x: number, z: number): number {
    const dx = this.at(x + 0.5, z) - this.at(x - 0.5, z);
    const dz = this.at(x, z + 0.5) - this.at(x, z - 0.5);
    return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
  }

  normalAt(x: number, z: number, out = _n): THREE.Vector3 {
    const dx = this.at(x + 0.5, z) - this.at(x - 0.5, z);
    const dz = this.at(x, z + 0.5) - this.at(x, z - 0.5);
    return out.set(-dx, 1, -dz).normalize();
  }

  isRoad(x: number, z: number): boolean {
    for (const h of this.regions.nearRoads(x, z, _hits2)) if (h.dist < h.road.width / 2) return true;
    return false;
  }

  /** The shared movement modifier: slopes, roads and water. Player and mutants both read it. */
  walk(x: number, z: number): Footing {
    const W = CONFIG.world;
    if (this.isRoad(x, z)) return { mul: W.roadMul, sprint: true, wade: 0 };
    const depth = this.waterDepth(x, z);
    if (depth > W.deepWater) return { mul: 0, sprint: false, wade: depth };
    const s = this.slopeDeg(x, z);
    if (s > W.steepSlope) return { mul: 0, sprint: false, wade: 0 };
    const steep = s > W.walkSlope;
    let mul = steep ? W.steepMul : 1;
    if (depth > W.wadeDepth) {
      mul = Math.min(mul, W.wadeMul);
      return { mul, sprint: false, wade: depth };
    }
    return { mul, sprint: !steep, wade: 0 };
  }

  span(minX: number, maxX: number, minZ: number, maxZ: number): HeightSpan {
    const samples = [
      this.at(minX, minZ), this.at(maxX, minZ), this.at(minX, maxZ), this.at(maxX, maxZ),
      this.at((minX + maxX) / 2, (minZ + maxZ) / 2),
    ];
    let min = samples[0];
    let max = samples[0];
    for (const h of samples) {
      if (h < min) min = h;
      if (h > max) max = h;
    }
    return { min, max, slope: this.slopeDeg((minX + maxX) / 2, (minZ + maxZ) / 2) };
  }

  /**
   * Steps along a world ray until it drops under the ground. Used for mouse aim, so pointing
   * at a hillside aims up the hill.
   */
  march(origin: THREE.Vector3, dir: THREE.Vector3, maxDist = 110, out?: THREE.Vector3): THREE.Vector3 | null {
    const step = 0.45;
    let t = 0.4;
    let prevAbove = origin.y > this.at(origin.x, origin.z) + 0.02;
    while (t <= maxDist) {
      const x = origin.x + dir.x * t;
      const y = origin.y + dir.y * t;
      const z = origin.z + dir.z * t;
      const h = this.at(x, z);
      const above = y > h + 0.02;
      if (prevAbove && !above) {
        let lo = t - step;
        let hi = t;
        for (let k = 0; k < 6; k++) {
          const mid = (lo + hi) * 0.5;
          const my = origin.y + dir.y * mid;
          const mh = this.at(origin.x + dir.x * mid, origin.z + dir.z * mid);
          if (my > mh) lo = mid;
          else hi = mid;
        }
        const hit = out ?? new THREE.Vector3();
        return hit.set(origin.x + dir.x * hi, this.at(origin.x + dir.x * hi, origin.z + dir.z * hi), origin.z + dir.z * hi);
      }
      prevAbove = above;
      t += step;
    }
    return null;
  }

  ensure(cx: number, cz: number): Float32Array {
    return this.tile(cx, cz).h;
  }

  evict(fcx: number, fcz: number, keep: number): void {
    for (const key of this.caches.keys()) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.max(Math.abs(cx - fcx), Math.abs(cz - fcz)) > keep) this.caches.delete(key);
    }
  }

  /** Steep and deep-water 1 m cells in this chunk, each merged into rectangles for the 2D collider world. */
  blockBoxes(cx: number, cz: number): { cliffs: CliffBox[]; water: CliffBox[] } {
    const S = CONFIG.world.chunkSize;
    const n = S / CELL;
    const wet = this.tile(cx, cz).wet;
    const cliff = new Uint8Array(n * n);
    const deep = new Uint8Array(n * n);
    const { steepSlope, homeFlatten, deepWater } = CONFIG.world;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = cx * S + ix + 0.5;
        const z = cz * S + iz + 0.5;
        if (wet && this.waterDepth(x, z) > deepWater) deep[iz * n + ix] = 1;
        if (Math.hypot(x, z) < homeFlatten + 2) continue;
        if (this.slopeDeg(x, z) <= steepSlope || this.regions.clearance(x, z, 1) < 0.6) continue;
        cliff[iz * n + ix] = 1;
      }
    }
    return { cliffs: mergeCells(cliff, n, cx * S, cz * S), water: wet ? mergeCells(deep, n, cx * S, cz * S) : [] };
  }

  /** 0..1: how far into a crater bowl a point is (for scorching the ground). */
  craterWeight(x: number, z: number): number {
    let w = 0;
    for (const c of this.gather(this.craters, CRATER_CELL, CRATER_REACH, x, z, this.makeCrater, _craters)) {
      const q = Math.hypot(x - c.x, z - c.z) / c.r;
      w = Math.max(w, 1 - smoothstep(0.7, 1.25, q));
    }
    return w;
  }

  /** Craters within `reach` of a point. */
  cratersNear(x: number, z: number, reach: number): Crater[] {
    return [...this.gather(this.craters, CRATER_CELL, reach + CRATER_REACH, x, z, this.makeCrater, [])];
  }

  /** Footbridges within `reach` of a point. */
  crossingsNear(x: number, z: number, reach: number): Crossing[] {
    return [...this.gather(this.crossings, CROSS_CELL, reach + CROSS_REACH, x, z, this.makeCrossing, [])];
  }

  /** Footbridges whose centre is inside this chunk. */
  crossingsIn(x0: number, z0: number, size: number): Crossing[] {
    return this.crossingsNear(x0 + size / 2, z0 + size / 2, size).filter(
      (c) => c.x >= x0 && c.x < x0 + size && c.z >= z0 && c.z < z0 + size,
    );
  }

  /** Where a river crosses a road inside this chunk: the road rises onto a causeway there. */
  roadBridgesIn(cx: number, cz: number): RoadBridge[] {
    if (this.scale <= 0) return [];
    const S = CONFIG.world.chunkSize;
    const out: RoadBridge[] = [];
    for (const road of this.regions.roadsIn(cx, cz)) {
      const p = road.pts;
      let prev = this.riverValue(p[0] + this.offsetX, p[1] + this.offsetZ);
      for (let k = 1; k < road.n; k++) {
        const n = this.riverValue(p[k * 2] + this.offsetX, p[k * 2 + 1] + this.offsetZ);
        if (n < 0 !== prev < 0) {
          const f = prev / (prev - n);
          const ax = p[k * 2 - 2];
          const az = p[k * 2 - 1];
          const dx = p[k * 2] - ax;
          const dz = p[k * 2 + 1] - az;
          const x = ax + dx * f;
          const z = az + dz * f;
          if (Math.floor(x / S) === cx && Math.floor(z / S) === cz) {
            const gx = x + this.offsetX;
            const gz = z + this.offsetZ;
            const t = this.terrain(gx, gz, _parts2);
            const r = this.river(gx, gz, x, z, t.land, t.macro - this.siteHeight, _river2);
            if (r.s > 0.35 && r.d < r.w) {
              const len = Math.hypot(dx, dz) || 1;
              const across = Math.abs((dx * r.gx + dz * r.gz) / len);
              const span = (2 * r.w * 1.15) / Math.max(0.3, across) + 2;
              const length = ROAD_BRIDGE_LENGTHS.find((l) => l >= span) ?? ROAD_BRIDGE_LENGTHS[ROAD_BRIDGE_LENGTHS.length - 1];
              out.push({ x, z, rot: Math.atan2(-dz, dx), length });
            }
          }
        }
        prev = n;
      }
    }
    return out;
  }

  private tile(cx: number, cz: number): Tile {
    const key = `${cx},${cz}`;
    const cached = this.caches.get(key);
    if (cached) return cached;
    const S = CONFIG.world.chunkSize;
    const n = S / CELL + 1;
    const h = new Float32Array(n * n);
    const w = new Float32Array(n * n);
    const k = new Uint8Array(n * n);
    const x0 = cx * S;
    const z0 = cz * S;
    const pads: Pad[] = [];
    if (this.padSource) {
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const p of this.padSource(cx + i, cz + j)) {
            if (p.x + p.hw + p.blend < x0 || p.x - p.hw - p.blend > x0 + S) continue;
            if (p.z + p.hd + p.blend < z0 || p.z - p.hd - p.blend > z0 + S) continue;
            pads.push(p);
          }
        }
      }
    }
    let wet = false;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = x0 + ix * CELL;
        const z = z0 + iz * CELL;
        const s = this.sample(x, z);
        let y = s.h;
        if (pads.length) y = applyPads(y, x, z, pads, this.regions);
        const i = iz * n + ix;
        h[i] = y;
        if (s.water > NONE + 1) {
          w[i] = s.water;
          k[i] = s.kind;
          if (s.water > y + 0.01) wet = true;
        } else {
          w[i] = y - 5;
        }
      }
    }
    const t: Tile = { h, w, k, wet };
    this.caches.set(key, t);
    return t;
  }

  private lookup(x: number, z: number, water: boolean): number {
    const S = CONFIG.world.chunkSize;
    const cx = Math.floor(x / S);
    const cz = Math.floor(z / S);
    const t = this.tile(cx, cz);
    const grid = water ? t.w : t.h;
    const n = S / CELL + 1;
    const fx = clamp((x - cx * S) / CELL, 0, S);
    const fz = clamp((z - cz * S) / CELL, 0, S);
    const ix = Math.min(n - 2, Math.floor(fx));
    const iz = Math.min(n - 2, Math.floor(fz));
    const tx = fx - ix;
    const tz = fz - iz;
    const i = iz * n + ix;
    const a = grid[i];
    const b = grid[i + 1];
    const c = grid[i + n];
    const d = grid[i + n + 1];
    return a * (1 - tx) * (1 - tz) + b * tx * (1 - tz) + c * (1 - tx) * tz + d * tx * tz;
  }

  /** Ground and water at a world point, before structure pads. */
  private sample(x: number, z: number, out: Sample = _sample): Sample {
    const W = CONFIG.world;
    const gx = x + this.offsetX;
    const gz = z + this.offsetZ;
    const t = this.terrain(gx, gz, _parts);
    const k = this.scale;
    let h = t.h - this.siteHeight;
    let water = NONE;
    let kind = 0;

    if (k > 0) {
      const r = this.river(gx, gz, x, z, t.land, t.macro - this.siteHeight, _river);
      if (r.s > 0 && r.d < r.w + RIVER_BANK) {
        const lev = r.wl + BANK_LIFT;
        let target: number;
        if (r.d < r.w) {
          target = lev - (r.depth + BANK_LIFT) * (1 - smoothstep(0, 1, r.d / r.w));
        } else {
          target = Math.max(h, lev - 4 * smoothstep(r.w + RIVER_BANK * 0.5, r.w + RIVER_BANK, r.d));
          target = lerp(lev, target, smoothstep(r.w, r.w + RIVER_BANK * 0.75, r.d));
          target = lerp(target, h, smoothstep(r.w + RIVER_BANK * 0.85, r.w + RIVER_BANK, r.d));
        }
        h = lerp(h, target, r.s);
        // A fading river sinks its surface, so the dry gully it leaves never shows water above the banks.
        if (r.s > 0.2 && r.d < r.w + RIVER_BANK * 0.45) {
          water = r.wl - (1 - r.s) * 6;
          kind = 1;
        }
      }

      for (const lk of this.gather(this.lakes, LAKE_CELL, LAKE_REACH, x, z, this.makeLake, _lakes)) {
        const dx = x - lk.x;
        const dz = z - lk.z;
        const lim = lk.r * (1 + LAKE_SHORE) * 1.25;
        if (dx * dx + dz * dz > lim * lim) continue;
        const q = Math.hypot(dx, dz) / (lk.r * (1 + 0.2 * this.lakeEdge(x * 0.035, z * 0.035)));
        if (q >= 1 + LAKE_SHORE) continue;
        const lev = lk.level + BANK_LIFT;
        if (q < 1) {
          h = lev - (lk.depth + BANK_LIFT) * (1 - smoothstep(0, 1, q));
        } else {
          let target = Math.max(h, lev - 4 * smoothstep(1 + LAKE_SHORE * 0.5, 1 + LAKE_SHORE, q));
          target = lerp(lev, target, smoothstep(1, 1 + LAKE_SHORE * 0.8, q));
          h = lerp(target, h, smoothstep(1 + LAKE_SHORE * 0.85, 1 + LAKE_SHORE, q));
        }
        if (q < 1 + LAKE_SHORE * 0.45 && lk.level > water) {
          water = lk.level;
          kind = 2;
        }
      }

      for (const c of this.gather(this.craters, CRATER_CELL, CRATER_REACH, x, z, this.makeCrater, _craters)) {
        const q = Math.hypot(x - c.x, z - c.z) / c.r;
        if (q >= 1.6) continue;
        h += (q < 1 ? -c.depth * (1 - q * q) : 0) + c.rim * Math.exp(-(((q - 1) / 0.25) ** 2));
        if (c.pool !== null && q < 0.97 && c.pool > water) {
          water = c.pool;
          kind = 3;
        }
      }

      for (const cr of this.gather(this.crossings, CROSS_CELL, CROSS_REACH, x, z, this.makeCrossing, _crossings)) {
        const dx = x - cr.x;
        const dz = z - cr.z;
        const u = Math.abs(dx * cr.nx + dz * cr.nz);
        const v = Math.abs(-dx * cr.nz + dz * cr.nx);
        if (u > cr.hl + 5 || v > cr.hw + 4) continue;
        const wgt = (1 - smoothstep(cr.hw - 0.3, cr.hw + 4, v)) * (1 - smoothstep(cr.hl - 0.5, cr.hl + 5, u));
        h = lerp(h, cr.deck, wgt);
      }

      const town = this.regions.townWeight(x, z);
      if (town.meta) h = lerp(h, this.townHeight(town.meta), town.w);
    }

    const home = 1 - smoothstep(W.homeFlatten + 3, W.homeFlatten + 3 + W.homeBlend, Math.hypot(x, z));
    h = lerp(h, 0, home);
    const hits = this.regions.nearRoads(x, z, _hits);
    if (hits.length) {
      let wsum = 0;
      let gsum = 0;
      let wmax = 0;
      for (const hit of hits) {
        const half = hit.road.width / 2;
        const w = 1 - smoothstep(half - 0.35, half + 8, hit.dist);
        if (w <= 0.001) continue;
        wsum += w;
        gsum += this.gradeOf(hit) * w;
        wmax = Math.max(wmax, w);
      }
      if (wsum > 0) h = lerp(h, gsum / wsum, wmax);
    }

    out.h = h;
    out.water = water;
    out.kind = kind;
    return out;
  }

  /** Generation-space height before the home shift and stamps. */
  private raw(gx: number, gz: number): number {
    return this.terrain(gx, gz, _parts3).h;
  }

  /** Big rolling hills over lowlands; no terraces, cliffs or peaks, so every slope can be walked. */
  private terrain(gx: number, gz: number, out: Parts): Parts {
    const wx = gx + fbm(this.warpX, gx * 0.0025, gz * 0.0025, 3) * 64;
    const wz = gz + fbm(this.warpZ, gx * 0.0025, gz * 0.0025, 3) * 64;
    const land = fbm(this.land, wx * 0.0032, wz * 0.0032, 3);
    const detail = fbm(this.detail, gx * 0.028, gz * 0.028, 2);
    const ridge = fbm(this.ridge, wx * 0.0062, wz * 0.0062, 3);
    const roll = fbm(this.ridge, gx * 0.011, gz * 0.011, 2) * 2 + detail * 0.6;

    const hills = 6 + (ridge * 0.5 + 0.5) * 11;
    const highBase = 14 + (fbm(this.high, wx * 0.0042, wz * 0.0042, 3) * 0.5 + 0.5) * 14;
    const tHills = smoothstep(-0.1, 0.25, land);
    const tHigh = smoothstep(0.18, 0.6, land);

    let h = 1.5 + roll;
    h = lerp(h, hills + roll, tHills);
    h = lerp(h, highBase + roll * 0.8, tHigh);
    let m = 1.5;
    m = lerp(m, hills, tHills);
    m = lerp(m, highBase, tHigh);
    out.h = h * this.scale;
    out.macro = m * this.scale;
    out.land = land;
    return out;
  }

  /** Signed distance-ish field whose zero lines are the river centre lines (generation space). */
  private riverValue(gx: number, gz: number): number {
    const wx = gx + fbm(this.rWarpX, gx * 0.0031, gz * 0.0031, 2) * 60;
    const wz = gz + fbm(this.rWarpZ, gx * 0.0031, gz * 0.0031, 2) * 60;
    return fbm(this.rLine, wx * RIVER_FREQ, wz * RIVER_FREQ, 2);
  }

  private river(gx: number, gz: number, x: number, z: number, _land: number, macro: number, out: River): River {
    out.s = 0;
    out.d = Infinity;
    const [h0, h1] = CONFIG.world.riverHome;
    const home = smoothstep(h0, h1, Math.hypot(x, z));
    if (home <= 0) return out;
    const mask = smoothstep(-0.14, 0.1, fbm(this.rMask, gx * 0.0011, gz * 0.0011, 2));
    if (mask <= 0) return out;
    const n = this.riverValue(gx, gz);
    if (Math.abs(n) > 0.09) return out;
    const e = 2;
    const dx = (this.riverValue(gx + e, gz) - n) / e;
    const dz = (this.riverValue(gx, gz + e) - n) / e;
    const g = Math.hypot(dx, dz) || 1e-6;
    out.d = Math.abs(n) / g;
    out.gx = dx / g;
    out.gz = dz / g;
    const ford = smoothstep(0.2, 0.38, this.rFord(gx * 0.006, gz * 0.006));
    out.w = (4 + 3.2 * (this.rWidth(gx * 0.004, gz * 0.004) * 0.5 + 0.5)) * (1 + 0.3 * ford);
    out.depth = lerp(0.8, 0.45, ford);
    out.s = home * mask * (1 - this.regions.townWeight(x, z).w);
    out.wl = macro - 1.1;
    return out;
  }

  /** Cells of `size` around a point that hold a feature, built on first use. Fills and returns `out`. */
  private gather<T>(
    memo: Map<number, T | null>, size: number, reach: number, x: number, z: number,
    make: (i: number, j: number) => T | null, out: T[],
  ): T[] {
    out.length = 0;
    const gx = x + this.offsetX;
    const gz = z + this.offsetZ;
    const i1 = Math.floor((gx + reach) / size);
    const j1 = Math.floor((gz + reach) / size);
    for (let i = Math.floor((gx - reach) / size); i <= i1; i++) {
      for (let j = Math.floor((gz - reach) / size); j <= j1; j++) {
        const key = cellKey(i, j);
        let v = memo.get(key);
        if (v === undefined) {
          v = make(i, j);
          memo.set(key, v);
        }
        if (v) out.push(v);
      }
    }
    return out;
  }

  /** A lake in a basin: a flat level just under the lowest point of its rim. Never near home, roads or rivers. */
  private readonly makeLake = (i: number, j: number): Lake | null => {
    const rng = new Rng(cellSeed(this.seed + 61, i, j));
    if (!rng.chance(0.42)) return null;
    const gx = (i + rng.range(0.3, 0.7)) * LAKE_CELL;
    const gz = (j + rng.range(0.3, 0.7)) * LAKE_CELL;
    const r = rng.range(16, 40);
    const depth = rng.range(0.5, 0.8);
    const x = gx - this.offsetX;
    const z = gz - this.offsetZ;
    const reach = r * (1 + LAKE_SHORE) * 1.25 + 8;
    if (Math.hypot(x, z) < reach + 110) return null;
    if (this.regions.clearance(x, z, reach) < reach || this.regions.featureNear(x, z, reach)) return null;
    const c = this.terrain(gx, gz, _parts2);
    if (c.land > 0.28) return null;
    const land = c.land;
    const macro = c.macro - this.siteHeight;
    let min = Infinity;
    let max = -Infinity;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const h = this.terrain(gx + Math.cos(a) * r * 1.05, gz + Math.sin(a) * r * 1.05, _parts2).h;
      if (h < min) min = h;
      if (h > max) max = h;
    }
    if (max - min > 3.5) return null;
    const rv = this.river(gx, gz, x, z, land, macro, _river2);
    if (rv.s > 0.05 && rv.d < r * 1.7 + 14) return null;
    return { x, z, r, depth, level: min - this.siteHeight - 0.2 };
  };

  /** A blast crater with a raised rim; about half hold a pool of poisoned runoff. */
  private readonly makeCrater = (i: number, j: number): Crater | null => {
    const rng = new Rng(cellSeed(this.seed + 83, i, j));
    if (!rng.chance(0.3)) return null;
    const gx = (i + rng.range(0.2, 0.8)) * CRATER_CELL;
    const gz = (j + rng.range(0.2, 0.8)) * CRATER_CELL;
    const r = rng.range(6, 18);
    const depth = r * rng.range(0.1, 0.14);
    const rim = r * 0.055;
    const wantPool = rng.chance(0.55);
    const x = gx - this.offsetX;
    const z = gz - this.offsetZ;
    if (Math.hypot(x, z) < 170) return null;
    if (this.regions.clearance(x, z, r * 1.7 + 8) < Infinity || this.regions.featureNear(x, z, r * 1.7 + 4)) return null;
    const c = this.terrain(gx, gz, _parts2);
    const hc = c.h - this.siteHeight;
    const rv = this.river(gx, gz, x, z, c.land, c.macro - this.siteHeight, _river2);
    if (rv.s > 0.05 && rv.d < rv.w + r * 1.7 + 6) return null;
    for (const lk of this.gather(this.lakes, LAKE_CELL, LAKE_REACH + r * 2, x, z, this.makeLake, [])) {
      if (Math.hypot(lk.x - x, lk.z - z) < lk.r * 1.6 + r * 1.7) return null;
    }
    let pool: number | null = null;
    if (wantPool) {
      let ring = Infinity;
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * TAU;
        const h = this.terrain(gx + Math.cos(a) * r * 0.95, gz + Math.sin(a) * r * 0.95, _parts2).h;
        ring = Math.min(ring, h - this.siteHeight);
      }
      const bowl = -depth * (1 - 0.95 * 0.95) + rim * Math.exp(-((0.05 / 0.25) ** 2));
      // The floor dips lowest on the downhill side of a slope; keep the pool wadeable from there.
      let floor = hc - depth;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * TAU;
        for (const q of [0.35, 0.65]) {
          const h = this.terrain(gx + Math.cos(a) * r * q, gz + Math.sin(a) * r * q, _parts2).h - this.siteHeight;
          floor = Math.min(floor, h - depth * (1 - q * q));
        }
      }
      pool = Math.min(ring + bowl - 0.3, hc - depth * 0.45, floor + 0.6);
      if (pool < floor + 0.25) pool = null;
    }
    return { x, z, r, depth, rim, pool };
  };

  /** A footbridge where a river runs deep: Newton steps walk the cell's point onto the centre line. */
  private readonly makeCrossing = (i: number, j: number): Crossing | null => {
    const rng = new Rng(cellSeed(this.seed + 97, i, j));
    if (!rng.chance(0.6)) return null;
    let gx = (i + rng.range(0.25, 0.75)) * CROSS_CELL;
    let gz = (j + rng.range(0.25, 0.75)) * CROSS_CELL;
    const e = 2;
    for (let k = 0; k < 6; k++) {
      const n = this.riverValue(gx, gz);
      const dx = (this.riverValue(gx + e, gz) - n) / e;
      const dz = (this.riverValue(gx, gz + e) - n) / e;
      const g2 = dx * dx + dz * dz;
      if (g2 < 1e-12 || Math.abs(n) / Math.sqrt(g2) > 90) return null;
      gx -= (dx * n) / g2;
      gz -= (dz * n) / g2;
    }
    if (Math.floor(gx / CROSS_CELL) !== i || Math.floor(gz / CROSS_CELL) !== j) return null;
    const x = gx - this.offsetX;
    const z = gz - this.offsetZ;
    if (Math.hypot(x, z) < 150 || this.regions.clearance(x, z, 45) < Infinity || this.regions.featureNear(x, z, 20)) return null;
    const t = this.terrain(gx, gz, _parts2);
    const rv = this.river(gx, gz, x, z, t.land, t.macro - this.siteHeight, _river2);
    if (rv.s < 0.85 || rv.d > 1.5 || rv.depth < 0.6) return null;
    const span = 2 * rv.w * 1.15 + 3;
    const length = FOOTBRIDGE_LENGTHS.find((l) => l >= span);
    if (!length) return null;
    return { x, z, nx: rv.gx, nz: rv.gz, hl: length / 2, hw: 1.4, deck: rv.wl + 0.6, length };
  };

  /** Road surface height at a road hit. */
  private gradeOf(hit: RoadHit): number {
    const g = hit.road.grade ?? this.computeGrade(hit.road);
    const k = Math.min(hit.k, hit.road.n - 2);
    return lerp(g[k], g[k + 1], hit.t);
  }

  /**
   * A road's grade: the ground along it (towns levelled) smoothed over ±24 m, flat through the
   * home yard, pinned to a shared height at its ends so junctions meet, and raised onto a
   * causeway where it crosses a river.
   */
  private computeGrade(road: Road): Float32Array {
    const n = road.n;
    const p = road.pts;
    const base = new Float32Array(n);
    for (let k = 0; k < n; k++) base[k] = this.gradeBase(p[k * 2], p[k * 2 + 1]);
    const g = new Float32Array(n);
    const win = 6;
    for (let k = 0; k < n; k++) {
      let acc = 0;
      let cnt = 0;
      for (let q = Math.max(0, k - win); q <= Math.min(n - 1, k + win); q++) {
        acc += base[q];
        cnt++;
      }
      g[k] = acc / cnt;
    }
    const ends = [this.nodeGrade(p[0], p[1]), this.nodeGrade(p[n * 2 - 2], p[n * 2 - 1])];
    for (let k = 0; k < n; k++) {
      const x = p[k * 2];
      const z = p[k * 2 + 1];
      let v = g[k];
      v = lerp(ends[0], v, smoothstep(0, 10, k));
      v = lerp(ends[1], v, smoothstep(0, 10, n - 1 - k));
      if (this.scale > 0) {
        const gx = x + this.offsetX;
        const gz = z + this.offsetZ;
        const t = this.terrain(gx, gz, _parts3);
        const r = this.river(gx, gz, x, z, t.land, t.macro - this.siteHeight, _river3);
        if (r.s > 0 && r.d < r.w + 30) {
          const hump = (1 - smoothstep(r.w + 3, r.w + 30, r.d)) * Math.min(1, r.s * 1.5);
          v = lerp(v, Math.max(v, r.wl + 0.9), hump);
        }
      }
      g[k] = lerp(v, 0, 1 - smoothstep(26, 72, Math.hypot(x, z)));
    }
    road.grade = g;
    return g;
  }

  /** The ground a road follows: raw hills with towns levelled (no water, pads or other roads). */
  private gradeBase(x: number, z: number): number {
    const h = this.terrain(x + this.offsetX, z + this.offsetZ, _parts3).h - this.siteHeight;
    const town = this.regions.townWeight(x, z);
    return town.meta ? lerp(h, this.townHeight(town.meta), town.w) : h;
  }

  /** One height for every road that ends at the same point, so junctions meet flush. */
  private nodeGrade(x: number, z: number): number {
    let acc = this.gradeBase(x, z);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      acc += this.gradeBase(x + Math.cos(a) * 14, z + Math.sin(a) * 14);
    }
    return acc / 7;
  }

  /** Level a town sits at: the average of the hills under its grid. */
  private townHeight(m: RegionMeta): number {
    let h = this.townHeights.get(m);
    if (h !== undefined) return h;
    let acc = 0;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) acc += this.terrain(m.x + i * m.townR * 0.4 + this.offsetX, m.z + j * m.townR * 0.4 + this.offsetZ, _parts3).h;
    }
    h = acc / 25 - this.siteHeight;
    this.townHeights.set(m, h);
    return h;
  }

  /** First good lowland pad near the generation origin, with hills visible just past the yard. */
  private findHome(): { x: number; z: number; h: number } {
    let best = { x: 0, z: 0, h: this.raw(0, 0), score: this.scoreSite(0, 0) };
    const reach = Math.min(CONFIG.world.homeSearch, 180);
    const step = 16;
    for (let r = 0; r <= reach; r += step) {
      const n = r === 0 ? 1 : Math.max(6, Math.round((Math.PI * 2 * r) / step));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.61;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        const score = this.scoreSite(x, z);
        if (score > best.score) {
          best = { x, z, h: this.raw(x, z), score };
          if (score > 9) return best;
        }
      }
    }
    return best;
  }

  private scoreSite(x: number, z: number): number {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let n = 0;
    for (let i = -2; i <= 2; i++) {
      for (let j = -2; j <= 2; j++) {
        const h = this.raw(x + i * 6, z + j * 6);
        sum += h;
        n++;
        if (h < min) min = h;
        if (h > max) max = h;
      }
    }
    const mean = sum / n;
    const range = max - min;
    if (mean > 8.5) return -80;
    if (range > 2.8) return -40;
    // Dry: no river line close enough to show past the yard.
    const rn = this.riverValue(x, z);
    const rg = Math.hypot(this.riverValue(x + 2, z) - rn, this.riverValue(x, z + 2) - rn) / 2;
    if (Math.abs(rn) / Math.max(rg, 1e-6) < 150) return -60;
    let farMin = Infinity;
    let farMax = -Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const h = this.raw(x + Math.cos(a) * 95, z + Math.sin(a) * 95);
      if (h < farMin) farMin = h;
      if (h > farMax) farMax = h;
    }
    const relief = clamp(farMax - mean, 0, 14);
    return 8 - mean * 0.22 - range * 2.6 + relief * 0.55 - Math.hypot(x, z) * 0.012;
  }
}

/** Greedy rectangle merge of marked 1 m cells. */
function mergeCells(mark: Uint8Array, n: number, x0: number, z0: number): CliffBox[] {
  const used = new Uint8Array(n * n);
  const boxes: CliffBox[] = [];
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const i = iz * n + ix;
      if (!mark[i] || used[i]) continue;
      let w = 1;
      while (ix + w < n && mark[iz * n + ix + w] && !used[iz * n + ix + w]) w++;
      let h = 1;
      grow: while (iz + h < n) {
        for (let k = 0; k < w; k++) {
          const j = (iz + h) * n + ix + k;
          if (!mark[j] || used[j]) break grow;
        }
        h++;
      }
      for (let jz = 0; jz < h; jz++) {
        for (let kx = 0; kx < w; kx++) used[(iz + jz) * n + ix + kx] = 1;
      }
      boxes.push({ x: x0 + ix + w / 2, z: z0 + iz + h / 2, hw: w / 2, hd: h / 2 });
    }
  }
  return boxes;
}

/** Levels pads in, but never over a road surface (pads are kept clear of roads). */
function applyPads(h: number, x: number, z: number, pads: readonly Pad[], regions: Regions): number {
  const keep = smoothstep(0, 0.4, regions.clearance(x, z, 1));
  if (keep <= 0) return h;
  for (const p of pads) {
    const d = Math.hypot(Math.max(0, Math.abs(x - p.x) - p.hw), Math.max(0, Math.abs(z - p.z) - p.hd));
    if (d >= p.blend) continue;
    h = lerp(h, p.y, (1 - smoothstep(0, p.blend, d)) * keep);
  }
  return h;
}
