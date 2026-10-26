import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { damp } from '../core/math';
import { sfx } from '../audio/AudioEngine';
import { ITEMS, type ItemDef } from '../data/items';
import type { ItemAmount } from '../data/loot';
import { TIERS, TIER_ORDER, hopperVerb, nextTier, pieceCost, pieceMaxHp, pieceModel, type PieceDef, type TierId } from '../data/buildables';
import { DOOR_SIZE, wallHeight } from '../models/buildables';
import { models } from '../models/ModelRegistry';
import { disposeMerged, mergeColored } from '../models/merge';
import { FLOORABLE_TAG, HALF_TAG, type Collider, type CollisionWorld } from '../physics/Collision';
import type { Debris } from '../render/Debris';
import type { Occluder, OcclusionFader } from '../render/Occlusion';
import type { FloatingText } from '../ui/FloatingText';
import type { Interactable, InteractionSystem } from '../world/Interactables';
import type { FloorRect, World } from '../world/World';
import { Inventory } from './Inventory';

const B = CONFIG.building;
const L = B.cell;

/** Every piece is baked to vertex colors and shares this, so a whole base costs ~2 draw calls per piece. */
const PIECE_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.2, flatShading: true });
const PILLAR_MATERIAL = new THREE.MeshStandardMaterial({ color: '#3a342c', roughness: 1, flatShading: true });

/** Collider tags: placement checks skip your own walls where pieces are meant to touch. */
export const BUILD_TAG = 'build';
export const DEPLOY_TAG = 'deploy';

/**
 * A grid line segment a wall can stand on. Axis 'x' runs along X at z = j*L (between cells
 * (i, j-1) and (i, j)); axis 'z' runs along Z at x = i*L (between cells (i-1, j) and (i, j)).
 */
export interface Edge {
  i: number;
  j: number;
  axis: 'x' | 'z';
}

interface DoorState {
  open: boolean;
  /** 0 closed .. 1 open, animated. */
  swing: number;
  hinge: THREE.Object3D | null;
  collider: Collider | null;
}

export interface Piece {
  readonly uid: number;
  readonly def: PieceDef;
  tier: TierId;
  hp: number;
  maxHp: number;
  readonly x: number;
  readonly z: number;
  /** Slab height: foundations sit on their highest corner; walls sit on that slab. */
  readonly y: number;
  readonly rot: number;
  readonly cell: readonly [number, number] | null;
  readonly edge: Edge | null;
  /** Local footprint (w along the piece's X, d along its Z) and height, for targeting and highlights. */
  readonly size: { w: number; h: number; d: number };
  object: THREE.Object3D;
  colliders: Collider[];
  occluder: Occluder | null;
  interactable: Interactable | null;
  readonly storage: Inventory | null;
  readonly door: DoorState | null;
}

export interface Placement {
  def: PieceDef;
  x: number;
  z: number;
  rot: number;
  cell: [number, number] | null;
  edge: Edge | null;
  cost: ItemAmount[];
  ok: boolean;
  /** Why it can't be placed (empty when ok). */
  reason: string;
}

export interface BuildingContext {
  scene: THREE.Scene;
  collision: CollisionWorld;
  occlusion: OcclusionFader;
  interactions: InteractionSystem;
  world: World;
  inventory: Inventory;
  debris: Debris;
  floaters: FloatingText;
  player: { readonly position: THREE.Vector3 };
  /** Areas where foundations can't go (the hut). */
  noBuild: readonly FloorRect[];
  openStorage: (piece: Piece) => void;
  storageGone: (piece: Piece) => void;
}

const cellKey = (i: number, j: number) => `${i},${j}`;
const edgeKey = (e: Edge) => `${e.axis}${e.i},${e.j}`;

function edgeCells(e: Edge): [number, number][] {
  return e.axis === 'x' ? [[e.i, e.j - 1], [e.i, e.j]] : [[e.i - 1, e.j], [e.i, e.j]];
}

function cellEdges(i: number, j: number): Edge[] {
  return [
    { i, j, axis: 'x' },
    { i, j: j + 1, axis: 'x' },
    { i, j, axis: 'z' },
    { i: i + 1, j, axis: 'z' },
  ];
}

function edgeTransform(e: Edge): { x: number; z: number; rot: number } {
  return e.axis === 'x' ? { x: e.i * L + L / 2, z: e.j * L, rot: 0 } : { x: e.i * L, z: e.j * L + L / 2, rot: Math.PI / 2 };
}

/** World AABB of a thin piece of length `len` and thickness `thick` lying on an edge. */
function edgeBox(e: Edge, len: number, thick: number): FloorRect {
  const t = edgeTransform(e);
  const hx = e.axis === 'x' ? len / 2 : thick / 2;
  const hz = e.axis === 'x' ? thick / 2 : len / 2;
  return { minX: t.x - hx, maxX: t.x + hx, minZ: t.z - hz, maxZ: t.z + hz };
}

function circleHitsRect(x: number, z: number, r: number, b: FloorRect): boolean {
  const nx = Math.max(b.minX, Math.min(x, b.maxX));
  const nz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return (x - nx) ** 2 + (z - nz) ** 2 < r * r;
}

function sizeOf(def: PieceDef): { w: number; h: number; d: number } {
  switch (def.kind) {
    case 'foundation':
      return { w: L, h: 0.12, d: L };
    case 'wall':
      return { w: L + 0.28, h: wallHeight(def.shape ?? 'full') + 0.08, d: B.wallThickness + 0.08 };
    case 'door':
      return { w: DOOR_SIZE.width, h: DOOR_SIZE.height, d: 0.16 };
    default: {
      const f = def.footprint ?? { w: 1, d: 1, h: 1 };
      return { w: f.w, h: f.h, d: f.d };
    }
  }
}

const itemName = (a: ItemAmount) => (ITEMS[a.item] as ItemDef).name.toUpperCase();

/**
 * Player-built structures on a 3 m grid: foundations in cells, walls and doors on the lines
 * between them, deployables anywhere. Walls stand only while a foundation touches their edge.
 */
export class Building {
  /** Debug cheat: placing, repairing and upgrading cost nothing. */
  free = false;
  built = 0;
  readonly pieces = new Set<Piece>();
  private readonly foundations = new Map<string, Piece>();
  private readonly walls = new Map<string, Piece>();
  private readonly doors = new Map<string, Piece>();
  private nextUid = 1;

  constructor(private readonly ctx: BuildingContext) {}

  // --- Placement --------------------------------------------------------------------------------

  plan(def: PieceDef, cursor: THREE.Vector3, rotSteps: number): Placement {
    const p: Placement = { def, x: cursor.x, z: cursor.z, rot: 0, cell: null, edge: null, cost: pieceCost(def, 'wood'), ok: false, reason: '' };
    if (def.kind === 'foundation') this.planFoundation(p);
    else if (def.kind === 'wall') this.planWall(p);
    else if (def.kind === 'door') this.planDoor(p, rotSteps);
    else this.planDeployable(p, rotSteps);
    const player = this.ctx.player.position;
    if (!p.reason && Math.hypot(p.x - player.x, p.z - player.z) > B.range) p.reason = 'TOO FAR AWAY';
    if (!p.reason && !this.canAfford(p.cost)) p.reason = this.missingText(p.cost);
    p.ok = !p.reason;
    return p;
  }

  private planFoundation(p: Placement): void {
    const i = Math.floor(p.x / L);
    const j = Math.floor(p.z / L);
    p.cell = [i, j];
    p.x = i * L + L / 2;
    p.z = j * L + L / 2;
    const r: FloorRect = { minX: p.x - L / 2, maxX: p.x + L / 2, minZ: p.z - L / 2, maxZ: p.z + L / 2 };
    if (this.foundations.has(cellKey(i, j))) p.reason = 'ALREADY BUILT HERE';
    else if (this.ctx.noBuild.some((n) => r.minX < n.maxX && r.maxX > n.minX && r.minZ < n.maxZ && r.maxZ > n.minZ)) p.reason = 'TOO CLOSE TO THE HUT';
    else if (this.ctx.collision.overlapsBox(r.minX + 0.3, r.maxX - 0.3, r.minZ + 0.3, r.maxZ - 0.3, [BUILD_TAG, DEPLOY_TAG, FLOORABLE_TAG])) p.reason = 'SOMETHING IN THE WAY';
    else {
      const h = this.ctx.world.height;
      const span = h.span(r.minX, r.maxX, r.minZ, r.maxZ);
      if (span.max - span.min > 1.35 || span.slope > 24) p.reason = 'TOO STEEP';
      else if ([[r.minX, r.minZ], [r.maxX, r.minZ], [r.minX, r.maxZ], [r.maxX, r.maxZ], [p.x, p.z]].some(([x, z]) => h.waterDepth(x, z) > -0.05)) p.reason = 'IN THE WATER';
    }
  }

  /** Edges of the cell under the cursor, nearest first. */
  private edgesNear(x: number, z: number): Edge[] {
    const i = Math.floor(x / L);
    const j = Math.floor(z / L);
    const fx = x - i * L;
    const fz = z - j * L;
    const c: [number, Edge][] = [
      [fz, { i, j, axis: 'x' }],
      [L - fz, { i, j: j + 1, axis: 'x' }],
      [fx, { i, j, axis: 'z' }],
      [L - fx, { i: i + 1, j, axis: 'z' }],
    ];
    return c.sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  }

  private setEdge(p: Placement, e: Edge): void {
    p.edge = e;
    Object.assign(p, edgeTransform(e));
  }

  supported(e: Edge): boolean {
    return edgeCells(e).some(([i, j]) => this.foundations.has(cellKey(i, j)));
  }

  private planWall(p: Placement): void {
    const edges = this.edgesNear(p.x, p.z);
    const e = edges.find((c) => this.supported(c) && !this.walls.has(edgeKey(c))) ?? edges[0];
    this.setEdge(p, e);
    const box = edgeBox(e, L - 0.4, B.wallThickness);
    const player = this.ctx.player.position;
    if (this.walls.has(edgeKey(e))) p.reason = 'WALL ALREADY HERE';
    else if (!this.supported(e)) p.reason = 'NEEDS A FOUNDATION';
    else if (this.ctx.collision.overlapsBox(box.minX, box.maxX, box.minZ, box.maxZ, [BUILD_TAG])) p.reason = 'SOMETHING IN THE WAY';
    else if (circleHitsRect(player.x, player.z, CONFIG.player.radius, edgeBox(e, L, B.wallThickness + 0.1))) p.reason = "YOU'RE IN THE WAY";
  }

  private planDoor(p: Placement, rotSteps: number): void {
    let best: Piece | null = null;
    let bestScore = 2.4;
    for (const w of this.walls.values()) {
      if (w.def.shape !== 'doorway') continue;
      const score = Math.hypot(w.x - p.x, w.z - p.z) + (this.doors.has(edgeKey(w.edge!)) ? 1 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = w;
      }
    }
    if (!best) {
      this.setEdge(p, this.edgesNear(p.x, p.z)[0]);
      p.reason = 'NEEDS A DOORWAY';
      return;
    }
    this.setEdge(p, best.edge!);
    if (rotSteps % 2) p.rot += Math.PI;
    const player = this.ctx.player.position;
    if (this.doors.has(edgeKey(best.edge!))) p.reason = 'DOOR ALREADY HERE';
    else if (circleHitsRect(player.x, player.z, CONFIG.player.radius, this.doorBox(best.edge!))) p.reason = "YOU'RE IN THE DOORWAY";
  }

  private planDeployable(p: Placement, rotSteps: number): void {
    const snap = 0.25;
    p.x = Math.round(p.x / snap) * snap;
    p.z = Math.round(p.z / snap) * snap;
    p.rot = (rotSteps % 4) * (Math.PI / 2);
    const s = sizeOf(p.def);
    const swap = rotSteps % 2 === 1;
    const hw = (swap ? s.d : s.w) / 2 + 0.04;
    const hd = (swap ? s.w : s.d) / 2 + 0.04;
    const r: FloorRect = { minX: p.x - hw, maxX: p.x + hw, minZ: p.z - hd, maxZ: p.z + hd };
    const player = this.ctx.player.position;
    if (this.ctx.collision.overlapsBox(r.minX, r.maxX, r.minZ, r.maxZ)) p.reason = 'SOMETHING IN THE WAY';
    else if (circleHitsRect(player.x, player.z, CONFIG.player.radius, r)) p.reason = "YOU'RE IN THE WAY";
    else if (this.ctx.world.height.slopeDeg(p.x, p.z) > 22 && !this.ctx.world.height.isRoad(p.x, p.z)) p.reason = 'TOO STEEP';
    else if (this.ctx.world.height.waterDepth(p.x, p.z) > -0.05) p.reason = 'IN THE WATER';
  }

  /** Ghost / grid height for a planned piece (foundations sit on the high corner). */
  ghostY(p: Placement): number {
    return this.slabY(p.def, p.x, p.z, p.cell, p.edge);
  }

  canAfford(cost: readonly ItemAmount[]): boolean {
    return this.free || this.ctx.inventory.hasAll(cost);
  }

  missingText(cost: readonly ItemAmount[]): string {
    const miss = cost.find((a) => this.ctx.inventory.count(a.item) < a.qty);
    return miss ? `NEED ${miss.qty} ${itemName(miss)}` : '';
  }

  private pay(cost: readonly ItemAmount[]): void {
    if (this.free) return;
    for (const a of cost) this.ctx.inventory.remove(a.item, a.qty);
  }

  place(p: Placement): Piece | null {
    if (!p.ok) return null;
    this.pay(p.cost);
    const piece = this.spawn(p.def, 'wood', p.x, p.z, p.rot, p.cell, p.edge);
    this.built++;
    events.emit('build:placed', { id: piece.def.id });
    const top = new THREE.Vector3(p.x, piece.y + Math.min(piece.size.h, 1.6) + 0.4, p.z);
    this.ctx.debris.burst(p.x, piece.y + 0.3, p.z, TIERS.wood.color, piece.def.kind === 'foundation' ? 18 : 10);
    this.ctx.floaters.spawn(top, piece.def.kind === 'foundation' ? 'THUD!' : 'KA-CHUNK!', 'word');
    events.emit('camera:shake', { amount: piece.def.kind === 'foundation' ? 0.12 : 0.08 });
    return piece;
  }

  // --- Pieces -----------------------------------------------------------------------------------

  private spawn(def: PieceDef, tier: TierId, x: number, z: number, rot: number, cell: [number, number] | null, edge: Edge | null): Piece {
    const maxHp = pieceMaxHp(def, tier);
    const piece: Piece = {
      uid: this.nextUid++, def, tier, hp: maxHp, maxHp, x, z, y: this.slabY(def, x, z, cell, edge), rot, cell, edge, size: sizeOf(def),
      object: new THREE.Object3D(), colliders: [], occluder: null, interactable: null,
      storage: def.storageSlots ? new Inventory(def.storageSlots, 0) : null,
      door: def.kind === 'door' ? { open: false, swing: 0, hinge: null, collider: null } : null,
    };
    this.attachModel(piece);
    this.pieces.add(piece);

    if (cell) {
      this.foundations.set(cellKey(...cell), piece);
      this.ctx.world.setFloor(`build:${piece.uid}`, { minX: x - L / 2, maxX: x + L / 2, minZ: z - L / 2, maxZ: z + L / 2 });
    }
    if (edge && def.kind === 'wall') this.walls.set(edgeKey(edge), piece);
    if (edge && def.kind === 'door') this.doors.set(edgeKey(edge), piece);

    if (piece.storage) {
      const hop = hopperVerb(def.hopper);
      piece.interactable = this.ctx.interactions.add({
        id: `build:${piece.uid}`, label: hop.label, verb: hop.verb, position: new THREE.Vector3(x, piece.y, z), radius: 1.7,
        onInteract: () => this.ctx.openStorage(piece),
      });
    } else if (piece.door) {
      piece.interactable = this.ctx.interactions.add({
        id: `build:${piece.uid}`, label: this.doorLabel(piece), verb: 'Open', position: new THREE.Vector3(x, piece.y, z), radius: 1.9,
        onInteract: () => this.toggleDoor(piece),
      });
    }
    return piece;
  }

  private doorLabel(piece: Piece): string {
    return `${TIERS[piece.tier].name} Door`;
  }

  private attachModel(piece: Piece): void {
    const { def, tier } = piece;
    const obj = models.create(pieceModel(def, tier), piece.uid * 7919 + TIER_ORDER.indexOf(tier));
    obj.position.set(piece.x, piece.y, piece.z);
    obj.rotation.y = piece.rot;
    mergeColored(obj, PIECE_MATERIAL);
    if (def.kind === 'foundation') this.addPillars(obj, piece);
    this.ctx.scene.add(obj);
    obj.updateMatrixWorld(true);
    piece.object = obj;
    if (piece.door) {
      piece.door.hinge = obj.getObjectByName('hinge') ?? null;
      this.applySwing(piece);
      if (!piece.door.open) this.addDoorCollider(piece);
    } else if (!def.walkThrough) {
      const tag = def.cover || def.shape === 'half' ? HALF_TAG : def.kind === 'deployable' ? DEPLOY_TAG : BUILD_TAG;
      piece.colliders = this.ctx.collision.addFromObject(obj, tag);
    }
    if (def.kind === 'wall' || def.kind === 'door') piece.occluder = this.ctx.occlusion.register(obj, 0.2);
  }

  /** Foundations sit on the highest corner they cover; walls sit on that slab; deployables sit on the ground. */
  private slabY(def: PieceDef, x: number, z: number, cell: readonly [number, number] | null, edge: Edge | null): number {
    const h = this.ctx.world.height;
    if (def.kind === 'foundation' && cell) {
      const x0 = cell[0] * L;
      const z0 = cell[1] * L;
      return Math.max(h.at(x0, z0), h.at(x0 + L, z0), h.at(x0, z0 + L), h.at(x0 + L, z0 + L));
    }
    if (edge) {
      let y = 0;
      let n = 0;
      for (const [i, j] of edgeCells(edge)) {
        const f = this.foundations.get(cellKey(i, j));
        if (f) {
          y = Math.max(y, f.y);
          n++;
        }
      }
      return n ? y : h.at(x, z);
    }
    const s = sizeOf(def);
    const r = Math.max(s.w, s.d) / 2;
    return h.span(x - r, x + r, z - r, z + r).min;
  }

  private addPillars(obj: THREE.Object3D, piece: Piece): void {
    if (!piece.cell) return;
    const x0 = piece.cell[0] * L;
    const z0 = piece.cell[1] * L;
    const h = this.ctx.world.height;
    const min = Math.min(h.at(x0, z0), h.at(x0 + L, z0), h.at(x0, z0 + L), h.at(x0 + L, z0 + L));
    const drop = piece.y - min;
    if (drop < 0.07) return;
    const box = new THREE.Mesh(new THREE.BoxGeometry(L * 0.9, drop + 0.05, L * 0.9), PILLAR_MATERIAL);
    box.position.set(0, -drop / 2 - 0.02, 0);
    box.castShadow = true;
    box.receiveShadow = true;
    obj.add(box);
  }

  private detachModel(piece: Piece): void {
    this.ctx.collision.removeAll(piece.colliders);
    piece.colliders = [];
    if (piece.door?.collider) {
      this.ctx.collision.remove(piece.door.collider);
      piece.door.collider = null;
    }
    if (piece.occluder) this.ctx.occlusion.unregister(piece.occluder);
    piece.occluder = null;
    piece.object.removeFromParent();
    disposeMerged(piece.object);
  }

  // --- Doors ------------------------------------------------------------------------------------

  private doorBox(e: Edge): FloorRect {
    return edgeBox(e, DOOR_SIZE.width, 0.18);
  }

  private addDoorCollider(piece: Piece): void {
    const b = this.doorBox(piece.edge!);
    piece.door!.collider = this.ctx.collision.addBox((b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2, (b.maxX - b.minX) / 2, (b.maxZ - b.minZ) / 2, BUILD_TAG);
  }

  toggleDoor(piece: Piece): void {
    const d = piece.door;
    if (!d) return;
    const at = new THREE.Vector3(piece.x, piece.y + 2.3, piece.z);
    if (d.open) {
      const pp = this.ctx.player.position;
      if (circleHitsRect(pp.x, pp.z, CONFIG.player.radius, this.doorBox(piece.edge!))) {
        this.ctx.floaters.spawn(at, "YOU'RE IN THE WAY", 'warn');
        return;
      }
      d.open = false;
      this.addDoorCollider(piece);
    } else {
      d.open = true;
      if (d.collider) this.ctx.collision.remove(d.collider);
      d.collider = null;
    }
    if (piece.interactable) piece.interactable.verb = d.open ? 'Close' : 'Open';
    this.ctx.floaters.spawn(at, d.open ? 'KREEEK' : 'KLUNK!', 'word');
  }

  private applySwing(piece: Piece): void {
    const d = piece.door!;
    if (d.hinge) d.hinge.rotation.y = -d.swing * 1.7;
  }

  /** Per-frame: swings doors. */
  update(dt: number): void {
    for (const p of this.doors.values()) {
      const d = p.door!;
      const target = d.open ? 1 : 0;
      if (d.swing === target) continue;
      d.swing = damp(d.swing, target, 9, dt);
      if (Math.abs(d.swing - target) < 0.002) d.swing = target;
      this.applySwing(p);
    }
  }

  // --- Damage, support and collapse -------------------------------------------------------------

  /** Raids (and the debug panel) hurt pieces through here. `remote` skips the effects (a siege fought without you). */
  damage(piece: Piece, amount: number, remote = false): void {
    if (!this.pieces.has(piece) || amount <= 0) return;
    piece.hp -= amount;
    if (remote) {
      if (piece.hp <= 0) this.destroy(piece, 'destroyed', true);
      return;
    }
    const tier = TIERS[piece.tier];
    const at = new THREE.Vector3(piece.x, piece.y + Math.min(piece.size.h, 1.8), piece.z);
    this.ctx.debris.burst(piece.x, piece.y + (at.y - piece.y) * 0.6, piece.z, tier.color, 6);
    this.ctx.floaters.spawn(at, tier.hitWords[Math.floor(Math.random() * tier.hitWords.length)], 'word', undefined, 0, 0, amount);
    sfx('build.hit', { x: piece.x, z: piece.z, param: piece.tier === 'wood' ? 0 : 1, pitch: 0.9 + Math.random() * 0.2 });
    if (piece.hp <= 0) this.destroy(piece, 'destroyed');
  }

  destroy(piece: Piece, cause: 'destroyed' | 'collapsed' | 'demolished', remote = false): void {
    if (!this.pieces.delete(piece)) return;
    this.detachModel(piece);
    if (piece.interactable) this.ctx.interactions.remove(piece.interactable);
    if (piece.cell) {
      this.foundations.delete(cellKey(...piece.cell));
      this.ctx.world.setFloor(`build:${piece.uid}`, null);
    }
    if (piece.edge && piece.def.kind === 'wall') this.walls.delete(edgeKey(piece.edge));
    if (piece.edge && piece.def.kind === 'door') this.doors.delete(edgeKey(piece.edge));
    if (piece.storage) {
      if (cause !== 'demolished' && !piece.storage.empty) {
        const what = piece.def.hopper === 'stash' ? 'A storage box' : piece.def.name;
        events.emit('toast', { text: `${what} was smashed. Everything in it is gone.`, tone: 'danger' });
      }
      this.ctx.storageGone(piece);
    }

    if (!remote) {
      const tier = TIERS[piece.tier];
      const h = Math.min(piece.size.h, 2);
      this.ctx.debris.burst(piece.x, piece.y + h * 0.5, piece.z, tier.color, piece.def.kind === 'foundation' ? 20 : 30);
      const word = cause === 'collapsed' ? 'KRRRUMBLE!' : cause === 'demolished' ? 'KER-RASH!' : 'KRA-KOOM!';
      sfx('build.break', { x: piece.x, z: piece.z, param: piece.tier === 'wood' ? 0 : 1 });
      this.ctx.floaters.spawn(new THREE.Vector3(piece.x, piece.y + h + 0.6, piece.z), word, 'word', '#f2b705', cause === 'collapsed' ? 0.15 : 0);
      events.emit('camera:shake', { amount: cause === 'collapsed' ? 0.2 : 0.3 });
    }

    if (piece.cell) {
      for (const e of cellEdges(...piece.cell)) {
        const w = this.walls.get(edgeKey(e));
        if (w && !this.supported(e)) this.destroy(w, 'collapsed', remote);
      }
    }
    if (piece.edge && piece.def.kind === 'wall') {
      const door = this.doors.get(edgeKey(piece.edge));
      if (door) this.destroy(door, 'collapsed', remote);
    }
  }

  // --- Hammer -----------------------------------------------------------------------------------

  /** Distance from a ground point to a piece's footprint (0 inside it). */
  distanceTo(piece: Piece, x: number, z: number): number {
    const dx = x - piece.x;
    const dz = z - piece.z;
    const c = Math.cos(piece.rot);
    const s = Math.sin(piece.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.hypot(Math.max(0, Math.abs(lx) - piece.size.w / 2), Math.max(0, Math.abs(lz) - piece.size.d / 2));
  }

  /** Closest attackable piece (not a foundation) within `reach` of a ground point. */
  pieceNear(x: number, z: number, reach: number): Piece | null {
    let best: Piece | null = null;
    let bestD = reach;
    for (const p of this.pieces) {
      if (p.def.kind === 'foundation' || p.def.walkThrough) continue;
      const d = this.distanceTo(p, x, z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** The piece under the cursor that the player can reach with the hammer. */
  pieceAt(x: number, z: number): Piece | null {
    const player = this.ctx.player.position;
    let best: Piece | null = null;
    let bestScore = Infinity;
    for (const p of this.pieces) {
      const d = this.distanceTo(p, x, z);
      const isFloor = p.def.kind === 'foundation';
      if (d > (isFloor ? 0 : 0.7)) continue;
      if (this.distanceTo(p, player.x, player.z) > B.hammerReach) continue;
      const score = d + (isFloor ? 1 : p.def.kind === 'wall' ? 0.15 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  repairCost(piece: Piece): ItemAmount[] {
    const restore = Math.min(piece.maxHp - piece.hp, piece.maxHp * B.repairPerHit);
    const frac = restore / piece.maxHp;
    return pieceCost(piece.def, piece.tier).map((a) => ({ item: a.item, qty: Math.max(1, Math.ceil(a.qty * frac * B.repairCostFactor)) }));
  }

  upgradeCost(piece: Piece): ItemAmount[] | null {
    if (piece.def.kind === 'deployable') return null;
    const next = nextTier(piece.tier);
    return next ? pieceCost(piece.def, next) : null;
  }

  refund(piece: Piece): ItemAmount[] {
    return pieceCost(piece.def, piece.tier)
      .map((a) => ({ item: a.item, qty: Math.floor(a.qty * B.refundFactor) }))
      .filter((a) => a.qty > 0);
  }

  repair(piece: Piece): void {
    const at = new THREE.Vector3(piece.x, piece.y + Math.min(piece.size.h, 1.8) + 0.3, piece.z);
    if (piece.hp >= piece.maxHp - 0.5) {
      this.ctx.floaters.spawn(at, 'NOT DAMAGED', 'warn');
      return;
    }
    const cost = this.repairCost(piece);
    if (!this.canAfford(cost)) {
      this.ctx.floaters.spawn(at, this.missingText(cost), 'warn');
      return;
    }
    this.pay(cost);
    const restore = Math.min(piece.maxHp - piece.hp, piece.maxHp * B.repairPerHit);
    piece.hp += restore;
    this.ctx.debris.burst(piece.x, at.y * 0.5, piece.z, TIERS[piece.tier].color, 5);
    this.ctx.floaters.spawn(at, 'TAP-TAP!', 'word');
    sfx('build.repair', { x: piece.x, z: piece.z });
    this.ctx.floaters.spawn(at.clone().setY(at.y - 0.5), `+${Math.round(restore)} HP`, 'gain', '#8cff3a', 0.05);
    events.emit('camera:shake', { amount: 0.05 });
  }

  upgrade(piece: Piece): void {
    const at = new THREE.Vector3(piece.x, piece.y + Math.min(piece.size.h, 1.8) + 0.4, piece.z);
    const next = nextTier(piece.tier);
    const cost = this.upgradeCost(piece);
    if (!next || !cost) {
      this.ctx.floaters.spawn(at, piece.def.kind === 'deployable' ? "CAN'T UPGRADE" : 'MAX TIER', 'warn');
      return;
    }
    if (!this.canAfford(cost)) {
      this.ctx.floaters.spawn(at, this.missingText(cost), 'warn');
      return;
    }
    this.pay(cost);
    this.detachModel(piece);
    piece.tier = next;
    piece.maxHp = pieceMaxHp(piece.def, next);
    piece.hp = piece.maxHp;
    this.attachModel(piece);
    if (piece.door && piece.interactable) piece.interactable.label = this.doorLabel(piece);
    const tier = TIERS[next];
    this.ctx.debris.burst(piece.x, piece.y + Math.min(piece.size.h, 2) * 0.5, piece.z, tier.color, 26);
    this.ctx.floaters.spawn(at, 'UPGRADED!', 'word', tier.color);
    sfx('build.upgrade', { x: piece.x, z: piece.z });
    this.ctx.floaters.spawn(at.clone().setY(at.y - 0.55), tier.name.toUpperCase(), 'gain', tier.color, 0.1);
    events.emit('camera:shake', { amount: 0.18 });
  }

  /** Moves hopper / box contents into the player bag. Returns false if something would not fit. */
  dumpStorage(piece: Piece): boolean {
    const box = piece.storage;
    if (!box || box.empty) return true;
    for (let i = 0; i < box.size; i++) {
      if (!box.slots[i]) continue;
      if (!box.transfer(i, this.ctx.inventory)) return false;
    }
    return box.empty;
  }

  /** Tears a piece down for a partial refund. Returns false if it refused. */
  demolish(piece: Piece): boolean {
    if (piece.storage && !piece.storage.empty) {
      if (piece.def.hopper && piece.def.hopper !== 'stash') {
        if (!this.dumpStorage(piece)) {
          events.emit('toast', { text: 'Make room before you tear it down.', tone: 'warn' });
          return false;
        }
      } else {
        events.emit('toast', { text: 'Empty the box before you tear it down.', tone: 'warn' });
        return false;
      }
    }
    const at = new THREE.Vector3(piece.x, piece.y + 1.2, piece.z);
    let lost = false;
    this.refund(piece).forEach((a, i) => {
      const left = this.ctx.inventory.add(a.item, a.qty);
      if (left > 0) lost = true;
      if (a.qty - left > 0) this.ctx.floaters.spawn(at, `+${a.qty - left} ${itemName(a)}`, 'gain', (ITEMS[a.item] as ItemDef).color, 0.1 + i * 0.12, i);
    });
    if (lost) events.emit('toast', { text: 'Backpack full. Some salvage was lost.', tone: 'warn' });
    this.destroy(piece, 'demolished');
    return true;
  }
}
