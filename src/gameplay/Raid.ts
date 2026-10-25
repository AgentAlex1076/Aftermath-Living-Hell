import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { Rng } from '../core/random';
import type { EnemyId } from '../data/enemies';
import type { Horde, SpawnJob } from './Horde';

export type RaidState = 'countdown' | 'raid';
export type PenaltyReason = 'timer' | 'left';

export interface RaidHooks {
  insideZone: () => boolean;
  applyPenalty: (reason: PenaltyReason) => void;
}

const WARNINGS = CONFIG.raid.warnings;

/**
 * The raid clock and Wave Director. Rolls the next countdown, flashes warnings, starts the
 * wave when it hits zero (penalizing the player if they're outside), and ends the raid when
 * every mutant in the wave is dead.
 */
export class Raid {
  state: RaidState = 'countdown';
  timeLeft: number;
  raidNumber = 0;
  raidsSurvived = 0;
  private warned = new Set<number>();
  private penalized = false;
  private readonly rng: Rng;

  constructor(
    seed: number,
    private readonly horde: Horde,
    private readonly hooks: RaidHooks,
  ) {
    this.rng = new Rng(seed ^ 0x51a1d);
    this.timeLeft = this.roll();
  }

  get active(): boolean {
    return this.state === 'raid';
  }

  update(dt: number): void {
    if (this.state === 'countdown') {
      this.timeLeft -= dt;
      for (const w of WARNINGS) {
        if (this.timeLeft <= w && !this.warned.has(w)) {
          this.warned.add(w);
          events.emit('raid:warning', { seconds: w });
        }
      }
      if (this.timeLeft <= 0) this.begin();
      return;
    }
    if (this.hooks.insideZone()) this.penalized = false;
    else if (!this.penalized) this.penalize('left');
    if (this.horde.raidAlive === 0) this.end();
  }

  /** Debug: jump the countdown, skipping warnings that would already have fired. */
  skipTo(seconds: number): void {
    if (this.state !== 'countdown') return;
    this.timeLeft = seconds;
    this.warned.clear();
    for (const w of WARNINGS) if (w > seconds) this.warned.add(w);
  }

  startNow(): void {
    if (this.state === 'raid') return;
    this.timeLeft = 0;
    this.begin();
  }

  private begin(): void {
    this.raidNumber++;
    this.penalized = false;
    if (!this.hooks.insideZone()) this.penalize('timer');
    this.state = 'raid';
    this.horde.enqueue(this.compose(this.raidNumber));
    events.emit('raid:start', { raid: this.raidNumber });
  }

  private end(): void {
    if (this.state !== 'raid') return;
    this.raidsSurvived++;
    events.emit('raid:end', { raid: this.raidNumber });
    this.state = 'countdown';
    this.timeLeft = this.roll();
    this.warned.clear();
  }

  private penalize(reason: PenaltyReason): void {
    this.penalized = true;
    this.hooks.applyPenalty(reason);
    events.emit('raid:penalty', { reason });
  }

  private roll(): number {
    return this.rng.range(CONFIG.raid.minCountdown, CONFIG.raid.maxCountdown);
  }

  /** Builds a staggered spawn list around the hut, mixed by raid number. */
  compose(raid: number): SpawnJob[] {
    const jobs: SpawnJob[] = [];
    const dirs = 1 + Math.min(3, Math.floor((raid - 1) / 2));
    const headings: number[] = [];
    const base = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < dirs; i++) headings.push(base + (i * Math.PI * 2) / dirs + this.rng.range(-0.25, 0.25));

    const count = 5 + raid * 3 + this.rng.int(0, 2);
    const mix = this.mix(raid);
    for (let n = 0; n < count; n++) {
      const id = pick(mix, this.rng.next());
      const heading = headings[n % headings.length] + this.rng.range(-0.2, 0.2);
      const r = this.rng.range(CONFIG.raid.spawnMin, CONFIG.raid.spawnMax);
      jobs.push({
        id, raid: true,
        x: Math.sin(heading) * r,
        z: Math.cos(heading) * r,
        delay: 0.4 + Math.floor(n / dirs) * this.rng.range(0.55, 0.9) + this.rng.range(0, 0.3),
      });
    }
    if (raid % 5 === 0) {
      const h = headings[0];
      const r = (CONFIG.raid.spawnMin + CONFIG.raid.spawnMax) / 2;
      jobs.push({ id: 'chemist', raid: true, x: Math.sin(h) * r, z: Math.cos(h) * r, delay: 1.2 });
    }
    return jobs;
  }

  private mix(raid: number): { id: EnemyId; w: number }[] {
    const out: { id: EnemyId; w: number }[] = [{ id: 'shambler', w: 8 }];
    if (raid >= 2) out.push({ id: 'crawler', w: 2 + raid * 0.4 });
    if (raid >= 2) out.push({ id: 'bloater', w: 1 + raid * 0.25 });
    if (raid >= 3) out.push({ id: 'brute', w: 0.4 + raid * 0.15 });
    return out;
  }
}

function pick(mix: { id: EnemyId; w: number }[], t: number): EnemyId {
  const total = mix.reduce((s, m) => s + m.w, 0);
  let r = t * total;
  for (const m of mix) {
    r -= m.w;
    if (r <= 0) return m.id;
  }
  return mix[0].id;
}
