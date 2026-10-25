import type { ItemId, ToolKind } from './items';
import type { Rng } from '../core/random';

export interface LootEntry {
  item: ItemId;
  min: number;
  max: number;
  weight: number;
}

export interface ContainerDef {
  id: string;
  name: string;
  model: string;
  /** Number of loot rolls before the danger bonus. */
  rolls: readonly [number, number];
  table: readonly LootEntry[];
  /** Tool needed to open it. */
  requires?: ToolKind;
}

export interface ItemAmount {
  item: ItemId;
  qty: number;
}

export const CONTAINERS = {
  crate: {
    id: 'crate', name: 'Wooden Crate', model: 'prop.crate', rolls: [1, 3],
    table: [
      { item: 'wood', min: 4, max: 12, weight: 4 },
      { item: 'cloth', min: 2, max: 6, weight: 4 },
      { item: 'scrap', min: 3, max: 8, weight: 3 },
      { item: 'cannedBeans', min: 1, max: 2, weight: 3.5 },
      { item: 'bandage', min: 1, max: 1, weight: 2 },
      { item: 'charcoal', min: 2, max: 5, weight: 1 },
      { item: 'gunpowder', min: 2, max: 5, weight: 1 },
      { item: 'gasFilter', min: 1, max: 1, weight: 1.2 },
    ],
  },
  cabinet: {
    id: 'cabinet', name: 'Medicine Cabinet', model: 'container.cabinet', rolls: [1, 2],
    table: [
      { item: 'bandage', min: 1, max: 2, weight: 4 },
      { item: 'gasFilter', min: 1, max: 1, weight: 3 },
      { item: 'chemicals', min: 1, max: 4, weight: 2 },
      { item: 'cloth', min: 2, max: 4, weight: 2 },
    ],
  },
  toolbox: {
    id: 'toolbox', name: 'Toolbox', model: 'container.toolbox', rolls: [1, 2],
    table: [
      { item: 'scrap', min: 4, max: 10, weight: 4 },
      { item: 'electronics', min: 1, max: 3, weight: 3 },
      { item: 'gunpowder', min: 2, max: 6, weight: 2 },
      { item: 'crowbar', min: 1, max: 1, weight: 1.2 },
      { item: 'metalPlate', min: 1, max: 3, weight: 1.5 },
      { item: 'rustyPickaxe', min: 1, max: 1, weight: 0.6 },
      { item: 'rustyHatchet', min: 1, max: 1, weight: 0.6 },
    ],
  },
  labLocker: {
    id: 'labLocker', name: 'Lab Locker', model: 'container.labLocker', rolls: [2, 4], requires: 'crowbar',
    table: [
      { item: 'chemicals', min: 4, max: 10, weight: 4 },
      { item: 'electronics', min: 2, max: 6, weight: 3 },
      { item: 'gasFilter', min: 1, max: 2, weight: 3 },
      { item: 'gunpowder', min: 4, max: 10, weight: 2 },
      { item: 'bandage', min: 1, max: 3, weight: 2 },
      { item: 'medkit', min: 1, max: 1, weight: 1 },
    ],
  },
} as const satisfies Record<string, ContainerDef>;

export type ContainerId = keyof typeof CONTAINERS;

/** What the starting crate in the hut always holds (temporary until crafting arrives). */
export const STARTER_SUPPLIES: readonly ItemAmount[] = [
  { item: 'rustyHatchet', qty: 1 },
  { item: 'rustyPickaxe', qty: 1 },
  { item: 'gasFilter', qty: 2 },
  { item: 'bandage', qty: 1 },
  { item: 'cannedBeans', qty: 2 },
  { item: 'mutantMeat', qty: 2 },
  { item: 'wood', qty: 12 },
  { item: 'cloth', qty: 8 },
];

/** Rolls loot; `danger` (0..1) adds extra rolls and bigger stacks deeper in the wasteland. */
export function rollLoot(def: ContainerDef, rng: Rng, danger: number): ItemAmount[] {
  const rolls = rng.int(def.rolls[0], def.rolls[1]) + (rng.chance(danger) ? 1 : 0);
  const totalWeight = def.table.reduce((s, e) => s + e.weight, 0);
  const out = new Map<ItemId, number>();
  for (let i = 0; i < rolls; i++) {
    let r = rng.next() * totalWeight;
    for (const e of def.table) {
      r -= e.weight;
      if (r <= 0) {
        const qty = Math.round(rng.int(e.min, e.max) * (1 + danger * 0.6));
        out.set(e.item, (out.get(e.item) ?? 0) + Math.max(1, qty));
        break;
      }
    }
  }
  return [...out].map(([item, qty]) => ({ item, qty }));
}
