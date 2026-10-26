import type { FoodBuffDef } from '../data/items';

/** One active food buff. Eating again replaces it (no stacking). */
export interface ActiveBuff {
  readonly def: FoodBuffDef;
  remaining: number;
}

export function applyFoodBuff(_current: ActiveBuff | null, def: FoodBuffDef): ActiveBuff {
  return { def, remaining: def.duration };
}

export function tickBuff(buff: ActiveBuff | null, dt: number): ActiveBuff | null {
  if (!buff) return null;
  buff.remaining -= dt;
  return buff.remaining > 0 ? buff : null;
}

export function buffMove(buff: ActiveBuff | null): number {
  return buff?.def.moveSpeed ?? 1;
}

export function buffStaminaRegen(buff: ActiveBuff | null): number {
  return buff?.def.staminaRegen ?? 1;
}

export function buffStaminaMax(buff: ActiveBuff | null): number {
  return buff?.def.staminaMax ?? 1;
}

export function buffMelee(buff: ActiveBuff | null): number {
  return buff?.def.melee ?? 1;
}

export function buffMaxHealth(buff: ActiveBuff | null): number {
  return buff?.def.maxHealth ?? 1;
}

export function buffHealPerSecond(buff: ActiveBuff | null): number {
  return buff?.def.healPerSecond ?? 0;
}

export function buffFilterResist(buff: ActiveBuff | null): number {
  return buff?.def.filterResist ?? 0;
}

export function buffReload(buff: ActiveBuff | null): number {
  return buff?.def.reload ?? 1;
}

export function buffAim(buff: ActiveBuff | null): number {
  return buff?.def.aim ?? 1;
}
