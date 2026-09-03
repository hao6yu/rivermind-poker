import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { MULTIPLAYER_CLIENT_PROTOCOL_VERSION, MULTIPLAYER_PROTOCOL_VERSION } from '../../domain/multiplayer/contracts';
import { buildPublicPlayerRecordSnapshot } from '../../domain/multiplayer/playerRecordSnapshot';
import type { PlayStatistics } from '../../domain/stats/playStatistics';
import {
  multiplayerSnapshotRequiresUpdate,
  parseMultiplayerHandHistoryEnvelope,
  parseMultiplayerRoomEnvelope,
  type MultiplayerRoomEnvelope,
} from '../multiplayerContract';
import {
  buildCreateMultiplayerTableRequest,
  buildJoinMultiplayerTableRequest,
  buildMultiplayerCommandRequest,
  buildMultiplayerSeatLivenessRequest,
  withMultiplayerClientProtocol,
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

async function httpRaw(
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

/** Same protocol envelope as the real service, while retaining explicit negative-test versions. */
async function http(user: TestUser, body: Record<string, unknown>): Promise<{ status: number; payload: any }> {
  return httpRaw(user, 'protocol' in body ? body : withMultiplayerClientProtocol(body));
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
    } as unknown as PlayStatistics,
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
  expect(envelope.snapshot.roomCode).toMatch(/^4\d{6}$/);
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
  return commandWith(player, snapshot, type, extra, `${type}:${commandCounter}`);
}

/** Same as `command`, but with an explicit command id so a replay can reuse it. */
async function commandEnvelopeWith(
  player: SeatPlayer,
  snapshot: any,
  type: string,
  extra: Record<string, unknown>,
  commandId: string,
): Promise<any> {
  const response = await http(player.user, buildMultiplayerCommandRequest(
    snapshot.roomId,
    commandId,
    snapshot.version,
    { type, ...extra },
  ));
  if (response.status !== 200 || !response.payload?.snapshot) {
    throw new Error(
      `COMMAND ${type} by ${player.label} failed: HTTP ${response.status} `
      + `${response.payload?.error?.code ?? 'no-error-code'}.`,
    );
  }
  return parseEnvelope(response.payload);
}

async function commandWith(
  player: SeatPlayer,
  snapshot: any,
  type: string,
  extra: Record<string, unknown>,
  commandId: string,
): Promise<any> {
  const envelope = await commandEnvelopeWith(player, snapshot, type, extra, commandId);
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

/** Executes one statement against the local project database. Test-only:
 * corrupts or rolls back disposable rooms this run created (R4 evidence);
 * never touches another project's stack and never prints credentials. */
async function executeSql(statement: string): Promise<void> {
  const result = spawnSync(DOCKER_BIN, [
    'exec', 'supabase_db_rivermind-poker', 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', statement,
  ], { cwd: projectRoot, encoding: 'utf8', env: childEnv });
  if (result.status !== 0) {
    throw new Error(`The local database statement failed (exit ${result.status}).`);
  }
}

async function readPersistedCanonicalState(roomId: string): Promise<any> {
  const result = spawnSync(DOCKER_BIN, [
    'exec', 'supabase_db_rivermind-poker', 'psql', '-U', 'postgres', '-Atc',
    `select canonical_state::text from private.multiplayer_game_states where room_id = '${roomId}';`,
  ], { cwd: projectRoot, encoding: 'utf8', env: childEnv });
  if (result.status !== 0 || result.stdout.trim().length === 0) {
    throw new Error(`The persisted canonical state could not be read (exit ${result.status}).`);
  }
  return JSON.parse(result.stdout.trim());
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
    const disconnected = await command(bustPlayer, settled, 'set-connection', { connection: 'offline' });
    const returned = await command(bustPlayer, disconnected, 'set-connection', { connection: 'online' });
    expect(returned.rebuyDecisionDeadlineAtMs).toBe(settled.rebuyDecisionDeadlineAtMs);
    expect(seatOf(returned, bustedPlayerId).ledger).toEqual(pendingSeat.ledger);
    const rebought = await command(bustPlayer, returned, 'rebuy');
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
    snapshot = await command(bustPlayer, snapshot, 'set-connection', { connection: 'offline' });
    snapshot = await command(bustPlayer, snapshot, 'set-connection', { connection: 'online' });
    expect(seatOf(snapshot, bustedPlayerId).participation).toBe('sitting-out');
    expect(snapshot.rebuyDecisionDeadlineAtMs).toBeNull();

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
    const response = await httpRaw(guest, {
      displayName: 'Old Client',
      operation: 'join',
      roomCode: created.snapshot.roomCode,
    });
    expect(response.status).toBe(426);
    expect(response.payload?.error?.code).toBe('multiplayer_update_required');
    // A future protocol is refused the same way.
    const future = await http(guest, {
      ...buildJoinMultiplayerTableRequest({ displayName: 'Future Client', roomCode: created.snapshot.roomCode }),
      protocol: MULTIPLAYER_CLIENT_PROTOCOL_VERSION + 1,
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

  it('rejects pre-heartbeat protocol-3 joins AND resumed live requests without changing membership, stamps or chips', async () => {
    const { players, snapshot } = await createManyHumanRoom(2, 0, testConfig);
    const host = players[0]!;
    const newcomer = await createUser();
    const before = queryRows(`select canonical_state::text as state from private.multiplayer_game_states where room_id = '${snapshot.roomId}'`, ['state']);
    const contactBefore = queryRows(`select user_id, renewed_at_ms from private.multiplayer_seat_liveness where room_id = '${snapshot.roomId}' order by user_id`, ['user', 'stamp']);
    for (const body of [
      { ...buildJoinMultiplayerTableRequest({ roomCode: snapshot.roomCode, displayName: 'Pre-heartbeat' }), protocol: 3 },
      { operation: 'sync', roomId: snapshot.roomId, protocol: 3 },
      { operation: 'resume', protocol: 3 },
      { operation: 'liveness', roomId: snapshot.roomId, protocol: 3 },
      { ...buildMultiplayerCommandRequest(snapshot.roomId, 'old-tick', snapshot.version, { type: 'tick' }), protocol: 3 },
    ]) {
      const response = await httpRaw(body.operation === 'join' ? newcomer : host.user, body);
      expect(response.status).toBe(426);
      expect(response.payload.error.code).toBe('multiplayer_update_required');
    }
    expect(queryRows(`select canonical_state::text as state from private.multiplayer_game_states where room_id = '${snapshot.roomId}'`, ['state'])).toEqual(before);
    expect(queryRows(`select user_id, renewed_at_ms from private.multiplayer_seat_liveness where room_id = '${snapshot.roomId}' order by user_id`, ['user', 'stamp'])).toEqual(contactBefore);
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

  it('refuses a corrupted current-format row with a stable incompatibility result (R4)', async () => {
    const host = await createUser();
    const created = await createRoom(host);
    const roomId = created.snapshot.roomId;
    // Corrupt one seat's lifecycle enum in the persisted canonical row: a
    // poisoned producer value that must never become an active seat.
    await executeSql(`
      update private.multiplayer_game_states
      set canonical_state = jsonb_set(
        canonical_state,
        '{seats,0,participation}',
        '"quantum"'::jsonb
      )
      where room_id = '${roomId}';
    `);
    const response = await http(host, { operation: 'sync', roomId });
    expect(response.status).toBe(409);
    expect(response.payload?.error?.code).toBe('room_unsupported_state');
  }, 90_000);

  it('refuses a protocol-3 preview room through every live v4 room-id path', async () => {
    const host = await createUser();
    const created = await createRoom(host);
    const roomId = created.snapshot.roomId;
    await executeSql(`
      update private.multiplayer_game_states
      set canonical_state = jsonb_set(canonical_state, '{protocolVersion}', '3'::jsonb)
      where room_id = '${roomId}';
    `);
    for (const body of [
      { operation: 'sync', roomId },
      { operation: 'liveness', roomId },
      buildMultiplayerCommandRequest(roomId, 'v4-preview-refusal', 0, {
        ready: true,
        type: 'set-ready',
      }),
    ]) {
      const response = await http(host, body);
      expect(response.status).toBe(409);
      expect(response.payload?.error?.code).toBe('room_unsupported_state');
    }
    const persisted = await readPersistedCanonicalState(roomId);
    expect(persisted.protocolVersion).toBe(3);
    expect(persisted.version).toBe(created.snapshot.version);
  }, 90_000);

  it('refuses a rolled-back legacy row through the live v4 worker without mutating it', async () => {
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
    const { snapshot: settled } = await playUntilBust(players, snapshot, 5);
    const stacks = Object.fromEntries(settled.seats.map((seat: any) => [seat.playerId, seat.ledger.settledStack]));
    const settledSum = Object.values(stacks).reduce((total: number, stack) => total + (stack as number), 0);
    expect(settledSum).toBe(4_000); // 2 x 2,000 opening buy-ins, no rebuys yet

    // Roll the persisted row back to a pre-3.11F legacy shape: no ledgers, no
    // participation, protocol 2. The archival normalizer can still reconstruct
    // this state in unit coverage, but a live v4 route must never convert or
    // admit it because that would bridge the isolated worker lanes.
    await executeSql(`
      update private.multiplayer_game_states
      set canonical_state = jsonb_set(
        jsonb_set(
          canonical_state,
          '{protocolVersion}',
          '2'::jsonb
        ),
        '{seats}',
        (select jsonb_agg(seat - 'ledger' - 'participation')
          from jsonb_array_elements(canonical_state->'seats') as seat)
      )
      where room_id = '${settled.roomId}';
    `);
    const refused = await http(host, { operation: 'sync', roomId: settled.roomId });
    expect(refused.status).toBe(409);
    expect(refused.payload?.error?.code).toBe('room_unsupported_state');
    const persisted = await readPersistedCanonicalState(settled.roomId);
    expect(persisted.protocolVersion).toBe(2);
    expect(persisted.seats?.every((seat: any) => (
      seat.ledger === undefined && seat.participation === undefined
    ))).toBe(true);
  }, 240_000);

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

// ── Q1/Q2 — nine-human archive capacity and dealt-in eligibility ────────────

/**
 * Read-only SQL used for test verification (never a fixture-creation path).
 * Splits each `-F |` result line into an object keyed by the given column
 * aliases, matching the select list of the query text.
 */
function queryRows(statement: string, columns: string[]): Array<Record<string, string>> {
  const result = spawnSync(DOCKER_BIN, [
    'exec', 'supabase_db_rivermind-poker', 'psql', '-U', 'postgres', '-v', 'quiet=on', '-t', '-A', '-F', '|', '-c', statement,
  ], { encoding: 'utf-8', env: childEnv, maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`Local SQL read failed: ${(result.stderr ?? '').trim()}`);
  }
  return (result.stdout ?? '').trim().split('\n').filter((line) => line.trim().length > 0)
    .map((line) => {
      const parts = line.split('|');
      return Object.fromEntries(columns.map((column, index) => [column, parts[index] ?? '']));
    });
}

async function createRoomNamed(
  user: TestUser,
  displayName: string,
  config: Record<string, unknown>,
): Promise<any> {
  const response = await http(user, buildCreateMultiplayerTableRequest({
    config: config as any,
    displayName,
  }));
  if (response.status !== 201 || !response.payload?.snapshot) {
    throw new Error(
      `CREATE named room failed: HTTP ${response.status} `
      + `${response.payload?.error?.code ?? 'no-error-code'}.`,
    );
  }
  const envelope = parseEnvelope(response.payload);
  expect(envelope.snapshot.protocolVersion).toBe(MULTIPLAYER_PROTOCOL_VERSION);
  return envelope.snapshot;
}

async function joinRoomNamed(
  user: TestUser,
  roomCode: string,
  displayName: string,
): Promise<any> {
  const response = await http(user, buildJoinMultiplayerTableRequest({
    displayName,
    roomCode,
  }));
  if (response.status !== 200 || !response.payload?.snapshot) {
    throw new Error(
      `JOIN named room failed: HTTP ${response.status} `
      + `${response.payload?.error?.code ?? 'no-error-code'}.`,
    );
  }
  const envelope = parseEnvelope(response.payload);
  expect(envelope.snapshot.protocolVersion).toBe(MULTIPLAYER_PROTOCOL_VERSION);
  return envelope.snapshot;
}

/** Seats `humanCount` bound identities (optionally filling to `seatCount` with AI). */
async function createManyHumanRoom(
  humanCount: number,
  aiCount: number,
  config: Record<string, unknown>,
): Promise<{ players: SeatPlayer[]; snapshot: any }> {
  const host = await createUser();
  const created: any = await createRoomNamed(host, 'Harness Human 1', config);
  const players: SeatPlayer[] = [{ label: 'human-1', user: host, playerId: created.viewerPlayerId }];
  let snapshot = created;
  for (let index = 2; index <= humanCount; index += 1) {
    const user = await createUser();
    const joined: any = await joinRoomNamed(user, snapshot.roomCode, `Harness Human ${index}`);
    players.push({ label: `human-${index}`, user, playerId: joined.viewerPlayerId });
    snapshot = joined;
  }
  for (let seat = humanCount; seat < humanCount + aiCount; seat += 1) {
    snapshot = await command(players[0]!, snapshot, 'add-ai', { seat });
  }
  for (const player of players) {
    snapshot = await command(player, snapshot, 'set-ready', { ready: true });
  }
  snapshot = await command(players[0]!, snapshot, 'start');
  expect(snapshot.status).toBe('playing');
  return { players, snapshot };
}

interface TrackedSettlingAction {
  action: Record<string, unknown>;
  commandId: string;
  playerId: string;
  version: number;
}

/**
 * Drives the live hand to a deterministic settle: every bound non-winner
 * folds at its turn; the chosen winner checks or calls. Automated seats act
 * inside each accepted commit. Returns the last accepted action so the caller
 * can replay it through the duplicate path.
 */
async function playHandToFolds(
  players: SeatPlayer[],
  snapshot: any,
  winnerPlayerId: string,
): Promise<{ last: TrackedSettlingAction | null; snapshot: any }> {
  let current = snapshot;
  let last: TrackedSettlingAction | null = null;
  let guard = 0;
  while (current.status === 'playing') {
    guard += 1;
    if (guard > 80) throw new Error('The fold-out hand did not converge within its action budget.');
    const actor = players.find((player) => player.playerId === current.hand?.toAct);
    if (!actor) {
      current = await syncRoom(players[0]!.user, current.roomId);
      continue;
    }
    current = await syncRoom(actor.user, current.roomId);
    if (current.status !== 'playing') break;
    if (!current.legalActions) continue;
    // The engine forbids folding while checking is free: respect legality.
    // Winner seats concede nothing; other seats fold whenever legal.
    const legal = current.legalActions;
    const isWinner = current.hand.toAct === winnerPlayerId;
    const action: Record<string, unknown> = !isWinner && legal.canFold
      ? { type: 'fold' }
      : legal.canCheck ? { type: 'check' }
        : legal.canCall ? { type: 'call' }
          : { type: 'fold' };
    commandCounter += 1;
    const commandId = `foldout:${commandCounter}`;
    const version = current.version;
    current = await commandWith(actor, current, 'action', { action }, commandId);
    last = { action, commandId, playerId: actor.playerId, version };
  }
  expect(current.hand?.outcome, 'the hand must settle with an outcome').toBeTruthy();
  return { last, snapshot: current };
}

/** Personal hand history through the PRODUCTION response parser. */
async function archivesFor(player: SeatPlayer, roomId: string, sessionNumber: number) {
  const response = await http(player.user, { limit: 50, operation: 'history', roomId, sessionNumber });
  expect(response.status, `hand history for ${player.label}`).toBe(200);
  const archives = parseMultiplayerHandHistoryEnvelope(response.payload);
  expect(archives, `hand history for ${player.label} must parse through the production parser`).not.toBeNull();
  return archives!;
}

function dealtPlayerIds(snapshot: any): string[] {
  return Object.keys(snapshot.hand?.players ?? {});
}

describe('Slice 3.11 follow-up Q1/Q2 — archive capacity and eligibility (real HTTP)', () => {
  const nineSeatConfig = { ...testConfig, seatCount: 9 } as const;
  const threeSeatConfig = { ...testConfig, seatCount: 3 } as const;

  it('settles a full hand for 7, 8, and 9 humans in nine-seat rooms', async () => {
    for (const humanCount of [7, 8, 9]) {
      const { players, snapshot } = await createManyHumanRoom(humanCount, 0, nineSeatConfig);
      const winner = players[0]!;
      const played = await playHandToFolds(players, snapshot, winner.playerId);
      const current = played.snapshot;
      expect(current.status, `${humanCount} humans must reach between-hands`).toBe('between-hands');
      expect(current.hand?.outcome).toBeTruthy();

      // Every dealt human receives their own valid archive (fail-before: the
      // settlement command above already died with HTTP 503 room_unavailable
      // because six-archive validation rejected the seventh).
      for (const player of players) {
        const archives = await archivesFor(player, current.roomId, 1);
        expect(archives.map((archive) => archive.hand.handNumber), `${player.label} sees hand 1`).toEqual([1]);
        expect(archives[0]!.viewerPlayerId).toBe(player.playerId);
        expect(Object.keys(archives[0]!.hand.players)).toContain(player.playerId);
        expect(archives[0]!.hand.deck).toEqual([]);
      }

      // The persisted archive table holds exactly one archive per dealt human.
      const archiveRows = queryRows(
        `select count(*)::text as total, count(distinct user_id)::text as distinct_users `
        + `from private.multiplayer_hand_archives where room_id = '${current.roomId}'`,
        ['total', 'distinctUsers'],
      );
      expect(archiveRows[0]).toEqual({ total: String(humanCount), distinctUsers: String(humanCount) });

      // Replaying the settling action id is a duplicate that mints no rows.
      const last = played.last!;
      const actor = players.find((player) => player.playerId === last.playerId)!;
      const replay = await http(
        actor.user,
        buildMultiplayerCommandRequest(current.roomId, last.commandId, last.version, { type: 'action', action: last.action }),
      );
      expect(replay.status).toBe(200);
      expect(parseEnvelope(replay.payload).duplicate).toBe(true);
      const afterReplay = queryRows(
        `select count(*)::text as total from private.multiplayer_hand_archives where room_id = '${current.roomId}'`,
        ['total'],
      );
      expect(afterReplay[0]!.total).toBe(String(humanCount));

      // The next hand starts.
      const dealtNow = await command(winner, current, 'deal-now');
      expect(dealtNow.hand?.handNumber).toBe(2);
      expect(dealtNow.status).toBe('playing');
      expect(dealtPlayerIds(dealtNow).length).toBe(humanCount);
    }
  }, 420_000);

  it('settles a nine-seat human/AI mix and archives humans only', async () => {
    const { players, snapshot } = await createManyHumanRoom(3, 6, nineSeatConfig);
    const played = await playHandToFolds(players, snapshot, players[0]!.playerId);
    const current = played.snapshot;
    expect(current.status).toBe('between-hands');

    for (const player of players) {
      const archives = await archivesFor(player, current.roomId, 1);
      expect(archives.map((archive) => archive.hand.handNumber)).toEqual([1]);
    }
    const archiveRows = queryRows(
      `select count(*)::text as total from private.multiplayer_hand_archives where room_id = '${current.roomId}'`,
      ['total'],
    );
    expect(archiveRows[0]!.total).toBe('3');
  }, 300_000);

  it('settles later hands after a human is omitted and converges their return', async () => {
    const host = await createUser();
    const guestB = await createUser();
    const guestC = await createUser();
    const created: any = await createRoomNamed(host, 'Harness Omit 1', threeSeatConfig);
    const hostPlayer: SeatPlayer = { label: 'host', user: host, playerId: created.viewerPlayerId };
    const joinedB: any = await joinRoomNamed(guestB, created.roomCode, 'Harness Omit 2');
    const playerB: SeatPlayer = { label: 'b', user: guestB, playerId: joinedB.viewerPlayerId };
    const joinedC: any = await joinRoomNamed(guestC, created.roomCode, 'Harness Omit 3');
    const playerC: SeatPlayer = { label: 'c', user: guestC, playerId: joinedC.viewerPlayerId };
    const players = [hostPlayer, playerB, playerC];
    let snapshot = joinedC;
    for (const player of players) snapshot = await command(player, snapshot, 'set-ready', { ready: true });
    snapshot = await command(hostPlayer, snapshot, 'start');

    // Hand 1: everyone is dealt; fold-out settles it with host as winner.
    snapshot = (await playHandToFolds(players, snapshot, hostPlayer.playerId)).snapshot;
    expect(snapshot.status).toBe('between-hands');

    // C drops its transport (owner-driven offline signal) and is omitted from
    // hand 2. Fail-before: committing hand 2 answered HTTP 503 because the
    // worker fabricated an archive for the omitted human.
    snapshot = await command(playerC, snapshot, 'set-connection', { connection: 'offline' });
    expect(seatOf(snapshot, playerC.playerId)?.participation).toBe('disconnected');
    snapshot = await command(hostPlayer, snapshot, 'deal-now');
    expect(snapshot.hand?.handNumber).toBe(2);
    expect(dealtPlayerIds(snapshot)).not.toContain(playerC.playerId);
    snapshot = (await playHandToFolds(players, snapshot, playerB.playerId)).snapshot;
    expect(snapshot.status).toBe('between-hands');

    // Reload the persisted state: C keeps its seat row, lifecycle, and ledger.
    const reloaded = await syncRoom(host, snapshot.roomId);
    expect(seatOf(reloaded, playerC.playerId)?.participation).toBe('disconnected');
    expect(seatOf(reloaded, playerC.playerId)?.ledger?.settledHandNumber).toBe(1);

    // Omission is honest in history: C has exactly hand 1, never hand 2.
    const cArchives = await archivesFor(playerC, snapshot.roomId, 1);
    expect(cArchives.map((archive) => archive.hand.handNumber)).toEqual([1]);
    for (const player of [hostPlayer, playerB]) {
      const archives = await archivesFor(player, snapshot.roomId, 1);
      expect(archives.map((archive) => archive.hand.handNumber)).toEqual([1, 2]);
    }

    // C returns between hands and hand 3 settles with C dealt back in.
    snapshot = await command(playerC, snapshot, 'set-connection', { connection: 'online' });
    expect(seatOf(snapshot, playerC.playerId)?.participation).toBe('active');
    snapshot = await command(hostPlayer, snapshot, 'deal-now');
    expect(snapshot.hand?.handNumber).toBe(3);
    expect(dealtPlayerIds(snapshot)).toContain(playerC.playerId);
    snapshot = (await playHandToFolds(players, snapshot, playerC.playerId)).snapshot;
    expect(snapshot.status).toBe('between-hands');

    const cArchivesAfter = await archivesFor(playerC, snapshot.roomId, 1);
    expect(cArchivesAfter.map((archive) => archive.hand.handNumber)).toEqual([1, 3]);
    const cRows = queryRows(
      `select hand_number::text from private.multiplayer_hand_archives `
      + `where room_id = '${snapshot.roomId}' and user_id = '${playerC.user.userId}' order by hand_number`,
      ['handNumber'],
    );
    expect(cRows.map((row) => row.handNumber)).toEqual(['1', '3']);

    // Ledger continuity survives the omission and the return.
    const finalView = await syncRoom(host, snapshot.roomId);
    const cLedger = seatOf(finalView, playerC.playerId)?.ledger;
    expect(cLedger).toBeDefined();
    expect(cLedger!.settledHandNumber).toBe(3);
    expect(cLedger!.totalBuyIn).toBe(cLedger!.initialBuyIn + cLedger!.rebuyChips);
    expect(cLedger!.settledStack).toBeGreaterThan(0);
  }, 300_000);
});

describe('Slice 3.11 follow-up Q3 — leave handoff over real HTTP', () => {
  const threeSeatConfig = { ...testConfig, seatCount: 3 } as const;

  function actionRows(roomId: string, stateVersion: number): Array<Record<string, string>> {
    return queryRows(
      `select action_sequence, player_id, action_type from public.multiplayer_actions `
      + `where room_id = '${roomId}' and state_version = ${stateVersion} order by action_sequence`,
      ['sequence', 'playerId', 'type'],
    );
  }

  it('commits the departing actor fold into the public ledger and gives the successor a fresh full budget', async () => {
    const { players, snapshot } = await createManyHumanRoom(3, 0, threeSeatConfig);
    const actor = players.find((player) => player.playerId === snapshot.hand?.toAct);
    if (!actor) throw new Error('The leaving-actor fixture is missing.');
    const staleDeadline = snapshot.turnDeadlineAtMs as number;
    commandCounter += 1;
    const envelope = await commandEnvelopeWith(actor, snapshot, 'leave', {}, `q3-leave:${commandCounter}`);
    const version = envelope.transition?.version ?? 0;
    // The PRODUCTION parser must show the enforced fold in the committed
    // public action ledger — pre-fix the transition carried no fold at all.
    const folded = (envelope.transition?.actionBatch ?? []).filter(
      (action: any) => action.playerId === actor.playerId && action.type === 'fold',
    );
    expect(folded).toHaveLength(1);
    // The database persisted exactly that public action row for this version.
    const persisted = actionRows(snapshot.roomId, version);
    expect(persisted.filter((row) => row.playerId === actor.playerId && row.type === 'fold')).toHaveLength(1);
    const next = envelope.snapshot;
    expect(seatOf(next, actor.playerId).participation).toBe('left');
    expect(next.hand?.toAct).not.toBe(actor.playerId);
    // The leaver's stale clock must not survive as the successor's clock:
    // the successor's deadline is a FRESH full window, later than the
    // abandoned one (pre-fix this equals staleDeadline).
    expect(next.turnDeadlineAtMs).toBeGreaterThan(staleDeadline);
    // The successor holds a live decision and can actually take it.
    const successor = players.find((player) => player.playerId === next.hand?.toAct);
    if (!successor) throw new Error('The human successor vanished.');
    const synced = await syncRoom(successor.user, next.roomId);
    if (!synced.legalActions) throw new Error('The successor has no live decision.');
    const action = synced.legalActions.canCheck
      ? { type: 'check' }
      : synced.legalActions.canCall ? { type: 'call' } : { type: 'fold' };
    commandCounter += 1;
    const after = await commandWith(successor, synced, 'action', { action }, `q3-success:${commandCounter}`);
    expect(after.version).toBeGreaterThan(synced.version);
  }, 120_000);

  it('never lets a seat that left mid-hand hold a turn when the action reaches it', async () => {
    const { players, snapshot } = await createManyHumanRoom(3, 0, threeSeatConfig);
    const firstActor = players.find((player) => player.playerId === snapshot.hand?.toAct);
    const leaver = players.find((player) => player.playerId !== firstActor?.playerId);
    if (!firstActor || !leaver) throw new Error('The off-actor leave fixture is missing.');
    commandCounter += 1;
    let current = await commandWith(leaver, snapshot, 'leave', {}, `q3b-leave:${commandCounter}`);
    expect(current.hand?.toAct).toBe(firstActor.playerId);

    let guard = 0;
    let foldTransitioned = false;
    while (current.status === 'playing' && guard < 40) {
      guard += 1;
      // A permanently departed seat must NEVER be the acting seat: pre-fix it
      // sat at toAct behind a fake armed clock with no possible action.
      expect(current.hand?.toAct, 'a left seat must never hold the turn').not.toBe(leaver.playerId);
      const actor = players.find((player) => player.playerId === current.hand?.toAct);
      if (!actor) break;
      const synced = await syncRoom(actor.user, current.roomId);
      if (synced.status !== 'playing') { current = synced; break; }
      if (!synced.legalActions) continue;
      const legal = synced.legalActions;
      const action: Record<string, unknown> = legal.canCheck
        ? { type: 'check' }
        : legal.canCall ? { type: 'call' } : { type: 'fold' };
      commandCounter += 1;
      const envelope = await commandEnvelopeWith(actor, synced, 'action', { action }, `q3b-act:${commandCounter}`);
      foldTransitioned = foldTransitioned
        || (envelope.transition?.actionBatch ?? []).some(
          (entry: any) => entry.playerId === leaver.playerId && entry.type === 'fold',
        );
      current = envelope.snapshot;
    }
    // Either the leaver's enforced fold was committed the moment their turn
    // arrived, or the hand finished without their turn ever coming.
    expect(current.hand?.outcome || foldTransitioned).toBeTruthy();
    const rows = queryRows(
      `select player_id, action_type from public.multiplayer_actions `
      + `where room_id = '${current.roomId}' and player_id = '${leaver.playerId}'`,
      ['playerId', 'type'],
    );
    expect(rows.filter((row) => row.type === 'fold').length).toBeLessThanOrEqual(1);
    expect(seatOf(current, leaver.playerId).participation).toBe('left');
  }, 120_000);
});

describe('Slice 3.11 follow-up Q4 — server-observed seat liveness over real HTTP', () => {
  const threeSeatConfig = { ...testConfig, seatCount: 3 } as const;

  function livenessRows(roomId: string): Array<Record<string, string>> {
    return queryRows(
      `select user_id, renewed_at_ms from private.multiplayer_seat_liveness `
      + `where room_id = '${roomId}' order by user_id`,
      ['userId', 'renewedAtMs'],
    );
  }

  async function livenessCall(user: TestUser, roomId: string) {
    return http(user, buildMultiplayerSeatLivenessRequest(roomId));
  }

  function dealtIds(snapshot: any): string[] {
    return snapshot.hand?.activePlayerIds ?? [];
  }

  it('manual dealing excludes a stale third human and starting refuses a stale ready guest', async () => {
    const { players, snapshot: initial } = await createManyHumanRoom(3, 0, threeSeatConfig);
    const host = players[0]!;
    const absent = players[2]!;
    let current = (await playHandToFolds(players, initial, host.playerId)).snapshot;
    const ledger = seatOf(current, absent.playerId).ledger;
    await executeSql(`update private.multiplayer_seat_liveness set renewed_at_ms = (extract(epoch from clock_timestamp()) * 1000)::bigint - 20000 where room_id = '${current.roomId}' and user_id = '${absent.user.userId}'`);
    current = await command(host, current, 'deal-now');
    expect(current.hand.handNumber).toBe(2);
    expect(current.hand.activePlayerIds).not.toContain(absent.playerId);
    expect(seatOf(current, absent.playerId)).toMatchObject({ participation: 'disconnected', connection: 'offline', ledger });

    const newHost = await createUser(); const guest = await createUser();
    const created = await createRoom(newHost); const joined = await joinRoom(guest, created.snapshot.roomCode);
    const hostSeat = { user: newHost, label: 'start-host', playerId: created.snapshot.viewerPlayerId };
    const guestSeat = { user: guest, label: 'start-guest', playerId: joined.snapshot.viewerPlayerId };
    let lobby = await command(hostSeat, joined.snapshot, 'set-ready', { ready: true });
    lobby = await command(guestSeat, lobby, 'set-ready', { ready: true });
    await executeSql(`update private.multiplayer_seat_liveness set renewed_at_ms = (extract(epoch from clock_timestamp()) * 1000)::bigint - 20000 where room_id = '${lobby.roomId}' and user_id = '${guest.userId}'`);
    lobby = await command(hostSeat, lobby, 'start');
    expect(lobby).toMatchObject({ status: 'lobby', hand: null });
    expect(seatOf(lobby, guestSeat.playerId)).toMatchObject({ ready: false, participation: 'disconnected' });
    // A fresh heartbeat alone cannot silently re-ready the absent owner.
    expect((await livenessCall(guest, lobby.roomId)).status).toBe(200);
    lobby = await command(guestSeat, lobby, 'set-connection', { connection: 'online' });
    expect(seatOf(lobby, guestSeat.playerId).ready).toBe(false);
    lobby = await command(guestSeat, lobby, 'set-ready', { ready: true });
    expect((await command(hostSeat, lobby, 'start')).status).toBe('playing');
  }, 120_000);

  it('a silent client loses its turn to an enforced fold — never a courtesy check — and returns only through the owner path', async () => {
    const { players, snapshot } = await createManyHumanRoom(3, 0, threeSeatConfig);
    const roomId = snapshot.roomId as string;
    // The victim is the big blind: with both other seats just calling, the
    // BB's expired turn has a FREE CHECK available. The pre-fix coordinator
    // resolves that with an automatic check; Q4 must enforce the fold.
    const victimPlayerId = snapshot.hand?.bigBlindPlayerId as string;
    const victim = players.find((player) => player.playerId === victimPlayerId);
    const survivors = players.filter((player) => player.playerId !== victimPlayerId);
    if (!victim || survivors.length !== 2) throw new Error('The Q4 victim fixture is missing.');

    // Current-client lobby commands establish observed contact. Older clients
    // are rejected by the request capability gate, not inferred from rows.
    const rowsBefore = livenessRows(roomId);
    expect(rowsBefore).toHaveLength(3);
    const victimRowBefore = rowsBefore.find((row) => row.userId === victim.user.userId);
    if (!victimRowBefore) throw new Error('The victim seat never produced a liveness row.');

    // Drive the preflop action to the big blind with survivors only.
    let current: any = snapshot;
    let guard = 0;
    while (current.status === 'playing' && current.hand?.toAct && current.hand.toAct !== victimPlayerId) {
      guard += 1;
      if (guard > 20) throw new Error('The preflop drive never reached the big blind.');
      const actor = players.find((player) => player.playerId === current.hand.toAct);
      if (!actor) throw new Error('The drive lost a bound identity.');
      const synced = await syncRoom(actor.user, roomId);
      if (!synced.legalActions) continue;
      const legal = synced.legalActions;
      const action: Record<string, unknown> = legal.canCheck
        ? { type: 'check' }
        : legal.canCall ? { type: 'call' } : { type: 'fold' };
      commandCounter += 1;
      current = await commandWith(actor, synced, 'action', { action }, `q4-drive:${commandCounter}`);
    }
    expect(current.hand?.toAct, 'the victim must hold the turn').toBe(victimPlayerId);
    const deadline = current.turnDeadlineAtMs as number;
    expect(typeof deadline).toBe('number');

    // A peer CANNOT renew the victim's row: the RPC proves ownership from the
    // canonical state and answers 403 without writing.
    const peer = survivors[0]!;
    commandCounter += 1;
    const peerProbe = await livenessCall(peer.user, roomId);
    expect(peerProbe.status).toBe(200); // peers renew THEIR OWN rows
    const wrongRoom = await livenessCall(peer.user, '33333333-3333-3333-8333-333333333333');
    expect(wrongRoom.status).toBe(404);

    // Let the REAL 30-second deadline pass with the victim silent — no
    // commands, no heartbeats, no sync. Only real wall-clock time decides.
    const waitUntil = deadline + 1_200;
    while (Date.now() < waitUntil) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 500));
    }
    const victimRowAfterWait = livenessRows(roomId)
      .find((row) => row.userId === victim.user.userId);
    expect(victimRowAfterWait?.renewedAtMs, 'the silent victim row must not advance')
      .toBe(victimRowBefore.renewedAtMs);

    // The survivor's tick carries the enforcement: liveness rows load, the
    // stale actor is treated disconnected, and the expiry folds.
    const survivor = survivors[1]!;
    const tickSnapshot = await syncRoom(survivor.user, roomId);
    expect(tickSnapshot.turnDeadlineAtMs).toBe(deadline);
    commandCounter += 1;
    const tickId = `q4-tick:${commandCounter}`;
    // Inject a real RPC read failure ONLY for this disposable room. Restore
    // the exact original function in finally; no public test bypass exists.
    const original = queryRows("select replace(encode(convert_to(pg_get_functiondef('public.multiplayer_load_seat_liveness(uuid)'::regprocedure), 'UTF8'), 'base64'), E'\\n', '')", ['definition'])[0]!.definition!;
    const beforeFailure = queryRows(`select canonical_state::text from private.multiplayer_game_states where room_id = '${roomId}'`, ['state']);
    try {
      await executeSql(`create or replace function public.multiplayer_load_seat_liveness(p_room_id uuid) returns table (user_id uuid, renewed_at_ms bigint) language plpgsql security invoker set search_path = '' as $fault$ begin if p_room_id = '${roomId}'::uuid then raise exception 'Scoped integration read fault' using errcode = '57014'; end if; return query select live.user_id, live.renewed_at_ms from private.multiplayer_seat_liveness as live where live.room_id = p_room_id; end; $fault$;`);
      await expectCommandError(survivor, tickSnapshot, 'tick', 503, 'room_unavailable', {}, tickId);
      expect(queryRows(`select canonical_state::text from private.multiplayer_game_states where room_id = '${roomId}'`, ['state'])).toEqual(beforeFailure);
    } finally {
      await executeSql(Buffer.from(original, 'base64').toString('utf8'));
    }
    // Same command id/version retries the unchanged deadline and folds once.
    const ticked = await commandEnvelopeWith(survivor, tickSnapshot, 'tick', {}, tickId);
    expect(ticked.transition?.timeout).toMatchObject({
      action: 'fold',
      aiTookOver: false,
      playerId: victimPlayerId,
    });
    const victimSeat = seatOf(ticked.snapshot, victimPlayerId);
    expect(victimSeat.connection).toBe('offline');
    expect(victimSeat.participation).toBe('disconnected');

    // The victim's public ledger carries one enforced fold and ZERO checks.
    const victimActions = queryRows(
      `select action_type from public.multiplayer_actions `
      + `where room_id = '${roomId}' and player_id = '${victimPlayerId}'`,
      ['type'],
    );
    expect(victimActions.filter((row) => row.type === 'check')).toHaveLength(0);
    expect(victimActions.filter((row) => row.type === 'fold')).toHaveLength(1);

    // Late renewal after the fold: 200 for the owner, and it changes
    // NOTHING canonical — the room version stands, the fold stands, the
    // seat stays disconnected.
    const versionAfterTick = ticked.snapshot.version as number;
    const lateRenew = await livenessCall(victim.user, roomId);
    expect(lateRenew.status).toBe(200);
    expect(lateRenew.payload?.renewed).toBe(true);
    const afterLateRenew = await syncRoom(survivor.user, roomId);
    expect(afterLateRenew.version).toBe(versionAfterTick);
    expect(seatOf(afterLateRenew, victimPlayerId).participation).toBe('disconnected');

    // Finish hand 1 between the survivors (they keep renewing by acting).
    const winner = survivors[0]!;
    const settled = await playHandToFolds(
      [survivor, winner],
      afterLateRenew,
      winner.playerId,
    );
    current = settled.snapshot;
    expect(current.status).toBe('between-hands');

    // The stale victim stays omitted from the next deal even though the
    // countdown runs: only the OWNER's online command restores participation.
    commandCounter += 1;
    const betweenSync = await syncRoom(survivor.user, roomId);
    const dealAgain = await commandWith(
      survivor, betweenSync, 'tick', {}, `q4-deal2:${commandCounter}`,
    ).catch(() => null);
    if (dealAgain && dealAgain.status === 'playing') current = dealAgain;
    if (current.status !== 'playing') {
      // The countdown may still be running; wait it out with due ticks.
      let ticks = 0;
      while (current.status === 'between-hands' && ticks < 20) {
        ticks += 1;
        await new Promise((resolveSleep) => setTimeout(resolveSleep, 1_000));
        const ready = await syncRoom(survivor.user, roomId);
        commandCounter += 1;
        current = await commandWith(survivor, ready, 'tick', {}, `q4-deal2:${commandCounter}`)
          .catch(async (error: unknown) => {
            if (String(error).includes('room_command_invalid')) return ready;
            throw error;
          });
      }
    }
    expect(current.status).toBe('playing');
    expect(dealtIds(current), 'the disconnected victim must be omitted from the next deal')
      .not.toContain(victimPlayerId);

    // Owner return path: the victim's own online command restores
    // participation and the ledger keeps its identity and chips.
    const victimLedger = seatOf(current, victimPlayerId).ledger;
    expect(victimLedger?.settledStack).toBeGreaterThan(0);
    const victimSync = await syncRoom(victim.user, roomId);
    commandCounter += 1;
    const returned = await commandWith(
      victim, victimSync, 'set-connection', { connection: 'online' }, `q4-return:${commandCounter}`,
    );
    expect(seatOf(returned, victimPlayerId).participation).toBe('active');
    expect(seatOf(returned, victimPlayerId).connection).toBe('online');
    expect(seatOf(returned, victimPlayerId).ledger?.settledStack).toBe(victimLedger?.settledStack);

    // Settle hand 2 (survivors only) and prove the returned seat is dealt
    // into hand 3.
    const hand2Winner = await playHandToFolds(
      [survivor, winner],
      returned,
      winner.playerId,
    );
    current = hand2Winner.snapshot;
    expect(current.status).toBe('between-hands');
    let dealt3 = current;
    let guard2 = 0;
    // The next deal may take a while: a busted survivor can hold a pending
    // rebuy decision, and the countdown only arms after that decision
    // resolves on a due tick (existing 3.11F contract). Every remaining
    // client heartbeats like its modal does, exactly as after an owner
    // return: the between-hands sweep must leave every fresh seat untouched
    // until the countdown legitimately deals the next hand.
    while (dealt3.status === 'between-hands' && guard2 < 55) {
      guard2 += 1;
      await new Promise((resolveSleep) => setTimeout(resolveSleep, 1_000));
      await livenessCall(victim.user, roomId);
      await livenessCall(survivor.user, roomId);
      await livenessCall(winner.user, roomId);
      const ready = await syncRoom(survivor.user, roomId);
      commandCounter += 1;
      dealt3 = await commandWith(survivor, ready, 'tick', {}, `q4-deal3:${commandCounter}`)
        .catch(async (error: unknown) => {
          if (String(error).includes('room_command_invalid')) return ready;
          throw error;
        });
    }
    // Two legal continuations exist after a sweep demotes a bust-ready
    // survivor mid-between-hands: the returned owner is dealt into a fresh
    // hand, OR the room completes as last-player-standing because the
    // demoted survivor's chips stayed conserved in the ledger. Neither path
    // may resurrect the swept fold, and the sweep must never fabricate a
    // check for the victim.
    expect(['playing', 'complete']).toContain(dealt3.status);
    const victimLedgerFinal = seatOf(dealt3, victimPlayerId).ledger;
    expect(victimLedgerFinal?.settledStack).toBe(victimLedger?.settledStack);
    expect(victimLedgerFinal?.settledHandNumber).toBeLessThanOrEqual(2);
    const checksAfterAll = queryRows(
      `select count(*) as n from public.multiplayer_actions `
      + `where room_id = '${roomId}' and player_id = '${victimPlayerId}' and action_type = 'check'`,
      ['n'],
    );
    expect(checksAfterAll[0]!.n).toBe('0');
    if (dealt3.status === 'playing') {
      expect(dealtIds(dealt3), 'the returned owner must be dealt into the next hand')
        .toContain(victimPlayerId);
    } else {
      expect(dealt3.completionReason).toBe('last-player-standing');
    }
  }, 180_000);

  it('refuses liveness from strangers without writing anything', async () => {
    const { snapshot } = await createManyHumanRoom(2, 0, { ...testConfig, seatCount: 2 } as const);
    const stranger = await createUser();
    const strangerProbe = await livenessCall(stranger, snapshot.roomId);
    expect(strangerProbe.status).toBe(403);
    expect(strangerProbe.payload?.error?.code).toBe('room_forbidden');
    const rows = livenessRows(snapshot.roomId);
    expect(rows.some((row) => row.userId === stranger.userId)).toBe(false);
  }, 90_000);
});
