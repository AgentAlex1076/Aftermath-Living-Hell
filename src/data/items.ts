export type ItemKind = 'resource' | 'component' | 'tool' | 'consumable' | 'food' | 'gunPart' | 'gun' | 'ammo';
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

  rustedReceiver: { id: 'rustedReceiver', name: 'Rusted Receiver', kind: 'gunPart', stack: 8, model: 'part.rustedReceiver', color: '#c47a3a', description: 'A pitted action pulled from a wreck. Everything else bolts onto this.' },
  pipeReceiver: { id: 'pipeReceiver', name: 'Pipe Receiver', kind: 'gunPart', stack: 8, model: 'part.pipeReceiver', color: '#c4c1b8', description: 'Scrap pipe and a salvaged bolt. Ugly. Fires.' },
  militaryReceiver: { id: 'militaryReceiver', name: 'Military Receiver', kind: 'gunPart', stack: 8, model: 'part.militaryReceiver', color: '#6fd3ff', description: 'Stamped steel from a real armoury. Tight tolerances.' },
  rustedBarrel: { id: 'rustedBarrel', name: 'Rusted Barrel', kind: 'gunPart', stack: 8, model: 'part.rustedBarrel', color: '#c47a3a', description: 'A length of pipe. Do not look down it.' },
  longBarrel: { id: 'longBarrel', name: 'Long Barrel', kind: 'gunPart', stack: 8, model: 'part.longBarrel', color: '#c4c1b8', description: 'Reach and velocity. Slow to swing onto a target.' },
  shortBarrel: { id: 'shortBarrel', name: 'Stub Barrel', kind: 'gunPart', stack: 8, model: 'part.shortBarrel', color: '#c4c1b8', description: 'Close-in work. Loud, wide, fast to point.' },
  protoBarrel: { id: 'protoBarrel', name: 'Lab Barrel', kind: 'gunPart', stack: 8, model: 'part.protoBarrel', color: '#d4a0ff', description: 'Lined with something that still ticks. Hot and accurate.' },
  woodGrip: { id: 'woodGrip', name: 'Wood Grip', kind: 'gunPart', stack: 8, model: 'part.woodGrip', color: '#c47a3a', description: 'A carved handle. Put it where your hand wants to be.' },
  tapedGrip: { id: 'tapedGrip', name: 'Taped Grip', kind: 'gunPart', stack: 8, model: 'part.tapedGrip', color: '#c4c1b8', description: 'Cloth tape over scrap. Holds when your gloves are slick.' },
  woodHandle: { id: 'woodHandle', name: 'Wood Handle', kind: 'gunPart', stack: 8, model: 'part.woodHandle', color: '#c47a3a', description: 'A second handhold. Balance, or just something to hang onto.' },
  polymerHandle: { id: 'polymerHandle', name: 'Polymer Handle', kind: 'gunPart', stack: 8, model: 'part.polymerHandle', color: '#6fd3ff', description: 'Light, stiff, does not splinter.' },
  woodStock: { id: 'woodStock', name: 'Wood Stock', kind: 'gunPart', stack: 8, model: 'part.woodStock', color: '#c47a3a', description: 'Shoulder it. Recoil goes somewhere that is not your teeth.' },
  foldingStock: { id: 'foldingStock', name: 'Folding Stock', kind: 'gunPart', stack: 8, model: 'part.foldingStock', color: '#6fd3ff', description: 'Clips tight. Less weight, less help.' },
  rustedTrigger: { id: 'rustedTrigger', name: 'Rusted Trigger', kind: 'gunPart', stack: 8, model: 'part.rustedTrigger', color: '#c47a3a', description: 'One click, one bang. Add more and it gets uglier and faster.' },
  hairTrigger: { id: 'hairTrigger', name: 'Hair Trigger', kind: 'gunPart', stack: 8, model: 'part.hairTrigger', color: '#6fd3ff', description: 'A breath sets it off. Stack them and the gun runs away from you.' },
  stickMag: { id: 'stickMag', name: 'Stick Mag', kind: 'gunPart', stack: 8, model: 'part.stickMag', color: '#c47a3a', description: 'Bent tin and a spring that still remembers its job.' },
  drumMag: { id: 'drumMag', name: 'Drum Mag', kind: 'gunPart', stack: 8, model: 'part.drumMag', color: '#6fd3ff', description: 'A lot of rounds. A lot of waiting when it is empty.' },
  ironSight: { id: 'ironSight', name: 'Iron Sight', kind: 'gunPart', stack: 8, model: 'part.ironSight', color: '#c47a3a', description: 'A notch and a post. Only works sitting on the receiver.' },
  reflexSight: { id: 'reflexSight', name: 'Reflex Sight', kind: 'gunPart', stack: 8, model: 'part.reflexSight', color: '#6fd3ff', description: 'A glowing pip. Still useless if you bolt it to the barrel.' },
  rustedMuzzle: { id: 'rustedMuzzle', name: 'Rusted Brake', kind: 'gunPart', stack: 8, model: 'part.rustedMuzzle', color: '#c47a3a', description: 'A cap with holes punched in it. Softens the kick a little.' },
  compensator: { id: 'compensator', name: 'Compensator', kind: 'gunPart', stack: 8, model: 'part.compensator', color: '#6fd3ff', description: 'Vents the blast up. The gun stays on the thing you pointed at.' },
  rustedRail: { id: 'rustedRail', name: 'Rusted Rail', kind: 'gunPart', stack: 8, model: 'part.rustedRail', color: '#c47a3a', description: 'A bar under the barrel. Hang a hand on it.' },
  laserModule: { id: 'laserModule', name: 'Laser Module', kind: 'gunPart', stack: 8, model: 'part.laserModule', color: '#d4a0ff', description: 'A sickly green dot. Helps until the filter fogs.' },
  rustedConverter: { id: 'rustedConverter', name: 'Powder Converter', kind: 'gunPart', stack: 8, model: 'part.rustedConverter', color: '#c47a3a', description: 'Feeds scrap cartridges. Fine until it is not.' },
  slugConverter: { id: 'slugConverter', name: 'Slug Converter', kind: 'gunPart', stack: 8, model: 'part.slugConverter', color: '#d4a0ff', description: 'Crams two rounds into one ugly slug. Hits like a thrown brick.' },

  ammo: {
    id: 'ammo', name: 'Scrap Cartridges', kind: 'ammo', stack: 80, model: 'item.ammo', color: '#d4b46a',
    description: 'Hand-rolled brass and black powder. Feeds any gun you bolt together.',
  },
  craftedGun: {
    id: 'craftedGun', name: 'Assembled Gun', kind: 'gun', stack: 1, model: 'item.craftedGun', color: '#f2b705',
    description: 'A gun you built. The parts stay where you put them.',
  },
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export function itemDef(id: ItemId): ItemDef {
  return ITEMS[id];
}

export const ALL_ITEM_IDS = Object.keys(ITEMS) as ItemId[];
