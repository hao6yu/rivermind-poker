import { describe, expect, it } from 'vitest';

import type { MultiplayerPublicTransition } from '../../domain/multiplayer/contracts';
import {
  applyMultiwayAction,
  createMultiwayHand,
  type MultiwayHandState,
} from '../../domain/poker/multiway';
import {
  buildMultiplayerActionFrames,
  hasPendingMultiplayerActionPresentation,
  mergeMultiplayerActionFrames,
  multiplayerActionControlsEnabled,
  pendingMultiplayerActionFrames,
  multiplayerPresentedTurnPlayerId,
  multiplayerPresentedStreet,
  multiplayerPresentedPot,
  type MultiplayerActionFrame,
} from './multiplayerActionQueue';

function hand(): MultiwayHandState {
  const result = createMultiwayHand({
    bigBlind: 20,
    buttonSeat: 0,
    players: Array.from({ length: 6 }, (_, seat) => ({
      id: seat === 0 ? 'viewer' : `ai-${seat}`,
      name: seat === 2 ? 'Lena' : `Player ${seat}`,
      seat,
      stack: 2_000,
    })),
    random: () => 0.25,
    smallBlind: 10,
  });
  result.street = 'flop';
  result.board = result.deck.slice(0, 3);
  result.history = [
    { amount: 48, playerId: 'viewer', potAfter: 126, street: 'preflop', type: 'call' },
    { amount: 0, playerId: 'ai-1', potAfter: 126, street: 'preflop', type: 'fold' },
    { amount: 38, playerId: 'ai-2', potAfter: 164, street: 'preflop', type: 'call' },
    { amount: 28, playerId: 'ai-3', potAfter: 192, street: 'preflop', type: 'call' },
    { amount: 0, playerId: 'ai-2', potAfter: 192, street: 'flop', type: 'check' },
    { amount: 0, playerId: 'ai-3', potAfter: 192, street: 'flop', type: 'check' },
    { amount: 0, playerId: 'ai-4', potAfter: 192, street: 'flop', type: 'check' },
  ];
  return result;
}

function transition(currentHand: MultiwayHandState): MultiplayerPublicTransition {
  return {
    acceptedAtMs: 2_000,
    actionBatch: currentHand.history.map(({ amount, playerId, potAfter, street, type }) => ({
      amount, playerId, potAfter, street, type,
    })),
    commandId: 'viewer-call',
    kind: 'action',
    timeout: null,
    version: 8,
  };
}

function headsUpHand(): MultiwayHandState {
  return createMultiwayHand({
    bigBlind: 20,
    buttonSeat: 0,
    players: [
      { id: 'viewer', name: 'Kai', seat: 0, stack: 2_000 },
      { id: 'iris', name: 'Iris', seat: 1, stack: 2_000 },
    ],
    random: () => 0.25,
    smallBlind: 10,
  });
}

describe('private table live action synchronization', () => {
  it('never overlays an older-street Call on the final flop snapshot', () => {
    const currentHand = hand();
    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 0,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: transition(currentHand) }],
    });

    expect(frames.map(({ action }) => [action.playerId, action.street, action.type])).toEqual([
      ['ai-3', 'flop', 'check'],
      ['ai-4', 'flop', 'check'],
    ]);
    expect(frames.every(({ action }) => action.street === currentHand.street)).toBe(true);
    expect(frames.every(({ board }) => board.length === 3)).toBe(true);
    expect(frames.some(({ action }) => action.playerId === 'ai-2' && action.type === 'call')).toBe(false);
  });

  it('can synchronize to a staged board street instead of leaking the final snapshot street', () => {
    const currentHand = hand();
    const frames = buildMultiplayerActionFrames({
      currentHand,
      displayedStreet: 'preflop',
      previousHistoryLength: 0,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: transition(currentHand) }],
    });

    expect(frames).toHaveLength(2);
    expect(frames.every(({ action }) => action.street === 'preflop')).toBe(true);
  });

  it('applies the same street synchronization to history fallback updates', () => {
    const currentHand = hand();
    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 2,
      sameHand: true,
      transitions: [],
    });

    expect(frames).toHaveLength(2);
    expect(frames.every(({ action }) => action.street === 'flop')).toBe(true);
  });

  it('shows the final two actions for 1.8 seconds each within a 3.6-second budget', () => {
    const currentHand = hand();
    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 0,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: transition(currentHand) }],
    });

    expect(frames).toHaveLength(2);
    expect(frames.map(({ durationMs }) => durationMs)).toEqual([1_800, 1_800]);
    expect(frames.reduce((total, frame) => total + frame.durationMs, 0)).toBe(3_600);
  });

  it('keeps a single final action readable for the same 1.8-second hold', () => {
    const currentHand = hand();
    const oneActionTransition = transition(currentHand);
    oneActionTransition.actionBatch = oneActionTransition.actionBatch.slice(-1);
    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: currentHand.history.length - 1,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: oneActionTransition }],
    });

    expect(frames).toHaveLength(1);
    expect(frames[0]?.durationMs).toBe(1_800);
  });

  it('caps several pending transitions together at two frames and 3.6 seconds', () => {
    const currentHand = hand();
    const first = transition(currentHand);
    first.actionBatch = [{ ...currentHand.history[4]! }];
    const second = transition(currentHand);
    second.commandId = 'next-broadcast';
    second.version = 9;
    second.actionBatch = currentHand.history.slice(5).map((action) => ({ ...action }));
    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 4,
      sameHand: true,
      transitions: [
        { handNumber: currentHand.handNumber, transition: first },
        { handNumber: currentHand.handNumber, transition: second },
      ],
    });

    expect(frames.map(({ action }) => action.playerId)).toEqual(['ai-3', 'ai-4']);
    expect(frames).toHaveLength(2);
    expect(frames.reduce((total, frame) => total + frame.durationMs, 0)).toBe(3_600);
  });

  it('drops a delayed transition action that has no authoritative current-hand match', () => {
    const currentHand = hand();
    const stale = transition(currentHand);
    stale.commandId = 'prior-hand-delivery';
    stale.actionBatch = [{
      amount: 71,
      playerId: 'ai-from-prior-hand',
      potAfter: 411,
      street: 'flop',
      type: 'raise',
    }];

    expect(buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 4,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: stale }],
    })).toEqual([]);
  });

  it('rejects a delayed prior-hand transition even when its action looks like current history', () => {
    const currentHand = hand();
    const stale = transition(currentHand);
    stale.actionBatch = [{ ...currentHand.history[4]! }];

    expect(pendingMultiplayerActionFrames({
      consumedTransitionVersions: new Set<number>(),
      currentHand,
      observedHistory: {
        handNumber: currentHand.handNumber,
        length: currentHand.history.length,
      },
      presentedActionIds: new Set<string>(),
      roomVersion: 8,
      transitions: [{ handNumber: currentHand.handNumber - 1, transition: stale }],
    })).toEqual([]);
  });

  it('matches repeated identical-looking actions to distinct forward history indexes', () => {
    const currentHand = hand();
    const repeated = {
      amount: 0,
      playerId: 'ai-3',
      potAfter: 192,
      street: 'flop' as const,
      type: 'check' as const,
    };
    currentHand.history = [
      ...currentHand.history.slice(0, 4),
      { ...repeated },
      { ...repeated },
    ];
    const repeatedTransition = transition(currentHand);
    repeatedTransition.actionBatch = [{ ...repeated }, { ...repeated }];

    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 4,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: repeatedTransition }],
    });
    expect(frames.map(({ historyIndex }) => historyIndex)).toEqual([4, 5]);
    expect(new Set(frames.map(({ id }) => id)).size).toBe(2);
  });

  it('does not replay a transition action that is already before observed history', () => {
    const currentHand = hand();
    const alreadyObserved = transition(currentHand);
    alreadyObserved.actionBatch = [{ ...currentHand.history[4]! }];

    expect(buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 5,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: alreadyObserved }],
    })).toEqual([]);
  });

  it('presents the decisive fold after the hand advances to complete', () => {
    let currentHand = headsUpHand();
    const foldingPlayerId = currentHand.toAct;
    if (!foldingPlayerId) throw new Error('The fold completion fixture has no actor.');
    currentHand = applyMultiwayAction(currentHand, foldingPlayerId, { type: 'fold' });
    const finalAction = currentHand.history.at(-1)!;
    const terminalTransition = transition(currentHand);
    terminalTransition.actionBatch = [{ ...finalAction }];

    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: currentHand.history.length - 1,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: terminalTransition }],
    });

    expect(currentHand.street).toBe('complete');
    expect(frames).toHaveLength(1);
    expect(frames[0]).toMatchObject({
      action: { playerId: foldingPlayerId, street: 'preflop', type: 'fold' },
      historyIndex: currentHand.history.length - 1,
    });
    expect(frames[0]?.action.street).not.toBe('complete');
    expect(hasPendingMultiplayerActionPresentation({
      consumedTransitionVersions: new Set<number>(),
      currentHand,
      observedHistory: {
        handNumber: currentHand.handNumber,
        length: currentHand.history.length - 1,
      },
      presentedActionIds: new Set<string>(),
      roomVersion: terminalTransition.version,
      transitions: [{ handNumber: currentHand.handNumber, transition: terminalTransition }],
    })).toBe(true);
  });

  it('presents a final river call after showdown completion', () => {
    const currentHand = hand();
    currentHand.street = 'complete';
    currentHand.board = currentHand.deck.slice(0, 5);
    currentHand.history = [
      {
        amount: 71,
        playerId: 'ai-2',
        potAfter: 334,
        street: 'river',
        type: 'raise',
      },
      {
        amount: 71,
        playerId: 'viewer',
        potAfter: 405,
        street: 'river',
        type: 'call',
      },
    ];
    currentHand.outcome = {
      awards: [{
        amount: 405,
        contributionCap: 203,
        eligiblePlayerIds: ['viewer', 'ai-2'],
        kind: 'main',
        shares: { viewer: 405 },
        winnerPlayerIds: ['viewer'],
      }],
      showdown: true,
      totalPot: 405,
      winnerPlayerIds: ['viewer'],
    };
    const terminalTransition = transition(currentHand);
    terminalTransition.actionBatch = [{ ...currentHand.history[1]! }];

    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 1,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: terminalTransition }],
    });
    expect(frames).toHaveLength(1);
    expect(currentHand.outcome.showdown).toBe(true);
    expect(frames[0]).toMatchObject({
      action: { amount: 71, playerId: 'viewer', street: 'river', type: 'call' },
      board: currentHand.board,
      historyIndex: 1,
    });
    expect(frames.every(({ action }) => action.street !== ('complete' as never))).toBe(true);
  });

  it('locks legal controls while another player has the visible live-action bubble', () => {
    const currentHand = hand();
    const frame = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 0,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: transition(currentHand) }],
    })[0] as MultiplayerActionFrame;
    const room = { legalActions: { canCall: false } as never, viewerPlayerId: 'viewer' };

    expect(multiplayerActionControlsEnabled(room, frame)).toBe(false);
    expect(multiplayerActionControlsEnabled(room, undefined)).toBe(true);
    expect(multiplayerActionControlsEnabled(room, {
      ...frame,
      action: { ...frame.action, playerId: 'viewer' },
    })).toBe(false);
    expect(multiplayerActionControlsEnabled({ ...room, legalActions: null }, undefined)).toBe(false);
  });

  it('locks legal controls synchronously while a transition is waiting for the queue effect', () => {
    const currentHand = hand();
    const input = {
      consumedTransitionVersions: new Set<number>(),
      currentHand,
      observedHistory: { handNumber: currentHand.handNumber, length: 4 },
      presentedActionIds: new Set<string>(),
      roomVersion: 8,
      transitions: [{ handNumber: currentHand.handNumber, transition: transition(currentHand) }],
    };
    const pendingFrames = pendingMultiplayerActionFrames(input);
    const pending = hasPendingMultiplayerActionPresentation(input);
    const legalRoom = { legalActions: { canCheck: true } as never, viewerPlayerId: 'viewer' };

    expect(pendingFrames).toHaveLength(2);
    expect(pending).toBe(true);
    expect(multiplayerActionControlsEnabled(legalRoom, undefined, pending)).toBe(false);
    expect(multiplayerActionControlsEnabled(legalRoom, undefined, false)).toBe(true);
  });

  it('detects pending history fallback and clears after ids and cursors are consumed', () => {
    const currentHand = hand();
    const base = {
      consumedTransitionVersions: new Set<number>(),
      currentHand,
      observedHistory: { handNumber: currentHand.handNumber, length: 4 },
      presentedActionIds: new Set<string>(),
      roomVersion: 8,
      transitions: [],
    };
    const pendingHistory = hasPendingMultiplayerActionPresentation(base);
    expect(pendingHistory).toBe(true);
    expect(multiplayerActionControlsEnabled({
      legalActions: { canCheck: true } as never,
      viewerPlayerId: 'viewer',
    }, undefined, pendingHistory)).toBe(false);

    const transitionInput = {
      ...base,
      transitions: [{ handNumber: currentHand.handNumber, transition: transition(currentHand) }],
    };
    const pendingIds = pendingMultiplayerActionFrames(transitionInput).map(({ id }) => id);
    expect(hasPendingMultiplayerActionPresentation({
      ...transitionInput,
      presentedActionIds: new Set(pendingIds),
    })).toBe(false);
    expect(hasPendingMultiplayerActionPresentation({
      ...transitionInput,
      consumedTransitionVersions: new Set([8]),
      observedHistory: { handNumber: currentHand.handNumber, length: currentHand.history.length },
    })).toBe(false);
  });

  it('also locks when a viewer action is delayed ahead of an AI raise that reopened action', () => {
    const currentHand = hand();
    const viewerFrame: MultiplayerActionFrame = {
      action: {
        amount: 0,
        playerId: 'viewer',
        potAfter: 192,
        street: 'flop',
        type: 'check',
      },
      board: currentHand.board.slice(0, 3),
      durationMs: 1_800,
      historyIndex: 4,
      id: '1:4',
      key: 'viewer-check-before-ai-raise',
    };

    expect(multiplayerActionControlsEnabled({
      legalActions: { canCall: true } as never,
      viewerPlayerId: 'viewer',
    }, viewerFrame)).toBe(false);
  });

  it('keeps every visual turn indicator on the displayed frame until the queue drains', () => {
    const currentHand = hand();
    const frame = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 0,
      sameHand: true,
      transitions: [{ handNumber: currentHand.handNumber, transition: transition(currentHand) }],
    })[0];

    expect(multiplayerPresentedTurnPlayerId('viewer', frame)).toBe('ai-3');
    expect(multiplayerPresentedTurnPlayerId('viewer', undefined)).toBe('viewer');
  });

  it('keeps board stage and bubble street synchronized', () => {
    const currentHand = hand();
    const preflopFrame: MultiplayerActionFrame = {
      action: currentHand.history[2]!,
      board: [],
      durationMs: 1_800,
      historyIndex: 2,
      id: '1:2',
      key: 'preflop-call',
    };

    expect(multiplayerPresentedStreet(currentHand.street, preflopFrame)).toBe('preflop');
    expect(multiplayerPresentedStreet(currentHand.street, undefined)).toBe('flop');
    expect(multiplayerPresentedPot(currentHand.pot, preflopFrame)).toBe(164);
    expect(multiplayerPresentedPot(currentHand.pot, undefined)).toBe(currentHand.pot);
  });

  it('purges a stale frame when a newer-street live handoff arrives', () => {
    const currentHand = hand();
    const staleFrame: MultiplayerActionFrame = {
      action: currentHand.history[2]!,
      board: [],
      durationMs: 1_800,
      historyIndex: 2,
      id: '1:2',
      key: 'preflop-call',
    };
    const liveFrame: MultiplayerActionFrame = {
      action: currentHand.history[4]!,
      board: currentHand.board.slice(0, 3),
      durationMs: 1_800,
      historyIndex: 4,
      id: '1:4',
      key: 'flop-check',
    };

    expect(mergeMultiplayerActionFrames([staleFrame], [liveFrame], currentHand))
      .toEqual([liveFrame]);
  });

  it('retains a synchronized older-street frame while no newer handoff has arrived', () => {
    const currentHand = hand();
    const stagedFrame: MultiplayerActionFrame = {
      action: currentHand.history[2]!,
      board: [],
      durationMs: 1_800,
      historyIndex: 2,
      id: '1:2',
      key: 'preflop-call',
    };

    expect(mergeMultiplayerActionFrames([stagedFrame], [], {
      history: [stagedFrame.action],
      street: 'preflop',
    }))
      .toEqual([stagedFrame]);
  });

  it('retains the terminal frame using the final history street after completion', () => {
    const currentHand = hand();
    currentHand.street = 'complete';
    currentHand.history = [{
      amount: 0,
      playerId: 'ai-4',
      potAfter: 192,
      street: 'river',
      type: 'fold',
    }];
    const terminalFrame: MultiplayerActionFrame = {
      action: currentHand.history[0]!,
      board: currentHand.board,
      durationMs: 1_800,
      historyIndex: 0,
      id: '1:0',
      key: 'terminal-fold',
    };

    expect(mergeMultiplayerActionFrames([terminalFrame], [], currentHand))
      .toEqual([terminalFrame]);
  });

  it('caps incrementally merged same-street transitions without replacing the visible frame', () => {
    const currentHand = hand();
    const frames = buildMultiplayerActionFrames({
      currentHand,
      previousHistoryLength: 4,
      sameHand: true,
      transitions: [],
    });
    const later: MultiplayerActionFrame = {
      ...frames[1]!,
      action: { ...frames[1]!.action, playerId: 'ai-5' },
      id: '1:7',
      key: 'later-transition',
    };

    const merged = mergeMultiplayerActionFrames(frames, [later], currentHand);
    expect(merged).toEqual([frames[0], later]);
    expect(merged).toHaveLength(2);
    expect(merged.reduce((total, frame) => total + frame.durationMs, 0)).toBe(3_600);
  });
});
