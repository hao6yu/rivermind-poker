import type { GameState } from '../../domain/poker/types';
import type { CoachResult } from '../../services/coach';

export interface SessionHandRecord {
  clientId: string;
  completedAt: string;
  game: GameState;
  coachResult: CoachResult | null;
}
