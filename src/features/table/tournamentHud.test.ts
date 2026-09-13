import { describe, expect, it } from 'vitest';

import type { MultiwayHandState } from '../../domain/poker/multiway';
import { buildTournamentHud } from './tournamentHud';

function game(
  stackByPlayer: Record<string, number>,
  bigBlind = 20,
  overrides: { committedByPlayer?: Record<string, number>; allInByPlayer?: Record<string, boolean>; outcome?: { showdown: boolean } | null } = {},
): MultiwayHandState {
  const ids = Object.keys(stackByPlayer);
  return {
    bigBlind,
    handNumber: 1,
    outcome: overrides.outcome ?? null,
    players: Object.fromEntries(ids.map((id) => [id, {
      allIn: overrides.allInByPlayer?.[id] ?? false,
      name: id === 'hero' ? 'You' : id,
      stack: stackByPlayer[id]!,
      totalCommitted: overrides.committedByPlayer?.[id] ?? 0,
    }])),
    tablePlayerIds: ids,
  } as unknown as MultiwayHandState;
}

const base = {
  blindSpeed: 'standard' as const,
  handNumber: 1,
  playerCount: 9,
  qualifyingPlace: 4,
  structureId: 'standard' as const,
};

describe('tournament HUD model (B2)', () => {
  it('ranks the viewer by stack without promising a finishing place', () => {
    const hud = buildTournamentHud({
      ...base,
      game: game({ hero: 900, 'ai-1': 1_500, 'ai-2': 1_200, 'ai-3': 400 }),
    });
    expect(hud.provisionalPlace).toBe(3);
    expect(hud.playersRemaining).toBe(4);
    expect(hud.standings[0]?.playerId).toBe('ai-1');
    expect(hud.standings.at(-1)?.playerId).toBe('ai-3');
  });

  it('reports hands to the next blind level from the structure cadence', () => {
    // Standard structure: 4 hands per level, level 1 covers hands 1–4.
    const hud = buildTournamentHud({ ...base, handNumber: 2, game: game({ hero: 900, 'ai-1': 900 }) });
    expect(hud.handsToNextLevel).toBe(3);
    expect(hud.smallBlind).toBe(10);
    expect(hud.bigBlind).toBe(20);
    const last = buildTournamentHud({ ...base, handNumber: 40, game: game({ hero: 900, 'ai-1': 900 }) });
    expect(last.handsToNextLevel).toBeNull(); // final blind level
    expect(last.bigBlind).toBe(200);
  });

  it('flags the bubble one elimination before the qualifying place', () => {
    const hud = buildTournamentHud({
      ...base,
      game: game({ hero: 900, 'ai-1': 1_500, 'ai-2': 1_200, 'ai-3': 400, 'ai-4': 250 }),
    });
    expect(hud.playersRemaining).toBe(5);
    expect(hud.qualifyingPlace).toBe(4);
    expect(hud.milestone).toBe('bubble');
  });

  it('flags heads-up at two players regardless of the target', () => {
    const hud = buildTournamentHud({
      ...base,
      qualifyingPlace: 1,
      game: game({ hero: 900, 'ai-1': 1_500, 'ai-2': 0, 'ai-3': 0 }),
    });
    expect(hud.playersRemaining).toBe(2);
    expect(hud.milestone).toBe('headsUp');
  });

  it('keeps the drawer standings ordered with the viewer marked', () => {
    const hud = buildTournamentHud({
      ...base,
      game: game({ hero: 1_200, 'ai-1': 1_200, 'ai-2': 300 }),
    });
    expect(hud.standings.map((row) => row.playerId)).toEqual(['ai-1', 'hero', 'ai-2']);
    expect(hud.standings.find((row) => row.isViewer)?.playerId).toBe('hero');
  });

  it('counts an all-in player as remaining during a live hand', () => {
    // v1.3 review regression: zero chips behind while all-in is not an
    // elimination — the HUD must not switch to heads-up before settlement.
    const hud = buildTournamentHud({
      ...base,
      qualifyingPlace: 2,
      game: game(
        { hero: 0, 'ai-1': 1_500, 'ai-2': 1_200 },
        20,
        { allInByPlayer: { hero: true }, committedByPlayer: { hero: 2_000 } },
      ),
    });
    expect(hud.playersRemaining).toBe(3);
    // The bubble is correct at three remaining with two qualifying — the old
    // bug dropped the count to two and flipped the badge to heads-up.
    expect(hud.milestone).toBe('bubble');
    expect(hud.standings.find((row) => row.playerId === 'hero')?.eliminated).toBe(false);
  });

  it('ranks a live hand by chips in play, not chips behind', () => {
    // v1.3 review regression: committed chips must not drop the provisional
    // place — the hero's all-in for 2,000 outranks a 1,500 behind seat.
    const hud = buildTournamentHud({
      ...base,
      game: game(
        { hero: 0, 'ai-1': 1_500, 'ai-2': 1_200 },
        20,
        { allInByPlayer: { hero: true }, committedByPlayer: { hero: 2_000 } },
      ),
    });
    expect(hud.standings.map((row) => row.playerId)).toEqual(['hero', 'ai-1', 'ai-2']);
    expect(hud.provisionalPlace).toBe(1);
    expect(hud.standings[0]?.chips).toBe(2_000);
  });

  it('eliminates only after settlement and shares drawer places on ties', () => {
    // Settled hand: the two zero stacks are out; the two equal survivors
    // share place #1 in the drawer numbering.
    const hud = buildTournamentHud({
      ...base,
      qualifyingPlace: 2,
      game: game(
        { hero: 1_000, 'ai-1': 1_000, 'ai-2': 0, 'ai-3': 0 },
        20,
        {
          committedByPlayer: { hero: 1_000, 'ai-1': 1_000, 'ai-2': 2_000, 'ai-3': 2_000 },
          outcome: { showdown: true },
        },
      ),
    });
    expect(hud.playersRemaining).toBe(2);
    expect(hud.milestone).toBe('headsUp');
    expect(hud.standings.map((row) => row.place)).toEqual([1, 1, 3, 3]);
    expect(hud.standings.filter((row) => row.place === 1)).toHaveLength(2);
    expect(hud.standings.filter((row) => row.eliminated).map((row) => row.playerId)).toEqual(['ai-2', 'ai-3']);
    // Settled stacks rank by chips behind (committed chips no longer count).
    expect(hud.provisionalPlace).toBe(1);
  });
});
