import { describe, expect, it } from 'vitest';

import { englishMessages, simplifiedChineseMessages, traditionalChineseMessages } from '../../localization/messages';
import { privateTableDisplayName, privateTableTitle } from './privateTableSetup';

const seat = (overrides: Partial<{ displayName: string | null; isHost: boolean }>) => ({
  displayName: null,
  ...overrides,
});

describe('private table identity', () => {
  it('runs the table on the saved profile name', () => {
    expect(privateTableDisplayName('Maya')).toBe('Maya');
    expect(privateTableDisplayName('  Maya  ')).toBe('Maya');
  });

  it('falls back to the app default instead of inventing a table nickname', () => {
    expect(privateTableDisplayName('')).toBe(privateTableDisplayName(null));
    expect(privateTableDisplayName(undefined)).toBe(privateTableDisplayName(''));
    expect(privateTableDisplayName('   ')).toBe(privateTableDisplayName(''));
    expect(privateTableDisplayName('')).not.toHaveLength(0);
  });

  it('refuses to seat an identity the table would reject', () => {
    // A name that predates the shared rules, or one the server would refuse,
    // must not sit in setup blocking Continue with no way to fix it there.
    expect(privateTableDisplayName('x'.repeat(40))).toBe(privateTableDisplayName(''));
    expect(privateTableDisplayName('name@example.com')).toBe(privateTableDisplayName(''));
  });
});

describe('private table title', () => {
  const translate = (key: string, params?: Record<string, string | number>) =>
    `${key}:${params?.player ?? ''}`;

  it('names the table after the seat that owns it', () => {
    const seats = [
      seat({ displayName: 'Guest' }),
      seat({ displayName: 'Maya', isHost: true }),
    ];
    expect(privateTableTitle(seats, translate)).toBe('multiplayer.table.ownerTitle:Maya');
  });

  it('waits for the owner seat instead of naming the wrong player', () => {
    expect(privateTableTitle([seat({ displayName: 'Guest' })], translate))
      .toBe('multiplayer.lobby.title:');
    expect(privateTableTitle([seat({ displayName: '  ', isHost: true })], translate))
      .toBe('multiplayer.lobby.title:');
    expect(privateTableTitle([], translate)).toBe('multiplayer.lobby.title:');
  });

  it('phrases the possessive in the reading language rather than storing one', () => {
    [englishMessages, simplifiedChineseMessages, traditionalChineseMessages].forEach((messages) => {
      expect(messages['multiplayer.table.ownerTitle']).toContain('{{player}}');
    });
    // With the placeholder removed, the Chinese phrasing must carry no English
    // word and no apostrophe for a reader to inherit.
    [simplifiedChineseMessages, traditionalChineseMessages].forEach((messages) => {
      expect(messages['multiplayer.table.ownerTitle'].replace('{{player}}', '')).not.toMatch(/[A-Za-z’']/);
    });
  });
});
