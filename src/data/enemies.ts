import type { ItemAmount } from './loot';

export type EnemyId =
  | 'shambler' | 'crawler' | 'bloater' | 'brute'
  | 'spitter' | 'screamer' | 'stalker' | 'climber'
  | 'chemist' | 'patientZero';

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
  /** One line for the Codex. */
  blurb: string;
  /** Voice for groans and death cries (see `audio/sounds.ts`). */
  voice: string;
  loot: readonly ItemAmount[];
  boss?: boolean;
  /** Ignores half-wall colliders and uses the crawl flow field. */
  slips?: boolean;
  /** Goes over player-built walls instead of through them. */
  climbs?: boolean;
  explode?: { radius: number; damage: number; gasR: number; gasLife: number };
  /** Periodically vents gas while alive (the Chemist; the Stalker's veil). */
  vent?: { every: number; radius: number; gasR: number; life?: number; damage?: number };
  /** Lobs acid from a distance. Prefers the player, settles for a wall. */
  spit?: { range: number; keep: number; every: number; damage: number; structureDamage: number; splash: number; speed: number };
  /** Shrieks to frenzy nearby mutants and call more of them. */
  scream?: { every: number; radius: number; buff: number; speedMul: number; damageMul: number; calls: number; maxCalls: number };
  /** Fades out while standing in gas. */
  cloak?: { gas: number; opacity: number };
  /** Boss ground slam. */
  slam?: { every: number; radius: number; damage: number; structureDamage: number; windup: number };
  /** Splits off mutants as it loses health. */
  brood?: { at: readonly number[]; id: EnemyId; count: number };
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  shambler: {
    id: 'shambler', name: 'Shambler', model: 'enemy.shambler', title: 'THEY SHAMBLE', voice: 'voice.shambler',
    blurb: 'Slow, stupid and never alone. Most of the wave.',
    hp: 38, speed: 2.15, radius: 0.4, height: 1.7, damage: 9, structureDamage: 18,
    attackRange: 1.15, attackTime: 0.55, attackCooldown: 1.15,
    color: '#8a6a4a', debrisColor: '#6a3a32', hitWords: ['THWACK!', 'SPLAT!', 'KRAK!'], deathWord: 'SPLUT!',
    loot: [{ item: 'cloth', qty: 1 }],
  },
  crawler: {
    id: 'crawler', name: 'Crawler', model: 'enemy.crawler', title: 'LOW AND FAST', voice: 'voice.crawler',
    blurb: 'Fast and low. Slips under half walls.',
    hp: 22, speed: 4.6, radius: 0.26, height: 0.7, damage: 6, structureDamage: 10,
    attackRange: 0.95, attackTime: 0.35, attackCooldown: 0.7,
    color: '#6a7a3a', debrisColor: '#4a5a22', hitWords: ['SKRIT!', 'RIP!'], deathWord: 'SKREE!',
    loot: [{ item: 'cloth', qty: 1 }], slips: true,
  },
  bloater: {
    id: 'bloater', name: 'Bloater', model: 'enemy.bloater', title: 'DON\'T POP IT', voice: 'voice.bloater',
    blurb: 'Bursts into a gas cloud when it dies. Kill it far from the hut.',
    hp: 58, speed: 1.65, radius: 0.55, height: 1.8, damage: 12, structureDamage: 28,
    attackRange: 1.35, attackTime: 0.7, attackCooldown: 1.4,
    color: '#7a8a2a', debrisColor: '#79ff3a', hitWords: ['SLOSH!', 'BLURP!'], deathWord: 'SPLOOSH!',
    loot: [{ item: 'chemicals', qty: 2 }, { item: 'cloth', qty: 1 }],
    explode: { radius: 3.2, damage: 22, gasR: 4.5, gasLife: 8 },
  },
  brute: {
    id: 'brute', name: 'Brute', model: 'enemy.brute', title: 'WALLBREAKER', voice: 'voice.brute',
    blurb: 'Huge and tanky. Walls do not stop it for long.',
    hp: 200, speed: 1.45, radius: 0.62, height: 2.3, damage: 22, structureDamage: 90,
    attackRange: 1.55, attackTime: 0.8, attackCooldown: 1.6,
    color: '#5a4a42', debrisColor: '#3a2a24', hitWords: ['CRACK!', 'BOOM!'], deathWord: 'THUD!',
    loot: [{ item: 'scrap', qty: 3 }, { item: 'cloth', qty: 2 }],
  },
  spitter: {
    id: 'spitter', name: 'Spitter', model: 'enemy.spitter', title: 'ACID MOUTH', voice: 'voice.spitter',
    blurb: 'Hangs back and lobs acid over your walls. It eats through wood.',
    hp: 34, speed: 2.0, radius: 0.4, height: 1.6, damage: 6, structureDamage: 12,
    attackRange: 1.1, attackTime: 0.7, attackCooldown: 1.1,
    color: '#9aa83a', debrisColor: '#b6ff4a', hitWords: ['SQUELCH!', 'SPLRT!'], deathWord: 'BLORP!',
    loot: [{ item: 'chemicals', qty: 1 }, { item: 'cloth', qty: 1 }],
    spit: { range: 11, keep: 7.5, every: 3.2, damage: 11, structureDamage: 34, splash: 1.25, speed: 10 },
  },
  screamer: {
    id: 'screamer', name: 'Screamer', model: 'enemy.screamer', title: 'THE ALARM', voice: 'voice.screamer',
    blurb: 'Its shriek frenzies the horde and calls more. Kill it first.',
    hp: 30, speed: 2.6, radius: 0.36, height: 1.95, damage: 5, structureDamage: 6,
    attackRange: 1.0, attackTime: 0.4, attackCooldown: 1.0,
    color: '#c9b8a6', debrisColor: '#7a2a2a', hitWords: ['SKRK!', 'CRNCH!'], deathWord: 'HRRK—!',
    loot: [{ item: 'cloth', qty: 1 }, { item: 'electronics', qty: 1 }],
    scream: { every: 8, radius: 11, buff: 6, speedMul: 1.4, damageMul: 1.35, calls: 2, maxCalls: 4 },
  },
  stalker: {
    id: 'stalker', name: 'Stalker', model: 'enemy.stalker', title: 'IN THE FOG', voice: 'voice.stalker',
    blurb: 'Breathes its own fog and vanishes inside gas. Watch for the eyes.',
    hp: 46, speed: 3.4, radius: 0.36, height: 1.85, damage: 11, structureDamage: 14,
    attackRange: 1.2, attackTime: 0.42, attackCooldown: 1.15,
    color: '#8c9a94', debrisColor: '#3a4a44', hitWords: ['THCK!', 'SHNK!'], deathWord: 'HKK!',
    loot: [{ item: 'chemicals', qty: 1 }, { item: 'cloth', qty: 1 }],
    cloak: { gas: 0.12, opacity: 0.05 },
    vent: { every: 9, radius: 0, gasR: 2.6, life: 5 },
  },
  climber: {
    id: 'climber', name: 'Climber', model: 'enemy.climber', title: 'OVER THE WALL', voice: 'voice.climber',
    blurb: 'Hooked hands. Goes straight over walls and gates. Cover it with traps.',
    hp: 40, speed: 3.0, radius: 0.34, height: 1.6, damage: 10, structureDamage: 8,
    attackRange: 1.05, attackTime: 0.45, attackCooldown: 0.85,
    color: '#7a5a3a', debrisColor: '#5a2a1a', hitWords: ['SKRAT!', 'KRK!'], deathWord: 'SKRAK!',
    loot: [{ item: 'cloth', qty: 1 }, { item: 'scrap', qty: 1 }], climbs: true,
  },
  chemist: {
    id: 'chemist', name: 'The Chemist', model: 'enemy.chemist', title: 'THE CHEMIST', voice: 'voice.chemist',
    blurb: 'Boss. Vents gas around itself. Still wearing its badge.',
    hp: 420, speed: 1.7, radius: 0.5, height: 2.15, damage: 16, structureDamage: 40,
    attackRange: 1.5, attackTime: 0.65, attackCooldown: 1.2,
    color: '#cfd8d2', debrisColor: '#8cff3a', hitWords: ['HISS!', 'CLACK!'], deathWord: 'KRR-FOOM!',
    loot: [{ item: 'chemicals', qty: 6 }, { item: 'electronics', qty: 3 }, { item: 'gasFilter', qty: 1 }, { item: 'protoBarrel', qty: 1 }, { item: 'ammo', qty: 12 }],
    vent: { every: 6, radius: 3.5, gasR: 4.2, damage: 8 },
    boss: true,
  },
  patientZero: {
    id: 'patientZero', name: 'Patient Zero', model: 'enemy.patientZero', title: 'PATIENT ZERO', voice: 'voice.patientZero',
    blurb: 'Boss. The first one the gas took. Slams the ground and splits open into crawlers.',
    hp: 950, speed: 1.75, radius: 0.85, height: 3.0, damage: 26, structureDamage: 110,
    attackRange: 1.9, attackTime: 0.85, attackCooldown: 1.5,
    color: '#b7a08a', debrisColor: '#8a1a1a', hitWords: ['THOOM!', 'SPLRCH!', 'KRAK!'], deathWord: 'GHRRK-BOOM!',
    loot: [
      { item: 'chemicals', qty: 8 }, { item: 'electronics', qty: 4 }, { item: 'gasFilter', qty: 2 },
      { item: 'slugConverter', qty: 1 }, { item: 'drumMag', qty: 1 }, { item: 'ammo', qty: 20 },
    ],
    slam: { every: 6.5, radius: 4.6, damage: 30, structureDamage: 70, windup: 1.0 },
    brood: { at: [0.75, 0.5, 0.25], id: 'crawler', count: 4 },
    boss: true,
  },
};

export const ALL_ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];
export const BOSS_IDS = ALL_ENEMY_IDS.filter((id) => ENEMIES[id].boss);

/** Every 5th raid has a boss. They alternate, and come back tougher each time round. */
export function bossFor(raid: number): { id: EnemyId; hpMul: number } | null {
  if (raid <= 0 || raid % 5 !== 0) return null;
  const n = raid / 5 - 1;
  return { id: BOSS_IDS[n % BOSS_IDS.length], hpMul: 1 + 0.5 * Math.floor(n / BOSS_IDS.length) };
}
