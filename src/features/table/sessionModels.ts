import type { GameState } from '../../domain/poker/types';
import type { MultiwayHandState } from '../../domain/poker/multiway';
import type { CoachResult } from '../../services/coach';

export interface HeadsUpSessionHandRecord {
  clientId: string;
  completedAt: string;
  game: GameState;
  coachResult: CoachResult | null;
  mode?: 'heads_up';
}

export interface MultiwaySessionHandRecord {
  clientId: string;
  completedAt: string;
  game: MultiwayHandState;
  coachResult: null;
  mode: 'multiway';
}

export type SessionHandRecord = HeadsUpSessionHandRecord | MultiwaySessionHandRecord;

export function isMultiwaySessionHandRecord(
  hand: SessionHandRecord,
): hand is MultiwaySessionHandRecord {
  return hand.mode === 'multiway';
}

export function headsUpSessionHands(
  hands: readonly SessionHandRecord[],
): HeadsUpSessionHandRecord[] {
  return hands.filter((hand): hand is HeadsUpSessionHandRecord => !isMultiwaySessionHandRecord(hand));
}
