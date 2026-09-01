import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const Text = (props: { children?: ReactNode }) => createElement('text', props, props.children);
  const Pressable = (props: { children?: ReactNode; style?: unknown; [key: string]: unknown }) => {
    const { children, style, ...rest } = props;
    return createElement('pressable', {
      ...rest,
      style: typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style,
    }, children);
  };
  return { Pressable, StyleSheet: { create: <T,>(styles: T): T => styles }, Text };
});
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../../theme', () => ({ useAppTheme: () => ({ palette: { primary: '#88f' } }) }));

import { MultiplayerSettledCountdown } from './MultiplayerSettledCountdown';

describe('multiplayer settled countdown', () => {
  it('renders the complete localized state without a one-line truncation contract', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(MultiplayerSettledCountdown, {
        busy: false,
        label: 'Countdown paused while the rebuy decision is pending',
        wide: false,
      }));
    });
    const label = renderer!.root.findByType('text' as never);
    expect(label.props.children).toBe('Countdown paused while the rebuy decision is pending');
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it('keeps the host action accessible and blocks it while busy', () => {
    const onPress = vi.fn();
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(MultiplayerSettledCountdown, {
        actionLabel: 'Resume countdown',
        busy: true,
        label: 'Countdown paused',
        onPress,
        wide: false,
      }));
    });
    const control = renderer!.root.findByType('pressable' as never);
    expect(control.props.accessibilityLabel).toBe('Countdown paused. Resume countdown');
    expect(control.props.disabled).toBe(true);
  });
});
