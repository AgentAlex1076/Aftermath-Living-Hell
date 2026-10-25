import * as THREE from 'three';

export interface BoxCollider {
  kind: 'box';
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Internal query stamp used to de-duplicate colliders spanning several cells. */
  stamp: number;
  tag?: string;
}

export interface CircleCollider {
  kind: 'circle';
  x: number;
  z: number;
  r: number;
  stamp: number;
  tag?: string;
}

export type Collider = BoxCollider | CircleCollider;

/** Thin uprights (an open door leaf) that a floor slab may be laid underneath. */
export const FLOORABLE_TAG = 'floorable';
/** Waist-high cover. Crawlers ignore it. */
export const HALF_TAG = 'half';

/** Local-space collider shape attached to a model via `userData.colliders`. */
export type LocalCollider =
  | { kind: 'box'; x: number; z: number; hw: number; hd: number; tag?: string }
  | { kind: 'circle'; x: number; z: number; r: number; tag?: string };

const CELL = 8;
const cellKey = (ix: number, iz: number) => (ix + 4096) * 8192 + (iz + 4096);

/**
 * Static 2D (ground-plane) collision world on a spatial hash, so colliders can be added and
 * removed as world chunks stream in and out. Entities are circles; obstacles are AABBs or circles.
 */
export class CollisionWorld {
  private readonly cells = new Map<number, Collider[]>();
  private readonly all = new Set<Collider>();
  private queryStamp = 0;
  /** Bumped whenever colliders change (lets debug views know to rebuild). */
  version = 0;
  /** Bumped only when a collider inside `watch` changes, so far-off chunk streaming can be ignored. */
  watchVersion = 0;
  private watch = Infinity;

  /** Track changes within this half-size square around the origin in `watchVersion`. */
  setWatch(halfSize: number): void {
    this.watch = halfSize;
  }

  /**
   * Which tags overlap a circle, as bits: 1 = untagged, then 2, 4, 8... for `tags` in order.
   * One query instead of one per ignore list.
   */
  tagMaskAt(x: number, z: number, r: number, tags: readonly string[]): number {
    const minX = x - r;
    const maxX = x + r;
    const minZ = z - r;
    const maxZ = z + r;
    const stamp = ++this.queryStamp;
    let mask = 0;
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const list = this.cells.get(cellKey(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          const t = c.tag ? tags.indexOf(c.tag) : -1;
          const bit = t < 0 ? 1 : 2 << t;
          if (mask & bit) continue;
          let hit: boolean;
          if (c.kind === 'box') hit = c.maxX > minX && c.minX < maxX && c.maxZ > minZ && c.minZ < maxZ;
          else {
            const nx = Math.max(minX, Math.min(c.x, maxX));
            const nz = Math.max(minZ, Math.min(c.z, maxZ));
            hit = (c.x - nx) ** 2 + (c.z - nz) ** 2 < c.r * c.r;
          }
          if (hit) mask |= bit;
        }
      }
    }
    return mask;
  }

  get colliders(): ReadonlySet<Collider> {
    return this.all;
  }

  addBox(cx: number, cz: number, hw: number, hd: number, tag?: string): BoxCollider {
    const c: BoxCollider = { kind: 'box', minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, stamp: 0, tag };
    this.insert(c);
    return c;
  }

  addCircle(x: number, z: number, r: number, tag?: string): CircleCollider {
    const c: CircleCollider = { kind: 'circle', x, z, r, stamp: 0, tag };
    this.insert(c);
    return c;
  }

  /** True if an axis-aligned box overlaps any collider, skipping colliders with an ignored tag. */
  overlapsBox(minX: number, maxX: number, minZ: number, maxZ: number, ignoreTags: readonly string[] = []): boolean {
    const stamp = ++this.queryStamp;
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) {
        const list = this.cells.get(cellKey(ix, iz));
        if (!list) continue;
        for (const c of list) {
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          if (c.tag && ignoreTags.includes(c.tag)) continue;
          if (c.kind === 'box') {
            if (c.maxX > minX && c.minX < maxX && c.maxZ > minZ && c.minZ < maxZ) return true;
          } else {
            const nx = Math.max(minX, Math.min(c.x, maxX));
            const nz = Math.max(minZ, Math.min(c.z, maxZ));
            if ((c.x - nx) ** 2 + (c.z - nz) ** 2 < c.r * c.r) return true;
          }
        }
      }
    }
    return false;
  }

  /** True if a circle at (x, z) overlaps any collider. */
  blockedAt(x: number, z: number, r: number, ignoreTags: readonly string[] = []): boolean {
    return this.overlapsBox(x - r, x + r, z - r, z + r, ignoreTags);
  }

  /** Adds the colliders declared on a placed model, transformed by its position and Y rotation. */
  addFromObject(obj: THREE.Object3D, tag?: string): Collider[] {
    const local = obj.userData.colliders as LocalCollider[] | undefined;
    if (!local) return [];
    const out: Collider[] = [];
    const cos = Math.cos(obj.rotation.y);
    const sin = Math.sin(obj.rotation.y);
    const s = obj.scale.x;
    for (const c of local) {
      const wx = obj.position.x + (c.x * cos + c.z * sin) * s;
      const wz = obj.position.z + (-c.x * sin + c.z * cos) * s;
      if (c.kind === 'circle') {
        out.push(this.addCircle(wx, wz, c.r * s, c.tag ?? tag));
      } else {
        const hw = (Math.abs(cos) * c.hw + Math.abs(sin) * c.hd) * s;
        const hd = (Math.abs(sin) * c.hw + Math.abs(cos) * c.hd) * s;
        out.push(this.addBox(wx, wz, hw, hd, c.tag ?? tag));
      }
    }
    return out;
  }

  remove(c: Collider): void {
    if (!this.all.delete(c)) return;
    this.forCells(c, (key) => {
      const list = this.cells.get(key);
      if (!list) return;
      const i = list.indexOf(c);
      if (i >= 0) list.splice(i, 1);
      if (list.length === 0) this.cells.delete(key);
    });
    this.bump(c);
  }

  removeAll(list: readonly Collider[]): void {
    for (const c of list) this.remove(c);
  }

  /** Pushes a circle out of all overlapping colliders. Returns true if any contact happened. */
  resolveCircle(pos: THREE.Vector3, radius: number, ignoreTags: readonly string[] = []): boolean {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const stamp = ++this.queryStamp;
      const x0 = Math.floor((pos.x - radius) / CELL);
      const x1 = Math.floor((pos.x + radius) / CELL);
      const z0 = Math.floor((pos.z - radius) / CELL);
      const z1 = Math.floor((pos.z + radius) / CELL);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const list = this.cells.get(cellKey(ix, iz));
          if (!list) continue;
          for (const c of list) {
            if (c.stamp === stamp) continue;
            c.stamp = stamp;
            if (c.tag && ignoreTags.includes(c.tag)) continue;
            if (pushOut(pos, radius, c)) moved = true;
          }
        }
      }
      if (!moved) break;
      hit = true;
    }
    return hit;
  }

  createDebugMesh(): THREE.LineSegments {
    const pts: number[] = [];
    const y = 0.06;
    for (const c of this.all) {
      if (c.kind === 'box') {
        const corners = [
          [c.minX, c.minZ],
          [c.maxX, c.minZ],
          [c.maxX, c.maxZ],
          [c.minX, c.maxZ],
        ];
        for (let i = 0; i < 4; i++) {
          const a = corners[i];
          const b = corners[(i + 1) % 4];
          pts.push(a[0], y, a[1], b[0], y, b[1]);
        }
      } else {
        const seg = 20;
        for (let i = 0; i < seg; i++) {
          const a0 = (i / seg) * Math.PI * 2;
          const a1 = ((i + 1) / seg) * Math.PI * 2;
          pts.push(c.x + Math.cos(a0) * c.r, y, c.z + Math.sin(a0) * c.r);
          pts.push(c.x + Math.cos(a1) * c.r, y, c.z + Math.sin(a1) * c.r);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#ff3df5', depthTest: false }));
    lines.renderOrder = 999;
    lines.name = 'collider-debug';
    return lines;
  }

  private insert(c: Collider): void {
    this.all.add(c);
    this.forCells(c, (key) => {
      let list = this.cells.get(key);
      if (!list) {
        list = [];
        this.cells.set(key, list);
      }
      list.push(c);
    });
    this.bump(c);
  }

  private bump(c: Collider): void {
    this.version++;
    const w = this.watch;
    const inside = c.kind === 'box'
      ? c.maxX > -w && c.minX < w && c.maxZ > -w && c.minZ < w
      : Math.abs(c.x) < w + c.r && Math.abs(c.z) < w + c.r;
    if (inside) this.watchVersion++;
  }

  private forCells(c: Collider, fn: (key: number) => void): void {
    const minX = c.kind === 'box' ? c.minX : c.x - c.r;
    const maxX = c.kind === 'box' ? c.maxX : c.x + c.r;
    const minZ = c.kind === 'box' ? c.minZ : c.z - c.r;
    const maxZ = c.kind === 'box' ? c.maxZ : c.z + c.r;
    for (let ix = Math.floor(minX / CELL); ix <= Math.floor(maxX / CELL); ix++) {
      for (let iz = Math.floor(minZ / CELL); iz <= Math.floor(maxZ / CELL); iz++) fn(cellKey(ix, iz));
    }
  }
}

function pushOut(pos: THREE.Vector3, radius: number, c: Collider): boolean {
  if (c.kind === 'circle') {
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const minDist = radius + c.r;
    const d2 = dx * dx + dz * dz;
    if (d2 >= minDist * minDist) return false;
    const d = Math.sqrt(d2) || 0.0001;
    const push = minDist - d;
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
    return true;
  }
  const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
  const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 > 0) {
    if (d2 >= radius * radius) return false;
    const d = Math.sqrt(d2);
    const push = radius - d;
    pos.x += (dx / d) * push;
    pos.z += (dz / d) * push;
    return true;
  }
  const left = pos.x - c.minX;
  const right = c.maxX - pos.x;
  const back = pos.z - c.minZ;
  const front = c.maxZ - pos.z;
  const m = Math.min(left, right, back, front);
  if (m === left) pos.x = c.minX - radius;
  else if (m === right) pos.x = c.maxX + radius;
  else if (m === back) pos.z = c.minZ - radius;
  else pos.z = c.maxZ + radius;
  return true;
}
