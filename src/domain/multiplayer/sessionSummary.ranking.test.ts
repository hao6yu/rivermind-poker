import { describe, expect, it } from 'vitest';

import { buildMultiplayerSessionSummary } from './sessionSummary';
import type { MultiplayerRoomSnapshot } from './contracts';

function seat(overrides: {
  ledger: { settledStack: number; totalBuyIn: number; rebuyCount: number; rebuyChips: number };
  playerId: string;
  seat: number;
  stack?: number;
  displayName?: string;
}) {
  return {
    aiProfileId: null,
    connection: 'online' as const,
    control: 'human' as const,
    displayName: overrides.displayName ?? overrides.playerId,
    isHost: false,
    joinedAtMs: 0,
    kind: 'human' as const,
    missedTurns: 0,
    playerId: overrides.playerId,
    ready: true,
    seat: overrides.seat,
    userId: null,
    ledger: {
      ...overrides.ledger,
      seatedAtMs: 0,
      sessionId: 1,
    },
    participation: 'active' as const,
    avatar: null,
  } as unknown as MultiplayerRoomSnapshot['seats'][number];
}

function source(seats: MultiplayerRoomSnapshot['seats']) {
  return {
    completionReason: 'hand-limit' as const,
    config: { startingStackChips: 2000, seatCount: seats.length },
    hand: {
      handNumber: 10,
      outcome: { winnerPlayerIds: ['p1'] },
      players: Object.fromEntries(seats.map((s) => [s.playerId, {
        id: s.playerId,
        name: s.displayName,
        seat: s.seat,
        stack: s.ledger?.settledStack ?? 2000,
        isHero: false,
        holeCards: [],
      }])),
    },
    sessionNumber: 1,
    seats,
    status: 'complete' as const,
  } as unknown as MultiplayerRoomSnapshot;
}

describe('session standings ranking (legacy final-stack rule)', () => {
  it('ranks a fully ledgered rebuy session by final stack, matching every shipped client', () => {
    // v1.3 follow-up review reproduction: complete ledgers do not identify
    // client versions, and the pre-v1.3 client ranks the same snapshot by
    // final stack. Net ranking is deferred, so the sheet must name the SAME
    // winner: A (stack 3,500, net −500) over B (stack 2,500, net +500).
    const summary = buildMultiplayerSessionSummary(source([
      seat({ playerId: 'a', seat: 1, displayName: 'A', ledger: { settledStack: 3500, totalBuyIn: 4000, rebuyCount: 1, rebuyChips: 2000 } }),
      seat({ playerId: 'b', seat: 2, displayName: 'B', ledger: { settledStack: 2500, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
    ]), 'b');
    expect(summary).not.toBeNull();
    expect(summary!.rows.map((row) => row.playerId)).toEqual(['a', 'b']);
    expect(summary!.rows[0]!.place).toBe(1);
    expect(summary!.viewerPlace).toBe(2);
    // The delta column still reports the net truth without driving the order.
    expect(summary!.rows.map((row) => row.delta)).toEqual([-500, 500]);
    expect(summary!.rankedByNet).toBe(false);
  });

  it('never reports the net rule as active, with or without rebuys', () => {
    const withRebuys = buildMultiplayerSessionSummary(source([
      seat({ playerId: 'p1', seat: 1, ledger: { settledStack: 2600, totalBuyIn: 3000, rebuyCount: 1, rebuyChips: 1000 } }),
      seat({ playerId: 'p2', seat: 2, ledger: { settledStack: 1400, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
    ]), 'p1');
    expect(withRebuys!.rankedByNet).toBe(false);
    const withoutRebuys = buildMultiplayerSessionSummary(source([
      seat({ playerId: 'p1', seat: 1, ledger: { settledStack: 2400, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
      seat({ playerId: 'p2', seat: 2, ledger: { settledStack: 1600, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
    ]), 'p1');
    expect(withoutRebuys!.rankedByNet).toBe(false);
  });

  it('ranks seats without a ledger by their settled stack', () => {
    const legacy = seat({ playerId: 'p1', seat: 1, ledger: { settledStack: 2600, totalBuyIn: 5000, rebuyCount: 2, rebuyChips: 3000 } });
    delete (legacy as { ledger?: unknown }).ledger;
    const summary = buildMultiplayerSessionSummary(source([
      legacy,
      seat({ playerId: 'p2', seat: 2, ledger: { settledStack: 1400, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
    ]), 'p2');
    expect(summary!.rows.map((row) => row.playerId)).toEqual(['p1', 'p2']);
    expect(summary!.rankedByNet).toBe(false);
  });

  it('shares a place for equal final stacks and breaks ties by seat order', () => {
    const summary = buildMultiplayerSessionSummary(source([
      seat({ playerId: 'p2', seat: 2, ledger: { settledStack: 2100, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
      seat({ playerId: 'p1', seat: 1, ledger: { settledStack: 2100, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
      seat({ playerId: 'p3', seat: 3, ledger: { settledStack: 1_800, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
    ]), 'p3');
    expect(summary!.rows.map((row) => row.playerId)).toEqual(['p1', 'p2', 'p3']);
    expect(summary!.rows.map((row) => row.place)).toEqual([1, 1, 3]);
    expect(summary!.viewerPlace).toBe(3);
  });

  it('ranks a departed busted seat last by its settled stack', () => {
    const summary = buildMultiplayerSessionSummary(source([
      seat({ playerId: 'p1', seat: 1, ledger: { settledStack: 0, totalBuyIn: 4000, rebuyCount: 1, rebuyChips: 2000 } }),
      seat({ playerId: 'p2', seat: 2, ledger: { settledStack: 4000, totalBuyIn: 2000, rebuyCount: 0, rebuyChips: 0 } }),
    ]), 'p2');
    expect(summary!.rows[0]!.playerId).toBe('p2');
    expect(summary!.rows[1]!.stack).toBe(0);
    expect(summary!.viewerPlace).toBe(1);
  });
});
