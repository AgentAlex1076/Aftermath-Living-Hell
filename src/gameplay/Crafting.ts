import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { ITEMS, type ItemDef } from '../data/items';
import type { Recipe } from '../data/recipes';
import type { Inventory } from './Inventory';

export interface CraftJob {
  readonly recipe: Recipe;
  elapsed: number;
  /** Finished, but waiting for backpack space. */
  blocked: boolean;
}

export type CraftCheck = { ok: true } | { ok: false; reason: string };

/** The player's crafting queue. Inputs are taken when queued, so it keeps going while you explore. */
export class Crafting {
  readonly queue: CraftJob[] = [];
  crafted = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly inv: Inventory,
    private readonly onCrafted: (recipe: Recipe) => void,
  ) {}

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  check(recipe: Recipe, nearWorkbench: boolean): CraftCheck {
    if (recipe.station === 'workbench' && !nearWorkbench) return { ok: false, reason: 'NEEDS CRAFTING TABLE' };
    if (this.queue.length >= CONFIG.crafting.queueLimit) return { ok: false, reason: 'QUEUE FULL' };
    if (!this.inv.hasAll(recipe.inputs)) return { ok: false, reason: 'MISSING MATERIALS' };
    return { ok: true };
  }

  /** How many of `recipe` the player could queue right now (capped at `max`). */
  affordable(recipe: Recipe, max: number): number {
    let n = 0;
    while (n < max && this.inv.hasAll(recipe.inputs, n + 1)) n++;
    return Math.min(n, CONFIG.crafting.queueLimit - this.queue.length);
  }

  enqueue(recipe: Recipe, count: number, nearWorkbench: boolean): number {
    let queued = 0;
    for (let i = 0; i < count; i++) {
      if (!this.check(recipe, nearWorkbench).ok) break;
      for (const a of recipe.inputs) this.inv.remove(a.item, a.qty);
      this.queue.push({ recipe, elapsed: 0, blocked: false });
      queued++;
    }
    if (queued) this.changed();
    return queued;
  }

  cancel(index: number): void {
    const job = this.queue[index];
    if (!job) return;
    this.queue.splice(index, 1);
    let lost = 0;
    for (const a of job.recipe.inputs) lost += this.inv.add(a.item, a.qty);
    if (lost > 0) events.emit('toast', { text: 'Backpack full. Some refunded materials were lost.', tone: 'warn' });
    this.changed();
  }

  update(dt: number): void {
    const job = this.queue[0];
    if (!job) return;
    job.elapsed = Math.min(job.recipe.time, job.elapsed + dt);
    if (job.elapsed < job.recipe.time) return;

    const { output, qty } = job.recipe;
    if (this.inv.roomFor(output) < qty) {
      if (!job.blocked) {
        job.blocked = true;
        const def: ItemDef = ITEMS[output];
        events.emit('toast', { text: `${def.name} is done, but your backpack is full.`, tone: 'warn' });
        this.changed();
      }
      return;
    }
    this.inv.add(output, qty);
    this.queue.shift();
    this.crafted += qty;
    this.onCrafted(job.recipe);
    this.changed();
  }

  /** 0..1 progress of the job at the front of the queue. */
  get progress(): number {
    const job = this.queue[0];
    return job ? job.elapsed / job.recipe.time : 0;
  }
}
