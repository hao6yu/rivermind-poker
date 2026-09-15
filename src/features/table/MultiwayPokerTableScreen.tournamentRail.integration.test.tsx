import { createElement, type ReactNode } from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiwayPokerTableScreen } from './MultiwayPokerTableScreen';

/**
 * P1 (v1.3.1 regression): on a portrait tournament table the tournament HUD
 * must render in a column stack ABOVE the [actions | feed] rail. The v1.3
 * TestFlight build nested the HUD as the first child of the row-style control
 * rail, where its `width: '100%'` host (Yoga default `flexShrink: 0`) starved
 * the `flex: 1` action rail to zero width — fold/call/raise vanished from the
 * screen exactly when it was the viewer's turn.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// expo-modules-core and RN libraries branch on the RN dev global at import
// time; vitest does not define it.
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
});

// A portrait iPhone-class window: 402×874pt keeps `compact` false and the
// activity mode at 'disclosure', the exact surface that regressed.
vi.mock('react-native', () => {
  const host = (name: string) => {
    const Component = (props: { children?: ReactNode }) => createElement(name, props, props.children);
    Component.displayName = name;
    return Component;
  };
  class AnimatedValue {
    value = 0;
    setValue(next: number) { this.value = next; }
    addListener() { return { remove: () => undefined }; }
    removeListener() { return undefined; }
    removeAllListeners() { return undefined; }
    stopAnimation() { return undefined; }
    interpolate() { return this; }
  }
  const PORTRAIT_WINDOW = { width: 402, height: 874, fontScale: 1 };
  return {
    AccessibilityInfo: { announceForAccessibilityWithOptions: () => undefined, addEventListener: () => ({ remove: () => undefined }) },
    ActivityIndicator: host('activity-indicator'),
    Animated: {
      Value: AnimatedValue,
      timing: () => ({ start: () => undefined, stop: () => undefined }),
      View: host('animated-view'),
    },
    AppState: { addEventListener: () => ({ remove: () => undefined }), currentState: 'active' },
    I18nManager: { allowRTL: false, doLeftAndRightSwapInRTL: false, isRTL: false },
    KeyboardAvoidingView: host('keyboard-avoiding-view'),
    Dimensions: { get: () => PORTRAIT_WINDOW, addEventListener: () => ({ remove: () => undefined }) },
    Modal: (props: { children?: ReactNode; visible?: boolean }) => props.visible ? createElement('modal', props, props.children) : null,
    PixelRatio: { getFontScale: () => 1 },
    Platform: { OS: 'ios', select: (options: Record<string, unknown>) => options.ios ?? options.android },
    Pressable: (props: { children?: ReactNode; onPress?: () => void; style?: unknown; [key: string]: unknown }) => {
      const { children, onPress, style, ...rest } = props;
      return createElement('pressable', {
        ...rest,
        onPress,
        style: typeof style === 'function' ? (style as (state: { pressed: boolean }) => unknown)({ pressed: false }) : style,
      }, children);
    },
    ScrollView: host('scroll-view'),
    TextInput: (props: Record<string, unknown>) => createElement('text-input', props),
    Switch: (props: Record<string, unknown>) => createElement('switch', props),
    StyleSheet: { create: <T,>(value: T): T => value, flatten: (value: unknown) => value, absoluteFill: {}, absoluteFillObject: {}, hairlineWidth: 1 },
    Text: host('text'),
    View: host('view'),
    useWindowDimensions: () => PORTRAIT_WINDOW,
  };
});

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
vi.mock('react-native-url-polyfill', () => ({
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  setupURLPolyfill: () => undefined,
}));
vi.mock('react-native-url-polyfill/auto', () => ({}));
vi.mock('expo-screen-orientation', () => ({
  OrientationLock: { PORTRAIT_UP: 'PORTRAIT_UP', LANDSCAPE: 'LANDSCAPE' },
  supportsOrientationLockAsync: async () => false,
  lockAsync: async () => undefined,
  unlockAsync: async () => undefined,
  addOrientationChangeListener: () => ({ remove: () => undefined }),
  getOrientationAsync: async () => ({ orientation: 1 }),
}));
vi.mock('../../components/aiAvatarSources', () => ({ aiAvatarSources: {} }));
vi.mock('expo-linear-gradient', () => ({ LinearGradient: (p: { children?: ReactNode }) => createElement('linear-gradient', p, p.children) }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }));
vi.mock('../../hooks/useHardwareBackConfirmation', () => ({ useHardwareBackConfirmation: () => undefined }));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../../services/GameplayFeedbackProvider', () => ({
  GameplayFeedbackProvider: (p: { children?: ReactNode }) => createElement('feedback-provider', p, p.children),
  useGameplayFeedback: () => ({ play: vi.fn(), stopGameplayFeedback: vi.fn() }),
}));
vi.mock('../../services/betaFeedback', () => ({ recordAppDiagnostic: () => undefined }));
vi.mock('../../services/playerProfile', () => ({
  loadHumanAvatar: () => null,
  loadPlayerDisplayName: () => 'You',
}));
vi.mock('../../domain/poker/persistence', () => ({
  createPersistenceClientId: () => 'test-session',
  handClientId: (session: string, hand: number) => `${session}:hand:${hand}`,
  loadRecentHandHistory: async () => [],
  queueMultiwayHandPersistence: async () => undefined,
  redactMultiwayGameForPersistence: (game: unknown) => game,
}));
vi.mock('../../services/playStatistics', () => ({ loadPlayStatistics: async () => null }));
vi.mock('../../services/secureRandom', () => ({
  secureRandom: () => Math.random(),
  secureRandomIndex: (length: number) => Math.floor(Math.random() * length),
}));
vi.mock('./HandReplayModal', () => ({ HandReplayModal: () => null }));
vi.mock('./SessionHistoryModal', () => ({ SessionHistoryModal: () => null }));
vi.mock('../../theme', async () => {
  const palette = {
    accentSoft: '#eef', aqua: '#3aa', aquaSoft: '#cde', background: '#101418', border: '#2a2f3a',
    danger: '#c0392b', muted: '#8a90a0', mutedText: '#8a90a0', primary: '#4c7dff', primaryText: '#ffffff',
    scrim: 'rgba(0,0,0,0.6)', soft: '#1a1f29', surface: '#161b24', text: '#f2f4f8',
  };
  return {
    useAppTheme: () => ({ palette }),
    ThemeProvider: (p: { children?: ReactNode }) => createElement('theme-provider', p, p.children),
  };
});
vi.mock('../../localization', async () => {
  const core = await import('../../localization/core');
  return {
    useLocalization: () => ({
      language: 'en',
      t: (key: Parameters<typeof core.translate>[1], values?: Parameters<typeof core.translate>[2]) => core.translate('en', key, values),
      tCount: (key: Parameters<typeof core.translate>[1], count: number, values?: Parameters<typeof core.translate>[2]) => core.translate('en', key, { ...values, count }),
    }),
  };
});

function flattenedStyle(node: ReactTestInstance): Record<string, unknown> {
  const style = node.props.style;
  const list = Array.isArray(style) ? style : [style];
  return Object.assign({}, ...list.filter((entry): entry is Record<string, unknown> => Boolean(entry)));
}

function findByTestID(tree: TestRenderer.ReactTestRenderer, testID: string): ReactTestInstance {
  // Both the composite (ActionButton) and its mocked host pressable carry the
  // testID; the host is the node whose style/parent chain is meaningful.
  const matches = tree.root.findAll((node) => String(node.type) === 'pressable' && node.props.testID === testID);
  expect(matches.length, `expected exactly one #${testID}`).toBe(1);
  return matches[0]!;
}

let ROOT: TestRenderer.ReactTestRenderer;

function findParent(haystack: ReactTestInstance, target: ReactTestInstance): ReactTestInstance | null {
  for (const child of haystack.children) {
    if (!(child instanceof Object && 'props' in (child as object))) continue;
    const candidate = child as ReactTestInstance;
    if (candidate === target) return haystack;
    const nested = findParent(candidate, target);
    if (nested) return nested;
  }
  return null;
}

function parentOf(target: ReactTestInstance): ReactTestInstance | null {
  return findParent(ROOT.root, target);
}

function containsNode(haystack: ReactTestInstance, target: ReactTestInstance): boolean {
  return haystack === target || findParent(haystack, target) !== null;
}

function mountTournamentPortrait() {
  let tree!: TestRenderer.ReactTestRenderer;
  const noop = () => undefined;
  act(() => {
    tree = TestRenderer.create(createElement(MultiwayPokerTableScreen, {
      aiDifficulty: 'friendly',
      coachEnabled: false,
      onChangeSetup: noop,
      onCoachEnabledChange: noop,
      onExit: noop,
      onFocusIdentified: noop,
      onHeroHandObserved: noop,
      onPracticeFocus: noop,
      opponentMemory: {} as never,
      orientation: {
        select: () => undefined,
        snapshot: { failure: null, presentation: 'idle', selected: 'portrait' },
      } as never,
      playerCount: 3,
      sessionConfig: { handTarget: 'open', startingStackBb: 100 },
      tableMode: 'sit_and_go',
    }));
  });
  ROOT = tree;
  return tree;
}

describe('portrait tournament control rail (v1.3.1 screen regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the HUD above the action row, never inside it', () => {
    const tree = mountTournamentPortrait();
    act(() => { vi.advanceTimersByTime(150); });

    const hud = findByTestID(tree, 'tournament.hud');
    const fold = findByTestID(tree, 'table.action.fold');

    // The action row exists (rendered even while another seat acts).
    expect(fold.props.disabled).toBeDefined();

    // Walk up from the fold button to the row-style control rail — past the
    // inner actions row — identified by row direction plus full rail width.
    let rail: ReactTestInstance | null = parentOf(fold);
    while (rail && !(flattenedStyle(rail).flexDirection === 'row' && flattenedStyle(rail).width === '100%')) {
      rail = parentOf(rail);
    }
    expect(rail, 'the fold button sits under the row-style control rail').not.toBeNull();
    const railStyle = flattenedStyle(rail!);
    expect(railStyle.flexDirection).toBe('row');
    expect(railStyle.width).toBe('100%');

    // Regression core: the HUD is NOT a child of that row. Pre-fix, the HUD
    // host was the rail's first row sibling, taking the full width and
    // starving the flex:1 action rail to zero visible width.
    expect(containsNode(rail!, hud), 'tournament HUD must not live inside the actions row').toBe(false);

    // The HUD sits in the full-width, non-shrinking column stack that also
    // wraps the control rail. (The mocked RN hosts duplicate each node as a
    // function-component wrapper plus a host instance, so ancestry is checked
    // by container signature rather than by a single "direct parent" node.)
    let stack: ReactTestInstance | null = parentOf(hud);
    while (stack && !(flattenedStyle(stack).width === '100%' && flattenedStyle(stack).flexShrink === 0)) {
      stack = parentOf(stack);
    }
    expect(stack, 'the HUD has a full-width non-shrinking stack ancestor').not.toBeNull();
    expect(flattenedStyle(stack!).flexDirection).not.toBe('row');
    expect(containsNode(stack!, rail!), 'the HUD stack wraps the control rail').toBe(true);

    tree.unmount();
  }, 30_000);
});
