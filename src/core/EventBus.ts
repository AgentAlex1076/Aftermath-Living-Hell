import type { EnemyId } from '../data/enemies';
import type { BestGun } from '../data/score';

export type ToastTone = 'info' | 'warn' | 'danger' | 'toxic';

export interface GameEvents {
  toast: { text: string; tone?: ToastTone };
  'camera:shake': { amount: number };
  'player:dodge': { x: number; z: number };
  'player:interact': { id: string };
  'zone:changed': { inside: boolean };
  'raid:warning': { seconds: number };
  'raid:start': { raid: number };
  'raid:end': { raid: number };
  'raid:penalty': { reason: 'timer' | 'left' };
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
