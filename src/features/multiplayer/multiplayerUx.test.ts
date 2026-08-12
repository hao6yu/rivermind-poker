import { describe, expect, it } from 'vitest';

import { applyMultiplayerCommand, canStartMultiplayerRoom } from '../../domain/multiplayer/coordinator';
import type { MultiplayerRoomCommand } from '../../domain/multiplayer/contracts';
import {
  defaultMultiplayerDraft,
  isValidMultiplayerDisplayName,
  isValidMultiplayerRoomCode,
  multiplayerSeatAnchor,
  normalizeMultiplayerRoomCode,
} from './multiplayerUx';
import {
  createMultiplayerLobbyState,
  multiplayerLobbySeats,
  multiplayerLobbyViewerUserId,
} from './multiplayerLobbyState';
import {
  phase9EnglishMessages,
  phase9SimplifiedMessages,
  phase9TraditionalMessages,
} from '../../localization/phase9Messages';

describe('multiplayer room entry', () => {
  it('accepts exactly six numeric digits for a room code', () => {
    expect(normalizeMultiplayerRoomCode('room 72-48-26')).toBe('724826');
    expect(normalizeMultiplayerRoomCode('123456789')).toBe('123456');
    expect(isValidMultiplayerRoomCode('724826')).toBe(true);
    expect(isValidMultiplayerRoomCode('72482')).toBe(false);
    expect(isValidMultiplayerRoomCode('ABC234')).toBe(false);
  });

  it('requires a short but meaningful display name', () => {
    expect(isValidMultiplayerDisplayName(' A ')).toBe(false);
    expect(isValidMultiplayerDisplayName(' River ')).toBe(true);
    expect(isValidMultiplayerDisplayName('x'.repeat(19))).toBe(false);
  });

  it('uses chips rather than big-blind units throughout game-facing copy', () => {
    [phase9EnglishMessages, phase9SimplifiedMessages, phase9TraditionalMessages].forEach((messages) => {
      const gameFacingCopy = Object.entries(messages)
        .filter(([key]) => key.startsWith('multiplayer.'))
        .map(([, value]) => value)
        .join(' ');
      expect(gameFacingCopy).not.toMatch(/\bBB\b|big blinds?/i);
    });
    expect(phase9EnglishMessages['multiplayer.option.chips']).toContain('chips');
  });
});

describe('multiplayer lobby preview', () => {
  it('creates a host lobby with only the viewer occupied', () => {
    const state = createMultiplayerLobbyState('create', {
      ...defaultMultiplayerDraft,
      playerName: 'Kai',
    }, '724826', 1_000);
    const seats = multiplayerLobbySeats(state, multiplayerLobbyViewerUserId('create'));
    expect(seats).toHaveLength(3);
    expect(seats[0]).toMatchObject({ displayName: 'Kai', isHost: true, isViewer: true, kind: 'human' });
    expect(seats.slice(1).every((seat) => seat.kind === 'open')).toBe(true);
  });

  it('creates a joined lobby with a ready remote host', () => {
    const state = createMultiplayerLobbyState('join', {
      ...defaultMultiplayerDraft,
      playerName: 'Kai',
      seatCount: 6,
    }, '724826', 1_000);
    const seats = multiplayerLobbySeats(state, multiplayerLobbyViewerUserId('join'));
    expect(seats.filter((seat) => seat.kind === 'human')).toHaveLength(2);
    expect(seats.find((seat) => seat.isHost)).toMatchObject({ displayName: 'Mina', ready: true });
    expect(seats.find((seat) => seat.isViewer)).toMatchObject({ displayName: 'Kai', ready: false });
    expect(seats.filter((seat) => seat.kind === 'ai')).toHaveLength(1);
  });

  it('uses coordinator commands for ready and AI seat changes', () => {
    let state = createMultiplayerLobbyState('create', {
      ...defaultMultiplayerDraft,
      playerName: 'Kai',
    }, '724826', 1_000);
    const send = (command: MultiplayerRoomCommand) => {
      state = applyMultiplayerCommand(state, command, { nowMs: 1_100 + state.version }).state;
    };
    send({
      actorUserId: multiplayerLobbyViewerUserId('create'),
      commandId: 'ready',
      expectedVersion: state.version,
      ready: true,
      type: 'set-ready',
    });
    expect(canStartMultiplayerRoom(state)).toBe(false);
    send({
      actorUserId: multiplayerLobbyViewerUserId('create'),
      commandId: 'add-ai',
      expectedVersion: state.version,
      seat: 1,
      type: 'add-ai',
    });
    expect(canStartMultiplayerRoom(state)).toBe(true);
    send({
      actorUserId: multiplayerLobbyViewerUserId('create'),
      commandId: 'remove-ai',
      expectedVersion: state.version,
      seat: 1,
      type: 'remove-ai',
    });
    expect(canStartMultiplayerRoom(state)).toBe(false);
  });

  it('provides unique anchors for every supported table size', () => {
    ([2, 3, 6] as const).forEach((count) => {
      const anchors = Array.from({ length: count }, (_, seat) => multiplayerSeatAnchor(count, seat));
      expect(new Set(anchors.map((anchor) => `${anchor.left}:${anchor.top}`)).size).toBe(count);
    });
  });
});
