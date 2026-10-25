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

export interface PieceDef {
  id: string;
  name: string;
  kind: PieceKind;
  description: string;
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
}

export const PIECES = {
  foundation: {
    id: 'foundation', name: 'Foundation', kind: 'foundation', costScale: 1, hpScale: 1.5,
    description: 'A 3 m floor slab. Walls stand on its edges.',
  },
  wall: {
    id: 'wall', name: 'Wall', kind: 'wall', shape: 'full', costScale: 0.6, hpScale: 1,
    description: 'Solid wall. Needs a foundation on at least one side.',
  },
  doorway: {
    id: 'doorway', name: 'Doorway', kind: 'wall', shape: 'doorway', costScale: 0.5, hpScale: 0.85,
    description: 'A wall with a way through. Hang a door in it.',
  },
  window: {
    id: 'window', name: 'Window Wall', kind: 'wall', shape: 'window', costScale: 0.5, hpScale: 0.85,
    description: 'A wall with a firing slot at chest height.',
  },
  halfWall: {
    id: 'halfWall', name: 'Half Wall', kind: 'wall', shape: 'half', costScale: 0.3, hpScale: 0.6,
    description: 'Waist-high cover. Stops feet, not eyes.',
  },
  door: {
    id: 'door', name: 'Door', kind: 'door', costScale: 0.4, hpScale: 0.7,
    description: 'Hangs in a doorway. Press E to open or close it.',
  },
  storageBox: {
    id: 'storageBox', name: 'Storage Box', kind: 'deployable', costScale: 1, hpScale: 1,
    cost: [{ item: 'wood', qty: 30 }, { item: 'scrap', qty: 10 }], hp: 250, footprint: { w: 1.15, d: 0.72, h: 0.8 }, storageSlots: 18,
    description: 'Stash your loot. A raid takes what you carry, not what you store.',
  },
} as const satisfies Record<string, PieceDef>;

export type PieceId = keyof typeof PIECES;

/** Build mode bar order; keys 1–7 pick from it. */
export const BUILD_BAR: readonly PieceId[] = ['foundation', 'wall', 'doorway', 'window', 'halfWall', 'door', 'storageBox'];

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
