import type { ItemId } from './items';
import type { ItemAmount } from './loot';

export type TierId = 'wood' | 'scrap' | 'armored';

export interface TierDef {
  id: TierId;
  name: string;
  /** HP of a piece with hpScale 1. */
  hp: number;
  /** Cost of a piece with costScale 1 (a foundation). Upgrading to this tier costs the same. */
  cost: readonly ItemAmount[];
  color: string;
  hitWords: readonly string[];
}

export const TIERS: Record<TierId, TierDef> = {
  wood: { id: 'wood', name: 'Wood', hp: 300, cost: [{ item: 'wood', qty: 40 }], color: '#c99a62', hitWords: ['THUNK!', 'KNOK!'] },
  scrap: { id: 'scrap', name: 'Scrap', hp: 750, cost: [{ item: 'scrap', qty: 40 }], color: '#e08a4a', hitWords: ['KLANG!', 'TANK!'] },
  armored: {
    id: 'armored', name: 'Armored', hp: 1600, cost: [{ item: 'metalPlate', qty: 8 }, { item: 'scrap', qty: 12 }],
    color: '#b9c2c4', hitWords: ['DOONG!', 'KLANNG!'],
  },
};

export const TIER_ORDER: readonly TierId[] = ['wood', 'scrap', 'armored'];

export type PieceKind = 'foundation' | 'wall' | 'door' | 'deployable';
export type WallShape = 'full' | 'doorway' | 'window' | 'half';
export type BuildTab = 'structure' | 'traps' | 'power';
export type HopperKind = 'stash' | 'fuel' | 'ammo' | 'gun' | 'chemicals';

export interface PieceDef {
  id: string;
  name: string;
  kind: PieceKind;
  description: string;
  tab: BuildTab;
  /** Tiered pieces cost this fraction of their tier's cost. */
  costScale: number;
  /** Tiered pieces get this fraction of their tier's HP. */
  hpScale: number;
  shape?: WallShape;
  /** Untiered pieces (deployables) have a fixed cost and HP. */
  cost?: readonly ItemAmount[];
  hp?: number;
  /** Deployable footprint before rotation. */
  footprint?: { w: number; d: number; h: number };
  storageSlots?: number;
  hopper?: HopperKind;
  /** Enemies walk through this (spikes, mines). It is not a wall they punch. */
  walkThrough?: boolean;
  /** Waist-high cover. Crawlers slip through; walkers path around. */
  cover?: boolean;
  /** Needs a running generator in range to work. */
  needsPower?: boolean;
}

export const PIECES = {
  foundation: {
    id: 'foundation', name: 'Foundation', kind: 'foundation', tab: 'structure', costScale: 1, hpScale: 1.5,
    description: 'A 3 m floor slab. Walls stand on its edges.',
  },
  wall: {
    id: 'wall', name: 'Wall', kind: 'wall', tab: 'structure', shape: 'full', costScale: 0.6, hpScale: 1,
    description: 'Solid wall. Needs a foundation on at least one side.',
  },
  doorway: {
    id: 'doorway', name: 'Doorway', kind: 'wall', tab: 'structure', shape: 'doorway', costScale: 0.5, hpScale: 0.85,
    description: 'A wall with a way through. Hang a door in it.',
  },
  window: {
    id: 'window', name: 'Window Wall', kind: 'wall', tab: 'structure', shape: 'window', costScale: 0.5, hpScale: 0.85,
    description: 'A wall with a firing slot at chest height.',
  },
  halfWall: {
    id: 'halfWall', name: 'Half Wall', kind: 'wall', tab: 'structure', shape: 'half', costScale: 0.3, hpScale: 0.6,
    description: 'Waist-high cover. Stops feet, not eyes.',
  },
  door: {
    id: 'door', name: 'Door', kind: 'door', tab: 'structure', costScale: 0.4, hpScale: 0.7,
    description: 'Hangs in a doorway. Press E to open or close it.',
  },
  storageBox: {
    id: 'storageBox', name: 'Storage Box', kind: 'deployable', tab: 'structure', costScale: 1, hpScale: 1,
    cost: [{ item: 'wood', qty: 30 }, { item: 'scrap', qty: 10 }], hp: 250, footprint: { w: 1.15, d: 0.72, h: 0.8 },
    storageSlots: 18, hopper: 'stash',
    description: 'Stash your loot. A raid takes what you carry, not what you store.',
  },

  sandbags: {
    id: 'sandbags', name: 'Sandbags', kind: 'deployable', tab: 'traps', costScale: 1, hpScale: 1,
    cost: [{ item: 'cloth', qty: 16 }, { item: 'stone', qty: 8 }], hp: 420, footprint: { w: 1.7, d: 0.62, h: 0.95 },
    cover: true,
    description: 'Waist-high bags. Walkers go around. Crawlers slip through.',
  },
  spikeStrip: {
    id: 'spikeStrip', name: 'Spike Strip', kind: 'deployable', tab: 'traps', costScale: 1, hpScale: 1,
    cost: [{ item: 'scrap', qty: 18 }, { item: 'metalPlate', qty: 1 }], hp: 90, footprint: { w: 1.9, d: 0.7, h: 0.28 },
    walkThrough: true,
    description: 'Teeth in the dirt. Mutants walk over them and bleed.',
  },
  barbedWire: {
    id: 'barbedWire', name: 'Barbed Wire', kind: 'deployable', tab: 'traps', costScale: 1, hpScale: 1,
    cost: [{ item: 'scrap', qty: 14 }, { item: 'cloth', qty: 4 }], hp: 110, footprint: { w: 2.2, d: 0.38, h: 0.85 },
    walkThrough: true,
    description: 'A snarl of wire. Cuts and slows anything that pushes through.',
  },
  landmine: {
    id: 'landmine', name: 'Landmine', kind: 'deployable', tab: 'traps', costScale: 1, hpScale: 1,
    cost: [{ item: 'gunpowder', qty: 4 }, { item: 'scrap', qty: 8 }, { item: 'electronics', qty: 1 }], hp: 45,
    footprint: { w: 0.55, d: 0.55, h: 0.18 }, walkThrough: true,
    description: 'Arms after a beat. Steps on it, everything nearby comes apart. Including you.',
  },
  tripwire: {
    id: 'tripwire', name: 'Tripwire', kind: 'deployable', tab: 'traps', costScale: 1, hpScale: 1,
    cost: [{ item: 'gunpowder', qty: 3 }, { item: 'scrap', qty: 10 }, { item: 'electronics', qty: 1 }], hp: 55,
    footprint: { w: 2.6, d: 0.22, h: 0.7 }, walkThrough: true,
    description: 'Two stakes and a charge. Crossing the line sets it off.',
  },
  gasTrap: {
    id: 'gasTrap', name: 'Gas Trap', kind: 'deployable', tab: 'traps', costScale: 1, hpScale: 1,
    cost: [{ item: 'chemicals', qty: 6 }, { item: 'scrap', qty: 10 }], hp: 70,
    footprint: { w: 0.62, d: 0.62, h: 0.72 }, walkThrough: true,
    description: 'A sticky charge of lab runoff. Pops into a toxic cloud.',
  },
  shotgunTrap: {
    id: 'shotgunTrap', name: 'Shotgun Trap', kind: 'deployable', tab: 'traps', costScale: 1, hpScale: 1,
    cost: [{ item: 'scrap', qty: 22 }, { item: 'wood', qty: 10 }, { item: 'electronics', qty: 2 }], hp: 190,
    footprint: { w: 0.7, d: 0.85, h: 1.15 }, storageSlots: 1, hopper: 'ammo',
    description: 'A pipe aimed down a lane. Load scrap cartridges. Mechanical — no power.',
  },

  generator: {
    id: 'generator', name: 'Generator', kind: 'deployable', tab: 'power', costScale: 1, hpScale: 1,
    cost: [{ item: 'scrap', qty: 40 }, { item: 'electronics', qty: 6 }, { item: 'metalPlate', qty: 4 }], hp: 380,
    footprint: { w: 1.15, d: 0.85, h: 1.05 }, storageSlots: 1, hopper: 'fuel',
    description: 'Burns wood. Anything that needs power has to sit in its radius.',
  },
  autoTurret: {
    id: 'autoTurret', name: 'Auto-Turret', kind: 'deployable', tab: 'power', costScale: 1, hpScale: 1,
    cost: [{ item: 'scrap', qty: 50 }, { item: 'electronics', qty: 8 }, { item: 'metalPlate', qty: 6 }], hp: 420,
    footprint: { w: 0.95, d: 0.95, h: 1.35 }, storageSlots: 2, hopper: 'gun', needsPower: true,
    description: 'Mount a gun you built and feed it cartridges. Needs a generator.',
  },
  floodlight: {
    id: 'floodlight', name: 'Floodlight', kind: 'deployable', tab: 'power', costScale: 1, hpScale: 1,
    cost: [{ item: 'scrap', qty: 18 }, { item: 'electronics', qty: 4 }], hp: 160,
    footprint: { w: 0.42, d: 0.42, h: 2.15 }, needsPower: true,
    description: 'A harsh lamp on a pole. Needs power. Helps you see the ones that do not.',
  },
  flameVent: {
    id: 'flameVent', name: 'Flame Vent', kind: 'deployable', tab: 'power', costScale: 1, hpScale: 1,
    cost: [{ item: 'scrap', qty: 28 }, { item: 'electronics', qty: 3 }, { item: 'chemicals', qty: 4 }], hp: 210,
    footprint: { w: 0.85, d: 0.7, h: 0.55 }, storageSlots: 1, hopper: 'chemicals', needsPower: true,
    description: 'A nozzle that coughs burning chemicals down a cone. Needs power and fuel.',
  },

} as const satisfies Record<string, PieceDef>;

export type PieceId = keyof typeof PIECES;

export const BUILD_TABS: readonly { id: BuildTab; name: string; pieces: readonly PieceId[] }[] = [
  { id: 'structure', name: 'Structure', pieces: ['foundation', 'wall', 'doorway', 'window', 'halfWall', 'door', 'storageBox'] },
  { id: 'traps', name: 'Traps', pieces: ['sandbags', 'spikeStrip', 'barbedWire', 'landmine', 'tripwire', 'gasTrap', 'shotgunTrap'] },
  { id: 'power', name: 'Power', pieces: ['generator', 'autoTurret', 'floodlight', 'flameVent'] },
];

/** Legacy alias: the structure row. Prefer BUILD_TABS. */
export const BUILD_BAR: readonly PieceId[] = BUILD_TABS[0].pieces;

export function tabOf(id: BuildTab): (typeof BUILD_TABS)[number] {
  return BUILD_TABS.find((t) => t.id === id) ?? BUILD_TABS[0];
}

export function allPieceIds(): PieceId[] {
  return Object.keys(PIECES) as PieceId[];
}

export function hopperHint(kind: HopperKind | undefined): { title: string; hint: string } {
  switch (kind) {
    case 'fuel':
      return { title: 'GENERATOR', hint: 'WOOD ONLY. BURNS WHILE SOMETHING IN RANGE NEEDS POWER.' };
    case 'ammo':
      return { title: 'SHOTGUN TRAP', hint: 'LOAD SCRAP CARTRIDGES. FIRES DOWN THE LANE IT FACES.' };
    case 'gun':
      return { title: 'AUTO-TURRET', hint: 'DROP A GUN YOU BUILT AND CARTRIDGES. NEEDS POWER.' };
    case 'chemicals':
      return { title: 'FLAME VENT', hint: 'LOAD CHEMICALS. NEEDS POWER. BURNS A CONE IN FRONT.' };
    default:
      return { title: 'STORAGE BOX', hint: 'STASHED LOOT SURVIVES A RAID PENALTY. YOUR BACKPACK DOES NOT.' };
  }
}

export function hopperVerb(kind: HopperKind | undefined): { verb: string; label: string } {
  switch (kind) {
    case 'fuel':
      return { verb: 'Fuel', label: 'Generator' };
    case 'ammo':
      return { verb: 'Load', label: 'Shotgun Trap' };
    case 'gun':
      return { verb: 'Load', label: 'Auto-Turret' };
    case 'chemicals':
      return { verb: 'Fuel', label: 'Flame Vent' };
    default:
      return { verb: 'Open', label: 'Storage Box' };
  }
}

export function hopperAccepts(kind: HopperKind | undefined, item: ItemId, isGun: boolean): boolean {
  switch (kind) {
    case 'fuel':
      return item === 'wood';
    case 'ammo':
      return item === 'ammo';
    case 'gun':
      return item === 'ammo' || isGun;
    case 'chemicals':
      return item === 'chemicals';
    default:
      return true;
  }
}

export function pieceCost(def: PieceDef, tier: TierId): ItemAmount[] {
  if (def.cost) return def.cost.map((a) => ({ ...a }));
  return TIERS[tier].cost.map((a) => ({ item: a.item, qty: Math.max(1, Math.ceil(a.qty * def.costScale)) }));
}

export function pieceMaxHp(def: PieceDef, tier: TierId): number {
  return def.hp ?? Math.round(TIERS[tier].hp * def.hpScale);
}

export function pieceModel(def: PieceDef, tier: TierId): string {
  return def.kind === 'deployable' ? `build.${def.id}` : `build.${def.id}.${tier}`;
}

export function nextTier(tier: TierId): TierId | null {
  return TIER_ORDER[TIER_ORDER.indexOf(tier) + 1] ?? null;
}
