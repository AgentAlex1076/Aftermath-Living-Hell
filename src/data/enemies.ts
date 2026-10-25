import type { ItemAmount } from './loot';

export type EnemyId = 'shambler' | 'crawler' | 'bloater' | 'brute' | 'chemist';

export interface EnemyDef {
  id: EnemyId;
  name: string;
  model: string;
  hp: number;
  speed: number;
  radius: number;
  height: number;
  damage: number;
  /** Damage dealt to player-built pieces per hit. */
  structureDamage: number;
  attackRange: number;
  attackTime: number;
  attackCooldown: number;
  color: string;
  debrisColor: string;
  hitWords: readonly string[];
  deathWord: string;
  /** Comic label on the raid splash. */
  title: string;
  loot: readonly ItemAmount[];
  /** Ignores half-wall colliders and uses the crawl flow field. */
  slips?: boolean;
  explode?: { radius: number; damage: number; gasR: number; gasLife: number };
  /** Periodically vents gas while alive (the Chemist). */
  vent?: { every: number; radius: number; gasR: number };
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  shambler: {
    id: 'shambler', name: 'Shambler', model: 'enemy.shambler', title: 'THEY SHAMBLE',
    hp: 38, speed: 2.15, radius: 0.4, height: 1.7, damage: 9, structureDamage: 18,
    attackRange: 1.15, attackTime: 0.55, attackCooldown: 1.15,
    color: '#8a6a4a', debrisColor: '#6a3a32', hitWords: ['THWACK!', 'SPLAT!', 'KRAK!'], deathWord: 'SPLUT!',
    loot: [{ item: 'cloth', qty: 1 }],
  },
  crawler: {
    id: 'crawler', name: 'Crawler', model: 'enemy.crawler', title: 'LOW AND FAST',
    hp: 22, speed: 4.6, radius: 0.26, height: 0.7, damage: 6, structureDamage: 10,
    attackRange: 0.95, attackTime: 0.35, attackCooldown: 0.7,
    color: '#6a7a3a', debrisColor: '#4a5a22', hitWords: ['SKRIT!', 'RIP!'], deathWord: 'SKREE!',
    loot: [{ item: 'cloth', qty: 1 }], slips: true,
  },
  bloater: {
    id: 'bloater', name: 'Bloater', model: 'enemy.bloater', title: 'DON\'T POP IT',
    hp: 58, speed: 1.65, radius: 0.55, height: 1.8, damage: 12, structureDamage: 28,
    attackRange: 1.35, attackTime: 0.7, attackCooldown: 1.4,
    color: '#7a8a2a', debrisColor: '#79ff3a', hitWords: ['SLOSH!', 'BLURP!'], deathWord: 'SPLOOSH!',
    loot: [{ item: 'chemicals', qty: 2 }, { item: 'cloth', qty: 1 }],
    explode: { radius: 3.2, damage: 22, gasR: 4.5, gasLife: 8 },
  },
  brute: {
    id: 'brute', name: 'Brute', model: 'enemy.brute', title: 'WALLBREAKER',
    hp: 200, speed: 1.45, radius: 0.62, height: 2.3, damage: 22, structureDamage: 90,
    attackRange: 1.55, attackTime: 0.8, attackCooldown: 1.6,
    color: '#5a4a42', debrisColor: '#3a2a24', hitWords: ['CRACK!', 'BOOM!'], deathWord: 'THUD!',
    loot: [{ item: 'scrap', qty: 3 }, { item: 'cloth', qty: 2 }],
  },
  chemist: {
    id: 'chemist', name: 'The Chemist', model: 'enemy.chemist', title: 'THE CHEMIST',
    hp: 420, speed: 1.7, radius: 0.5, height: 2.15, damage: 16, structureDamage: 40,
    attackRange: 1.5, attackTime: 0.65, attackCooldown: 1.2,
    color: '#cfd8d2', debrisColor: '#8cff3a', hitWords: ['HISS!', 'CLACK!'], deathWord: 'KRR-FOOM!',
    loot: [{ item: 'chemicals', qty: 6 }, { item: 'electronics', qty: 3 }, { item: 'gasFilter', qty: 1 }],
    vent: { every: 6, radius: 3.5, gasR: 4.2 },
  },
};

export const ALL_ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
