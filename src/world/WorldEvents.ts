/** Kinds of timed world happenings. Nothing schedules these yet; supply drops and restocks plug in here. */
export type WorldEventKind = 'supplyDrop' | 'restock';

export interface WorldEvent {
  kind: WorldEventKind;
  /** World clock (seconds) when it fires. */
  at: number;
  x: number;
  z: number;
}

type Handler = (e: WorldEvent) => void;

/** A time-ordered queue of world events, fired against the world clock. */
export class WorldEvents {
  private readonly queue: WorldEvent[] = [];
  private readonly handlers = new Map<WorldEventKind, Set<Handler>>();

  get pending(): number {
    return this.queue.length;
  }

  schedule(e: WorldEvent): void {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].at > e.at) i--;
    this.queue.splice(i, 0, e);
  }

  on(kind: WorldEventKind, handler: Handler): () => void {
    let set = this.handlers.get(kind);
    if (!set) {
      set = new Set();
      this.handlers.set(kind, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  update(now: number): void {
    while (this.queue.length && this.queue[0].at <= now) {
      const e = this.queue.shift()!;
      for (const h of this.handlers.get(e.kind) ?? []) h(e);
    }
  }
}
