import assert from 'node:assert/strict';
import {
  MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
} from '../src/domain/multiplayer/contracts.ts';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/u, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const previewFunctionName = 'multiplayer-room-preview';

assert.ok(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL is required.');
assert.ok(publishableKey, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.');

const functionsUrl = `${supabaseUrl}/functions/v1`;
const users = [];
let commandCounter = 0;

// Hosted smoke payloads intentionally mirror the production builders. The
// unit and local real-HTTP gates bind those builders to this same wire shape;
// this script exercises the independently deployed route without a TS loader.
function createRequest(input) {
  return {
    config: input.config,
    displayName: input.displayName,
    hostAvatar: null,
    operation: 'create',
    protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
  };
}

function joinRequest(input) {
  return {
    avatar: null,
    displayName: input.displayName,
    operation: 'join',
    protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
    roomCode: input.roomCode,
    seat: null,
    supportedSeatCounts: [2, 3, 6, 9],
  };
}

function commandRequest(roomId, commandId, expectedVersion, command) {
  return {
    command: { ...command, commandId, expectedVersion },
    operation: 'command',
    protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
    roomId,
  };
}

function livenessRequest(roomId) {
  return {
    operation: 'liveness',
    protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
    roomId,
  };
}

async function jsonRequest(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  return { payload, status: response.status };
}

async function createAnonymousUser() {
  const response = await jsonRequest(`${supabaseUrl}/auth/v1/signup`, {
    body: '{}',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    method: 'POST',
  });
  assert.equal(response.status, 200, `Anonymous sign-in failed (HTTP ${response.status}).`);
  assert.equal(typeof response.payload?.access_token, 'string');
  assert.equal(typeof response.payload?.user?.id, 'string');
  const user = {
    accessToken: response.payload.access_token,
    userId: response.payload.user.id,
  };
  users.push(user);
  return user;
}

async function invoke(user, body) {
  return jsonRequest(`${functionsUrl}/${previewFunctionName}`, {
    body: JSON.stringify(body),
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${user.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}

function assertSnapshotResponse(response, expectedStatus, operation) {
  assert.equal(
    response.status,
    expectedStatus,
    `${operation} failed (HTTP ${response.status}, code ${response.payload?.error?.code ?? 'unknown'}).`,
  );
  assert.equal(typeof response.payload?.snapshot?.roomId, 'string');
  assert.equal(response.payload.snapshot.protocolVersion, 3);
  return response.payload.snapshot;
}

async function command(user, snapshot, commandBody) {
  commandCounter += 1;
  const response = await invoke(user, commandRequest(
    snapshot.roomId,
    `hosted-preview-smoke:${commandCounter}`,
    snapshot.version,
    commandBody,
  ));
  return assertSnapshotResponse(response, 200, commandBody.type);
}

async function deleteAnonymousUser(user) {
  const response = await jsonRequest(`${functionsUrl}/delete-account`, {
    body: JSON.stringify({ confirmation: 'delete-account' }),
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${user.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  if (response.status !== 200 || response.payload?.deleted !== true) {
    throw new Error(`Disposable account cleanup failed (HTTP ${response.status}).`);
  }
}

let primaryError = null;
try {
  const host = await createAnonymousUser();
  const guest = await createAnonymousUser();
  const config = {
    aiDifficulty: 'club',
    bigBlindChips: 20,
    handTarget: 'open',
    seatCount: 2,
    smallBlindChips: 10,
    startingStackChips: 4_000,
    turnSeconds: 45,
  };

  const created = await invoke(host, createRequest({
    config,
    displayName: 'Preview Host',
  }));
  let snapshot = assertSnapshotResponse(created, 201, 'create');
  const hostPlayerId = snapshot.viewerPlayerId;
  assert.match(snapshot.roomCode, /^\d{6}$/u);
  assert.equal(snapshot.seats.length, 1);

  // The private avatar reader is a separate hosted dependency. A malformed
  // avatar id from a valid room member must reach its authorization boundary
  // (403), rather than a missing route or unauthenticated proxy response.
  const avatarBoundary = await jsonRequest(
    `${functionsUrl}/avatar-access/${snapshot.roomId}/not-an-avatar-id`,
    {
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${host.accessToken}`,
      },
      method: 'GET',
    },
  );
  assert.equal(avatarBoundary.status, 403);
  assert.equal(avatarBoundary.payload?.error?.code, 'not_authorized');

  const joined = await invoke(guest, joinRequest({
    displayName: 'Preview Guest',
    roomCode: snapshot.roomCode,
  }));
  snapshot = assertSnapshotResponse(joined, 200, 'join');
  const guestPlayerId = snapshot.viewerPlayerId;
  assert.equal(snapshot.seats.length, 2);

  for (const user of [host, guest]) {
    const liveness = await invoke(user, livenessRequest(snapshot.roomId));
    assert.equal(liveness.status, 200, `liveness failed (HTTP ${liveness.status}).`);
    assert.equal(liveness.payload?.renewed, true);
  }

  snapshot = await command(host, snapshot, { ready: true, type: 'set-ready' });
  snapshot = await command(guest, snapshot, { ready: true, type: 'set-ready' });
  snapshot = await command(host, snapshot, { type: 'start' });
  assert.equal(snapshot.status, 'playing');
  assert.equal(snapshot.seats.length, 2);
  assert.equal(snapshot.hand?.handNumber, 1);

  const synced = await invoke(guest, {
    operation: 'sync',
    protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
    roomId: snapshot.roomId,
  });
  const guestSnapshot = assertSnapshotResponse(synced, 200, 'sync');
  assert.equal(guestSnapshot.status, 'playing');

  // Settle a deterministic first hand and prove the independently deployed
  // preview worker carries the same ten-second authority as the source gate.
  // This catches the exact device failure where a new client is installed but
  // an older hosted worker still exposes a five- or seven-second window.
  const actorPlayerId = snapshot.hand?.toAct;
  assert.ok(actorPlayerId, 'The hosted hand has no actor.');
  const actor = actorPlayerId === hostPlayerId
    ? host
    : actorPlayerId === guestPlayerId ? guest : null;
  assert.ok(actor, `The hosted hand actor ${actorPlayerId} is not one of the two human seats.`);
  const actorSnapshot = actor === host ? snapshot : guestSnapshot;
  const settled = await command(actor, actorSnapshot, { action: { type: 'fold' }, type: 'action' });
  assert.equal(settled.status, 'between-hands');
  assert.ok(settled.hand?.outcome, 'The hosted fold did not publish a settled outcome.');
  assert.equal(
    settled.nextHandAtMs - settled.updatedAtMs,
    10_000,
    'The hosted preview worker did not arm the canonical ten-second next-hand interval.',
  );

  console.log('Hosted preview multiplayer passed avatar authorization, create, join, liveness, ready, start, sync, settlement, and the canonical ten-second next-hand interval with two real identities.');
} catch (error) {
  primaryError = error;
} finally {
  let cleanupError = null;
  for (const user of users.reverse()) {
    try {
      await deleteAnonymousUser(user);
    } catch (error) {
      cleanupError ??= error;
    }
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
}
