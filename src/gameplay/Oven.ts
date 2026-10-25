import { events } from '../core/EventBus';
import { ITEMS, type ItemDef, type ItemId } from '../data/items';
import { OVEN_FUEL, type OvenRecipe } from '../data/recipes';
import type { Inventory, Stack } from './Inventory';

export interface OvenJob {
  readonly recipe: OvenRecipe;
  elapsed: number;
}

const MAX_JOBS = 24;

/**
 * The hut's Oven: burns wood to cook and smelt in the background, even while you're out
 * in the wasteland. Finished goods (and charcoal from the burnt wood) pile up in its tray.
 */
export class Oven {
  fuel = 0;
  readonly jobs: OvenJob[] = [];
  readonly output: Stack[] = [];
  /** Seconds left on the log currently burning. */
  private burn = 0;
  private charcoalAcc = 0;
  private wasLit = false;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly inv: Inventory) {}

  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  get lit(): boolean {
    return this.jobs.length > 0 && (this.burn > 0 || this.fuel > 0);
  }

  /** 0..1 progress of the current job. */
  get progress(): number {
    const j = this.jobs[0];
    return j ? j.elapsed / j.recipe.time : 0;
  }

  get outputCount(): number {
    return this.output.reduce((n, s) => n + s.qty, 0);
  }

  addFuel(amount: number): number {
    const n = Math.min(amount, this.inv.count(OVEN_FUEL.item), OVEN_FUEL.maxFuel - this.fuel);
    if (n <= 0) return 0;
    this.inv.remove(OVEN_FUEL.item, n);
    this.fuel += n;
    this.changed();
    return n;
  }

  takeFuel(): void {
    const left = this.inv.add(OVEN_FUEL.item, this.fuel);
    this.fuel = left;
    this.changed();
  }

  canAdd(recipe: OvenRecipe): boolean {
    return this.jobs.length < MAX_JOBS && this.inv.count(recipe.input.item) >= recipe.input.qty;
  }

  addJobs(recipe: OvenRecipe, count: number): number {
    let n = 0;
    while (n < count && this.canAdd(recipe)) {
      this.inv.remove(recipe.input.item, recipe.input.qty);
      this.jobs.push({ recipe, elapsed: 0 });
      n++;
    }
    if (n) this.changed();
    return n;
  }

  cancelJob(index: number): void {
    const job = this.jobs[index];
    if (!job) return;
    this.jobs.splice(index, 1);
    const lost = this.inv.add(job.recipe.input.item, job.recipe.input.qty);
    if (lost) this.stash(job.recipe.input.item, lost);
    this.changed();
  }

  /** Moves everything in the tray into the backpack. Returns what was taken. */
  takeOutput(): Stack[] {
    const taken: Stack[] = [];
    for (let i = this.output.length - 1; i >= 0; i--) {
      const s = this.output[i];
      const left = this.inv.add(s.item, s.qty);
      if (left < s.qty) taken.push({ item: s.item, qty: s.qty - left });
      if (left === 0) this.output.splice(i, 1);
      else s.qty = left;
    }
    if (taken.length) this.changed();
    return taken.reverse();
  }

  update(dt: number): void {
    if (this.jobs.length === 0) {
      this.setLit(false);
      return;
    }
    if (this.burn <= 0) {
      if (this.fuel <= 0) {
        this.setLit(false);
        return;
      }
      this.fuel--;
      this.burn += OVEN_FUEL.burnTime;
      this.charcoalAcc += OVEN_FUEL.charcoalPerFuel;
      if (this.charcoalAcc >= 1) {
        this.charcoalAcc -= 1;
        this.stash('charcoal', 1);
      }
      this.changed();
    }
    this.setLit(true);
    this.burn -= dt;

    const job = this.jobs[0];
    job.elapsed += dt;
    if (job.elapsed >= job.recipe.time) {
      this.jobs.shift();
      this.stash(job.recipe.output.item, job.recipe.output.qty);
      events.emit('recipe:made', { id: job.recipe.id });
      if (this.jobs.length === 0) {
        const def: ItemDef = ITEMS[job.recipe.output.item];
        events.emit('toast', { text: `Oven's done. ${def.name} is waiting in the tray.`, tone: 'info' });
      }
      this.changed();
    }
  }

  private stash(item: ItemId, qty: number): void {
    const s = this.output.find((o) => o.item === item);
    if (s) s.qty += qty;
    else this.output.push({ item, qty });
  }

  private setLit(lit: boolean): void {
    if (lit === this.wasLit) return;
    this.wasLit = lit;
    if (!lit && this.jobs.length > 0 && this.fuel <= 0) {
      events.emit('toast', { text: 'The Oven went cold. Feed it more wood.', tone: 'warn' });
    }
    this.changed();
  }
}
