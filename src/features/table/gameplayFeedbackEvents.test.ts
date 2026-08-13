import { describe, expect, it } from 'vitest';

import { seededRandom } from '../../domain/poker/cards';
import { resumeSitAndGo } from '../../domain/poker/tournament';
import {
  gameplayCueForAction,
  headsUpResultKind,
  isLiveBoardReveal,
  localActionPresentationPending,
  localTableFeedbackStep,
  localTerminalResultDelayMs,
  localTerminalResultSchedule,
  multiwayResultKind,
  planLocalTableFeedback,
} from './gameplayFeedbackEvents';

const context = {
  playerStackBefore: 80,
  playerStreetBetBefore: 20,
};

describe('table gameplay feedback events', () => {
  it('maps committed actions and distinguishes target raises from chips paid', () => {
    expect(gameplayCueForAction({ amount: 0, type: 'fold' })).toBe('fold');
    expect(gameplayCueForAction({ amount: 0, type: 'check' })).toBe('check');
    expect(gameplayCueForAction({ amount: 40, type: 'call', decisionContext: context })).toBe('call');
    expect(gameplayCueForAction({ amount: 75, type: 'raise', decisionContext: context })).toBe('raise');
    expect(gameplayCueForAction({ amount: 100, type: 'raise', decisionContext: context })).toBe('allIn');
    expect(gameplayCueForAction({ amount: 80, type: 'call', decisionContext: context })).toBe('allIn');
  });

  it('keeps old replay records without decision context on their visible action cue', () => {
    expect(gameplayCueForAction({ amount: 120, type: 'raise' })).toBe('raise');
  });

  it('maps result semantics from the viewer perspective', () => {
    expect(headsUpResultKind('hero')).toBe('win');
    expect(headsUpResultKind('villain')).toBe('loss');
    expect(headsUpResultKind('tie')).toBe('split');
    expect(multiwayResultKind({ awards: [{ shares: { hero: 100 } }] } as never)).toBe('win');
    expect(multiwayResultKind({ awards: [{ shares: { villain: 100 } }] } as never)).toBe('loss');
    expect(multiwayResultKind({
      awards: [
        { shares: { villain: 60 } },
        { shares: { hero: 160 } },
      ],
    } as never)).toBe('split');
  });

  it('only treats board growth within the same live hand as a reveal', () => {
    expect(isLiveBoardReveal(
      { boardCount: 0, handKey: 'session-a:1' },
      { boardCount: 3, handKey: 'session-a:1' },
    )).toBe(true);
    expect(isLiveBoardReveal(
      { boardCount: 5, handKey: 'session-a:1' },
      { boardCount: 3, handKey: 'session-a:2' },
    )).toBe(false);
    expect(isLiveBoardReveal(
      { boardCount: 3, handKey: 'session-a:1' },
      { boardCount: 3, handKey: 'session-a:1' },
    )).toBe(false);
  });

  it('locks a terminal result during the first render before its bubble effect commits', () => {
    expect(localActionPresentationPending({
      currentHandNumber: 2,
      currentHistoryLength: 5,
      hasVisibleAction: false,
      observedHandNumber: 2,
      observedHistoryLength: 4,
    })).toBe(true);
    expect(localActionPresentationPending({
      currentHandNumber: 2,
      currentHistoryLength: 5,
      hasVisibleAction: true,
      observedHandNumber: 2,
      observedHistoryLength: 5,
    })).toBe(true);
    expect(localActionPresentationPending({
      currentHandNumber: 2,
      currentHistoryLength: 5,
      hasVisibleAction: false,
      observedHandNumber: 2,
      observedHistoryLength: 5,
    })).toBe(false);
  });

  it('orders a street reveal after its action and suppresses a simultaneous viewer cue', () => {
    const steps = planLocalTableFeedback({
      action: { cue: 'raise', eventId: 'hand-1:action-2', viewerActed: true },
      boardRevealed: true,
      result: null,
      viewerTurnReady: true,
    });

    expect(steps.map((step) => step.kind)).toEqual(['action', 'streetReveal']);
    expect(localTableFeedbackStep(steps, 'action')).toMatchObject({ delayMs: 0, haptic: true });
    expect(localTableFeedbackStep(steps, 'streetReveal')).toMatchObject({ haptic: false });
    expect(localTableFeedbackStep(steps, 'streetReveal')?.delayMs).toBeGreaterThan(300);
    expect(localTableFeedbackStep(steps, 'viewerTurn')).toBeNull();
  });

  it('gives the street or viewer cue the sole haptic after an AI action', () => {
    const streetSteps = planLocalTableFeedback({
      action: { cue: 'call', eventId: 'hand-2:action-3', viewerActed: false },
      boardRevealed: true,
      result: null,
      viewerTurnReady: false,
    });
    expect(localTableFeedbackStep(streetSteps, 'action')?.haptic).toBe(false);
    expect(localTableFeedbackStep(streetSteps, 'streetReveal')?.haptic).toBe(true);

    const turnSteps = planLocalTableFeedback({
      action: { cue: 'check', eventId: 'hand-2:action-4', viewerActed: false },
      boardRevealed: false,
      result: null,
      viewerTurnReady: true,
    });
    expect(localTableFeedbackStep(turnSteps, 'viewerTurn')).toMatchObject({ haptic: true });
    expect(localTableFeedbackStep(turnSteps, 'viewerTurn')?.delayMs).toBeGreaterThan(200);
  });

  it('lets a result own the only haptic and removes board and viewer follow-ups', () => {
    const steps = planLocalTableFeedback({
      action: { cue: 'allIn', eventId: 'hand-3:action-5', viewerActed: true },
      boardRevealed: true,
      result: 'win',
      viewerTurnReady: true,
    });

    expect(steps).toEqual([
      { delayMs: 0, haptic: false, kind: 'action' },
      { delayMs: 0, haptic: true, kind: 'handResult' },
    ]);
  });

  it('orders a blind-only short-stack result after the deal cue', () => {
    const blindOnlyHand = resumeSitAndGo({
      aiDifficulty: 'club',
      lastButtonSeat: 1,
      nextHandNumber: 2,
      players: [
        { id: 'hero', isHero: true, name: 'You', seat: 0, stack: 5 },
        { id: 'ai-1', name: 'Iris', seat: 1, stack: 1_000 },
        { id: 'ai-2', name: 'Dex', seat: 2, stack: 0 },
      ],
      savedAt: '2026-08-12T00:00:00.000Z',
      version: 1,
    }, seededRandom(110));
    expect(blindOnlyHand.history).toHaveLength(0);
    expect(blindOnlyHand.board).toHaveLength(5);
    expect(blindOnlyHand.outcome).not.toBeNull();

    const steps = planLocalTableFeedback({
      action: null,
      boardRevealed: true,
      deal: { eventId: 'short-stack:2:deal' },
      result: multiwayResultKind(blindOnlyHand.outcome!),
      viewerTurnReady: false,
    });
    expect(steps.map((step) => step.kind)).toEqual(['newHand', 'handResult']);
    expect(localTableFeedbackStep(steps, 'newHand')).toEqual({
      delayMs: 0,
      haptic: false,
      kind: 'newHand',
    });
    expect(localTableFeedbackStep(steps, 'handResult')).toMatchObject({ haptic: true });
    expect(localTableFeedbackStep(steps, 'handResult')?.delayMs).toBeGreaterThan(500);
  });

  it('plays an unopposed viewer-turn cue immediately with one haptic', () => {
    expect(planLocalTableFeedback({
      action: null,
      boardRevealed: false,
      result: null,
      viewerTurnReady: true,
    })).toEqual([{ delayMs: 0, haptic: true, kind: 'viewerTurn' }]);
  });

  it('never assigns more than one haptic owner to an engine transition', () => {
    const transitions = [
      { action: { cue: 'raise' as const, eventId: 'a', viewerActed: true }, boardRevealed: true, result: null, viewerTurnReady: true },
      { action: { cue: 'call' as const, eventId: 'b', viewerActed: false }, boardRevealed: false, result: null, viewerTurnReady: true },
      { action: { cue: 'allIn' as const, eventId: 'c', viewerActed: true }, boardRevealed: true, result: 'loss' as const, viewerTurnReady: false },
      { action: null, boardRevealed: true, result: null, viewerTurnReady: true },
      { action: null, boardRevealed: true, deal: { eventId: 'd' }, result: 'win' as const, viewerTurnReady: false },
    ];

    transitions.forEach((transition) => {
      expect(planLocalTableFeedback(transition).filter((step) => step.haptic)).toHaveLength(1);
    });
  });

  it('holds a terminal result for the readable action presentation', () => {
    expect(localTerminalResultDelayMs({
      hasCommittedAction: true,
      presentationDurationMs: 1_450,
    })).toBe(1_450);
    expect(localTerminalResultDelayMs({
      hasCommittedAction: false,
      presentationDurationMs: 1_450,
    })).toBe(0);
  });

  it('enqueues terminal feedback on the first render while its action is still visible', () => {
    const presentationPending = localActionPresentationPending({
      currentHandNumber: 4,
      currentHistoryLength: 7,
      hasVisibleAction: false,
      observedHandNumber: 4,
      observedHistoryLength: 6,
    });
    expect(presentationPending).toBe(true);
    expect(localTerminalResultSchedule({
      hasCommittedAction: true,
      hasOutcome: true,
      presentationDurationMs: 1_450,
    })).toEqual({ delayMs: 1_450 });
    expect(localTerminalResultSchedule({
      hasCommittedAction: false,
      hasOutcome: false,
      presentationDurationMs: 1_450,
    })).toBeNull();
  });
});
