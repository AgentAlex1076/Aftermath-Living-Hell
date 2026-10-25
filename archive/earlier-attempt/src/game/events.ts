import { EventBus } from '../core/EventBus';

export type PenaltyReason = 'timer' | 'left-during-raid';

export type GameEvents = {
  'raid:warning': { secondsLeft: number };
  'raid:start': { raidNumber: number };
  'raid:end': { raidNumber: number };
  'zone:penalty': { reason: PenaltyReason };
  'zone:changed': { inside: boolean };
  'player:damaged': { amount: number };
  'player:died': { cause: string };
};

export const bus = new EventBus<GameEvents>();
