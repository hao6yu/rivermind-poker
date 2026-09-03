/**
 * DT-10 (Slice 3.11): the compact collapsible Home Poker tools card.
 *
 * The original defect was that the Home "cheat sheets" row was a two-step
 * route into the Learn catalog — it conveyed nothing about which tools existed
 * and opened a whole collection instead of the exact tool. These tests render
 * the real PokerToolsCard composition, assert the collapsed/expanded item set,
 * and drive the direct open into the exact authored sheet (which here is the
 * ReferenceModal boundary). Locale assertions use the REAL message catalog for
 * en, zh-Hans, and zh-Hant, so a copy that exists in only one language fails.
 */
import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate, type AppLanguage } from '../../localization/core';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  locale: 'en',
  onClose: vi.fn() as unknown as () => void,
  onOpen: vi.fn(),
  sheet: null as unknown,
}));

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = (props: { children?: ReactNode }) => createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };
  const Pressable = (props: {
    children?: ReactNode;
    disabled?: boolean;
    onPress?: () => void;
    style?: unknown;
    [key: string]: unknown;
  }) => {
    const { children, onPress, disabled, style, ...rest } = props;
    return createElement('pressable', {
      ...rest,
      disabled: Boolean(disabled),
      onPress: disabled ? undefined : onPress,
      style: typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style,
    }, children);
  };
  return {
    Modal: host('modal'),
    Pressable,
    StyleSheet: { create: <T extends Record<string, unknown>>(styles: T): T => styles, hairlineWidth: 0.5 },
    Text: host('text'),
    View: host('view'),
  };
});

vi.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: {
      aqua: '#0a7ea4',
      aquaSoft: '#e0f4f8',
      background: '#ffffff',
      border: '#cccccc',
      muted: '#888888',
      primary: '#123456',
      primaryText: '#ffffff',
      shadow: '#000000',
      soft: '#f0f0f0',
      surface: '#ffffff',
      text: '#111111',
    },
  }),
}));

vi.mock('../../localization', async () => {
  const core = await import('../../localization/core');
  return {
    useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      },
      // activityText maps a CheatSheetDefinition id+field onto the real catalog
      // key, so the row labels are production copy per locale. Reproduce the
      // key derivation here (same shape as the provider) so the labels are the
      // real localized titles.
      activityText: (activity: { description: string; id: string; title: string }, field: 'description' | 'title') => {
        const key = `activity.${activity.id}.${field}` as Parameters<typeof core.translate>[2] extends never ? never : string;
        const value = core.translate(mocks.locale as AppLanguage, key as never);
        return value === key ? activity[field] : value;
      },
      t: (key: Parameters<typeof core.translate>[1], values?: Parameters<typeof core.translate>[2]) =>
        core.translate(mocks.locale as AppLanguage, key, values),
    }),
  };
});

// Isolate the card from the ReferenceModal implementation so the test drives
// the card's own collapse/expand and direct-open wiring deterministically.
vi.mock('../learn/ReferenceModal', () => ({
  ReferenceModal: (props: { onClose: () => void; sheet: unknown }) => {
    mocks.onClose = props.onClose;
    mocks.sheet = props.sheet;
    return createElement('reference-modal');
  },
}));

import { PokerToolsCard } from './PokerToolsCard';
import { advancedMathCheatSheet, cheatSheets } from '../../domain/learning/content';

function sheetTitle(id: string): string {
  const sheet = cheatSheets.find((candidate) => candidate.id === id);
  if (!sheet) throw new Error(`no sheet ${id}`);
  return translate(mocks.locale as AppLanguage, `activity.${id}.title` as never) as string;
}

function render() {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(createElement(PokerToolsCard));
  });
  if (!tree) throw new Error('PokerToolsCard failed to mount.');
  return { tree };
}

function pressableNodes(tree: ReactTestRenderer) {
  return tree.root.findAllByType('pressable' as never);
}

function labels(tree: ReactTestRenderer): string[] {
  return tree.root.findAll((node) => node.props.accessibilityLabel != null)
    .map((node) => node.props.accessibilityLabel as string);
}

function invokePress(tree: ReactTestRenderer, accessibilityLabel: string) {
  const node = tree.root.findAll(
    (candidate) => candidate.type === 'pressable' as never && candidate.props.accessibilityLabel === accessibilityLabel,
  )[0];
  if (!node) throw new Error(`no pressable with label ${accessibilityLabel}`);
  act(() => {
    node.props.onPress?.();
  });
}

beforeEach(() => {
  mocks.locale = 'en';
  mocks.onClose = vi.fn();
  mocks.onOpen = vi.fn();
  mocks.sheet = null;
});

describe('PokerToolsCard (DT-10)', () => {
  it('renders the two primary tools while collapsed, with the header toggle', () => {
    const { tree } = render();
    const labelsSeen = labels(tree);
    expect(labelsSeen).toContain('Poker tools');
    expect(labelsSeen).toContain(sheetTitle('sheet-hand-rankings'));
    expect(labelsSeen).toContain(sheetTitle('sheet-preflop'));
    // The supplementary tools are hidden until expanded.
    expect(labelsSeen).not.toContain(sheetTitle('sheet-percentages'));
    expect(labelsSeen).not.toContain(sheetTitle('sheet-advanced-math'));
  });

  it('reveals the supplementary tools after expanding', () => {
    const { tree } = render();
    invokePress(tree, 'Poker tools');
    const labelsSeen = labels(tree);
    expect(labelsSeen).toContain(sheetTitle('sheet-percentages'));
    expect(labelsSeen).toContain(sheetTitle('sheet-advanced-math'));
  });

  it('collapses again on a second toggle', () => {
    const { tree } = render();
    invokePress(tree, 'Poker tools');
    invokePress(tree, 'Poker tools');
    const labelsSeen = labels(tree);
    expect(labelsSeen).not.toContain(sheetTitle('sheet-percentages'));
    expect(labelsSeen).not.toContain(sheetTitle('sheet-advanced-math'));
  });

  it('opens the exact authored sheet for a tool in one tap', () => {
    const { tree } = render();
    invokePress(tree, sheetTitle('sheet-hand-rankings'));
    expect(mocks.sheet).toBe(cheatSheets.find((s) => s.id === 'sheet-hand-rankings'));
  });

  it('opens the advanced-math sheet after expanding', () => {
    const { tree } = render();
    invokePress(tree, 'Poker tools');
    invokePress(tree, sheetTitle('sheet-advanced-math'));
    expect(mocks.sheet).toBe(advancedMathCheatSheet);
  });

  it('closes the opened sheet back to Home via the modal close', () => {
    const { tree } = render();
    invokePress(tree, sheetTitle('sheet-preflop'));
    expect(mocks.sheet).not.toBeNull();
    act(() => {
      mocks.onClose();
    });
    expect(mocks.sheet).toBeNull();
  });

  it('ships the card copy for every supported locale', () => {
    for (const locale of ['en', 'zh-Hans', 'zh-Hant'] as AppLanguage[]) {
      mocks.locale = locale;
      const { tree } = render();
      const headerLabel = translate(locale, 'home.pokerTools' as never) as string;
      const labelsSeen = labels(tree);
      // The header resolves to real localized copy for every locale.
      expect(labelsSeen).toContain(headerLabel);
      // No missing-key fallback leaks through: the rendered label is never the raw key.
      expect(labelsSeen).not.toContain('home.pokerTools');
    }
  });

  it('exposes an expanded accessibility state on the header toggle', () => {
    const { tree } = render();
    const header = tree.root.findAll(
      (candidate) => candidate.type === 'pressable' as never && candidate.props.accessibilityLabel === 'Poker tools',
    )[0];
    expect(header?.props.accessibilityState).toEqual({ expanded: false });
    invokePress(tree, 'Poker tools');
    const expandedHeader = tree.root.findAll(
      (candidate) => candidate.type === 'pressable' as never && candidate.props.accessibilityLabel === 'Poker tools',
    )[0];
    expect(expandedHeader?.props.accessibilityState).toEqual({ expanded: true });
  });
});
