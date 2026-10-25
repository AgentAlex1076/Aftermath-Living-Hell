import type { ItemId, ToolKind } from './items';

export interface NodeYield {
  item: ItemId;
  /** Total amount the node gives over its whole health pool. */
  total: number;
}

export interface ResourceNodeDef {
  id: string;
  name: string;
  verb: string;
  model: string;
  hp: number;
  /** Tool that gathers this node at full power. */
  tool: ToolKind;
  /** Multiplier on bare-hand power. 0 means a tool is required. */
  handMultiplier: number;
  yields: readonly NodeYield[];
  /** Comic hit words shown on impact. */
  hitWords: readonly string[];
  debrisColor: string;
  /** Releases a puff of toxic gas when hit. */
  toxic?: boolean;
  /** Collider/footprint radius used for targeting. */
  radius: number;
  minimapColor: string;
}

export const NODES = {
  deadTree: {
    id: 'deadTree', name: 'Dead Tree', verb: 'Chop', model: 'prop.deadTree', hp: 100, tool: 'axe', handMultiplier: 0.3,
    yields: [{ item: 'wood', total: 30 }], hitWords: ['THWACK!', 'CHOK!', 'KRAK!'], debrisColor: '#6a5541', radius: 0.4, minimapColor: '#7a5c3e',
  },
  rock: {
    id: 'rock', name: 'Boulder', verb: 'Mine', model: 'node.rock', hp: 120, tool: 'pickaxe', handMultiplier: 0.2,
    yields: [{ item: 'stone', total: 40 }], hitWords: ['KRAK!', 'TINK!', 'CHNK!'], debrisColor: '#8a8780', radius: 0.9, minimapColor: '#9a9790',
  },
  rubble: {
    id: 'rubble', name: 'Concrete Rubble', verb: 'Break', model: 'prop.rubble', hp: 90, tool: 'pickaxe', handMultiplier: 0.2,
    yields: [{ item: 'stone', total: 22 }, { item: 'scrap', total: 6 }], hitWords: ['KRAK!', 'CRUNCH!'], debrisColor: '#7d7c76', radius: 0.9, minimapColor: '#8d8c86',
  },
  scrapPile: {
    id: 'scrapPile', name: 'Scrap Heap', verb: 'Salvage', model: 'node.scrapPile', hp: 110, tool: 'pickaxe', handMultiplier: 0,
    yields: [{ item: 'scrap', total: 30 }, { item: 'electronics', total: 3 }, { item: 'cloth', total: 4 }], hitWords: ['KLANG!', 'SKRANK!'], debrisColor: '#8a4f2c', radius: 1.0, minimapColor: '#d07a3a',
  },
  car: {
    id: 'car', name: 'Wrecked Car', verb: 'Salvage', model: 'prop.car', hp: 220, tool: 'pickaxe', handMultiplier: 0,
    yields: [{ item: 'scrap', total: 55 }, { item: 'electronics', total: 6 }, { item: 'cloth', total: 8 }], hitWords: ['KLANG!', 'CRUNCH!', 'BONK!'], debrisColor: '#6a2a24', radius: 2.0, minimapColor: '#b0563e',
  },
  barrel: {
    id: 'barrel', name: 'Rusted Barrel', verb: 'Salvage', model: 'prop.barrel', hp: 40, tool: 'pickaxe', handMultiplier: 0.25,
    yields: [{ item: 'scrap', total: 10 }], hitWords: ['BONK!', 'KLANG!'], debrisColor: '#6b3d24', radius: 0.4, minimapColor: '#a0603a',
  },
  carcass: {
    id: 'carcass', name: 'Mutant Carcass', verb: 'Butcher', model: 'node.carcass', hp: 60, tool: 'axe', handMultiplier: 0.25,
    yields: [{ item: 'mutantMeat', total: 4 }, { item: 'cloth', total: 5 }], hitWords: ['SHLUK!', 'SPLAT!', 'THWUMP!'], debrisColor: '#8c3b3b', radius: 0.9, minimapColor: '#d85a5a',
  },
  toxicBarrel: {
    id: 'toxicBarrel', name: 'Chemical Drum', verb: 'Drain', model: 'prop.barrelToxic', hp: 50, tool: 'pickaxe', handMultiplier: 0.25,
    yields: [{ item: 'chemicals', total: 12 }], hitWords: ['SPLRT!', 'HISSS!'], debrisColor: '#79ff3a', toxic: true, radius: 0.4, minimapColor: '#8cff3a',
  },
} as const satisfies Record<string, ResourceNodeDef>;

export type NodeId = keyof typeof NODES;
