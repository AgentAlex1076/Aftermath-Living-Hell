/** How a finished run turns into a number. Raids carry the run; everything else is flavour. */
export const SCORE = {
  perRaid: 1000,
  perKill: 10,
  /** Extra on top of the regular kill, for The Chemist and later bosses. */
  perBoss: 250,
  perBuild: 5,
  perGun: 50,
  perMinute: 15,
} as const;

export interface ScoreInput {
  raids: number;
  /** Points actually earned from raids (call bonus, held sieges at half). Falls back to `raids × perRaid`. */
  raidPoints?: number;
  kills: number;
  bosses: number;
  built: number;
  guns: number;
  seconds: number;
}

export interface ScoreBreakdown {
  raids: number;
  kills: number;
  bosses: number;
  built: number;
  guns: number;
  time: number;
  multiplier: number;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown;
}

export interface BestGun {
  name: string;
  parts: number;
  damage: number;
  mode: string;
  power: number;
}

/** +10% at 5 raids, +25% at 10, +50% at 15. Nothing before the first streak. */
export function raidMultiplier(raids: number): number {
  if (raids >= 15) return 1.5;
  if (raids >= 10) return 1.25;
  if (raids >= 5) return 1.1;
  return 1;
}

export function scoreRun(input: ScoreInput): ScoreResult {
  const regular = Math.max(0, input.kills - input.bosses);
  const breakdown: ScoreBreakdown = {
    raids: input.raidPoints ?? input.raids * SCORE.perRaid,
    kills: regular * SCORE.perKill,
    bosses: input.bosses * (SCORE.perKill + SCORE.perBoss),
    built: input.built * SCORE.perBuild,
    guns: input.guns * SCORE.perGun,
    time: Math.floor(input.seconds / 60) * SCORE.perMinute,
    multiplier: raidMultiplier(input.raids),
  };
  const base =
    breakdown.raids + breakdown.kills + breakdown.bosses + breakdown.built + breakdown.guns + breakdown.time;
  return { total: Math.round(base * breakdown.multiplier), breakdown };
}

/** Rough DPS × magazine so two guns can be compared for "best of the run". */
export function gunPower(stats: { damage: number; fireRate: number; projectiles: number; magSize: number }): number {
  return stats.damage * stats.fireRate * Math.max(1, stats.projectiles) * (0.5 + Math.min(stats.magSize, 40) / 40);
}

export function formatScore(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
