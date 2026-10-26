export type ItemKind = 'resource' | 'component' | 'tool' | 'consumable' | 'food' | 'gunPart' | 'gun' | 'ammo';
export type ToolKind = 'axe' | 'pickaxe' | 'crowbar' | 'hammer';

export interface ToolStats {
  kind: ToolKind;
  tier: number;
  /** Damage dealt to a resource node of the matching type per swing. */
  power: number;
  swingTime: number;
}

/** Timed food boost. Eating another food replaces the current one. */
export interface FoodBuffDef {
  /** Seconds the boost lasts. */
  duration: number;
  /** Short chip title, e.g. BEANS. */
  label: string;
  /** Effect lines shown on the HUD chip. */
  effects: readonly string[];
  /** Move speed multiplier. */
  moveSpeed?: number;
  /** Stamina regen multiplier. */
  staminaRegen?: number;
  /** Max stamina multiplier (bar extends). */
  staminaMax?: number;
  /** Melee / tool impact multiplier. */
  melee?: number;
  /** Max health multiplier (bar extends). */
  maxHealth?: number;
  /** Health restored per second while the buff is active. */
  healPerSecond?: number;
  /** 0..1 fraction of gas filter drain ignored. */
  filterResist?: number;
  /** Reload speed multiplier (higher = faster). */
  reload?: number;
  /** Aim stability multiplier (higher = tighter spread). */
  aim?: number;
}

export interface ConsumableStats {
  filter?: number;
  heal?: number;
  /** Timed combat / survival boost from food. */
  buff?: FoodBuffDef;
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
    description: 'Dented, but sealed. A quick 22s kick of speed and stamina.',
    consumable: {
      heal: 5,
      message: 'Cold beans. Legs feel lighter already.',
      buff: {
        duration: 22,
        label: 'BEANS',
        effects: ['SPEED +12%', 'STAMINA REGEN +30%'],
        moveSpeed: 1.12,
        staminaRegen: 1.3,
      },
    },
  },
  mutantMeat: {
    id: 'mutantMeat', name: 'Raw Mutant Meat', kind: 'food', stack: 10, model: 'item.mutantMeat', color: '#e57a7a',
    description: 'Raw is a bad idea — unless you want a short, nasty rage boost. Cook it in the Oven.',
    consumable: {
      heal: -12,
      message: 'It burns going down. Everything else burns with it.',
      buff: {
        duration: 20,
        label: 'RAW RAGE',
        effects: ['MELEE +45%', 'SPEED +18%', 'STAMINA MAX +20%'],
        melee: 1.45,
        moveSpeed: 1.18,
        staminaMax: 1.2,
      },
    },
  },
  cookedMeat: {
    id: 'cookedMeat', name: 'Cooked Mutant Meat', kind: 'food', stack: 10, model: 'item.cookedMeat', color: '#d9893f',
    description: 'Charred until it stopped twitching. Thirty seconds of tough, focused fighting.',
    consumable: {
      heal: 10,
      message: 'Tastes like smoke and regret. You feel solid.',
      buff: {
        duration: 30,
        label: 'COOKED',
        effects: ['MAX HP +25%', 'REGEN', 'FILTER +35%', 'RELOAD +20%', 'AIM +25%'],
        maxHealth: 1.25,
        healPerSecond: 2,
        filterResist: 0.35,
        reload: 1.2,
        aim: 1.25,
      },
    },
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
    description: 'Chops dead trees fast. Five hits will also scrap your own builds for partial salvage.',
    tool: { kind: 'axe', tier: 1, power: 22, swingTime: 0.6 },
  },
  rustyPickaxe: {
    id: 'rustyPickaxe', name: 'Rusty Pickaxe', kind: 'tool', stack: 1, model: 'item.rustyPickaxe', color: '#c4c1b8',
    description: 'Breaks rock, rubble and scrap. Five hits scraps your own builds for partial salvage.',
    tool: { kind: 'pickaxe', tier: 1, power: 22, swingTime: 0.7 },
  },
  crowbar: {
    id: 'crowbar', name: 'Crowbar', kind: 'tool', stack: 1, model: 'item.crowbar', color: '#e0302a',
    description: 'Pries open locked lab lockers. Doubles as a terrible pickaxe.',
    tool: { kind: 'crowbar', tier: 1, power: 12, swingTime: 0.5 },
  },
  hammer: {
    id: 'hammer', name: 'Claw Hammer', kind: 'tool', stack: 1, model: 'item.hammer', color: '#f2b705',
    description: 'Swing at damaged pieces to repair them. At full HP, five hits scraps them for half the materials. R upgrades. Axe and pickaxe also scrap builds.',
    tool: { kind: 'hammer', tier: 1, power: 16, swingTime: 0.55 },
  },
  salvagedAxe: {
    id: 'salvagedAxe', name: 'Salvaged Axe', kind: 'tool', stack: 1, model: 'item.salvagedAxe', color: '#b9c2c4',
    description: 'A real blade, riveted from oven-pressed plate. Fells trees fast — and five hits will scrap your own walls for partial salvage.',
    tool: { kind: 'axe', tier: 2, power: 40, swingTime: 0.62 },
  },
  salvagedPickaxe: {
    id: 'salvagedPickaxe', name: 'Salvaged Pickaxe', kind: 'tool', stack: 1, model: 'item.salvagedPickaxe', color: '#b9c2c4',
    description: 'Heavy plate head on a pipe handle. Chews through rock, wrecks, and your own builds (five hits to scrap).',
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
    id: 'craftedGun', name: 'Stock Gun', kind: 'gun', stack: 1, model: 'item.craftedGun', color: '#f2b705',
    description: 'A working gun. Drag a gun part onto it in your backpack to swap or mount a mod.',
  },
} as const satisfies Record<string, ItemDef>;

export type ItemId = keyof typeof ITEMS;

export function itemDef(id: ItemId): ItemDef {
  return ITEMS[id];
}

export const ALL_ITEM_IDS = Object.keys(ITEMS) as ItemId[];
