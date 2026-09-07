import { createElement, type ComponentProps, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';

import { createEmptyChampionshipProgress } from '../../../domain/poker/championship';
import { HomeScreen, type HomeContinueTarget } from './HomeScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

/**
 * Home prioritizes saved play, then an unfinished tutorial, then learning.
 * Existing entry points remain reachable after promoting the primary action.
 */

const pressables: Array<{ props: Record<string, unknown> }> = [];

vi.mock('react-native', () => {
  const host = (type: string) => (props: { children?: ReactNode }) => createElement(type, props, props.children);
  return {
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios },
    TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
    ActivityIndicator: host('activityindicator'),
    Image: host('image'),
    Pressable: (props: { children?: ReactNode }) => {
      pressables.push({ props });
      return createElement('pressable', props, props.children);
    },
    ScrollView: host('scrollview'),
    StyleSheet: { create: <T,>(styles: T): T => styles, hairlineWidth: 1, absoluteFill: {} },
    Switch: host('switch'),
    Text: host('text'),
    View: host('view'),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});
vi.mock('expo-linear-gradient', () => ({
  LinearGradient: (props: { children?: ReactNode }) => createElement('gradient', props, props.children),
}));
vi.mock('../championshipMapArtwork', () => ({ championshipMapArtwork: 1 }));
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
vi.mock('../../learn/recommendedSessionPresentation', () => ({
  learningConceptLabel: (concept: string) => concept,
}));
vi.mock('../../learn/RecommendedSessionHomeCard', () => ({
  RecommendedSessionHomeCard: () => createElement('recommendedcard'),
}));
vi.mock('../PokerToolsCard', () => ({
  PokerToolsCard: () => createElement('pokertools'),
}));

const baseProps = {
  beginnerTutorialStatus: 'not-started' as const,
  onOpenBeginnerTutorial: () => undefined,
  championshipActive: false,
  championshipProgress: createEmptyChampionshipProgress(),
  completedLessons: 0,
  dailyCaption: 'T:caption.dailyNew',
  fallbackLearningRecommendation: { description: 'd', estimatedMinutes: 5, title: 't' },
  learningGoal: 'balanced' as const,
  learningRecommendation: null,
  onAllGames: () => undefined,
  onDailyChallenge: () => undefined,
  onOpenProfile: () => undefined,
  onOpenRoster: undefined,
  onChampionship: () => undefined,
  onStartLearning: () => undefined,
  profileIdentity: { avatar: { kind: 'initials' as const, initials: 'HA' }, displayName: 'Hao' },
  recommendedSession: null,
  startRecommendedSession: () => undefined,
};

function renderHome(continueTarget: HomeContinueTarget | null, overrides: Partial<ComponentProps<typeof HomeScreen>> = {}) {
  pressables.length = 0;
  let renderer: ReturnType<typeof TestRenderer.create> | undefined;
  act(() => {
    renderer = TestRenderer.create(createElement(HomeScreen, {
      ...baseProps,
      continueTarget,
      ...overrides,
    } as never));
  });
  return renderer!;
}

describe('Home next-action priority', () => {
  it('puts the saved game before learning and discovery, even with an unfinished tutorial', () => {
    const renderer = renderHome({ description: 'Saved game', key: 'multiplayer', onPress: vi.fn() }, { beginnerTutorialStatus: 'in-progress' });
    const actions = renderer.root.findAll((node) => node.type === 'pressable' as never);
    const ids = actions.map((node) => node.props.testID).filter(Boolean);
    expect(ids.slice(0, 5)).toEqual(['home.continue', 'home.continueLearning', 'home.championship', 'home.dailyChallenge', 'home.allGames']);
    expect(ids).not.toContain('home.quickPlay');
    expect(ids).not.toContain('home.tutorial.resumePrimary');
    const ordered = renderer.root.findAll((node) => node.type === 'pokertools' as never || (node.type === 'pressable' as never && node.props.testID === 'home.championship'));
    expect(ordered.map((node) => node.type)).toEqual(['pressable', 'pokertools']);
  });

  it.each([[false, 'start'], [true, 'continue']] as const)('opens Championship with the %s active run and a %s action', (championshipActive, action) => {
    const onChampionship = vi.fn();
    const renderer = renderHome(null, { championshipActive, onChampionship });
    const entry = renderer.root.findAll((node) => node.type === 'pressable' as never && node.props.testID === 'home.championship');
    expect(entry).toHaveLength(1);
    expect(entry[0]!.props.accessibilityRole).toBe('button');
    expect(entry[0]!.props.accessibilityLabel).toContain(`T:play.championshipCard.${action}`);
    act(() => entry[0]!.props.onPress());
    expect(onChampionship).toHaveBeenCalledOnce();
  });

  it('resumes the tutorial when no saved game takes priority', () => {
    const onOpenBeginnerTutorial = vi.fn();
    const renderer = renderHome(null, { beginnerTutorialStatus: 'in-progress', onOpenBeginnerTutorial });
    const action = renderer.root.findByProps({ testID: 'home.tutorial.resumePrimary' });
    act(() => action.props.onPress());
    expect(onOpenBeginnerTutorial).toHaveBeenCalledOnce();
  });

  it.each(['completed', 'not-started'] as const)('keeps learning first for a %s tutorial', (beginnerTutorialStatus) => {
    const renderer = renderHome(null, { beginnerTutorialStatus });
    expect(renderer.root.findAll((node) => node.props.testID === 'home.tutorial.resumePrimary')).toHaveLength(0);
    const actions = renderer.root.findAll((node) => node.type === 'pressable' as never);
    expect(actions.some((node) => node.props.onPress === baseProps.onStartLearning)).toBe(true);
  });

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
