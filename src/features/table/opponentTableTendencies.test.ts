import { describe, expect, it } from 'vitest';

import { createMultiwaySessionHand } from '../../domain/poker/multiwaySession';
import type { MultiwayHandState, MultiwayPlayerState } from '../../domain/poker/multiway';
import {
  OPPONENT_TENDENCY_OPPORTUNITY_FLOOR,
  OPPONENT_TENDENCY_SAMPLE_FLOOR,
  deriveOpponentTableTendencies,
  emptyOpponentTableTendencies,
  opponentTendenciesAboveSampleFloor,
  opponentTendencyRate,
  opponentTendencyRateReady,
} from './opponentTableTendencies';

/**
 * P18-038 — the table-tendency derivation reads ONLY public actions from the
 * session's completed hands, floors its samples, and never touches hidden
 * state. These fixtures pin the public-information boundary and the floors.
 */

function handWith(history: Array<{ playerId: string; type: 'fold' | 'raise' | 'call' | 'check' | 'bet' }>, options: {
  activePlayerIds: string[];
  board?: 0 | 3 | 5;
  showdown?: boolean;
  foldedIds?: string[];
}): MultiwayHandState {
  const game = createMultiwaySessionHand(
    { handTarget: 2, startingStackBb: 100 },
    options.activePlayerIds.length as 3 | 6 | 9,
    () => 0.5,
    'club',
  );
  const board = options.board === 5
    ? [
      { rank: 2 as const, suit: 'clubs' as const },
      { rank: 7 as const, suit: 'diamonds' as const },
      { rank: 9 as const, suit: 'hearts' as const },
      { rank: 12 as const, suit: 'spades' as const },
      { rank: 14 as const, suit: 'clubs' as const },
    ]
    : options.board === 3
      ? [
        { rank: 2 as const, suit: 'clubs' as const },
        { rank: 7 as const, suit: 'diamonds' as const },
        { rank: 9 as const, suit: 'hearts' as const },
      ]
      : [];
  const historyFull = history.map((action, index) => ({
    ...action,
    amount: 0,
    street: 'preflop' as const,
    potAfter: 0,
    decisionContext: {
      board: [],
      currentBet: 0,
      effectiveStack: 100,
      initCallTolerance: undefined,
      limperCount: 0,
      opponentCount: options.activePlayerIds.length - 1,
      playerCount: options.activePlayerIds.length,
      playerStackBefore: 100,
      playerStreetBetBefore: 0,
      playersBehind: 0,
      potBefore: 0,
      preflopFacing: 'raised' as const,
      toCall: 0,
      legalActions: {
        canBet: true,
        canCall: true,
        canCheck: true,
        canFold: true,
        canRaise: true,
        raiseReopened: true,
      },
    } as never,
    index,
  }));
  const players: MultiwayHandState['players'] = {};
  for (const playerId of options.activePlayerIds) {
    const heroEntry = Object.entries(game.players).find(([id]) => id === 'hero');
    void heroEntry;
    players[playerId] = {
      ...game.players.hero,
      name: playerId,
      holeCards: [],
      folded: Boolean(options.foldedIds?.includes(playerId)),
      allIn: false,
    } as MultiwayPlayerState;
  }
  return {
    ...game,
    activePlayerIds: options.activePlayerIds,
    board,
    history: historyFull,
    outcome: options.showdown
      ? { awards: [], showdown: true, totalPot: 0, winnerPlayerIds: [] }
      : game.outcome,
    players,
  } as unknown as MultiwayHandState;
}

function sessionHand(game: MultiwayHandState) {
  return {
    clientId: 'c1',
    completedAt: '2026-09-02T00:00:00.000Z',
    game,
    coachResult: null,
    mode: 'multiway' as const,
  };
}

describe('table-specific opponent tendencies (P18-038)', () => {
  it('counts hands observed from dealt-in players only', () => {
    const hands = [sessionHand(handWith([], { activePlayerIds: ['hero', 'dex-pressure', 'iris-patient'] }))];
    const tendencies = deriveOpponentTableTendencies(hands);
    expect(tendencies.get('dex-pressure')!.handsObserved).toBe(1);
    expect(tendencies.get('iris-patient')!.handsObserved).toBe(1);
  });

  it('derives fold-to-3-bet from the public preflop ledger alone', () => {
    const hands = [sessionHand(handWith([
      { playerId: 'dex-pressure', type: 'raise' },
      { playerId: 'iris-patient', type: 'raise' },
      { playerId: 'dex-pressure', type: 'fold' },
      { playerId: 'iris-patient', type: 'call' },
    ], { activePlayerIds: ['hero', 'dex-pressure', 'iris-patient'], board: 0, showdown: false }))];
    const tendencies = deriveOpponentTableTendencies(hands);
    const dex = tendencies.get('dex-pressure')!;
    expect(dex.facedThreeBets).toBe(1);
    expect(dex.foldsFacingThreeBet).toBe(1);
    // Iris three-bet but was never re-raised: no opportunity, no rate.
    const iris = tendencies.get('iris-patient')!;
    expect(iris.facedThreeBets).toBe(0);
    expect(opponentTendencyRate(iris.foldsFacingThreeBet, iris.facedThreeBets)).toBeNull();
  });

  it('counts showdown frequency against flops seen, from public outcome only', () => {
    const showdownHand = sessionHand(handWith([], { activePlayerIds: ['hero', 'dex-pressure', 'iris-patient'], board: 5, showdown: true, foldedIds: ['iris-patient'] }));
    const flopHand = sessionHand(handWith([], { activePlayerIds: ['hero', 'dex-pressure', 'lena-sticky'], board: 3, showdown: false }));
    const flopHand2 = sessionHand(handWith([], { activePlayerIds: ['hero', 'dex-pressure', 'lena-sticky'], board: 3, showdown: false }));
    const tendencies = deriveOpponentTableTendencies([showdownHand, flopHand, flopHand2]);
    const dex = tendencies.get('dex-pressure')!;
    expect(dex.handsSeenFlop).toBe(3);
    expect(dex.showdowns).toBe(1);
    expect(opponentTendencyRate(dex.showdowns, dex.handsSeenFlop)).toBeCloseTo(1 / 3);
    // Iris folded before showdown: counted in the flop denominator, not showdowns.
    const iris = tendencies.get('iris-patient')!;
    expect(iris.handsSeenFlop).toBe(1);
    expect(iris.showdowns).toBe(0);
  });

  it('excludes preflop folders from the flop denominator (review finding 2)', () => {
    // The folder's preflop fold is public in the ledger, so when the board
    // lands they did NOT see the flop and must stay out of the denominator.
    const flopHand = sessionHand(handWith([
      { playerId: 'dex-pressure', type: 'raise' },
      { playerId: 'iris-patient', type: 'fold' },
      { playerId: 'dex-pressure', type: 'call' },
    ], { activePlayerIds: ['hero', 'dex-pressure', 'iris-patient'], board: 3, showdown: false }));
    const tendencies = deriveOpponentTableTendencies([flopHand]);
    const iris = tendencies.get('iris-patient')!;
    expect(iris.handsObserved).toBe(1);
    expect(iris.handsSeenFlop).toBe(0);
    expect(iris.showdowns).toBe(0);
    // The caller did see the flop.
    const dex = tendencies.get('dex-pressure')!;
    expect(dex.handsSeenFlop).toBe(1);
  });

  it('never reads hidden state: a dealt-in player with no public actions contributes counts only', () => {
    const hands = [sessionHand(handWith([], { activePlayerIds: ['hero', 'dex-pressure', 'iris-patient'], board: 0, showdown: false }))];
    const tendencies = deriveOpponentTableTendencies(hands);
    // Dealt-in with no public actions: only the observation count moves.
    expect(tendencies.get('dex-pressure')!).toEqual({
      facedThreeBets: 0,
      foldsFacingThreeBet: 0,
      handsObserved: 1,
      handsSeenFlop: 0,
      showdowns: 0,
    });
  });

  it('floors the section and the individual rates', () => {
    expect(OPPONENT_TENDENCY_SAMPLE_FLOOR).toBeGreaterThan(0);
    expect(OPPONENT_TENDENCY_OPPORTUNITY_FLOOR).toBeGreaterThan(0);
    const under = emptyOpponentTableTendencies();
    under.handsObserved = OPPONENT_TENDENCY_SAMPLE_FLOOR - 1;
    expect(opponentTendenciesAboveSampleFloor(under)).toBe(false);
    const over = { ...under, handsObserved: OPPONENT_TENDENCY_SAMPLE_FLOOR };
    expect(opponentTendenciesAboveSampleFloor(over)).toBe(true);
    expect(opponentTendencyRateReady(OPPONENT_TENDENCY_OPPORTUNITY_FLOOR - 1)).toBe(false);
    expect(opponentTendencyRateReady(OPPONENT_TENDENCY_OPPORTUNITY_FLOOR)).toBe(true);
  });

  it('ignores heads-up records when deriving multiway tendencies', () => {
    const tendencies = deriveOpponentTableTendencies([{
      clientId: 'c2',
      completedAt: '2026-09-02T00:00:00.000Z',
      game: {} as never,
      coachResult: null,
      mode: 'heads_up' as const,
    }]);
    expect(tendencies.size).toBe(0);
  });
});
