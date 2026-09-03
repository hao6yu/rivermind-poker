import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const AccessibilityInfo = { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => undefined }) };
  const host = (name: string) => {
    const Component = (props: { children?: ReactNode }) => createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };
  const Pressable = (props: { children?: ReactNode; style?: unknown; [key: string]: unknown }) => {
    const { children, style, ...rest } = props;
    return createElement('pressable', {
      ...rest,
      style: typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style,
    }, children);
  };
  const Modal = (props: { children?: ReactNode; visible?: boolean }) => props.visible
    ? createElement('modal', props, props.children)
    : null;
  return {
    AccessibilityInfo,
    ActivityIndicator: host('activity-indicator'),
    Modal,
    Pressable,
    StyleSheet: { create: <T,>(styles: T): T => styles },
    Text: host('text'),
    View: host('view'),
  };
});

vi.mock('react-native-safe-area-context', () => ({ SafeAreaView: (props: { children?: ReactNode }) => createElement('safe-area-view', props, props.children) }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../table/useTableOrientation', () => ({ LIVE_TABLE_SUPPORTED_ORIENTATIONS: ['portrait', 'landscape-left', 'landscape-right'] }));
vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: {
      accentSoft: '#224', border: '#556', muted: '#aaa', primary: '#88f', primaryText: '#000',
      scrim: '#0008', shadow: '#000', surface: '#111', surfaceRaised: '#181818', text: '#fff',
    },
  }),
}));
vi.mock('../../localization', async () => {
  const core = await import('../../localization/core');
  return { useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      }, t: (key: Parameters<typeof core.translate>[1], values?: Parameters<typeof core.translate>[2]) => core.translate('en', key, values) }) };
});

import { MultiplayerRebuyDecisionModal } from './MultiplayerRebuyDecisionModal';

function render(overrides: { busy?: boolean; visible?: boolean } = {}) {
  const onRebuy = vi.fn();
  const onSitOut = vi.fn();
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(MultiplayerRebuyDecisionModal, {
      busy: overrides.busy ?? false,
      onRebuy,
      onSitOut,
      visible: overrides.visible ?? true,
    }));
  });
  return { onRebuy, onSitOut, renderer: renderer! };
}

function text(renderer: ReactTestRenderer): string {
  return renderer.root.findAllByType('text' as never)
    .map((node: ReactTestInstance) => [node.props.children].flat().filter((part: unknown) => typeof part === 'string').join(''))
    .join(' ');
}

describe('multiplayer rebuy decision modal', () => {
  it('moves the required decision into a focused modal with exactly two explicit outcomes', () => {
    const { onRebuy, onSitOut, renderer } = render();
    expect(renderer.root.findAllByType('modal' as never)).toHaveLength(1);
    expect(text(renderer)).toContain('Rebuy decision');
    expect(text(renderer)).toContain('Your stack is at zero. Rebuy 4,000 chips to return, or sit out the next hand.');
    const buttons = renderer.root.findAllByType('pressable' as never);
    expect(buttons).toHaveLength(2);
    act(() => { (buttons[0]!.props.onPress as () => void)(); });
    act(() => { (buttons[1]!.props.onPress as () => void)(); });
    expect(onRebuy).toHaveBeenCalledOnce();
    expect(onSitOut).toHaveBeenCalledOnce();
  });

  it('blocks duplicate choices while the server command is pending', () => {
    const { renderer } = render({ busy: true });
    const buttons = renderer.root.findAllByType('pressable' as never);
    expect(buttons.every((button) => button.props.disabled === true)).toBe(true);
  });

  it('renders nothing outside the rebuy-pending lifecycle state', () => {
    const { renderer } = render({ visible: false });
    expect(renderer.root.findAllByType('modal' as never)).toHaveLength(0);
  });
});
