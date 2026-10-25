import { clamp } from '../core/math';
import { bus } from './events';

export type StatKey = 'health' | 'hunger' | 'stamina' | 'filter';

const HUNGER_SECONDS = 20 * 60;
const STARVING_DPS = 1;
const FILTER_DRAIN_PER_SEC = 1.6;
const NO_FILTER_DPS = 6;
const STAMINA_REGEN = 18;
const STAMINA_REGEN_DELAY = 0.8;
const EXHAUSTED_RECOVER_AT = 30;

export class Survival {
  readonly max: Record<StatKey, number> = { health: 100, hunger: 100, stamina: 100, filter: 100 };
  health = 100;
  hunger = 100;
  stamina = 100;
  filter = 100;
  /** Set when stamina hits zero; sprinting is locked until it recovers. */
  exhausted = false;
  inGas = false;
  invulnerable = false;
  private sinceStaminaUse = 0;
  private deathCause = '';

  get dead() {
    return this.health <= 0;
  }

  get causeOfDeath() {
    return this.deathCause;
  }

  update(dt: number, inGas: boolean) {
    this.inGas = inGas;
    this.hunger = Math.max(0, this.hunger - (100 / HUNGER_SECONDS) * dt);
    if (this.hunger <= 0) this.damage(STARVING_DPS * dt, 'Starvation', true);

    if (inGas) {
      this.filter = Math.max(0, this.filter - FILTER_DRAIN_PER_SEC * dt);
      if (this.filter <= 0) this.damage(NO_FILTER_DPS * dt, 'Toxic gas', true);
    }

    this.sinceStaminaUse += dt;
    if (this.sinceStaminaUse >= STAMINA_REGEN_DELAY) {
      this.stamina = Math.min(this.max.stamina, this.stamina + STAMINA_REGEN * dt);
    }
    if (this.exhausted && this.stamina >= EXHAUSTED_RECOVER_AT) this.exhausted = false;
  }

  /** Drains stamina continuously (sprinting). Returns false once exhausted. */
  drainStamina(amount: number) {
    if (this.exhausted) return false;
    this.stamina = Math.max(0, this.stamina - amount);
    this.sinceStaminaUse = 0;
    if (this.stamina <= 0) this.exhausted = true;
    return true;
  }

  /** Spends a lump of stamina (dodging). Fails without spending if there isn't enough. */
  spendStamina(amount: number) {
    if (this.exhausted || this.stamina < amount) return false;
    this.stamina -= amount;
    this.sinceStaminaUse = 0;
    return true;
  }

  damage(amount: number, cause: string, bypassInvulnerable = false) {
    if (this.dead || amount <= 0) return;
    if (this.invulnerable && !bypassInvulnerable) return;
    this.health = clamp(this.health - amount, 0, this.max.health);
    if (amount >= 1) bus.emit('player:damaged', { amount });
    if (this.dead) this.deathCause = cause;
  }

  refill() {
    this.health = this.max.health;
    this.hunger = this.max.hunger;
    this.stamina = this.max.stamina;
    this.filter = this.max.filter;
    this.exhausted = false;
  }
}
