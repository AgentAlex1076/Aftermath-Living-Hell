import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { CONTAINERS, rollLoot, type ContainerDef, type ContainerId, type ItemAmount } from '../data/loot';
import { NODES, type NodeId, type ResourceNodeDef } from '../data/nodes';
import { hashString, Rng } from '../core/random';
import { smoothstep, wrapAngle } from '../core/math';
import { models } from '../models/ModelRegistry';
import { disposeMerged, mergeStatic } from '../models/merge';
import type { ContainerSlot } from '../models/ruins';
import type { Collider, CollisionWorld, LocalCollider } from '../physics/Collision';
import type { LightEmitter, LightPool } from '../render/LightPool';
import type { Occluder, OcclusionFader } from '../render/Occlusion';
import { Biomes, type BiomeSample } from './Biomes';
import { ChangeStore, HOME_KEY, type KnownStructure } from './ChangeStore';
import { chunkSeed, generateChunk, type ChunkPlan, type GasZone } from './ChunkGenerator';
import { buildDecals, buildGasClouds, buildGrass, getGasMaterial } from './Decor';
import type { Interactable, InteractionSystem } from './Interactables';
import { CLIFF_TAG, HeightField, WATER_TAG } from './Height';
import { Ground } from './Terrain';
import { Regions, type District } from './Regions';
import { Traversal, type LinkEnd, type TraversalLink } from './Traversal';
import { WorldEvents } from './WorldEvents';

export interface NodeInstance {
  readonly uid: string;
  readonly def: ResourceNodeDef;
  readonly object: THREE.Object3D;
  readonly x: number;
  readonly z: number;
  /** Seated height on the slope; the hit shake keeps it. */
  readonly y: number;
  readonly radius: number;
  colliders: Collider[];
  lights: LightEmitter[];
  hp: number;
  carry: number[];
  shake: number;
  shakeX: number;
  shakeZ: number;
  chunk: Chunk | null;
}

export interface ContainerInstance {
  readonly uid: string;
  readonly def: ContainerDef;
  readonly object: THREE.Object3D;
  readonly x: number;
  readonly z: number;
  readonly interactable: Interactable;
  readonly danger: number;
  readonly colliders: Collider[];
  readonly chunk: Chunk | null;
}

export interface StructureMarker {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  kind: 'ruin' | 'lab' | 'hut';
}

interface Chunk {
  key: string;
  cx: number;
  cz: number;
  root: THREE.Group;
  colliders: Collider[];
  lights: LightEmitter[];
  occluders: Occluder[];
  nodes: Set<NodeInstance>;
  containers: Set<ContainerInstance>;
  structures: StructureMarker[];
  grass: THREE.InstancedMesh | null;
  links: TraversalLink[];
}

export interface FloorRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Puff {
  x: number;
  z: number;
  r: number;
  life: number;
  maxLife: number;
  seed: number;
}

export interface WorldContext {
  scene: THREE.Scene;
  collision: CollisionWorld;
  occlusion: OcclusionFader;
  lights: LightPool;
  interactions: InteractionSystem;
  seed: number;
  onSearch: (c: ContainerInstance) => void;
  /** E at a traversal link end. */
  onClimb: (link: TraversalLink, end: LinkEnd) => void;
}

export interface WaterSample {
  depth: number;
  /** Marsh water and crater pools eat the filter. */
  toxic: boolean;
}

export type FeatureKind = 'water' | 'ford' | 'toxicWater' | 'bridge' | 'crater' | 'town' | 'industrial' | 'farm';

const SLOT_TO_CONTAINER: Record<ContainerSlot['type'], ContainerId> = {
  crate: 'crate',
  cabinet: 'cabinet',
  toolbox: 'toolbox',
  labLocker: 'labLocker',
};

const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

const _box = new THREE.Box3();
const _up = new THREE.Vector3();
const _tilt = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();
/** Props never lean more than ~32° off vertical. */
const MIN_TILT_COS = Math.cos(0.56);

/** Ground contact half-size of a model, from its colliders (a tree is its trunk, not its branches). */
function footprint(obj: THREE.Object3D): number {
  const local = obj.userData.colliders as LocalCollider[] | undefined;
  let r = 0;
  for (const c of local ?? []) {
    r = Math.max(r, c.kind === 'circle' ? Math.hypot(c.x, c.z) + c.r : Math.max(Math.abs(c.x) + c.hw, Math.abs(c.z) + c.hd));
  }
  if (r > 0) return Math.max(0.3, r * obj.scale.x);
  _box.setFromObject(obj);
  return Math.max(0.3, Math.min(_box.max.x - _box.min.x, _box.max.z - _box.min.z) * 0.4);
}
const changeKey = (chunk: Chunk | null) => chunk?.key ?? HOME_KEY;

interface GroundTile {
  cx: number;
  cz: number;
  object: THREE.Group;
}

/**
 * The procedural wasteland, with no edges: streams chunks and ground tiles around the player,
 * owns resource nodes and loot containers, and remembers what was harvested or looted.
 */
export class World {
  readonly biomes: Biomes;
  readonly height: HeightField;
  readonly nodes = new Set<NodeInstance>();
  readonly containers = new Set<ContainerInstance>();
  readonly permanentStructures: StructureMarker[] = [];
  /** What the player changed, per chunk. The only state far-away chunks keep. */
  readonly changes = new ChangeStore();
  /** Timed world happenings (supply drops, restocks). Empty for now. */
  readonly events = new WorldEvents();
  /** Traversal links (ziplines, vehicles later). The player and mutants can follow any of them. */
  readonly traversal: Traversal;
  /** Districts, highways, towns, yards and farms. */
  readonly regions: Regions;
  private readonly ctx: WorldContext;
  private readonly permanent = new THREE.Group();
  private readonly ground: Ground;
  private readonly tiles = new Map<string, GroundTile>();
  private readonly plans = new Map<string, ChunkPlan>();
  private readonly chunks = new Map<string, Chunk>();
  private readonly fixedContents = new Map<string, ItemAmount[]>();
  private readonly puffs: Puff[] = [];
  /** Player-built floors; grass never grows through them. */
  private readonly floors = new Map<string, FloorRect>();
  private planFocus = '';
  private time = 0;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.regions = new Regions(ctx.seed);
    this.biomes = new Biomes(ctx.seed, this.regions);
    this.height = new HeightField(ctx.seed, this.regions);
    this.height.setPadSource((cx, cz) => this.plan(cx, cz).pads);
    this.ground = new Ground(this.biomes, this.height, ctx.seed);
    this.traversal = new Traversal(ctx.interactions, ctx.onClimb);
    this.permanent.name = 'permanent';
    ctx.scene.add(this.permanent);
  }

  get loadedChunks(): number {
    return this.chunks.size;
  }

  get groundTiles(): number {
    return this.tiles.size;
  }

  get cachedPlans(): number {
    return this.plans.size;
  }

  /** World clock in seconds; stamps changes and drives world events. */
  get clock(): number {
    return this.time;
  }

  /** Streams chunks around `focus`. With `all`, loads everything in range immediately. */
  update(dt: number, focus: THREE.Vector3, all = false): void {
    this.time += dt;
    this.events.update(this.time);
    const gasUniforms = getGasMaterial().uniforms;
    gasUniforms.uTime.value = this.time;
    gasUniforms.uPlayer.value.copy(focus);
    this.stream(focus, all);

    for (const n of this.nodes) {
      if (n.shake <= 0) continue;
      n.shake = Math.max(0, n.shake - dt * 5);
      const o = Math.sin(this.time * 55) * 0.07 * n.shake;
      n.object.position.set(n.x + n.shakeX * o, n.y, n.z + n.shakeZ * o);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      this.puffs[i].life -= dt;
      if (this.puffs[i].life <= 0) this.puffs.splice(i, 1);
    }
  }

  sample(x: number, z: number): BiomeSample {
    return this.biomes.sample(x, z);
  }

  /** Gas intensity (0..1+) at a point: toxic biome field, lab zones and fresh puffs. */
  gasAt(x: number, z: number): number {
    const { chunkSize } = CONFIG.world;
    let g = smoothstep(0.25, 0.8, this.biomes.toxicity(x, z));
    const cx = Math.floor(x / chunkSize);
    const cz = Math.floor(z / chunkSize);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        for (const zone of this.plan(cx + i, cz + j).gas) g = Math.max(g, zoneValue(zone, x, z));
      }
    }
    for (const p of this.puffs) {
      const v = zoneValue({ x: p.x, z: p.z, r: p.r, intensity: 0.9 }, x, z) * Math.min(1, p.life / (p.maxLife * 0.5));
      g = Math.max(g, v);
    }
    return g;
  }

  /** Water depth here (negative on dry ground) and whether it is the poisoned kind. */
  waterAt(x: number, z: number): WaterSample {
    const depth = this.height.waterDepth(x, z);
    const toxic = depth > 0 && (this.height.waterKind(x, z) === 'crater' || this.biomes.toxicity(x, z) > 0.3);
    return { depth, toxic };
  }

  /** A short-lived gas cloud, e.g. from cracking a chemical drum. */
  addPuff(x: number, z: number, r = 3.2, life = 6): void {
    this.puffs.push({ x, z, r, life, maxLife: life, seed: Math.random() });
  }

  /** Live gas puffs, for drawing them. */
  get activePuffs(): readonly Puff[] {
    return this.puffs;
  }

  findNodeInCone(pos: THREE.Vector3, facing: number, reach: number, coneDeg: number): NodeInstance | null {
    const half = (coneDeg * Math.PI) / 360;
    let best: NodeInstance | null = null;
    let bestScore = Infinity;
    for (const n of this.nodes) {
      const dx = n.x - pos.x;
      const dz = n.z - pos.z;
      const center = Math.hypot(dx, dz);
      const dist = center - n.radius;
      if (dist > reach) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(dx, dz) - facing));
      if (ang > half && dist > 0.25) continue;
      const score = dist + ang * 0.8;
      if (score < bestScore) {
        bestScore = score;
        best = n;
      }
    }
    return best;
  }

  /** Applies gathering damage. Returns what the hit yielded and whether the node is used up. */
  damageNode(n: NodeInstance, amount: number, fromX: number, fromZ: number): { gained: ItemAmount[]; destroyed: boolean } {
    const dealt = Math.min(amount, n.hp);
    n.hp -= dealt;
    const destroyed = n.hp <= 0.001;
    const gained: ItemAmount[] = [];
    n.def.yields.forEach((y, i) => {
      let v = (y.total * dealt) / n.def.hp + n.carry[i];
      if (destroyed) v = Math.round(v);
      const whole = Math.floor(v);
      n.carry[i] = v - whole;
      if (whole > 0) gained.push({ item: y.item, qty: whole });
    });
    this.changes.setNode(changeKey(n.chunk), n.uid, n.hp, n.carry, this.time);

    const d = Math.hypot(n.x - fromX, n.z - fromZ) || 1;
    n.shakeX = (n.x - fromX) / d;
    n.shakeZ = (n.z - fromZ) / d;
    n.shake = 1;
    if (n.def.toxic) this.addPuff(n.x, n.z, destroyed ? 4.5 : 3, destroyed ? 9 : 4);
    if (destroyed) this.removeNode(n);
    return { gained, destroyed };
  }

  /** Current contents of a container, rolling loot the first time it's opened. */
  contentsOf(c: ContainerInstance): ItemAmount[] {
    const key = changeKey(c.chunk);
    let contents = this.changes.container(key, c.uid)?.items;
    if (!contents) {
      contents = this.fixedContents.get(c.uid)?.map((a) => ({ ...a })) ?? rollLoot(c.def, new Rng(hashString(c.uid) ^ this.ctx.seed), c.danger);
      this.changes.setContainer(key, c.uid, contents, this.time);
    }
    return contents;
  }

  setContents(c: ContainerInstance, remaining: ItemAmount[]): void {
    this.changes.setContainer(changeKey(c.chunk), c.uid, remaining, this.time);
    c.interactable.enabled = remaining.length > 0;
    if (remaining.length === 0) markLooted(c.object);
  }

  // --- Spawning --------------------------------------------------------------------------------

  /** Places a model with its colliders, lights and fading walls. `chunk` null means permanent. */
  spawnProp(model: string, x: number, z: number, rot: number, seed: number, chunk: Chunk | null = null, trackInChunk = true) {
    const obj = models.create(model, seed);
    const top = _box.setFromObject(obj).max.y;
    obj.position.set(x, this.height.at(x, z), z);
    obj.rotation.y = rot;
    mergeStatic(obj);
    (chunk ? chunk.root : this.permanent).add(obj);
    obj.updateMatrixWorld(true);
    const colliders = this.ctx.collision.addFromObject(obj);
    if (!obj.userData.noSeat) this.seat(obj, model, top, rot);
    const lights = this.ctx.lights.addFromObject(obj);
    const occluders: Occluder[] = [];
    for (const name of (obj.userData.occluders as string[] | undefined) ?? []) {
      const node = obj.getObjectByName(name);
      if (node) occluders.push(this.ctx.occlusion.register(node, 0.16));
    }
    if (chunk) {
      chunk.occluders.push(...occluders);
      if (trackInChunk) {
        chunk.colliders.push(...colliders);
        chunk.lights.push(...lights);
      }
    }
    return { object: obj, colliders, lights, occluders };
  }

  /**
   * Sits a placed model on the slope. Low props tilt to the ground under their footprint and
   * settle to its average; tall ones (trees, posts, buildings) stay upright and sink to the
   * lowest point so no edge hangs in the air. Colliders were already added from the yaw.
   */
  private seat(obj: THREE.Object3D, model: string, top: number, rot: number): void {
    const { x, z } = obj.position;
    const h = this.height;
    const r = footprint(obj);
    const c = h.at(x, z);
    const e = h.at(x + r, z);
    const w = h.at(x - r, z);
    const n = h.at(x, z + r);
    const s = h.at(x, z - r);
    if (Math.max(c, e, w, n, s) - Math.min(c, e, w, n, s) < 0.03) return;
    const upright = top > 1.9 || model.startsWith('structure.') || model.startsWith('station.') || !!obj.userData.minimap;
    if (upright) {
      obj.position.y = Math.min(c, e, w, n, s) - 0.04;
    } else {
      obj.position.y = (c + e + w + n + s) / 5 - 0.03;
      _up.set(-(e - w) / (2 * r), 1, -(n - s) / (2 * r)).normalize();
      if (_up.y < MIN_TILT_COS) _up.setY(0).setLength(Math.sqrt(1 - MIN_TILT_COS ** 2)).setY(MIN_TILT_COS);
      _tilt.setFromUnitVectors(THREE.Object3D.DEFAULT_UP, _up);
      _yaw.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot);
      obj.quaternion.multiplyQuaternions(_tilt, _yaw);
    }
    obj.updateMatrixWorld(true);
  }

  spawnNode(id: NodeId, x: number, z: number, rot: number, seed: number, uid: string, chunk: Chunk | null = null): NodeInstance | null {
    const state = this.changes.node(changeKey(chunk), uid);
    if (state && state.hp <= 0.001) return null;
    const def: ResourceNodeDef = NODES[id];
    const { object, colliders, lights } = this.spawnProp(def.model, x, z, rot, seed, chunk, false);
    const n: NodeInstance = {
      uid, def, object, x, z, y: object.position.y, radius: def.radius, colliders, lights,
      hp: state?.hp ?? def.hp,
      carry: state?.carry ?? def.yields.map(() => 0),
      shake: 0, shakeX: 0, shakeZ: 0, chunk,
    };
    this.nodes.add(n);
    chunk?.nodes.add(n);
    return n;
  }

  spawnContainer(
    id: ContainerId, x: number, z: number, rot: number, seed: number, uid: string,
    chunk: Chunk | null = null, fixed?: readonly ItemAmount[],
  ): ContainerInstance {
    const def: ContainerDef = CONTAINERS[id];
    if (fixed) this.fixedContents.set(uid, fixed.map((a) => ({ ...a })));
    const { object, colliders } = this.spawnProp(def.model, x, z, rot, seed, chunk);
    const remaining = this.changes.container(changeKey(chunk), uid)?.items;
    const looted = remaining !== undefined && remaining.length === 0;
    if (looted) markLooted(object);
    const interactable: Interactable = {
      id: uid,
      label: def.name,
      verb: def.requires ? 'Pry open' : 'Search',
      position: new THREE.Vector3(x, this.height.at(x, z), z),
      radius: 1.7,
      enabled: !looted,
      onInteract: () => this.ctx.onSearch(c),
    };
    const c: ContainerInstance = { uid, def, object, x, z, interactable, danger: this.biomes.danger(x, z), colliders, chunk };
    this.ctx.interactions.add(interactable);
    this.containers.add(c);
    chunk?.containers.add(c);
    return c;
  }

  /** Takes a container out of the world for good (e.g. an emptied raid cache). */
  removeContainer(c: ContainerInstance): void {
    if (!this.containers.delete(c)) return;
    this.ctx.interactions.remove(c.interactable);
    this.ctx.collision.removeAll(c.colliders);
    c.object.removeFromParent();
    disposeMerged(c.object);
    c.chunk?.containers.delete(c);
    this.changes.deleteContainer(changeKey(c.chunk), c.uid);
    this.fixedContents.delete(c.uid);
  }

  // --- Streaming -------------------------------------------------------------------------------

  private plan(cx: number, cz: number): ChunkPlan {
    const key = chunkKey(cx, cz);
    let p = this.plans.get(key);
    if (!p) {
      p = generateChunk(this.ctx.seed, this.biomes, this.height, this.regions, cx, cz);
      this.plans.set(key, p);
    }
    return p;
  }

  private stream(focus: THREE.Vector3, all: boolean): void {
    const { chunkSize, loadRadius, unloadRadius, groundRadius } = CONFIG.world;
    const fcx = Math.floor(focus.x / chunkSize);
    const fcz = Math.floor(focus.z / chunkSize);
    const far = (cx: number, cz: number, r: number) => Math.max(Math.abs(cx - fcx), Math.abs(cz - fcz)) > r;

    for (const chunk of this.chunks.values()) {
      if (far(chunk.cx, chunk.cz, unloadRadius)) this.unloadChunk(chunk);
    }
    for (const [key, tile] of this.tiles) {
      if (!far(tile.cx, tile.cz, groundRadius + 1)) continue;
      tile.object.removeFromParent();
      disposeMerged(tile.object);
      this.tiles.delete(key);
    }

    // Ground is cheap, so it streams a few tiles a frame; content is one chunk a frame.
    const tiles = nearestMissing(fcx, fcz, groundRadius, (k) => this.tiles.has(k));
    for (const [cx, cz] of all ? tiles : tiles.slice(0, 4)) {
      const object = this.ground.buildTile(cx, cz);
      this.ctx.scene.add(object);
      this.tiles.set(chunkKey(cx, cz), { cx, cz, object });
    }
    const chunks = nearestMissing(fcx, fcz, loadRadius, (k) => this.chunks.has(k));
    for (const [cx, cz] of all ? chunks : chunks.slice(0, 1)) this.loadChunk(cx, cz);

    const focusKey = chunkKey(fcx, fcz);
    if (focusKey !== this.planFocus) {
      this.planFocus = focusKey;
      this.evictPlans(fcx, fcz);
      this.height.evict(fcx, fcz, CONFIG.world.planKeepRadius + 2);
    }
  }

  /** Drops far chunk layouts; anything changed in them lives in `changes`, the rest regenerates. */
  private evictPlans(fcx: number, fcz: number): void {
    const keep = CONFIG.world.planKeepRadius;
    for (const [key, p] of this.plans) {
      if (Math.max(Math.abs(p.cx - fcx), Math.abs(p.cz - fcz)) > keep && !this.chunks.has(key)) this.plans.delete(key);
    }
  }

  private loadChunk(cx: number, cz: number): void {
    const S = CONFIG.world.chunkSize;
    const plan = this.plan(cx, cz);
    const root = new THREE.Group();
    root.name = `chunk ${cx},${cz}`;
    const chunk: Chunk = {
      key: chunkKey(cx, cz), cx, cz, root,
      colliders: [], lights: [], occluders: [], nodes: new Set(), containers: new Set(), structures: [], grass: null, links: [],
    };
    this.chunks.set(chunk.key, chunk);
    this.ctx.scene.add(root);

    for (const s of plan.spawns) {
      switch (s.kind) {
        case 'node':
          this.spawnNode(s.node, s.x, s.z, s.rot, s.seed, s.uid, chunk);
          break;
        case 'container':
          this.spawnContainer(s.container, s.x, s.z, s.rot, s.seed, s.uid, chunk);
          break;
        case 'prop':
          this.spawnProp(s.model, s.x, s.z, s.rot, s.seed, chunk);
          break;
        case 'structure': {
          const { object } = this.spawnProp(s.model, s.x, s.z, s.rot, s.seed, chunk);
          const cos = Math.cos(s.rot);
          const sin = Math.sin(s.rot);
          const slots = (object.userData.containers as ContainerSlot[] | undefined) ?? [];
          slots.forEach((slot, i) => {
            const wx = s.x + slot.x * cos + slot.z * sin;
            const wz = s.z - slot.x * sin + slot.z * cos;
            this.spawnContainer(SLOT_TO_CONTAINER[slot.type], wx, wz, s.rot + slot.rot, s.seed + i + 1, `${s.uid}:c${i}`, chunk);
          });
          const mm = object.userData.minimap as { kind: 'ruin' | 'lab'; w: number; d: number } | undefined;
          if (mm) chunk.structures.push({ x: s.x, z: s.z, rot: s.rot, w: mm.w, d: mm.d, kind: mm.kind });
          break;
        }
      }
    }

    this.changes.visit(chunk.key, this.time, chunk.structures.filter((s): s is KnownStructure => s.kind !== 'hut'));
    const blocks = this.height.blockBoxes(cx, cz);
    for (const b of blocks.cliffs) chunk.colliders.push(this.ctx.collision.addBox(b.x, b.z, b.hw, b.hd, CLIFF_TAG));
    for (const b of blocks.water) chunk.colliders.push(this.ctx.collision.addBox(b.x, b.z, b.hw, b.hd, WATER_TAG));
    this.buildChunkGrass(chunk);
    const seed = chunkSeed(this.ctx.seed, cx, cz);
    const gas = buildGasClouds(cx * S, cz * S, S, seed + 7, (x, z) => this.staticGasAt(x, z), (x, z) => this.height.at(x, z));
    if (gas) root.add(gas);
    for (const m of buildDecals(plan.decals, (x, z) => this.height.at(x, z), (x, z) => this.height.waterDepth(x, z))) root.add(m);
  }

  /** Marks (or with `rect` null, clears) a built floor and regrows grass in the chunks it touches. */
  setFloor(key: string, rect: FloorRect | null): void {
    const old = this.floors.get(key);
    if (rect) this.floors.set(key, rect);
    else this.floors.delete(key);
    const r = rect ?? old;
    if (!r) return;
    const S = CONFIG.world.chunkSize;
    for (const chunk of this.chunks.values()) {
      const x0 = chunk.cx * S;
      const z0 = chunk.cz * S;
      if (r.maxX < x0 - 1 || r.minX > x0 + S + 1 || r.maxZ < z0 - 1 || r.minZ > z0 + S + 1) continue;
      this.buildChunkGrass(chunk);
    }
  }

  private buildChunkGrass(chunk: Chunk): void {
    const { chunkSize: S } = CONFIG.world;
    if (chunk.grass) {
      chunk.grass.removeFromParent();
      chunk.grass.dispose();
    }
    const m = 0.3;
    chunk.grass = buildGrass(
      chunk.cx * S, chunk.cz * S, S, chunkSeed(this.ctx.seed, chunk.cx, chunk.cz) + 99,
      (x, z) => this.biomes.sample(x, z).biome,
      (x, z) => this.height.at(x, z),
      (x, z) => {
        if (this.regions.clearance(x, z, 1) < m) return true;
        if (this.regions.blocked(x, z, 0)) return true;
        if (Math.abs(x) < 4.5 && Math.abs(z) < 4.5) return true;
        if (this.height.slopeDeg(x, z) > 40) return true;
        if (this.height.waterDepth(x, z) > -0.15) return true;
        for (const f of chunk.structures) {
          if (Math.abs(x - f.x) < Math.max(f.w, f.d) / 2 + m && Math.abs(z - f.z) < Math.max(f.w, f.d) / 2 + m) return true;
        }
        for (const f of this.floors.values()) {
          if (x > f.minX - m && x < f.maxX + m && z > f.minZ - m && z < f.maxZ + m) return true;
        }
        return false;
      },
    );
    if (chunk.grass) chunk.root.add(chunk.grass);
  }

  /** Gas without transient puffs (used to place permanent cloud visuals). */
  private staticGasAt(x: number, z: number): number {
    const saved = this.puffs.length;
    if (saved === 0) return this.gasAt(x, z);
    const tmp = this.puffs.splice(0, saved);
    const g = this.gasAt(x, z);
    this.puffs.push(...tmp);
    return g;
  }

  private unloadChunk(chunk: Chunk): void {
    this.ctx.collision.removeAll(chunk.colliders);
    for (const l of chunk.links) this.traversal.remove(l);
    this.ctx.lights.removeAll(chunk.lights);
    for (const o of chunk.occluders) this.ctx.occlusion.unregister(o);
    for (const n of chunk.nodes) {
      this.ctx.collision.removeAll(n.colliders);
      this.ctx.lights.removeAll(n.lights);
      this.nodes.delete(n);
    }
    for (const c of chunk.containers) {
      this.ctx.interactions.remove(c.interactable);
      this.containers.delete(c);
    }
    chunk.root.removeFromParent();
    disposeMerged(chunk.root);
    this.chunks.delete(chunk.key);
  }

  private removeNode(n: NodeInstance): void {
    this.ctx.collision.removeAll(n.colliders);
    this.ctx.lights.removeAll(n.lights);
    n.object.removeFromParent();
    disposeMerged(n.object);
    this.nodes.delete(n);
    n.chunk?.nodes.delete(n);
  }

  // --- Debug searches ----------------------------------------------------------------------------

  /** Debug: a spot to stand at the nearest feature of a kind, searching outward from (x, z). */
  findFeature(kind: FeatureKind, x: number, z: number, max = 2500): THREE.Vector3 | null {
    const h = this.height;
    const S = CONFIG.world.chunkSize;
    const near = (px: number, pz: number) => Math.hypot(px - x, pz - z);
    if (kind === 'crater') {
      const c = h.cratersNear(x, z, max).sort((a, b) => near(a.x, a.z) - near(b.x, b.z))[0];
      return c ? this.bankNear(c.x + c.r * 1.3, c.z, 6) : null;
    }
    if (kind === 'bridge') {
      let best: THREE.Vector3 | null = null;
      for (const c of h.crossingsNear(x, z, max)) {
        const p = new THREE.Vector3(c.x + c.nx * (c.hl + 2), 0, c.z + c.nz * (c.hl + 2));
        if (!best || near(p.x, p.z) < near(best.x, best.z)) best = p;
      }
      const fcx = Math.floor(x / S);
      const fcz = Math.floor(z / S);
      for (let r = 0; r * S < Math.min(max, 1200); r++) {
        if (best && near(best.x, best.z) < (r - 1) * S) break;
        for (let cx = fcx - r; cx <= fcx + r; cx++) {
          for (let cz = fcz - r; cz <= fcz + r; cz++) {
            if (Math.max(Math.abs(cx - fcx), Math.abs(cz - fcz)) !== r) continue;
            for (const b of h.roadBridgesIn(cx, cz)) {
              const p = new THREE.Vector3(b.x - Math.cos(b.rot) * (b.length / 2 + 4), 0, b.z + Math.sin(b.rot) * (b.length / 2 + 4));
              if (!best || near(p.x, p.z) < near(best.x, best.z)) best = p;
            }
          }
        }
      }
      return best?.setY(h.probe(best.x, best.z).h) ?? null;
    }
    if (kind === 'town' || kind === 'industrial' || kind === 'farm') {
      const want: District = kind;
      const ri = Math.round(x / 512);
      const rj = Math.round(z / 512);
      let best: THREE.Vector3 | null = null;
      for (let r = 0; r <= 5 && !best; r++) {
        for (let i = ri - r; i <= ri + r; i++) {
          for (let j = rj - r; j <= rj + r; j++) {
            const m = this.regions.meta(i, j);
            if (m.district !== want) continue;
            const p = new THREE.Vector3(m.x + 6, 0, m.z + 6);
            if (!best || near(p.x, p.z) < near(best.x, best.z)) best = p;
          }
        }
      }
      return best?.setY(h.probe(best.x, best.z).h) ?? null;
    }
    const test = (px: number, pz: number): boolean => {
      const p = h.probe(px, pz);
      if (kind === 'water') return p.depth > 0.6;
      if (kind === 'ford') return p.kind === 'river' && p.depth > 0.2 && p.depth < 0.7;
      return p.depth > 0.3 && (p.kind === 'crater' || this.biomes.toxicity(px, pz) > 0.3);
    };
    for (let r = 0; r < max; r += 10) {
      const n = r === 0 ? 1 : Math.ceil((Math.PI * 2 * r) / 10);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (!test(px, pz)) continue;
        if (kind === 'ford') return new THREE.Vector3(px, h.probe(px, pz).h, pz);
        return this.bankNear(px, pz, 30);
      }
    }
    return null;
  }

  /** Nearest dry spot to stand on within `radius` of a point (just above the waterline if there is water). */
  private bankNear(x: number, z: number, radius: number): THREE.Vector3 {
    for (let r = 1; r <= radius; r++) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const p = this.height.probe(px, pz);
        if (p.depth < -0.15 && p.depth > -1.6) return new THREE.Vector3(px, p.h, pz);
      }
    }
    return new THREE.Vector3(x, this.height.probe(x, z).h, z);
  }

  /**
   * Debug: flood-fills walkable ground (slopes up to 45°, no deep water) out from the hut on a
   * coarse grid, with traversal links as extra edges. Reports how much of it can actually be reached.
   */
  reachability(radius = 480, cell = 2): { walkable: number; reached: number; ms: number } {
    const t0 = performance.now();
    const n = Math.ceil((radius * 2) / cell);
    const hs = new Float32Array(n * n);
    const ok = new Uint8Array(n * n);
    const idx = (x: number, z: number) => {
      const ix = Math.floor((x + radius) / cell);
      const iz = Math.floor((z + radius) / cell);
      return ix < 0 || iz < 0 || ix >= n || iz >= n ? -1 : iz * n + ix;
    };
    let walkable = 0;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        const x = -radius + (ix + 0.5) * cell;
        const z = -radius + (iz + 0.5) * cell;
        const p = this.height.probe(x, z);
        const i = iz * n + ix;
        hs[i] = p.h;
        if (p.depth < CONFIG.world.deepWater && Math.hypot(x, z) < radius) {
          ok[i] = 1;
          walkable++;
        }
      }
    }
    const jumps = new Map<number, number[]>();
    const join = (a: number, b: number) => {
      if (a < 0 || b < 0) return;
      (jumps.get(a) ?? jumps.set(a, []).get(a)!).push(b);
      (jumps.get(b) ?? jumps.set(b, []).get(b)!).push(a);
    };
    for (const l of this.traversal.all()) {
      const a = l.path[0];
      const b = l.path[l.path.length - 1];
      join(idx(a.x, a.z), idx(b.x, b.z));
    }
    const seen = new Uint8Array(n * n);
    const queue: number[] = [];
    const start = idx(0, 0);
    seen[start] = 1;
    queue.push(start);
    const maxRise = cell * Math.tan((CONFIG.world.steepSlope * Math.PI) / 180);
    let reached = 0;
    while (queue.length) {
      const i = queue.pop()!;
      if (ok[i]) reached++;
      const ix = i % n;
      const iz = (i - ix) / n;
      const visit = (j: number, step: boolean) => {
        if (j < 0 || seen[j] || !ok[j]) return;
        if (step && Math.abs(hs[j] - hs[i]) > maxRise) return;
        seen[j] = 1;
        queue.push(j);
      };
      if (ix > 0) visit(i - 1, true);
      if (ix < n - 1) visit(i + 1, true);
      if (iz > 0) visit(i - n, true);
      if (iz < n - 1) visit(i + n, true);
      for (const j of jumps.get(i) ?? []) visit(j, false);
    }
    return { walkable, reached, ms: Math.round(performance.now() - t0) };
  }

  /** Structures currently known (loaded chunks + the hut), for the minimap. */
  structures(): StructureMarker[] {
    const out = [...this.permanentStructures];
    for (const c of this.chunks.values()) out.push(...c.structures);
    return out;
  }
}

/** Chunks within `radius` (square ring) of the focus that `has` says are missing, nearest first. */
function nearestMissing(fcx: number, fcz: number, radius: number, has: (key: string) => boolean): [number, number][] {
  const out: [number, number, number][] = [];
  for (let cx = fcx - radius; cx <= fcx + radius; cx++) {
    for (let cz = fcz - radius; cz <= fcz + radius; cz++) {
      if (!has(chunkKey(cx, cz))) out.push([cx, cz, (cx - fcx) ** 2 + (cz - fcz) ** 2]);
    }
  }
  out.sort((a, b) => a[2] - b[2]);
  return out.map(([cx, cz]) => [cx, cz]);
}

function zoneValue(zone: GasZone, x: number, z: number): number {
  const d = Math.hypot(x - zone.x, z - zone.z);
  if (d >= zone.r) return 0;
  return zone.intensity * smoothstep(zone.r, zone.r * 0.5, d);
}

const lootedMats = new WeakMap<THREE.Material, THREE.Material>();
const lootedSet = new WeakSet<THREE.Material>();

/** Darkens a searched container so it reads as empty at a glance. */
function markLooted(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || lootedSet.has(o.material)) return;
    let m = lootedMats.get(o.material);
    if (!m) {
      const c = (o.material as THREE.MeshStandardMaterial).clone();
      c.color.multiplyScalar(0.45);
      m = c;
      lootedMats.set(o.material, m);
      lootedSet.add(m);
    }
    o.material = m;
  });
}
