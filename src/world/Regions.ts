import { CONFIG } from '../data/config';
import type { ContainerId } from '../data/loot';
import type { NodeId } from '../data/nodes';
import { createNoise2D, fbm, type Noise2D } from '../core/noise';
import { Rng } from '../core/random';

/** Region side, metres. Each region has one district and one node where its highways meet. */
export const REGION = 512;
/** Road centre lines are sampled this often, metres. */
const STEP = 4;
/** Farthest a road can shape the ground from its centre line (half width + embankment). */
const ROAD_REACH = 13;
const CELL = CONFIG.world.chunkSize;
const BLOCK = 40;

export type District = 'home' | 'town' | 'industrial' | 'farm' | 'wilds' | 'marsh';
export type RoadKind = 'highway' | 'street';
export type DecalKind = 'pad' | 'field' | 'puddle' | 'tracks' | 'scorch' | 'spill';

export const DISTRICT_LABEL: Record<District, string> = {
  home: 'Home', town: 'Town', industrial: 'Industrial Yards', farm: 'Farms', wilds: 'Wilds', marsh: 'Marsh',
};

export interface Road {
  readonly id: string;
  readonly kind: RoadKind;
  readonly width: number;
  /** x, z pairs every `STEP` metres along the centre line. */
  readonly pts: Float32Array;
  readonly n: number;
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  /** Tiny per-road lift so crossing road surfaces never z-fight. */
  readonly lift: number;
  /** Surface height per sample; filled in by the height field the first time it is needed. */
  grade: Float32Array | null;
}

/** Closest point on a road to a query point. */
export interface RoadHit {
  road: Road;
  k: number;
  t: number;
  dist: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** A planned piece of a multi-chunk feature; the chunk it lands in builds it. */
export type FeatureItem =
  | { kind: 'structure'; uid: string; model: string; x: number; z: number; rot: number; r: number }
  | { kind: 'node'; uid: string; node: NodeId; x: number; z: number; rot: number; r: number }
  | { kind: 'container'; uid: string; container: ContainerId; x: number; z: number; rot: number; r: number }
  | { kind: 'prop'; model: string; x: number; z: number; rot: number; r: number };

/** A flat mark draped on the ground. `w` runs along local X (turned by `rot`), `d` along local Z. */
export interface Decal {
  kind: DecalKind;
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  seed: number;
}

/** A rectangle to level (yard floors). Its height is worked out by the chunk that owns its centre. */
export interface PadRect {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

/** Where a region's highways meet, and how big the place around it is. */
export interface RegionMeta {
  i: number;
  j: number;
  district: District;
  x: number;
  z: number;
  /** Half-size of a town's street grid (0 if not a town). */
  townR: number;
}

export interface Region extends RegionMeta {
  streets: Road[];
  items: FeatureItem[];
  decals: Decal[];
  pads: PadRect[];
  /** No scatter (trees, rocks) inside these: yards, fields, lots. */
  blocks: Rect[];
  /** Town core: rivers stay out, ground is levelled. */
  core: Rect | null;
}

interface Seg {
  road: Road;
  k: number;
}

const key = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
const cellSeed = (salt: number, i: number, j: number) => (Math.imul(i + 7121, 73856093) ^ Math.imul(j - 2879, 19349663) ^ salt) >>> 0;
export const regionIndex = (v: number) => Math.floor((v + REGION / 2) / REGION);

/**
 * The large-scale layout: 512 m regions, each with a district and a node. Highways join every
 * node to its east and south neighbours (worked out the same from either side), towns lay a
 * street grid around their node with lots facing the streets, industrial districts fence off
 * yards and farms rule fields. Chunks only ever build the pieces that land inside them.
 */
export class Regions {
  private readonly metas = new Map<number, RegionMeta>();
  private readonly regions = new Map<number, Region>();
  private readonly edges = new Map<string, Road | null>();
  private readonly around = new Map<number, Road[]>();
  private readonly cells = new Map<number, Seg[]>();
  private readonly warpX: Noise2D;
  private readonly warpZ: Noise2D;
  private roadCount = 0;

  constructor(private readonly seed: number) {
    this.warpX = createNoise2D(seed + 9101);
    this.warpZ = createNoise2D(seed + 9102);
  }

  meta(i: number, j: number): RegionMeta {
    const k = key(i, j);
    let m = this.metas.get(k);
    if (m) return m;
    if (i === 0 && j === 0) {
      m = { i, j, district: 'home', x: 0, z: CONFIG.world.roadZ, townR: 0 };
    } else {
      const rng = new Rng(cellSeed(this.seed + 131, i, j));
      const x = i * REGION + rng.range(-110, 110);
      const z = j * REGION + rng.range(-110, 110);
      const roll = rng.next();
      const near = Math.hypot(x, z) < 700;
      const district: District = near
        ? roll < 0.4 ? 'town' : roll < 0.7 ? 'farm' : 'wilds'
        : roll < 0.28 ? 'industrial' : roll < 0.52 ? 'marsh' : roll < 0.74 ? 'town' : roll < 0.87 ? 'farm' : 'wilds';
      m = { i, j, district, x, z, townR: district === 'town' ? rng.pick([80, 100, 120]) : 0 };
    }
    this.metas.set(k, m);
    return m;
  }

  /** The district a point belongs to: the nearest node, measured through a gentle warp so borders wander. */
  districtAt(x: number, z: number): RegionMeta {
    const wx = x + fbm(this.warpX, x * 0.004, z * 0.004, 2) * 110;
    const wz = z + fbm(this.warpZ, x * 0.004, z * 0.004, 2) * 110;
    const ri = regionIndex(wx);
    const rj = regionIndex(wz);
    let best = this.meta(ri, rj);
    let bestD = Infinity;
    for (let i = ri - 1; i <= ri + 1; i++) {
      for (let j = rj - 1; j <= rj + 1; j++) {
        const m = this.meta(i, j);
        const d = (m.x - wx) ** 2 + (m.z - wz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
    }
    return best;
  }

  region(i: number, j: number): Region {
    const k = key(i, j);
    let r = this.regions.get(k);
    if (!r) {
      r = this.build(this.meta(i, j));
      this.regions.set(k, r);
    }
    return r;
  }

  /** Regions whose features could reach a point. */
  regionsNear(x: number, z: number): Region[] {
    const ri = regionIndex(x);
    const rj = regionIndex(z);
    const out: Region[] = [];
    for (let i = ri - 1; i <= ri + 1; i++) for (let j = rj - 1; j <= rj + 1; j++) out.push(this.region(i, j));
    return out;
  }

  /** 1 inside a town core, fading to 0 over 60 m outside it. */
  townWeight(x: number, z: number): { w: number; meta: RegionMeta | null } {
    const ri = regionIndex(x);
    const rj = regionIndex(z);
    let w = 0;
    let meta: RegionMeta | null = null;
    for (let i = ri - 1; i <= ri + 1; i++) {
      for (let j = rj - 1; j <= rj + 1; j++) {
        const m = this.meta(i, j);
        if (!m.townR) continue;
        const d = Math.max(Math.abs(x - m.x), Math.abs(z - m.z)) - m.townR - 10;
        const v = d <= 0 ? 1 : d >= 60 ? 0 : 1 - (d / 60) * (d / 60) * (3 - (2 * d) / 60);
        if (v > w) {
          w = v;
          meta = m;
        }
      }
    }
    return { w, meta };
  }

  /** Every road that passes within `ROAD_REACH` of a 32 m cell. */
  segments(cx: number, cz: number): readonly Seg[] {
    const k = key(cx, cz);
    let list = this.cells.get(k);
    if (list) return list;
    list = [];
    const x0 = cx * CELL - ROAD_REACH;
    const x1 = (cx + 1) * CELL + ROAD_REACH;
    const z0 = cz * CELL - ROAD_REACH;
    const z1 = (cz + 1) * CELL + ROAD_REACH;
    for (const road of this.roadsAround(regionIndex(cx * CELL + CELL / 2), regionIndex(cz * CELL + CELL / 2))) {
      if (road.maxX < x0 || road.minX > x1 || road.maxZ < z0 || road.minZ > z1) continue;
      const p = road.pts;
      for (let s = 0; s < road.n - 1; s++) {
        const ax = p[s * 2];
        const az = p[s * 2 + 1];
        const bx = p[s * 2 + 2];
        const bz = p[s * 2 + 3];
        if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
        list.push({ road, k: s });
      }
    }
    this.cells.set(k, list);
    return list;
  }

  /** Roads whose centre line passes through a chunk (for drawing and bridges). */
  roadsIn(cx: number, cz: number): Road[] {
    return [...new Set(this.segments(cx, cz).map((s) => s.road))];
  }

  /** The closest point of each road within `ROAD_REACH`. Fills and returns `out`. */
  nearRoads(x: number, z: number, out: RoadHit[]): RoadHit[] {
    out.length = 0;
    for (const s of this.segments(Math.floor(x / CELL), Math.floor(z / CELL))) {
      const p = s.road.pts;
      const ax = p[s.k * 2];
      const az = p[s.k * 2 + 1];
      const dx = p[s.k * 2 + 2] - ax;
      const dz = p[s.k * 2 + 3] - az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
      const dist = Math.hypot(x - ax - dx * t, z - az - dz * t);
      if (dist > ROAD_REACH) continue;
      const prev = out.find((h) => h.road === s.road);
      if (prev) {
        if (dist < prev.dist) Object.assign(prev, { k: s.k, t, dist });
      } else {
        out.push({ road: s.road, k: s.k, t, dist });
      }
    }
    return out;
  }

  /** Distance from a point to the nearest road edge (negative on the road), or Infinity past `reach`. */
  clearance(x: number, z: number, reach = ROAD_REACH): number {
    let best = Infinity;
    const r = Math.min(reach, 200);
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) {
        for (const s of this.segments(cx, cz)) {
          const p = s.road.pts;
          const ax = p[s.k * 2];
          const az = p[s.k * 2 + 1];
          const dx = p[s.k * 2 + 2] - ax;
          const dz = p[s.k * 2 + 3] - az;
          const len2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
          const d = Math.hypot(x - ax - dx * t, z - az - dz * t) - s.road.width / 2;
          if (d < best) best = d;
        }
      }
    }
    return best <= reach ? best : Infinity;
  }

  /** Inside a yard, field, lot or town block? */
  blocked(x: number, z: number, r: number): boolean {
    for (const reg of this.regionsNear(x, z)) {
      for (const b of reg.blocks) {
        if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
      }
    }
    return false;
  }

  /** Any planned feature (town, yard, field) within `r` of a point? Lakes and craters keep clear. */
  featureNear(x: number, z: number, r: number): boolean {
    if (this.blocked(x, z, r)) return true;
    for (const reg of this.regionsNear(x, z)) {
      const c = reg.core;
      if (c && x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
    }
    return false;
  }

  // --- Layout ----------------------------------------------------------------------------------

  private roadsAround(ri: number, rj: number): Road[] {
    const k = key(ri, rj);
    let list = this.around.get(k);
    if (list) return list;
    list = [];
    for (let i = ri - 1; i <= ri + 1; i++) {
      for (let j = rj - 1; j <= rj + 1; j++) {
        for (const dir of ['e', 's'] as const) {
          const e = this.edge(i, j, dir);
          if (e) list.push(e);
        }
        list.push(...this.region(i, j).streets);
      }
    }
    this.around.set(k, list);
    return list;
  }

  /** How far a highway runs straight out of a node before it starts to curve. */
  private exitLength(m: RegionMeta): number {
    if (m.district === 'home') return 140;
    if (m.townR) return m.townR + 8;
    return m.district === 'industrial' || m.district === 'farm' ? 40 : 12;
  }

  /** The highway from a node to its east (`e`) or south (`s`) neighbour. Home only runs east–west. */
  private edge(i: number, j: number, dir: 'e' | 's'): Road | null {
    const id = `${i},${j}${dir}`;
    if (this.edges.has(id)) return this.edges.get(id)!;
    let road: Road | null = null;
    const a = this.meta(i, j);
    const b = dir === 'e' ? this.meta(i + 1, j) : this.meta(i, j + 1);
    if (!(dir === 's' && (a.district === 'home' || b.district === 'home'))) {
      const rng = new Rng(cellSeed(this.seed + (dir === 'e' ? 151 : 173), i, j));
      const ax = dir === 'e' ? 1 : 0;
      const az = dir === 'e' ? 0 : 1;
      const ea = this.exitLength(a);
      const eb = this.exitLength(b);
      const a1x = a.x + ax * ea;
      const a1z = a.z + az * ea;
      const b1x = b.x - ax * eb;
      const b1z = b.z - az * eb;
      const L = Math.hypot(b1x - a1x, b1z - a1z);
      const j1 = rng.range(-0.16, 0.16) * L;
      const j2 = rng.range(-0.16, 0.16) * L;
      const c1x = a1x + ax * L * 0.36 + az * j1;
      const c1z = a1z + az * L * 0.36 + ax * j1;
      const c2x = b1x - ax * L * 0.36 + az * j2;
      const c2z = b1z - az * L * 0.36 + ax * j2;
      const raw: number[] = [a.x, a.z];
      for (let s = 0; s <= 64; s++) {
        const t = s / 64;
        const u = 1 - t;
        raw.push(
          u * u * u * a1x + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b1x,
          u * u * u * a1z + 3 * u * u * t * c1z + 3 * u * t * t * c2z + t * t * t * b1z,
        );
      }
      raw.push(b.x, b.z);
      road = this.makeRoad(`h${id}`, 'highway', CONFIG.world.roadWidth, raw);
    }
    this.edges.set(id, road);
    return road;
  }

  private makeRoad(id: string, kind: RoadKind, width: number, raw: number[]): Road {
    const pts = resample(raw);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pts.length; i += 2) {
      minX = Math.min(minX, pts[i]);
      maxX = Math.max(maxX, pts[i]);
      minZ = Math.min(minZ, pts[i + 1]);
      maxZ = Math.max(maxZ, pts[i + 1]);
    }
    const lift = 0.02 + (this.roadCount++ % 6) * 0.004 + (kind === 'highway' ? 0.002 : 0);
    return { id, kind, width, pts, n: pts.length / 2, minX, maxX, minZ, maxZ, lift, grade: null };
  }

  private build(m: RegionMeta): Region {
    const reg: Region = { ...m, streets: [], items: [], decals: [], pads: [], blocks: [], core: null };
    const rng = new Rng(cellSeed(this.seed + 211, m.i, m.j));
    const own = [this.edge(m.i, m.j, 'e'), this.edge(m.i - 1, m.j, 'e'), this.edge(m.i, m.j, 's'), this.edge(m.i, m.j - 1, 's')];
    const ctx = new Planner(reg, rng, own.filter((r): r is Road => !!r));
    switch (m.district) {
      case 'town':
        this.planTown(reg, ctx);
        break;
      case 'industrial':
        planYards(reg, ctx, rng.int(2, 4));
        break;
      case 'farm':
        planFarm(reg, ctx);
        break;
      case 'marsh':
        planMarsh(reg, ctx);
        break;
      case 'wilds':
        if (rng.chance(0.55)) ctx.house(m.x + rng.sign() * 18, m.z + rng.sign() * 16, 'structure.ruinHouse');
        break;
      default:
        break;
    }
    return reg;
  }

  /** Streets every 40 m around the node (the centre lines are the highways), lots on both sides. */
  private planTown(reg: Region, p: Planner): void {
    const { x: cx, z: cz, townR: R } = reg;
    reg.core = { minX: cx - R, maxX: cx + R, minZ: cz - R, maxZ: cz + R };
    const n = Math.floor((R - 20) / BLOCK);
    const lines: number[] = [0];
    for (let k = 1; k <= n; k++) lines.push(k * BLOCK, -k * BLOCK);
    const sw = CONFIG.world.streetWidth;
    for (const o of lines) {
      if (o === 0) continue;
      reg.streets.push(this.makeRoad(`s${reg.i},${reg.j}x${o}`, 'street', sw, [cx + o, cz - R, cx + o, cz + R]));
      reg.streets.push(this.makeRoad(`s${reg.i},${reg.j}z${o}`, 'street', sw, [cx - R, cz + o, cx + R, cz + o]));
    }
    const nearLine = (v: number) => lines.some((o) => Math.abs(v - o) < 10.5);
    for (const o of lines) {
      for (let u = -R + 8; u <= R - 8; u += 14) {
        if (nearLine(u)) continue;
        for (const side of [-1, 1]) {
          // Lots along the north–south line x = o, then along the east–west line z = o.
          p.lot(cx + o + side * 10.5, cz + u, -side, 0);
          p.lot(cx + u, cz + o + side * 10.5, 0, -side);
        }
      }
      for (let u = -R + 6; u <= R - 6; u += 28) {
        if (p.rng.chance(0.5)) p.prop('prop.lampPost', cx + o + (CONFIG.world.roadWidth / 2 + 0.9), cz + u, -Math.PI / 2, 0.5);
      }
    }
    for (let k = 0; k < 6; k++) {
      p.decal(p.rng.chance(0.5) ? 'puddle' : 'scorch', cx + p.rng.range(-R, R), cz + p.rng.range(-R, R), p.rng.range(1.5, 3.5));
    }
  }
}

/** Shared bookkeeping while laying out one region's features. */
class Planner {
  private n = 0;
  private readonly taken: Rect[] = [];

  constructor(private readonly reg: Region, readonly rng: Rng, private readonly roads: readonly Road[]) {}

  uid(): string {
    return `g${this.reg.i},${this.reg.j}:${this.n++}`;
  }

  /** Reserves a rectangle (with margin) if it is still free and clear of this node's highways. */
  claim(r: Rect, margin = 4): boolean {
    for (const t of this.taken) {
      if (r.minX - margin < t.maxX && r.maxX + margin > t.minX && r.minZ - margin < t.maxZ && r.maxZ + margin > t.minZ) return false;
    }
    const pad = CONFIG.world.roadWidth / 2 + 6;
    for (const road of this.roads) {
      if (road.maxX < r.minX - pad || road.minX > r.maxX + pad || road.maxZ < r.minZ - pad || road.minZ > r.maxZ + pad) continue;
      for (let k = 0; k < road.n; k++) {
        const x = road.pts[k * 2];
        const z = road.pts[k * 2 + 1];
        if (x > r.minX - pad && x < r.maxX + pad && z > r.minZ - pad && z < r.maxZ + pad) return false;
      }
    }
    this.taken.push(r);
    return true;
  }

  prop(model: string, x: number, z: number, rot: number, r: number): void {
    this.reg.items.push({ kind: 'prop', model, x, z, rot, r });
  }

  node(node: NodeId, x: number, z: number, rot: number, r: number): void {
    this.reg.items.push({ kind: 'node', uid: this.uid(), node, x, z, rot, r });
  }

  container(container: ContainerId, x: number, z: number, rot: number): void {
    this.reg.items.push({ kind: 'container', uid: this.uid(), container, x, z, rot, r: 0.7 });
  }

  /** A structure whose door (local +Z) faces (fx, fz). */
  house(x: number, z: number, model: string, fx = 0, fz = 1): void {
    const r = model === 'structure.labRuin' ? 7 : 5.2;
    this.reg.items.push({ kind: 'structure', uid: this.uid(), model, x, z, rot: Math.atan2(fx, fz), r });
    this.reg.blocks.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r });
  }

  decal(kind: DecalKind, x: number, z: number, w: number, d = w, rot = this.rng.range(0, Math.PI * 2)): void {
    this.reg.decals.push({ kind, x, z, rot, w, d, seed: this.rng.int(0, 1e9) });
  }

  /** A town lot facing a street in direction (fx, fz): a ruin, a parked wreck, rubble, or nothing. */
  lot(x: number, z: number, fx: number, fz: number): void {
    const roll = this.rng.next();
    const along = Math.atan2(fz, fx) + Math.PI / 2;
    if (roll < 0.55) this.house(x, z, 'structure.ruinHouse', fx, fz);
    else if (roll < 0.7) this.node('car', x + fx * 5, z + fz * 5, along + this.rng.range(-0.2, 0.2), 2.7);
    else if (roll < 0.8) this.node('rubble', x, z, this.rng.range(0, 6.3), 1.2);
    if (this.rng.chance(0.3)) this.prop('prop.fence', x - fx * 6.5, z - fz * 6.5, along, 1.8);
  }

  /** Fence segments (3 m each) around a rectangle, with a gate gap on one side and a few broken bits. */
  fence(r: Rect, gateSide: number): void {
    const sides: [number, number, number, number, number][] = [
      [r.minX, r.minZ, r.maxX, r.minZ, 0], [r.maxX, r.minZ, r.maxX, r.maxZ, Math.PI / 2],
      [r.minX, r.maxZ, r.maxX, r.maxZ, 0], [r.minX, r.minZ, r.minX, r.maxZ, Math.PI / 2],
    ];
    sides.forEach(([ax, az, bx, bz, rot], side) => {
      const len = Math.hypot(bx - ax, bz - az);
      const count = Math.floor(len / 3);
      for (let k = 0; k < count; k++) {
        const t = (k + 0.5) / count;
        if (side === gateSide && Math.abs(t - 0.5) * len < 3.5) continue;
        if (this.rng.chance(0.15)) continue;
        this.prop('prop.fence', ax + (bx - ax) * t, az + (bz - az) * t, rot, 1.8);
      }
    });
  }
}

/** Picks a spot in one of the four quadrants off the node's highways (which run along its axes). */
function offRoad(reg: Region, p: Planner, hw: number, hd: number, min: number, max: number): Rect | null {
  for (let t = 0; t < 12; t++) {
    const sx = p.rng.sign();
    const sz = p.rng.sign();
    const x = reg.x + sx * (p.rng.range(min, max) + hw);
    const z = reg.z + sz * (p.rng.range(min, max) + hd);
    const r = { minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd };
    if (p.claim(r, 8)) return r;
  }
  return null;
}

/** Fenced concrete yards: a lab ruin or junk piles inside, barrels, crates and spills. */
function planYards(reg: Region, p: Planner, count: number): void {
  for (let k = 0; k < count; k++) {
    const hw = p.rng.range(12, 18);
    const hd = p.rng.range(10, 15);
    const r = offRoad(reg, p, hw, hd, 10, 70);
    if (!r) continue;
    const x = (r.minX + r.maxX) / 2;
    const z = (r.minZ + r.maxZ) / 2;
    reg.pads.push({ x, z, hw: hw + 1, hd: hd + 1 });
    reg.blocks.push(r);
    p.decal('pad', x, z, hw * 2 + 1, hd * 2 + 1, 0);
    // Gate on the side facing the node.
    const gate = Math.abs(x - reg.x) > Math.abs(z - reg.z) ? (x > reg.x ? 3 : 1) : z > reg.z ? 0 : 2;
    p.fence(r, gate);
    if (p.rng.chance(0.6)) p.house(x, z, 'structure.labRuin', reg.x - x, reg.z - z);
    else {
      for (let n = 0; n < 3; n++) p.node('scrapPile', x + p.rng.range(-hw + 3, hw - 3), z + p.rng.range(-hd + 3, hd - 3), p.rng.range(0, 6.3), 1.3);
    }
    for (let n = p.rng.int(3, 6); n > 0; n--) {
      const bx = x + (p.rng.chance(0.5) ? -1 : 1) * p.rng.range(hw - 4, hw - 1.5);
      const bz = z + p.rng.range(-hd + 2, hd - 2);
      p.node(p.rng.chance(0.3) ? 'toxicBarrel' : 'barrel', bx, bz, p.rng.range(0, 6.3), 0.6);
    }
    for (let n = p.rng.int(1, 2); n > 0; n--) p.container('crate', x + p.rng.range(-hw + 2, hw - 2), z + (p.rng.chance(0.5) ? -1 : 1) * (hd - 1.6), p.rng.range(0, 6.3));
    for (let n = p.rng.int(1, 3); n > 0; n--) p.decal('spill', x + p.rng.range(-hw, hw), z + p.rng.range(-hd, hd), p.rng.range(2, 4.5));
    p.prop('prop.lampPost', x + p.rng.range(-hw, hw) * 0.8, z + p.rng.range(-hd, hd) * 0.8, p.rng.range(0, 6.3), 0.5);
  }
}

/** Ploughed fields around a farmhouse by the road, with fences along some edges. */
function planFarm(reg: Region, p: Planner): void {
  const fx = p.rng.sign();
  p.house(reg.x + fx * 17, reg.z + p.rng.sign() * 16, 'structure.ruinHouse', -fx, 0);
  for (let k = p.rng.int(3, 5); k > 0; k--) {
    const hw = p.rng.range(16, 28);
    const hd = p.rng.range(11, 20);
    const r = offRoad(reg, p, hw, hd, 12, 110);
    if (!r) continue;
    const x = (r.minX + r.maxX) / 2;
    const z = (r.minZ + r.maxZ) / 2;
    reg.blocks.push(r);
    p.decal('field', x, z, hw * 2, hd * 2, p.rng.chance(0.5) ? 0 : Math.PI / 2);
    const sides = [0, 1, 2, 3].filter(() => p.rng.chance(0.4));
    for (const side of sides) {
      const horiz = side % 2 === 0;
      const len = horiz ? hw * 2 : hd * 2;
      for (let s = 0; s < Math.floor(len / 3); s++) {
        if (p.rng.chance(0.2)) continue;
        const t = -len / 2 + (s + 0.5) * 3;
        const px = horiz ? x + t : side === 1 ? r.maxX + 1 : r.minX - 1;
        const pz = horiz ? (side === 0 ? r.minZ - 1 : r.maxZ + 1) : z + t;
        p.prop('prop.fence', px, pz, horiz ? 0 : Math.PI / 2, 1.8);
      }
    }
    if (p.rng.chance(0.5)) p.node('carcass', x + p.rng.range(-hw, hw) * 0.7, z + p.rng.range(-hd, hd) * 0.7, p.rng.range(0, 6.3), 1.1);
  }
  for (let k = 0; k < 3; k++) p.decal('tracks', reg.x + p.rng.range(-60, 60), reg.z + p.rng.range(-60, 60), p.rng.range(8, 14), 2.2);
}

/** A lab or two leaking into the marsh, with drums and spills around them. */
function planMarsh(reg: Region, p: Planner): void {
  for (let k = p.rng.int(1, 2); k > 0; k--) {
    const r = offRoad(reg, p, 9, 8, 14, 60);
    if (!r) continue;
    const x = (r.minX + r.maxX) / 2;
    const z = (r.minZ + r.maxZ) / 2;
    p.house(x, z, 'structure.labRuin', reg.x - x, reg.z - z);
    for (let n = 0; n < 4; n++) p.node('toxicBarrel', x + p.rng.range(-14, 14), z + p.rng.range(-12, 12), p.rng.range(0, 6.3), 0.9);
    for (let n = 0; n < 3; n++) p.decal('spill', x + p.rng.range(-16, 16), z + p.rng.range(-14, 14), p.rng.range(2.5, 5));
  }
}

/** Resamples a dense polyline (x, z pairs) to points every `STEP` metres, keeping both ends. */
function resample(raw: number[]): Float32Array {
  const out: number[] = [raw[0], raw[1]];
  let acc = 0;
  let next = STEP;
  for (let i = 2; i < raw.length; i += 2) {
    const ax = raw[i - 2];
    const az = raw[i - 1];
    const bx = raw[i];
    const bz = raw[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    while (seg > 0 && acc + seg >= next) {
      const t = (next - acc) / seg;
      out.push(ax + (bx - ax) * t, az + (bz - az) * t);
      next += STEP;
    }
    acc += seg;
  }
  const lx = raw[raw.length - 2];
  const lz = raw[raw.length - 1];
  if (Math.hypot(lx - out[out.length - 2], lz - out[out.length - 1]) > 0.5) out.push(lx, lz);
  return new Float32Array(out);
}
