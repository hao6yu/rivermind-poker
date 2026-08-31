import { describe, expect, it } from 'vitest';

import type { MultiplayerLedgerEntry } from '../../domain/multiplayer/contracts';
import { MULTIPLAYER_REBUY_CHIPS } from '../../domain/multiplayer/contracts';
import { buildMultiplayerTableStats, multiplayerLedgerNetChips } from './multiplayerTableStats';

const t = (key: string, params?: Record<string, string | number>) => {
  const templates: Record<string, string> = {
    'multiplayer.lobby.ai': 'AI',
    'multiplayer.profile.human': 'Human',
    'multiplayer.stats.buyIn': 'Buy-in {{amount}}',
    'multiplayer.stats.disconnected': 'Disconnected',
    'multiplayer.stats.even': 'Even',
    'multiplayer.stats.left': 'Left',
    'multiplayer.stats.lost': 'Lost {{amount}}',
    'multiplayer.stats.rebuys': '{{count}} rebuy(s)',
    'multiplayer.stats.rebuyPending': 'Rebuy pending',
    'multiplayer.stats.sittingOut': 'Sitting out',
    'multiplayer.stats.stack': 'Stack {{amount}}',
    'multiplayer.stats.throughHand': 'Through hand {{hand}}',
    'multiplayer.stats.won': 'Won {{amount}}',
  };
  let out = templates[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    out = out.replaceAll(`{{${name}}}`, String(value));
  }
  return out;
};

function entry(overrides: Partial<MultiplayerLedgerEntry>): MultiplayerLedgerEntry {
  return {
    initialBuyIn: 2_000,
    playerId: 'p',
    rebuyChips: 0,
    rebuyCount: 0,
    settledAtMs: 0,
    settledHandNumber: 1,
    settledStack: 2_000,
    totalBuyIn: 2_000,
    ...overrides,
  };
}

describe('multiplayer table stats (3.11F)', () => {
  const seats = [
    { displayName: 'You', kind: 'human' as const, ledger: entry({ playerId: 'hero', settledStack: 4_000 }), participation: 'active' as const, playerId: 'hero', seat: 0 },
    { displayName: 'Mara', kind: 'ai' as const, ledger: entry({ playerId: 'ai:1', settledStack: 0 }), playerId: 'ai:1', seat: 1 },
    { displayName: 'Guest', kind: 'human' as const, ledger: entry({ playerId: 'guest', settledStack: 0, totalBuyIn: 2_000 + MULTIPLAYER_REBUY_CHIPS, rebuyChips: MULTIPLAYER_REBUY_CHIPS, rebuyCount: 1 }), participation: 'sitting-out' as const, playerId: 'guest', seat: 2 },
  ];

  it('derives results from net chips against the complete buy-in, never the stack', () => {
    // You: 4,000 settled on one 2,000 buy-in → Won 2,000.
    expect(multiplayerLedgerNetChips(seats[0]!.ledger!)).toBe(2_000);
    // Mara: 0 settled on 2,000 → Lost 2,000.
    expect(multiplayerLedgerNetChips(seats[1]!.ledger!)).toBe(-2_000);
    // Guest: 0 settled on 6,000 after one rebuy → Lost 6,000 (the rebuy is
    // never misread as a win).
    expect(multiplayerLedgerNetChips(seats[2]!.ledger!)).toBe(-6_000);
    const panel = buildMultiplayerTableStats(seats, null, t);
    expect(panel.rows.map((row) => row.resultLabel)).toEqual([
      'Won 2,000', 'Lost 2,000', 'Lost 6,000',
    ]);
  });

  it('sorts largest winner to largest loser with canonical-seat tie breaks', () => {
    const tied = [
      { ...seats[0]!, ledger: entry({ playerId: 'a', settledStack: 3_000 }), seat: 3 },
      { ...seats[1]!, ledger: entry({ playerId: 'b', settledStack: 3_000 }), seat: 1 },
    ];
    const panel = buildMultiplayerTableStats(tied, null, t);
    expect(panel.rows.map((row) => row.seat)).toEqual([1, 3]);
  });

  it('renders every participant Even before the first settled hand', () => {
    const fresh = seats.map((seat) => ({
      ...seat,
      ledger: entry({ playerId: seat.playerId, settledHandNumber: 0, settledStack: 2_000, totalBuyIn: 2_000 }),
    }));
    const panel = buildMultiplayerTableStats(fresh, null, t);
    expect(panel.rows.every((row) => row.resultLabel === 'Even')).toBe(true);
  });

  it('freezes the sheet through the active hand and qualifies it through hand N', () => {
    const panel = buildMultiplayerTableStats(seats, 7, t);
    expect(panel.throughHandLabel).toBe('Through hand 7');
    // The settled values are the ledger's — chips in the pot are not losses.
    expect(panel.rows[0]!.stackLabel).toBe('4,000');
    expect(panel.rows[2]!.totalBuyInLabel).toBe('6,000');
  });

  it('qualifies human participation states and keeps AI seats labeled AI', () => {
    const panel = buildMultiplayerTableStats(seats, null, t);
    expect(panel.rows[2]!.accessibilityLabel).toContain('Sitting out');
    expect(panel.rows[1]!.accessibilityLabel).toContain('AI');
    expect(panel.rows[0]!.accessibilityLabel).toContain('Human');
  });
});
