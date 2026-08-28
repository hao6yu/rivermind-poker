import { describe, expect, it } from 'vitest';

import type {
  MultiplayerPublicTransition,
  MultiplayerSeatState,
  MultiplayerViewerProjection,
} from '../../domain/multiplayer/contracts';
import type { MultiwayActionRecord, MultiwayHandState } from '../../domain/poker/multiway';
import { detectAllInMoments, type AllInMomentEnvelope } from './allInMoment';

function publicAction(overrides: Partial<MultiwayActionRecord> = {}): MultiwayActionRecord {
  return {
    amount: 1_000,
    playerId: 'player:a',
    potAfter: 2_000,
    street: 'preflop',
    type: 'call',
    ...overrides,
  };
}

function hand(overrides: Partial<MultiwayHandState> = {}): MultiwayHandState {
  return {
    board: [],
    buttonSeat: 0,
    handNumber: 1,
    history: [],
    players: {
      'player:a': {
        allIn: true,
        folded: false,
        holeCards: [],
        id: 'player:a',
        name: 'Ace',
        seat: 0,
        stack: 0,
        streetBet: 0,
        totalCommitted: 1_000,
      },
    },
    pot: 0,
    smallBlind: 5,
    street: 'preflop',
    tablePlayerIds: ['player:a', 'player:b'],
    toAct: null,
    ...overrides,
  } as MultiwayHandState;
}

function seats(): MultiplayerSeatState[] {
  return [{
    aiProfileId: null,
    avatar: null,
    connection: 'online',
    control: 'human',
    displayName: 'Ace',
    isHost: true,
    joinedAtMs: 1_000,
    kind: 'human',
    missedTurns: 0,
    playerId: 'player:a',
    ready: true,
    seat: 0,
    userId: null,
  }, {
    aiProfileId: null,
    avatar: null,
    connection: 'online',
    control: 'human',
    displayName: 'Bea',
    isHost: false,
    joinedAtMs: 1_000,
    kind: 'human',
    missedTurns: 0,
    playerId: 'player:b',
    ready: true,
    seat: 1,
    userId: null,
  }];
}

function transition(overrides: Partial<MultiplayerPublicTransition> = {}): MultiplayerPublicTransition {
  return {
    acceptedAtMs: 7_000,
    actionBatch: [publicAction()],
    commandId: 'command-7',
    kind: 'action',
    timeout: null,
    version: 7,
    ...overrides,
  };
}

function envelope(overrides: Partial<AllInMomentEnvelope> = {}): AllInMomentEnvelope {
  return {
    snapshot: {
      hand: hand({ history: [publicAction()] }),
      seats: seats(),
      version: 7,
    },
    transition: transition(),
    ...overrides,
  };
}

describe('all-in moment detection (Slice 3.8C)', () => {
  it('detects a decisive all-in wager from the broadcast envelope', () => {
    const triggers = detectAllInMoments({
      envelope: envelope(),
      presentedKeys: new Set(),
    });
    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      displayName: 'Ace',
      handNumber: 1,
      historyIndex: 0,
      key: '1:player:a',
      playerId: 'player:a',
      seat: 0,
    });
  });

  it('ignores non-all-in bets, checks, and folds', () => {
    const cases: MultiwayActionRecord[] = [
      publicAction({ type: 'check' }),
      publicAction({ type: 'fold' }),
      // A call that is NOT the player's last action: they act again later.
      publicAction({ type: 'call', amount: 200 }),
    ];
    for (const action of cases) {
      const later = cases.indexOf(action) === 2
        ? [publicAction({ amount: 300, playerId: 'player:a', street: 'flop' })]
        : [];
      const triggers = detectAllInMoments({
        envelope: envelope({
          snapshot: {
            hand: hand({ history: [action, ...later] }),
            seats: seats(),
            version: 7,
          },
        }),
        presentedKeys: new Set(),
      });
      expect(triggers).toEqual([]);
    }
  });

  it('fires at most once per seat per hand even across several envelopes', () => {
    const first = detectAllInMoments({
      envelope: envelope(),
      presentedKeys: new Set(),
    });
    const key = first[0]?.key;
    if (!key) throw new Error('Expected a trigger.');
    // A replayed broadcast of the same transition must not re-trigger.
    const second = detectAllInMoments({
      envelope: envelope(),
      presentedKeys: new Set([key]),
    });
    expect(second).toEqual([]);
  });

  it('never presents from a snapshot replay without a paired transition', () => {
    expect(detectAllInMoments({
      envelope: { snapshot: envelope().snapshot, transition: null },
      presentedKeys: new Set(),
    })).toEqual([]);
  });

  it('ignores a transition whose version does not match the snapshot', () => {
    expect(detectAllInMoments({
      envelope: envelope({
        transition: { ...envelope().transition!, version: 6 },
      }),
      presentedKeys: new Set(),
    })).toEqual([]);
  });

  it('ignores a delayed broadcast whose action is not in the current history', () => {
    const stale = publicAction({ amount: 9_999, potAfter: 12_000 });
    const triggers = detectAllInMoments({
      envelope: envelope({
        transition: transition({
          actionBatch: [stale],
          commandId: 'command-stale',
        }),
      }),
      presentedKeys: new Set(),
    });
    expect(triggers).toEqual([]);
  });

  it('detects a blind-induced all-in on the dealing transition', () => {
    // The player is all-in at hand start with no history action (their stack
    // was exactly the blind); only the dealing transition surfaces it.
    const blind = hand({
      history: [],
      players: {
        ...hand().players,
        'player:a': {
          allIn: false,
          folded: false,
          holeCards: [],
          id: 'player:a',
          name: 'Ace',
          seat: 0,
          stack: 900,
          streetBet: 0,
          totalCommitted: 100,
        },
        'player:b': {
          allIn: true,
          folded: false,
          holeCards: [],
          id: 'player:b',
          name: 'Bea',
          seat: 1,
          stack: 0,
          streetBet: 0,
          totalCommitted: 5,
        },
      },
    });
    const dealNow = detectAllInMoments({
      envelope: envelope({
        snapshot: { hand: blind, seats: seats(), version: 7 },
        transition: transition({ kind: 'deal-now', actionBatch: [] }),
      }),
      presentedKeys: new Set(),
    });
    expect(dealNow.map((trigger) => trigger.key)).toEqual(['1:player:b']);
    // A timeout tick (non-null timeout) is not a deal and must not fire it.
    expect(detectAllInMoments({
      envelope: envelope({
        snapshot: { hand: blind, seats: seats(), version: 7 },
        transition: transition({ kind: 'tick', actionBatch: [], timeout: { action: 'fold', aiTookOver: false, missedTurns: 1, playerId: 'player:b' } }),
      }),
      presentedKeys: new Set(),
    })).toEqual([]);
    // The auto-deal tick (null timeout) is a deal and does fire it.
    expect(detectAllInMoments({
      envelope: envelope({
        snapshot: { hand: blind, seats: seats(), version: 7 },
        transition: transition({ kind: 'tick', actionBatch: [] }),
      }),
      presentedKeys: new Set(),
    }).map((trigger) => trigger.key)).toEqual(['1:player:b']);
  });

  it('detects multiple simultaneous all-ins as separate triggers', () => {
    const secondAllIn = publicAction({
      playerId: 'player:b',
      potAfter: 4_000,
    });
    const triggers = detectAllInMoments({
      envelope: envelope({
        snapshot: {
          hand: hand({
            history: [publicAction(), secondAllIn],
            players: {
              ...hand().players,
              'player:b': {
                allIn: true,
                folded: false,
                holeCards: [],
                id: 'player:b',
                name: 'Bea',
                seat: 1,
                stack: 0,
                streetBet: 0,
                totalCommitted: 1_000,
              },
            },
          }),
          seats: seats(),
          version: 7,
        },
        transition: transition({
          actionBatch: [publicAction(), secondAllIn],
        }),
      }),
      presentedKeys: new Set(),
    });
    expect(triggers.map((trigger) => trigger.key)).toEqual([
      '1:player:a',
      '1:player:b',
    ]);
  });
});
