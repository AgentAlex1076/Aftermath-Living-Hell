import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import { clamp } from '../core/math';
import type { Player } from '../entities/Player';
import type { World } from '../world/World';

export type DeathCause = 'gas' | 'water' | 'starvation' | 'maul' | 'acid' | 'other';

const GAS_THRESHOLD = 0.04;

/** Hunger, gas and toxic-water exposure, and passive healing. Tracks what is hurting the player for the death screen. */
export class Survival {
  /** Exposure the filter has to deal with: gas in the air, or poisoned water around the legs. */
  gas = 0;
  /** Gas in the air alone (what the fog and screen tint show). */
  air = 0;
  /** Standing in Marsh or crater water right now. */
  inToxicWater = false;
  lastCause: DeathCause = 'other';
  private hungerWarned = false;
  private starveWarned = false;
  private waterWarnT = 0;

  constructor(private readonly world: World, private readonly player: Player) {}

  get starving(): boolean {
    return this.player.hunger <= 0;
  }

  update(dt: number): void {
    const p = this.player;
    const s = CONFIG.survival;

    const air = (this.air = this.world.gasAt(p.position.x, p.position.z));
    const water = p.state === 'climbing' ? null : this.world.waterAt(p.position.x, p.position.z);
    const soak = water?.toxic && water.depth > 0.06 ? clamp(CONFIG.gas.toxicWater + water.depth * 0.35, 0, 1) : 0;
    this.inToxicWater = soak > 0;
    this.gas = Math.max(air, soak);
    this.waterWarnT = Math.max(0, this.waterWarnT - dt);
    if (this.inToxicWater && this.waterWarnT <= 0) {
      events.emit('toast', { text: 'This water is poison. It is eating your filter.', tone: 'toxic' });
    }
    if (this.inToxicWater) this.waterWarnT = 25;
    const inGas = this.gas > GAS_THRESHOLD;
    if (inGas) {
      if (p.filter > 0) p.filter = Math.max(0, p.filter - CONFIG.gas.filterDrain * this.gas * dt);
      else this.hurt(CONFIG.gas.damageNoFilter * (0.5 + 0.5 * Math.min(this.gas, 1)) * dt, soak > air ? 'water' : 'gas');
    }

    const drain = s.hungerDrain * (p.sprinting ? s.sprintHungerMultiplier : 1);
    p.hunger = Math.max(0, p.hunger - drain * dt);
    if (p.hunger <= 0) this.hurt(s.starveDamage * dt, 'starvation');
    else if (p.hunger >= s.regenHungerThreshold && !inGas && p.health < CONFIG.player.maxHealth) {
      p.heal(s.regenPerSecond * dt);
      p.hunger = Math.max(0, p.hunger - s.regenHungerCost * dt);
    }

    if (p.hunger < 25 && !this.hungerWarned) {
      this.hungerWarned = true;
      events.emit('toast', { text: 'Your stomach is eating itself. Find food.', tone: 'warn' });
    } else if (p.hunger > 35) this.hungerWarned = false;
    if (p.hunger <= 0 && !this.starveWarned) {
      this.starveWarned = true;
      events.emit('toast', { text: 'STARVING. You are losing health.', tone: 'danger' });
    } else if (p.hunger > 5) this.starveWarned = false;
  }

  eat(amount: number): void {
    this.player.hunger = Math.min(CONFIG.survival.maxHunger, this.player.hunger + amount);
  }

  noteCause(cause: DeathCause): void {
    this.lastCause = cause;
  }

  private hurt(amount: number, cause: DeathCause): void {
    this.player.damage(amount);
    this.lastCause = cause;
  }

  deathMessage(): string {
    switch (this.lastCause) {
      case 'gas':
        return 'Your filter ran dry. The gas did the rest.';
      case 'water':
        return 'Waded into the green water with an empty filter.';
      case 'starvation':
        return 'Starved in the ruins. Nobody came.';
      case 'maul':
        return 'The horde tore you apart.';
      case 'acid':
        return 'Spitter acid ate through the suit.';
      default:
        return 'Something in the wasteland finished you off.';
    }
  }
}
