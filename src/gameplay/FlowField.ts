import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { FLOORABLE_TAG, HALF_TAG, type CollisionWorld } from '../physics/Collision';
import { CLIFF_TAG, WATER_TAG, type HeightField } from '../world/Height';
import { BUILD_TAG, DEPLOY_TAG } from './Building';

const R = CONFIG.raid.fieldRadius;
const CELL = CONFIG.raid.fieldCell;
const N = Math.ceil((R * 2) / CELL);
const GOAL = Math.floor(N / 2);

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414],
];

/** Bits from `CollisionWorld.tagMaskAt`: 1 = untagged, then one per tag in this order. */
const TAGS = [FLOORABLE_TAG, HALF_TAG, BUILD_TAG, DEPLOY_TAG, CLIFF_TAG, WATER_TAG];
const SOLID = 1;
const HALF = 4;
const BUILT = 8 | 16;
const CLIFF = 32;
const WATER = 64;
/** Which mask bits block each kind of mover. */
const BLOCKS_WALK = SOLID | HALF | BUILT | CLIFF | WATER;
const BLOCKS_CRAWL = SOLID | BUILT | CLIFF | WATER;
const BLOCKS_CLIMB = SOLID | WATER;

export type FlowMode = 'walk' | 'crawl' | 'climb';

/**
 * Flow fields covering the Home Zone and the spawn ring: one for walking mutants, one that treats
 * half-walls as open so crawlers can slip through, and one that ignores player-built pieces for
 * climbers. Rebuilt when colliders change.
 */
export class FlowField {
  private readonly walkCost: Float32Array;
  private readonly crawlCost: Float32Array;
  private readonly climbCost: Float32Array;
  private readonly walkDir: Float32Array;
  private readonly crawlDir: Float32Array;
  private readonly climbDir: Float32Array;
  private readonly masks: Uint8Array;
  private lastVersion = -1;
  private cooldown = 0;
  private goalX = 0;
  private goalZ = 0;
  private goalDirty = true;
  debug: THREE.LineSegments | null = null;

  constructor(private readonly collision: CollisionWorld, private readonly height?: HeightField) {
    const cells = N * N;
    collision.setWatch(R + CELL * 2);
    this.masks = new Uint8Array(cells);
    this.walkCost = new Float32Array(cells);
    this.crawlCost = new Float32Array(cells);
    this.climbCost = new Float32Array(cells);
    this.walkDir = new Float32Array(cells * 2);
    this.crawlDir = new Float32Array(cells * 2);
    this.climbDir = new Float32Array(cells * 2);
    this.rebuild();
  }

  /** Mutants flow toward this ground point (the cure, or the player while it's carried). */
  setGoal(x: number, z: number): void {
    if (Math.hypot(x - this.goalX, z - this.goalZ) < CELL * 0.35) return;
    this.goalX = x;
    this.goalZ = z;
    this.goalDirty = true;
  }

  /** Call every tick. Rebuilds at most a few times a second after the collision world or the goal changes. */
  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if ((this.collision.watchVersion !== this.lastVersion || this.goalDirty) && this.cooldown <= 0) {
      this.rebuild();
      this.cooldown = 0.28;
    }
  }

  /** Unit ground direction toward the hut, or (0,0) if this spot is boxed in. */
  sample(x: number, z: number, mode: FlowMode = 'walk'): { x: number; z: number } {
    const gx = x / CELL + GOAL;
    const gz = z / CELL + GOAL;
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const tx = gx - x0;
    const tz = gz - z0;
    const dir = mode === 'climb' ? this.climbDir : mode === 'crawl' ? this.crawlDir : this.walkDir;
    const ax = this.dirAt(dir, x0, z0, 0);
    const az = this.dirAt(dir, x0, z0, 1);
    const bx = this.dirAt(dir, x0 + 1, z0, 0);
    const bz = this.dirAt(dir, x0 + 1, z0, 1);
    const cx = this.dirAt(dir, x0, z0 + 1, 0);
    const cz = this.dirAt(dir, x0, z0 + 1, 1);
    const dx = this.dirAt(dir, x0 + 1, z0 + 1, 0);
    const dz = this.dirAt(dir, x0 + 1, z0 + 1, 1);
    let fx = ax * (1 - tx) * (1 - tz) + bx * tx * (1 - tz) + cx * (1 - tx) * tz + dx * tx * tz;
    let fz = az * (1 - tx) * (1 - tz) + bz * tx * (1 - tz) + cz * (1 - tx) * tz + dz * tx * tz;
    const len = Math.hypot(fx, fz);
    if (len < 0.05) return { x: 0, z: 0 };
    return { x: fx / len, z: fz / len };
  }

  private dirAt(dir: Float32Array, ix: number, iz: number, axis: 0 | 1): number {
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return 0;
    return dir[(iz * N + ix) * 2 + axis];
  }

  rebuild(): void {
    this.lastVersion = this.collision.watchVersion;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        this.masks[iz * N + ix] = this.collision.tagMaskAt((ix - GOAL) * CELL, (iz - GOAL) * CELL, CELL * 0.42, TAGS);
      }
    }
    this.goalDirty = false;
    integrate(this.masks, BLOCKS_WALK, this.walkCost, this.walkDir, this.height, 1, this.goalX, this.goalZ);
    integrate(this.masks, BLOCKS_CRAWL, this.crawlCost, this.crawlDir, this.height, 1, this.goalX, this.goalZ);
    integrate(this.masks, BLOCKS_CLIMB, this.climbCost, this.climbDir, this.height, 0.28, this.goalX, this.goalZ);
    if (this.debug?.visible) this.rebuildDebug();
  }

  setDebug(scene: THREE.Scene, on: boolean): void {
    if (on && !this.debug) {
      this.debug = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthTest: false }),
      );
      this.debug.renderOrder = 997;
      this.debug.name = 'flow-debug';
      scene.add(this.debug);
    }
    if (this.debug) this.debug.visible = on;
    if (on) this.rebuildDebug();
  }

  private rebuildDebug(): void {
    if (!this.debug) return;
    const pts: number[] = [];
    const cols: number[] = [];
    const step = 2;
    for (let iz = 0; iz < N; iz += step) {
      for (let ix = 0; ix < N; ix += step) {
        const i = iz * N + ix;
        const dx = this.walkDir[i * 2];
        const dz = this.walkDir[i * 2 + 1];
        const x = (ix - GOAL) * CELL;
        const z = (iz - GOAL) * CELL;
        const blocked = this.walkCost[i] >= 1e8;
        const y = (this.height?.at(x, z) ?? 0) + 0.12;
        pts.push(x, y, z, x + dx * CELL * 0.7, y, z + dz * CELL * 0.7);
        if (blocked) cols.push(1, 0.2, 0.15, 1, 0.2, 0.15);
        else cols.push(0.2, 1, 0.35, 1, 0.85, 0.15);
      }
    }
    this.debug.geometry.dispose();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.debug.geometry = geo;
  }
}

function integrate(
  masks: Uint8Array, blocks: number, cost: Float32Array, dir: Float32Array,
  height: HeightField | undefined, climbMul: number, goalX: number, goalZ: number,
): void {
  const blocked = new Uint8Array(N * N);
  for (let i = 0; i < blocked.length; i++) blocked[i] = masks[i] & blocks ? 1 : 0;

  cost.fill(1e9);
  dir.fill(0);
  // One open cell under the cure. Walls around it stay blocked, so the horde has to break through.
  const gx = Math.max(0, Math.min(N - 1, Math.round(goalX / CELL) + GOAL));
  const gz = Math.max(0, Math.min(N - 1, Math.round(goalZ / CELL) + GOAL));
  let seed = gz * N + gx;
  if (blocked[seed]) {
    let best = Infinity;
    for (let iz = 0; iz < N; iz++) {
      for (let ix = 0; ix < N; ix++) {
        const i = iz * N + ix;
        if (blocked[i]) continue;
        const d = (ix - gx) ** 2 + (iz - gz) ** 2;
        if (d < best) {
          best = d;
          seed = i;
        }
      }
    }
  }
  const seeds = [seed];

  const heap: number[] = [];
  const push = (i: number) => {
    heap.push(i);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (cost[heap[p]] <= cost[heap[k]]) break;
      const t = heap[p];
      heap[p] = heap[k];
      heap[k] = t;
      k = p;
    }
  };
  const pop = (): number => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length === 0) return top;
    heap[0] = last;
    let k = 0;
    for (;;) {
      let s = k;
      const l = k * 2 + 1;
      const r = l + 1;
      if (l < heap.length && cost[heap[l]] < cost[heap[s]]) s = l;
      if (r < heap.length && cost[heap[r]] < cost[heap[s]]) s = r;
      if (s === k) break;
      const t = heap[k];
      heap[k] = heap[s];
      heap[s] = t;
      k = s;
    }
    return top;
  };

  for (const seed of seeds) {
    cost[seed] = 0;
    push(seed);
  }
  while (heap.length) {
    const i = pop();
    const ix = i % N;
    const iz = (i - ix) / N;
    for (const [dx, dz, w] of DIRS) {
      const nx = ix + dx;
      const nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
      const j = nz * N + nx;
      if (blocked[j]) continue;
      let step = w;
      if (height && climbMul > 0) {
        const h0 = height.at((ix - GOAL) * CELL, (iz - GOAL) * CELL);
        const h1 = height.at((nx - GOAL) * CELL, (nz - GOAL) * CELL);
        step += Math.max(0, h1 - h0) * CONFIG.world.climbCost * climbMul;
      }
      const next = cost[i] + step;
      if (next < cost[j]) {
        cost[j] = next;
        push(j);
      }
    }
  }

  for (let iz = 0; iz < N; iz++) {
    for (let ix = 0; ix < N; ix++) {
      const i = iz * N + ix;
      if (blocked[i] || cost[i] >= 1e8) continue;
      let best = cost[i];
      let bx = 0;
      let bz = 0;
      for (const [dx, dz] of DIRS) {
        const nx = ix + dx;
        const nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const c = cost[nz * N + nx];
        if (c < best) {
          best = c;
          bx = dx;
          bz = dz;
        }
      }
      const len = Math.hypot(bx, bz) || 1;
      dir[i * 2] = bx / len;
      dir[i * 2 + 1] = bz / len;
    }
  }
}
