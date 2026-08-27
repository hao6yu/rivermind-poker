import { describe, expect, it } from 'vitest';

import {
  avatarsAreEqual,
  humanAvatarAccessibilityLabel,
  humanAvatarDisplay,
  humanAvatarObjectKey,
} from './avatar';
import { HUMAN_AVATAR_LABELS, type HumanAvatarReference } from './playerProfile';

const authored: HumanAvatarReference = { kind: 'authored', id: 'human-ash' };
const uploaded: HumanAvatarReference = { kind: 'uploaded', avatarId: 'avatarid01', version: 3 };
const initials: HumanAvatarReference = { kind: 'initials', initials: 'MC' };

describe('humanAvatarDisplay', () => {
  it('maps each reference kind to the correct mode', () => {
    expect(humanAvatarDisplay(authored)).toEqual({ mode: 'authored', id: 'human-ash' });
    expect(humanAvatarDisplay(uploaded)).toEqual({ mode: 'uploaded', avatarId: 'avatarid01', version: 3 });
    expect(humanAvatarDisplay(initials)).toEqual({ mode: 'initials', initials: 'MC' });
  });

  it('exposes an accessible label independent of the display name', () => {
    expect(humanAvatarAccessibilityLabel(authored)).toBe(`Avatar, ${HUMAN_AVATAR_LABELS['human-ash']}`);
    expect(humanAvatarAccessibilityLabel(uploaded)).toBe('Avatar, uploaded image');
    expect(humanAvatarAccessibilityLabel(initials)).toBe('Avatar, initials');
  });

  it('produces stable, distinct object keys per mode and version', () => {
    expect(humanAvatarObjectKey(authored)).toBe('authored:human-ash');
    expect(humanAvatarObjectKey(uploaded)).toBe('uploaded:avatarid01:3');
    expect(humanAvatarObjectKey(initials)).toBe('initials:MC');
  });

  it('is version-sensitive for uploaded avatars so a replacement diffs as new', () => {
    expect(avatarsAreEqual(uploaded, { kind: 'uploaded', avatarId: 'avatarid01', version: 3 })).toBe(true);
    expect(avatarsAreEqual(uploaded, { kind: 'uploaded', avatarId: 'avatarid01', version: 4 })).toBe(false);
    expect(avatarsAreEqual(authored, { kind: 'authored', id: 'human-bay' })).toBe(false);
    expect(avatarsAreEqual(initials, { kind: 'initials', initials: 'MC' })).toBe(true);
    expect(avatarsAreEqual(authored, uploaded)).toBe(false);
  });
});
