import type { EnemyId } from '../data/enemies';
import type { ItemAmount } from '../data/loot';
import type { BestGun } from '../data/score';

export type ToastTone = 'info' | 'warn' | 'danger' | 'toxic';

/** `cleared` = fought and won, `held` = defences won without you, `breached` = they got in. */
export type RaidResult = 'cleared' | 'held' | 'breached';

/** What a raid pays out. A list so unlocks and other rewards can join later. */
export type RewardEntry =
  | { kind: 'score'; points: number }
  | { kind: 'cache'; items: ItemAmount[] }
  | { kind: 'reveal'; count: number };

export interface GameEvents {
  toast: { text: string; tone?: ToastTone };
  'camera:shake': { amount: number };
  'player:dodge': { x: number; z: number };
  'player:interact': { id: string };
  'zone:changed': { inside: boolean };
  /** Something loud happened. `attention` feeds the horde meter; roamers within `radius` investigate. */
  noise: { x: number; z: number; attention: number; radius: number };
  /** The horde meter crossed a threshold (percent). */
  'horde:stir': { level: number };
  /** The siren was cranked; the raid lands in `seconds`. */
  'raid:calling': { seconds: number; night: boolean };
  /** Attention hit 100%: a forced raid lands in `seconds`. */
  'raid:inbound': { seconds: number };
  /** `away` = the player is outside the Home Zone when the warning sounds. */
  'raid:warning': { seconds: number; away: boolean };
  'raid:start': { raid: number };
  /** The raid is being fought without the player (`left` = they walked away mid-raid). */
  'raid:siege': { raid: number; reason: 'away' | 'left' };
  /** The player came back to a siege; the rest of the wave is now real. */
  'raid:engage': { raid: number; left: number };
  'raid:end': { raid: number; result: RaidResult; points: number };
  'raid:reward': { raid: number; entries: readonly RewardEntry[] };
  'enemy:killed': { id: EnemyId };
  'build:placed': { id: string };
  'gun:assembled': BestGun;
  'recipe:made': { id: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const handler of set) (handler as Handler<E[K]>)(payload);
  }
}

export const events = new EventBus<GameEvents>();
