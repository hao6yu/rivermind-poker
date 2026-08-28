import { describe, expect, it } from 'vitest';

import { seededRandom } from '../poker/cards';
import { MULTIWAY_AI_IDENTITIES } from '../poker/multiwayAiProfiles';
import {
  foldAiNameForComparison,
  selectAiSeatIdentity,
} from './aiSeatSelection';

const FRIENDLY = MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'friendly');
const CLUB = MULTIWAY_AI_IDENTITIES.filter((identity) => identity.level === 'club');

function select(
  options: Partial<Parameters<typeof selectAiSeatIdentity>[0]> = {},
  roster = FRIENDLY,
): ReturnType<typeof selectAiSeatIdentity> {
  return selectAiSeatIdentity({
    humanDisplayNames: [],
    mostRecentlyRemovedForSeat: null,
    random: seededRandom(7),
    roster,
    seatedAiProfileIds: [],
    ...options,
  });
}

describe('shared AI seat selection', () => {
  it('chooses a roster identity deterministically under injected randomness', () => {
    const identity = select({ random: seededRandom(1) });
    expect(identity).toMatchObject({ ok: true });
    if (identity.ok) {
      expect(FRIENDLY.map((candidate) => candidate.id)).toContain(identity.identity.id);
    }
  });

  it('never repeats a seated profile and never duplicates', () => {
    const picked: string[] = [];
    for (let index = 0; index < 9; index += 1) {
      const result = select({ seatedAiProfileIds: picked });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(picked).not.toContain(result.identity.id);
        picked.push(result.identity.id);
      }
    }
    expect(new Set(picked).size).toBe(9);
  });

  it('excludes profiles whose names collide with human names after normalization and case folding', () => {
    // 'Kai' is an authored AI name; a human "kai" must win the collision.
    const result = select({
      humanDisplayNames: ['kai'],
      seatedAiProfileIds: [],
      random: seededRandom(2),
    }, CLUB);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(foldAiNameForComparison(result.identity.name)).not.toBe('kai');
    }
    // Whitespace normalization applies: " Kai " folds identically to "kai".
    const spaced = select({
      humanDisplayNames: [' Kai '],
      random: seededRandom(3),
    }, CLUB);
    expect(spaced.ok).toBe(true);
    if (spaced.ok) {
      expect(foldAiNameForComparison(spaced.identity.name)).not.toBe('kai');
    }
  });

  it('prefers any eligible profile over the one most recently removed from that seat', () => {
    const first = select({
      mostRecentlyRemovedForSeat: null,
      random: seededRandom(4),
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const removedId = first.identity.id;

    // With the removed profile excluded, a fresh roll must differ.
    const reroll = select({
      mostRecentlyRemovedForSeat: removedId,
      random: seededRandom(4),
    });
    expect(reroll.ok).toBe(true);
    if (reroll.ok) {
      expect(reroll.identity.id).not.toBe(removedId);
    }
  });

  it('falls back to the removed profile when it is the only eligible candidate', () => {
    const only = FRIENDLY[0];
    if (!only) throw new Error('The friendly roster must not be empty.');
    const result = select({
      mostRecentlyRemovedForSeat: only.id,
      seatedAiProfileIds: FRIENDLY.filter((identity) => identity.id !== only.id)
        .map((identity) => identity.id),
      random: seededRandom(5),
    });
    expect(result).toEqual({ ok: true, identity: only });
  });

  it('returns an explicit exhausted result and never loops', () => {
    const result = select({
      seatedAiProfileIds: FRIENDLY.map((identity) => identity.id),
    });
    expect(result).toEqual({ ok: false, reason: 'roster-exhausted' });
  });

  it('treats human-name collisions as exhausted when every candidate collides', () => {
    const result = select({
      humanDisplayNames: FRIENDLY.map((identity) => identity.name.toLocaleUpperCase()),
      seatedAiProfileIds: [],
    });
    expect(result).toEqual({ ok: false, reason: 'roster-exhausted' });
  });

  it('folds names using the player-profile normalization boundary', () => {
    expect(foldAiNameForComparison('  River Kai ')).toBe('river kai');
    expect(foldAiNameForComparison('RIVER KAI')).toBe('river kai');
  });
});
