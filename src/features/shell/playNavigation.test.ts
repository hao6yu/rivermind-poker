import { describe, expect, it } from 'vitest';

import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import { QUICK_PLAY_SESSION_CONFIG } from '../../domain/poker/session';
import {
  createMultiwayTablePlayers,
  tablePlayerCountOptionsForDifficulty,
} from '../../domain/poker/multiwaySession';
import {
  englishMessages,
  simplifiedChineseMessages,
  traditionalChineseMessages,
} from '../../localization/messages';
import {
  PLAY_DESTINATIONS,
  PLAY_GROUPS,
  QUICK_GAME_SEAT_COUNTS,
  QUICK_GAME_SESSION_CONFIG,
  playGroupTitle,
} from './playNavigation';

describe('play navigation model', () => {
  it('reaches every existing mode through exactly one band', () => {
    const grouped = PLAY_GROUPS.flatMap((group) => [...group.destinations]);
    expect([...PLAY_DESTINATIONS].sort()).toEqual(grouped.slice().sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it('leads with the quick game and keeps the private table second', () => {
    expect(PLAY_GROUPS.map((group) => group.id)).toEqual(['quick', 'friends', 'games', 'setup']);
    expect(PLAY_GROUPS[0]?.destinations).toEqual(['quickGame']);
    expect(PLAY_GROUPS[1]?.id).toBe('friends');
  });

  it('starts every band open so nothing a player used before is hidden', () => {
    expect(PLAY_GROUPS.every((group) => group.startsOpen)).toBe(true);
  });

  it('titles each grouped band in every supported language', () => {
    PLAY_GROUPS.forEach((group) => {
      const titleKey = group.titleKey;
      if (!titleKey) return;
      [englishMessages, simplifiedChineseMessages, traditionalChineseMessages].forEach((messages) => {
        expect(messages[titleKey].trim().length).toBeGreaterThan(0);
      });
    });
    expect(englishMessages['play.group.games']).toBe('Games & events');
  });

  it('refuses to title a band that is a card rather than a group', () => {
    expect(playGroupTitle('games')).toEqual({ startsOpen: true, titleKey: 'play.group.games' });
    expect(playGroupTitle('setup')).toEqual({ startsOpen: true, titleKey: 'play.group.setup' });
    expect(() => playGroupTitle('quick')).toThrow('not a titled group');
    expect(() => playGroupTitle('friends')).toThrow('not a titled group');
  });

  it('offers two-, three-, six-, and nine-seat quick games as separate choices', () => {
    expect(QUICK_GAME_SEAT_COUNTS).toEqual([2, 3, 6, 9]);
  });

  it('only offers seat sizes the roster can fill with distinct names', () => {
    // Play and Custom AI both build their seat chips from this list, so a
    // table size can never be offered that would seat two same-named bots.
    const difficulties: AiDifficulty[] = ['friendly', 'club', 'sharp', 'elite', 'nemesis'];
    difficulties.forEach((difficulty) => {
      const offered = tablePlayerCountOptionsForDifficulty(difficulty);
      expect(offered[0], difficulty).toBe(2);
      offered.filter((count) => count !== 2).forEach((count) => {
        const players = createMultiwayTablePlayers(count, 2_000, difficulty, 3);
        expect(new Set(players.map((player) => player.name)).size, `${difficulty} at ${count}`)
          .toBe(players.length);
      });
    });
  });

  it('seats every quick game from the one validated session configuration', () => {
    expect(QUICK_GAME_SESSION_CONFIG).toBe(QUICK_PLAY_SESSION_CONFIG);
    // The sizes differ only in who is seated, so the shared stakes and hand
    // target the quick-game copy advertises stay true at nine seats too.
    expect(QUICK_GAME_SESSION_CONFIG.handTarget).toBe(2);
    expect(QUICK_GAME_SESSION_CONFIG.startingStackBb).toBe(100);
  });
});
