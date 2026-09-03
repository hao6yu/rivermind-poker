/**
 * Q5 (Slice 3.11 follow-up): RENDERED reachability of the host-only
 * end-stalled-session control. The original defect was structural — the
 * settled-hand result panel branch returned before the between-hands
 * controls could ever render. The production action-panel wrapper now owns
 * the host escape outside those early-return branches. These tests render
 * that composition with both kinds of content, exercise its eligibility
 * guards, and drive the real confirmation; no source-text assertions.
 * Locale assertions use the REAL message catalog for en, zh-Hans, and
 * zh-Hant, so a copy that exists in only one language fails here.
 */
import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { translate, type AppLanguage } from '../../localization/core';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ alert: vi.fn(), locale: 'en' }));
const alertMock = mocks.alert;

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
    // A disabled RN Pressable never fires onPress; the stub mirrors that so
    // the busy-path test exercises an honest control surface.
    return createElement('pressable', {
      ...rest,
      disabled: Boolean(disabled),
      onPress: disabled ? undefined : onPress,
      style: typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style,
    }, children);
  };
  return {
    ActivityIndicator: host('activity'),
    Alert: { alert: (...args: unknown[]) => { alertMock(...args); } },
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
      background: '#ffffff',
      border: '#cccccc',
      muted: '#888888',
      primary: '#123456',
      primaryText: '#ffffff',
      shadow: '#000000',
    },
  }),
}));

vi.mock('../../localization', async () => {
  // Deliberately NOT spreading the real index: it loads the provider (and
  // expo-sqlite) at import time. `translate` below comes from the REAL
  // catalog core, so every locale assertion runs against production copy.
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
      t: (key: Parameters<typeof core.translate>[1], values?: Parameters<typeof core.translate>[2]) =>
        core.translate(mocks.locale as AppLanguage, key, values),
    }),
  };
});

import { MultiplayerActionPanel, MultiplayerHostEndControl } from './multiplayerSettledControls';
import type { MultiplayerViewerProjection } from '../../domain/multiplayer/contracts';

function renderControl(options: { busy?: boolean; onEndStalledSession?: () => void } = {}) {
  const onEndStalledSession = options.onEndStalledSession ?? vi.fn();
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(
      createElement(MultiplayerHostEndControl, {
        busy: options.busy ?? false,
        onEndStalledSession,
      }),
    );
  });
  if (!tree) throw new Error('The control failed to mount.');
  return { onEndStalledSession, tree };
}

function button(tree: ReactTestRenderer) {
  // The HOST node (the stub's 'pressable' element), where the gated onPress
  // lives — not the component instance, which always carries the closure.
  return tree.root.findByType('pressable' as never);
}

function renderedText(tree: ReactTestRenderer): string {
  return tree.root.findAllByType('text' as never)
    .map((node: ReactTestInstance) => [node.props.children].flat().filter((child: unknown) => typeof child === 'string').join(''))
    .join('');
}

beforeEach(() => {
  alertMock.mockReset();
  mocks.locale = 'en';
});

describe('rendered host-end control (Q5)', () => {
  it('renders the English action, confirms through the dialog, and dispatches only on the destructive button', () => {
    const { onEndStalledSession, tree } = renderControl();
    expect(renderedText(tree)).toBe(translate('en', 'multiplayer.game.hostEndSession'));

    const onPress = button(tree).props.onPress as () => void;
    act(() => { onPress(); });
    expect(alertMock).toHaveBeenCalledTimes(1);
    const [title, detail, buttons] = alertMock.mock.calls[0] as [string, string, Array<{ onPress?: () => void; style?: string; text: string }>];
    expect(title).toBe(translate('en', 'multiplayer.game.hostEndTitle'));
    expect(detail).toBe(translate('en', 'multiplayer.game.hostEndDetail'));
    expect(buttons.map((entry) => entry.text)).toEqual([
      translate('en', 'multiplayer.game.stay'),
      translate('en', 'multiplayer.game.hostEndSession'),
    ]);
    expect(buttons[0]!.style).toBe('cancel');
    expect(buttons[1]!.style).toBe('destructive');

    act(() => { buttons[0]!.onPress?.(); });
    expect(onEndStalledSession).not.toHaveBeenCalled();

    act(() => { buttons[1]!.onPress?.(); });
    expect(onEndStalledSession).toHaveBeenCalledTimes(1);
  });

  it('renders every locale of the real catalog for the button and the full confirmation', () => {
    const locales: AppLanguage[] = ['en', 'zh-Hans', 'zh-Hant'];
    const keys = [
      'multiplayer.game.hostEndSession',
      'multiplayer.game.hostEndTitle',
      'multiplayer.game.hostEndDetail',
      'multiplayer.game.stay',
    ] as const;
    for (const language of locales) {
      mocks.locale = language;
      const { tree } = renderControl();
      expect(renderedText(tree), `button label in ${language}`).toBe(translate(language, 'multiplayer.game.hostEndSession'));
      expect(renderedText(tree), `button label is copy in ${language}`).not.toBe('multiplayer.game.hostEndSession');
      act(() => { (button(tree).props.onPress as () => void)(); });
      const [title, detail, alertButtons] = alertMock.mock.calls.at(-1) as [string, string, Array<{ text: string }>];
      for (const key of keys) {
        const value = translate(language, key);
        // A missing dictionary entry must not silently fall through to the
        // raw key or to another language for the Simplified/Traditional sets.
        expect(value, `${key} exists in ${language}`).not.toBe(key);
        expect(title === value || detail === value || alertButtons.some((entry) => entry.text === value),
          `${key} rendered in ${language}`).toBe(true);
      }
    }
    // Simplified and Traditional must not be byte-identical copies.
    expect(translate('zh-Hans', 'multiplayer.game.hostEndSession'))
      .not.toBe(translate('zh-Hant', 'multiplayer.game.hostEndSession'));
  });

  it('is not pressable while a command is busy', () => {
    const { tree } = renderControl({ busy: true });
    const control = button(tree);
    expect(control.props.disabled).toBe(true);
    expect(control.props.onPress).toBeUndefined();
    expect(control.props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(tree.root.findAllByType('activity' as never).length).toBe(1);
    expect(alertMock).not.toHaveBeenCalled();
  });

  it('cannot open a second confirmation once the first command is in flight', () => {
    const onEndStalledSession = vi.fn();
    const { tree } = renderControl({ onEndStalledSession });
    act(() => { (button(tree).props.onPress as () => void)(); });
    const alertButtons = (alertMock.mock.calls[0] as [string, string, Array<{ onPress?: () => void }>])[2];
    act(() => { alertButtons[1]!.onPress?.(); });
    expect(onEndStalledSession).toHaveBeenCalledTimes(1);

    // The command flips busy; from that render on, the mounted control can
    // not open another confirmation at all (no onPress surface remains).
    // Duplicate COMMAND delivery itself is proven idempotent against the
    // real worker (command-id replay test in the HTTP suite).
    act(() => {
      tree.update(createElement(MultiplayerHostEndControl, { busy: true, onEndStalledSession }));
    });
    expect(button(tree).props.onPress).toBeUndefined();
    expect(button(tree).props.disabled).toBe(true);
    act(() => {
      const second = button(tree).props.onPress as (() => void) | undefined;
      second?.();
    });
    expect(alertMock).toHaveBeenCalledTimes(1);
    expect(onEndStalledSession).toHaveBeenCalledTimes(1);
  });
});

describe('rendered action-panel composition (Q5)', () => {
  const room = {
    status: 'between-hands', nextHandAtMs: null, hostPlayerId: 'host', viewerPlayerId: 'host',
    seats: [
      { playerId: 'host', kind: 'human', control: 'human', connection: 'online', participation: 'active', ledger: { settledStack: 4000 } },
      { playerId: 'guest', kind: 'human', control: 'human', connection: 'online', participation: 'sitting-out', ledger: { settledStack: 0 } },
    ],
  } as unknown as MultiplayerViewerProjection;
  const render = (overrides: Partial<Parameters<typeof MultiplayerActionPanel>[0]> = {}) => {
    let tree!: ReactTestRenderer;
    const onEndStalledSession = vi.fn();
    act(() => { tree = TestRenderer.create(createElement(MultiplayerActionPanel, {
      room, busy: false, presentationReady: true, actionPending: false,
      children: createElement('text', { testID: 'settled-content' }, 'Result'), onEndStalledSession, ...overrides,
    })); });
    return { tree, onEndStalledSession };
  };

  it.each(['result', 'between-hands'])('renders the host escape alongside %s content and confirms before dispatch', (branch) => {
    const { tree, onEndStalledSession } = render({ children: createElement('text', { testID: 'settled-content' }, branch) });
    expect(tree.root.findByProps({ testID: 'settled-content' }).children).toEqual([branch]);
    expect(tree.root.findAllByType('pressable' as never)).toHaveLength(1);
    act(() => { button(tree).props.onPress(); });
    expect(onEndStalledSession).not.toHaveBeenCalled();
    const buttons = alertMock.mock.calls[0]![2] as Array<{ onPress?: () => void }>;
    act(() => { buttons[1]!.onPress!(); });
    expect(onEndStalledSession).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
  it.each([
    { room: { ...room, viewerPlayerId: 'guest' } },
    { room: { ...room, status: 'playing' as const } },
    { room: { ...room, status: 'complete' as const } },
    { room: { ...room, nextHandAtMs: 1000 } },
    { room: { ...room, seats: room.seats.map((seat) => ({ ...seat, connection: 'offline' as const })) } },
    { presentationReady: false }, { actionPending: true },
  ])('does not expose the host command for ineligible state %j', (overrides) => {
    const { tree } = render(overrides);
    expect(tree.root.findAllByType('pressable' as never)).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'settled-content' })).toBeDefined();
    act(() => tree.unmount());
  });
});
