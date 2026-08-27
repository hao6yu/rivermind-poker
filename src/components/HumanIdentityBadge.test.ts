import { describe, expect, it } from 'vitest';

import {
  humanIdentityAccessibilityLabel,
  humanSeatChipLabel,
} from '../domain/humanIdentity';

describe('humanIdentityAccessibilityLabel', () => {
  it('reads the name first, then the visible role, for each seat kind', () => {
    expect(humanIdentityAccessibilityLabel({ displayName: 'River', isYou: true }))
      .toBe('River, You');
    expect(humanIdentityAccessibilityLabel({ displayName: 'Nova', control: 'human' }))
      .toBe('Nova, Player');
    expect(humanIdentityAccessibilityLabel({ displayName: 'Kai', control: 'ai' }))
      .toBe('Kai, AI opponent');
  });

  it('marks the host without changing the visible name', () => {
    expect(humanIdentityAccessibilityLabel({ displayName: 'River', isYou: true, isHost: true }))
      .toBe('River, You, host');
    expect(humanIdentityAccessibilityLabel({ displayName: 'Nova', control: 'ai', isHost: true }))
      .toBe('Nova, AI opponent, host');
  });

  it('keeps the role independent of the name so same-name seats stay distinguishable', () => {
    const you = humanIdentityAccessibilityLabel({ displayName: 'Same', isYou: true });
    const ai = humanIdentityAccessibilityLabel({ displayName: 'Same', control: 'ai' });
    expect(you).toBe('Same, You');
    expect(ai).toBe('Same, AI opponent');
    expect(you).not.toBe(ai);
  });
});

describe('humanSeatChipLabel', () => {
  it('prioritizes "You" over "Host" and returns null when neither applies', () => {
    expect(humanSeatChipLabel({ isYou: true, isHost: true })).toBe('You');
    expect(humanSeatChipLabel({ isHost: true })).toBe('Host');
    expect(humanSeatChipLabel({})).toBeNull();
  });
});
