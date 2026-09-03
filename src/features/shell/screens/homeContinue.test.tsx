import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { HomeScreen, type HomeContinueTarget } from './HomeScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * P18-042 — the Home Continue row renders exactly when a resumable
 * checkpoint exists, and preserves the whitespace when none does.
 */

const pressables: Array<{ props: Record<string, unknown> }> = [];

vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  return {
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
    TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
    ActivityIndicator: host('activityindicator'),
    Pressable: (props: { children?: ReactNode }) => {
      pressables.push({ props });
      return createElement('pressable', props, props.children);
    },
    ScrollView: host('scrollview'),
    StyleSheet: { create: <T,>(styles: T): T => styles, hairlineWidth: 1 },
    Switch: host('switch'),
    Text: host('text'),
    View: host('view'),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock('../../components/AvatarButton', () => ({ AvatarButton: () => null }));
vi.mock('../../components/HumanAvatar', () => ({ HumanAvatar: () => null }));
vi.mock('../../../services/avatarStorage', () => ({ getRenderableUploadedAvatar: () => null }));
vi.mock('../../../services/playerProfile', () => ({
  loadHumanAvatar: () => null,
  loadPlayerDisplayName: () => 'Hao',
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));
vi.mock('../../../services/betaFeedback', () => ({ recordAppDiagnostic: () => undefined }));
vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('../../../domain/learning/content', () => ({
  findLearningActivity: () => null,
  fundamentalsLessons: [],
  lessons: [],
  scenarioTrainer: { description: 'd', estimatedMinutes: 5, id: 'scenario', title: 'Scenario' },
}));
vi.mock('../../../services/secureRandom', () => ({
  secureRandom: () => 0.5,
}));
vi.mock('../../../localization', () => ({
  useLocalization: () => ({
    activityText: (activity: { description: string; title: string }, field: 'description' | 'title') => activity[field],
    practicePackText: (pack: { description: string; title: string }, field: 'description' | 'title') => pack[field],
    // Count-aware accessor mirroring the provider contract.
    tCount: (key: string, count: number, values?: Record<string, string | number>) => {
      let value = `T:${key}`;
      const merged = { ...values, count };
      for (const [name, replacement] of Object.entries(merged)) {
        value = value.replaceAll(`{{${name}}}`, String(replacement));
      }
      return value;
    },
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'home.continueTitle') return 'Continue playing';
      let value = `T:${key}`;
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
    palette: new Proxy({}, { get: () => '#000' }) as Record<string, string>,
    scheme: 'light' as const,
  }),
}));
vi.mock('../../learn/RecommendedSessionHomeCard', () => ({
  RecommendedSessionHomeCard: () => createElement('recommendedcard'),
}));
vi.mock('../PokerToolsCard', () => ({
  PokerToolsCard: () => createElement('pokertools'),
}));

const baseProps = {
  aiDifficulty: 'club' as const,
  completedLessons: 0,
  dailyCaption: 'T:caption.dailyNew',
  fallbackLearningRecommendation: { description: 'd', estimatedMinutes: 5, title: 't' },
  learningGoal: 'balanced' as const,
  learningRecommendation: null,
  onAllGames: () => undefined,
  onDailyChallenge: () => undefined,
  onOpenProfile: () => undefined,
  onOpenRoster: undefined,
  onQuickPlay: () => undefined,
  onStartLearning: () => undefined,
  profileIdentity: { avatar: { kind: 'initials' as const, initials: 'HA' }, displayName: 'Hao' },
  recommendedSession: null,
  startRecommendedSession: () => undefined,
};

function renderHome(continueTarget: HomeContinueTarget | null) {
  pressables.length = 0;
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(HomeScreen, {
      ...baseProps,
      continueTarget,
    } as never));
  });
  return renderer!;
}

describe('Home Continue row (P18-042)', () => {
  it('renders the one Continue row when a resumable checkpoint exists', () => {
    let pressed = false;
    const target: HomeContinueTarget = {
      description: 'Your 6-player Sit & Go, at hand 12.',
      key: 'sit_and_go',
      onPress: () => { pressed = true; },
    };
    const renderer = renderHome(target);
    const rows = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'home.continue',
    );
    expect(rows).toHaveLength(1);
    act(() => {
      rows[0]!.props.onPress();
    });
    expect(pressed).toBe(true);
  });

  it('keeps the whitespace when nothing is resumable', () => {
    const renderer = renderHome(null);
    const rows = renderer.root.findAll(
      (node) => typeof node.type === 'string' && node.props.testID === 'home.continue',
    );
    expect(rows).toHaveLength(0);
  });
});
