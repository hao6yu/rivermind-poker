import type { SessionHandRecord } from './sessionModels';
import { isMultiwaySessionHandRecord } from './sessionModels';

/**
 * P18-038 (S12) — table-specific public opponent tendencies.
 *
 * Derived ONLY from the public action ledger of the hands already completed at
 * THIS table in THIS session (the device-local session record). Nothing here
 * reads hidden cards, deck state, or any persona/strategy data: the three
 * tendencies are what any observer at the table could count.
 *
 *  - handsObserved: hands the player was dealt into.
 *  - fold-to-3-bet: of the player's preflop raises that were re-raised before
 *    action returned (they faced a 3-bet), the share they folded.
 *  - showdown frequency: of the dealt-in hands that reached a flop, the share
 *    where the player was still in at showdown.
 *
 * Sample floors keep the numbers honest: a tendency renders only when its own
 * opportunity count clears `OPPONENT_TENDENCY_OPPORTUNITY_FLOOR`, and the
 * section itself only when `handsObserved` clears
 * `OPPONENT_TENDENCY_SAMPLE_FLOOR`. Below a floor the UI shows the sample
 * progress, never a rate.
 */

export const OPPONENT_TENDENCY_SAMPLE_FLOOR = 8;
export const OPPONENT_TENDENCY_OPPORTUNITY_FLOOR = 3;

export interface OpponentTableTendencies {
  /** Preflop raises by this player that were re-raised before action returned. */
  facedThreeBets: number;
  /** Of those, how many ended in a fold. */
  foldsFacingThreeBet: number;
  /** Hands this player was dealt into. */
  handsObserved: number;
  /** Dealt-in hands that reached a flop (the showdown-frequency denominator). */
  handsSeenFlop: number;
  /** Dealt-in hands where the player was still in at showdown. */
  showdowns: number;
}

export interface OpponentTendencySample {
  playerId: string;
  tendencies: OpponentTableTendencies;
}

export function emptyOpponentTableTendencies(): OpponentTableTendencies {
  return { facedThreeBets: 0, foldsFacingThreeBet: 0, handsObserved: 0, handsSeenFlop: 0, showdowns: 0 };
}

/**
 * Derive every player's table tendencies from the session's completed hands.
 * Private-table viewer archives and local multiway session records share the
 * same `SessionHandRecord` shape, so one derivation serves both tables.
 */
export function deriveOpponentTableTendencies(hands: readonly SessionHandRecord[]): Map<string, OpponentTableTendencies> {
  const byPlayer = new Map<string, OpponentTableTendencies>();
  const tendencyFor = (playerId: string): OpponentTableTendencies => {
    const existing = byPlayer.get(playerId);
    if (existing) return existing;
    const fresh = emptyOpponentTableTendencies();
    byPlayer.set(playerId, fresh);
    return fresh;
  };

  for (const hand of hands) {
    if (!isMultiwaySessionHandRecord(hand)) continue;
    const game = hand.game;
    const dealtIn = new Set(game.activePlayerIds);

    for (const playerId of dealtIn) {
      tendencyFor(playerId).handsObserved += 1;
    }

    // Preflop fold-to-3-bet: a raise by the player followed, before the player
    // acts again, by another raise on the same street.
    const preflop = game.history.filter((action) => action.street === 'preflop');
    preflop.forEach((action, index) => {
      if (action.type !== 'raise') return;
      const reRaised = preflop.slice(index + 1).some((later) => later.type === 'raise');
      if (!reRaised) return;
      const facing = tendencyFor(action.playerId);
      facing.facedThreeBets += 1;
      const playerFoldedAfter = preflop.slice(index + 1).find(
        (later) => later.playerId === action.playerId,
      );
      if (playerFoldedAfter?.type === 'fold') {
        facing.foldsFacingThreeBet += 1;
      }
    });

    // Showdown frequency: dealt-in hands that reached a flop, and of those the
    // hands where the player reached showdown (not folded when it landed).
    const sawFlop = game.board.length >= 3;
    if (sawFlop) {
      for (const playerId of dealtIn) {
        tendencyFor(playerId).handsSeenFlop += 1;
      }
    }
    if (game.outcome?.showdown) {
      for (const playerId of dealtIn) {
        const player = game.players[playerId];
        if (player && !player.folded) {
          tendencyFor(playerId).showdowns += 1;
        }
      }
    }
  }

  return byPlayer;
}

/** Whether the tendency section may render for this sample. */
export function opponentTendenciesAboveSampleFloor(tendencies: OpponentTableTendencies): boolean {
  return tendencies.handsObserved >= OPPONENT_TENDENCY_SAMPLE_FLOOR;
}

/** Whether one specific rate has enough opportunities to render. */
export function opponentTendencyRateReady(opportunities: number): boolean {
  return opportunities >= OPPONENT_TENDENCY_OPPORTUNITY_FLOOR;
}

export function opponentTendencyRate(successes: number, opportunities: number): number | null {
  if (!opponentTendencyRateReady(opportunities)) return null;
  return successes / opportunities;
}
