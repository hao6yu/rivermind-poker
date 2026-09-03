import { describe, expect, it } from 'vitest';

import { seededRandom } from '../poker/cards';
import { applyAction, createHand, getLegalActions } from '../poker/engine';
import {
  applyMultiwayAction,
  createMultiwayHand,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type TablePlayerConfig,
} from '../poker/multiway';
import type { PlayerAction } from '../poker/types';
import {
  buildPlayStatistics,
  comparePlaySpotWindows,
  parsePlaySpotKey,
  playSpotBigBlindsPer100,
  PLAY_SPOT_SAMPLE_FLOOR,
  type PlayHandRecord,
} from './playStatistics';
import { localPlayHandRecords, soloPlayHandRecords } from './playStatisticsLedger';

// --- S6 (P18-037) fixtures: per-spot aggregates ----------------------------

function spotRecord(overrides: Partial<PlayHandRecord> & { handId: string }): PlayHandRecord {
  return {
    completed: true,
    result: 'won',
    source: 'local',
    tableId: overrides.tableId ?? 'session-a',
    ...overrides,
    spot: overrides.spot ?? {
      bigBlind: 20,
      family: 'facing-open',
      netChips: 0,
      position: 'late',
      street: 'preflop',
    },
  };
}

describe('per-spot aggregation (P18-037)', () => {
  it('never double-counts a hand: totals and spots share one deduplicated set', () => {
    const record = spotRecord({
      handId: 'session-a:hand:1',
      spot: { bigBlind: 20, family: 'facing-open', netChips: 120, position: 'late', street: 'preflop' },
    });
    const statistics = buildPlayStatistics([record, record, record], { local: 'complete' });
    expect(statistics.hands).toBe(1);
    expect(statistics.spots['late:preflop:facing-open']).toMatchObject({
      hands: 1,
      netChips: 120,
      bigBlinds: 6, // 120 / 20
    });
  });

  it('keeps legacy records without spot facts in the totals with no spot row', () => {
    const legacy: PlayHandRecord = {
      completed: true,
      handId: 'session-a:hand:2',
      result: 'lost',
      source: 'local',
      tableId: 'session-a',
    };
    const statistics = buildPlayStatistics([
      spotRecord({ handId: 'session-a:hand:1' }),
      legacy,
    ], { local: 'complete' });
    expect(statistics.hands).toBe(2);
    expect(Object.keys(statistics.spots)).toHaveLength(1);
  });

  it('normalizes net results through each hand\'s own big blind', () => {
    const statistics = buildPlayStatistics([
      // An 800-chip table (BB 4): +80 chips = +20 BB.
      spotRecord({
        handId: 'small:hand:1',
        spot: { bigBlind: 4, family: 'facing-open', netChips: 80, position: 'late', street: 'preflop' },
      }),
      // A 4,000-chip table (BB 20): +400 chips = +20 BB.
      spotRecord({
        handId: 'deep:hand:1',
        spot: { bigBlind: 20, family: 'facing-open', netChips: 400, position: 'late', street: 'preflop' },
      }),
    ], { local: 'complete' });
    const aggregate = statistics.spots['late:preflop:facing-open']!;
    expect(aggregate.hands).toBe(2);
    expect(aggregate.netChips).toBe(480);
    expect(aggregate.bigBlinds).toBeCloseTo(40, 6);
  });

  it('honors source coverage: an unavailable source contributes no spot rows', () => {
    const statistics = buildPlayStatistics([spotRecord({ handId: 'h1' })], { local: 'unavailable' });
    expect(statistics.hands).toBe(0);
    expect(statistics.spots).toEqual({});
  });

  it('is empty after a reset or account switch', () => {
    const statistics = buildPlayStatistics([]);
    expect(statistics.hands).toBe(0);
    expect(statistics.spots).toEqual({});
  });
});

describe('sample floor and comparison windows (D05/S6)', () => {
  it('never shows a rate below the 30-hand floor', () => {
    const thin = { bigBlinds: 4, hands: 4, netChips: 80 };
    expect(playSpotBigBlindsPer100(thin)).toBeNull();
  });

  it('shows the normalized rate once the floor is reached', () => {
    const aggregate = { bigBlinds: -45, hands: 30, netChips: -900 };
    expect(playSpotBigBlindsPer100(aggregate)).toBeCloseTo(-150, 6);
  });

  it('refuses a window comparison until each window clears the floor', () => {
    const thin = Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR * 2 - 1 }, (_, index) => ({
      bigBlinds: 1,
      completedAtMs: index,
    }));
    expect(comparePlaySpotWindows(thin).enoughData).toBe(false);
  });

  it('refuses a comparison when hands carry no timestamps', () => {
    const untimed = Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR * 2 }, () => ({
      bigBlinds: 1,
    }));
    expect(comparePlaySpotWindows(untimed).enoughData).toBe(false);
  });

  it('compares two clearly named windows when both clear the floor', () => {
    const hands = [
      // Older half: steadily losing 1 BB per hand.
      ...Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR }, (_, index) => ({
        bigBlinds: -1,
        completedAtMs: index,
      })),
      // Newer half: steadily winning 2 BB per hand.
      ...Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR }, (_, index) => ({
        bigBlinds: 2,
        completedAtMs: PLAY_SPOT_SAMPLE_FLOOR + index,
      })),
    ];
    const comparison = comparePlaySpotWindows(hands);
    expect(comparison.enoughData).toBe(true);
    if (comparison.enoughData) {
      expect(comparison.older).toMatchObject({ bigBlindsPer100: -100, hands: PLAY_SPOT_SAMPLE_FLOOR });
      expect(comparison.newer).toMatchObject({ bigBlindsPer100: 200, hands: PLAY_SPOT_SAMPLE_FLOOR });
    }
  });

  it('keeps the comparison ordering stable against unsorted input', () => {
    const hands = [
      ...Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR }, (_, index) => ({
        bigBlinds: -1,
        completedAtMs: PLAY_SPOT_SAMPLE_FLOOR * 10 + index, // newer timestamps…
      })),
      ...Array.from({ length: PLAY_SPOT_SAMPLE_FLOOR }, (_, index) => ({
        bigBlinds: 2,
        completedAtMs: index, // …but older values.
      })),
    ];
    const comparison = comparePlaySpotWindows(hands);
    expect(comparison.enoughData).toBe(true);
    if (comparison.enoughData) {
      // The newer window is the one with the LATER timestamps (-1 each).
      expect(comparison.newer.bigBlindsPer100).toBe(-100);
      expect(comparison.older.bigBlindsPer100).toBe(200);
    }
  });
});

// --- Spot fact derivation ---------------------------------------------------

function tablePlayers(count: number, stack = 2_000): TablePlayerConfig[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0 ? 'hero' : `ai-${index}`,
    isHero: index === 0,
    name: index === 0 ? 'You' : `AI ${index}`,
    seat: index,
    stack,
  }));
}

function passive(legal: ReturnType<typeof getMultiwayLegalActions>): PlayerAction {
  if (legal.canCheck) return { type: 'check' };
  if (legal.canCall) return { type: 'call' };
  return { type: 'fold' };
}

function variedMultiway(seed: number, playerCount: number, bigBlind = 20): MultiwayHandState {
  const random = seededRandom(seed);
  let game = createMultiwayHand({ bigBlind, buttonSeat: seed % playerCount, players: tablePlayers(playerCount), random, smallBlind: bigBlind / 2 });
  for (let count = 0; !game.outcome && count < 180; count += 1) {
    const playerId = game.toAct;
    if (!playerId) break;
    game = applyMultiwayAction(game, playerId, passive(getMultiwayLegalActions(game, playerId)));
  }
  return game;
}

describe('spot fact derivation', () => {
  it('maps a nine-seat hand whose hero is UTG to early:preflop', () => {
    // Button seat 6 puts the hero (seat 0) in UTG.
    let game = createMultiwayHand({ bigBlind: 20, buttonSeat: 6, players: tablePlayers(9), random: seededRandom(30_001), smallBlind: 10 });
    expect(game.players.hero!.position).toBe('UTG');
    game = applyMultiwayAction(game, 'hero', { type: 'raise', amount: 60 });
    // Everyone folds so the hand settles preflop and the hero's last recorded
    // decision stays on that street.
    for (let guard = 0; guard < 12 && !game.outcome && game.toAct; guard += 1) {
      const actor = game.toAct;
      if (actor === 'hero') break;
      game = applyMultiwayAction(game, actor, { type: 'fold' });
    }
    expect(game.outcome).toBeDefined();
    const [record] = localPlayHandRecords([{ clientId: 'session:hand:1', completedAt: '2026-09-02T00:00:00.000Z', game }]);
    expect(record?.spot).toMatchObject({ position: 'early', street: 'preflop' });
    expect(record?.completedAtMs).toBe(Date.parse('2026-09-02T00:00:00.000Z'));
  });

  it('marks a big blind facing a raise as blind defense', () => {
    // Button seat 8 makes the hero (seat 0) the small blind; rotate one more
    // for the big blind by using buttonSeat 7.
    let game = createMultiwayHand({ bigBlind: 20, buttonSeat: 7, players: tablePlayers(9), random: seededRandom(30_002), smallBlind: 10 });
    expect(game.players.hero!.position).toBe('BB');
    for (let guard = 0; guard < 40 && game.toAct !== 'hero' && !game.outcome; guard += 1) {
      const actor = game.toAct;
      if (!actor) break;
      const legal = getMultiwayLegalActions(game, actor);
      // The seat before the hero raises so the hero defends blind.
      const action = actor === 'ai-3' && legal.canRaise
        ? { type: 'raise' as const, amount: legal.minRaiseTo }
        : passive(legal);
      game = applyMultiwayAction(game, actor, action);
    }
    expect(game.toAct).toBe('hero');
    const raiseCount = game.history.filter((record) => record.street === 'preflop' && record.type === 'raise').length;
    expect(raiseCount).toBeGreaterThanOrEqual(1);
    game = applyMultiwayAction(game, 'hero', { type: 'call' });
    while (!game.outcome && game.toAct) {
      const actor = game.toAct;
      game = applyMultiwayAction(game, actor, passive(getMultiwayLegalActions(game, actor)));
    }
    const [record] = localPlayHandRecords([{ clientId: 'session:hand:2', game }]);
    expect(record?.spot).toMatchObject({ family: 'blind-defense', position: 'blinds' });
  });

  it('derives net chips for multiway hands exactly as the engine paid them', () => {
    const startingStack = 2_000;
    for (let seed = 31_000; seed < 31_010; seed += 1) {
      const game = variedMultiway(seed, 6);
      if (!game.outcome) continue;
      const [record] = localPlayHandRecords([{ clientId: `session:hand:${seed}`, game }]);
      expect(record?.spot).toBeDefined();
      const finalStack = game.players.hero!.stack;
      const expectedNet = finalStack - startingStack;
      expect(record!.spot!.netChips, `seed ${seed}`).toBe(expectedNet);
    }
  });

  it('derives net chips for heads-up hands exactly as the engine paid them', () => {
    for (let seed = 32_000; seed < 32_010; seed += 1) {
      const random = seededRandom(seed);
      let game = createHand({ bigBlind: 20, button: random() < 0.5 ? 'hero' : 'villain', random, smallBlind: 10 });
      let initialStack = game.players.hero.stack;
      if (game.street === 'preflop' && game.toAct) {
        // The blinds were posted before createHand returned, so the true
        // pre-hand stack is the observed stack PLUS the blind the hero posted.
        initialStack = game.players.hero.stack + (game.button === 'hero' ? game.smallBlind : game.bigBlind);
      }
      for (let count = 0; !game.outcome && count < 80; count += 1) {
        const playerId = game.toAct;
        if (!playerId) break;
        const legal = getLegalActions(game, playerId);
        const action: PlayerAction = legal.canCheck
          ? { type: 'check' }
          : legal.canRaise && random() < 0.3
            ? { type: 'raise', amount: legal.suggestedRaiseTo }
            : legal.canCall ? { type: 'call' } : { type: 'fold' };
        game = applyAction(game, playerId, action);
      }
      if (!game.outcome) continue;
      const [record] = soloPlayHandRecords([{ clientId: `solo:hand:${seed}`, game }]);
      expect(record?.spot).toBeDefined();
      expect(record!.spot!.netChips, `seed ${seed}`).toBe(game.players.hero.stack - initialStack);
    }
  });

  it('falls back to no spot facts when a hand has no recorded hero decision', () => {
    const game = variedMultiway(33_000, 3);
    const stripped = {
      ...game,
      history: game.history.filter((record) => record.playerId !== 'hero'),
    };
    const [record] = localPlayHandRecords([{ clientId: 'session:hand:9', game: stripped }]);
    expect(record).toBeDefined();
    expect(record!.spot).toBeUndefined();
  });

  it('round-trips spot keys through the parser', () => {
    expect(parsePlaySpotKey('early:preflop:facing-open')).toMatchObject({
      family: 'facing-open',
      position: 'early',
      street: 'preflop',
    });
    expect(parsePlaySpotKey('sneaky:preflop:facing-open')).toBeNull();
    expect(parsePlaySpotKey('garbage')).toBeNull();
  });
});
