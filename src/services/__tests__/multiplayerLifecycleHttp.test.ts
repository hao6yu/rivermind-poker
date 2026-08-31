import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MULTIPLAYER_PROTOCOL_VERSION } from '../../domain/multiplayer/contracts';
import { buildPublicPlayerRecordSnapshot } from '../../domain/multiplayer/playerRecordSnapshot';
import type { PlayStatistics } from '../../domain/stats/playStatistics';
import {
  multiplayerSnapshotRequiresUpdate,
  parseMultiplayerRoomEnvelope,
  type MultiplayerRoomEnvelope,
} from '../multiplayerContract';
import {
  buildCreateMultiplayerTableRequest,
  buildJoinMultiplayerTableRequest,
  buildMultiplayerCommandRequest,
} from '../multiplayerRequest';

/**
 * Slice 3.11 hardening — REAL authenticated HTTP lifecycle harness.
 *
 * Every request in this file travels through the actual local Edge worker
 * (`supabase functions serve` behind the local Kong gateway) with a real
 * anonymous-auth session, and every response is parsed by the REAL client
 * parser (`parseMultiplayerRoomEnvelope`) — including its transitions — so
 * response-contract defects cannot hide behind hand-reconstructed snapshots.
 *
 * Explicit invocation (it is excluded from the default `pnpm test` run):
 *
 *   pnpm test:multiplayer-integration
 *
 * Prerequisites: the local Supabase stack must be running (`supabase start`)
 * and Docker must be available. The harness reuses a worker that already
 * answers at the contract boundary; otherwise it resets THIS project's edge
 * runtime container and spawns its own `supabase functions serve` (which it
 * stops afterwards). Cleanup removes only the disposable users this run
 * created. Missing prerequisites FAIL the run — they never silently skip it.
 *
 * Secrets policy: `supabase status -o env` output is parsed in memory and is
 * NEVER printed — not in logs, not in error messages, not in diagnostics.
 */

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function resolveTool(envName: string, candidates: string[]): string {
  const override = process.env[envName];
  if (override) return override;
  const found = candidates.find((candidate) => existsSync(candidate));
  // Returning the first candidate lets the spawn fail with a clear error
  // instead of a silently wrong binary.
  return found ?? candidates[0]!;
}

const SUPABASE_BIN = resolveTool('SUPABASE_BIN', [
  '/usr/local/bin/supabase',
  '/opt/homebrew/bin/supabase',
]);
const DOCKER_BIN = resolveTool('DOCKER_BIN', [
  '/Applications/Docker.app/Contents/Resources/bin/docker',
  '/usr/local/bin/docker',
  '/opt/homebrew/bin/docker',
]);
// The supabase CLI shells out to docker; a bare inherited vitest/dev PATH can
// poison its project resolution, so the child gets a minimal known-good env.
const DOCKER_BIN_DIR = dirname(DOCKER_BIN);
const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  HOME: process.env.HOME ?? '/tmp',
  PATH: `${DOCKER_BIN_DIR}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
};
childEnv.NODE_ENV = 'test';
childEnv.NODE_PATH = '';

const EDGE_RUNTIME_CONTAINER = 'supabase_edge_runtime_rivermind-poker';

interface LocalEnv {
  apiUrl: string;
  clientKey: string;
  functionsUrl: string;
  serviceRoleKey: string;
}

interface TestUser {
  accessToken: string;
  userId: string;
}

/** A stable binding between an authenticated identity and its seat player id. */
interface SeatPlayer {
  label: string;
  user: TestUser;
  playerId: string;
}

let environment: LocalEnv | null = null;
const users: TestUser[] = [];
let spawnedServe: ReturnType<typeof spawn> | null = null;
let serveOutput = '';
let commandCounter = 0;

function assertLocalEnv(): LocalEnv {
  if (!environment) throw new Error('The local Supabase environment was not initialized.');
  return environment;
}

function parseEnvOutput(output: string): Record<string, string> {
  return Object.fromEntries(output
    .split(/\r?\n/u)
    .flatMap((line) => {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/u.exec(line.trim());
      if (!match) return [];
      try {
        return [[match[1]!, JSON.parse(match[2]!)] as const];
      } catch {
        return [[match[1]!, match[2]!] as const];
      }
    }));
}

/** Contract-boundary probe: a JSON-garbage POST must be answered by the real
 * parser (400 request_invalid). Anything else (5xx, network error, 401 from a
 * missing route) means the worker is not serving this function yet. */
async function probeContractBoundary(env: LocalEnv, user: TestUser): Promise<boolean> {
  const response = await fetch(`${env.functionsUrl}/multiplayer-room`, {
    body: '{',
    headers: {
      apikey: env.clientKey,
      authorization: `Bearer ${user.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  }).catch(() => null);
  if (!response) return false;
  const payload = await response.json().catch(() => null);
  return response.status === 400 && payload?.error?.code === 'request_invalid';
}

beforeAll(async () => {
  const status = spawnSync(SUPABASE_BIN, ['status', '-o', 'env'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: childEnv,
  });
  const values = parseEnvOutput(status.stdout ?? '');
  const clientKey = values.PUBLISHABLE_KEY || values.ANON_KEY;
  // Only exit codes and missing-key NAMES may surface in errors — never the
  // status output itself, which carries service-role secrets.
  if (status.status !== 0) {
    throw new Error(`The local Supabase stack is not running (supabase status exit ${status.status}). Start it with \`supabase start\`.`);
  }
  if (!clientKey || !values.API_URL || !values.SERVICE_ROLE_KEY) {
    const missing = [
      !values.API_URL && 'API_URL',
      !clientKey && 'PUBLISHABLE_KEY/ANON_KEY',
      !values.SERVICE_ROLE_KEY && 'SERVICE_ROLE_KEY',
    ].filter(Boolean).join(', ');
    throw new Error(`The local Supabase status output is missing: ${missing}.`);
  }
  environment = {
    apiUrl: values.API_URL,
    clientKey,
    functionsUrl: values.FUNCTIONS_URL || `${values.API_URL}/functions/v1`,
    serviceRoleKey: values.SERVICE_ROLE_KEY,
  };

  const probeUser = await createUser();
  if (await probeContractBoundary(environment, probeUser)) return;

  // Own an isolated runtime: reset ONLY this project's edge-runtime container
  // (mirroring scripts/verify-multiplayer-edge.mjs) and spawn our own serve.
  spawnSync(DOCKER_BIN, ['rm', '-f', EDGE_RUNTIME_CONTAINER], {
    cwd: projectRoot,
    env: childEnv,
  });
  const serveProcess = spawn(SUPABASE_BIN, ['functions', 'serve'], {
    cwd: projectRoot,
    env: childEnv,
  });
  spawnedServe = serveProcess;
  const ready = await new Promise<boolean>((resolveReady) => {
    const capture = (chunk: Buffer) => {
      // Serve logs are bounded and never include environment values; they are
      // kept only to diagnose a boot failure with exit information.
      serveOutput = `${serveOutput}${String(chunk)}`.slice(-4_000);
      if (serveOutput.includes('Serving functions on')) resolveReady(true);
    };
    serveProcess.stdout?.on('data', capture);
    serveProcess.stderr?.on('data', capture);
    serveProcess.on('exit', () => resolveReady(false));
    setTimeout(() => resolveReady(serveOutput.includes('Serving functions on')), 30_000);
  });
  if (!ready) {
    throw new Error(`The local Edge worker did not start (exit code ${serveProcess.exitCode}).`);
  }
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await probeContractBoundary(environment, probeUser)) return;
    await new Promise((wait) => setTimeout(wait, 750));
  }
  throw new Error('The local Edge worker never reached its contract boundary.');
}, 120_000);

afterAll(async () => {
  const env = environment;
  for (const user of users) {
    if (!env) break;
    await fetch(`${env.apiUrl}/auth/v1/admin/users/${user.userId}`, {
      headers: {
        apikey: env.serviceRoleKey,
        authorization: `Bearer ${env.serviceRoleKey}`,
      },
      method: 'DELETE',
    }).catch(() => undefined);
  }
  users.length = 0;
  if (spawnedServe) {
    spawnedServe.kill('SIGINT');
    spawnedServe = null;
  }
}, 30_000);

async function createUser(): Promise<TestUser> {
  const env = assertLocalEnv();
  const response = await fetch(`${env.apiUrl}/auth/v1/signup`, {
    body: '{}',
    headers: { apikey: env.clientKey, 'content-type': 'application/json' },
    method: 'POST',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || typeof payload?.access_token !== 'string' || typeof payload?.user?.id !== 'string') {
    throw new Error(`Could not create a disposable local user (HTTP ${response.status}).`);
  }
  const user = { accessToken: payload.access_token as string, userId: payload.user.id as string };
  users.push(user);
  return user;
}

async function http(
  user: TestUser,
  body: Record<string, unknown>,
): Promise<{ status: number; payload: any }> {
  const env = assertLocalEnv();
  const response = await fetch(`${env.functionsUrl}/multiplayer-room`, {
    body: JSON.stringify(body),
    headers: {
      apikey: env.clientKey,
      authorization: `Bearer ${user.accessToken}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  });
  return { payload: await response.json().catch(() => null), status: response.status };
}

/** The REAL client parser must consume the COMPLETE response — snapshot,
 * transition, and envelope fields together (harness repair: the previous
 * harness rebuilt a snapshot-only envelope and discarded transitions). */
function parseEnvelope(payload: any): MultiplayerRoomEnvelope {
  expect(multiplayerSnapshotRequiresUpdate(payload)).toBe(false);
  const envelope = parseMultiplayerRoomEnvelope(payload);
  expect(envelope).not.toBeNull();
  return envelope!;
}

function record(revision: number) {
  return buildPublicPlayerRecordSnapshot({
    displayName: 'Hao',
    publishedAtMs: 1_710_000_000_000 + revision,
    revision,
    statistics: {
      bySource: {
        local: { hands: 4, tables: 1, wins: 2 },
        private: { hands: 6, tables: 2, wins: 3 },
        solo: { hands: 0, tables: 0, wins: 0 },
      },
      coverage: { local: 'complete', private: 'capped', solo: 'skipped' },
      hands: 10,
      splits: 0,
      tables: 3,
      version: 1,
      wins: 5,
    } as PlayStatistics,
  });
}

const testConfig = {
  aiDifficulty: 'club',
  bigBlindChips: 20,
  handTarget: 'open',
  seatCount: 2,
  smallBlindChips: 10,
  startingStackChips: 2_000,
  turnSeconds: 30,
} as const;

async function createRoom(user: TestUser): Promise<{ envelope: MultiplayerRoomEnvelope; snapshot: any }> {
  // The payload is built by the production request builder — the exact bytes
  // createMultiplayerTable sends (R1).
  const response = await http(user, buildCreateMultiplayerTableRequest({
    avatar: null,
    config: testConfig,
    displayName: 'Harness Host',
    playRecord: record(1),
  }));
  if (response.status !== 201 || !response.payload?.snapshot) {
    throw new Error(
      `CREATE failed: HTTP ${response.status} `
      + `${response.payload?.error?.code ?? 'no-error-code'}.`,
    );
  }
  const envelope = parseEnvelope(response.payload);
  return { envelope, snapshot: envelope.snapshot };
}

async function joinRoom(user: TestUser, roomCode: string): Promise<{ envelope: MultiplayerRoomEnvelope; snapshot: any }> {
  const response = await http(user, buildJoinMultiplayerTableRequest({
    avatar: null,
    displayName: 'Harness Guest',
    playRecord: record(1),
    roomCode,
  }));
  if (response.status !== 200 || !response.payload?.snapshot) {
    throw new Error(
      `JOIN failed: HTTP ${response.status} `
      + `${response.payload?.error?.code ?? 'no-error-code'}.`,
    );
  }
  const envelope = parseEnvelope(response.payload);
  return { envelope, snapshot: envelope.snapshot };
}

async function syncRoom(user: TestUser, roomId: string): Promise<any> {
  const response = await http(user, { operation: 'sync', roomId });
  if (response.status !== 200 || !response.payload?.snapshot) {
    throw new Error(
      `SYNC failed: HTTP ${response.status} `
      + `${response.payload?.error?.code ?? 'no-error-code'}.`,
    );
  }
  return parseEnvelope(response.payload).snapshot;
}

/** Sends a command with a unique command id and the authoritative expected
 * version, then parses the COMPLETE envelope. Unexpected failures throw with
 * the exact status and stable error code — they are never swallowed (harness
 * repair). */
async function command(
  player: SeatPlayer,
  snapshot: any,
  type: string,
  extra: Record<string, unknown> = {},
): Promise<any> {
  commandCounter += 1;
  const response = await http(player.user, buildMultiplayerCommandRequest(
    snapshot.roomId,
    `${type}:${commandCounter}`,
    snapshot.version,
    { type, ...extra },
  ));
  if (response.status !== 200 || !response.payload?.snapshot) {
    throw new Error(
      `COMMAND ${type} by ${player.label} failed: HTTP ${response.status} `
      + `${response.payload?.error?.code ?? 'no-error-code'}.`,
    );
  }
  const envelope = parseEnvelope(response.payload);
  return envelope.snapshot;
}

/** Asserts a command is REJECTED with an exact status and stable error code. */
async function expectCommandError(
  player: SeatPlayer,
  snapshot: any,
  type: string,
  expectedStatus: number,
  expectedCode: string,
  extra: Record<string, unknown> = {},
  commandId?: string,
): Promise<void> {
  commandCounter += 1;
  const response = await http(player.user, buildMultiplayerCommandRequest(
    snapshot.roomId,
    commandId ?? `${type}:${commandCounter}`,
    snapshot.version,
    { type, ...extra },
  ));
  expect(response.status).toBe(expectedStatus);
  expect(response.payload?.error?.code).toBe(expectedCode);
}

/** Reads the persisted room revision columns with the service role.
 * Test-only: proves the persisted revision agrees with the canonical snapshot
 * version (R2) without exposing any secret material. The private game-state
 * table is not exposed through the Data API, so its revision is proven
 * behaviorally: a mismatch makes the first join answer 409 room_stale. */
async function readPersistedRoomVersion(roomId: string): Promise<{ state_version?: number } | null> {
  const env = assertLocalEnv();
  const response = await fetch(
    `${env.apiUrl}/rest/v1/multiplayer_rooms?id=eq.${roomId}&select=state_version,status,session_number`,
    {
      headers: {
        apikey: env.serviceRoleKey,
        authorization: `Bearer ${env.serviceRoleKey}`,
      },
    },
  );
  const rows = await response.json().catch(() => null) as unknown;
  expect(Array.isArray(rows)).toBe(true);
  return (rows as Array<{ state_version?: number }> | null)?.[0] ?? null;
}

function seatOf(snapshot: any, playerId: string): any {
  return snapshot.seats.find((seat: any) => seat.playerId === playerId);
}

/** Drives one decisive all-in confrontation: the first actor with a raise
 * option shoves, everyone else calls, and the engine runs the board out. A
 * split pot leaves both stacks positive, so the caller retries with the next
 * hand (bounded, sound — no weakened assertions, no swallowed errors). */
async function playUntilBust(
  players: SeatPlayer[],
  snapshot: any,
  maxHands: number,
): Promise<{ bustedPlayerId: string; snapshot: any }> {
  let current = snapshot;
  for (let hand = 0; hand < maxHands; hand += 1) {
    let guard = 0;
    while (current.status === 'playing') {
      guard += 1;
      if (guard > 80) throw new Error('The hand did not converge within its action budget.');
      // The acting seat is derived from canonical state; the actor sends the
      // command and receives their own personalized legal actions.
      const actor = players.find((player) => player.playerId === current.hand.toAct);
      if (!actor) throw new Error(`No bound identity for the acting seat ${current.hand.toAct}.`);
      const fresh = await syncRoom(actor.user, current.roomId);
      current = fresh;
      if (current.status !== 'playing') break;
      if (!current.legalActions) continue; // automated turn pending; re-sync
      const seat = seatOf(current, actor.playerId);
      const action = guard === 1 && current.legalActions.canRaise
        ? { type: 'raise', amount: current.legalActions.maxRaiseTo }
        : current.legalActions.canCall
          ? { type: 'call' }
          : current.legalActions.canCheck
            ? { type: 'check' }
            : { type: 'fold' };
      current = await command(actor, current, 'action', { action });
    }
    if (current.status === 'between-hands' && current.hand?.outcome) {
      const busted = current.seats.find((seat: any) => seat.ledger?.settledStack === 0);
      if (busted) return { bustedPlayerId: busted.playerId, snapshot: current };
      // A split/near-split left both funded: deal the next hand and retry.
      const dealer = players.find((player) => player.playerId === current.hostPlayerId) ?? players[0]!;
      current = await command(dealer, current, 'deal-now');
      continue;
    }
    throw new Error(`The room left the decisive-hand loop in status ${current.status}.`);
  }
  throw new Error(`No seat busted within ${maxHands} decisive hands.`);
}

describe('3.11F integration — real HTTP lifecycle, rebuy, and profile flow', () => {
  it('R2: creates a room with a host record whose persisted revision matches, then joins', async () => {
    const host = await createUser();
    const hostPlayer: SeatPlayer = { label: 'host', user: host, playerId: '' };

    const created = await createRoom(host);
    hostPlayer.playerId = created.snapshot.viewerPlayerId;
    expect(created.snapshot.protocolVersion).toBe(MULTIPLAYER_PROTOCOL_VERSION);
    // The host record published during create advanced the canonical version.
    expect(created.snapshot.version).toBe(1);
    const hostSeat = seatOf(created.snapshot, hostPlayer.playerId);
    expect(hostSeat.playRecord?.revision).toBe(1);
    expect(hostSeat.ledger?.totalBuyIn).toBe(2_000);
    // R2 regression: the persisted revision columns must agree with the
    // canonical state version — the reviewed defect stored 0 and the first
    // join answered 409 room_stale.
    const persisted = await readPersistedRoomVersion(created.snapshot.roomId);
    expect(persisted?.state_version).toBe(1);

    const guest = await createUser();
    const guestPlayer: SeatPlayer = { label: 'guest', user: guest, playerId: '' };
    const joined = await joinRoom(guest, created.snapshot.roomCode);
    guestPlayer.playerId = joined.snapshot.viewerPlayerId;
    const guestSeat = seatOf(joined.snapshot, guestPlayer.playerId);
    expect(guestSeat.playRecord?.revision).toBe(1);
    expect(guestSeat.ledger?.totalBuyIn).toBe(2_000);
    // The host record survives the joiner's projection (room-private
    // retention across members).
    expect(seatOf(joined.snapshot, hostPlayer.playerId).playRecord?.revision).toBe(1);
  }, 90_000);

  it('creates a room without a record at revision zero and joins it', async () => {
    const host = await createUser();
    const response = await http(host, buildCreateMultiplayerTableRequest({
      config: testConfig,
      displayName: 'Bare Host',
    }));
    expect(response.status).toBe(201);
    const snapshot = parseEnvelope(response.payload).snapshot;
    expect(snapshot.version).toBe(0);
    const persisted = await readPersistedRoomVersion(snapshot.roomId);
    expect(persisted?.state_version).toBe(0);
    const guest = await createUser();
    const joined = await joinRoom(guest, snapshot.roomCode);
    expect(joined.snapshot.viewerPlayerId).toBeTruthy();
  }, 90_000);

  it('plays a decisive hand, rebuys, reloads, and converges both clients', async () => {
    const host = await createUser();
    const guest = await createUser();
    const created = await createRoom(host);
    const hostPlayer: SeatPlayer = { label: 'host', user: host, playerId: created.snapshot.viewerPlayerId };
    const joined = await joinRoom(guest, created.snapshot.roomCode);
    const guestPlayer: SeatPlayer = { label: 'guest', user: guest, playerId: joined.snapshot.viewerPlayerId };
    const players = [hostPlayer, guestPlayer];

    let snapshot = await command(hostPlayer, joined.snapshot, 'set-ready', { ready: true });
    snapshot = await command(guestPlayer, snapshot, 'set-ready', { ready: true });
    snapshot = await command(hostPlayer, snapshot, 'start');
    expect(snapshot.status).toBe('playing');

    const { bustedPlayerId, snapshot: settled } = await playUntilBust(players, snapshot, 5);
    expect(settled.status).toBe('between-hands');
    const pendingSeat = seatOf(settled, bustedPlayerId);
    expect(pendingSeat.participation).toBe('rebuy-pending');
    expect(pendingSeat.ledger.settledStack).toBe(0);
    expect(settled.rebuyDecisionDeadlineAtMs).not.toBeNull();

    // Chip conservation at the settled boundary (scope 3.11F).
    const settledSum = settled.seats.reduce((total: number, seat: any) => total + seat.ledger.settledStack, 0);
    const buyInSum = settled.seats.reduce((total: number, seat: any) => total + seat.ledger.totalBuyIn, 0);
    expect(settledSum).toBe(buyInSum);

    const bustPlayer = players.find((player) => player.playerId === bustedPlayerId)!;
    const rebought = await command(bustPlayer, settled, 'rebuy');
    const reboughtSeat = seatOf(rebought, bustedPlayerId);
    expect(reboughtSeat.ledger.rebuyCount).toBe(1);
    expect(reboughtSeat.ledger.rebuyChips).toBe(4_000);
    expect(reboughtSeat.ledger.totalBuyIn).toBe(6_000);
    expect(reboughtSeat.ledger.settledStack).toBe(4_000);
    expect(reboughtSeat.participation).toBe('active');
    // net = settledStack - totalBuyIn and the rebuy itself is never a win.
    expect(reboughtSeat.ledger.settledStack - reboughtSeat.ledger.totalBuyIn).toBe(-2_000);

    // A sync reload through the REAL parser returns the same accepted ledger.
    const reloaded = await syncRoom(bustPlayer.user, rebought.roomId);
    expect(seatOf(reloaded, bustedPlayerId).ledger).toEqual(reboughtSeat.ledger);
    // The OTHER client converges on the same values from its own projection.
    const otherPlayer = players.find((player) => player.playerId !== bustedPlayerId)!;
    const otherView = await syncRoom(otherPlayer.user, rebought.roomId);
    expect(seatOf(otherView, bustedPlayerId).ledger).toEqual(reboughtSeat.ledger);
  }, 240_000);

  it('resolves a pending decision with sit-out and the host ends the stalled session', async () => {
    const host = await createUser();
    const guest = await createUser();
    const created = await createRoom(host);
    const hostPlayer: SeatPlayer = { label: 'host', user: host, playerId: created.snapshot.viewerPlayerId };
    const joined = await joinRoom(guest, created.snapshot.roomCode);
    const guestPlayer: SeatPlayer = { label: 'guest', user: guest, playerId: joined.snapshot.viewerPlayerId };
    const players = [hostPlayer, guestPlayer];

    let snapshot = await command(hostPlayer, joined.snapshot, 'set-ready', { ready: true });
    snapshot = await command(guestPlayer, snapshot, 'set-ready', { ready: true });
    snapshot = await command(hostPlayer, snapshot, 'start');

    const { bustedPlayerId, snapshot: settled } = await playUntilBust(players, snapshot, 5);
    const bustPlayer = players.find((player) => player.playerId === bustedPlayerId)!;
    // Sit out is legal exactly while this seat's rebuy decision is pending.
    snapshot = await command(bustPlayer, settled, 'sit-out');
    expect(seatOf(snapshot, bustedPlayerId).participation).toBe('sitting-out');

    // With one funded player and a sitting-out human, the session is stalled:
    // the host may end it; a non-host may not.
    await expectCommandError(guestPlayer, snapshot, 'end-stalled-session', 403, 'room_forbidden');
    snapshot = await command(hostPlayer, snapshot, 'end-stalled-session');
    expect(snapshot.status).toBe('complete');
    expect(snapshot.completionReason).toBe('host-ended');
    // Every ledger row survives completion, including the sitting-out seat.
    expect(seatOf(snapshot, bustedPlayerId).ledger).toBeDefined();
  }, 240_000);

  it('refuses an old-protocol client before any membership mutation', async () => {
    const host = await createUser();
    const created = await createRoom(host);
    const guest = await createUser();
    // The pre-3.11F client declares no protocol.
    const response = await http(guest, {
      displayName: 'Old Client',
      operation: 'join',
      roomCode: created.snapshot.roomCode,
    });
    expect(response.status).toBe(426);
    expect(response.payload?.error?.code).toBe('multiplayer_update_required');
    // A future protocol is refused the same way.
    const future = await http(guest, {
      ...buildJoinMultiplayerTableRequest({ displayName: 'Future Client', roomCode: created.snapshot.roomCode }),
      protocol: MULTIPLAYER_PROTOCOL_VERSION + 1,
    });
    expect(future.status).toBe(426);
    expect(future.payload?.error?.code).toBe('multiplayer_update_required');
    // A malformed protocol value fails safely as a bad request.
    const malformed = await http(guest, {
      ...buildJoinMultiplayerTableRequest({ displayName: 'Broken Client', roomCode: created.snapshot.roomCode }),
      protocol: '3',
    });
    expect(malformed.status).toBe(400);
    expect(malformed.payload?.error?.code).toBe('request_invalid');
    // No refused join created membership.
    const after = await syncRoom(host, created.snapshot.roomId);
    expect(after.seats.some((seat: any) => seat.displayName === 'Old Client')).toBe(false);
    expect(after.seats.some((seat: any) => seat.displayName === 'Future Client')).toBe(false);
    expect(after.seats).toHaveLength(1);
  }, 90_000);

  it('keeps duplicate delivery idempotent and stale versions rejected', async () => {
    const host = await createUser();
    const created = await createRoom(host);
    commandCounter += 1;
    const commandId = `set-ready:dup:${commandCounter}`;
    const first = await http(host, buildMultiplayerCommandRequest(
      created.snapshot.roomId,
      commandId,
      created.snapshot.version,
      { ready: true, type: 'set-ready' },
    ));
    expect(first.status).toBe(200);
    const firstEnvelope = parseEnvelope(first.payload);
    // The exact same command id replays the ORIGINAL transition without a new
    // mutation (duplicate delivery / lost response).
    const replay = await http(host, buildMultiplayerCommandRequest(
      created.snapshot.roomId,
      commandId,
      created.snapshot.version,
      { ready: true, type: 'set-ready' },
    ));
    expect(replay.status).toBe(200);
    const replayEnvelope = parseEnvelope(replay.payload);
    expect(replayEnvelope.duplicate).toBe(true);
    expect(replayEnvelope.transition?.version).toBe(firstEnvelope.transition?.version);
    expect(replayEnvelope.snapshot.version).toBe(firstEnvelope.snapshot.version);
    // A stale expected version is refused without mutating the room.
    const stale = await http(host, buildMultiplayerCommandRequest(
      created.snapshot.roomId,
      `set-ready:stale:${commandCounter}`,
      0,
      { ready: false, type: 'set-ready' },
    ));
    expect(stale.status).toBe(409);
    expect(stale.payload?.error?.code).toBe('room_stale');
  }, 90_000);

  it('keeps the room-private profile projection free of account identifiers', async () => {
    const host = await createUser();
    const created = await createRoom(host);
    const raw = JSON.stringify(created.snapshot);
    expect(raw).not.toContain(host.userId);
    expect(raw).not.toContain('@');
    const persisted = JSON.stringify(await readPersistedRoomVersion(created.snapshot.roomId));
    expect(persisted).not.toContain('@');
  }, 90_000);

  it('revokes a permanently departed member\'s live access (R5)', async () => {
    const host = await createUser();
    const guest = await createUser();
    const created = await createRoom(host);
    const hostPlayer: SeatPlayer = { label: 'host', user: host, playerId: created.snapshot.viewerPlayerId };
    const joined = await joinRoom(guest, created.snapshot.roomCode);
    const guestPlayer: SeatPlayer = { label: 'guest', user: guest, playerId: joined.snapshot.viewerPlayerId };

    // Lobby leave: the seat is removed entirely and the room keeps filling.
    const lobbyLeft = await command(guestPlayer, joined.snapshot, 'leave');
    expect(lobbyLeft.seats.some((seat: any) => seat.playerId === guestPlayer.playerId)).toBe(false);
    const rejoin = await joinRoom(guest, created.snapshot.roomCode);
    // A rejoin mints a fresh seat/player id (the departed seat is never
    // reused); the new identity is bound for the rest of the test.
    expect(rejoin.snapshot.viewerPlayerId).not.toBe(guestPlayer.playerId);
    guestPlayer.playerId = rejoin.snapshot.viewerPlayerId;

    // Started-session leave: ready, start, then leave between turns.
    let snapshot = await command(hostPlayer, rejoin.snapshot, 'set-ready', { ready: true });
    snapshot = await command(guestPlayer, snapshot, 'set-ready', { ready: true });
    snapshot = await command(hostPlayer, snapshot, 'start');
    const left = await command(guestPlayer, snapshot, 'leave');
    expect(seatOf(left, guestPlayer.playerId)?.participation).toBe('left');

    // Sync as the departed member is revoked (R5: command rejection alone is
    // not read-access revocation).
    const syncResponse = await http(guest, { operation: 'sync', roomId: created.snapshot.roomId });
    expect(syncResponse.status).toBe(403);
    // Resume finds no recoverable room for the departed member.
    const resumeResponse = await http(guest, { operation: 'resume' });
    expect(resumeResponse.status).toBe(404);
    // Rejoin by code after start is refused.
    const rejoinAfterStart = await http(guest, buildJoinMultiplayerTableRequest({
      displayName: 'Harness Guest',
      roomCode: created.snapshot.roomCode,
    }));
    expect(rejoinAfterStart.status).toBe(409);
    expect(rejoinAfterStart.payload?.error?.code).toBe('room_started');
    // The host still sees the departed ledger row and normal state.
    const hostView = await syncRoom(hostPlayer.user, created.snapshot.roomId);
    expect(seatOf(hostView, guestPlayer.playerId)?.participation).toBe('left');
    expect(seatOf(hostView, guestPlayer.playerId)?.ledger).toBeDefined();
  }, 240_000);
});
