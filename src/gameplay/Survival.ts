import { CONFIG } from '../data/config';
import { events } from '../core/EventBus';
import type { Player } from '../entities/Player';
import type { World } from '../world/World';

export type DeathCause = 'gas' | 'starvation' | 'maul' | 'other';

const GAS_THRESHOLD = 0.04;

/** Hunger, gas exposure and passive healing. Tracks what is hurting the player for the death screen. */
export class Survival {
  gas = 0;
  lastCause: DeathCause = 'other';
  private hungerWarned = false;
  private starveWarned = false;

  constructor(private readonly world: World, private readonly player: Player) {}

  get starving(): boolean {
    return this.player.hunger <= 0;
  }

  update(dt: number): void {
    const p = this.player;
    const s = CONFIG.survival;

    this.gas = this.world.gasAt(p.position.x, p.position.z);
    const inGas = this.gas > GAS_THRESHOLD;
    if (inGas) {
      if (p.filter > 0) p.filter = Math.max(0, p.filter - CONFIG.gas.filterDrain * this.gas * dt);
      else this.hurt(CONFIG.gas.damageNoFilter * (0.5 + 0.5 * Math.min(this.gas, 1)) * dt, 'gas');
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
      case 'starvation':
        return 'Starved in the ruins. Nobody came.';
      case 'maul':
        return 'The horde tore you apart.';
      default:
        return 'Something in the wasteland finished you off.';
    }
  }
}
