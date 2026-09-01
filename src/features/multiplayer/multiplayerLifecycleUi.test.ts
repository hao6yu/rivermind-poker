import { describe, expect, it } from 'vitest';

import type { MultiplayerSeatState } from '../../domain/multiplayer/contracts';
import { MULTIPLAYER_LIVENESS_STALE_MS } from '../../domain/multiplayer/coordinator';
import {
  MULTIPLAYER_LIVENESS_HEARTBEAT_MS,
  multiplayerActiveFundedSeatCount,
  multiplayerNextHandCountdownSeconds,
  multiplayerSeatStatusBadge,
  multiplayerStalledBetweenHands,
  multiplayerViewerCanReturnNextHand,
  multiplayerSettledCountdownCopy,
} from './multiplayerLifecycleUi';

const t = (key: string, params?: Record<string, string | number>) => {
  const templates: Record<string, string> = {
    'multiplayer.game.left': 'Left',
    'multiplayer.game.offline': 'Offline',
    'multiplayer.game.rebuyPending': 'Rebuy decision',
    'multiplayer.game.sittingOut': 'Sitting out',
    'multiway.state.allIn': 'All-in',
    'multiway.state.folded': 'Folded',
    'multiplayer.game.yourTurn': 'Your turn',
    'multiway.state.out': 'Out',
    'table.acting': 'Acting',
  };
  let out = templates[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    out = out.replaceAll(`{{${name}}}`, String(value));
  }
  return out;
};

function seat(overrides: Partial<MultiplayerSeatState>): MultiplayerSeatState {
  return {
    aiProfileId: null,
    avatar: null,
    connection: 'online',
    control: 'human',
    displayName: 'Seat',
    isHost: false,
    joinedAtMs: 0,
    kind: 'human',
    ledger: {
      initialBuyIn: 2_000,
      playerId: 'p',
      rebuyChips: 0,
      rebuyCount: 0,
      settledAtMs: 0,
      settledHandNumber: 1,
      settledStack: 2_000,
      totalBuyIn: 2_000,
    },
    missedTurns: 0,
    playerId: 'p',
    ready: true,
    seat: 0,
    userId: null,
    ...overrides,
  } as MultiplayerSeatState;
}

describe('R3/E — lifecycle UI eligibility helpers', () => {
  it('projects the full canonical ten-second review window without an early decrement', () => {
    expect(multiplayerNextHandCountdownSeconds(20_000, 10_000)).toBe(10);
    // A slightly stale client clock cannot flash an impossible 11 seconds.
    expect(multiplayerNextHandCountdownSeconds(20_000, 9_500)).toBe(10);
    expect(multiplayerNextHandCountdownSeconds(20_000, 10_001)).toBe(10);
    expect(multiplayerNextHandCountdownSeconds(20_000, 19_001)).toBe(1);
    expect(multiplayerNextHandCountdownSeconds(20_000, 20_000)).toBe(0);
    expect(multiplayerNextHandCountdownSeconds(null, 10_000)).toBeNull();
  });

  it('counts only active funded seats for stalled-room detection', () => {
    const seats = [
      seat({ ledger: { ...seat({}).ledger!, settledStack: 2_000 }, participation: 'active' }),
      seat({ ledger: { ...seat({}).ledger!, settledStack: 0 }, participation: 'sitting-out' }),
      seat({ ledger: { ...seat({}).ledger!, settledStack: 4_000 }, participation: 'disconnected' }),
      seat({ kind: 'ai', participation: 'active', playerId: 'ai:1' }),
    ];
    // Only the active human plus the funded AI count; disconnected and
    // busted seats do not (their chips would come from a return or rebuy).
    expect(multiplayerActiveFundedSeatCount(seats)).toBe(2);

    const busted = seat({ ledger: { ...seat({}).ledger!, settledStack: 0 }, participation: 'active' });
    expect(multiplayerActiveFundedSeatCount([busted])).toBe(0);
  });

  it('flags a stalled between-hands room that waits for a returning player', () => {
    const funded = [seat({})];
    expect(multiplayerStalledBetweenHands('between-hands', null, funded)).toBe(true);
    // A countdown is armed or the room is not between hands: not stalled.
    expect(multiplayerStalledBetweenHands('between-hands', 123, funded)).toBe(false);
    expect(multiplayerStalledBetweenHands('playing', null, funded)).toBe(false);
    // Two active funded seats can still play a hand: not stalled.
    expect(multiplayerStalledBetweenHands('between-hands', null, [seat({}), seat({ playerId: 'q' })])).toBe(false);
  });

  it('offers Return next hand only to a connected, funded, sitting-out human', () => {
    const sittingOut = seat({ participation: 'sitting-out' });
    expect(multiplayerViewerCanReturnNextHand(sittingOut, 'between-hands')).toBe(true);
    // A busted sitting-out seat must use the fixed rebuy flow instead.
    expect(multiplayerViewerCanReturnNextHand(
      seat({ participation: 'sitting-out', ledger: { ...seat({}).ledger!, settledStack: 0 } }),
      'between-hands',
    )).toBe(false);
    // Offline, non-between-hands, and non-sitting-out states never return.
    expect(multiplayerViewerCanReturnNextHand(
      seat({ participation: 'sitting-out', connection: 'offline' }),
      'between-hands',
    )).toBe(false);
    expect(multiplayerViewerCanReturnNextHand(sittingOut, 'playing')).toBe(false);
    expect(multiplayerViewerCanReturnNextHand(seat({ participation: 'active' }), 'between-hands')).toBe(false);
    // A seat that permanently left can never return to this session.
    expect(multiplayerViewerCanReturnNextHand(seat({ participation: 'left' }), 'between-hands')).toBe(false);
    // An AI seat is never offered a human return.
    expect(multiplayerViewerCanReturnNextHand(
      seat({ kind: 'ai', participation: 'sitting-out', playerId: 'ai:1' }),
      'between-hands',
    )).toBe(false);
  });

  it('labels explicit human participation states instead of AI-control or generic offline', () => {
    // Permanent Left outranks folded/busted states on a complete hand.
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'left', connection: 'offline' }),
      { allIn: false, currentTurn: false, folded: true, handComplete: true, stack: 0, viewer: false },
      t,
    )).toBe('Left');
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'left' }),
      { allIn: false, currentTurn: false, folded: true, handComplete: false, stack: 1_000, viewer: false },
      t,
    )).toBe('Left');
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'rebuy-pending' }),
      { allIn: false, currentTurn: false, folded: false, handComplete: false, stack: 0, viewer: false },
      t,
    )).toBe('Rebuy decision');
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'sitting-out' }),
      { allIn: false, currentTurn: false, folded: false, handComplete: false, stack: 2_000, viewer: false },
      t,
    )).toBe('Sitting out');
    // Disconnected keeps the recoverable offline wording (never "Left").
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'disconnected', connection: 'offline' }),
      { allIn: false, currentTurn: false, folded: false, handComplete: false, stack: 2_000, viewer: false },
      t,
    )).toBe('Offline');
    // Legacy rows without participation still fall back to the connection.
    expect(multiplayerSeatStatusBadge(
      seat({ connection: 'offline', participation: undefined }),
      { allIn: false, currentTurn: false, folded: false, handComplete: false, stack: 2_000, viewer: false },
      t,
    )).toBe('Offline');
    // Online, unfolded, non-turn seats show folded/all-in states as before.
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'active' }),
      { allIn: false, currentTurn: false, folded: true, handComplete: false, stack: 2_000, viewer: false },
      t,
    )).toBe('Folded');
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'active' }),
      { allIn: true, currentTurn: false, folded: false, handComplete: false, stack: 0, viewer: false },
      t,
    )).toBe('All-in');
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'active' }),
      { allIn: false, currentTurn: false, folded: false, handComplete: false, stack: 2_000, viewer: false },
      t,
    )).toBeNull();
    // The viewer's own turn keeps the Your-turn wording.
    expect(multiplayerSeatStatusBadge(
      seat({ participation: 'active' }),
      { allIn: false, currentTurn: true, folded: false, handComplete: false, stack: 2_000, viewer: true },
      t,
    )).toBe('Your turn');
  });
});

describe('settled countdown copy (Q5)', () => {
  it('names a stalled table by what it waits for, not by a pause', () => {
    // A stall is "fewer than two active funded humans; someone may return"
    // — calling that merely countdown-paused misreads as a host action.
    expect(multiplayerSettledCountdownCopy(true)).toBe('multiplayer.game.waitingForPlayers');
    expect(multiplayerSettledCountdownCopy(false)).toBe('multiplayer.game.countdownPaused');
  });
});

describe('seat liveness heartbeat ratio (Q4)', () => {
  it('beats at least three times inside the server staleness window', () => {
    // The server owns the staleness authority; this pin proves the client
    // cadence can never silently drift into a single-shot heartbeat.
    expect(MULTIPLAYER_LIVENESS_HEARTBEAT_MS * 3).toBeLessThanOrEqual(MULTIPLAYER_LIVENESS_STALE_MS);
    expect(MULTIPLAYER_LIVENESS_HEARTBEAT_MS).toBeGreaterThan(0);
  });
});
