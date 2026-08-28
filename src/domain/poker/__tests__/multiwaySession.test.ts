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
  multiwayTablePlayerCountIsSupported,
  multiwayTablePlayerCountOptionsForDifficulty,
  tablePlayerCountOptionsForDifficulty,
  seededMultiwayDecisionRandom,
  summarizeMultiwaySession,
  TABLE_PLAYER_COUNT_OPTIONS,
  type MultiwayTablePlayerCount,
} from '../multiwaySession';
import type { AiDifficulty } from '../aiProfiles';
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
    expect(TABLE_PLAYER_COUNT_OPTIONS).toEqual([2, 3, 6, 9]);
  });

  it('seats a hero plus eight distinct named opponents at nine seats', () => {
    const players = createMultiwayTablePlayers(9, 1_600);
    expect(players).toHaveLength(9);
    expect(players.map((player) => player.seat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(players.map((player) => player.stack)).toEqual(players.map(() => 1_600));
    expect(players[0]).toMatchObject({ id: 'hero', name: 'You', seat: 0, isHero: true });
    const names = players.map((player) => player.name);
    expect(new Set(names).size).toBe(9);
    expect(names).toEqual(['You', 'Mara', 'Theo', 'Nova', 'June', 'Sol', 'Yoyo', 'Auntie Chi', 'Milo']);
  });

  it('keeps nine-seat lineups deterministic for a fixed identity offset', () => {
    const first = createMultiwayTablePlayers(9, 800, 'club', 4);
    const second = createMultiwayTablePlayers(9, 800, 'club', 4);
    expect(second.map((player) => player.name)).toEqual(first.map((player) => player.name));
    // A nine-seat window may wrap the roster without repeating a name.
    const wrapped = createMultiwayTablePlayers(9, 800, 'club', 6);
    const wrappedNames = wrapped.map((player) => player.name);
    expect(new Set(wrappedNames).size).toBe(9);
    expect(wrappedNames).toContain('Steve');
    expect(wrappedNames).toContain('Kai');
  });

  it('offers nine seats at every difficulty because each roster holds eight distinct names', () => {
    const difficulties: AiDifficulty[] = ['friendly', 'club', 'sharp', 'elite', 'nemesis'];
    difficulties.forEach((difficulty) => {
      expect(multiwayTablePlayerCountIsSupported(9, difficulty), difficulty).toBe(true);
      expect(multiwayTablePlayerCountOptionsForDifficulty(difficulty), difficulty).toEqual([3, 6, 9]);
      expect(tablePlayerCountOptionsForDifficulty(difficulty), difficulty).toEqual([2, 3, 6, 9]);
      expect(() => createMultiwayTablePlayers(9, 800, difficulty, 0)).not.toThrow();
    });
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

  it.each([3, 6, 9] as MultiwayTablePlayerCount[])('plays and advances a complete %i-player session with conserved chips', (playerCount) => {
    const startingTotal = playerCount * config.startingStackBb * 20;
    const completed: MultiwayHandState[] = [];
    let game = createMultiwaySessionHand(config, playerCount, seededRandom(210 + playerCount));
    for (let hand = 0; hand < 3; hand += 1) {
      game = finishHand(game);
      completed.push(game);
      const total = game.tablePlayerIds.reduce((sum, playerId) => sum + (game.players[playerId]?.stack ?? 0), 0);
      expect(total).toBe(startingTotal);
      // The settled pot is fully paid out to seated players — main and side pots
      // alike — and leaves nothing stranded, so no seat can quietly keep or lose
      // chips at a table this wide.
      const outcome = game.outcome;
      expect(outcome).toBeDefined();
      expect(game.pot).toBe(0);
      const paidOut = Object.values(
        (outcome?.awards ?? []).reduce<Record<string, number>>((totals, award) => {
          Object.entries(award.shares).forEach(([playerId, amount]) => {
            totals[playerId] = (totals[playerId] ?? 0) + amount;
          });
          return totals;
        }, {}),
      ).reduce((sum, amount) => sum + amount, 0);
      expect(paidOut).toBe(outcome?.totalPot ?? -1);
      expect((outcome?.awards ?? []).every((award) => Object.keys(award.shares)
        .every((playerId) => game.tablePlayerIds.includes(playerId)))).toBe(true);
      expect((outcome?.awards ?? []).some((award) => award.kind === 'main')).toBe(true);
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

  it('keeps each AI action above the readable bubble floor', () => {
    const game = createMultiwaySessionHand(config, 6, seededRandom(82));
    const delays = game.tablePlayerIds
      .filter((playerId) => playerId !== 'hero')
      .map((playerId) => multiwayAiPacingMs(game, playerId));
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(1_100);
    expect(Math.max(...delays)).toBeLessThanOrEqual(1_450);
    const raised = applyMultiwayAction(game, game.toAct!, { type: 'raise', amount: 60 });
    expect(multiwayAiPacingMs(raised, raised.toAct!)).toBeGreaterThanOrEqual(1_400);
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
      .toBeGreaterThan(multiwayAiPacingMs(afterFold, afterFold.toAct!) + 250);
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
    expect(brisk).toBeGreaterThanOrEqual(800);
    expect(normal).toBeGreaterThanOrEqual(1_100);
    expect(relaxed).toBeGreaterThanOrEqual(1_450);
    expect(multiwayAiPacingMs(game, playerId)).toBe(normal);
  });

  it('gives later streets and larger pots more consideration time', () => {
    const game = createMultiwaySessionHand(config, 6, seededRandom(82));
    const playerId = game.toAct!;
    const flop = {
      ...game,
      currentBet: 0,
      pot: 80,
      street: 'flop' as const,
    };
    const river = {
      ...flop,
      pot: 640,
      street: 'river' as const,
    };

    expect(multiwayAiPacingMs(river, playerId))
      .toBeGreaterThan(multiwayAiPacingMs(flop, playerId) + 300);
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
