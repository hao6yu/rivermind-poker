import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The offline queue runs without a remote: flushes fail and writes stay queued,
// which is exactly the state a nine-seat hand is in while the device is offline.
vi.mock('./supabase', () => ({ ensureAnonymousSession: vi.fn(), supabase: null }));

import { seededRandom } from '../domain/poker/cards';
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
import type { PlayerAction } from '../domain/poker/types';
import {
  clearPendingHandHistory,
  loadRecentHandHistory,
  pendingHandWriteCount,
  queueMultiwayHandPersistence,
} from './handHistory';
import {
  isMultiwaySessionHandRecord,
  type MultiwaySessionHandRecord,
  type SessionHandRecord,
} from '../features/table/sessionModels';

/** Narrows a history record to its multiway variant, failing loudly otherwise. */
function expectMultiway(record: SessionHandRecord | undefined): MultiwaySessionHandRecord {
  if (!record || !isMultiwaySessionHandRecord(record)) {
    throw new Error('Expected a multiway hand record.');
  }
  return record;
}

const queueStorageKey = 'rivermind.persistence.hand-writes.v1';

function heroAction(state: MultiwayHandState): PlayerAction {
  const legal = getMultiwayLegalActions(state, 'hero');
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall && legal.toCall <= state.bigBlind * 3) return { type: 'call' };
  return { type: 'fold' };
}

/** Plays one real multiway hand to its engine-settled outcome. */
function finishHand(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  let guard = 0;
  while (!current.outcome && guard < 150) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('The hand has no player to act.');
    const action = playerId === 'hero'
      ? heroAction(current)
      : decideSessionAiAction(current, playerId, 'club', seededMultiwayDecisionRandom(current, playerId)).action;
    current = applyMultiwayAction(current, playerId, action);
    guard += 1;
  }
  if (!current.outcome) throw new Error('The multiway hand did not terminate.');
  return current;
}

/** A real completed Quick Game hand at one of the supported sizes. */
function completedQuickGameHand(playerCount: MultiwayTablePlayerCount): MultiwayHandState {
  return finishHand(
    createMultiwaySessionHand({ startingStackBb: 40, handTarget: 1 }, playerCount, seededRandom(210 + playerCount)),
  );
}

/** A real completed hand at a size the Quick Game never offers. */
function completedHandAtSize(seatCount: number): MultiwayHandState {
  const players: TablePlayerConfig[] = Array.from({ length: seatCount }, (_, seat) => ({
    id: seat === 0 ? 'hero' : `ai-${seat}`,
    name: seat === 0 ? 'You' : `Seat ${seat}`,
    seat,
    stack: 2_000,
    isHero: seat === 0,
  }));
  return finishHand(createMultiwayHand({ players, random: seededRandom(500 + seatCount) }));
}

/** A Map-backed localStorage, so a module restart rehydrates what was queued. */
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

async function restartApp(): Promise<typeof import('./handHistory')> {
  vi.resetModules();
  return import('./handHistory');
}

function storedQueue(): unknown[] {
  const raw = globalThis.localStorage.getItem(queueStorageKey);
  if (raw === null) throw new Error('The offline queue was not written to storage.');
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('The stored queue is not an array.');
  return parsed;
}

describe.sequential('offline hand history queue integrity', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createStorageShim();
    vi.stubGlobal('localStorage', storage);
    // The statically imported module keeps its in-memory queue across tests;
    // empty it so every test starts from an empty persisted state.
    clearPendingHandHistory();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('queues and rehydrates a completed nine-seat Quick Game hand across a restart', async () => {
    const game = completedQuickGameHand(9);
    expect(game.tablePlayerIds).toHaveLength(9);

    const queued = await queueMultiwayHandPersistence({ sessionClientId: 'session-restart', coachEnabled: false, game });
    expect(queued).toBe(false); // Offline: the write stays in the queue.
    expect(pendingHandWriteCount()).toBe(1);

    // Simulated app restart: a fresh module instance reads only persisted state.
    const restarted = await restartApp();
    expect(restarted.pendingHandWriteCount()).toBe(1);
    const hands = await restarted.loadRecentHandHistory();
    expect(hands).toHaveLength(1);
    const record = expectMultiway(hands[0]);
    expect(record.game.tablePlayerIds).toHaveLength(9);
    expect(record.game.players.hero?.holeCards).toHaveLength(2);
  });

  it.each([3, 6, 9] as MultiwayTablePlayerCount[])('rehydrates a completed %i-seat hand with deck and unrevealed-card redaction intact', async (playerCount) => {
    const game = completedQuickGameHand(playerCount);
    const queued = await queueMultiwayHandPersistence({ sessionClientId: 'session-redact', coachEnabled: false, game });
    expect(queued).toBe(false);
    expect(storedQueue()).toHaveLength(1);

    const restarted = await restartApp();
    const [history] = await restarted.loadRecentHandHistory();
    const record = expectMultiway(history);
    expect(record.mode).toBe('multiway');
    expect(record.game.tablePlayerIds).toHaveLength(playerCount);
    // Redaction is preserved through the queue round trip: no residual deck and
    // no revealed cards for seats that folded out of a showdown.
    expect(record.game.deck).toEqual([]);
    for (const playerId of record.game.tablePlayerIds) {
      const player = record.game.players[playerId];
      expect(player).toBeDefined();
      const revealed = player?.isHero === true || (player?.folded === false && record.game.outcome?.showdown);
      if (!revealed) expect(player?.holeCards).toEqual([]);
    }
  });

  it.each([2, 4, 5, 7, 8])('drops a queued multiway hand at the unsupported %i-seat size on rehydration', async (seatCount) => {
    const game = completedHandAtSize(seatCount);
    expect(game.tablePlayerIds).toHaveLength(seatCount);
    const queued = await queueMultiwayHandPersistence({ sessionClientId: 'session-unsupported', coachEnabled: false, game });
    expect(queued).toBe(false);
    // The payload is persisted raw before validation; rehydration is where an
    // unsupported size must be rejected.
    expect(storedQueue()).toHaveLength(1);

    const restarted = await restartApp();
    expect(restarted.pendingHandWriteCount()).toBe(0);
    expect(await restarted.loadRecentHandHistory()).toEqual([]);
  });

  it('drops a queued ten-seat multiway payload on rehydration', async () => {
    const game = completedQuickGameHand(9);
    await queueMultiwayHandPersistence({ sessionClientId: 'session-ten', coachEnabled: false, game });
    // Fabricate an eleven-row table the engine itself could never produce.
    const entries = storedQueue() as Array<Record<string, unknown>>;
    const tenSeatGame = entries[0]?.game as MultiwayHandState;
    tenSeatGame.tablePlayerIds = [...tenSeatGame.tablePlayerIds, 'ai-10'];
    const seededOpponent = tenSeatGame.players['ai-1'];
    if (!seededOpponent) throw new Error('The fixture lost its seeded opponent.');
    tenSeatGame.players['ai-10'] = { ...seededOpponent, id: 'ai-10', seat: 9 };
    storage.setItem(queueStorageKey, JSON.stringify(entries));

    const restarted = await restartApp();
    expect(restarted.pendingHandWriteCount()).toBe(0);
    expect(await restarted.loadRecentHandHistory()).toEqual([]);
  });

  it('drops a payload whose table lists the same player at two seats', async () => {
    const game = completedQuickGameHand(3);
    await queueMultiwayHandPersistence({ sessionClientId: 'session-duplicate', coachEnabled: false, game });
    const entries = storedQueue() as Array<Record<string, unknown>>;
    const duplicated = entries[0]?.game as MultiwayHandState;
    duplicated.tablePlayerIds = [duplicated.tablePlayerIds[0] as string, 'ai-1', 'ai-1'];
    storage.setItem(queueStorageKey, JSON.stringify(entries));

    const restarted = await restartApp();
    expect(restarted.pendingHandWriteCount()).toBe(0);
  });

  it('drops a payload that lost one of its seated players', async () => {
    const game = completedQuickGameHand(3);
    await queueMultiwayHandPersistence({ sessionClientId: 'session-missing', coachEnabled: false, game });
    const entries = storedQueue() as Array<Record<string, unknown>>;
    const missing = entries[0]?.game as MultiwayHandState;
    delete missing.players['ai-2'];
    storage.setItem(queueStorageKey, JSON.stringify(entries));

    const restarted = await restartApp();
    expect(restarted.pendingHandWriteCount()).toBe(0);
  });

  it('drops a payload whose table no longer seats the hero', async () => {
    const game = completedQuickGameHand(3);
    await queueMultiwayHandPersistence({ sessionClientId: 'session-no-hero', coachEnabled: false, game });
    const entries = storedQueue() as Array<Record<string, unknown>>;
    const heroless = entries[0]?.game as MultiwayHandState;
    heroless.tablePlayerIds = heroless.tablePlayerIds.filter((playerId) => playerId !== 'hero');
    storage.setItem(queueStorageKey, JSON.stringify(entries));

    const restarted = await restartApp();
    expect(restarted.pendingHandWriteCount()).toBe(0);
  });
});
