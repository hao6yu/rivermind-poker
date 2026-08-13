import { describe, expect, it } from 'vitest';

import { createMultiwayHand, applyMultiwayAction, type MultiwayHandState } from '../../domain/poker/multiway';
import {
  englishMessages,
  simplifiedChineseMessages,
  type MessageKey,
} from '../../localization/messages';
import type { TranslationValues } from '../../localization/core';
import {
  buildMultiplayerResultPresentation,
  buildMultiplayerActionBubblePresentation,
  buildLocalizedPokerActionBubblePresentation,
  localizedMultiplayerHandDescription,
  multiplayerActionDurationMs,
  multiplayerActionPresentationIndexes,
  multiplayerActionLabel,
  multiplayerActionSeatLabel,
  type MultiplayerActionBubbleAction,
  multiplayerSeatRole,
  multiplayerSeatActionLabel,
} from './multiplayerGamePresentation';

const t = (key: MessageKey, values: TranslationValues = {}) => {
  const template = englishMessages[key];
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
};

const simplifiedT = (key: MessageKey, values: TranslationValues = {}) => {
  const template = simplifiedChineseMessages[key];
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : match
  ));
};

function headsUp(): MultiwayHandState {
  return createMultiwayHand({
    bigBlind: 20,
    buttonSeat: 0,
    players: [
      { id: 'host', name: 'Kai', seat: 0, stack: 2_000 },
      { id: 'guest', name: 'Iris', seat: 1, stack: 2_000 },
    ],
    random: () => 0.25,
    smallBlind: 10,
  });
}

function threeWay(): MultiwayHandState {
  return createMultiwayHand({
    bigBlind: 20,
    buttonSeat: 0,
    players: [
      { id: 'host', name: 'Kai', seat: 0, stack: 2_000 },
      { id: 'guest', name: 'Iris', seat: 1, stack: 2_000 },
      { id: 'viewer', name: 'Dex', seat: 2, stack: 2_000 },
    ],
    random: () => 0.25,
    smallBlind: 10,
  });
}

describe('multiplayer game presentation', () => {
  it('shows only dealer and blind badges, with dealer winning heads-up overlap', () => {
    const hand = headsUp();

    expect(multiplayerSeatRole(hand, hand.buttonPlayerId)).toBe('D');
    expect(multiplayerSeatRole(hand, hand.bigBlindPlayerId)).toBe('BB');
    expect(multiplayerSeatRole(hand, 'missing-player')).toBeNull();
  });

  it('hides UTG, hijack, and cutoff labels on a six-player table', () => {
    const hand = createMultiwayHand({
      bigBlind: 20,
      buttonSeat: 0,
      players: Array.from({ length: 6 }, (_, seat) => ({
        id: `player-${seat}`,
        name: `Player ${seat}`,
        seat,
        stack: 2_000,
      })),
      random: () => 0.25,
      smallBlind: 10,
    });

    expect(hand.tablePlayerIds.map((playerId) => multiplayerSeatRole(hand, playerId)).filter(Boolean).sort())
      .toEqual(['BB', 'D', 'SB']);
  });

  it('accelerates action batches while keeping a single action readable', () => {
    expect(multiplayerActionDurationMs(1)).toBe(1_600);
    expect(multiplayerActionDurationMs(3)).toBe(1_600);
    expect(multiplayerActionDurationMs(6)).toBe(1_300);
    expect(multiplayerActionDurationMs(20)).toBe(1_100);
  });

  it('compacts only exceptional automated runouts without hiding a normal table round', () => {
    expect(multiplayerActionPresentationIndexes(6)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(multiplayerActionPresentationIndexes(20)).toEqual([0, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('localizes evaluator hand descriptions for result copy', () => {
    expect(localizedMultiplayerHandDescription('Two pair', simplifiedT)).toBe('两对');
    expect(localizedMultiplayerHandDescription('Pair of Aces', simplifiedT)).toBe('一对 A');
    expect(localizedMultiplayerHandDescription('High card, ace-high', simplifiedT)).toBe('A 高牌');
  });

  it('labels every public action relative to the current viewer', () => {
    let hand = headsUp();
    hand = applyMultiwayAction(hand, 'host', { amount: 60, type: 'raise' });
    expect(multiplayerSeatActionLabel(hand, 'host', t)).toBe('Raise to 60');
    hand = applyMultiwayAction(hand, 'guest', { type: 'call' });

    expect(multiplayerActionLabel(hand, hand.history[0]!, 'host', t)).toBe('You raised to 60');
    expect(multiplayerActionLabel(hand, hand.history[1]!, 'host', t)).toBe('Iris called 40');
    expect(hand.street).toBe('flop');
    expect(multiplayerSeatActionLabel(hand, 'host', t)).toBeNull();
    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBeNull();
  });

  it('shows exact current-street actions and resets them on every new street', () => {
    const hand = headsUp();
    hand.street = 'flop';
    hand.history.push({ amount: 0, playerId: 'host', potAfter: 40, street: 'flop', type: 'check' });
    expect(multiplayerSeatActionLabel(hand, 'host', t)).toBe('Check');

    hand.history.push({ amount: 45, playerId: 'guest', potAfter: 85, street: 'flop', type: 'raise' });
    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBe('Bet 45');

    hand.history.push(
      { amount: 120, playerId: 'host', potAfter: 205, street: 'flop', type: 'raise' },
      { amount: 75, playerId: 'guest', potAfter: 280, street: 'flop', type: 'call' },
    );

    expect(multiplayerSeatActionLabel(hand, 'host', t)).toBe('Raise to 120');
    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBe('Call 75');

    hand.street = 'turn';
    expect(multiplayerSeatActionLabel(hand, 'host', t)).toBeNull();
    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBeNull();

    hand.history.push({
      amount: 200,
      playerId: 'guest',
      potAfter: 480,
      street: 'turn',
      type: 'raise',
    });
    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBe('Bet 200');
  });

  it('keeps a queued historical frame aligned with its compact seat label', () => {
    const hand = headsUp();
    const preflopCall = {
      amount: 10,
      playerId: 'guest',
      potAfter: 40,
      street: 'preflop' as const,
      type: 'call' as const,
    };
    hand.history.push(preflopCall, {
      amount: 0,
      playerId: 'host',
      potAfter: 40,
      street: 'flop',
      type: 'check',
    });
    hand.street = 'flop';

    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBeNull();
    expect(multiplayerActionSeatLabel(hand, preflopCall, t, 0)).toBe('Call 10');
  });

  it('keeps human action bubbles factual, varied, and exact', () => {
    const hand = headsUp();
    const raise = {
      amount: 120,
      playerId: 'guest',
      potAfter: 180,
      street: 'preflop' as const,
      type: 'raise' as const,
    };
    hand.history.push(raise);

    expect(buildMultiplayerActionBubblePresentation(hand, raise, t, { variant: 0 })).toEqual({
      action: 'raise',
      emphasis: 'Raise',
      text: 'Raise to 120 · Price increased',
      tone: 'aggressive',
    });
    expect(buildMultiplayerActionBubblePresentation(hand, raise, t, { allIn: true, variant: 0 })).toEqual({
      action: 'raise',
      emphasis: 'Raise',
      text: 'Raise to 120 · Price increased · All-in',
      tone: 'all-in',
    });
  });

  it('offers four AI and three factual human variants for every action', () => {
    const actions: Array<{
      action: MultiplayerActionBubbleAction;
      canonical: string;
    }> = [
      { action: 'fold', canonical: 'Fold' },
      { action: 'check', canonical: 'Check' },
      { action: 'call', canonical: 'Call 1,257' },
      { action: 'bet', canonical: 'Bet 1,257' },
      { action: 'raise', canonical: 'Raise to 1,257' },
    ];

    actions.forEach(({ action, canonical }) => {
      const aiVariants = Array.from({ length: 4 }, (_, variant) => (
        buildLocalizedPokerActionBubblePresentation(action, '1,257', t, {
          isAi: true,
          seed: 'ignored-by-preview-override',
          variant,
        }).text
      ));
      const humanVariants = Array.from({ length: 3 }, (_, variant) => (
        buildLocalizedPokerActionBubblePresentation(action, '1,257', t, {
          seed: 'ignored-by-preview-override',
          variant,
        }).text
      ));

      expect(new Set(aiVariants).size).toBe(4);
      expect(new Set(humanVariants).size).toBe(3);
      [...aiVariants, ...humanVariants].forEach((copy) => expect(copy).toContain(canonical));
    });
  });

  it('keeps check personality accurate even when checking closes the river', () => {
    const variants = Array.from({ length: 4 }, (_, variant) => (
      buildLocalizedPokerActionBubblePresentation('check', '0', t, {
        isAi: true,
        seed: 'river-closing-check',
        variant,
      }).text
    ));
    variants.forEach((copy) => {
      expect(copy).toContain('Check');
      expect(copy).not.toContain('see another');
      expect(copy).not.toContain('Your move');
    });
  });

  it('selects copy deterministically from stable action seeds without losing variety', () => {
    const stable = buildLocalizedPokerActionBubblePresentation('check', '0', t, {
      isAi: true,
      seed: 'hand-12:action-4:iris:check',
    });
    expect(buildLocalizedPokerActionBubblePresentation('check', '0', t, {
      isAi: true,
      seed: 'hand-12:action-4:iris:check',
    })).toEqual(stable);

    const varied = new Set(Array.from({ length: 32 }, (_, index) => (
      buildLocalizedPokerActionBubblePresentation('check', '0', t, {
        isAi: true,
        seed: `hand-${index}:action-${index % 7}:iris:check`,
      }).text
    )));
    expect(varied.size).toBe(4);
  });

  it('exposes the localized action keyword and keeps it inside all-in copy', () => {
    expect(buildLocalizedPokerActionBubblePresentation('raise', '1,250', simplifiedT, {
      allIn: true,
      isAi: true,
      seed: 'localized-all-in',
      variant: 2,
    })).toEqual({
      action: 'raise',
      emphasis: '加注',
      text: '来点刺激的 · 加注至 1,250 · 全下',
      tone: 'all-in',
    });
  });

  it('gives AI actions short personality while preserving the poker action', () => {
    const hand = headsUp();
    const actions = [
      { amount: 0, playerId: 'guest', potAfter: 30, street: 'flop' as const, type: 'check' as const },
      { amount: 40, playerId: 'guest', potAfter: 70, street: 'flop' as const, type: 'call' as const },
      { amount: 120, playerId: 'guest', potAfter: 190, street: 'preflop' as const, type: 'raise' as const },
      { amount: 0, playerId: 'guest', potAfter: 190, street: 'flop' as const, type: 'fold' as const },
    ];
    hand.history.push(...actions);

    expect(buildMultiplayerActionBubblePresentation(hand, actions[0]!, t, { isAi: true, variant: 0 }).text)
      .toBe('I’ll take a look · Check');
    expect(buildMultiplayerActionBubblePresentation(hand, actions[1]!, t, { isAi: true, variant: 1 }).text)
      .toBe('I want to see more · Call 40');
    expect(buildMultiplayerActionBubblePresentation(hand, actions[2]!, t, { isAi: true, variant: 0 }).text)
      .toBe('I push back · Raise to 120');
    expect(buildMultiplayerActionBubblePresentation(hand, actions[3]!, t, { isAi: true, variant: 1 }).text)
      .toBe('I’ll pass this one · Fold');
  });

  it('distinguishes an opening postflop bet and makes AI all-in copy explicit', () => {
    const hand = headsUp();
    const bet = {
      amount: 200,
      playerId: 'guest',
      potAfter: 240,
      street: 'turn' as const,
      type: 'raise' as const,
    };
    hand.history.push(bet);

    expect(buildMultiplayerActionBubblePresentation(hand, bet, t, {
      allIn: true,
      isAi: true,
      variant: 1,
    })).toEqual({
      action: 'bet',
      emphasis: 'Bet',
      text: 'I’ll build the pot · Bet 200 · All-in',
      tone: 'all-in',
    });
    expect(buildMultiplayerActionBubblePresentation(hand, bet, simplifiedT, {
      allIn: true,
      isAi: true,
      variant: 0,
    }).text).toBe('我先出招 · 下注 200 · 全下');
  });

  it('hides a fully refunded zero-chip bet from persistent seat status', () => {
    const hand = headsUp();
    hand.history.push({
      amount: 0,
      playerId: 'guest',
      potAfter: hand.pot,
      street: 'preflop',
      type: 'raise',
    });
    expect(multiplayerSeatActionLabel(hand, 'guest', t)).toBeNull();
  });

  it('explains a fold win and includes the actual payout', () => {
    let hand = headsUp();
    hand = applyMultiwayAction(hand, 'host', { type: 'fold' });

    const result = buildMultiplayerResultPresentation(hand, 'host', t);
    expect(result).toMatchObject({
      detail: 'Iris wins because everyone else folded.',
      headlineAmount: 20,
      showdown: false,
      title: 'Iris wins',
      totalPot: 20,
    });
    expect(result?.payouts).toEqual([{ amount: 20, label: 'Iris', playerId: 'guest' }]);
  });

  it('uses You when the viewer wins at showdown', () => {
    const hand = headsUp();
    hand.outcome = {
      awards: [{
        amount: 200,
        contributionCap: 100,
        eligiblePlayerIds: ['host', 'guest'],
        kind: 'main',
        shares: { host: 200 },
        winnerPlayerIds: ['host'],
      }],
      handDescriptions: { guest: 'a pair of kings', host: 'a flush' },
      showdown: true,
      totalPot: 200,
      winnerPlayerIds: ['host'],
    };

    expect(buildMultiplayerResultPresentation(hand, 'host', t)).toMatchObject({
      detail: 'You win the showdown with a flush.',
      headlineAmount: 200,
      title: 'You win',
      tone: 'win',
    });
  });

  it('treats a viewer side-pot payout as a share of the win, not a loss', () => {
    const hand = headsUp();
    hand.outcome = {
      awards: [
        {
          amount: 120,
          contributionCap: 60,
          eligiblePlayerIds: ['host', 'guest'],
          kind: 'main',
          shares: { host: 120 },
          winnerPlayerIds: ['host'],
        },
        {
          amount: 80,
          contributionCap: 100,
          eligiblePlayerIds: ['guest'],
          kind: 'side',
          shares: { guest: 80 },
          winnerPlayerIds: ['guest'],
        },
      ],
      handDescriptions: { guest: 'Pair of kings', host: 'a flush' },
      showdown: true,
      totalPot: 200,
      // The engine contract exposes main-pot winners here. Iris is deliberately
      // absent even though she receives the side pot above.
      winnerPlayerIds: ['host'],
    };

    expect(buildMultiplayerResultPresentation(hand, 'guest', t)).toEqual({
      detail: 'The hand was decided at showdown.',
      headlineAmount: 80,
      payouts: [
        { amount: 120, label: 'Kai', playerId: 'host' },
        { amount: 80, label: 'You', playerId: 'guest' },
      ],
      showdown: true,
      title: 'You win a share',
      tone: 'split',
      totalPot: 200,
    });
  });

  it('reports every side-pot recipient without assigning the final pot to one player', () => {
    const hand = threeWay();
    hand.outcome = {
      awards: [
        {
          amount: 300,
          contributionCap: 100,
          eligiblePlayerIds: ['host', 'guest', 'viewer'],
          kind: 'main',
          shares: { host: 300 },
          winnerPlayerIds: ['host'],
        },
        {
          amount: 200,
          contributionCap: 200,
          eligiblePlayerIds: ['guest', 'viewer'],
          kind: 'side',
          shares: { guest: 200 },
          winnerPlayerIds: ['guest'],
        },
      ],
      handDescriptions: { guest: 'Two pair', host: 'a straight' },
      showdown: true,
      totalPot: 500,
      winnerPlayerIds: ['host'],
    };

    expect(buildMultiplayerResultPresentation(hand, 'viewer', t)).toEqual({
      detail: 'The hand was decided at showdown.',
      headlineAmount: null,
      payouts: [
        { amount: 300, label: 'Kai', playerId: 'host' },
        { amount: 200, label: 'Iris', playerId: 'guest' },
      ],
      showdown: true,
      title: 'Kai / Iris win from the pot',
      tone: 'loss',
      totalPot: 500,
    });
  });
});
