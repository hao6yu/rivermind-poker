import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A controllable remote: each test decides whether authentication and the
// practice_hands read succeed, which is what an offline player experiences.
const supabaseMock = vi.hoisted(() => ({
  ensureAnonymousSession: vi.fn<() => Promise<string>>(),
  from: vi.fn<(table: string) => unknown>(),
}));

vi.mock('./supabase', () => ({
  ensureAnonymousSession: supabaseMock.ensureAnonymousSession,
  supabase: { from: supabaseMock.from },
}));
vi.mock('expo-crypto', () => ({ randomUUID: vi.fn(() => 'test-command-id') }));

// The private-table read is mocked so each test decides whether the private
// source returns rows, returns empty, or fails outright.
const multiplayerMock = vi.hoisted(() => ({
  loadMultiplayerHandHistory: vi.fn<(input: { limit: number }) => Promise<unknown[]>>(),
}));

vi.mock('./multiplayer', () => ({
  loadMultiplayerHandHistory: multiplayerMock.loadMultiplayerHandHistory,
}));

import { seededRandom } from '../domain/poker/cards';
import { applyAction, createHand, getLegalActions } from '../domain/poker/engine';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../domain/poker/multiway';
import {
  createMultiwaySessionHand,
  decideSessionAiAction,
  seededMultiwayDecisionRandom,
  type MultiwayTablePlayerCount,
} from '../domain/poker/multiwaySession';
import { redactGameForPersistence } from '../domain/poker/persistence';
import type { GameState, PlayerAction } from '../domain/poker/types';
import {
  isMultiwaySessionHandRecord,
  type MultiwaySessionHandRecord,
  type SessionHandRecord,
} from '../features/table/sessionModels';
import {
  clearPendingHandHistory,
  loadRecentHandHistory,
  loadRecentHandHistoryResult,
  queueHandPersistence,
  queueMultiwayHandPersistence,
} from './handHistory';
import { loadPlayStatistics, OWN_TABLE_STATS_LIMIT, PRIVATE_TABLE_STATS_LIMIT } from './playStatistics';
import { describePlayStatistics } from '../features/profile/playStatisticsPresentation';
import type { MessageKey } from '../localization';

/** A translator that names its key and parameters instead of rendering copy. */
const keyNamingTranslator = (
  key: MessageKey,
  params?: Record<string, string | number>,
): string => {
  const values = Object.entries(params ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join(',');
  return values === '' ? key : `${key}(${values})`;
};

/** Narrows a history record to its multiway variant, failing loudly otherwise. */
function expectMultiway(record: SessionHandRecord | undefined): MultiwaySessionHandRecord {
  if (!record || !isMultiwaySessionHandRecord(record)) {
    throw new Error('Expected a multiway hand record.');
  }
  return record;
}

const queueStorageKey = 'rivermind.persistence.hand-writes.v1';

function heroHeadsUpAction(state: GameState): PlayerAction {
  const legal = getLegalActions(state, 'hero');
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall && legal.toCall <= state.bigBlind * 3) return { type: 'call' };
  return { type: 'fold' };
}

function villainAction(state: GameState): PlayerAction {
  const legal = getLegalActions(state, 'villain');
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall) return { type: 'call' };
  return { type: 'fold' };
}

function finishHeadsUpHand(state: GameState): GameState {
  let current = state;
  let guard = 0;
  while (!current.outcome && guard < 150) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('The hand has no player to act.');
    const action = playerId === 'hero' ? heroHeadsUpAction(current) : villainAction(current);
    current = applyAction(current, playerId, action);
    guard += 1;
  }
  if (!current.outcome) throw new Error('The heads-up hand did not terminate.');
  return current;
}

function heroMultiwayAction(state: MultiwayHandState): PlayerAction {
  const legal = getMultiwayLegalActions(state, 'hero');
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall && legal.toCall <= state.bigBlind * 3) return { type: 'call' };
  return { type: 'fold' };
}

function finishMultiwayHand(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  let guard = 0;
  while (!current.outcome && guard < 150) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('The hand has no player to act.');
    const action = playerId === 'hero'
      ? heroMultiwayAction(current)
      : decideSessionAiAction(current, playerId, 'club', seededMultiwayDecisionRandom(current, playerId)).action;
    current = applyMultiwayAction(current, playerId, action);
    guard += 1;
  }
  if (!current.outcome) throw new Error('The multiway hand did not terminate.');
  return current;
}

function completedQuickGameHand(playerCount: MultiwayTablePlayerCount): MultiwayHandState {
  return finishMultiwayHand(
    createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, playerCount, seededRandom(210 + playerCount)),
  );
}

function completedHeadsUpHand(): GameState {
  return finishHeadsUpHand(createHand({ random: seededRandom(7) }));
}

function completedHandAtSize(seatCount: number): MultiwayHandState {
  const players: TablePlayerConfig[] = Array.from({ length: seatCount }, (_, seat) => ({
    id: seat === 0 ? 'hero' : `ai-${seat}`,
    name: seat === 0 ? 'You' : `Seat ${seat}`,
    seat,
    stack: 2_000,
    isHero: seat === 0,
  }));
  return finishMultiwayHand(createMultiwayHand({ players, random: seededRandom(500 + seatCount) }));
}

interface HandRow {
  id: string;
  client_id: string;
  completed_at: string;
  game_state: unknown;
}

function queryResult(result: { data: unknown; error: unknown }): unknown {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: chain,
    eq: chain,
    order: chain,
    limit: chain,
    in: chain,
    upsert: chain,
    then: (
      resolve: (value: { data: unknown; error: unknown }) => unknown,
      reject: (value: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  });
  return builder;
}

/** Rows the remote practice_hands read returns; empty by default. */
let remoteHands: HandRow[];

function stubRemoteRead(options: { handsError?: boolean } = {}): void {
  supabaseMock.ensureAnonymousSession.mockResolvedValue('user-1');
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === 'practice_hands') {
      return options.handsError
        ? queryResult({ data: null, error: { message: 'network unreachable' } })
        : queryResult({ data: remoteHands, error: null });
    }
    if (table === 'hand_reviews') return queryResult({ data: [], error: null });
    throw new Error(`Unexpected table ${table}`);
  });
}

function handRow(id: string, clientId: string, gameState: unknown, completedAt: string): HandRow {
  return { id, client_id: clientId, completed_at: completedAt, game_state: gameState };
}

function createStorageShim(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  } as Storage;
}

describe.sequential('play statistics service', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorageShim();
    vi.stubGlobal('localStorage', storage);
    remoteHands = [];
    supabaseMock.ensureAnonymousSession.mockReset();
    supabaseMock.from.mockReset();
    multiplayerMock.loadMultiplayerHandHistory.mockReset();
    multiplayerMock.loadMultiplayerHandHistory.mockResolvedValue([]);
    clearPendingHandHistory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('hydrates a nine-seat hand from the database as a local multiway record', async () => {
    stubRemoteRead();
    const game = completedQuickGameHand(9);
    remoteHands = [handRow('row-9', 'session-remote:hand:1', game, '2024-03-01T10:00:00Z')];

    const hands = await loadRecentHandHistory();
    expect(hands).toHaveLength(1);
    const record = expectMultiway(hands[0]);
    expect(record.game.tablePlayerIds).toHaveLength(9);
  });

  it('drops corrupt database rows for unsupported sizes and duplicated seats', async () => {
    stubRemoteRead();
    remoteHands = [
      handRow('row-4', 'session-a:hand:1', completedHandAtSize(4), '2024-03-01T10:00:00Z'),
      handRow('row-dup', 'session-b:hand:1', {
        ...completedQuickGameHand(3),
        tablePlayerIds: ['hero', 'ai-1', 'ai-1'],
      }, '2024-03-01T11:00:00Z'),
      handRow('row-9', 'session-c:hand:1', completedQuickGameHand(9), '2024-03-01T12:00:00Z'),
    ];

    const hands = await loadRecentHandHistory();
    expect(hands.map((hand) => hand.clientId)).toEqual(['session-c:hand:1']);
  });

  it('labels a failed own-tables read with zero queued hands as unavailable, not empty', async () => {
    stubRemoteRead({ handsError: true });

    const statistics = await loadPlayStatistics();
    expect(statistics.hands).toBe(0);
    expect(statistics.coverage.solo).toBe('unavailable');
    expect(statistics.coverage.local).toBe('unavailable');
    // The private source was not requested by this read, not failed.
    expect(statistics.coverage.private).toBe('skipped');
    expect(statistics.coverage.solo).not.toBe('complete');
  });

  it('marks a deliberately skipped private source without calling it a failure', async () => {
    stubRemoteRead();

    const statistics = await loadPlayStatistics();
    expect(statistics.coverage.private).toBe('skipped');
    expect(statistics.coverage.solo).toBe('complete');
    expect(statistics.coverage.local).toBe('complete');
  });

  it('never claims an empty record when the local read failed but private read succeeded empty', async () => {
    stubRemoteRead({ handsError: true });

    const statistics = await loadPlayStatistics({ includePrivate: true });
    expect(statistics.hands).toBe(0);
    // The private source genuinely read nothing, but the player's own-table
    // history could not be read at all, so the record is unverified.
    expect(statistics.coverage.private).toBe('complete');
    expect(statistics.coverage.solo).toBe('unavailable');
  });

  it('never claims an empty record when the private read failed but the local read succeeded empty', async () => {
    stubRemoteRead();
    multiplayerMock.loadMultiplayerHandHistory.mockRejectedValue(
      new Error('The private history could not be read.'),
    );

    const statistics = await loadPlayStatistics({ includePrivate: true });
    expect(statistics.hands).toBe(0);
    expect(statistics.coverage.solo).toBe('complete');
    expect(statistics.coverage.private).toBe('unavailable');
  });

  it('credits mixed partial-local and server-read private totals to both origins', async () => {
    stubRemoteRead({ handsError: true });
    expect(await queueMultiwayHandPersistence({
      sessionClientId: 'session-mixed',
      coachEnabled: false,
      game: completedQuickGameHand(6),
    })).toBe(false);

    const statistics = await loadPlayStatistics({ includePrivate: true });
    expect(statistics.hands).toBe(1);
    expect(statistics.coverage.local).toBe('partial');
    expect(statistics.coverage.private).toBe('complete');
    expect(statistics.coverage.private).not.toBe('partial');
  });

  it('keeps the capped qualifier when partial own tables share totals with capped private tables', async () => {
    stubRemoteRead({ handsError: true });
    expect(await queueMultiwayHandPersistence({
      sessionClientId: 'session-mixed-capped',
      coachEnabled: false,
      game: completedQuickGameHand(6),
    })).toBe(false);
    // The private archive returns exactly its row ceiling, so the private
    // read is a truncated window, not the player's full private history.
    const base = completedQuickGameHand(3);
    multiplayerMock.loadMultiplayerHandHistory.mockResolvedValue(
      Array.from({ length: PRIVATE_TABLE_STATS_LIMIT }, (_, index) => ({
        completedAtMs: 1_700_000_000_000 + index,
        completionReason: null,
        hand: { ...base, handNumber: index + 1 },
        roomId: 'room-mixed-capped',
        sessionNumber: 1,
        viewerPlayerId: 'hero',
      })),
    );

    const statistics = await loadPlayStatistics({ includePrivate: true });
    expect(statistics.coverage.local).toBe('partial');
    expect(statistics.coverage.private).toBe('capped');
    expect(statistics.hands).toBe(1 + PRIVATE_TABLE_STATS_LIMIT);

    // The copy beside those numbers must name both origins AND the truncation.
    const panel = describePlayStatistics(statistics, keyNamingTranslator);
    expect(panel.notes).toContain(
      'profile.stats.noteOfflineMixedRecent(scope=profile.stats.scopePrivate)',
    );
    expect(panel.notes).not.toContain('profile.stats.noteOfflineMixed(scope=');
  });

  it('counts queued hands and marks the partial fallback when the remote read fails', async () => {
    stubRemoteRead({ handsError: true });
    const multiway = completedQuickGameHand(9);
    expect(await queueMultiwayHandPersistence({
      sessionClientId: 'session-offline-multiway',
      coachEnabled: false,
      game: multiway,
    })).toBe(false);
    const headsUp = redactGameForPersistence(completedHeadsUpHand());
    expect(await queueHandPersistence({
      sessionClientId: 'session-offline-solo',
      coachEnabled: false,
      game: headsUp,
    })).toBe(false);

    const statistics = await loadPlayStatistics();
    // The queued hands survive in the totals.
    expect(statistics.hands).toBe(2);
    expect(statistics.bySource.local.hands).toBe(1);
    expect(statistics.bySource.solo.hands).toBe(1);
    // …but an unverified partial fallback is never labelled complete.
    expect(statistics.coverage.solo).toBe('partial');
    expect(statistics.coverage.local).toBe('partial');
    expect(statistics.coverage.solo).not.toBe('complete');
  });

  it('counts a queued nine-seat Quick Game hand in the local totals', async () => {
    stubRemoteRead({ handsError: true });
    expect(await queueMultiwayHandPersistence({
      sessionClientId: 'session-nine',
      coachEnabled: false,
      game: completedQuickGameHand(9),
    })).toBe(false);

    const statistics = await loadPlayStatistics();
    expect(statistics.bySource.local.hands).toBe(1);
    expect(statistics.hands).toBe(1);
  });

  it('labels a genuinely empty history as complete', async () => {
    stubRemoteRead();

    const statistics = await loadPlayStatistics();
    expect(statistics.hands).toBe(0);
    expect(statistics.coverage.solo).toBe('complete');
    expect(statistics.coverage.local).toBe('complete');
    // The private source was not requested by this read, not failed.
    expect(statistics.coverage.private).toBe('skipped');
  });

  it('keeps the capped-window label when the remote read fills its limit', async () => {
    stubRemoteRead();
    const headsUp = redactGameForPersistence(completedHeadsUpHand());
    remoteHands = Array.from({ length: OWN_TABLE_STATS_LIMIT }, (_, index) => handRow(
      `row-${index}`,
      `session-${index}:hand:1`,
      headsUp,
      `2024-03-01T00:00:${String(index % 60).padStart(2, '0')}.${String(index).padStart(4, '0')}Z`,
    ));

    const statistics = await loadPlayStatistics();
    expect(statistics.hands).toBe(OWN_TABLE_STATS_LIMIT);
    expect(statistics.coverage.solo).toBe('capped');
    expect(statistics.coverage.local).toBe('capped');
  });

  it('reports the offline queue fallback through the history result', async () => {
    stubRemoteRead({ handsError: true });
    expect(await queueMultiwayHandPersistence({
      sessionClientId: 'session-result',
      coachEnabled: false,
      game: completedQuickGameHand(6),
    })).toBe(false);

    const read = await loadRecentHandHistoryResult();
    expect(read.readComplete).toBe(false);
    expect(read.records).toHaveLength(1);
  });

  it('reports a complete read through the history result', async () => {
    stubRemoteRead();
    remoteHands = [handRow('row-9', 'session-remote:hand:1', completedQuickGameHand(9), '2024-03-01T10:00:00Z')];

    const read = await loadRecentHandHistoryResult();
    expect(read.readComplete).toBe(true);
    expect(read.records).toHaveLength(1);
  });
});
