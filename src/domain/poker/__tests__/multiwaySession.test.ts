import { describe, expect, it } from 'vitest';

import { seededRandom } from '../cards';
import { applyMultiwayAction, createMultiwayHand, getMultiwayLegalActions, type MultiwayHandState } from '../multiway';
import {
  createMultiwaySessionHand,
  createMultiwayTablePlayers,
  createNextMultiwaySessionHand,
  decideSessionAiAction,
  multiwayAiPacingMs,
  multiwayIsWalk,
  multiwayLatestActionLabel,
  multiwayOutcomeMessage,
  multiwaySessionCompletionReason,
  seededMultiwayDecisionRandom,
  summarizeMultiwaySession,
  TABLE_PLAYER_COUNT_OPTIONS,
  type MultiwayTablePlayerCount,
} from '../multiwaySession';
import type { PracticeSessionConfig } from '../session';
import type { PlayerAction } from '../types';

const config: PracticeSessionConfig = { startingStackBb: 40, handTarget: 5 };

function heroAction(state: MultiwayHandState): PlayerAction {
  const legal = getMultiwayLegalActions(state, 'hero');
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall && legal.toCall <= state.bigBlind * 3) return { type: 'call' };
  return { type: 'fold' };
}

function finishHand(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  let guard = 0;
  while (!current.outcome && guard < 150) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('The hand has no player to act.');
    const action = playerId === 'hero'
      ? heroAction(current)
      : decideSessionAiAction(current, playerId, 'club', seededMultiwayDecisionRandom(current, playerId)).action;
    current = applyMultiwayAction(current, playerId, action);
    guard += 1;
  }
  if (!current.outcome) throw new Error('The multiway hand did not terminate.');
  return current;
}

describe('multiway practice session', () => {
  it('offers only the deliberately supported setup sizes', () => {
    expect(TABLE_PLAYER_COUNT_OPTIONS).toEqual([2, 3, 6]);
  });

  it('assigns stable named opponents without taking the hero seat', () => {
    expect(createMultiwayTablePlayers(3, 2_000).map(({ id, name, seat, stack }) => ({ id, name, seat, stack }))).toEqual([
      { id: 'hero', name: 'You', seat: 0, stack: 2_000 },
      { id: 'ai-1', name: 'Mara', seat: 1, stack: 2_000 },
      { id: 'ai-2', name: 'Theo', seat: 2, stack: 2_000 },
    ]);
    expect(createMultiwayTablePlayers(6, 800).map((player) => player.name)).toEqual([
      'You', 'Mara', 'Theo', 'Nova', 'June', 'Sol',
    ]);
    expect(createMultiwayTablePlayers(3, 800, 'friendly', 5).map((player) => player.name)).toEqual([
      'You', 'Yoyo', 'Auntie Chi',
    ]);
  });

  it.each([3, 6] as MultiwayTablePlayerCount[])('plays and advances a complete %i-player session with conserved chips', (playerCount) => {
    const startingTotal = playerCount * config.startingStackBb * 20;
    const completed: MultiwayHandState[] = [];
    let game = createMultiwaySessionHand(config, playerCount, seededRandom(210 + playerCount));
    for (let hand = 0; hand < 3; hand += 1) {
      game = finishHand(game);
      completed.push(game);
      const total = game.tablePlayerIds.reduce((sum, playerId) => sum + (game.players[playerId]?.stack ?? 0), 0);
      expect(total).toBe(startingTotal);
      expect(multiwayOutcomeMessage(game).length).toBeGreaterThan(8);
      if (multiwaySessionCompletionReason(game, config)) break;
      const previousButton = game.buttonPlayerId;
      game = createNextMultiwaySessionHand(game, seededRandom(400 + playerCount * 10 + hand));
      expect(game.buttonPlayerId).not.toBe(previousButton);
    }

    const summary = summarizeMultiwaySession(completed, config, 20);
    expect(summary.handsPlayed).toBe(completed.length);
    expect(summary.heroWins).toBeGreaterThanOrEqual(0);
    expect(summary.leaderStack).toBeGreaterThan(0);
  });

  it('ends a fixed session at its selected target', () => {
    const oneHand: PracticeSessionConfig = { startingStackBb: 40, handTarget: 1 };
    const completed = finishHand(createMultiwaySessionHand(oneHand, 3, seededRandom(99)));
    expect(multiwaySessionCompletionReason(completed, oneHand)).toBe('target');
  });

  it('lets the small blind fold and clearly explains a walk to the big blind', () => {
    let hand = createMultiwayHand({
      players: createMultiwayTablePlayers(6, 1_200),
      buttonSeat: 4,
      random: seededRandom(6_001),
    });

    while (!hand.outcome) {
      const playerId = hand.toAct;
      expect(playerId).not.toBeNull();
      if (!playerId) break;
      expect(playerId).not.toBe('hero');
      expect(getMultiwayLegalActions(hand, playerId).canFold).toBe(true);
      hand = applyMultiwayAction(hand, playerId, { type: 'fold' });
    }

    expect(hand.history.at(-1)?.playerId).toBe(hand.smallBlindPlayerId);
    expect(hand.outcome?.winnerPlayerIds).toEqual(['hero']);
    expect(multiwayIsWalk(hand)).toBe(true);
    expect(multiwayOutcomeMessage(hand)).toBe(
      'All 5 opponents fold before the flop. As the big blind, you win the blinds without acting.',
    );
  });

  it('keeps repeated AI decisions deterministic for one public hand state', () => {
    const game = createMultiwaySessionHand(config, 6, seededRandom(82));
    const playerId = game.toAct;
    expect(playerId).not.toBeNull();
    if (!playerId || playerId === 'hero') return;
    const first = decideSessionAiAction(game, playerId, 'sharp', seededMultiwayDecisionRandom(game, playerId));
    const second = decideSessionAiAction(game, playerId, 'sharp', seededMultiwayDecisionRandom(game, playerId));
    expect(second).toEqual(first);
  });

  it('keeps each AI action readable without making a full table drag', () => {
    const game = createMultiwaySessionHand(config, 6, seededRandom(82));
    const delays = game.tablePlayerIds
      .filter((playerId) => playerId !== 'hero')
      .map((playerId) => multiwayAiPacingMs(game, playerId));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(420);
    expect(Math.max(...delays)).toBeLessThanOrEqual(640);
    const raised = applyMultiwayAction(game, game.toAct!, { type: 'raise', amount: 60 });
    expect(multiwayAiPacingMs(raised, raised.toAct!)).toBeGreaterThan(650);
  });

  it('lets a raise settle for longer than a fold before the next player acts', () => {
    // The delay before a player acts is how long the PREVIOUS action stays on
    // screen, so a raise — the action a player most needs to register — has to
    // buy more of it than a fold does.
    const game = createMultiwaySessionHand(config, 6, seededRandom(82));
    const opener = game.toAct!;
    const afterFold = applyMultiwayAction(game, opener, { type: 'fold' });
    const afterRaise = applyMultiwayAction(game, opener, { type: 'raise', amount: 60 });

    expect(multiwayAiPacingMs(afterRaise, afterRaise.toAct!))
      .toBeGreaterThan(multiwayAiPacingMs(afterFold, afterFold.toAct!) + 150);
  });

  it('scales every delay with the table pace the player picked', () => {
    const game = createMultiwaySessionHand(config, 6, seededRandom(82));
    const playerId = game.toAct!;
    const brisk = multiwayAiPacingMs(game, playerId, 'brisk');
    const normal = multiwayAiPacingMs(game, playerId, 'normal');
    const relaxed = multiwayAiPacingMs(game, playerId, 'relaxed');

    expect(brisk).toBeLessThan(normal);
    expect(relaxed).toBeGreaterThan(normal);
    // Brisk still has to leave the action legible rather than snapping through.
    expect(brisk).toBeGreaterThanOrEqual(200);
    expect(multiwayAiPacingMs(game, playerId)).toBe(normal);
  });

  it('describes the first postflop wager as a bet and later aggression as a raise', () => {
    const game = createMultiwaySessionHand(config, 3, seededRandom(55));
    const firstOpponentName = game.players['ai-1']?.name;
    const secondOpponentName = game.players['ai-2']?.name;
    const openingBet = {
      ...game,
      street: 'flop' as const,
      history: [{ playerId: 'ai-1', type: 'raise' as const, amount: 60, street: 'flop' as const, potAfter: 140 }],
    };
    expect(multiwayLatestActionLabel(openingBet)).toBe(`${firstOpponentName} bets 60`);
    expect(multiwayLatestActionLabel({
      ...openingBet,
      history: [
        ...openingBet.history,
        { playerId: 'ai-2', type: 'raise', amount: 160, street: 'flop', potAfter: 320 },
      ],
    })).toBe(`${secondOpponentName} raises to 160`);
  });

  it('uses natural second-person copy for the hero action feed', () => {
    const game = createMultiwaySessionHand(config, 3, seededRandom(55));
    const heroOnButton = { ...game, buttonPlayerId: 'hero', history: [] };
    expect(multiwayLatestActionLabel(heroOnButton)).toContain('D You');
    expect(multiwayLatestActionLabel(heroOnButton)).toContain('SB');
    expect(multiwayLatestActionLabel(heroOnButton)).toContain('BB');
    expect(multiwayLatestActionLabel({
      ...game,
      history: [{ playerId: 'hero', type: 'call', amount: 20, street: 'preflop', potAfter: 60 }],
    })).toBe('You call 20');
  });
});
