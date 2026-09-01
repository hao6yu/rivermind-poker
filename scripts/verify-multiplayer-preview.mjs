import assert from 'node:assert/strict';
import {
  MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
} from '../src/domain/multiplayer/contracts.ts';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/u, '');
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const smokeAdminKey = process.env.SUPABASE_SMOKE_ADMIN_KEY;
const legacyFunctionName = 'multiplayer-room';
const targetFunctionName = process.env.MULTIPLAYER_SMOKE_FUNCTION_NAME
  ?? 'multiplayer-room-preview';
const allowedTargetFunctions = new Set([
  'multiplayer-room-preview',
  'multiplayer-room-v4',
]);
const expectedSnapshotProtocol = targetFunctionName === 'multiplayer-room-v4' ? 4 : 3;
const isStableV4 = targetFunctionName === 'multiplayer-room-v4';

assert.ok(supabaseUrl, 'EXPO_PUBLIC_SUPABASE_URL is required.');
assert.ok(publishableKey, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.');
assert.ok(
  allowedTargetFunctions.has(targetFunctionName),
  `Unsupported hosted multiplayer smoke target: ${targetFunctionName}`,
);

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

// Version-7 public clients predate the live capability field. These payloads
// intentionally mirror that shipped boundary so the hosted release smoke can
// prove that sharing one database does not allow either worker lane to mutate
// the other's rooms.
function legacyCreateRequest(input) {
  return {
    config: input.config,
    displayName: input.displayName,
    hostAvatar: null,
    hostSeat: 0,
    operation: 'create',
  };
}

function legacyJoinRequest(input) {
  return {
    avatar: null,
    displayName: input.displayName,
    operation: 'join',
    roomCode: input.roomCode,
    seat: null,
    supportedSeatCounts: [2, 3, 6],
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
  return {
    payload,
    retryAfter: response.headers.get('retry-after'),
    status: response.status,
  };
}

async function createAnonymousUser() {
  const response = await jsonRequest(`${supabaseUrl}/auth/v1/signup`, {
    body: '{}',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    method: 'POST',
  });
  const authCode = response.payload?.error_code ?? response.payload?.code ?? 'unknown';
  const authMessage = response.payload?.msg ?? response.payload?.message ?? 'No error message returned.';
  const retryAfter = response.retryAfter ? ` Retry after ${response.retryAfter}.` : '';
  assert.equal(
    response.status,
    200,
    `Anonymous sign-in failed (HTTP ${response.status}, code ${authCode}): ${authMessage}${retryAfter}`,
  );
  assert.equal(typeof response.payload?.access_token, 'string');
  assert.equal(typeof response.payload?.user?.id, 'string');
  const user = {
    accessToken: response.payload.access_token,
    userId: response.payload.user.id,
  };
  users.push(user);
  return user;
}

async function createManagedSmokeUser() {
  const email = `multiplayer-smoke-${crypto.randomUUID()}@example.invalid`;
  const password = `Smoke-${crypto.randomUUID()}-aA1!`;
  const created = await jsonRequest(`${supabaseUrl}/auth/v1/admin/users`, {
    body: JSON.stringify({
      email,
      email_confirm: true,
      password,
      user_metadata: { purpose: 'multiplayer-release-smoke' },
    }),
    headers: {
      apikey: smokeAdminKey,
      authorization: `Bearer ${smokeAdminKey}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  assert.equal(
    created.status,
    200,
    `Managed smoke-user provisioning failed (HTTP ${created.status}).`,
  );
  assert.equal(typeof created.payload?.id, 'string');

  const signedIn = await jsonRequest(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    method: 'POST',
  });
  if (signedIn.status !== 200 || typeof signedIn.payload?.access_token !== 'string') {
    await jsonRequest(`${supabaseUrl}/auth/v1/admin/users/${created.payload.id}`, {
      headers: {
        apikey: smokeAdminKey,
        authorization: `Bearer ${smokeAdminKey}`,
      },
      method: 'DELETE',
    });
  }
  assert.equal(
    signedIn.status,
    200,
    `Managed smoke-user sign-in failed (HTTP ${signedIn.status}).`,
  );
  assert.equal(typeof signedIn.payload?.access_token, 'string');
  assert.equal(typeof signedIn.payload?.user?.id, 'string');
  const user = {
    accessToken: signedIn.payload.access_token,
    userId: signedIn.payload.user.id,
  };
  users.push(user);
  return user;
}

async function createDisposableUser() {
  return smokeAdminKey ? createManagedSmokeUser() : createAnonymousUser();
}

async function invokeAt(functionName, user, body) {
  return jsonRequest(`${functionsUrl}/${functionName}`, {
    body: JSON.stringify(body),
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${user.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
}

async function invoke(user, body) {
  return invokeAt(targetFunctionName, user, body);
}

function assertSnapshotResponse(response, expectedStatus, operation) {
  const errorCode = response.payload?.error?.code ?? 'unknown';
  const errorMessage = response.payload?.error?.message ?? 'No error message returned.';
  const validationIssue = response.payload?.error?.validationIssue;
  assert.equal(
    response.status,
    expectedStatus,
    `${operation} failed (HTTP ${response.status}, code ${errorCode}${validationIssue ? `, field ${validationIssue}` : ''}): ${errorMessage}`,
  );
  assert.equal(typeof response.payload?.snapshot?.roomId, 'string');
  assert.equal(response.payload.snapshot.protocolVersion, expectedSnapshotProtocol);
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
  const host = await createDisposableUser();
  const guest = await createDisposableUser();
  const legacyIntruder = isStableV4 ? await createDisposableUser() : null;
  const legacyHost = isStableV4 ? await createDisposableUser() : null;
  const currentIntruder = isStableV4 ? await createDisposableUser() : null;
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
  assert.match(snapshot.roomCode, isStableV4 ? /^4\d{6}$/u : /^\d{6}$/u);
  // Room-id sync deliberately cannot recover the unhashed invite code from
  // persistence. Retain the create response's code for the later guest join
  // instead of replacing it with the sync projection's empty roomCode.
  const createdRoomCode = snapshot.roomCode;
  assert.equal(snapshot.seats.length, 1);

  if (isStableV4 && legacyIntruder) {
    const legacyJoinCurrentRoom = await invokeAt(
      legacyFunctionName,
      legacyIntruder,
      legacyJoinRequest({
        displayName: 'Legacy Intruder',
        roomCode: snapshot.roomCode,
      }),
    );
    assert.notEqual(
      legacyJoinCurrentRoom.status,
      200,
      'The legacy public worker admitted an old client into a current-lane room.',
    );
    const afterLegacyAttempt = await invoke(host, {
      operation: 'sync',
      protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION,
      roomId: snapshot.roomId,
    });
    snapshot = assertSnapshotResponse(afterLegacyAttempt, 200, 'sync after legacy refusal');
    assert.equal(snapshot.seats.length, 1, 'A refused legacy join changed current-room membership.');
  }

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
    roomCode: createdRoomCode,
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

  if (isStableV4 && legacyHost && currentIntruder) {
    const legacyCreated = await invokeAt(
      legacyFunctionName,
      legacyHost,
      legacyCreateRequest({ config, displayName: 'Legacy Host' }),
    );
    assert.equal(
      legacyCreated.status,
      201,
      `Legacy create failed (HTTP ${legacyCreated.status}, code ${legacyCreated.payload?.error?.code ?? 'unknown'}).`,
    );
    assert.match(legacyCreated.payload?.roomCode, /^\d{6}$/u);
    assert.equal(legacyCreated.payload?.snapshot?.protocolVersion, 2);

    const currentJoinLegacyRoom = await invoke(
      currentIntruder,
      joinRequest({
        displayName: 'Current Intruder',
        roomCode: legacyCreated.payload.roomCode,
      }),
    );
    assert.equal(
      currentJoinLegacyRoom.status,
      400,
      `The current worker did not refuse a legacy-lane code (HTTP ${currentJoinLegacyRoom.status}).`,
    );
    assert.equal(currentJoinLegacyRoom.payload?.error?.code, 'request_invalid');

    const legacyAfterCurrentAttempt = await invokeAt(legacyFunctionName, legacyHost, {
      operation: 'sync',
      roomId: legacyCreated.payload.roomId,
    });
    assert.equal(legacyAfterCurrentAttempt.status, 200);
    assert.equal(
      legacyAfterCurrentAttempt.payload?.snapshot?.seats?.length,
      1,
      'A refused current-client join changed legacy-room membership.',
    );
  }

  const laneEvidence = isStableV4 ? 'cross-lane refusal, ' : '';
  console.log(`Hosted ${targetFunctionName} multiplayer passed ${laneEvidence}avatar authorization, create, join, liveness, ready, start, sync, settlement, and the canonical ten-second next-hand interval with disposable real identities.`);
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
