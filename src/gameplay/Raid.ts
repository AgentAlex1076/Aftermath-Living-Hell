import { CONFIG } from '../data/config';
import { events, type RaidResult, type RewardEntry } from '../core/EventBus';
import { lerp } from '../core/math';
import { Rng } from '../core/random';
import { bossFor, ENEMIES, type EnemyId } from '../data/enemies';
import { rollRaidCache } from '../data/loot';
import { SCORE } from '../data/score';
import type { Horde, SpawnJob } from './Horde';
import type { Siege, SiegeUnit } from './Siege';

/**
 * `calm` builds attention, `calling` is the siren wind-up, `inbound` is a forced raid's return
 * window, `raid` is a wave on the field and `siege` is the base fighting it without the player.
 */
export type RaidState = 'calm' | 'calling' | 'inbound' | 'raid' | 'siege';

export interface RaidHooks {
  /** Metres from the player to the hut. */
  homeDistance: () => number;
}

const H = CONFIG.horde;

/**
 * Horde Pressure and the Wave Director. Attention builds over time (faster at night) and with
 * noise; the player cranks the siren to start a raid on their terms, or the horde comes anyway
 * when attention fills. Away from home, the base fights on without you (see `Siege`). A raid
 * ends when the wave is dead (`cleared`), the defences outlast it (`held`) or it gets in (`breached`).
 */
export class Raid {
  state: RaidState = 'calm';
  /** 0..100. */
  attention = 0;
  /** Seconds until the raid lands while `calling` or `inbound`. */
  timeLeft = 0;
  /** Seconds before the siren can be cranked again. */
  cooldown = 0;
  raidNumber = 0;
  raidsSurvived = 0;
  /** Wave size multiplier for the raid being called or fought. */
  waveScale = 1;
  /** Reward multiplier (score and cache) for the raid being called or fought. */
  rewardScale = 1;
  /** The raid in progress was forced by a full meter rather than called. */
  forced = false;
  /** Score earned from raids so far (each raid's base × its reward scale, halved when only held). */
  raidPoints = 0;
  private night = 0;
  private warned = new Set<number>();
  private stirred = new Set<number>();
  private heading = 0;
  private readonly rng: Rng;
  private readonly cacheRng: Rng;

  constructor(
    seed: number,
    private readonly horde: Horde,
    private readonly siege: Siege,
    private readonly hooks: RaidHooks,
  ) {
    this.rng = new Rng(seed ^ 0x51a1d);
    this.cacheRng = new Rng(seed ^ 0xca5e);
  }

  /** A wave is coming at the base right now, on the field or on paper. */
  get active(): boolean {
    return this.state === 'raid' || this.state === 'siege';
  }

  /** The siren can be cranked right now. */
  get canCall(): boolean {
    return this.state === 'calm' && this.cooldown <= 0;
  }

  /** Why the siren won't crank, for the prompt. Null when it will. */
  get callBlocked(): string | null {
    if (this.state === 'raid') return 'Raid in progress';
    if (this.state === 'siege') return 'The base is under attack';
    if (this.state === 'calling') return 'Already winding up';
    if (this.state === 'inbound') return "They're already coming";
    if (this.cooldown > 0) return `Cooling down (${Math.ceil(this.cooldown)}s)`;
    return null;
  }

  /** Attention per second right now, before noise. */
  get passiveRate(): number {
    return H.passive * (1 + H.passivePerRaid * this.raidsSurvived) * (1 + (H.nightMultiplier - 1) * this.night);
  }

  /** `night` is 0 in daylight, 1 at full night. */
  update(dt: number, night: number): void {
    this.night = night;
    this.cooldown = Math.max(0, this.cooldown - dt);
    switch (this.state) {
      case 'calm':
        this.addAttention(this.passiveRate * dt);
        return;
      case 'calling':
      case 'inbound':
        this.timeLeft -= dt;
        for (const w of H.warnings) {
          if (this.timeLeft <= w && !this.warned.has(w)) {
            this.warned.add(w);
            events.emit('raid:warning', { seconds: w, away: this.hooks.homeDistance() > CONFIG.homeZone.radius });
          }
        }
        if (this.timeLeft <= 0) this.begin();
        return;
      case 'raid':
        if (this.horde.raidAlive === 0) this.end('cleared');
        else if (this.hooks.homeDistance() > H.leaveRange) this.toSiege(this.horde.withdrawRaid(), 'left', H.siegeApproach * 0.4);
        return;
      case 'siege':
        this.siege.update(dt);
        if (this.siege.result) this.end(this.siege.result);
        else if (this.hooks.homeDistance() < H.siegeRange) {
          const jobs = this.siege.materialize();
          this.state = 'raid';
          this.horde.enqueue(jobs);
          events.emit('raid:engage', { raid: this.raidNumber, left: jobs.length });
        }
    }
  }

  /** Noise and greed. Ignored outside the calm, since a raid resets the meter anyway. */
  addAttention(amount: number): void {
    if (this.state !== 'calm' || amount <= 0) return;
    this.attention = Math.min(100, this.attention + amount);
    // One banner per jump: only the highest threshold crossed, and none if the horde is coming anyway.
    let crossed = 0;
    for (const level of H.thresholds) {
      if (this.attention >= level && !this.stirred.has(level)) {
        this.stirred.add(level);
        crossed = level;
      }
    }
    if (this.attention >= 100) this.inbound();
    else if (crossed) events.emit('horde:stir', { level: crossed });
  }

  /** The siren: starts the wind-up. Returns false (and says why via `callBlocked`) if it can't. */
  call(): boolean {
    if (!this.canCall) return false;
    const nightCall = this.night > 0.5;
    const t = this.attention / 100;
    this.waveScale = lerp(H.callScaleMin, H.callScaleMax, t) * (nightCall ? H.nightWave : 1);
    this.rewardScale = lerp(H.callScaleMin, H.callScaleMax, t) * (nightCall ? H.nightReward : 1);
    this.forced = false;
    this.state = 'calling';
    this.timeLeft = H.callWindup;
    this.primeWarnings();
    events.emit('raid:calling', { seconds: H.callWindup, night: nightCall });
    return true;
  }

  /** Debug: set the meter directly (thresholds and a forced raid still fire). */
  setAttention(value: number): void {
    if (this.state !== 'calm') return;
    if (value < this.attention) {
      this.attention = value;
      this.stirred.clear();
      for (const level of H.thresholds) if (value >= level) this.stirred.add(level);
      return;
    }
    this.addAttention(value - this.attention);
  }

  /** Debug: land a called or forced raid in a second. */
  skipCountdown(): void {
    if (this.state !== 'calling' && this.state !== 'inbound') return;
    this.timeLeft = Math.min(this.timeLeft, 1);
    for (const w of H.warnings) this.warned.add(w);
  }

  /** Debug: raid right now, skipping any wind-up. */
  startNow(): void {
    if (this.active) return;
    if (this.state === 'calm') {
      this.waveScale = 1;
      this.rewardScale = 1;
      this.forced = false;
    }
    this.begin();
  }

  private inbound(): void {
    if (this.state !== 'calm') return;
    this.waveScale = H.callScaleMax * (this.night > 0.5 ? H.nightWave : 1);
    this.rewardScale = 1;
    this.forced = true;
    this.state = 'inbound';
    this.timeLeft = this.night > 0.5 ? H.forcedWarningNight : H.forcedWarning;
    this.primeWarnings();
    events.emit('raid:inbound', { seconds: this.timeLeft });
  }

  /** Skip warnings longer than the time left, so a 15 s wind-up doesn't shout "1 minute". */
  private primeWarnings(): void {
    this.warned.clear();
    for (const w of H.warnings) if (w >= this.timeLeft) this.warned.add(w);
  }

  private begin(): void {
    this.raidNumber++;
    this.timeLeft = 0;
    const jobs = this.compose(this.raidNumber, this.waveScale);
    if (this.hooks.homeDistance() > H.siegeRange) {
      this.toSiege(jobs.map((j) => ({ id: j.id, hp: ENEMIES[j.id].hp * (j.hpMul ?? 1) })), 'away');
      return;
    }
    this.state = 'raid';
    this.horde.enqueue(jobs);
    events.emit('raid:start', { raid: this.raidNumber });
  }

  /** The base fights on without the player. `approach` is how long the wave takes to reach the walls. */
  private toSiege(units: SiegeUnit[], reason: 'away' | 'left', approach?: number): void {
    this.state = 'siege';
    this.siege.start(units, this.heading, approach);
    events.emit('raid:siege', { raid: this.raidNumber, reason });
  }

  private end(result: RaidResult): void {
    if (!this.active) return;
    const won = result !== 'breached';
    const share = result === 'held' ? H.heldShare : 1;
    const points = won ? Math.round(SCORE.perRaid * this.rewardScale * share) : 0;
    if (won) {
      this.raidsSurvived++;
      this.raidPoints += points;
    }
    events.emit('raid:end', { raid: this.raidNumber, result, points });
    if (won) {
      const boss = !!bossFor(this.raidNumber);
      const entries: RewardEntry[] = [
        { kind: 'score', points },
        { kind: 'cache', items: rollRaidCache(this.raidNumber, this.waveScale * share, boss, this.cacheRng) },
      ];
      if (result === 'cleared') entries.push({ kind: 'reveal', count: this.cacheRng.int(H.reveals[0], H.reveals[1]) });
      events.emit('raid:reward', { raid: this.raidNumber, entries });
    }
    this.state = 'calm';
    this.cooldown = H.callCooldown;
    this.attention = Math.min(H.maxFloor, this.raidsSurvived * H.floorPerRaid);
    this.stirred.clear();
    for (const level of H.thresholds) if (this.attention >= level) this.stirred.add(level);
  }

  /** Builds a staggered spawn list around the hut, mixed by raid number and sized by `scale`. */
  compose(raid: number, scale = 1): SpawnJob[] {
    const jobs: SpawnJob[] = [];
    const dirs = 1 + Math.min(3, Math.floor((raid - 1) / 2));
    const headings: number[] = [];
    const base = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < dirs; i++) headings.push(base + (i * Math.PI * 2) / dirs + this.rng.range(-0.25, 0.25));
    this.heading = headings[0];

    const count = Math.max(3, Math.round((5 + raid * 3 + this.rng.int(0, 2)) * scale));
    const mix = this.mix(raid);
    let screamers = 1 + Math.floor(raid / 6);
    for (let n = 0; n < count; n++) {
      let id = pick(mix, this.rng.next());
      if (id === 'screamer' && screamers-- <= 0) id = 'shambler';
      const heading = headings[n % headings.length] + this.rng.range(-0.2, 0.2);
      const r = this.rng.range(CONFIG.raid.spawnMin, CONFIG.raid.spawnMax);
      jobs.push({
        id, raid: true,
        x: Math.sin(heading) * r,
        z: Math.cos(heading) * r,
        delay: 0.4 + Math.floor(n / dirs) * this.rng.range(0.55, 0.9) + this.rng.range(0, 0.3),
      });
    }
    const boss = bossFor(raid);
    if (boss) {
      const h = headings[0];
      const r = (CONFIG.raid.spawnMin + CONFIG.raid.spawnMax) / 2;
      jobs.push({ id: boss.id, raid: true, x: Math.sin(h) * r, z: Math.cos(h) * r, delay: 1.2, hpMul: boss.hpMul });
    }
    return jobs;
  }

  private mix(raid: number): { id: EnemyId; w: number }[] {
    const out: { id: EnemyId; w: number }[] = [{ id: 'shambler', w: 8 }];
    if (raid >= 2) out.push({ id: 'crawler', w: 2 + raid * 0.4 });
    if (raid >= 2) out.push({ id: 'bloater', w: 1 + raid * 0.25 });
    if (raid >= 3) out.push({ id: 'brute', w: 0.4 + raid * 0.15 });
    if (raid >= 3) out.push({ id: 'spitter', w: 1 + raid * 0.25 });
    if (raid >= 4) out.push({ id: 'screamer', w: 0.6 + raid * 0.1 });
    if (raid >= 4) out.push({ id: 'stalker', w: 0.8 + raid * 0.2 });
    if (raid >= 5) out.push({ id: 'climber', w: 1 + raid * 0.3 });
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
