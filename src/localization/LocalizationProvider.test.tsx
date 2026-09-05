import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LanguagePreference } from './core';
import { setLocaleProfileOverride } from './internalPreview';
import { LocalizationProvider, useLocalization } from './LocalizationProvider';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * Provider fixtures for the draft-locale preference gate (review follow-up):
 * a stale saved `es-419`/`pt-BR` preference from a preview build must be
 * normalized to `system` in production — both in the resolved language and in
 * the exposed `preference` the settings surface reads — while preview builds
 * keep loading draft preferences.
 */

const storage = new Map<string, string>();

vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  return {
    AppState: { addEventListener: () => ({ remove: () => undefined }) },
    StyleSheet: { create: <T,>(styles: T): T => styles, hairlineWidth: 1 },
    Text: host('text'),
    View: host('view'),
  };
});

let captured: {
  language: string;
  preference: string;
  setPreference: (next: LanguagePreference) => void;
} | null = null;

function Probe(): null {
  const value = useLocalization();
  captured = {
    language: value.language,
    preference: value.preference,
    setPreference: value.setPreference,
  };
  return null;
}

function renderProvider(): void {
  captured = null;
  TestRenderer.act(() => {
    TestRenderer.create(
      createElement(LocalizationProvider, null, createElement(Probe)),
    );
  });
}

describe('LocalizationProvider draft-preference normalization', () => {
  beforeEach(() => {
    storage.clear();
    // The provider reads the WebView-style global localStorage (installed by
    // expo-sqlite/localStorage/install at runtime); stub it for the fixture.
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    };
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  });

  it('normalizes a stale draft preference to system in production', () => {
    storage.set('rivermind.languagePreference', 'es-419');
    renderProvider();
    expect(captured?.preference).toBe('system');
    expect(captured?.language).toBe('en');
  });

  it('keeps a draft preference loadable in internal-preview builds (round 3: explicit profile required)', () => {
    // Round 3 finding #2: dev without an explicit profile defaults to
    // production. Set the override to simulate the internal-preview profile.
    setLocaleProfileOverride('internal-preview');
    storage.set('rivermind.languagePreference', 'es-419');
    // Ensure localStorage is stubbed before the provider reads it.
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
      removeItem: (key: string) => void storage.delete(key),
    };
    renderProvider();
    expect(captured?.preference).toBe('es-419');
    expect(captured?.language).toBe('es-419');
  });

  it('normalizes a draft preference set at runtime in production', () => {
    setLocaleProfileOverride(null);
    renderProvider();
    act(() => {
      captured?.setPreference('pt-BR');
    });
    expect(captured?.preference).toBe('system');
    expect(captured?.language).toBe('en');
    // The stored value is rewritten so the stale draft cannot resurface.
    expect(storage.get('rivermind.languagePreference')).toBe('system');
  });

  it('keeps release-enabled explicit preferences untouched', () => {
    storage.set('rivermind.languagePreference', 'zh-Hant');
    renderProvider();
    expect(captured?.preference).toBe('zh-Hant');
    expect(captured?.language).toBe('zh-Hant');
  });
});

describe('locale build profile (review remediation #5)', () => {
  beforeEach(() => {
    storage.clear();
    storage.set('rivermind.languagePreference', 'ja');
    setLocaleProfileOverride(null);
  });
  afterEach(() => {
    setLocaleProfileOverride(null);
  });

  it('production normalizes a saved draft preference to system', () => {
    setLocaleProfileOverride('production');
    renderProvider();
    expect(captured?.preference).toBe('system');
    expect(captured?.language).toBe('en');
  });

  it('authorized internal-preview builds keep a saved draft preference', () => {
    setLocaleProfileOverride('internal-preview');
    renderProvider();
    expect(captured?.preference).toBe('ja');
    // The system locale in this fixture is en-US, so the saved draft wins.
    expect(captured?.language).toBe('ja');
  });

  it('development defaults to production (round 3 finding #2: one source for build and runtime)', () => {
    setLocaleProfileOverride(null);
    const devGlobal = globalThis as { __DEV__?: boolean };
    const original = devGlobal.__DEV__;
    devGlobal.__DEV__ = true;
    try {
      renderProvider();
      // Dev without EXPO_PUBLIC_RM_LOCALE_PROFILE defaults to production — the
      // draft preference sanitizes, matching the native config.
      expect(captured?.preference).toBe('system');
      expect(captured?.language).toBe('en');
    } finally {
      devGlobal.__DEV__ = original;
    }
  });

  it('production sanitizes a runtime-set draft preference to system', () => {
    setLocaleProfileOverride('production');
    renderProvider();
    act(() => {
      captured?.setPreference('ja');
    });
    expect(captured?.preference).toBe('system');
    expect(storage.get('rivermind.languagePreference')).toBe('system');
  });
});
