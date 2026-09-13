import { createElement, type ReactNode } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiwayPokerTableScreen } from './MultiwayPokerTableScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// expo-modules-core and RN libraries branch on the RN dev global at import
// time; vitest does not define it.
vi.hoisted(() => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = true;
});

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
    Dimensions: { get: () => ({ width: 900, height: 700, fontScale: 1 }), addEventListener: () => ({ remove: () => undefined }) },
    Modal: (props: { children?: ReactNode; visible?: boolean }) => props.visible ? createElement('modal', props, props.children) : null,
    PixelRatio: { getFontScale: () => 1 },
    Platform: { OS: 'android', select: (options: Record<string, unknown>) => options.android ?? options.ios },
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
    useWindowDimensions: () => ({ width: 900, height: 700, fontScale: 1 }),
  };
});

vi.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
// expo-sqlite's localStorage shim loads expo internals that cannot resolve
// under vitest; any storage-backed service import would trip on it.
vi.mock('expo-sqlite/localStorage/install', () => ({}));
// localization/core resolves the device locale through expo-localization,
// whose native module cannot load under vitest.
vi.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'en-US', languageCode: 'en' }],
}));
// The supabase client (pulled in through deep service imports) initializes the
// RN URL polyfill, which evaluates RN-specific globals at import time.
vi.mock('react-native-url-polyfill', () => ({
  URL: globalThis.URL,
  URLSearchParams: globalThis.URLSearchParams,
  setupURLPolyfill: () => undefined,
}));
vi.mock('react-native-url-polyfill/auto', () => ({}));
// The table orientation hook talks to the native orientation module.
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
// domain/playerProfile imports the expo-sqlite localStorage shim (mocked empty
// above), so the real module loads once that side effect is neutralized.
vi.mock('../../domain/playerProfile', async (importOriginal) => await importOriginal());
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
// playStatistics pulls the supabase hand-history services (native URL
// polyfill), and secureRandom pulls expo-crypto; the regression needs neither.
vi.mock('../../services/playStatistics', () => ({ loadPlayStatistics: async () => null }));
vi.mock('../../services/secureRandom', () => ({
  secureRandom: () => Math.random(),
  secureRandomIndex: (length: number) => Math.floor(Math.random() * length),
}));
vi.mock('./HandReplayModal', () => ({ HandReplayModal: () => null }));
vi.mock('./SessionHistoryModal', () => ({ SessionHistoryModal: () => null }));
vi.mock('../../theme', async () => {
  // Provide the full palette token set the table styles read.
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

import { clearHandPresentationCursor } from './handEndingPresentation';

const OPEN_RESULT = 'Open hand result details';
// A seat's accessibility label embeds the bubble text after the stack
// (`Mara, AI, 1,980, called 40`), so an action verb after a comma marks a
// visible action bubble on that seat.
const BUBBLE_VERB = /· (?:call|raise|bet|check|fold|all-in)/i;

function labelsOf(tree: TestRenderer.ReactTestRenderer): string[] {
  const labels: string[] = [];
  tree.root.findAll((node) => typeof node.props.accessibilityLabel === 'string')
    .forEach((node) => labels.push(node.props.accessibilityLabel as string));
  return labels;
}

function hasResultBanner(tree: TestRenderer.ReactTestRenderer): boolean {
  return labelsOf(tree).some((label) => label.includes(OPEN_RESULT));
}

function hasActionBubble(tree: TestRenderer.ReactTestRenderer): boolean {
  return labelsOf(tree).some((label) => BUBBLE_VERB.test(label));
}

function press(tree: TestRenderer.ReactTestRenderer, testID: string): boolean {
  const targets = tree.root.findAll((node) => String(node.type) === 'pressable' && node.props.testID === testID);
  const target = targets[0];
  if (!target || target.props.disabled) return false;
  act(() => { target.props.onPress(); });
  return true;
}

function mount() {
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
      tableMode: 'practice',
    }));
  });
  return tree;
}

describe('multiway table screen hand-ending order (D1 screen regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearHandPresentationCursor('test-session');
  });
  afterEach(() => {
    vi.useRealTimers();
    clearHandPresentationCursor('test-session');
  });

  it('presents the resolving action bubble before the result banner in a live hand', () => {
    const tree = mount();
    act(() => { vi.advanceTimersByTime(150); });
    expect(hasResultBanner(tree)).toBe(false);
    const events: string[] = [];
    // Drive the live hand: whenever the viewer may act, call or check; AI
    // decisions land through their own pacing timers. The hand ends when the
    // engine settles an outcome — by showdown or an uncontested fold — and
    // every AI action in between renders through a seat action bubble.
    for (let step = 0; step < 800; step += 1) {
      act(() => { vi.advanceTimersByTime(150); });
      press(tree, 'table.action.checkOrCall');
      if (hasResultBanner(tree)) {
        events.push('banner');
        break;
      }
      if (hasActionBubble(tree) && events.at(-1) !== 'bubble') events.push('bubble');
    }
    // The outcome surface never leads: an action bubble for the resolving
    // action was presented strictly before the banner ever appeared.
    expect(events).toContain('bubble');
    expect(events.indexOf('banner')).toBeGreaterThan(events.indexOf('bubble'));
    tree.unmount();
  }, 30_000);
});
