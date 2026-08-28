import { describe, expect, it } from 'vitest';

import type { MultiplayerPublicTransition } from '../../domain/multiplayer/contracts';
import {
  advanceMultiplayerPresentationReadiness,
  advanceMultiplayerRealtimeFeedback,
  initialMultiplayerPresentationReadinessState,
  initialMultiplayerRealtimeFeedbackState,
  isLiveMultiplayerActionFrame,
  multiplayerActionFeedbackDelayMs,
  multiplayerActionFeedbackCue,
  multiplayerLatestLiveActionTransitionForHand,
  multiplayerLatestLiveTransitionForHand,
  multiplayerFollowupFeedbackDelayMs,
  multiplayerPresentationTransitionFromEnvelope,
  multiplayerRealtimeSyncPolicy,
  planMultiplayerFeedback,
  planMultiplayerFeedbackWhenReady,
  multiplayerFeedbackPlanKey,
  retainMultiplayerBoardFeedbackEvent,
  multiplayerPresentationLifecycleBoundary,
  multiplayerShouldCaptureLivePresentation,
  multiplayerResultFeedbackEventId,
  multiplayerResultFeedbackKind,
  multiplayerTimerWarningEventId,
  multiplayerTransitionIsCurrentFreshDeal,
  multiplayerTransitionMatchesHandTail,
  multiplayerVisibleTurnSeconds,
} from './multiplayerFeedback';

const transition = (overrides: Partial<MultiplayerPublicTransition> = {}): MultiplayerPublicTransition => ({
  acceptedAtMs: 100,
  actionBatch: [],
  commandId: 'command-1',
  kind: 'start',
  timeout: null,
  version: 4,
  ...overrides,
});

describe('multiplayer gameplay feedback events', () => {
  it('keeps controls locked and polling until a current subscribed sync succeeds', () => {
    expect(multiplayerRealtimeSyncPolicy({
      appActive: true,
      reseedPending: true,
      syncedOnCurrentSubscription: false,
      transportSubscribed: false,
    })).toEqual({ completeReseed: false, keepPolling: true });
    expect(multiplayerRealtimeSyncPolicy({
      appActive: true,
      reseedPending: true,
      syncedOnCurrentSubscription: false,
      transportSubscribed: true,
    })).toEqual({ completeReseed: false, keepPolling: true });
    expect(multiplayerRealtimeSyncPolicy({
      appActive: true,
      reseedPending: true,
      syncedOnCurrentSubscription: true,
      transportSubscribed: true,
    })).toEqual({ completeReseed: true, keepPolling: false });
  });

  it('does not poll or unlock from a background sync completion', () => {
    expect(multiplayerRealtimeSyncPolicy({
      appActive: false,
      reseedPending: true,
      syncedOnCurrentSubscription: true,
      transportSubscribed: true,
    })).toEqual({ completeReseed: false, keepPolling: false });
  });

  it('shows a settled human turn timer independently of viewer action controls', () => {
    expect(multiplayerVisibleTurnSeconds({
      actionPresentationPending: false,
      presentationReady: true,
      secondsLeft: 23,
      turnIsHumanControlled: true,
    })).toBe(23);
    expect(multiplayerVisibleTurnSeconds({
      actionPresentationPending: true,
      presentationReady: true,
      secondsLeft: 23,
      turnIsHumanControlled: true,
    })).toBeNull();
    expect(multiplayerVisibleTurnSeconds({
      actionPresentationPending: false,
      presentationReady: false,
      secondsLeft: 23,
      turnIsHumanControlled: true,
    })).toBeNull();
  });

  it('keeps empty start and next-hand transitions while rejecting mismatched snapshots', () => {
    const hand = { handNumber: 2 } as NonNullable<Parameters<typeof multiplayerPresentationTransitionFromEnvelope>[0]>['snapshot']['hand'];
    expect(multiplayerPresentationTransitionFromEnvelope({
      snapshot: { hand, version: 4 },
      transition: transition(),
    }))?.toMatchObject({ handNumber: 2, transition: { kind: 'start', version: 4 } });
    expect(multiplayerPresentationTransitionFromEnvelope({
      snapshot: { hand, version: 5 },
      transition: transition({ kind: 'deal-now' }),
    })).toBeNull();
  });

  it('only treats authoritative transition frames as live audio events', () => {
    expect(isLiveMultiplayerActionFrame({ key: 'transition:9:0' })).toBe(true);
    expect(isLiveMultiplayerActionFrame({ key: 'history:3:7' })).toBe(false);
    expect(isLiveMultiplayerActionFrame(null)).toBe(false);
  });

  it('keeps captured provenance across a newer snapshot only while it still matches the hand tail', () => {
    const entry = { handNumber: 2, transition: transition({
      actionBatch: [{ amount: 40, playerId: 'lena', potAfter: 100, street: 'flop', type: 'call' }],
    }) };
    expect(multiplayerLatestLiveTransitionForHand([entry], 2, 6)).toBe(entry);
    expect(multiplayerTransitionMatchesHandTail(entry, {
      history: [{ amount: 40, playerId: 'lena', potAfter: 100, street: 'flop', type: 'call' }],
    } as never)).toBe(true);
    expect(multiplayerTransitionMatchesHandTail(entry, {
      history: [{ amount: 0, playerId: 'lena', potAfter: 100, street: 'turn', type: 'check' }],
    } as never)).toBe(false);
  });

  it('keeps the latest live action provenance when a newer connection transition is empty', () => {
    const action = { handNumber: 2, transition: transition({
      actionBatch: [{ amount: 0, playerId: 'lena', potAfter: 80, street: 'flop', type: 'check' }],
      kind: 'action',
      version: 6,
    }) };
    const connection = { handNumber: 2, transition: transition({
      actionBatch: [],
      kind: 'set-connection',
      version: 7,
    }) };
    expect(multiplayerLatestLiveTransitionForHand([action, connection], 2, 7)).toBe(connection);
    expect(multiplayerLatestLiveActionTransitionForHand([action, connection], 2, 7)).toBe(action);
  });

  it('selects the highest authoritative version instead of trusting arrival order', () => {
    const newerAction = { handNumber: 2, transition: transition({
      actionBatch: [{ amount: 0, playerId: 'lena', potAfter: 80, street: 'flop', type: 'check' }],
      kind: 'action',
      version: 7,
    }) };
    const olderAction = { handNumber: 2, transition: transition({
      actionBatch: [{ amount: 20, playerId: 'lena', potAfter: 40, street: 'preflop', type: 'call' }],
      kind: 'action',
      version: 6,
    }) };
    expect(multiplayerLatestLiveTransitionForHand([newerAction, olderAction], 2, 7)).toBe(newerAction);
    expect(multiplayerLatestLiveActionTransitionForHand([newerAction, olderAction], 2, 7)).toBe(newerAction);
  });

  it('only treats a fresh-deal transition as live at its exact room version', () => {
    const entry = { handNumber: 2, transition: transition({ kind: 'deal-now', version: 7 }) };
    expect(multiplayerTransitionIsCurrentFreshDeal(entry, 7)).toBe(true);
    expect(multiplayerTransitionIsCurrentFreshDeal(entry, 8)).toBe(false);
    expect(multiplayerTransitionIsCurrentFreshDeal({
      handNumber: 2,
      transition: transition({ kind: 'action', version: 7 }),
    }, 7)).toBe(false);
  });

  it('gives all-in precedence and maps ordinary poker actions exactly', () => {
    expect(multiplayerActionFeedbackCue({ type: 'call' }, true)).toBe('allIn');
    expect(multiplayerActionFeedbackCue({ type: 'raise' }, false)).toBe('raise');
    expect(multiplayerActionFeedbackCue({ type: 'check' }, false)).toBe('check');
  });

  it('leaves a readable deal beat before the first automated action', () => {
    expect(multiplayerActionFeedbackDelayMs(true)).toBeGreaterThanOrEqual(520);
    expect(multiplayerActionFeedbackDelayMs(false)).toBe(0);
  });

  it('serializes a follow-up cue after its predecessor and any existing delay', () => {
    expect(multiplayerFollowupFeedbackDelayMs('allIn', 100)).toBe(555);
    expect(multiplayerFollowupFeedbackDelayMs(null, 100)).toBe(0);
  });

  it('orders action then street and suppresses a simultaneous viewer cue', () => {
    const steps = planMultiplayerFeedback({
      action: { cue: 'raise', delayMs: 0, eventId: 'action-1', viewerActed: true },
      boardEventId: 'board-flop',
      freshDealEventId: null,
      result: null,
      timerEventId: null,
      viewerTurnEventId: 'turn-hero',
    });
    expect(steps.map(({ kind }) => kind)).toEqual(['action', 'streetReveal']);
    expect(steps[1]!.delayMs).toBeGreaterThan(300);
    expect(steps.filter(({ haptic }) => haptic)).toHaveLength(1);
  });

  it('gives terminal result precedence over runout and turn feedback', () => {
    const steps = planMultiplayerFeedback({
      action: { cue: 'allIn', delayMs: 0, eventId: 'action-2', viewerActed: true },
      boardEventId: 'board-river',
      freshDealEventId: null,
      result: { cue: { type: 'handResult', result: 'win' }, eventId: 'result-1' },
      timerEventId: null,
      viewerTurnEventId: null,
    });
    expect(steps.map(({ kind }) => kind)).toEqual(['action', 'handResult']);
    expect(steps[1]!.delayMs).toBeGreaterThan(400);
    expect(steps.filter(({ haptic }) => haptic)).toEqual([steps[1]]);
  });

  it('lets an urgent timer warning supersede a simultaneous viewer-turn cue', () => {
    expect(planMultiplayerFeedback({
      action: null,
      boardEventId: null,
      freshDealEventId: null,
      result: null,
      timerEventId: 'timer-9s',
      viewerTurnEventId: 'turn-hero',
    }).map(({ kind }) => kind)).toEqual(['timerWarning']);
  });

  it('orders a zero-action terminal deal before its result', () => {
    const steps = planMultiplayerFeedback({
      action: null,
      boardEventId: 'board-river',
      freshDealEventId: 'deal-short',
      result: { cue: { type: 'handResult', result: 'loss' }, eventId: 'result-short' },
      timerEventId: null,
      viewerTurnEventId: null,
    });
    expect(steps.map(({ kind }) => kind)).toEqual(['newHand', 'handResult']);
    expect(steps[1]!.delayMs).toBeGreaterThanOrEqual(555);
    expect(steps.filter(({ haptic }) => haptic)).toEqual([steps[1]]);
  });

  it('keeps one stable scheduler key across unrelated rerenders', () => {
    const steps = planMultiplayerFeedback({
      action: { cue: 'call', delayMs: 0, eventId: 'action-stable', viewerActed: false },
      boardEventId: 'board-stable',
      freshDealEventId: null,
      result: null,
      timerEventId: null,
      viewerTurnEventId: null,
    });
    expect(multiplayerFeedbackPlanKey([...steps])).toBe(multiplayerFeedbackPlanKey(steps));
  });

  it('latches a delayed board event across an unrelated rerender until it fires', () => {
    const detected = { boardCount: 3, eventId: 'board-flop', handNumber: 4 };
    const first = retainMultiplayerBoardFeedbackEvent({
      boardCount: 3,
      detected,
      handNumber: 4,
      pending: null,
    });
    expect(retainMultiplayerBoardFeedbackEvent({
      boardCount: 3,
      detected: null,
      handNumber: 4,
      pending: first,
    })).toBe(detected);
    expect(retainMultiplayerBoardFeedbackEvent({
      boardCount: 4,
      detected: null,
      handNumber: 4,
      pending: first,
    })).toBeNull();
  });

  it('drops background presentation provenance and reseeds on foreground boundaries', () => {
    expect(multiplayerShouldCaptureLivePresentation('active')).toBe(true);
    expect(multiplayerShouldCaptureLivePresentation('background')).toBe(false);
    expect(multiplayerPresentationLifecycleBoundary('active', 'background')).toBe(true);
    expect(multiplayerPresentationLifecycleBoundary('background', 'inactive')).toBe(false);
    expect(multiplayerPresentationLifecycleBoundary('inactive', 'active')).toBe(true);
  });

  it('defers one foreground restore until a successful authoritative reseed', () => {
    const inactive = advanceMultiplayerPresentationReadiness(
      initialMultiplayerPresentationReadinessState,
      { type: 'inactive' },
    );
    expect(inactive).toEqual({
      emission: null,
      state: { deferredRestoreSequence: null, ready: false },
    });

    const deferred = advanceMultiplayerPresentationReadiness(inactive.state, {
      cue: 'restore',
      sequence: 4,
      type: 'transport',
    });
    expect(deferred).toEqual({
      emission: null,
      state: { deferredRestoreSequence: 4, ready: false },
    });

    const reseeded = advanceMultiplayerPresentationReadiness(deferred.state, {
      type: 'sync-succeeded',
    });
    expect(reseeded).toEqual({
      emission: { cue: 'restore', sequence: 4 },
      state: { deferredRestoreSequence: null, ready: true },
    });
    expect(advanceMultiplayerPresentationReadiness(reseeded.state, {
      type: 'sync-succeeded',
    }).emission).toBeNull();
  });

  it('invalidates a deferred restore when the transport fails again before reseed', () => {
    const deferred = advanceMultiplayerPresentationReadiness(
      { deferredRestoreSequence: null, ready: false },
      { cue: 'restore', sequence: 2, type: 'transport' },
    );
    const disconnected = advanceMultiplayerPresentationReadiness(deferred.state, {
      cue: 'disconnect',
      sequence: 3,
      type: 'transport',
    });
    expect(disconnected).toEqual({
      emission: { cue: 'disconnect', sequence: 3 },
      state: { deferredRestoreSequence: null, ready: false },
    });
    expect(advanceMultiplayerPresentationReadiness(disconnected.state, {
      type: 'sync-succeeded',
    }).emission).toBeNull();
  });

  it('locks a ready table on disconnect and unlocks only after a successful sync', () => {
    const disconnected = advanceMultiplayerPresentationReadiness(
      initialMultiplayerPresentationReadinessState,
      { cue: 'disconnect', sequence: 1, type: 'transport' },
    );
    expect(disconnected).toEqual({
      emission: { cue: 'disconnect', sequence: 1 },
      state: { deferredRestoreSequence: null, ready: false },
    });

    const restored = advanceMultiplayerPresentationReadiness(disconnected.state, {
      cue: 'restore',
      sequence: 2,
      type: 'transport',
    });
    expect(restored.state.ready).toBe(false);
    expect(advanceMultiplayerPresentationReadiness(restored.state, {
      type: 'sync-succeeded',
    })).toEqual({
      emission: { cue: 'restore', sequence: 2 },
      state: { deferredRestoreSequence: null, ready: true },
    });
  });

  it('suppresses a stale foreground timer until the table has successfully reseeded', () => {
    const transition = {
      action: null,
      boardEventId: null,
      freshDealEventId: null,
      result: null,
      timerEventId: 'stale-background-deadline',
      viewerTurnEventId: null,
    };
    expect(planMultiplayerFeedbackWhenReady(false, transition)).toEqual([]);
    expect(planMultiplayerFeedbackWhenReady(true, transition).map(({ kind }) => kind))
      .toEqual(['timerWarning']);
  });

  it('uses one stable warning key at ten seconds or below', () => {
    const base = {
      actingPlayerId: 'player-1',
      deadlineAtMs: 9_000,
      handNumber: 4,
      roomId: 'room-1',
    };
    expect(multiplayerTimerWarningEventId({ ...base, secondsLeft: 11 })).toBeNull();
    expect(multiplayerTimerWarningEventId({ ...base, secondsLeft: 10 })).toBe(
      'room-1:hand:4:timer:player-1:9000',
    );
    expect(multiplayerTimerWarningEventId({ ...base, secondsLeft: 3 })).toBe(
      'room-1:hand:4:timer:player-1:9000',
    );
  });

  it('maps split results and fingerprints every payout', () => {
    const result = {
      detail: 'Showdown',
      headlineAmount: 120,
      payouts: [
        { amount: 80, label: 'Iris', playerId: 'iris' },
        { amount: 120, label: 'You', playerId: 'hero' },
      ],
      showdown: true,
      title: 'You win a share',
      tone: 'split' as const,
      totalPot: 200,
    };
    expect(multiplayerResultFeedbackKind(result.tone)).toBe('split');
    expect(multiplayerResultFeedbackEventId('room-1', 4, result)).toBe(
      'room-1:hand:4:result:split:200:hero:120,iris:80',
    );
  });

  it('announces one disconnect and one restore after the initial silent subscription', () => {
    const subscribed = advanceMultiplayerRealtimeFeedback(
      initialMultiplayerRealtimeFeedbackState,
      'SUBSCRIBED',
      true,
    );
    expect(subscribed.cue).toBeNull();
    const disconnected = advanceMultiplayerRealtimeFeedback(subscribed.state, 'CHANNEL_ERROR', true);
    expect(disconnected.cue).toBe('disconnect');
    expect(advanceMultiplayerRealtimeFeedback(disconnected.state, 'TIMED_OUT', true).cue).toBeNull();
    const restored = advanceMultiplayerRealtimeFeedback(disconnected.state, 'SUBSCRIBED', true);
    expect(restored.cue).toBe('restore');
    expect(restored.state.sequence).toBe(2);
  });

  it('suppresses transport churn while inactive', () => {
    const subscribed = { ...initialMultiplayerRealtimeFeedbackState, hasSubscribed: true };
    const disconnected = advanceMultiplayerRealtimeFeedback(subscribed, 'CLOSED', false);
    expect(disconnected).toEqual({
      cue: null,
      state: subscribed,
    });
    expect(advanceMultiplayerRealtimeFeedback(disconnected.state, 'SUBSCRIBED', false)).toEqual({
      cue: null,
      state: subscribed,
    });
    expect(advanceMultiplayerRealtimeFeedback(disconnected.state, 'SUBSCRIBED', true)).toEqual({
      cue: null,
      state: subscribed,
    });
  });

  it('tracks background transport state without replaying stale cues', () => {
    const initialBackgroundSubscribe = advanceMultiplayerRealtimeFeedback(
      initialMultiplayerRealtimeFeedbackState,
      'SUBSCRIBED',
      false,
    );
    expect(initialBackgroundSubscribe.cue).toBeNull();
    expect(advanceMultiplayerRealtimeFeedback(
      initialBackgroundSubscribe.state,
      'CHANNEL_ERROR',
      true,
    ).cue).toBe('disconnect');

    const active = advanceMultiplayerRealtimeFeedback(
      initialMultiplayerRealtimeFeedbackState,
      'SUBSCRIBED',
      true,
    );
    const firstFailure = advanceMultiplayerRealtimeFeedback(active.state, 'CHANNEL_ERROR', true);
    const silentRestore = advanceMultiplayerRealtimeFeedback(firstFailure.state, 'SUBSCRIBED', false);
    expect(silentRestore.cue).toBeNull();
    expect(advanceMultiplayerRealtimeFeedback(silentRestore.state, 'TIMED_OUT', true).cue)
      .toBe('disconnect');
  });
});
