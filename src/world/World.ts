import * as THREE from 'three';
import { CONFIG } from '../data/config';
import { CONTAINERS, rollLoot, type ContainerDef, type ContainerId, type ItemAmount } from '../data/loot';
import { NODES, type NodeId, type ResourceNodeDef } from '../data/nodes';
import { hashString, Rng } from '../core/random';
import { smoothstep, wrapAngle } from '../core/math';
import { models } from '../models/ModelRegistry';
import { disposeMerged, mergeStatic } from '../models/merge';
import type { ContainerSlot } from '../models/ruins';
import type { Collider, CollisionWorld } from '../physics/Collision';
import type { LightEmitter, LightPool } from '../render/LightPool';
import type { Occluder, OcclusionFader } from '../render/Occlusion';
import { Biomes, type BiomeSample } from './Biomes';
import { chunkSeed, generateChunk, type ChunkPlan, type GasZone } from './ChunkGenerator';
import { buildGasClouds, buildGrass, getGasMaterial } from './Decor';
import type { Interactable, InteractionSystem } from './Interactables';
import { buildTerrain } from './Terrain';

export interface NodeInstance {
  readonly uid: string;
  readonly def: ResourceNodeDef;
  readonly object: THREE.Object3D;
  readonly x: number;
  readonly z: number;
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
}

const SLOT_TO_CONTAINER: Record<ContainerSlot['type'], ContainerId> = {
  crate: 'crate',
  cabinet: 'cabinet',
  toolbox: 'toolbox',
  labLocker: 'labLocker',
};

const chunkKey = (cx: number, cz: number) => `${cx},${cz}`;

/**
 * The procedural wasteland: streams chunks around the player, owns resource nodes and loot
 * containers, and remembers what was harvested or looted for the rest of the run.
 */
export class World {
  readonly biomes: Biomes;
  readonly nodes = new Set<NodeInstance>();
  readonly containers = new Set<ContainerInstance>();
  readonly permanentStructures: StructureMarker[] = [];
  private readonly ctx: WorldContext;
  private readonly permanent = new THREE.Group();
  private readonly plans = new Map<string, ChunkPlan>();
  private readonly chunks = new Map<string, Chunk>();
  private readonly nodeState = new Map<string, { hp: number; carry: number[] }>();
  private readonly containerState = new Map<string, ItemAmount[]>();
  private readonly fixedContents = new Map<string, ItemAmount[]>();
  private readonly puffs: Puff[] = [];
  /** Player-built floors; grass never grows through them. */
  private readonly floors = new Map<string, FloorRect>();
  private readonly minChunk: number;
  private readonly maxChunk: number;
  private time = 0;

  constructor(ctx: WorldContext) {
    this.ctx = ctx;
    this.biomes = new Biomes(ctx.seed);
    ctx.scene.add(buildTerrain(this.biomes));
    this.permanent.name = 'permanent';
    ctx.scene.add(this.permanent);
    const { halfSize, chunkSize } = CONFIG.world;
    this.minChunk = Math.floor(-halfSize / chunkSize);
    this.maxChunk = Math.floor((halfSize - 0.001) / chunkSize);
  }

  get loadedChunks(): number {
    return this.chunks.size;
  }

  /** Streams chunks around `focus`. With `all`, loads everything in range immediately. */
  update(dt: number, focus: THREE.Vector3, all = false): void {
    this.time += dt;
    const gasUniforms = getGasMaterial().uniforms;
    gasUniforms.uTime.value = this.time;
    gasUniforms.uPlayer.value.copy(focus);
    this.stream(focus, all);

    for (const n of this.nodes) {
      if (n.shake <= 0) continue;
      n.shake = Math.max(0, n.shake - dt * 5);
      const o = Math.sin(this.time * 55) * 0.07 * n.shake;
      n.object.position.set(n.x + n.shakeX * o, 0, n.z + n.shakeZ * o);
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      this.puffs[i].life -= dt;
      if (this.puffs[i].life <= 0) this.puffs.splice(i, 1);
    }
  }

  sample(x: number, z: number): BiomeSample {
    return this.biomes.sample(x, z);
  }

  /** Gas intensity (0..1+) at a point: toxic biome field, lab zones, world edge and fresh puffs. */
  gasAt(x: number, z: number): number {
    const { halfSize, chunkSize } = CONFIG.world;
    let g = smoothstep(0.25, 0.8, this.biomes.toxicity(x, z));
    g = Math.max(g, smoothstep(halfSize - 18, halfSize - 3, Math.max(Math.abs(x), Math.abs(z))) * 1.2);
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
    this.nodeState.set(n.uid, { hp: n.hp, carry: n.carry });

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
    let contents = this.containerState.get(c.uid);
    if (!contents) {
      contents = this.fixedContents.get(c.uid)?.map((a) => ({ ...a })) ?? rollLoot(c.def, new Rng(hashString(c.uid) ^ this.ctx.seed), c.danger);
      this.containerState.set(c.uid, contents);
    }
    return contents;
  }

  setContents(c: ContainerInstance, remaining: ItemAmount[]): void {
    this.containerState.set(c.uid, remaining);
    c.interactable.enabled = remaining.length > 0;
    if (remaining.length === 0) markLooted(c.object);
  }

  // --- Spawning --------------------------------------------------------------------------------

  /** Places a model with its colliders, lights and fading walls. `chunk` null means permanent. */
  spawnProp(model: string, x: number, z: number, rot: number, seed: number, chunk: Chunk | null = null, trackInChunk = true) {
    const obj = models.create(model, seed);
    obj.position.set(x, 0, z);
    obj.rotation.y = rot;
    mergeStatic(obj);
    (chunk ? chunk.root : this.permanent).add(obj);
    obj.updateMatrixWorld(true);
    const colliders = this.ctx.collision.addFromObject(obj);
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

  spawnNode(id: NodeId, x: number, z: number, rot: number, seed: number, uid: string, chunk: Chunk | null = null): NodeInstance | null {
    const state = this.nodeState.get(uid);
    if (state && state.hp <= 0.001) return null;
    const def: ResourceNodeDef = NODES[id];
    const { object, colliders, lights } = this.spawnProp(def.model, x, z, rot, seed, chunk, false);
    const n: NodeInstance = {
      uid, def, object, x, z, radius: def.radius, colliders, lights,
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
    const { object } = this.spawnProp(def.model, x, z, rot, seed, chunk);
    const remaining = this.containerState.get(uid);
    const looted = remaining !== undefined && remaining.length === 0;
    if (looted) markLooted(object);
    const interactable: Interactable = {
      id: uid,
      label: def.name,
      verb: def.requires ? 'Pry open' : 'Search',
      position: new THREE.Vector3(x, 0, z),
      radius: 1.7,
      enabled: !looted,
      onInteract: () => this.ctx.onSearch(c),
    };
    const c: ContainerInstance = { uid, def, object, x, z, interactable, danger: this.biomes.danger(x, z) };
    this.ctx.interactions.add(interactable);
    this.containers.add(c);
    chunk?.containers.add(c);
    return c;
  }

  // --- Streaming -------------------------------------------------------------------------------

  private plan(cx: number, cz: number): ChunkPlan {
    const key = chunkKey(cx, cz);
    let p = this.plans.get(key);
    if (!p) {
      p = generateChunk(this.ctx.seed, this.biomes, cx, cz);
      this.plans.set(key, p);
    }
    return p;
  }

  private stream(focus: THREE.Vector3, all: boolean): void {
    const { chunkSize, loadRadius, unloadRadius } = CONFIG.world;
    const fcx = Math.floor(focus.x / chunkSize);
    const fcz = Math.floor(focus.z / chunkSize);

    for (const chunk of this.chunks.values()) {
      if (Math.max(Math.abs(chunk.cx - fcx), Math.abs(chunk.cz - fcz)) > unloadRadius) this.unloadChunk(chunk);
    }

    const wanted: [number, number, number][] = [];
    for (let cx = fcx - loadRadius; cx <= fcx + loadRadius; cx++) {
      for (let cz = fcz - loadRadius; cz <= fcz + loadRadius; cz++) {
        if (cx < this.minChunk || cx > this.maxChunk || cz < this.minChunk || cz > this.maxChunk) continue;
        if (this.chunks.has(chunkKey(cx, cz))) continue;
        wanted.push([cx, cz, (cx - fcx) ** 2 + (cz - fcz) ** 2]);
      }
    }
    wanted.sort((a, b) => a[2] - b[2]);
    const budget = all ? wanted.length : 1;
    for (let i = 0; i < Math.min(budget, wanted.length); i++) this.loadChunk(wanted[i][0], wanted[i][1]);
  }

  private loadChunk(cx: number, cz: number): void {
    const S = CONFIG.world.chunkSize;
    const plan = this.plan(cx, cz);
    const root = new THREE.Group();
    root.name = `chunk ${cx},${cz}`;
    const chunk: Chunk = {
      key: chunkKey(cx, cz), cx, cz, root,
      colliders: [], lights: [], occluders: [], nodes: new Set(), containers: new Set(), structures: [], grass: null,
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

    this.buildChunkGrass(chunk);
    const seed = chunkSeed(this.ctx.seed, cx, cz);
    const gas = buildGasClouds(cx * S, cz * S, S, seed + 7, (x, z) => this.staticGasAt(x, z));
    if (gas) root.add(gas);
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
    const { chunkSize: S, roadZ, roadWidth } = CONFIG.world;
    if (chunk.grass) {
      chunk.grass.removeFromParent();
      chunk.grass.dispose();
    }
    const m = 0.3;
    chunk.grass = buildGrass(
      chunk.cx * S, chunk.cz * S, S, chunkSeed(this.ctx.seed, chunk.cx, chunk.cz) + 99,
      (x, z) => this.biomes.sample(x, z).biome,
      (x, z) => {
        if (Math.abs(z - roadZ) < roadWidth / 2 + m) return true;
        if (Math.abs(x) < 4.5 && Math.abs(z) < 4.5) return true;
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

  /** Structures currently known (loaded chunks + the hut), for the minimap. */
  structures(): StructureMarker[] {
    const out = [...this.permanentStructures];
    for (const c of this.chunks.values()) out.push(...c.structures);
    return out;
  }
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
