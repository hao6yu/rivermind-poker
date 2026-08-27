import { describe, expect, it } from 'vitest';

import {
  applyAvatarVisibility,
  avatarVisibility,
  hiddenReferences,
  isAvatarHidden,
  type AvatarVisibilitySet,
} from './avatarVisibility';

function empty(): AvatarVisibilitySet {
  return new Set<string>();
}

const upload = { avatarId: 'avatarid01', version: 1 };
const upload2 = { avatarId: 'avatarid01', version: 2 };
const other = { avatarId: 'avatarid02', version: 1 };

describe('avatarVisibility', () => {
  it('hides a reference and reports it hidden', () => {
    const hidden = applyAvatarVisibility(empty(), { type: 'hide', ...upload });
    expect(isAvatarHidden(hidden, 'avatarid01', 1)).toBe(true);
    expect(avatarVisibility(hidden, upload)).toBe('hide');
    // A different version is unaffected.
    expect(avatarVisibility(hidden, upload2)).toBe('show');
  });

  it('does not cross-hide unrelated avatars', () => {
    const hidden = applyAvatarVisibility(empty(), { type: 'hide', ...upload });
    expect(isAvatarHidden(hidden, 'avatarid02', 1)).toBe(false);
  });

  it('a version bump is a different avatar, so it is not hidden', () => {
    const hidden = applyAvatarVisibility(empty(), { type: 'hide', ...upload });
    expect(avatarVisibility(hidden, upload2)).toBe('show');
  });

  it('shows a hidden reference again', () => {
    let hidden = applyAvatarVisibility(empty(), { type: 'hide', ...upload });
    expect(avatarVisibility(hidden, upload)).toBe('hide');
    hidden = applyAvatarVisibility(hidden, { type: 'show', ...upload });
    expect(avatarVisibility(hidden, upload)).toBe('show');
  });

  it('lists the hidden references from the set', () => {
    let hidden = applyAvatarVisibility(empty(), { type: 'hide', ...upload });
    hidden = applyAvatarVisibility(hidden, { type: 'hide', ...other });
    const refs = hiddenReferences(hidden, [upload, upload2, other]);
    expect(refs.map((r) => r.avatarId).sort()).toEqual(['avatarid01', 'avatarid02']);
    // upload2 was not hidden, so it is not listed.
    expect(refs.find((r) => r.version === 2)).toBeUndefined();
  });
});
