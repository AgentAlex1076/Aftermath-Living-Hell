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
      { item: 'ammo', min: 4, max: 10, weight: 1.4 },
      { item: 'rustedBarrel', min: 1, max: 1, weight: 0.7 },
      { item: 'woodGrip', min: 1, max: 1, weight: 0.5 },
      { item: 'ironSight', min: 1, max: 1, weight: 0.4 },
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
      { item: 'rustedReceiver', min: 1, max: 1, weight: 1.1 },
      { item: 'rustedTrigger', min: 1, max: 1, weight: 1 },
      { item: 'stickMag', min: 1, max: 1, weight: 0.9 },
      { item: 'rustedMuzzle', min: 1, max: 1, weight: 0.7 },
      { item: 'pipeReceiver', min: 1, max: 1, weight: 0.45 },
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
      { item: 'ammo', min: 8, max: 18, weight: 2 },
      { item: 'militaryReceiver', min: 1, max: 1, weight: 0.7 },
      { item: 'longBarrel', min: 1, max: 1, weight: 0.8 },
      { item: 'hairTrigger', min: 1, max: 1, weight: 0.6 },
      { item: 'reflexSight', min: 1, max: 1, weight: 0.6 },
      { item: 'drumMag', min: 1, max: 1, weight: 0.45 },
      { item: 'compensator', min: 1, max: 1, weight: 0.5 },
      { item: 'protoBarrel', min: 1, max: 1, weight: 0.25 },
      { item: 'slugConverter', min: 1, max: 1, weight: 0.3 },
      { item: 'laserModule', min: 1, max: 1, weight: 0.22 },
    ],
  },
  salvage: {
    id: 'salvage', name: 'Salvage Cache', model: 'container.salvage', rolls: [0, 0],
    // Always spawned with fixed contents from `rollRaidCache`.
    table: [],
  },
} as const satisfies Record<string, ContainerDef>;

export type ContainerId = keyof typeof CONTAINERS;

const CACHE_TABLE: readonly (LootEntry & { from?: number })[] = [
  { item: 'ammo', min: 8, max: 16, weight: 5 },
  { item: 'scrap', min: 6, max: 14, weight: 4 },
  { item: 'gunpowder', min: 4, max: 10, weight: 3 },
  { item: 'cloth', min: 4, max: 10, weight: 2.5 },
  { item: 'cannedBeans', min: 1, max: 3, weight: 3 },
  { item: 'gasFilter', min: 1, max: 2, weight: 2.5 },
  { item: 'bandage', min: 1, max: 3, weight: 2 },
  { item: 'chemicals', min: 2, max: 6, weight: 2 },
  { item: 'electronics', min: 1, max: 4, weight: 2, from: 2 },
  { item: 'metalPlate', min: 2, max: 5, weight: 1.5, from: 2 },
  { item: 'medkit', min: 1, max: 1, weight: 0.8, from: 3 },
  { item: 'stickMag', min: 1, max: 1, weight: 0.6 },
  { item: 'rustedBarrel', min: 1, max: 1, weight: 0.6 },
  { item: 'pipeReceiver', min: 1, max: 1, weight: 0.5, from: 2 },
  { item: 'longBarrel', min: 1, max: 1, weight: 0.45, from: 3 },
  { item: 'hairTrigger', min: 1, max: 1, weight: 0.4, from: 3 },
  { item: 'reflexSight', min: 1, max: 1, weight: 0.4, from: 4 },
  { item: 'militaryReceiver', min: 1, max: 1, weight: 0.35, from: 4 },
  { item: 'compensator', min: 1, max: 1, weight: 0.35, from: 4 },
  { item: 'drumMag', min: 1, max: 1, weight: 0.25, from: 6 },
  { item: 'protoBarrel', min: 1, max: 1, weight: 0.15, from: 7 },
  { item: 'laserModule', min: 1, max: 1, weight: 0.12, from: 8 },
];

const BOSS_CACHE: readonly ItemAmount[] = [
  { item: 'ammo', qty: 20 },
  { item: 'electronics', qty: 4 },
  { item: 'medkit', qty: 1 },
];
const BOSS_PARTS: readonly ItemId[] = ['protoBarrel', 'slugConverter', 'laserModule', 'drumMag', 'militaryReceiver'];

/** What the horde leaves behind: more and better with the raid number, scaled by wave size. */
export function rollRaidCache(raid: number, scale: number, boss: boolean, rng: Rng): ItemAmount[] {
  const pool = CACHE_TABLE.filter((e) => (e.from ?? 1) <= raid);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  const rolls = Math.max(2, Math.round((3 + Math.min(raid, 12) * 0.5) * scale));
  const qtyMul = (1 + Math.min(raid, 20) * 0.06) * Math.max(0.5, scale);
  // Always some ammo, so a raid pays for the shots it cost.
  const out = new Map<ItemId, number>([['ammo', Math.max(4, Math.round((6 + raid * 2) * scale))]]);
  for (let i = 0; i < rolls; i++) {
    let r = rng.next() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r > 0) continue;
      const qty = e.max === 1 ? 1 : Math.max(1, Math.round(rng.int(e.min, e.max) * qtyMul));
      out.set(e.item, (out.get(e.item) ?? 0) + qty);
      break;
    }
  }
  if (boss) {
    for (const a of BOSS_CACHE) out.set(a.item, (out.get(a.item) ?? 0) + a.qty);
    const part = BOSS_PARTS[rng.int(0, BOSS_PARTS.length - 1)];
    out.set(part, (out.get(part) ?? 0) + 1);
  }
  return [...out].map(([item, qty]) => ({ item, qty }));
}

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
  { item: 'ironSight', qty: 1 },
  { item: 'compensator', qty: 1 },
  { item: 'ammo', qty: 36 },
];

/** Rolls loot; `danger` (1 at 100% threat, uncapped) adds extra rolls and bigger stacks deeper in the wasteland. */
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
