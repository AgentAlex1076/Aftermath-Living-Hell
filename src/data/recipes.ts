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
