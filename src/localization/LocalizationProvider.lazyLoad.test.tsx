import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LanguagePreference } from './core';
import { englishMessages } from './messages';
import { japaneseMessages } from './ja';
import { LocalizationProvider, useLocalization } from './LocalizationProvider';
import { setLocaleProfileOverride } from './internalPreview';
import { LOCALES } from './registry';

/**
 * Isolated lazy-load provider suite (review remediation round 2, findings #2
 * and #7): this file deliberately does NOT import the draft catalog fixture —
 * the ja catalog starts EMPTY, so the suite exercises the real asynchronous
 * loading path that the global registration used to mask.
 *
 * It proves:
 *  - before loading, a draft preference renders the English fallback;
 *  - after the chunk resolves, the rendered text is Japanese — the context
 *    value must be replaced (draftCatalogVersion propagates);
 *  - a transient load failure keeps English and a retry succeeds.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
});

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

// Mock the loader: fails once, then serves the real Japanese greeting. The
// mock is hoisted so the provider under test picks it up.
const mocks = vi.hoisted(() => {
  const state = { failNext: false };
  return {
    state,
    loadDraftLocaleCatalog: vi.fn(async (language: string) => {
      if (state.failNext) {
        state.failNext = false;
        throw new Error('simulated transient chunk failure');
      }
      // Register the real ja catalog through the registry's registrar path.
      const { japaneseMessages } = await import('./ja');
      const { LOCALES } = await import('./registry');
      LOCALES[language as 'ja'].messageCatalog = japaneseMessages;
    }),
    isDraftCatalogLanguage: (language: string) => language === 'ja',
    isDraftCatalogLoaded: () => false,
  };
});

vi.mock('./draftCatalogs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./draftCatalogs')>();
  return {
    ...actual,
    loadDraftLocaleCatalog: mocks.loadDraftLocaleCatalog,
    isDraftCatalogLanguage: mocks.isDraftCatalogLanguage,
    isDraftCatalogLoaded: mocks.isDraftCatalogLoaded,
  };
});

const storage = new Map<string, string>();

// The provider reads the runtime localStorage (installed by
// expo-sqlite/localStorage/install); stub it before rendering.
beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  };
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

let captured: { language: string; preference: string; text: string } | null = null;

function Probe(): null {
  const value = useLocalization();
  captured = {
    language: value.language,
    preference: value.preference,
    text: value.t('settings.language'),
  };
  return null;
}

describe('provider lazy draft loading (findings #2/#7)', () => {
  beforeEach(() => {
    storage.clear();
    storage.set('rivermind.languagePreference', 'ja');
    setLocaleProfileOverride('internal-preview');
    mocks.state.failNext = false;
    mocks.loadDraftLocaleCatalog.mockClear();
    // The registry is module-level and prior tests/tests' loaders may have
    // registered ja already — reset to the unloaded empty state.
    LOCALES.ja.messageCatalog = {} as typeof LOCALES.ja.messageCatalog;
  });
  afterEach(() => {
    setLocaleProfileOverride(null);
  });

  function renderProvider(): void {
    captured = null;
    act(() => {
      TestRenderer.create(
        createElement(LocalizationProvider, null, createElement(Probe)),
      );
    });
  }

  it('renders the English fallback first, then Japanese after the chunk resolves', async () => {
    renderProvider();
    // Before the (async) load settles: the empty ja catalog falls back to
    // English — the same string the en catalog renders.
    const before = captured?.text;
    expect(captured?.preference).toBe('ja');
    expect(captured?.language).toBe('ja');
    expect(before).toBe(translateEn('settings.language'));

    // Let the load promise resolve and the provider re-render.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.loadDraftLocaleCatalog).toHaveBeenCalledWith('ja');
    expect(captured?.text).toBe(translateJa('settings.language'));
    expect(captured?.text).not.toBe(before);
  });

  it('survives a transient load failure (stays English) and a retry succeeds', async () => {
    mocks.state.failNext = true;
    renderProvider();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    // First load failed: still the English fallback.
    expect(captured?.text).toBe(translateEn('settings.language'));

    // The picker/user retries: the provider calls the loader again (the
    // rejected promise must not be cached) and Japanese renders.
    act(() => {
      // Re-rendering the provider re-runs the loading effect for the still-
      // selected draft language.
      captured = null;
    });
    renderProvider();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.loadDraftLocaleCatalog).toHaveBeenCalledTimes(2);
    expect(captured?.text).toBe(translateJa('settings.language'));
  });
});

function translateEn(key: string): string {
  // Direct catalog reads keep the assertion independent of translate()'s
  // registry lookup (the ja registry entry starts empty in this suite).
  return englishMessages[key as keyof typeof englishMessages];
}

function translateJa(key: string): string {
  return japaneseMessages[key as keyof typeof japaneseMessages];
}
