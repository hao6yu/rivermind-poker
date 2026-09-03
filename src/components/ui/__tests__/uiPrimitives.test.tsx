import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { Banner } from '../Banner';
import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { Eyebrow } from '../Eyebrow';
import { IconButton } from '../IconButton';
import { LoadingBlock } from '../LoadingBlock';
import { ProgressBar } from '../ProgressBar';
import { SectionCard } from '../SectionCard';
import { Sheet } from '../Sheet';
import { lightPalette } from '../../../themePalette';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { __DEV__?: boolean }).__DEV__ = true;

vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) =>
    createElement(type, props, props.children);
  return {
    ActivityIndicator: (props: Record<string, unknown>) => createElement('activityindicator', props),
    Modal: ({ children }: { children?: ReactNode }) => createElement('modal', null, children),
    Pressable: (props: { children?: ReactNode }) => createElement('pressable', props, props.children),
    StyleSheet: {
      create: <T,>(styles: T): T => styles,
      absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
      hairlineWidth: 1,
    },
    Text: host('text'),
    View: host('view'),
  };
});
vi.mock('@expo/vector-icons', () => ({
  Ionicons: (props: Record<string, unknown>) => createElement('ionicons', props),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 8, left: 0, right: 0, top: 0 }),
}));
vi.mock('../../../hooks/useReducedMotion', () => ({
  useReducedMotion: () => false,
}));
vi.mock('../../../localization', () => ({
  useLocalization: () => ({
      tCount: (key: string, count: number, values?: Record<string, string | number>) => {
        let value = `T:${key}`;
        const merged = { ...values, count };
        for (const [name, replacement] of Object.entries(merged)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
        return value;
      },
    t: (key: string, values?: Record<string, string | number>) => {
      const catalog: Record<string, string> = {
        'common.close': 'Close',
      };
      let value = catalog[key] ?? key;
      if (values) {
        for (const [name, replacement] of Object.entries(values)) {
          value = value.replaceAll(`{{${name}}}`, String(replacement));
        }
      }
      return value;
    },
  }),
}));
vi.mock('../../../theme', () => ({
  useAppTheme: () => ({
    palette: lightPalette,
    scheme: 'light' as const,
  }),
}));

function render(element: React.ReactElement) {
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  act(() => {
    renderer = TestRenderer.create(element);
  });
  return renderer!;
}

function findAllByTestID(root: ReturnType<typeof TestRenderer.create>, testID: string) {
  // Host nodes only: composite components carry `testID` as their own prop.
  return root.root.findAll(
    (node) => typeof node.type === 'string' && node.props.testID === testID,
  );
}


/** Pressable style props arrive as style functions; resolve them at rest. */
function resolvedStyle(node: ReactTestInstance): unknown {
  const style: unknown = (node.props as { style?: unknown }).style;
  return typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style;
}

describe('shared UI primitives render with stable test IDs (S8/P18-047)', () => {
  it('renders the Banner with tone fill, live region, and recovery action', () => {
    let pressed = false;
    const root = render(createElement(Banner, {
      actionLabel: 'Retry',
      children: 'Avatar upload paused.',
      onAction: () => { pressed = true; },
      tone: 'attention',
    }));
    const banner = findAllByTestID(root, 'ui.banner');
    expect(banner).toHaveLength(1);
    expect(banner[0]!.props.accessibilityLiveRegion).toBe('polite');
    const bannerStyle = resolvedStyle(banner[0]!) as unknown as Array<{ backgroundColor: string }>;
    expect(bannerStyle[1]?.backgroundColor).toBe(lightPalette.amber);
    const action = findAllByTestID(root, 'ui.banner.action');
    expect(action).toHaveLength(1);
    act(() => {
      action[0]!.props.onPress();
    });
    expect(pressed).toBe(true);
  });

  it('renders the Button variants with heights from the control scale', () => {
    const root = render(createElement(Button, { label: 'Start', size: 'primary', variant: 'primary' }));
    const button = findAllByTestID(root, 'ui.button');
    expect(button).toHaveLength(1);
    expect((resolvedStyle(button[0]!) as unknown as Array<{ minHeight: number }>)[1]?.minHeight).toBe(52);
    expect(button[0]!.props.accessibilityRole).toBe('button');
  });

  it('blocks a busy Button and exposes the busy state', () => {
    const root = render(createElement(Button, { busy: true, label: 'Saving' }));
    const button = findAllByTestID(root, 'ui.button');
    expect(button[0]!.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(button[0]!.props.disabled).toBe(true);
  });

  it('renders the EmptyState with action wiring', () => {
    const root = render(createElement(EmptyState, {
      actionLabel: 'Pick a spot',
      body: 'Play a few hands and this fills in.',
      onAction: () => undefined,
      title: 'No hands yet',
    }));
    expect(findAllByTestID(root, 'ui.emptyState')).toHaveLength(1);
    expect(findAllByTestID(root, 'ui.emptyState.action')).toHaveLength(1);
  });

  it('renders the Eyebrow and SectionCard composition', () => {
    const root = render(createElement(SectionCard, {
      children: createElement(Eyebrow, { label: 'inner' }),
      eyebrow: 'This week',
      footer: null,
      title: 'Progress by spot',
    }));
    expect(findAllByTestID(root, 'ui.sectionCard')).toHaveLength(1);
    const eyebrows = findAllByTestID(root, 'ui.eyebrow');
    expect(eyebrows.length).toBeGreaterThanOrEqual(1);
  });

  it('renders the 44-point IconButton with the required label', () => {
    const root = render(createElement(IconButton, { accessibilityLabel: 'Close', name: 'close' }));
    const button = findAllByTestID(root, 'ui.iconButton');
    expect(button).toHaveLength(1);
    expect((resolvedStyle(button[0]!) as unknown as Array<{ height: number }>)[0]?.height).toBe(44);
    expect(button[0]!.props.accessibilityLabel).toBe('Close');
  });

  it('renders the LoadingBlock with its label', () => {
    const root = render(createElement(LoadingBlock, { label: 'Loading saved hands…' }));
    const block = findAllByTestID(root, 'ui.loadingBlock');
    expect(block).toHaveLength(1);
    const text = block[0]!.findAll((node) => node.type === 'text');
    expect(text.some((node) => String(node.props.children).includes('Loading saved hands'))).toBe(true);
  });

  it('clamps the ProgressBar and exposes a11y value', () => {
    const root = render(createElement(ProgressBar, { accessibilityLabel: 'Path', percent: 140 }));
    const bar = findAllByTestID(root, 'ui.progressBar');
    expect(bar).toHaveLength(1);
    expect(bar[0]!.props.accessibilityValue).toEqual({ max: 100, min: 0, now: 100 });
  });

  it('renders the Sheet with header, close, and scrim test IDs', () => {
    let closed = false;
    const root = render(createElement(Sheet, {
      children: createElement('view'),
      eyebrow: 'Profile',
      onClose: () => { closed = true; },
      title: 'Edit name',
    }));
    expect(findAllByTestID(root, 'ui.sheet')).toHaveLength(1);
    const close = findAllByTestID(root, 'ui.sheet.close');
    expect(close).toHaveLength(1);
    expect(findAllByTestID(root, 'ui.sheet.scrim')).toHaveLength(1);
    act(() => {
      close[0]!.props.onPress();
    });
    expect(closed).toBe(true);
  });

  it('hides the Sheet close control when the body owns its exit', () => {
    const root = render(createElement(Sheet, {
      children: createElement('view'),
      onClose: () => undefined,
      showClose: false,
    }));
    expect(findAllByTestID(root, 'ui.sheet.close')).toHaveLength(0);
  });
});
