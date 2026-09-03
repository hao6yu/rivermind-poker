import { describe, expect, it } from 'vitest';

import { MULTIWAY_AI_IDENTITIES } from '../domain/poker/multiwayAiProfiles';
import { AI_AVATAR_DOCUMENTED_FALLBACKS, resolveAiAvatarIdentity } from './aiAvatarIdentity';

/**
 * P18-016 / D10 — every active persona resolves to an INTENDED visual
 * identity: an authored asset, or the explicit temporary fallback recorded in
 * the Phase 18.5 ledger (Elsa, Milo, Noah, Otto — an owner art dependency).
 * An accidental generic fallback can never reach the felt, lobby, standings,
 * replay, history, or profile surfaces.
 */
describe('AI persona identity resolution (P18-016)', () => {
  it('resolves every active persona to an asset or a documented fallback', () => {
    for (const identity of MULTIWAY_AI_IDENTITIES) {
      const resolution = resolveAiAvatarIdentity(identity.avatarKey);
      expect(
        resolution.kind === 'unknown',
        `${identity.name} (${identity.avatarKey}) has no intended visual identity`,
      ).toBe(false);
      expect(
        ['asset', 'fallback'],
        `${identity.name} (${identity.avatarKey})`,
      ).toContain(resolution.kind);
    }
  });

  it('keeps the documented fallback set exactly the recorded art dependency', () => {
    expect(Object.keys(AI_AVATAR_DOCUMENTED_FALLBACKS).sort()).toEqual([
      'elsa-sticky',
      'milo-balanced',
      'noah-deceptive',
      'otto-pressure',
    ]);
    // The four named personas exist in the active roster.
    const names = new Set(MULTIWAY_AI_IDENTITIES.map((identity) => identity.avatarKey));
    for (const avatarKey of Object.keys(AI_AVATAR_DOCUMENTED_FALLBACKS)) {
      expect(names.has(avatarKey), avatarKey).toBe(true);
    }
  });

  it('gives every documented fallback a distinct hue so the four stay tellable apart', () => {
    const colors = Object.values(AI_AVATAR_DOCUMENTED_FALLBACKS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});
