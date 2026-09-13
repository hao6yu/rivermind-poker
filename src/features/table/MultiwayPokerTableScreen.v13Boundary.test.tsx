/**
 * v1.3 review regressions, kept as permanent coverage (review of 2026-09-10).
 *
 * These mount the REAL screen with the REAL poker engine and deterministic
 * initial states; native APIs and the selected AI reply are mocked. They pin:
 *
 * 1. a Championship event change starts a FRESH run (AppShell keys the table
 *    per started run) — no crash on a seat-count change, no unearned
 *    completion for a same-size event;
 * 2. the end-of-run victory overlay waits for the shared result boundary —
 *    the final AI action, the runout, and the reveal all precede it;
 * 3. the board holds its pre-runout size while the final action presents;
 * 4. continuation controls stay disabled until the result step.
 */
import { createElement, useState, type ReactNode } from 'react';
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
    Pressable: (props: { children?: ReactNode; onPress?: () => void; style?: unknown; disabled?: boolean; [key: string]: unknown }) => {
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
import { SharedTableBoard } from './SharedTableBoard';
import type { ChampionshipOutcomeMoment } from './championshipVictory';
import * as sessionDomain from '../../domain/poker/multiwaySession';
import * as tournamentDomain from '../../domain/poker/tournament';
import { applyMultiwayAction, getMultiwayLegalActions, type MultiwayHandState } from '../../domain/poker/multiway';
import { championshipEvent, type ChampionshipEventId } from '../../domain/poker/championship';
import { seededRandom } from '../../domain/poker/cards';

describe('v1.3 review regressions (Championship boundary)', () => {
  const renderers: TestRenderer.ReactTestRenderer[] = [];
  beforeEach(() => { vi.useFakeTimers(); clearHandPresentationCursor('test-session'); });
  afterEach(() => {
    act(() => { for (const renderer of renderers.splice(0)) renderer.unmount(); });
    vi.restoreAllMocks();
    vi.useRealTimers();
    clearHandPresentationCursor('test-session');
  });

  function beforeHeroVictory(count: 3 | 9 = 3): MultiwayHandState {
    for (let seed = 1; seed < 100; seed += 1) {
      let game = tournamentDomain.createSitAndGo(seededRandom(seed), count, 'standard', 'club');
      for (let i = 0; i < 10 && !game.outcome; i += 1) {
        const id = game.toAct!;
        const legal = getMultiwayLegalActions(game, id);
        const next = applyMultiwayAction(game, id, legal.canRaise ? { type: 'raise', amount: legal.maxRaiseTo } : { type: 'call' });
        if (next.outcome && tournamentDomain.sitAndGoHeroPlace(next) === 1 && id !== 'hero') return game;
        game = next;
      }
    }
    throw new Error('no hero victory seed');
  }

  function screenProps(eventId: ChampionshipEventId, onComplete: (...args: any[]) => void) {
    return {
      aiDifficulty: 'club' as const, coachEnabled: false,
      onChangeSetup: () => undefined, onCoachEnabledChange: () => undefined,
      onExit: () => undefined, onFocusIdentified: () => undefined,
      onHeroHandObserved: () => undefined, onPracticeFocus: () => undefined,
      opponentMemory: {} as never,
      orientation: { select: () => undefined, snapshot: { failure: null, presentation: 'idle', selected: 'portrait' } } as never,
      playerCount: championshipEvent(eventId).playerCount,
      sessionConfig: { handTarget: 'open' as const, startingStackBb: 100 as const },
      tableMode: 'championship' as const, championshipEvent: championshipEvent(eventId), onChampionshipComplete: onComplete,
    };
  }

  // Mirrors AppShell's P1 fix: every explicitly started run mounts the table
  // under a distinct key, so a run started while a completed table is open
  // (the Next-event map) remounts instead of re-props the finished game.
  function RunHarness({ runId, eventId, onComplete, moment }: {
    runId: number;
    eventId: ChampionshipEventId;
    onComplete: (...args: any[]) => void;
    moment?: ChampionshipOutcomeMoment | null;
  }) {
    return createElement(MultiwayPokerTableScreen, {
      key: `multiway-run-${runId}`,
      ...screenProps(eventId, onComplete),
      championshipOutcomeMoment: moment ?? null,
      onChampionshipMomentContinue: () => undefined,
    });
  }

  it('starts a fresh run when advancing to an event with a different seat count', () => {
    const before = beforeHeroVictory(3);
    const completed = applyMultiwayAction(before, before.toAct!, { type: 'call' });
    const realCreateSitAndGo = tournamentDomain.createSitAndGo;
    const createSpy = vi.spyOn(tournamentDomain, 'createSitAndGo')
      .mockReturnValueOnce(completed)
      .mockImplementation((random, playerCount, structureId, difficulty) => realCreateSitAndGo(random, playerCount, structureId, difficulty));
    const onComplete = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(createElement(RunHarness, { runId: 1, eventId: 'local_3', onComplete })); });
    renderers.push(tree);
    expect(onComplete).toHaveBeenCalledTimes(1);
    // AppShell's Next-event action: the same table slot starts the new event
    // under a fresh run id — a six-seat game replaces the completed three-seat
    // one instead of meeting it.
    act(() => { tree.update(createElement(RunHarness, { runId: 2, eventId: 'local_6', onComplete })); });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy.mock.calls[1]![1]).toBe(6);
    expect(onComplete, 'new event must be played before receiving a result').toHaveBeenCalledTimes(1);
  });

  it('starts a fresh run when advancing to a same-size event', () => {
    const before = beforeHeroVictory(9);
    const completed = applyMultiwayAction(before, before.toAct!, { type: 'call' });
    const realCreateSitAndGo = tournamentDomain.createSitAndGo;
    const createSpy = vi.spyOn(tournamentDomain, 'createSitAndGo')
      .mockReturnValueOnce(completed)
      .mockImplementation((random, playerCount, structureId, difficulty) => realCreateSitAndGo(random, playerCount, structureId, difficulty));
    const onComplete = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(createElement(RunHarness, { runId: 1, eventId: 'championship_final', onComplete })); });
    renderers.push(tree);
    expect(onComplete).toHaveBeenCalledTimes(1);
    act(() => { tree.update(createElement(RunHarness, { runId: 2, eventId: 'river_below', onComplete })); });
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(onComplete, 'the previous victory must not complete the next event').toHaveBeenCalledTimes(1);
  });

  it('waits for the final AI action before showing the Championship victory overlay', () => {
    const before = beforeHeroVictory(3);
    vi.spyOn(tournamentDomain, 'createSitAndGo').mockReturnValue(before);
    vi.spyOn(sessionDomain, 'decideSessionAiAction').mockReturnValue({ action: { type: 'call' }, estimatedEquity: 0.5 } as never);
    let completed = false;
    function ChampionshipParent(): ReturnType<typeof createElement> {
      const [moment, setMoment] = useState<ChampionshipOutcomeMoment | null>(null);
      return createElement(RunHarness, {
        runId: 1,
        eventId: 'local_3',
        moment,
        onComplete: () => {
          completed = true;
          setMoment({
            detailKey: 'championship.moment.qualifiedDetail',
            eyebrowKey: 'championship.moment.victoryEyebrow',
            kind: 'victory',
            rewardAchievement: null,
            titleKey: 'championship.moment.victoryTitle',
            unlockedEventId: null,
          });
        },
      });
    }
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(createElement(ChampionshipParent)); });
    renderers.push(tree);
    for (let i = 0; i < 200 && !completed; i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(completed).toBe(true);
    // The engine settled, but the shared boundary has not presented the final
    // action yet: bubble visible, result banner and victory overlay absent.
    expect(hasActionBubble(tree)).toBe(true);
    expect(hasResultBanner(tree)).toBe(false);
    expect(momentVisible(tree)).toBe(false);
    // The overlay appears only after the ordered sequence reaches the result.
    for (let i = 0; i < 200 && !momentVisible(tree); i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(momentVisible(tree)).toBe(true);
    expect(hasResultBanner(tree), 'the ordinary result banner shares the same boundary').toBe(true);
  });

  it('holds the board runout until the final AI action has been presented', () => {
    const before = beforeHeroVictory(3);
    vi.spyOn(tournamentDomain, 'createSitAndGo').mockReturnValue(before);
    vi.spyOn(sessionDomain, 'decideSessionAiAction').mockReturnValue({ action: { type: 'call' }, estimatedEquity: 0.5 } as never);
    const onComplete = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(createElement(RunHarness, { runId: 1, eventId: 'local_3', onComplete })); });
    renderers.push(tree);
    for (let i = 0; i < 200 && onComplete.mock.calls.length === 0; i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(hasResultBanner(tree)).toBe(false);
    expect(tree.root.findByType(SharedTableBoard).props.board).toHaveLength(before.board.length);
    for (let i = 0; i < 200 && hasResultBanner(tree) === false; i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(tree.root.findByType(SharedTableBoard).props.board).toHaveLength(5);
  });

  it('keeps continuation controls disabled until the result is presented', () => {
    const before = beforeHeroVictory(3);
    vi.spyOn(tournamentDomain, 'createSitAndGo').mockReturnValue(before);
    vi.spyOn(sessionDomain, 'decideSessionAiAction').mockReturnValue({ action: { type: 'call' }, estimatedEquity: 0.5 } as never);
    const onComplete = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(createElement(RunHarness, { runId: 1, eventId: 'local_3', onComplete })); });
    renderers.push(tree);
    for (let i = 0; i < 200 && onComplete.mock.calls.length === 0; i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const summaryButton = continuationButton(tree, 'view_summary');
    expect(summaryButton).not.toBeNull();
    expect(summaryButton!.props.disabled, 'continuation must wait for the result boundary').toBe(true);
    for (let i = 0; i < 200 && hasResultBanner(tree) === false; i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(continuationButton(tree, 'view_summary')!.props.disabled).toBe(false);
  });

  it('keeps settled elimination labels hidden during the final action', () => {
    // v1.3 follow-up review: seat state is part of the ordered presentation —
    // while the final action is presented and the result banner is still
    // hidden, the just-settled seats must keep their live state (all-in/last
    // action), not the settled "Out" label.
    const before = beforeHeroVictory(3);
    vi.spyOn(tournamentDomain, 'createSitAndGo').mockReturnValue(before);
    vi.spyOn(sessionDomain, 'decideSessionAiAction').mockReturnValue({ action: { type: 'call' }, estimatedEquity: 0.5 } as never);
    const onComplete = vi.fn();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => { tree = TestRenderer.create(createElement(RunHarness, { runId: 1, eventId: 'local_3', onComplete })); });
    renderers.push(tree);
    for (let i = 0; i < 200 && onComplete.mock.calls.length === 0; i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(hasResultBanner(tree)).toBe(false);
    expect(hasActionBubble(tree)).toBe(true);
    const isOutText = (node: { type: unknown; props: { children?: unknown } }): boolean => {
      if (String(node.type) !== 'text') return false;
      const children = node.props.children;
      return children === 'Out' || (Array.isArray(children) && children.includes('Out'));
    };
    const outLabels = tree.root.findAll(isOutText);
    expect(outLabels, 'settled elimination labels must wait for the result boundary').toHaveLength(0);
    // After the result is presented the settled state is legitimate.
    for (let i = 0; i < 200 && hasResultBanner(tree) === false; i += 1) act(() => { vi.advanceTimersByTime(50); });
    expect(hasResultBanner(tree)).toBe(true);
  });
});

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

function momentVisible(tree: TestRenderer.ReactTestRenderer): boolean {
  return tree.root.findAllByProps({ testID: 'championship.moment' }).length > 0;
}

function continuationButton(tree: TestRenderer.ReactTestRenderer, action: string) {
  const targets = tree.root.findAll((node) => String(node.type) === 'pressable' && node.props.testID === `table.continue.${action}`);
  return targets[0] ?? null;
}
