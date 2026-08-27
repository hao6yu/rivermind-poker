import { describe, expect, it } from 'vitest';

import {
  BOUNDED_AVATAR_ID,
  DEFAULT_HUMAN_AVATAR,
  DEFAULT_PLAYER_DISPLAY_NAME,
  HUMAN_AVATAR_IDS,
  type HumanAvatarId,
  initialsFromName,
  isInitialsAvatar,
  isValidPlayerDisplayName,
  normalizePlayerDisplayName,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  PLAYER_DISPLAY_NAME_MIN_LENGTH,
  validateHumanAvatarSnapshot,
  validatePlayerDisplayName,
  fallbackInitialsFor,
  hasSameDisplayName,
  normalizeHumanIdentity,
  type HumanAvatarReference,
  type HumanAvatarSnapshot,
  type SavedPlayerProfile,
} from './playerProfile';

describe('validatePlayerDisplayName', () => {
  it('accepts product-authored preset names and collapses surrounding whitespace', () => {
    for (const name of ['River', 'Kai', 'Mina', 'Nora', 'Iris', 'Nova', 'Sage', 'Sky']) {
      expect(validatePlayerDisplayName(' ' + name + ' ')).toEqual({ ok: true, value: name });
    }
    expect(isValidPlayerDisplayName('Kai')).toBe(true);
  });

  it('accepts free-form custom names within range, rejecting contact and out-of-range content', () => {
    for (const name of ['River Kai', 'Custom Name', 'river', 'Kai2', 'Adele']) {
      expect(validatePlayerDisplayName(' ' + name + ' ')).toEqual({ ok: true, value: name });
      expect(isValidPlayerDisplayName(name)).toBe(true);
    }
    expect(validatePlayerDisplayName('name@example.com')).toEqual({ ok: false, reason: 'contact-information' });
    expect(validatePlayerDisplayName('https://example.com')).toEqual({ ok: false, reason: 'contact-information' });
    expect(validatePlayerDisplayName('x'.repeat(PLAYER_DISPLAY_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: 'too-long',
    });
  });

  it('rejects control, bidi, empty, and too-short names', () => {
    expect(validatePlayerDisplayName('a\u0007b')).toEqual({ ok: false, reason: 'control-character' });
    expect(validatePlayerDisplayName('a\u200Eb')).toEqual({ ok: false, reason: 'bidi-control' });
    expect(validatePlayerDisplayName('  ')).toEqual({ ok: false, reason: 'empty' });
    expect(validatePlayerDisplayName('A')).toEqual({ ok: false, reason: 'too-short' });
    expect(isValidPlayerDisplayName('a\u0007b')).toBe(false);
    expect(isValidPlayerDisplayName('a\u200Eb')).toBe(false);
  });
});

describe('normalizePlayerDisplayName', () => {
  it('collapses whitespace without truncating so length is validated downstream', () => {
    expect(normalizePlayerDisplayName('  Mina   Chen ')).toBe('Mina Chen');
    expect(normalizePlayerDisplayName('x'.repeat(19))).toHaveLength(19);
    expect(normalizePlayerDisplayName('x'.repeat(19))).toBe('x'.repeat(19));
  });
});

describe('initialsFromName', () => {
  it('derives up to two uppercase initials', () => {
    expect(initialsFromName('River')).toBe('R');
    expect(initialsFromName('  Mina   Chen ')).toBe('MC');
    expect(initialsFromName('Ana')).toBe('A');
  });
});

describe('avatar reference', () => {
  it('exposes a stable authored fallback and a full authored library', () => {
    expect(DEFAULT_HUMAN_AVATAR).toEqual({ kind: 'authored', id: 'human-ash' });
    expect(DEFAULT_HUMAN_AVATAR.kind).toBe('authored');
    expect(HUMAN_AVATAR_IDS.length).toBeGreaterThan(1);
  });

  it('reports the initials fallback branch', () => {
    expect(isInitialsAvatar({ kind: 'initials', initials: 'R' })).toBe(true);
    expect(isInitialsAvatar({ kind: 'authored', id: 'human-ash' })).toBe(false);
    expect(isInitialsAvatar({ kind: 'uploaded', avatarId: 'abc123', version: 1 })).toBe(false);
  });

  it('keeps the wire snapshot bounded: only an identifier and version', () => {
    const uploaded: HumanAvatarReference = { kind: 'uploaded', avatarId: 'avatarid01', version: 3 };
    const snapshot: HumanAvatarSnapshot = uploaded;
    expect(snapshot).toEqual({ kind: 'uploaded', avatarId: 'avatarid01', version: 3 });
    expect(validateHumanAvatarSnapshot(snapshot)).toBe(true);

    const authored: HumanAvatarSnapshot = { kind: 'authored', id: 'human-bay' };
    const initials: HumanAvatarSnapshot = { kind: 'initials', initials: 'R' };
    expect(validateHumanAvatarSnapshot(authored)).toBe(true);
    expect(validateHumanAvatarSnapshot(initials)).toBe(true);

    // No owner-scoped path, signed URL, or local file path is carried on the wire.
    expect(BOUNDED_AVATAR_ID.test('avatarid01')).toBe(true);
    expect(BOUNDED_AVATAR_ID.test('avatars/user/abc@2.png')).toBe(false);
    expect(BOUNDED_AVATAR_ID.test('http://img')).toBe(false);
  });

  it('rejects malformed avatar snapshots', () => {
    expect(validateHumanAvatarSnapshot({ kind: 'authored', id: 'nope' as unknown as HumanAvatarId })).toBe(false);
    expect(validateHumanAvatarSnapshot({ kind: 'initials', initials: 'abc' })).toBe(false);
    expect(validateHumanAvatarSnapshot({ kind: 'uploaded', avatarId: 'short', version: 1 })).toBe(false);
    expect(validateHumanAvatarSnapshot({ kind: 'uploaded', avatarId: 'avatarid01', version: 0 })).toBe(false);
  });

  it('derives stable fallback initials for a profile', () => {
    const authored: SavedPlayerProfile = { version: 2, displayName: 'River', avatar: { kind: 'authored', id: 'human-bay' } };
    expect(fallbackInitialsFor(authored)).toBe('BY');
    const initials: SavedPlayerProfile = { version: 2, displayName: 'River', avatar: { kind: 'initials', initials: 'RV' } };
    expect(fallbackInitialsFor(initials)).toBe('RV');
  });
});

describe('normalizeHumanIdentity', () => {
  it('normalizes name and passes through a valid avatar snapshot', () => {
    const result = normalizeHumanIdentity({ displayName: '  Nova ', avatar: { kind: 'authored', id: 'human-ash' } });
    expect(result).toEqual({ ok: true, displayName: 'Nova', avatar: { kind: 'authored', id: 'human-ash' } });
  });

  it('rejects untrusted names and avatars identically to the client', () => {
    expect(normalizeHumanIdentity({ displayName: 'a@b.com', avatar: { kind: 'authored', id: 'human-ash' } })).toMatchObject({ ok: false, reason: 'contact-information' });
    expect(normalizeHumanIdentity({ displayName: 'River', avatar: { kind: 'authored', id: 'ghost' as unknown as HumanAvatarId } })).toMatchObject({ ok: false, reason: 'bad-avatar' });
    expect(normalizeHumanIdentity({ displayName: 'River', avatar: { kind: 'uploaded', avatarId: 'short', version: 1 } })).toMatchObject({ ok: false, reason: 'bad-avatar' });
  });
});

describe('default preset', () => {
  it('exposes a valid authored default display name', () => {
    expect(DEFAULT_PLAYER_DISPLAY_NAME).toBe('River');
    expect(isValidPlayerDisplayName(DEFAULT_PLAYER_DISPLAY_NAME)).toBe(true);
  });
});

describe('hasSameDisplayName', () => {
  it('detects equal names without conflating seat kind', () => {
    expect(hasSameDisplayName({ displayName: 'Nova' }, { displayName: 'Nova' })).toBe(true);
    expect(hasSameDisplayName({ displayName: 'Nova' }, { displayName: 'Kai' })).toBe(false);
  });
});
