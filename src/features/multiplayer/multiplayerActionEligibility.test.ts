import { describe, expect, it } from 'vitest';

import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';
import {
  createMultiwayHand,
  getMultiwayLegalActions,
} from '../../domain/poker/multiway';
import { canSubmitMultiplayerAction } from './multiplayerActionEligibility';

function liveProjection(): MultiplayerViewerProjection {
  const hand = createMultiwayHand({
    bigBlind: 20,
    buttonSeat: 0,
    players: [
      { id: 'viewer', name: 'You', seat: 0, stack: 2_000 },
      { id: 'opponent', name: 'Lena', seat: 1, stack: 2_000 },
    ],
    random: () => 0.25,
    smallBlind: 10,
  });
  if (hand.toAct !== 'viewer') throw new Error('The eligibility fixture did not give the viewer first action.');

  return {
    completionReason: null,
    config: {
      aiDifficulty: 'club',
      bigBlindChips: 20,
      handTarget: 10,
      seatCount: 2,
      smallBlindChips: 10,
      startingStackChips: 2_000,
      turnSeconds: 45,
    },
    createdAtMs: 1,
    hand,
    hostPlayerId: 'viewer',
    legalActions: getMultiwayLegalActions(hand, 'viewer'),
    roomCode: '795182',
    roomId: 'room-1',
    seats: [{
      aiProfileId: null,
      connection: 'online',
      control: 'human',
      displayName: 'You',
      isHost: true,
      joinedAtMs: 1,
      kind: 'human',
      missedTurns: 0,
      playerId: 'viewer',
      ready: true,
      seat: 0,
      userId: null,
    }],
    sessionNumber: 1,
    status: 'playing',
    turnDeadlineAtMs: 45_000,
    updatedAtMs: 2,
    version: 7,
    viewerPlayerId: 'viewer',
  };
}

const origin = { roomId: 'room-1', version: 7 };

describe('latest multiplayer action eligibility', () => {
  it('accepts only the exact fold, call, and raise actions legal in the latest projection', () => {
    const projection = liveProjection();
    const legal = projection.legalActions;
    if (!legal) throw new Error('The live fixture has no legal actions.');

    expect(canSubmitMultiplayerAction(projection, { action: { type: 'fold' }, type: 'action' }, origin)).toBe(true);
    expect(canSubmitMultiplayerAction(projection, { action: { type: 'call' }, type: 'action' }, origin)).toBe(true);
    expect(canSubmitMultiplayerAction(projection, { action: { type: 'check' }, type: 'action' }, origin)).toBe(false);
    expect(canSubmitMultiplayerAction(projection, {
      action: { amount: legal.minRaiseTo, type: 'raise' },
      type: 'action',
    }, origin)).toBe(true);
    expect(canSubmitMultiplayerAction(projection, {
      action: { amount: legal.maxRaiseTo, type: 'raise' },
      type: 'action',
    }, origin)).toBe(true);
  });

  it('distinguishes Check from Call instead of treating the middle button as one action', () => {
    const projection = liveProjection();
    projection.hand = { ...projection.hand!, currentBet: 0 };
    projection.legalActions = {
      ...projection.legalActions!,
      canCall: false,
      canCheck: true,
      canFold: false,
      toCall: 0,
    };

    expect(canSubmitMultiplayerAction(projection, { action: { type: 'check' }, type: 'action' }, origin)).toBe(true);
    expect(canSubmitMultiplayerAction(projection, { action: { type: 'call' }, type: 'action' }, origin)).toBe(false);
    expect(canSubmitMultiplayerAction(projection, { action: { type: 'fold' }, type: 'action' }, origin)).toBe(false);
  });

  it('rejects stale versions, different rooms, non-action commands, and a changed actor', () => {
    const projection = liveProjection();

    expect(canSubmitMultiplayerAction(projection, { action: { type: 'call' }, type: 'action' }, {
      ...origin,
      version: 6,
    })).toBe(false);
    expect(canSubmitMultiplayerAction(projection, { action: { type: 'call' }, type: 'action' }, {
      ...origin,
      roomId: 'room-2',
    })).toBe(false);
    expect(canSubmitMultiplayerAction(projection, { type: 'tick' }, origin)).toBe(false);

    projection.hand = { ...projection.hand!, toAct: 'opponent' };
    expect(canSubmitMultiplayerAction(projection, { action: { type: 'call' }, type: 'action' }, origin)).toBe(false);
  });

  it('rejects paused, offline, AI-controlled, and missing-legal-action snapshots', () => {
    const paused = liveProjection();
    paused.status = 'paused';
    expect(canSubmitMultiplayerAction(paused, { action: { type: 'call' }, type: 'action' }, origin)).toBe(false);

    const offline = liveProjection();
    offline.seats[0]!.connection = 'offline';
    expect(canSubmitMultiplayerAction(offline, { action: { type: 'call' }, type: 'action' }, origin)).toBe(false);

    const aiControlled = liveProjection();
    aiControlled.seats[0]!.control = 'ai';
    expect(canSubmitMultiplayerAction(aiControlled, { action: { type: 'call' }, type: 'action' }, origin)).toBe(false);

    const noLegal = liveProjection();
    noLegal.legalActions = null;
    expect(canSubmitMultiplayerAction(noLegal, { action: { type: 'call' }, type: 'action' }, origin)).toBe(false);
  });

  it('rejects disabled and out-of-range raises, including malformed targets', () => {
    const projection = liveProjection();
    const legal = projection.legalActions;
    if (!legal) throw new Error('The live fixture has no legal actions.');

    expect(canSubmitMultiplayerAction(projection, {
      action: { amount: legal.minRaiseTo - 1, type: 'raise' },
      type: 'action',
    }, origin)).toBe(false);
    expect(canSubmitMultiplayerAction(projection, {
      action: { amount: legal.maxRaiseTo + 1, type: 'raise' },
      type: 'action',
    }, origin)).toBe(false);
    expect(canSubmitMultiplayerAction(projection, {
      action: { amount: legal.minRaiseTo + 0.5, type: 'raise' },
      type: 'action',
    }, origin)).toBe(false);
    expect(canSubmitMultiplayerAction(projection, {
      action: { type: 'raise' },
      type: 'action',
    }, origin)).toBe(false);

    projection.legalActions = { ...legal, canRaise: false };
    expect(canSubmitMultiplayerAction(projection, {
      action: { amount: legal.minRaiseTo, type: 'raise' },
      type: 'action',
    }, origin)).toBe(false);
  });
});
