import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = (props: { children?: ReactNode }) => createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };
  const Pressable = (props: { children?: ReactNode; style?: unknown; [key: string]: unknown }) => {
    const { children, style, ...rest } = props;
    return createElement('pressable', {
      ...rest,
      style: typeof style === 'function'
        ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false })
        : style,
    }, children);
  };
  return {
    Pressable,
    StyleSheet: { create: <T,>(styles: T): T => styles, hairlineWidth: 0.5 },
    Text: host('text'),
    View: host('view'),
    useWindowDimensions: () => ({ height: 844, width: 390 }),
  };
});

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '00000000-0000-4000-8000-000000000001' }));
vi.mock('../../localization', () => ({ useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      }, t: (key: string) => key }) }));
vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: {
      border: '#555', primary: '#88f', soft: '#222', surface: '#111', text: '#fff',
    },
  }),
}));

import { TableMomentTrayView } from './TableMomentTrayView';

function renderTray(onSendMoment = vi.fn(async () => ({ status: 'accepted' as const }))): {
  onSendMoment: typeof onSendMoment;
  tree: ReactTestRenderer;
} {
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(createElement(TableMomentTrayView, {
      compact: false,
      onSendMoment,
      queueScope: 'room:1',
    }));
  });
  if (!tree) throw new Error('The reaction tray failed to mount.');
  return { onSendMoment, tree };
}

function pressableByLabel(tree: ReactTestRenderer, label: string) {
  return tree.root.findAllByType('pressable' as never)
    .find((node) => node.props.accessibilityLabel === label);
}

describe('table reaction tray dismissal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('queues one reaction and immediately returns to the launcher after the tap', async () => {
    const { onSendMoment, tree } = renderTray();
    act(() => { (pressableByLabel(tree, 'multiplayer.moment.trayHint')!.props.onPress as () => void)(); });
    expect(pressableByLabel(tree, 'multiplayer.moment.cheerLabel')).toBeTruthy();

    act(() => { (pressableByLabel(tree, 'multiplayer.moment.cheerLabel')!.props.onPress as () => void)(); });

    expect(pressableByLabel(tree, 'multiplayer.moment.cheerLabel')).toBeUndefined();
    expect(pressableByLabel(tree, 'multiplayer.moment.trayHint')).toBeTruthy();
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(onSendMoment).toHaveBeenCalledWith('cheer', '00000000-0000-4000-8000-000000000001');
  });
});
