import { describe, expect, it } from 'vitest';

import { seededRandom } from '../../../src/domain/poker/cards';
import {
  applyMultiplayerCommand,
  createMultiplayerRoom,
  defaultMultiplayerRoomConfig,
} from '../../../src/domain/multiplayer/coordinator';
import type {
  MultiplayerCoordinatorState,
  MultiplayerRoomCommand,
} from '../../../src/domain/multiplayer/contracts';
import {
  normalizeMultiplayerCanonicalState,
  parseJoinableMultiplayerRoom,
} from './stateContract';

const hostUserId = 'user-host';
const guestUserId = 'user-guest';

function completeLegacyRoom(): MultiplayerCoordinatorState {
  const random = seededRandom(901);
  let sequence = 0;
  let state = createMultiplayerRoom({
    config: { ...defaultMultiplayerRoomConfig, handTarget: 5, seatCount: 2 },
    hostDisplayName: 'Kai',
    hostPlayerId: 'player-host',
    hostUserId,
    roomCode: '724826',
    roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  }, { nowMs: 1_000, random });
  const send = (input: Omit<MultiplayerRoomCommand, 'commandId' | 'expectedVersion'>) => {
    state = applyMultiplayerCommand(state, {
      ...input,
      commandId: `legacy-${sequence += 1}`,
      expectedVersion: state.version,
    } as MultiplayerRoomCommand, { nowMs: 1_000 + sequence * 100, random }).state;
  };
  send({
    actorUserId: guestUserId,
    displayName: 'Mina',
    playerId: 'player-guest',
    seat: 1,
    type: 'join',
  });
  send({ actorUserId: hostUserId, ready: true, type: 'set-ready' });
  send({ actorUserId: guestUserId, ready: true, type: 'set-ready' });
  send({ actorUserId: hostUserId, type: 'start' });
  const actor = state.hand?.toAct;
  const actorUserId = actor === 'player-host' ? hostUserId : guestUserId;
  send({ action: { type: 'fold' }, actorUserId, type: 'action' });
  if (!state.hand?.outcome) throw new Error('The legacy fixture did not settle.');
  state.hand.handNumber = 5;
  state.status = 'complete';
  return state;
}

describe('multiplayer canonical rolling-deploy contract', () => {
  it('defaults a legacy active room to session one with no completion reason', () => {
    const legacy = createMultiplayerRoom({
      config: defaultMultiplayerRoomConfig,
      hostDisplayName: 'Kai',
      hostPlayerId: 'player-host',
      hostUserId,
      roomCode: '724826',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }, { nowMs: 1_000 });
    const raw = { ...legacy } as Partial<MultiplayerCoordinatorState>;
    delete raw.completionReason;
    delete raw.sessionNumber;

    expect(normalizeMultiplayerCanonicalState(raw)).toMatchObject({
      completionReason: null,
      sessionNumber: 1,
      status: 'lobby',
    });
  });

  it('infers a legacy completed room and rematches without a NaN session', () => {
    const legacy = completeLegacyRoom();
    const raw = JSON.parse(JSON.stringify(legacy)) as Partial<MultiplayerCoordinatorState>;
    delete raw.completionReason;
    delete raw.sessionNumber;
    const normalized = normalizeMultiplayerCanonicalState(raw);
    if (!normalized) throw new Error('The legacy completed room was rejected.');
    expect(normalized).toMatchObject({ completionReason: 'hand-limit', sessionNumber: 1 });

    const rematch = applyMultiplayerCommand(normalized, {
      actorUserId: hostUserId,
      commandId: 'legacy-rematch',
      expectedVersion: normalized.version,
      type: 'rematch',
    }, { nowMs: 9_000 }).state;
    expect(rematch.sessionNumber).toBe(2);
    expect(Number.isNaN(rematch.sessionNumber)).toBe(false);
  });

  it('normalizes a legacy room found by a valid invite hash lookup', () => {
    const legacy = createMultiplayerRoom({
      config: defaultMultiplayerRoomConfig,
      hostDisplayName: 'Kai',
      hostPlayerId: 'player-host',
      hostUserId,
      roomCode: '724826',
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }, { nowMs: 1_000 });
    const raw = { ...legacy } as Partial<MultiplayerCoordinatorState>;
    delete raw.completionReason;
    delete raw.sessionNumber;

    expect(parseJoinableMultiplayerRoom({
      canonicalState: raw,
      roomId: legacy.roomId,
    })?.canonicalState).toMatchObject({ sessionNumber: 1 });
  });
});
