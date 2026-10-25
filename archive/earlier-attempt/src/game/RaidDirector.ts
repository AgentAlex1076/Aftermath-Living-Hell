import { Rng } from '../core/rng';
import { bus, type PenaltyReason } from './events';

export type RaidState = 'countdown' | 'raid';

const MIN_COUNTDOWN = 90;
const MAX_COUNTDOWN = 300;
const WARNINGS = [60, 30, 10];
/** No enemies exist until Phase 5, so a raid holds for this long to let the home-zone rule be tested. */
const PLACEHOLDER_RAID_SECONDS = 20;

export interface RaidHooks {
  isPlayerInZone: () => boolean;
  /** Wipes the carried inventory and teleports the player back to the hut. */
  applyPenalty: (reason: PenaltyReason) => void;
  enemiesAlive: () => number;
}

export class RaidDirector {
  state: RaidState = 'countdown';
  timeLeft: number;
  raidNumber = 0;
  raidsSurvived = 0;
  raidElapsed = 0;
  private warned = new Set<number>();

  constructor(
    private rng: Rng,
    private hooks: RaidHooks,
  ) {
    this.timeLeft = this.rollCountdown();
  }

  get raidActive() {
    return this.state === 'raid';
  }

  update(dt: number) {
    if (this.state === 'countdown') {
      this.timeLeft -= dt;
      for (const w of WARNINGS) {
        if (this.timeLeft <= w && !this.warned.has(w)) {
          this.warned.add(w);
          bus.emit('raid:warning', { secondsLeft: w });
        }
      }
      if (this.timeLeft <= 0) this.startRaid();
      return;
    }

    this.raidElapsed += dt;
    if (!this.hooks.isPlayerInZone()) this.penalize('left-during-raid');
    if (this.hooks.enemiesAlive() === 0 && this.raidElapsed >= PLACEHOLDER_RAID_SECONDS) this.endRaid();
  }

  startRaid() {
    this.raidNumber++;
    if (!this.hooks.isPlayerInZone()) this.penalize('timer');
    this.state = 'raid';
    this.raidElapsed = 0;
    bus.emit('raid:start', { raidNumber: this.raidNumber });
  }

  endRaid() {
    if (this.state !== 'raid') return;
    this.raidsSurvived++;
    bus.emit('raid:end', { raidNumber: this.raidNumber });
    this.state = 'countdown';
    this.timeLeft = this.rollCountdown();
    this.warned.clear();
  }

  /** Debug: jump the countdown without firing the warnings it skipped over. */
  setCountdown(seconds: number) {
    if (this.state !== 'countdown') return;
    this.timeLeft = seconds;
    this.warned.clear();
    for (const w of WARNINGS) if (w > seconds) this.warned.add(w);
  }

  private penalize(reason: PenaltyReason) {
    this.hooks.applyPenalty(reason);
    bus.emit('zone:penalty', { reason });
  }

  private rollCountdown() {
    return this.rng.range(MIN_COUNTDOWN, MAX_COUNTDOWN);
  }
}
