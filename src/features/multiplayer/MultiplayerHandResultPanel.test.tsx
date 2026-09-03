import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type { MultiplayerResultPresentation } from './multiplayerGamePresentation';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  const Pressable = (props: { children?: ReactNode; style?: unknown; [key: string]: unknown }) => {
    const { children, style, ...rest } = props;
    return createElement('pressable', {
      ...rest,
      style: typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style,
    }, children);
  };
  return {
    ActivityIndicator: host('activity-indicator'),
    Pressable,
    StyleSheet: { create: <T,>(styles: T): T => styles },
    Text: host('text'),
    View: host('view'),
  };
});
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../../localization', () => ({
  useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      },
    t: (key: string, values?: Record<string, string>) => {
      if (key === 'multiplayer.result.payout') return `${values?.amount} paid to ${values?.player}`;
      if (key === 'multiplayer.result.finalPot') return `Final pot ${values?.amount}`;
      return key;
    },
  }),
}));
vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: {
      accentSoft: '#eef',
      aqua: '#0aa',
      aquaSoft: '#dee',
      danger: '#f55',
      muted: '#777',
      primary: '#55f',
      primaryText: '#fff',
      surface: '#111',
      text: '#fff',
    },
  }),
}));
vi.mock('./MultiplayerSettledCountdown', () => ({
  MultiplayerSettledCountdown: (props: { label: string }) => createElement('countdown', props),
}));

import { MultiplayerHandResultPanel } from './MultiplayerHandResultPanel';

const result: MultiplayerResultPresentation = {
  detail: 'You win because everyone else folded.',
  headlineAmount: 952,
  payouts: [{ amount: 952, label: 'You', playerId: 'viewer' }],
  showdown: false,
  title: 'You win',
  tone: 'win',
  totalPot: 952,
};

function render(wide: boolean): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(MultiplayerHandResultPanel, {
      busy: false,
      countdownLabel: 'Next hand in 10s',
      onPress: vi.fn(),
      primaryLabel: 'Next hand',
      result,
      wide,
    }));
  });
  return renderer!;
}

describe('multiplayer hand result panel', () => {
  it('puts the compact phone continuation below the full-width summary copy', () => {
    const renderer = render(false);
    const summary = renderer.root.findByProps({ testID: 'multiplayer-result-summary' });
    const footer = renderer.root.findByProps({ testID: 'multiplayer-result-footer' });
    const button = renderer.root.findByType('pressable' as never);
    const detail = renderer.root.findAllByType('text' as never)
      .find((node) => node.props.children === result.detail);

    expect(summary.findAllByType('pressable' as never)).toHaveLength(0);
    expect(footer.findAllByType('pressable' as never)).toHaveLength(1);
    expect(button.props.accessibilityLabel).toBe('Next hand');
    expect(button.props.style).toEqual(expect.arrayContaining([
      expect.objectContaining({ minHeight: 44, minWidth: 124 }),
    ]));
    expect(detail?.props.numberOfLines).toBe(3);
    expect(renderer.root.findAllByType('text' as never).some(
      (node) => node.props.children === '952 paid to You' || node.props.children === 'Final pot 952',
    )).toBe(false);
  });

  it('keeps the continuation beside the summary on a wide table', () => {
    const renderer = render(true);
    const summary = renderer.root.findByProps({ testID: 'multiplayer-result-summary' });

    expect(summary.findAllByType('pressable' as never)).toHaveLength(1);
    expect(renderer.root.findAllByProps({ testID: 'multiplayer-result-footer' })).toHaveLength(0);
  });

  it('keeps explicit payout rows and the final pot when recipients split the awards', () => {
    const splitResult: MultiplayerResultPresentation = {
      ...result,
      headlineAmount: 600,
      payouts: [
        { amount: 600, label: 'You', playerId: 'viewer' },
        { amount: 400, label: 'Iris', playerId: 'guest' },
      ],
      title: 'You win a share',
      tone: 'split',
      totalPot: 1_000,
    };
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(createElement(MultiplayerHandResultPanel, {
        busy: false,
        result: splitResult,
        wide: false,
      }));
    });
    const text = renderer!.root.findAllByType('text' as never).map((node) => node.props.children);

    expect(text).toContain('600 paid to You');
    expect(text).toContain('400 paid to Iris');
    expect(text).toContain('Final pot 1,000');
  });
});
