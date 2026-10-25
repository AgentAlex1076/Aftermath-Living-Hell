export type ItemKind = 'resource' | 'component' | 'tool' | 'consumable' | 'food';
export type ToolKind = 'axe' | 'pickaxe' | 'crowbar' | 'hammer';

export interface ToolStats {
  kind: ToolKind;
  tier: number;
  /** Damage dealt to a resource node of the matching type per swing. */
  power: number;
  swingTime: number;
}

export interface ConsumableStats {
  filter?: number;
  heal?: number;
  hunger?: number;
  /** Shown when used. */
  message: string;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  stack: number;
  /** Model id in the ModelRegistry; also used to render the inventory icon. */
  model: string;
  description: string;
  /** Accent color for floating pickup text and UI highlights. */
  color: string;
  tool?: ToolStats;
  consumable?: ConsumableStats;
}

const RES = 200;

export const ITEMS = {
  wood: { id: 'wood', name: 'Wood', kind: 'resource', stack: RES, model: 'item.wood', color: '#c99a62', description: 'Dead, dry timber. Burns well and builds walls.' },
  stone: { id: 'stone', name: 'Stone', kind: 'resource', stack: RES, model: 'item.stone', color: '#c4c1b8', description: 'Chunks of rock and concrete.' },
  scrap: { id: 'scrap', name: 'Scrap Metal', kind: 'resource', stack: RES, model: 'item.scrap', color: '#e08a4a', description: 'Rusted sheet metal and bolts. The backbone of every build.' },
  cloth: { id: 'cloth', name: 'Cloth', kind: 'resource', stack: RES, model: 'item.cloth', color: '#d8cfb4', description: 'Torn fabric. Bandages, filters, padding.' },
  chemicals: { id: 'chemicals', name: 'Chemicals', kind: 'resource', stack: 100, model: 'item.chemicals', color: '#8cff3a', description: 'Unstable lab runoff. Handle with gloves. You are wearing gloves.' },
  electronics: { id: 'electronics', name: 'Electronics', kind: 'resource', stack: 100, model: 'item.electronics', color: '#6fd3ff', description: 'Circuit boards and wiring pulled from wrecks.' },
  gunpowder: { id: 'gunpowder', name: 'Black Powder', kind: 'resource', stack: 100, model: 'item.gunpowder', color: '#9b9b9b', description: 'Volatile powder. Ammo and explosives.' },

  charcoal: { id: 'charcoal', name: 'Charcoal', kind: 'component', stack: RES, model: 'item.charcoal', color: '#8a8a8a', description: 'Left over when the Oven burns wood. Packed into gas filters.' },
  metalPlate: { id: 'metalPlate', name: 'Metal Plate', kind: 'component', stack: 100, model: 'item.metalPlate', color: '#b9c2c4', description: 'Scrap melted down and hammered flat in the Oven. Better tools start here.' },

  cannedBeans: {
    id: 'cannedBeans', name: 'Canned Beans', kind: 'food', stack: 10, model: 'item.cannedBeans', color: '#ffb35a',
    description: 'Dented, but sealed. Probably fine.',
    consumable: { hunger: 25, heal: 5, message: 'Cold beans. Still the best thing you have eaten this week.' },
  },
  mutantMeat: {
    id: 'mutantMeat', name: 'Raw Mutant Meat', kind: 'food', stack: 10, model: 'item.mutantMeat', color: '#e57a7a',
    description: 'Do not eat this raw. Cook it in the Oven.',
    consumable: { hunger: 10, heal: -12, message: 'That was a mistake.' },
  },
  cookedMeat: {
    id: 'cookedMeat', name: 'Cooked Mutant Meat', kind: 'food', stack: 10, model: 'item.cookedMeat', color: '#d9893f',
    description: 'Charred until it stopped twitching. Filling.',
    consumable: { hunger: 40, heal: 10, message: 'Tastes like smoke and regret. Fills you up, though.' },
  },
  medkit: {
    id: 'medkit', name: 'Field Medkit', kind: 'consumable', stack: 5, model: 'item.medkit', color: '#ff6a5a',
    description: 'Bandages, antiseptic and something from the lab. Restores 60 health.',
    consumable: { heal: 60, message: 'Stitched, sprayed and taped. Good as new. Almost.' },
  },
  gasFilter: {
    id: 'gasFilter', name: 'Gas Filter', kind: 'consumable', stack: 5, model: 'item.gasFilter', color: '#8cff3a',
    description: 'Screw-in mask filter. Fully restores filter.',
    consumable: { filter: 100, message: 'Fresh filter. Breathe easy.' },
  },
  bandage: {
    id: 'bandage', name: 'Bandage', kind: 'consumable', stack: 10, model: 'item.bandage', color: '#f1e7cf',
    description: 'Restores 30 health.',
    consumable: { heal: 30, message: 'Patched up.' },
  },

  rustyHatchet: {
    id: 'rustyHatchet', name: 'Rusty Hatchet', kind: 'tool', stack: 1, model: 'item.rustyHatchet', color: '#c99a62',
    description: 'Chops dead trees fast. Bad at everything else.',
    tool: { kind: 'axe', tier: 1, power: 22, swingTime: 0.6 },
  },
  rustyPickaxe: {
    id: 'rustyPickaxe', name: 'Rusty Pickaxe', kind: 'tool', stack: 1, model: 'item.rustyPickaxe', color: '#c4c1b8',
    description: 'Breaks rock, rubble and scrap.',
    tool: { kind: 'pickaxe', tier: 1, power: 22, swingTime: 0.7 },
  },
  crowbar: {
    id: 'crowbar', name: 'Crowbar', kind: 'tool', stack: 1, model: 'item.crowbar', color: '#e0302a',
    description: 'Pries open locked lab lockers. Doubles as a terrible pickaxe.',
    tool: { kind: 'crowbar', tier: 1, power: 12, swingTime: 0.5 },
  },
  hammer: {
    id: 'hammer', name: 'Claw Hammer', kind: 'tool', stack: 1, model: 'item.hammer', color: '#f2b705',
    description: 'Swing at your own walls to repair them. R upgrades a piece, hold X to tear it down. Useless on anything else.',
    tool: { kind: 'hammer', tier: 1, power: 16, swingTime: 0.55 },
  },
  salvagedAxe: {
    id: 'salvagedAxe', name: 'Salvaged Axe', kind: 'tool', stack: 1, model: 'item.salvagedAxe', color: '#b9c2c4',
    description: 'A real blade, riveted from oven-pressed plate. Fells trees in half the swings.',
    tool: { kind: 'axe', tier: 2, power: 40, swingTime: 0.62 },
  },
  salvagedPickaxe: {
    id: 'salvagedPickaxe', name: 'Salvaged Pickaxe', kind: 'tool', stack: 1, model: 'item.salvagedPickaxe', color: '#b9c2c4',
    description: 'Heavy plate head on a pipe handle. Chews through rock and wrecks.',
    tool: { kind: 'pickaxe', tier: 2, power: 40, swingTime: 0.72 },
  },
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export function itemDef(id: ItemId): ItemDef {
  return ITEMS[id];
}

export const ALL_ITEM_IDS = Object.keys(ITEMS) as ItemId[];
