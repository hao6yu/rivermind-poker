import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { LanguagePreference } from './core';
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

  it('keeps a draft preference loadable in preview builds', () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = true;
    storage.set('rivermind.languagePreference', 'es-419');
    renderProvider();
    expect(captured?.preference).toBe('es-419');
    expect(captured?.language).toBe('es-419');
  });

  it('normalizes a draft preference set at runtime in production', () => {
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
