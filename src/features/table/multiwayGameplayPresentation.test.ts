import { describe, expect, it } from 'vitest';

import { createDeck, seededRandom } from '../../domain/poker/cards';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../../domain/poker/multiway';
import {
  createMultiwaySessionHand,
  decideSessionAiAction,
  seededMultiwayDecisionRandom,
} from '../../domain/poker/multiwaySession';
import type { PlayerAction } from '../../domain/poker/types';
import {
  buildMultiwayReplaySteps,
  buildMultiwayResultSummary,
  multiwayHeroStackBeforeHand,
  multiwayRecentActionLabels,
  multiwayReplayStepForHeroDecision,
  multiwaySeatPlacements,
  visibleMultiwayAiThinking,
} from './multiwayGameplayPresentation';

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
    expect(summary?.pot).toMatch(/BB$/);
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
      `${firstName} bets 3 BB`,
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
