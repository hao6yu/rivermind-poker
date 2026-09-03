import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import type { MultiplayerSessionSummary } from '../../domain/multiplayer/contracts';
import { MultiplayerSessionSummaryModal } from './MultiplayerSessionSummaryModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  const Pressable = (props: { children?: ReactNode; [key: string]: unknown }) => (
    createElement('pressable', props, props.children)
  );
  const Modal = (props: { children?: ReactNode }) => createElement('modal', props, props.children);
  return {
    ActivityIndicator: host('activity-indicator'),
    Modal,
    Pressable,
    ScrollView: host('scroll-view'),
    StyleSheet: { create: <T,>(styles: T): T => styles, hairlineWidth: 1 },
    Text: host('text'),
    View: host('view'),
  };
});
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../../components/ModalBackdrop', () => ({ ModalBackdrop: () => null }));
vi.mock('../../components/HumanAvatar', () => ({ HumanAvatar: () => null }));
vi.mock('../../components/aiAvatarSources', () => ({ aiAvatarSources: {} }));
vi.mock('../table/useTableOrientation', () => ({
  LIVE_TABLE_SUPPORTED_ORIENTATIONS: ['portrait'],
}));

const translations: Record<string, string> = {
  'multiplayer.session.reviewHands': 'Review hands',
  'multiplayer.session.reviewHandsOne': 'Review hands · 1 decision',
  'multiplayer.session.reviewHandsCount': 'Review hands · {{count}} decisions',
};
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
    t: (key: string, values?: Record<string, string | number>) => {
      const template = translations[key] ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values?.[name] ?? `{{${name}}}`));
    },
  }),
}));
vi.mock('../../theme', () => ({
  useAppTheme: () => ({
    palette: new Proxy({}, { get: () => '#000' }) as Record<string, string>,
  }),
}));

function summaryFixture(): MultiplayerSessionSummary {
  return {
    completionReason: 'hand-limit',
    rows: [
      { delta: 120, isViewer: true, label: 'Viewer', place: 1, stack: 2_120, viewerPlayerId: 'human:viewer' },
      { delta: -120, isViewer: false, label: 'Rival', place: 2, stack: 1_880, viewerPlayerId: 'human:rival' },
    ],
  } as unknown as MultiplayerSessionSummary;
}

function renderReviewLabel(reviewDecisions: number | null | undefined): string {
  let label = '';
  let tree: ReactTestRenderer | undefined;
  act(() => {
    tree = TestRenderer.create(createElement(MultiplayerSessionSummaryModal, {
      busy: false,
      onClose: () => undefined,
      onReviewHands: () => undefined,
      reviewDecisions,
      roomId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      summary: summaryFixture(),
      visible: true,
      wide: false,
    }));
  });
  const texts: string[] = [];
  tree!.root.findAllByType('text' as never).forEach((node) => {
    const value = (node as unknown as { props: { children?: unknown } }).props.children;
    if (typeof value === 'string') texts.push(value);
  });
  label = texts.find((text) => text.startsWith('Review hands')) ?? '';
  act(() => tree!.unmount());
  return label;
}

describe('private-review discoverability entry (P18-002)', () => {
  it('shows the review entry with a review-worthy decision count once archives load', () => {
    expect(renderReviewLabel(7)).toBe('Review hands · 7 decisions');
  });

  it('uses the singular decision label for a one-decision session', () => {
    expect(renderReviewLabel(1)).toBe('Review hands · 1 decision');
  });

  it('falls back to the plain entry while the archive count is unknown', () => {
    expect(renderReviewLabel(null)).toBe('Review hands');
    expect(renderReviewLabel(undefined)).toBe('Review hands');
  });
});
