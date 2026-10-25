import type { ItemId } from './items';
import type { ItemAmount } from './loot';

/** Where a recipe can be made. `hand` works anywhere; `workbench` needs the Crafting Table nearby. */
export type CraftStation = 'hand' | 'workbench';
export type RecipeCategory = 'tools' | 'survival' | 'parts';

export interface Recipe {
  id: string;
  output: ItemId;
  qty: number;
  inputs: readonly ItemAmount[];
  /** Seconds per craft. */
  time: number;
  station: CraftStation;
  category: RecipeCategory;
}

export const RECIPES: readonly Recipe[] = [
  { id: 'bandage', output: 'bandage', qty: 1, inputs: [{ item: 'cloth', qty: 4 }], time: 3, station: 'hand', category: 'survival' },
  {
    id: 'gasFilter', output: 'gasFilter', qty: 1, time: 6, station: 'workbench', category: 'survival',
    inputs: [{ item: 'charcoal', qty: 3 }, { item: 'cloth', qty: 4 }, { item: 'scrap', qty: 2 }],
  },
  {
    id: 'medkit', output: 'medkit', qty: 1, time: 8, station: 'workbench', category: 'survival',
    inputs: [{ item: 'bandage', qty: 2 }, { item: 'chemicals', qty: 3 }],
  },
  {
    id: 'rustyHatchet', output: 'rustyHatchet', qty: 1, time: 8, station: 'workbench', category: 'tools',
    inputs: [{ item: 'wood', qty: 20 }, { item: 'scrap', qty: 15 }],
  },
  {
    id: 'rustyPickaxe', output: 'rustyPickaxe', qty: 1, time: 8, station: 'workbench', category: 'tools',
    inputs: [{ item: 'wood', qty: 20 }, { item: 'scrap', qty: 20 }],
  },
  {
    id: 'hammer', output: 'hammer', qty: 1, time: 6, station: 'workbench', category: 'tools',
    inputs: [{ item: 'wood', qty: 15 }, { item: 'scrap', qty: 8 }],
  },
  { id: 'crowbar', output: 'crowbar', qty: 1, time: 8, station: 'workbench', category: 'tools', inputs: [{ item: 'scrap', qty: 35 }] },
  {
    id: 'salvagedAxe', output: 'salvagedAxe', qty: 1, time: 14, station: 'workbench', category: 'tools',
    inputs: [{ item: 'metalPlate', qty: 4 }, { item: 'wood', qty: 15 }, { item: 'cloth', qty: 3 }],
  },
  {
    id: 'salvagedPickaxe', output: 'salvagedPickaxe', qty: 1, time: 14, station: 'workbench', category: 'tools',
    inputs: [{ item: 'metalPlate', qty: 5 }, { item: 'wood', qty: 15 }, { item: 'cloth', qty: 3 }],
  },
  {
    id: 'ammo', output: 'ammo', qty: 8, time: 3, station: 'hand', category: 'parts',
    inputs: [{ item: 'gunpowder', qty: 2 }, { item: 'scrap', qty: 1 }],
  },
  {
    id: 'rustedReceiver', output: 'rustedReceiver', qty: 1, time: 10, station: 'workbench', category: 'parts',
    inputs: [{ item: 'scrap', qty: 20 }, { item: 'metalPlate', qty: 1 }],
  },
  {
    id: 'rustedBarrel', output: 'rustedBarrel', qty: 1, time: 8, station: 'workbench', category: 'parts',
    inputs: [{ item: 'scrap', qty: 12 }],
  },
  {
    id: 'woodGrip', output: 'woodGrip', qty: 1, time: 5, station: 'workbench', category: 'parts',
    inputs: [{ item: 'wood', qty: 8 }, { item: 'cloth', qty: 2 }],
  },
  {
    id: 'woodHandle', output: 'woodHandle', qty: 1, time: 4, station: 'workbench', category: 'parts',
    inputs: [{ item: 'wood', qty: 6 }],
  },
  {
    id: 'woodStock', output: 'woodStock', qty: 1, time: 7, station: 'workbench', category: 'parts',
    inputs: [{ item: 'wood', qty: 14 }, { item: 'scrap', qty: 4 }],
  },
  {
    id: 'rustedTrigger', output: 'rustedTrigger', qty: 1, time: 5, station: 'workbench', category: 'parts',
    inputs: [{ item: 'scrap', qty: 6 }, { item: 'electronics', qty: 1 }],
  },
  {
    id: 'stickMag', output: 'stickMag', qty: 1, time: 6, station: 'workbench', category: 'parts',
    inputs: [{ item: 'scrap', qty: 10 }, { item: 'metalPlate', qty: 1 }],
  },
  {
    id: 'ironSight', output: 'ironSight', qty: 1, time: 4, station: 'workbench', category: 'parts',
    inputs: [{ item: 'scrap', qty: 5 }],
  },
  {
    id: 'rustedMuzzle', output: 'rustedMuzzle', qty: 1, time: 5, station: 'workbench', category: 'parts',
    inputs: [{ item: 'scrap', qty: 8 }],
  },
  {
    id: 'rustedRail', output: 'rustedRail', qty: 1, time: 6, station: 'workbench', category: 'parts',
    inputs: [{ item: 'scrap', qty: 10 }],
  },
  {
    id: 'rustedConverter', output: 'rustedConverter', qty: 1, time: 8, station: 'workbench', category: 'parts',
    inputs: [{ item: 'electronics', qty: 2 }, { item: 'scrap', qty: 6 }],
  },
];

/** Things the Oven makes. Wood is the fuel; every couple of logs burned leaves charcoal behind. */
export interface OvenRecipe {
  id: string;
  input: ItemAmount;
  output: ItemAmount;
  time: number;
}

export const OVEN_RECIPES: readonly OvenRecipe[] = [
  { id: 'cookMeat', input: { item: 'mutantMeat', qty: 1 }, output: { item: 'cookedMeat', qty: 1 }, time: 6 },
  { id: 'smeltPlate', input: { item: 'scrap', qty: 4 }, output: { item: 'metalPlate', qty: 1 }, time: 10 },
];

export const OVEN_FUEL = {
  item: 'wood' as ItemId,
  /** Seconds of burning per unit of fuel. */
  burnTime: 4,
  /** Charcoal produced per fuel unit burned. */
  charcoalPerFuel: 0.5,
  maxFuel: 200,
};
