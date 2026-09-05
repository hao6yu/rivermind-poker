import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  draftPreviewLocales,
  internalPreviewLocalesEnabled,
  LOCALE_PROFILES,
  resolveLocaleProfile,
  setLocaleProfileOverride,
} from './internalPreview';
import { CATALOG_COMPLETE_LOCALES, languagePreferencesFor, SHIPPED_LOCALES } from './registry';

/**
 * Locale build-profile tests (review remediation #5): production keeps draft
 * locales invisible and sanitized; development and authorized internal-
 * preview builds expose the catalog-complete drafts in the picker and honor
 * saved draft preferences.
 */

describe('locale build profile', () => {
  beforeEach(() => {
    setLocaleProfileOverride(null);
  });
  afterEach(() => {
    setLocaleProfileOverride(null);
  });

  it('supports exactly the two build profiles', () => {
    expect(LOCALE_PROFILES).toEqual(['production', 'internal-preview']);
  });

  it('defaults to production when no build env or dev flag is present', () => {
    // No __DEV__ global in this test run and no EXPO_PUBLIC override.
    expect(resolveLocaleProfile()).toBe('production');
    expect(internalPreviewLocalesEnabled()).toBe(false);
  });

  it('keeps development builds on the production path when no profile is set (round 3 finding #2)', () => {
    // Round 3 finding #2: build and runtime behavior derive from ONE source
    // (EXPO_PUBLIC_RM_LOCALE_PROFILE). Dev without the env var defaults to
    // production — the draft picker does NOT appear automatically.
    const devGlobal = globalThis as { __DEV__?: boolean };
    const original = devGlobal.__DEV__;
    devGlobal.__DEV__ = true;
    try {
      expect(resolveLocaleProfile()).toBe('production');
      expect(internalPreviewLocalesEnabled()).toBe(false);
    } finally {
      devGlobal.__DEV__ = original;
    }
  });

  it('honors the EXPO_PUBLIC build-profile override', () => {
    const env = process.env;
    process.env = { ...env, EXPO_PUBLIC_RM_LOCALE_PROFILE: 'internal-preview' };
    try {
      expect(resolveLocaleProfile()).toBe('internal-preview');
    } finally {
      process.env = env;
    }
    process.env = { ...env, EXPO_PUBLIC_RM_LOCALE_PROFILE: 'production' };
    try {
      expect(resolveLocaleProfile()).toBe('production');
    } finally {
      process.env = env;
    }
  });

  it('exposes draft locales in the picker only in internal-preview builds', () => {
    const drafts = draftPreviewLocales(CATALOG_COMPLETE_LOCALES, SHIPPED_LOCALES);
    expect(drafts).toEqual(['es-419', 'pt-BR', 'ja']);

    // Production: System + released locales only.
    expect(languagePreferencesFor(false)).toEqual(['system', ...SHIPPED_LOCALES]);
    expect(languagePreferencesFor(false)).not.toContain('ja');

    // Authorized internal preview: drafts join the picker after the released ones.
    expect(languagePreferencesFor(true)).toEqual([
      'system',
      ...SHIPPED_LOCALES,
      'es-419',
      'pt-BR',
      'ja',
    ]);
  });
});
