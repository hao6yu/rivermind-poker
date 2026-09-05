import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * Real-loader retry test (review remediation round 3, finding #11): tests the
 * ACTUAL `loadDraftLocaleCatalog` with a fail-once generated entry. Only the
 * GENERATED module is mocked (to control the load result); the loader logic
 * itself is the real code path, proving the loadWaiters cache is cleared.
 */

// Mock only the generated file: fail once, then succeed.
const generatedState = vi.hoisted(() => ({ callCount: 0 }));

vi.mock('./draftCatalogs.generated', () => ({
  DRAFT_LOADERS: {
    ja: {
      load: async () => {
        generatedState.callCount += 1;
        if (generatedState.callCount === 1) throw new Error('simulated transient chunk failure');
        return { 'settings.language': '言語' };
      },
    },
  },
}));

import { loadDraftLocaleCatalog, isDraftCatalogLoaded } from './draftCatalogs';
import { LOCALES } from './registry';

describe('draftCatalogs real-loader retry (finding #11)', () => {
  beforeEach(() => {
    generatedState.callCount = 0;
    LOCALES.ja.messageCatalog = {} as typeof LOCALES.ja.messageCatalog;
  });

  it('clears the loadWaiters cache after a rejection so a retry succeeds', async () => {
    // First call: rejects (the generated entry throws).
    await expect(loadDraftLocaleCatalog('ja')).rejects.toThrow('simulated transient chunk failure');
    expect(isDraftCatalogLoaded('ja')).toBe(false);
    expect(generatedState.callCount).toBe(1);

    // Second call: succeeds — the rejected promise was NOT cached (the
    // finally block cleared the loadWaiters entry).
    await loadDraftLocaleCatalog('ja');
    expect(generatedState.callCount).toBe(2);
    expect(isDraftCatalogLoaded('ja')).toBe(true);
    expect(LOCALES.ja.messageCatalog['settings.language']).toBe('言語');
  });
});
