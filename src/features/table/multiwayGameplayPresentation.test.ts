import { describe, expect, it } from 'vitest';

import { createDeck, seededRandom } from '../../domain/poker/cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../../domain/poker/multiway';
import {
  createMultiwaySessionHand,
  decideSessionAiAction,
  multiwayPlayerAward,
  seededMultiwayDecisionRandom,
} from '../../domain/poker/multiwaySession';
import type { PlayerAction } from '../../domain/poker/types';
import { translate } from '../../localization/core';
import { buildLocalizedMultiwayResultSummary } from './localizedGameplay';
import {
  buildMultiwayReplaySteps,
  buildMultiwayResultSummary,
  multiwayActionBubbleDurationMs,
  multiwayActionRecordIsAllIn,
  multiwayHeroStackBeforeHand,
  multiwayReadableAiDelayMs,
  multiwayRecentActionLabels,
  multiwayReplayStepForHeroDecision,
  multiwaySeatActionBubblePlacement,
  multiwaySeatPlacements,
  multiwaySeatRoleBadge,
  visibleMultiwayAiThinking,
} from './multiwayGameplayPresentation';
import { formatChips } from '../../domain/poker/moneyFormat';

function finish(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  let guard = 0;
  while (!current.outcome && guard < 160) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Missing turn.');
    let action: PlayerAction;
    if (playerId === 'hero') {
      const legal = getMultiwayLegalActions(current, playerId);
      action = legal.canCheck ? { type: 'check' } : legal.canCall ? { type: 'call' } : { type: 'fold' };
    } else {
      action = decideSessionAiAction(current, playerId, 'club', seededMultiwayDecisionRandom(current, playerId)).action;
    }
    current = applyMultiwayAction(current, playerId, action);
    guard += 1;
  }
  return current;
}

function finishWithHeroFolding(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  let guard = 0;
  while (!current.outcome && guard < 160) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Missing turn.');
    const action: PlayerAction = playerId === 'hero'
      ? getMultiwayLegalActions(current, playerId).canFold ? { type: 'fold' } : { type: 'check' }
      : decideSessionAiAction(current, playerId, 'club', seededMultiwayDecisionRandom(current, playerId)).action;
    current = applyMultiwayAction(current, playerId, action);
    guard += 1;
  }
  return current;
}

describe('multiway gameplay presentation', () => {
  it('places three- and six-player seats at distinct table anchors', () => {
    const three = multiwaySeatPlacements(3, ['hero', 'ai-1', 'ai-2']);
    expect(three.map((seat) => seat.anchor)).toEqual(['top-left', 'top-right', 'hero']);

    const six = multiwaySeatPlacements(6, ['hero', 'ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5']);
    expect(new Set(six.map((seat) => seat.anchor)).size).toBe(6);
    expect(six.at(-1)).toEqual({ anchor: 'hero', playerId: 'hero' });
  });

  it('rejects incomplete seat maps before the UI can overlap or omit a player', () => {
    expect(() => multiwaySeatPlacements(6, ['hero', 'ai-1', 'ai-2'])).toThrow('every configured table player');
  });

  it('shows only dealer and blind corner badges, with dealer priority heads-up', () => {
    const hand = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 6, seededRandom(504));

    expect(multiwaySeatRoleBadge(hand, hand.buttonPlayerId)).toBe('D');
    expect(multiwaySeatRoleBadge(hand, hand.smallBlindPlayerId)).toBe('SB');
    expect(multiwaySeatRoleBadge(hand, hand.bigBlindPlayerId)).toBe('BB');
    expect(multiwaySeatRoleBadge(hand, hand.tablePlayerIds.find((playerId) => (
      playerId !== hand.buttonPlayerId
      && playerId !== hand.smallBlindPlayerId
      && playerId !== hand.bigBlindPlayerId
    )) ?? '')).toBeNull();

    expect(multiwaySeatRoleBadge({
      bigBlindPlayerId: 'villain',
      buttonPlayerId: 'hero',
      smallBlindPlayerId: 'hero',
    }, 'hero')).toBe('D');
  });

  it('anchors action bubbles away from the protected board lane', () => {
    expect(multiwaySeatActionBubblePlacement('top-left', true)).toBe('below');
    expect(multiwaySeatActionBubblePlacement('top-right', false)).toBe('above');
    expect(multiwaySeatActionBubblePlacement('top-center', false)).toBe('below');
    expect(multiwaySeatActionBubblePlacement('mid-left', false)).toBe('below');
    expect(multiwaySeatActionBubblePlacement('mid-left', true)).toBe('above');
    expect(multiwaySeatActionBubblePlacement('mid-right', true)).toBe('above');
    expect(multiwaySeatActionBubblePlacement('hero', false)).toBe('above');
  });

  it('keeps table action bubbles readable even at brisk pace', () => {
    expect(multiwayActionBubbleDurationMs('brisk')).toBe(1_350);
    expect(multiwayActionBubbleDurationMs('normal')).toBe(1_600);
    expect(multiwayActionBubbleDurationMs('relaxed')).toBe(2_000);
    expect(multiwayReadableAiDelayMs(220, true, 'brisk')).toBe(1_350);
    expect(multiwayReadableAiDelayMs(600, true, 'normal')).toBe(1_600);
    expect(multiwayReadableAiDelayMs(1_700, true, 'normal')).toBe(1_700);
    expect(multiwayReadableAiDelayMs(600, false, 'normal')).toBe(600);
  });

  it('derives all-in state from the authoritative pre-action stack', () => {
    const starting = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 3, seededRandom(508));
    const playerId = starting.toAct;
    if (!playerId) throw new Error('Expected an opening actor.');
    const legal = getMultiwayLegalActions(starting, playerId);
    const called = applyMultiwayAction(starting, playerId, { type: 'call' });
    const calledAction = called.history.at(-1);
    if (!calledAction) throw new Error('Expected a call record.');
    expect(multiwayActionRecordIsAllIn(calledAction)).toBe(false);

    const shoved = applyMultiwayAction(starting, playerId, { amount: legal.maxRaiseTo, type: 'raise' });
    const shoveAction = shoved.history.at(-1);
    if (!shoveAction) throw new Error('Expected a raise record.');
    expect(multiwayActionRecordIsAllIn(shoveAction)).toBe(true);
  });

  it('never shows a stale AI thinking state after action returns to the hero', () => {
    expect(visibleMultiwayAiThinking('ai-4', 'ai-4')).toBe('ai-4');
    expect(visibleMultiwayAiThinking('ai-4', 'hero')).toBeNull();
    expect(visibleMultiwayAiThinking('hero', 'hero')).toBeNull();
  });

  it('measures hand results from the stack before blinds were posted', () => {
    const hand = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 3, seededRandom(505));

    expect(multiwayHeroStackBeforeHand(hand)).toBe(800);
  });

  it('builds a concise result and complete replay without revealing cards early', () => {
    const starting = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 6, seededRandom(501));
    const completed = finish(starting);
    const summary = buildMultiwayResultSummary(completed, 800);
    const steps = buildMultiwayReplaySteps(completed);

    expect(completed.outcome).toBeDefined();
    expect(summary?.pot).toBe(formatChips(completed.outcome?.totalPot ?? 0));
    expect(summary?.pot).toMatch(/^\d{1,3}(,\d{3})*$/);
    expect(steps[0]?.kind).toBe('start');
    expect(steps.at(-1)?.kind).toBe('outcome');
    expect(steps.slice(0, -1).every((step) => !step.revealOpponentCards)).toBe(true);
    expect(steps.at(-1)?.stacks).toEqual(Object.fromEntries(
      completed.tablePlayerIds.map((playerId) => [playerId, completed.players[playerId]?.stack ?? 0]),
    ));
    expect(steps.every((step) => step.pot >= 0)).toBe(true);
    const firstHeroDecision = steps.findIndex((step) => step.heroDecisionSequence === 1);
    expect(firstHeroDecision).toBeGreaterThan(0);
    expect(multiwayReplayStepForHeroDecision(steps, 1)).toBe(firstHeroDecision);
  });

  it('headlines an opponent win with what that opponent won, not the hero delta', () => {
    // The result bar reads "<title> · <headlineAmount>" as one sentence, so the
    // amount has to belong to the same subject as the title. A hero who folds
    // without committing chips has a 0 delta; pairing that with "Sol wins"
    // reads as "Sol won 0" when Sol actually took the whole pot.
    const starting = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 6, seededRandom(501));
    const completed = finishWithHeroFolding(starting);
    const summary = buildMultiwayResultSummary(completed, multiwayHeroStackBeforeHand(starting));

    const winnerId = completed.outcome?.winnerPlayerIds[0] ?? '';
    expect(winnerId).not.toBe('hero');
    const winnerAward = multiwayPlayerAward(completed, winnerId);
    expect(winnerAward).toBeGreaterThan(0);
    expect(summary?.title).toContain('wins');
    expect(summary?.headlineAmount).toBe(formatChips(winnerAward));
  });

  it('headlines a hero win with the hero delta', () => {
    const starting = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 6, seededRandom(501));
    const completed = finish(starting);
    const summary = buildMultiwayResultSummary(completed, multiwayHeroStackBeforeHand(starting));

    if (!completed.outcome?.winnerPlayerIds.includes('hero')) return;
    expect(summary?.headlineAmount).toBe(summary?.heroDelta);
  });

  it('reports a side-pot recovery instead of a split when an opponent wins the main pot', () => {
    const starting = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 3, seededRandom(510));
    const opponentId = 'ai-1';
    const completed: MultiwayHandState = {
      ...starting,
      street: 'complete',
      pot: 0,
      players: {
        ...starting.players,
        hero: { ...starting.players.hero!, stack: 860, totalCommitted: 100 },
        [opponentId]: { ...starting.players[opponentId]!, stack: 60, totalCommitted: 20, allIn: true },
      },
      outcome: {
        awards: [
          {
            amount: 60,
            contributionCap: 20,
            eligiblePlayerIds: ['hero', opponentId],
            kind: 'main',
            shares: { [opponentId]: 60 },
            winnerPlayerIds: [opponentId],
          },
          {
            amount: 160,
            contributionCap: 100,
            eligiblePlayerIds: ['hero'],
            kind: 'side',
            shares: { hero: 160 },
            winnerPlayerIds: ['hero'],
          },
        ],
        handDescriptions: { hero: 'Flush', [opponentId]: 'Flush' },
        showdown: true,
        totalPot: 220,
        winnerPlayerIds: [opponentId],
      },
    };

    const summary = buildMultiwayResultSummary(completed, 800);

    expect(summary).toMatchObject({
      detail: `${starting.players[opponentId]?.name} wins with Flush.`,
      headlineAmount: '+60',
      title: 'You recover part of the pot',
      tone: 'loss',
    });
    expect(buildLocalizedMultiwayResultSummary(
      completed,
      800,
      (key, values) => translate('en', key, values),
    )).toMatchObject({
      detail: `${starting.players[opponentId]?.name} wins with Flush.`,
      headlineAmount: '+60',
      title: 'You recover part of the pot',
      tone: 'loss',
    });
  });

  it('keeps the last three actions from the current street in chronological order', () => {
    const game = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 3, seededRandom(506));
    const firstName = game.players['ai-1']?.name ?? 'AI 1';
    const secondName = game.players['ai-2']?.name ?? 'AI 2';
    const actionState: MultiwayHandState = {
      ...game,
      street: 'flop',
      history: [
        { playerId: 'hero', type: 'check', amount: 0, street: 'flop', potAfter: 60 },
        { playerId: 'ai-1', type: 'raise', amount: 60, street: 'flop', potAfter: 120 },
        { playerId: 'ai-2', type: 'fold', amount: 0, street: 'flop', potAfter: 120 },
      ],
    };

    expect(multiwayRecentActionLabels(actionState)).toEqual([
      'You check',
      `${firstName} bets 60`,
      `${secondName} folds`,
    ]);
  });

  it('replays an automatic all-in runout one street at a time', () => {
    const starting = createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, 3, seededRandom(509));
    const completed = finish(starting);
    const runoutOnly: MultiwayHandState = {
      ...completed,
      board: createDeck().slice(0, 5),
      history: completed.history.filter((action) => action.street === 'preflop'),
    };
    const dealSteps = buildMultiwayReplaySteps(runoutOnly).filter((step) => step.kind === 'deal');

    expect(dealSteps.map((step) => step.street)).toEqual(['flop', 'turn', 'river']);
    expect(dealSteps.map((step) => step.board.length)).toEqual([3, 4, 5]);
  });
});
