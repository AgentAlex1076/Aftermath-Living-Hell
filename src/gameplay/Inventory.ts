import { CONFIG } from '../data/config';
import { ITEMS, type ItemDef, type ItemId, type ToolKind, type ToolStats } from '../data/items';

export interface Stack {
  item: ItemId;
  qty: number;
}

/**
 * A grid of item slots. For the player, slots 0..hotbarSize-1 are the hotbar and the rest are
 * the backpack; storage boxes are plain containers with no hotbar.
 */
export class Inventory {
  readonly slots: (Stack | null)[];
  selected = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly size = CONFIG.inventory.hotbarSlots + CONFIG.inventory.backpackSlots,
    readonly hotbarSize: number = CONFIG.inventory.hotbarSlots,
  ) {
    this.slots = new Array(size).fill(null);
  }

  get empty(): boolean {
    return this.slots.every((s) => !s);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    for (const fn of this.listeners) fn();
  }

  get selectedStack(): Stack | null {
    return this.slots[this.selected];
  }

  /** The tool in the selected hotbar slot, if any. */
  get equippedTool(): ToolStats | null {
    const s = this.selectedStack;
    return s ? ((ITEMS[s.item] as ItemDef).tool ?? null) : null;
  }

  select(i: number): void {
    if (i < 0 || i >= this.hotbarSize || i === this.selected) return;
    this.selected = i;
    this.changed();
  }

  count(item: ItemId): number {
    let n = 0;
    for (const s of this.slots) if (s?.item === item) n += s.qty;
    return n;
  }

  hasAll(items: readonly { item: ItemId; qty: number }[], times = 1): boolean {
    return items.every((a) => this.count(a.item) >= a.qty * times);
  }

  /** How many free slots plus room in existing stacks there is for `item`. */
  roomFor(item: ItemId): number {
    const max = (ITEMS[item] as ItemDef).stack;
    let room = 0;
    for (const s of this.slots) room += s ? (s.item === item ? max - s.qty : 0) : max;
    return room;
  }

  hasTool(kind: ToolKind): boolean {
    return this.slots.some((s) => s && (ITEMS[s.item] as ItemDef).tool?.kind === kind);
  }

  /** Adds items, stacking first. Returns how many didn't fit. */
  add(item: ItemId, qty: number): number {
    const def: ItemDef = ITEMS[item];
    let left = qty;
    for (const s of this.slots) {
      if (left <= 0) break;
      if (s?.item === item && s.qty < def.stack) {
        const take = Math.min(def.stack - s.qty, left);
        s.qty += take;
        left -= take;
      }
    }
    // Tools and consumables land on the hotbar first, raw resources in the backpack first.
    const hotbarFirst = def.kind !== 'resource' && def.kind !== 'component';
    const order = [...this.slots.keys()];
    if (!hotbarFirst) order.push(...order.splice(0, this.hotbarSize));
    for (const i of order) {
      if (left <= 0) break;
      if (this.slots[i]) continue;
      const take = Math.min(def.stack, left);
      this.slots[i] = { item, qty: take };
      left -= take;
    }
    if (left !== qty) this.changed();
    return left;
  }

  /** Removes up to `qty` of an item (backpack first). Returns how many were removed. */
  remove(item: ItemId, qty: number): number {
    let left = qty;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s?.item !== item) continue;
      const take = Math.min(s.qty, left);
      s.qty -= take;
      left -= take;
      if (s.qty <= 0) this.slots[i] = null;
    }
    if (left !== qty) this.changed();
    return qty - left;
  }

  removeAt(i: number, qty = 1): void {
    const s = this.slots[i];
    if (!s) return;
    s.qty -= qty;
    if (s.qty <= 0) this.slots[i] = null;
    this.changed();
  }

  /** Drag and drop: merges matching stacks, otherwise swaps. */
  move(from: number, to: number): void {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (b && b.item === a.item) {
      const max = (ITEMS[a.item] as ItemDef).stack;
      const take = Math.min(max - b.qty, a.qty);
      b.qty += take;
      a.qty -= take;
      if (a.qty <= 0) this.slots[from] = null;
    } else {
      this.slots[to] = a;
      this.slots[from] = b;
    }
    this.changed();
  }

  /**
   * Moves slot `i` into another container: onto slot `j` (merging or swapping), or with no `j`
   * wherever it fits. Returns false if nothing moved.
   */
  transfer(i: number, to: Inventory, j?: number): boolean {
    const s = this.slots[i];
    if (!s) return false;
    if (j === undefined) {
      const left = to.add(s.item, s.qty);
      if (left === s.qty) return false;
      s.qty = left;
      if (left <= 0) this.slots[i] = null;
      this.changed();
      return true;
    }
    const t = to.slots[j];
    if (t && t.item === s.item) {
      const take = Math.min((ITEMS[s.item] as ItemDef).stack - t.qty, s.qty);
      if (take <= 0) return false;
      t.qty += take;
      s.qty -= take;
      if (s.qty <= 0) this.slots[i] = null;
    } else {
      to.slots[j] = s;
      this.slots[i] = t;
    }
    this.changed();
    to.changed();
    return true;
  }

  /** Shift-click: moves a stack between hotbar and backpack. */
  quickMove(i: number): void {
    const s = this.slots[i];
    if (!s) return;
    const toHotbar = i >= this.hotbarSize;
    const start = toHotbar ? 0 : this.hotbarSize;
    const end = toHotbar ? this.hotbarSize : this.size;
    const max = (ITEMS[s.item] as ItemDef).stack;
    for (let j = start; j < end && s.qty > 0; j++) {
      const t = this.slots[j];
      if (t?.item === s.item && t.qty < max) {
        const take = Math.min(max - t.qty, s.qty);
        t.qty += take;
        s.qty -= take;
      }
    }
    for (let j = start; j < end && s.qty > 0; j++) {
      if (!this.slots[j]) {
        this.slots[j] = { item: s.item, qty: s.qty };
        s.qty = 0;
      }
    }
    if (s.qty <= 0) this.slots[i] = null;
    this.changed();
  }

  clear(): void {
    this.slots.fill(null);
    this.changed();
  }
}
