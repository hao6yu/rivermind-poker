import { describe, expect, it } from 'vitest';

import {
  authorizeAvatarAccess,
  handleAvatarAccess,
  type AvatarAccessBackend,
} from './handler';
import type {
  MultiplayerCoordinatorState,
  MultiplayerSeatState,
} from '../../../src/domain/multiplayer/contracts.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const SELF = 'abcdef0123456789';
const OTHER_AVATAR = 'fedcba9876543210';
const ROOM_X_AVATAR = 'aa00aa11aa22aa33';
const ROOM_Y_AVATAR = 'bb44bb55bb66bb77';
const ARBITRARY = 'cafebabecafebab0';

function get(url: string): Request {
  return new Request(`https://example.test/functions/v1/${url}`, { method: 'GET' });
}

/** A minimal, valid coordinator state carrying only the seats we care about. */
function coordinatorState(
  seats: MultiplayerSeatState[],
  roomId = 'room-1',
): MultiplayerCoordinatorState {
  return {
    config: {
      aiDifficulty: 'friendly',
      bigBlindChips: 10,
      handTarget: 'open',
      seatCount: 3,
      smallBlindChips: 5,
      startingStackChips: 1000,
      turnSeconds: 45,
    },
    completionReason: null,
    createdAtMs: 0,
    hand: null,
    hostPlayerId: seats[0]?.playerId ?? 'host',
    processedCommands: [],
    resumeStatus: 'playing',
    roomCode: 'ROOMID',
    roomId,
    seats,
    sessionNumber: 1,
    status: 'playing',
    turnDeadlineAtMs: null,
    updatedAtMs: 0,
    version: 1,
  } as unknown as MultiplayerCoordinatorState;
}

/** A human seat, optionally owned by `ownerId` with an uploaded avatar. */
function seat(overrides: Partial<MultiplayerSeatState> = {}): MultiplayerSeatState {
  return {
    aiProfileId: null,
    avatar: null,
    connection: 'online',
    control: 'human',
    displayName: 'Seat',
    isHost: false,
    joinedAtMs: 0,
    kind: 'human',
    missedTurns: 0,
    playerId: 'player',
    ready: false,
    seat: 0,
    userId: null,
    ...overrides,
  } as unknown as MultiplayerSeatState;
}

function uploadedAvatarSeat(
  ownerId: string,
  avatarId: string,
  version = 1,
): MultiplayerSeatState {
  return seat({
    userId: ownerId,
    avatar: { kind: 'uploaded', avatarId, version },
  });
}

interface Harness {
  backend: AvatarAccessBackend;
  loads: Record<string, number>;
}

/** A minimal WebP magic header: 'RIFF' + 4 bytes + 'WEBP' (offsets 0 and 8). */
const WEBP_MAGIC = new Blob(['RIFF0000WEBP'], { type: 'image/webp' });
/** A PNG magic header: 89 50 4E 47 0D 0A 1A 0A. */
const PNG_MAGIC = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' });

/** A backend bound to a set of rooms; the avatar object always resolves. */
function boundBackend(rooms: Record<string, MultiplayerCoordinatorState | null>): Harness {
  const loads: Record<string, number> = {};
  return {
    loads,
    backend: {
      loadRoom: async (roomId) => {
        loads[roomId] = (loads[roomId] ?? 0) + 1;
        return rooms[roomId] ?? null;
      },
      downloadAvatar: async () => ({ data: WEBP_MAGIC, error: null }),
    },
  };
}

describe('avatar-access authorizeAvatarAccess', () => {
  it('authorizes a room member reading their own uploaded avatar', () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    expect(authorizeAvatarAccess(room, USER, SELF)).toEqual({ ownerId: USER });
  });

  it('authorizes a room member reading another seats avatar in the same room', () => {
    const room = coordinatorState([
      uploadedAvatarSeat(USER, SELF),
      uploadedAvatarSeat(OTHER, OTHER_AVATAR),
    ]);
    // Same-room avatars are shared identity; any member may resolve them.
    expect(authorizeAvatarAccess(room, USER, OTHER_AVATAR)).toEqual({ ownerId: OTHER });
  });

  it('denies a caller who is not a member of the room', () => {
    const room = coordinatorState([uploadedAvatarSeat(OTHER, OTHER_AVATAR)]);
    expect(authorizeAvatarAccess(room, USER, OTHER_AVATAR)).toBeNull();
  });

  it('denies an avatar id that is not a human seat uploaded avatar', () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    expect(authorizeAvatarAccess(room, USER, ARBITRARY)).toBeNull();
  });

  it('denies an avatar carried by an AI seat', () => {
    const room = coordinatorState([seat({ avatar: { kind: 'authored', id: 'human-ash' } })]);
    expect(authorizeAvatarAccess(room, USER, 'human-ash')).toBeNull();
  });

  it('denies a state that is absent (expired room)', () => {
    expect(authorizeAvatarAccess(null, USER, SELF)).toBeNull();
  });
});

describe('avatar-access handleAvatarAccess', () => {
  it('returns the image bytes for a same-room avatar', async () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const { backend, loads } = boundBackend({ 'room-1': room });

    const response = await handleAvatarAccess(get(`/avatar-access/room-1/${SELF}`), USER, backend);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(loads['room-1']).toBe(1);
  });

  it('rejects a POST as method-not-allowed', async () => {
    const harness = boundBackend({ 'room-1': coordinatorState([uploadedAvatarSeat(USER, SELF)]) });
    const response = await handleAvatarAccess(new Request(
      'https://example.test/functions/v1/avatar-access/room-1/abcdef0123456789',
      { method: 'POST' },
    ), USER, harness.backend);
    expect(response.status).toBe(405);
  });

  it('rejects a request that is not the avatar-access path', async () => {
    const harness = boundBackend({ 'room-1': coordinatorState([uploadedAvatarSeat(USER, SELF)]) });
    const response = await handleAvatarAccess(
      new Request('https://example.test/functions/v1/some-other-function', { method: 'GET' }),
      USER,
      harness.backend,
    );
    expect(response.status).toBe(404);
  });

  it('rejects an unauthenticated caller', async () => {
    const harness = boundBackend({ 'room-1': coordinatorState([uploadedAvatarSeat(USER, SELF)]) });
    const response = await handleAvatarAccess(get('/avatar-access/room-1/abcdef0123456789'), null, harness.backend);
    expect(response.status).toBe(401);
  });

  it('rejects an over-long room id', async () => {
    const harness = boundBackend({ 'room-1': coordinatorState([uploadedAvatarSeat(USER, SELF)]) });
    expect(
      (await handleAvatarAccess(get(`/avatar-access/${'r'.repeat(200)}/abcdef0123456789`), USER, harness.backend)).status,
    ).toBe(400);
  });

  it('rejects an over-long or non-hex avatar id (never unguessable-id authorization)', async () => {
    const harness = boundBackend({ 'room-1': coordinatorState([uploadedAvatarSeat(USER, SELF)]) });
    expect(
      (await handleAvatarAccess(get(`/avatar-access/room-1/${'z'.repeat(200)}`), USER, harness.backend)).status,
    ).toBe(403);
    expect(
      (await handleAvatarAccess(get('/avatar-access/room-1/zzzzzzzz-z'), USER, harness.backend)).status,
    ).toBe(403);
  });

  it('refuses a cross-room request for another rooms avatar id', async () => {
    // Another room carries ROOM_Y_AVATAR. A request issued against room-x's id
    // is resolved against room-x's state, so any foreign id is a 403.
    const roomX = coordinatorState([uploadedAvatarSeat(USER, ROOM_X_AVATAR)], 'room-x');
    const roomY = coordinatorState([uploadedAvatarSeat(USER, ROOM_Y_AVATAR)], 'room-y');
    const harness = boundBackend({ 'room-x': roomX, 'room-y': roomY });
    const response = await handleAvatarAccess(get('/avatar-access/room-x/abcd0123abcd0123'), USER, harness.backend);
    expect(response.status).toBe(403);
    // And the object in room-x cannot be pulled under room-y's id.
    const spoofed = await handleAvatarAccess(get('/avatar-access/room-y/abcd0123abcd0123'), USER, harness.backend);
    expect(spoofed.status).toBe(403);
  });

  it('refuses an arbitrary avatar id against a valid room', async () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const harness = boundBackend({ 'room-1': room });
    const response = await handleAvatarAccess(get(`/avatar-access/room-1/${ARBITRARY}`), USER, harness.backend);
    expect(response.status).toBe(403);
  });

  it('refuses an expired room', async () => {
    const harness = boundBackend({ 'room-1': null });
    const response = await handleAvatarAccess(get('/avatar-access/room-1/abcdef0123456789'), USER, harness.backend);
    expect(response.status).toBe(403);
  });

  it('maps a storage error to a retryable failure', async () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const backend: AvatarAccessBackend = {
      loadRoom: async () => room,
      downloadAvatar: async () => ({ data: null, error: { message: 'object not found' } }),
    };
    const response = await handleAvatarAccess(get('/avatar-access/room-1/abcdef0123456789'), USER, backend);
    expect(response.status).toBe(500);
  });

  it('maps a missing avatar object to a not-found failure', async () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const backend: AvatarAccessBackend = {
      loadRoom: async () => room,
      downloadAvatar: async () => ({ data: null, error: null }),
    };
    const response = await handleAvatarAccess(get('/avatar-access/room-1/abcdef0123456789'), USER, backend);
    expect(response.status).toBe(404);
  });

  it('maps a failed room load to a retryable failure', async () => {
    const backend: AvatarAccessBackend = {
      loadRoom: async () => {
        throw new Error('boom');
      },
      downloadAvatar: async () => ({ data: null, error: null }),
    };
    const response = await handleAvatarAccess(get('/avatar-access/room-1/abcdef0123456789'), USER, backend);
    expect(response.status).toBe(500);
  });

  it('serves a PNG object with its own content type', async () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const backend: AvatarAccessBackend = {
      loadRoom: async () => room,
      downloadAvatar: async () => ({ data: PNG_MAGIC, error: null }),
    };
    const response = await handleAvatarAccess(get(`/avatar-access/room-1/${SELF}`), USER, backend);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('serves the DETECTED mime, never the client-asserted storage metadata', async () => {
    // PNG magic bytes carried by a Blob whose `type` claims image/webp — the
    // object was stored with mismatched metadata. The response must use the
    // magic-byte-validated mime (image/png), not the storage label.
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const mislabeled = new Blob([PNG_MAGIC], { type: 'image/webp' });
    const backend: AvatarAccessBackend = {
      loadRoom: async () => room,
      downloadAvatar: async () => ({ data: mislabeled, error: null }),
    };
    const response = await handleAvatarAccess(get(`/avatar-access/room-1/${SELF}`), USER, backend);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('refuses bytes that are not a supported image (content-bounded delivery)', async () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const backend: AvatarAccessBackend = {
      loadRoom: async () => room,
      downloadAvatar: async () => ({ data: new Blob(['not an image at all'], { type: 'image/webp' }), error: null }),
    };
    const response = await handleAvatarAccess(get(`/avatar-access/room-1/${SELF}`), USER, backend);
    expect(response.status).toBe(500);
  });

  it('refuses true AVIF bytes (client images are re-encoded to WebP)', async () => {
    const room = coordinatorState([uploadedAvatarSeat(USER, SELF)]);
    const avif = new Blob([new Uint8Array([0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66])], { type: 'image/avif' });
    const backend: AvatarAccessBackend = {
      loadRoom: async () => room,
      downloadAvatar: async () => ({ data: avif, error: null }),
    };
    const response = await handleAvatarAccess(get(`/avatar-access/room-1/${SELF}`), USER, backend);
    expect(response.status).toBe(500);
  });
});

describe('R5 — a permanently departed seat loses avatar authorization', () => {
  it('denies the departed account while current members keep reading the departed avatar', () => {
    const departed = uploadedAvatarSeat('user-departed', 'avatar-departed');
    const current = uploadedAvatarSeat('user-current', 'avatar-current');
    departed.participation = 'left';
    const state = {
      roomId: 'room-1',
      seats: [departed, current],
    } as unknown as MultiplayerCoordinatorState;

    // The departed account is no longer a member: its own avatar (and any
    // avatar in the room) is refused for it.
    expect(authorizeAvatarAccess(state, 'user-departed', 'avatar-departed')).toBeNull();
    expect(authorizeAvatarAccess(state, 'user-departed', 'avatar-current')).toBeNull();

    // Current members still see the departed seat's uploaded avatar through
    // the normal room-authorized path (settlement/ledger identity remains).
    expect(authorizeAvatarAccess(state, 'user-current', 'avatar-departed')).toEqual({ ownerId: 'user-departed' });
    expect(authorizeAvatarAccess(state, 'user-current', 'avatar-current')).toEqual({ ownerId: 'user-current' });

    // A disconnected (recoverable) seat KEEPS its access — only permanent
    // leave revokes.
    const disconnected = uploadedAvatarSeat('user-disconnected', 'avatar-disconnected');
    disconnected.participation = 'disconnected';
    const recoverable = {
      roomId: 'room-1',
      seats: [disconnected],
    } as unknown as MultiplayerCoordinatorState;
    expect(authorizeAvatarAccess(recoverable, 'user-disconnected', 'avatar-disconnected'))
      .toEqual({ ownerId: 'user-disconnected' });
  });
});
