import type { ItemAmount } from '../data/loot';

/** Where permanent things (the hut yard, raid caches) file their changes. */
export const HOME_KEY = 'home';

export interface NodeChange {
  hp: number;
  carry: number[];
  /** World clock (seconds) of the last hit. */
  at: number;
}

export interface ContainerChange {
  items: ItemAmount[];
  at: number;
}

/** A structure seen on a chunk, kept so the map can show it after the chunk unloads. */
export interface KnownStructure {
  x: number;
  z: number;
  rot: number;
  w: number;
  d: number;
  kind: 'ruin' | 'lab';
}

interface ChunkChanges {
  nodes: Map<string, NodeChange>;
  containers: Map<string, ContainerChange>;
  /** First time the chunk was streamed in. */
  visitedAt: number | null;
  structures: KnownStructure[];
}

export interface SerializedChanges {
  version: 1;
  chunks: Record<string, {
    nodes: [string, NodeChange][];
    containers: [string, ContainerChange][];
    visitedAt: number | null;
    structures: KnownStructure[];
  }>;
}

/**
 * Everything the player changed, per chunk and timestamped. Chunk layouts themselves are thrown
 * away and regenerated from the seed, so this is the only world state a far chunk keeps.
 */
export class ChangeStore {
  private readonly chunks = new Map<string, ChunkChanges>();

  get chunkCount(): number {
    return this.chunks.size;
  }

  node(chunk: string, uid: string): NodeChange | undefined {
    return this.chunks.get(chunk)?.nodes.get(uid);
  }

  setNode(chunk: string, uid: string, hp: number, carry: number[], at: number): void {
    this.entry(chunk).nodes.set(uid, { hp, carry, at });
  }

  container(chunk: string, uid: string): ContainerChange | undefined {
    return this.chunks.get(chunk)?.containers.get(uid);
  }

  setContainer(chunk: string, uid: string, items: ItemAmount[], at: number): void {
    this.entry(chunk).containers.set(uid, { items, at });
  }

  deleteContainer(chunk: string, uid: string): void {
    this.chunks.get(chunk)?.containers.delete(uid);
  }

  /** Notes a chunk streaming in. The first visit also records what stands on it. */
  visit(chunk: string, at: number, structures: readonly KnownStructure[]): void {
    const e = this.entry(chunk);
    if (e.visitedAt !== null) return;
    e.visitedAt = at;
    e.structures = structures.map((s) => ({ ...s }));
  }

  /** Every structure on a visited chunk. */
  *structures(): IterableIterator<KnownStructure> {
    for (const c of this.chunks.values()) yield* c.structures;
  }

  toJSON(): SerializedChanges {
    const chunks: SerializedChanges['chunks'] = {};
    for (const [key, c] of this.chunks) {
      chunks[key] = { nodes: [...c.nodes], containers: [...c.containers], visitedAt: c.visitedAt, structures: c.structures };
    }
    return { version: 1, chunks };
  }

  static fromJSON(data: SerializedChanges): ChangeStore {
    const store = new ChangeStore();
    for (const [key, c] of Object.entries(data.chunks)) {
      store.chunks.set(key, {
        nodes: new Map(c.nodes),
        containers: new Map(c.containers),
        visitedAt: c.visitedAt,
        structures: c.structures,
      });
    }
    return store;
  }

  private entry(chunk: string): ChunkChanges {
    let e = this.chunks.get(chunk);
    if (!e) {
      e = { nodes: new Map(), containers: new Map(), visitedAt: null, structures: [] };
      this.chunks.set(chunk, e);
    }
    return e;
  }
}
