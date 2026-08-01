import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { createHand } from '../engine';
import {
  createFairHeadsUpDecisionState,
  createFairMultiwayDecisionState,
} from '../fairness';
import { createMultiwayHand } from '../multiway';
import { createMultiwayTablePlayers } from '../multiwaySession';

describe('fair decision views', () => {
  it('gives a heads-up opponent only its own cards and public state', () => {
    const game = createHand({ random: seededRandom(31) });
    const view = createFairHeadsUpDecisionState(game, 'villain');
    expect(view.players.villain.holeCards).toHaveLength(2);
    expect(view.players.hero.holeCards).toEqual([]);
    expect(view.deck).toEqual([]);
    expect(view.board).toEqual(game.board);
    expect(view.outcome).toBeUndefined();
  });

  it('removes every other hand and the undealt deck from a six-player AI view', () => {
    const game = createMultiwayHand({
      players: createMultiwayTablePlayers(6, 2_000),
      buttonSeat: 4,
      random: seededRandom(32),
    });
    const view = createFairMultiwayDecisionState(game, 'ai-3');
    expect(view.players['ai-3']?.holeCards).toHaveLength(2);
    expect(view.deck).toEqual([]);
    expect(view.outcome).toBeUndefined();
    view.tablePlayerIds.filter((playerId) => playerId !== 'ai-3').forEach((playerId) => {
      expect(view.players[playerId]?.holeCards).toEqual([]);
    });
  });
});
