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
  const Pressable = (props: { children?: ReactNode; onPress?: () => void; style?: unknown; [key: string]: unknown }) => {
    const { children, onPress, style, ...rest } = props;
    return createElement('pressable', {
      ...rest,
      onPress,
      style: typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style,
    }, children);
  };
  const Modal = (props: { children?: ReactNode; visible?: boolean }) => props.visible
    ? createElement('modal', props, props.children)
    : null;
  return {
    AccessibilityInfo,
    Modal,
    Pressable,
    ScrollView: host('scroll-view'),
    StyleSheet: { absoluteFill: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 }, create: <T,>(styles: T): T => styles },
    Text: host('text'),
    View: host('view'),
  };
});

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: {
      border: '#ccc', danger: '#c00', muted: '#777', primary: '#55f', primaryText: '#fff',
      surface: '#111', text: '#fff',
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
      }, t: (key: Parameters<typeof core.translate>[1], values?: Parameters<typeof core.translate>[2]) => core.translate('en', key, values) }),
  };
});

import { TableActivityFeed } from './TableActivityFeed';

function renderDisclosure(): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(TableActivityFeed, {
      events: [],
      handKey: 'hand-1',
      mode: 'disclosure',
    }));
  });
  if (!renderer) throw new Error('TableActivityFeed failed to mount.');
  return renderer;
}

function renderedText(renderer: ReactTestRenderer): string {
  return renderer.root.findAllByType('text' as never)
    .map((node: ReactTestInstance) => [node.props.children].flat().filter((child: unknown) => typeof child === 'string').join(''))
    .join(' ');
}

describe('compact table feed disclosure', () => {
  it('uses one icon-sized control and opens the feed in an overlay sheet', () => {
    const renderer = renderDisclosure();
    const open = renderer.root.findByType('pressable' as never);
    expect([open.props.style].flat().filter(Boolean)).toContainEqual(expect.objectContaining({ height: 48, width: 48 }));
    expect(renderedText(renderer)).not.toContain('Table feed');
    expect(renderer.root.findAllByType('modal' as never)).toHaveLength(0);

    act(() => { (open.props.onPress as () => void)(); });
    expect(renderer.root.findAllByType('modal' as never)).toHaveLength(1);
    expect(renderedText(renderer)).toContain('Table feed');
    expect(renderedText(renderer)).toContain('Actions from this hand will appear here.');
  });

  it('accepts the taller private-table action rail contract', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(TableActivityFeed, {
        controlHeight: 50,
        events: [],
        handKey: 'private-hand',
        mode: 'disclosure',
      }));
    });
    const open = renderer!.root.findByType('pressable' as never);
    expect([open.props.style].flat().filter(Boolean)).toContainEqual(expect.objectContaining({ height: 50, width: 50 }));
  });
});
