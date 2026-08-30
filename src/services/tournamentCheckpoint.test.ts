import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-sqlite/localStorage/install', () => ({}));

import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../domain/poker/multiway';
import { createSitAndGo, isSitAndGoCheckpoint, type SitAndGoCheckpoint } from '../domain/poker/tournament';
import { seededRandom } from '../domain/poker/cards';
import type { PlayerAction } from '../domain/poker/types';
import {
  clearSitAndGoCheckpoint,
  loadSitAndGoCheckpoint,
  saveSitAndGoCheckpoint,
} from './tournamentCheckpoint';

const THREE_PLAYER_KEY = 'rivermind.sit-and-go.checkpoint.v1';
const SIX_PLAYER_KEY = 'rivermind.sit-and-go.checkpoint.6-player.v1';
const NINE_PLAYER_KEY = 'rivermind.sit-and-go.checkpoint.9-player.v1';

function finishByFolding(state: MultiwayHandState): MultiwayHandState {
  let current = state;
  for (let guard = 0; !current.outcome && guard < 24; guard += 1) {
    const playerId = current.toAct;
    if (!playerId) throw new Error('Tournament hand has no player to act.');
    const legal = getMultiwayLegalActions(current, playerId);
    const action: PlayerAction = legal.canFold
      ? { type: 'fold' }
      : legal.canCheck
        ? { type: 'check' }
        : { type: 'call' };
    current = applyMultiwayAction(current, playerId, action);
  }
  if (!current.outcome) throw new Error('Tournament test hand did not finish.');
  return current;
}

function checkpointFor(playerCount: 3 | 6 | 9): SitAndGoCheckpoint {
  const game = createSitAndGo(seededRandom(playerCount * 7), playerCount, 'standard', 'club');
  const completed = finishByFolding(game);
  const checkpoint = {
    version: 1 as const,
    savedAt: '2026-08-03T00:00:00.000Z',
    nextHandNumber: completed.handNumber + 1,
    lastButtonSeat: completed.buttonSeat,
    aiDifficulty: 'club' as const,
    players: completed.tablePlayerIds.map((playerId) => {
      const player = completed.players[playerId]!;
      return {
        id: player.id,
        name: player.name,
        seat: player.seat,
        stack: player.stack,
        ...(player.isHero ? { isHero: true } : {}),
      };
    }),
  };
  if (!isSitAndGoCheckpoint(checkpoint)) throw new Error('Test fixture produced an invalid checkpoint.');
  return checkpoint;
}

let originalLocalStorage: Storage | undefined;

beforeEach(() => {
  originalLocalStorage = globalThis.localStorage;
});

afterEach(() => {
  clearSitAndGoCheckpoint(3);
  clearSitAndGoCheckpoint(6);
  clearSitAndGoCheckpoint(9);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
    writable: true,
  });
});

describe('Sit & Go checkpoint persistence (3.11D)', () => {
  it('persists nine-player runs under their own key, never the three-player key', () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
      },
      writable: true,
    });
    const three = checkpointFor(3);
    const nine = checkpointFor(9);

    saveSitAndGoCheckpoint(three);
    saveSitAndGoCheckpoint(nine);

    // The nine-seat save collides with nothing: each count owns its key.
    expect(JSON.parse(values.get(NINE_PLAYER_KEY)!)).toEqual(nine);
    expect(JSON.parse(values.get(THREE_PLAYER_KEY)!)).toEqual(three);
    expect(values.has(SIX_PLAYER_KEY)).toBe(false);

    expect(loadSitAndGoCheckpoint(3)).toEqual(three);
    expect(loadSitAndGoCheckpoint(9)).toEqual(nine);
    expect(loadSitAndGoCheckpoint(6)).toBeNull();
  });

  it('clearing one seat count never disturbs another', () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
      },
      writable: true,
    });
    const three = checkpointFor(3);
    const nine = checkpointFor(9);
    saveSitAndGoCheckpoint(three);
    saveSitAndGoCheckpoint(nine);

    clearSitAndGoCheckpoint(9);

    expect(loadSitAndGoCheckpoint(9)).toBeNull();
    expect(loadSitAndGoCheckpoint(3)).toEqual(three);
    expect(values.has(NINE_PLAYER_KEY)).toBe(false);
    expect(values.has(THREE_PLAYER_KEY)).toBe(true);
  });

  it('keeps per-count memory checkpoints when device storage is unavailable', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
      writable: true,
    });
    const nine = checkpointFor(9);

    saveSitAndGoCheckpoint(nine);

    expect(loadSitAndGoCheckpoint(9)).toEqual(nine);
    expect(loadSitAndGoCheckpoint(3)).toBeNull();
  });

  it('rejects a stored payload whose seat count does not match the requested table', () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => void values.set(key, value),
        removeItem: (key: string) => void values.delete(key),
      },
      writable: true,
    });
    const nine = checkpointFor(9);
    values.set(THREE_PLAYER_KEY, JSON.stringify(nine));

    // A nine-seat payload under the three-player key cannot restore as a
    // three-player run — the count guard refuses it instead of crashing.
    expect(loadSitAndGoCheckpoint(3)).toBeNull();
  });
});
