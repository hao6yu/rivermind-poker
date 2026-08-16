import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '../../components/ActionButton';
import {
  ActionBubbleText,
  useActionBubbleAnnouncement,
} from '../../components/ActionBubbleText';
import { AiAvatar } from '../../components/AiAvatar';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { OpponentReadCard } from '../../components/OpponentReadCard';
import { SuitAwareText } from '../../components/SuitAwareText';
import { decideAiAction } from '../../domain/poker/ai';
import { createFairHeadsUpDecisionState } from '../../domain/poker/fairness';
import { aiStrategyProfile, type AiDifficulty } from '../../domain/poker/aiProfiles';
import {
  analyzeCoachHand,
  buildCoachAnalysisInput,
  type VerifiedDecisionAnalysis,
  type VerifiedHandAnalysis,
} from '../../domain/poker/analysis';
import { cardLabel, seededRandom } from '../../domain/poker/cards';
import { estimateHeadsUpEquity } from '../../domain/poker/equity';
import { gradeHeadsUpHand } from '../../domain/poker/decisionGrading';
import {
  applyAction,
  createHand,
  createNextHand,
  formatAction,
  getLegalActions,
} from '../../domain/poker/engine';
import { createPersistenceClientId, handClientId } from '../../domain/poker/persistence';
import { preflopFacingFromPublicAction } from '../../domain/poker/preflopStrategy';
import type { ActionRecord, CoachFocusArea, CoachHandGrade, PlayerAction } from '../../domain/poker/types';
import {
  observePublicHeadsUpHand,
  type HeroHandObservation,
  type OpponentMemory,
} from '../../domain/poker/opponentMemory';
import {
  CASH_GAME_BIG_BLIND,
  practiceSessionOpeningButton,
  sessionCompletionReason,
  sessionStartingChips,
  summarizePracticeSession,
  type PracticeSessionConfig,
} from '../../domain/poker/session';
import type { TablePace } from '../../domain/poker/multiwaySession';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  CoachRequestError,
  requestHandReview,
  type CoachQuota,
  type CoachResult,
} from '../../services/coach';
import { recordAppDiagnostic } from '../../services/betaFeedback';
import { createFeedbackHandContext } from '../../services/betaFeedbackModel';
import { useGameplayFeedback } from '../../services/GameplayFeedbackProvider';
import {
  aiCoachRequestRequiresDisclosure,
  loadAiCoachConsent,
  saveAiCoachConsent,
  type AiCoachConsentDecision,
} from '../../services/aiCoachConsent';
import { loadRecentHandHistory, queueHandPersistence } from '../../services/handHistory';
import { isSupabaseConfigured } from '../../services/supabase';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { BetSizingModal } from './BetSizingModal';
import { AiCoachConsentPanel } from './AiCoachConsentPanel';
import { BetaFeedbackModal } from '../shell/BetaFeedbackModal';
import { buildLiveCoachRecommendation } from './liveCoach';
import { InlineCoachPanel } from './InlineCoachPanel';
import {
  aiTurnDelayMs,
  headsUpActionBubbleDurationMs,
  headsUpSeatRole,
  motionDuration,
  type HeadsUpSeatRole,
} from './gameplayPresentation';
import {
  gameplayCueForAction,
  headsUpResultKind,
  isLiveBoardReveal,
  localActionPresentationPending,
  localTableFeedbackStep,
  localTerminalResultSchedule,
  planLocalTableFeedback,
  type LocalTableActionFeedback,
} from './gameplayFeedbackEvents';
import {
  buildLocalizedHandResultSummary,
  localizedAiThinking,
  localizedCoachHeadline,
  localizedCoachAlternativeDetail,
  localizedCoachAlternativeHeadline,
  localizedCoachDetail,
  localizedCoachError,
  localizedCoachFocus,
  localizedHeadsUpActionBubble,
  localizedHeadsUpSeatAction,
  localizedStreet,
} from './localizedGameplay';
import { formatChips, formatChipsCompact } from '../../domain/poker/moneyFormat';
import { HandReplayModal } from './HandReplayModal';
import { DecisionReviewCard } from './DecisionReviewCard';
import { HandResultCard } from './HandResultCard';
import { SessionHistoryModal } from './SessionHistoryModal';
import {
  isMultiwaySessionHandRecord,
  type HeadsUpSessionHandRecord,
  type SessionHandRecord,
  summarizeSessionHandLearning,
} from './sessionModels';
import { SessionSummaryModal } from './SessionSummaryModal';
import {
  tableContinuationActions,
  type TableContinuationAction,
} from './sessionContinuation';
import { TableGuideModal } from './TableGuideModal';
import { showsExpandedPortraitCoach } from './tableResponsiveLayout';
import { secureRandom } from '../../services/secureRandom';

const defaultBigBlind = CASH_GAME_BIG_BLIND;

interface PokerTableScreenProps {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onChangeSetup: () => void;
  onCoachEnabledChange: (value: boolean) => void;
  onContinueLearning: () => void;
  onExit: () => void;
  onFocusIdentified: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onHeroHandObserved: (observation: HeroHandObservation) => void;
  onPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  opponentMemory: OpponentMemory;
  sessionConfig: PracticeSessionConfig;
  tablePace: TablePace;
}

export function PokerTableScreen({
  aiDifficulty,
  coachEnabled,
  onChangeSetup,
  onCoachEnabledChange,
  onContinueLearning,
  onExit,
  onFocusIdentified,
  onHeroHandObserved,
  onPracticeFocus,
  opponentMemory,
  sessionConfig,
  tablePace,
}: PokerTableScreenProps) {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const compactLayout = height < 700;
  const tabletLayout = width >= 700;
  const expandedPortraitCoach = showsExpandedPortraitCoach(width, height);
  const reduceMotionEnabled = useReducedMotion();
  const { play, stopGameplayFeedback } = useGameplayFeedback();
  const styles = useMemo(
    () => createStyles(palette, compactLayout, tabletLayout),
    [compactLayout, palette, tabletLayout],
  );
  const aiProfile = aiStrategyProfile(aiDifficulty);
  const actionPresentationDurationMs = headsUpActionBubbleDurationMs(tablePace);
  const [game, setGame] = useState(() => createSessionHand(sessionConfig));
  const [startingHeroStack, setStartingHeroStack] = useState(
    () => game.players.hero.stack + game.players.hero.totalCommitted,
  );
  const [sessionClientId, setSessionClientId] = useState(() => createPersistenceClientId('session'));
  const [aiThinking, setAiThinking] = useState(false);
  const [betSizingVisible, setBetSizingVisible] = useState(false);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);
  const [insightVisible, setInsightVisible] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [coachResult, setCoachResult] = useState<CoachResult | null>(null);
  const [coachError, setCoachError] = useState<CoachRequestError | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiCoachConsent, setAiCoachConsent] = useState<AiCoachConsentDecision>(loadAiCoachConsent);
  const [aiCoachConsentVisible, setAiCoachConsentVisible] = useState(false);
  const coachRequestActive = useRef(false);
  const tableTransition = useRef(new Animated.Value(1)).current;
  const boardTransition = useRef(new Animated.Value(1)).current;
  const actionTransition = useRef(new Animated.Value(1)).current;
  const reduceMotionRef = useRef(reduceMotionEnabled);
  const lastDealtHandFeedback = useRef<string | null>(null);
  const boardFeedbackSnapshot = useRef({
    boardCount: game.board.length,
    handKey: `${sessionClientId}:${game.handNumber}`,
  });
  const lastViewerTurnFeedback = useRef<string | null>(null);
  const lastResultFeedback = useRef<string | null>(null);
  const latestActionFeedback = useRef<(LocalTableActionFeedback & {
    handKey: string;
    historyLength: number;
  }) | null>(null);
  const latestBoardRevealFeedback = useRef<{ handKey: string; historyLength: number } | null>(null);
  const observedHands = useRef(new Set<string>());
  const [sessionHands, setSessionHands] = useState<SessionHandRecord[]>([]);
  const [sessionVisible, setSessionVisible] = useState(false);
  const [sessionSummaryVisible, setSessionSummaryVisible] = useState(false);
  const [replayHand, setReplayHand] = useState<SessionHandRecord | null>(null);
  const [seatActionNotice, setSeatActionNotice] = useState<{
    action: ActionRecord;
    historyIndex: number;
    key: string;
  } | null>(null);
  const observedActionHistory = useRef({ handNumber: game.handNumber, length: game.history.length });

  const legal = getLegalActions(game, 'hero');
  const heroTurn = game.toAct === 'hero';
  const displayPot = game.outcome?.potWon ?? game.pot;
  const revealVillain = Boolean(game.outcome?.showdown);
  const currentSessionHands = useMemo(
    () => sessionHands.filter((hand): hand is HeadsUpSessionHandRecord => (
      !isMultiwaySessionHandRecord(hand) && hand.clientId.startsWith(`${sessionClientId}:hand:`)
    )),
    [sessionClientId, sessionHands],
  );
  const completionReason = sessionCompletionReason(game, sessionConfig);
  const sessionComplete = completionReason !== null;
  const continuationActions = tableContinuationActions('heads_up_practice', sessionComplete);
  const sessionSummary = useMemo(
    () => summarizePracticeSession(
      currentSessionHands.map((hand) => hand.game),
      currentSessionHands.flatMap((hand) => hand.coachResult ? [hand.coachResult.review] : []),
      sessionConfig,
      game.bigBlind,
    ),
    [currentSessionHands, game.bigBlind, sessionConfig],
  );
  const sessionLearningSummary = useMemo(
    () => summarizeSessionHandLearning(currentSessionHands),
    [currentSessionHands],
  );
  const sessionFocusHand = useMemo(
    () => sessionLearningSummary.focusHandId
      ? currentSessionHands.find((hand) => hand.clientId === sessionLearningSummary.focusHandId) ?? null
      : null,
    [currentSessionHands, sessionLearningSummary.focusHandId],
  );
  const resultSummary = useMemo(
    () => buildLocalizedHandResultSummary(game, startingHeroStack, t),
    [game, startingHeroStack, t],
  );
  const actionPresentationPending = localActionPresentationPending({
    currentHandNumber: game.handNumber,
    currentHistoryLength: game.history.length,
    hasVisibleAction: seatActionNotice !== null,
    observedHandNumber: observedActionHistory.current.handNumber,
    observedHistoryLength: observedActionHistory.current.length,
  });
  const visibleResultSummary = actionPresentationPending ? null : resultSummary;
  const localReviewAnalysis = useMemo(
    () => game.outcome ? analyzeCoachHand(buildCoachAnalysisInput(game)) : null,
    [game],
  );
  const localDecisionReport = useMemo(
    () => game.outcome ? gradeHeadsUpHand(game) : null,
    [game],
  );
  const feedbackHandContext = useMemo(
    () => createFeedbackHandContext(game, sessionClientId),
    [game, sessionClientId],
  );

  useEffect(() => {
    if (sessionLearningSummary.topFocusArea) {
      onFocusIdentified(sessionLearningSummary.topFocusArea);
    }
  }, [onFocusIdentified, sessionLearningSummary.topFocusArea]);

  useEffect(() => () => {
    stopGameplayFeedback();
  }, [stopGameplayFeedback]);

  const heroEquity = useMemo(() => {
    if (!heroTurn || game.street === 'complete') return null;
    const seed = game.handNumber * 10_000 + game.history.length * 97 + game.board.length;
    return estimateHeadsUpEquity(game.players.hero.holeCards, game.board, 140, seededRandom(seed));
  }, [game.board, game.handNumber, game.history.length, game.players.hero.holeCards, game.street, heroTurn]);

  useEffect(() => {
    if (!coachEnabled) setInsightVisible(false);
  }, [coachEnabled]);

  useEffect(() => {
    if (!heroTurn || game.street === 'complete') setBetSizingVisible(false);
  }, [game.street, heroTurn]);

  useEffect(() => {
    runEntrance(tableTransition, motionDuration(260, reduceMotionRef.current));
  }, [game.handNumber, tableTransition]);

  useEffect(() => {
    const handKey = `${sessionClientId}:${game.handNumber}`;
    if (lastDealtHandFeedback.current === handKey) return;
    lastDealtHandFeedback.current = handKey;
    play('newHand', { eventId: `${handKey}:deal` });
  }, [game.handNumber, play, sessionClientId]);

  useEffect(() => {
    runEntrance(boardTransition, motionDuration(220, reduceMotionRef.current));
  }, [boardTransition, game.board.length, game.street]);

  useEffect(() => {
    runEntrance(actionTransition, motionDuration(180, reduceMotionRef.current));
  }, [actionTransition, game.history.length, game.outcome]);

  useEffect(() => {
    const observed = observedActionHistory.current;
    const sameHand = observed.handNumber === game.handNumber;
    if (!sameHand) {
      observedActionHistory.current = { handNumber: game.handNumber, length: game.history.length };
      latestActionFeedback.current = null;
      setSeatActionNotice(null);
      return undefined;
    }
    if (game.history.length <= observed.length) {
      if (game.history.length < observed.length) setSeatActionNotice(null);
      observedActionHistory.current = { handNumber: game.handNumber, length: game.history.length };
      return undefined;
    }
    const action = game.history.at(-1);
    if (!action) {
      setSeatActionNotice(null);
      return undefined;
    }
    const historyIndex = game.history.length - 1;
    observedActionHistory.current = { handNumber: game.handNumber, length: game.history.length };
    const key = `${game.handNumber}:${historyIndex}:${action.player}:${action.type}`;
    const handKey = `${sessionClientId}:${game.handNumber}`;
    const eventId = `${sessionClientId}:action:${key}`;
    const actionFeedback = {
      cue: gameplayCueForAction(action),
      eventId,
      viewerActed: action.player === 'hero',
    } satisfies LocalTableActionFeedback;
    latestActionFeedback.current = {
      ...actionFeedback,
      handKey,
      historyLength: game.history.length,
    };
    const boardRevealed = isLiveBoardReveal(boardFeedbackSnapshot.current, {
      boardCount: game.board.length,
      handKey,
    });
    const plan = planLocalTableFeedback({
      action: actionFeedback,
      boardRevealed,
      result: game.outcome ? headsUpResultKind(game.outcome.winner) : null,
      viewerTurnReady: heroTurn && game.street !== 'complete',
    });
    const actionStep = localTableFeedbackStep(plan, 'action');
    setSeatActionNotice({ action, historyIndex, key });
    play(actionFeedback.cue, {
      eventId,
      haptic: actionStep?.haptic ?? false,
    });
    const timer = setTimeout(() => {
      setSeatActionNotice((current) => current?.key === key ? null : current);
    }, actionPresentationDurationMs);
    return () => clearTimeout(timer);
  }, [actionPresentationDurationMs, game.board.length, game.handNumber, game.history.length, game.outcome, game.street, heroTurn, play, sessionClientId]);

  useEffect(() => {
    const current = {
      boardCount: game.board.length,
      handKey: `${sessionClientId}:${game.handNumber}`,
    };
    const previous = boardFeedbackSnapshot.current;
    boardFeedbackSnapshot.current = current;
    if (!isLiveBoardReveal(previous, current)) return undefined;
    latestBoardRevealFeedback.current = {
      handKey: current.handKey,
      historyLength: game.history.length,
    };
    const actionFrame = latestActionFeedback.current;
    const action = actionFrame?.handKey === current.handKey
      && actionFrame.historyLength === game.history.length
      ? actionFrame
      : null;
    const plan = planLocalTableFeedback({
      action,
      boardRevealed: true,
      result: game.outcome ? headsUpResultKind(game.outcome.winner) : null,
      viewerTurnReady: heroTurn && game.street !== 'complete',
    });
    const streetStep = localTableFeedbackStep(plan, 'streetReveal');
    if (!streetStep) return undefined;
    play('streetReveal', {
      delayMs: streetStep.delayMs,
      eventId: `${current.handKey}:board:${current.boardCount}`,
      haptic: streetStep.haptic,
    });
    return undefined;
  }, [game.board.length, game.handNumber, game.history.length, game.outcome, game.street, heroTurn, play, sessionClientId]);

  useEffect(() => {
    if (!heroTurn || game.street === 'complete') {
      lastViewerTurnFeedback.current = null;
      return;
    }
    const turnKey = `${sessionClientId}:${game.handNumber}:${game.street}:${game.history.length}:hero`;
    if (lastViewerTurnFeedback.current === turnKey) return;
    lastViewerTurnFeedback.current = turnKey;
    // The deal cue already announces a hand whose first decision belongs to
    // the viewer. Keep the opening beat clean instead of stacking two taps.
    if (game.history.length === 0) return;
    const handKey = `${sessionClientId}:${game.handNumber}`;
    const actionFrame = latestActionFeedback.current;
    const action = actionFrame?.handKey === handKey
      && actionFrame.historyLength === game.history.length
      ? actionFrame
      : null;
    const boardFrame = latestBoardRevealFeedback.current;
    const boardRevealed = boardFrame?.handKey === handKey
      && boardFrame.historyLength === game.history.length;
    const plan = planLocalTableFeedback({
      action,
      boardRevealed,
      result: game.outcome ? headsUpResultKind(game.outcome.winner) : null,
      viewerTurnReady: true,
    });
    const viewerStep = localTableFeedbackStep(plan, 'viewerTurn');
    if (!viewerStep) return;
    play('viewerTurn', {
      delayMs: viewerStep.delayMs,
      eventId: turnKey,
      haptic: viewerStep.haptic,
    });
    return undefined;
  }, [game.board.length, game.handNumber, game.history, game.outcome, game.street, heroTurn, play, sessionClientId]);

  useEffect(() => {
    reduceMotionRef.current = reduceMotionEnabled;
    if (!reduceMotionEnabled) return;
    tableTransition.stopAnimation();
    boardTransition.stopAnimation();
    actionTransition.stopAnimation();
    tableTransition.setValue(1);
    boardTransition.setValue(1);
    actionTransition.setValue(1);
  }, [actionTransition, boardTransition, reduceMotionEnabled, tableTransition]);

  useEffect(() => {
    let active = true;
    void loadRecentHandHistory().then((savedHands) => {
      if (!active) return;
      setSessionHands((current) => {
        const merged = new Map(savedHands.map((hand) => [hand.clientId, hand]));
        for (const hand of current) merged.set(hand.clientId, hand);
        return [...merged.values()].sort((left, right) => left.completedAt.localeCompare(right.completedAt));
      });
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!game.outcome) return;
    const clientId = handClientId(sessionClientId, game.handNumber);
    const completedAt = new Date().toISOString();
    setSessionHands((current) => {
      const existingIndex = current.findIndex((hand) => hand.clientId === clientId);
      const existing = existingIndex >= 0 ? current[existingIndex] : null;
      const record: SessionHandRecord = {
        clientId,
        completedAt: existing?.completedAt ?? completedAt,
        game,
        coachResult: existing?.coachResult ?? null,
      };
      if (existingIndex < 0) return [...current, record];
      return current.map((hand, index) => index === existingIndex ? record : hand);
    });
    if (!observedHands.current.has(clientId)) {
      observedHands.current.add(clientId);
      onHeroHandObserved(observePublicHeadsUpHand(game));
    }
    void queueHandPersistence({ sessionClientId, coachEnabled, completedAt, game, aiDifficulty });
  }, [aiDifficulty, coachEnabled, game, onHeroHandObserved, sessionClientId]);

  useEffect(() => {
    if (!game.outcome) return;
    const resultKey = `${sessionClientId}:${game.handNumber}:${game.outcome.winner}`;
    if (lastResultFeedback.current === resultKey) return;
    lastResultFeedback.current = resultKey;
    const handKey = `${sessionClientId}:${game.handNumber}`;
    const actionFrame = latestActionFeedback.current;
    const action = actionFrame?.handKey === handKey
      && actionFrame.historyLength === game.history.length
      ? actionFrame
      : null;
    const schedule = localTerminalResultSchedule({
      hasCommittedAction: action !== null,
      hasOutcome: true,
      presentationDurationMs: actionPresentationDurationMs,
    });
    if (!schedule) return;
    const plan = planLocalTableFeedback({
      action,
      boardRevealed: false,
      result: headsUpResultKind(game.outcome.winner),
      viewerTurnReady: false,
    });
    const resultStep = localTableFeedbackStep(plan, 'handResult');
    play({ type: 'handResult', result: headsUpResultKind(game.outcome.winner) }, {
      delayMs: schedule.delayMs,
      eventId: resultKey,
      haptic: resultStep?.haptic ?? true,
    });
  }, [actionPresentationDurationMs, game.handNumber, game.history.length, game.outcome, play, sessionClientId]);

  useEffect(() => {
    if (game.toAct !== 'villain' || game.street === 'complete') {
      setAiThinking(false);
      return undefined;
    }

    setAiThinking(true);
    const villainLegal = getLegalActions(game, 'villain');
    // Strategy and presentation timing stay separate: choose from the fair
    // decision state once, then let the resulting action shape only the pause.
    const villainAction = decideAiAction(
      createFairHeadsUpDecisionState(game, 'villain'),
      'villain',
      secureRandom,
      aiDifficulty,
      opponentMemory,
    ).action;
    const delayMs = aiTurnDelayMs({
      action: villainAction,
      baseDelayMs: aiProfile.reactionDelayMs,
      handNumber: game.handNumber,
      historyLength: game.history.length,
      legal: villainLegal,
      pace: tablePace,
      pot: game.pot,
      street: game.street,
    });
    const timer = setTimeout(() => {
      setGame((current) => {
        if (current.toAct !== 'villain' || current.street === 'complete') return current;
        return applyAction(
          current,
          'villain',
          villainAction,
        );
      });
      setAiThinking(false);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [aiDifficulty, aiProfile.reactionDelayMs, game, opponentMemory, tablePace]);

  const takeAction = (action: PlayerAction) => {
    if (!heroTurn) return;
    setBetSizingVisible(false);
    setInsightVisible(false);
    const next = applyAction(game, 'hero', action);
    setGame(next);
  };

  const requestExit = () => {
    if (game.street === 'complete') {
      onExit();
      return;
    }
    setExitConfirmVisible(true);
  };

  const confirmExit = () => {
    setExitConfirmVisible(false);
    onExit();
  };

  const dealNext = () => {
    if (sessionComplete) {
      setSessionSummaryVisible(true);
      return;
    }
    const next = createNextHand(
      game,
      secureRandom,
      sessionStartingChips(sessionConfig, game.bigBlind),
    );
    setGame(next);
    setStartingHeroStack(next.players.hero.stack + next.players.hero.totalCommitted);
    setInsightVisible(false);
    setCoachResult(null);
    setCoachError(null);
    setReviewVisible(false);
  };

  const startFreshSession = () => {
    const next = createSessionHand(sessionConfig);
    setSessionClientId(createPersistenceClientId('session'));
    setGame(next);
    setStartingHeroStack(sessionStartingChips(sessionConfig, next.bigBlind));
    setAiThinking(false);
    setBetSizingVisible(false);
    setInsightVisible(false);
    setReviewVisible(false);
    setCoachResult(null);
    setCoachError(null);
    setAiCoachConsentVisible(false);
    setSessionSummaryVisible(false);
    setReplayHand(null);
  };

  const performCoachReview = async (consent: AiCoachConsentDecision) => {
    if (!game.outcome || coachRequestActive.current) return;
    coachRequestActive.current = true;
    setCoachResult(null);
    if (!isSupabaseConfigured) {
      const configurationError = new CoachRequestError(
        'coach_configuration',
        'AI review is not connected yet. Add the Supabase project settings to enable it.',
        false,
      );
      coachRequestActive.current = false;
      setCoachLoading(false);
      setCoachError(configurationError);
      recordAppDiagnostic({ code: configurationError.code, retryable: false, source: 'coach_review' });
      return;
    }

    setCoachLoading(true);
    setCoachError(null);
    try {
      const result = await requestHandReview(
        {
          heroCards: game.players.hero.holeCards.map(cardLabel),
          board: game.board.map(cardLabel),
          street: game.street,
          actionHistory: game.history.map(formatAction),
          analysisInput: buildCoachAnalysisInput(game),
          language,
        },
        consent,
      );
      setCoachResult(result);
      const clientId = handClientId(sessionClientId, game.handNumber);
      const completedAt = sessionHands.find((hand) => hand.clientId === clientId)?.completedAt
        ?? new Date().toISOString();
      setSessionHands((current) => {
        const record: SessionHandRecord = {
          clientId,
          completedAt,
          game,
          coachResult: result,
        };
        const exists = current.some((hand) => hand.clientId === clientId);
        return exists
          ? current.map((hand) => hand.clientId === clientId ? record : hand)
          : [...current, record];
      });
      void queueHandPersistence({ sessionClientId, coachEnabled, completedAt, game, coachResult: result, aiDifficulty });
    } catch (error) {
      const requestError = error instanceof CoachRequestError
        ? error
        : new CoachRequestError(
          'coach_unavailable',
          'The AI coach could not complete this explanation. Your verified facts are ready below.',
          true,
        );
      setCoachError(requestError);
      recordAppDiagnostic({ code: requestError.code, retryable: requestError.retryable, source: 'coach_review' });
    } finally {
      coachRequestActive.current = false;
      setCoachLoading(false);
    }
  };

  const requestCoachReview = () => {
    // Configuration errors do not transmit data, so surface them without asking
    // the player to consent to a service that is not currently connected.
    if (!isSupabaseConfigured) {
      void performCoachReview(aiCoachConsent);
      return;
    }
    if (aiCoachRequestRequiresDisclosure(aiCoachConsent)) {
      setAiCoachConsentVisible(true);
      return;
    }
    void performCoachReview(aiCoachConsent);
  };

  const allowAiCoachReview = () => {
    const granted = saveAiCoachConsent('granted');
    setAiCoachConsent(granted);
    setAiCoachConsentVisible(false);
    void performCoachReview(granted);
  };

  const declineAiCoachReview = () => {
    setAiCoachConsent(saveAiCoachConsent('declined'));
    setAiCoachConsentVisible(false);
  };

  const openCoachReview = () => {
    setReviewVisible(true);
  };

  const closeCoachReview = () => {
    if (aiCoachConsentVisible) {
      setAiCoachConsentVisible(false);
      return;
    }
    setReviewVisible(false);
  };

  const continuationLabel = (action: TableContinuationAction): string => {
    if (action === 'next_hand') return t('table.nextHand');
    if (action === 'play_again') return t('summary.playAgain');
    if (action === 'replay_today') return t('summary.replayToday');
    if (action === 'view_summary') return t('table.sessionResults');
    return t('table.reviewHand');
  };

  const runContinuationAction = (action: TableContinuationAction): void => {
    if (action === 'next_hand') {
      dealNext();
      return;
    }
    if (action === 'play_again' || action === 'replay_today') {
      startFreshSession();
      return;
    }
    if (action === 'view_summary') {
      setSessionSummaryVisible(true);
      return;
    }
    openCoachReview();
  };

  const requiredEquity = legal.toCall > 0 ? legal.toCall / (game.pot + legal.toCall) : 0;
  const equityMargin = heroEquity === null ? null : heroEquity - requiredEquity;
  const insightSummary = game.street === 'preflop'
    ? t('table.insight.preflop')
    : heroEquity === null
      ? t('table.insight.calculating')
    : legal.toCall === 0
      ? t('table.insight.noCall')
      : equityMargin !== null && equityMargin >= 0.12
        ? t('table.insight.largeEdge')
        : equityMargin !== null && equityMargin >= 0
          ? t('table.insight.smallEdge')
          : t('table.insight.belowPrice');
  const coachRecommendation = buildLiveCoachRecommendation({
    bigBlind: game.bigBlind,
    board: game.board,
    cards: game.players.hero.holeCards,
    currentBet: game.currentBet,
    effectiveStack: Math.min(game.players.hero.stack, game.players.villain.stack),
    equity: heroEquity,
    initiative: game.currentBet > game.players.hero.streetBet
      ? 'opponent'
      : [...game.history].reverse().find((action) => action.type === 'raise')?.player === 'hero'
        ? 'player'
        : game.history.some((action) => action.type === 'raise') ? 'opponent' : 'none',
    legal,
    opponentCount: 1,
    playerStreetBet: game.players.hero.streetBet,
    playersBehind: game.pending.indexOf('hero') >= 0
      ? Math.max(0, game.pending.length - game.pending.indexOf('hero') - 1)
      : 0,
    pot: game.pot,
    preflop: game.street === 'preflop' ? {
      cards: game.players.hero.holeCards,
      effectiveStackBb: Math.min(
        game.players.hero.stack + game.players.hero.streetBet,
        game.players.villain.stack + game.players.villain.streetBet,
      ) / game.bigBlind,
      facing: preflopFacingFromPublicAction(game.currentBet, game.bigBlind, game.history),
      limperCount: game.history.filter((action) => action.street === 'preflop' && action.type === 'call').length,
      playerCount: 2,
      position: game.button === 'hero' ? 'BTN/SB' : 'BB',
      raiseCount: game.history.filter((action) => action.street === 'preflop' && action.type === 'raise').length,
      raiseSizeBb: game.currentBet > game.bigBlind ? game.currentBet / game.bigBlind : undefined,
    } : undefined,
    street: game.street,
  });
  const coachHeadline = localizedCoachHeadline(
    coachRecommendation,
    game.currentBet,
    legal.maxRaiseTo,
    game.bigBlind,
    legal.toCall,
    t,
  );
  const coachDetail = localizedCoachDetail(coachRecommendation, language, game.street, heroEquity, requiredEquity, 1, t);
  const coachAlternativeDetail = localizedCoachAlternativeDetail(coachRecommendation, language, t);
  const coachAlternativeHeadline = localizedCoachAlternativeHeadline(coachRecommendation, language, t);
  const villainRole = headsUpSeatRole(game.button, 'villain');
  const heroRole = headsUpSeatRole(game.button, 'hero');

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('table.leave')} accessibilityRole="button" onPress={requestExit} style={styles.iconButton}>
          <Ionicons color={palette.text} name="arrow-back" size={19} />
        </Pressable>
        <View style={styles.handMeta}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.handTitle}>
            {sessionConfig.handTarget === 'open'
              ? t('table.handTitleOpen', { difficulty: t(`difficulty.${aiDifficulty}`), hand: game.handNumber })
              : t('table.handTitleTarget', { difficulty: t(`difficulty.${aiDifficulty}`), hand: game.handNumber, target: sessionConfig.handTarget })}
          </Text>
          <Animated.View
            style={{
              opacity: boardTransition,
              transform: [{ translateY: boardTransition.interpolate({ inputRange: [0, 1], outputRange: [-3, 0] }) }],
            }}
          >
            <Text style={styles.street}>{localizedStreet(game.street, t)}</Text>
          </Animated.View>
        </View>
        <View style={styles.headerControls}>
          <Pressable accessibilityLabel={t('table.openGuide')} accessibilityRole="button" hitSlop={5} onPress={() => setGuideVisible(true)} style={styles.guideButton}>
            <Ionicons color={palette.primary} name="help-circle-outline" size={18} />
          </Pressable>
          {currentSessionHands.length > 0 ? (
            <Pressable
              accessibilityLabel={t('table.sessionHands', { count: currentSessionHands.length })}
              accessibilityRole="button"
              hitSlop={5}
              onPress={() => setSessionVisible(true)}
              style={styles.sessionButton}
            >
              <Ionicons color={palette.muted} name="stats-chart-outline" size={16} />
              <Text style={styles.sessionCount}>{currentSessionHands.length}</Text>
            </Pressable>
          ) : null}
          {compactLayout ? (
            <Pressable
              accessibilityLabel={t('table.coachA11y')}
              accessibilityRole="switch"
              accessibilityState={{ checked: coachEnabled }}
              hitSlop={5}
              onPress={() => onCoachEnabledChange(!coachEnabled)}
              style={[styles.coachIconToggle, coachEnabled && styles.coachIconToggleActive]}
            >
              <Ionicons color={coachEnabled ? palette.primary : palette.muted} name={coachEnabled ? 'sparkles' : 'sparkles-outline'} size={17} />
            </Pressable>
          ) : (
            <View style={styles.coachToggle}>
              <Text style={styles.coachToggleLabel}>{t('table.coach')}</Text>
              <Switch
                accessibilityLabel={t('table.coachA11y')}
                onValueChange={onCoachEnabledChange}
                trackColor={{ false: palette.soft, true: palette.primary }}
                thumbColor={palette.surface}
                value={coachEnabled}
              />
            </View>
          )}
        </View>
      </View>

      <Animated.View
        style={[
          styles.tableFrame,
          {
            opacity: tableTransition,
            transform: [{ scale: tableTransition.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) }],
          },
        ]}
      >
        <LinearGradient colors={[palette.table, palette.tableDeep]} style={styles.table}>
          <View style={styles.tableRing} />
          <View style={[styles.playerZone, !game.outcome && game.toAct === 'villain' && styles.playerZoneActive]}>
            <HeadsUpRoleBadge compact={compactLayout} role={villainRole} tablet={tabletLayout} />
            <View style={styles.playerHeaderRow}>
              <View style={styles.playerIdentity}>
                <AiAvatar name="Mara" size={tabletLayout ? 36 : 28} />
                <Text adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={1} style={styles.playerName}>
                  Mara · {formatChipsCompact(game.players.villain.stack)}
                </Text>
              </View>
            </View>
            <View style={styles.cardsRow}>
              {game.players.villain.holeCards.map((card) => (
                <PlayingCard card={card} compact={!tabletLayout} hidden={!revealVillain} key={cardLabel(card)} />
              ))}
            </View>
            <SeatActionBadge
              active={!game.outcome && game.toAct === 'villain'}
              activeLabel={aiThinking ? t('table.thinking') : t('table.acting')}
              compact={compactLayout}
              label={game.outcome
                ? game.players.villain.stack === 0 ? t('multiway.state.out') : null
                : game.players.villain.folded
                  ? t('multiway.state.folded')
                  : game.players.villain.allIn
                    ? [localizedHeadsUpSeatAction(game, 'villain', t), t('multiway.state.allIn')]
                      .filter(Boolean)
                      .join(' · ')
                    : localizedHeadsUpSeatAction(game, 'villain', t)}
              tablet={tabletLayout}
            />
            {seatActionNotice?.action.player === 'villain' ? (
              <HeadsUpSeatActionBubble
                action={seatActionNotice.action}
                actionKey={seatActionNotice.key}
                compact={compactLayout}
                handNumber={game.handNumber}
                historyIndex={seatActionNotice.historyIndex}
                placement="below"
                tablet={tabletLayout}
              />
            ) : null}
          </View>

          <View style={styles.centerZone}>
            <Animated.View
              style={[
                styles.potPill,
                { transform: [{ scale: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1] }) }] },
              ]}
            >
              <Text style={styles.potText}>{t('table.pot', { amount: formatChips(displayPot) })}</Text>
            </Animated.View>
            <Animated.View
              style={[
                styles.boardRow,
                {
                  opacity: boardTransition,
                  transform: [{ translateY: boardTransition.interpolate({ inputRange: [0, 1], outputRange: [-7, 0] }) }],
                },
              ]}
            >
              {Array.from({ length: 5 }, (_, index) => (
                <PlayingCard card={game.board[index]} compact={!tabletLayout} key={`board-${index}`} />
              ))}
            </Animated.View>
            {!game.outcome && (aiThinking || heroTurn) ? (
              <Animated.View
                style={[
                  styles.statusArea,
                  {
                    opacity: actionTransition,
                    transform: [{ translateY: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }],
                  },
                ]}
              >
                {aiThinking ? (
                  <View style={styles.thinkingRow}>
                    <ActivityIndicator color={palette.aqua} size="small" />
                    <Text numberOfLines={1} style={styles.statusText}>
                      {localizedAiThinking(game.street, getLegalActions(game, 'villain').toCall, t)}
                    </Text>
                  </View>
                ) : (
                  <Text numberOfLines={1} style={styles.latestActionText}>
                    {t('table.heroTurnPrompt')}
                  </Text>
                )}
              </Animated.View>
            ) : null}
          </View>

          <View style={[styles.playerZone, !game.outcome && heroTurn && styles.playerZoneActive]}>
            <HeadsUpRoleBadge compact={compactLayout} role={heroRole} tablet={tabletLayout} />
            <View style={styles.cardsRow}>
              {game.players.hero.holeCards.map((card) => (
                <PlayingCard card={card} compact={compactLayout && !tabletLayout} key={cardLabel(card)} />
              ))}
            </View>
            <View style={styles.playerHeaderRow}>
              <Text adjustsFontSizeToFit minimumFontScale={0.85} numberOfLines={1} style={styles.playerName}>
                {t('common.you')} · {formatChipsCompact(game.players.hero.stack)}
              </Text>
            </View>
            <SeatActionBadge
              active={!game.outcome && heroTurn}
              activeLabel={t('table.yourTurn')}
              compact={compactLayout}
              label={game.outcome
                ? game.players.hero.stack === 0 ? t('multiway.state.out') : null
                : game.players.hero.folded
                  ? t('multiway.state.folded')
                  : game.players.hero.allIn
                    ? [localizedHeadsUpSeatAction(game, 'hero', t), t('multiway.state.allIn')]
                      .filter(Boolean)
                      .join(' · ')
                    : localizedHeadsUpSeatAction(game, 'hero', t)}
              tablet={tabletLayout}
            />
            {seatActionNotice?.action.player === 'hero' ? (
              <HeadsUpSeatActionBubble
                action={seatActionNotice.action}
                actionKey={seatActionNotice.key}
                compact={compactLayout}
                handNumber={game.handNumber}
                historyIndex={seatActionNotice.historyIndex}
                placement="above"
                tablet={tabletLayout}
              />
            ) : null}
          </View>
        </LinearGradient>
      </Animated.View>

      {visibleResultSummary && (
        <Animated.View
          style={{
            opacity: actionTransition,
            transform: [{ translateY: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) }],
          }}
        >
          <HandResultCard summary={visibleResultSummary} tablet={tabletLayout} />
        </Animated.View>
      )}

      {coachEnabled && game.street !== 'complete' && heroTurn && (
        expandedPortraitCoach ? (
          <InlineCoachPanel
            alternativeHeadline={coachRecommendation.alternative ? coachAlternativeHeadline ?? undefined : undefined}
            detail={coachDetail}
            headline={coachHeadline}
            metrics={[
              { label: t('table.insight.rawEquity'), value: heroEquity === null ? '—' : `${Math.round(heroEquity * 100)}%` },
              { label: t('table.insight.requiredCall'), value: legal.toCall > 0 ? `${Math.round(requiredEquity * 100)}%` : t('table.insight.noBet') },
              { label: t('table.insight.costCall'), value: legal.toCall > 0 ? formatChips(legal.toCall) : '0' },
            ]}
            onPress={() => setInsightVisible(true)}
          />
        ) : (
          <View style={styles.coachBar}>
            <View style={styles.coachIcon}><Ionicons color={palette.aqua} name="sparkles-outline" size={18} /></View>
            <View style={styles.coachCopy}>
              <Text style={styles.coachTitle}>{coachHeadline}</Text>
              <Text numberOfLines={1} style={styles.coachText}>{coachDetail}</Text>
            </View>
            <Pressable accessibilityLabel={t('table.openCoachDetails')} accessibilityRole="button" onPress={() => setInsightVisible(true)} style={styles.hintButton}>
              <Ionicons color={palette.primary} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        )
      )}

      {game.street !== 'complete' ? (
        <View style={styles.actions}>
          <ActionButton disabled={!legal.canFold || !heroTurn} label={t('poker.action.fold')} onPress={() => takeAction({ type: 'fold' })} tone="danger" />
          <ActionButton
            disabled={(!legal.canCheck && !legal.canCall) || !heroTurn}
            label={legal.canCheck ? t('poker.action.check') : t('poker.action.callAmount', { amount: formatChips(legal.toCall) })}
            onPress={() => takeAction({ type: legal.canCheck ? 'check' : 'call' })}
          />
          <ActionButton
            disabled={!legal.canRaise || !heroTurn}
            label={coachEnabled && coachRecommendation.target
              ? t(game.currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChips(coachRecommendation.target) })
              : t(game.currentBet === 0 ? 'poker.action.bet' : 'poker.action.raise')}
            onPress={() => setBetSizingVisible(true)}
            tone="primary"
          />
        </View>
      ) : (
        <View style={styles.actions}>
          {[
            continuationActions.primary,
            continuationActions.secondary,
            continuationActions.tertiary,
          ].filter((action): action is TableContinuationAction => action !== null).map((action, index) => (
            <ActionButton
              disabled={actionPresentationPending}
              key={action}
              label={continuationLabel(action)}
              onPress={() => runContinuationAction(action)}
              tone={index === 0 ? 'primary' : undefined}
            />
          ))}
        </View>
      )}

      <Modal animationType={reduceMotionEnabled ? 'none' : 'fade'} onRequestClose={() => setExitConfirmVisible(false)} transparent visible={exitConfirmVisible}>
        <View style={styles.modalScrim}>
          <ModalBackdrop accessibilityLabel={t('table.keepPlaying')} onPress={() => setExitConfirmVisible(false)} />
          <View accessibilityViewIsModal style={[styles.exitSheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
            <View style={styles.exitIcon}>
              <Ionicons color={palette.danger} name="exit-outline" size={21} />
            </View>
            <View style={styles.exitCopy}>
              <Text accessibilityRole="header" style={styles.exitTitle}>{t('table.exitTitle')}</Text>
              <Text style={styles.exitDescription}>{t('table.exitDescription')}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setExitConfirmVisible(false)} style={styles.primarySheetButton}>
              <Text style={styles.primarySheetButtonText}>{t('table.keepPlaying')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={confirmExit} style={styles.leaveHandButton}>
              <Text style={styles.leaveHandButtonText}>{t('table.leaveHand')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <BetSizingModal
        bigBlind={game.bigBlind}
        currentBet={game.currentBet}
        legal={legal}
        onClose={() => setBetSizingVisible(false)}
        onConfirm={(target) => takeAction({ type: 'raise', amount: target })}
        playerStreetBet={game.players.hero.streetBet}
        pot={game.pot}
        recommendation={coachEnabled && coachRecommendation.target ? {
          detail: coachDetail,
          target: coachRecommendation.target,
        } : undefined}
        visible={betSizingVisible}
      />

      <Modal animationType={reduceMotionEnabled ? 'none' : 'fade'} onRequestClose={closeCoachReview} transparent visible={reviewVisible}>
        <View style={styles.modalScrim}>
          <ModalBackdrop accessibilityLabel={t('table.review.close')} onPress={closeCoachReview} />
          <View accessibilityViewIsModal style={[styles.reviewSheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
            {aiCoachConsentVisible ? (
              <AiCoachConsentPanel
                language={language}
                onAllow={allowAiCoachReview}
                onCancel={() => setAiCoachConsentVisible(false)}
                onDecline={declineAiCoachReview}
              />
            ) : (
              <>
                <View style={styles.reviewHeader}>
                  <View>
                    <Text style={styles.reviewEyebrow}>
                      {coachResult ? t('table.review.saved') : coachLoading ? t('table.review.reviewing') : t('table.review.learn')}
                    </Text>
                    <Text accessibilityRole="header" style={styles.reviewTitle}>{t('table.review.title')}</Text>
                  </View>
                  <Pressable accessibilityLabel={t('table.review.close')} accessibilityRole="button" onPress={closeCoachReview} style={styles.iconButton}>
                    <Ionicons color={palette.text} name="close" size={20} />
                  </Pressable>
                </View>
                {coachLoading || coachError ? (
                  localReviewAnalysis ? (
                    <PendingCoachReview
                      analysis={coachError?.analysis ?? localReviewAnalysis}
                      error={coachError}
                      loading={coachLoading}
                      onReportIssue={() => {
                        setReviewVisible(false);
                        setFeedbackVisible(true);
                      }}
                      onRetry={() => void requestCoachReview()}
                    />
                  ) : null
                ) : coachResult ? (
              <ScrollView
                contentContainerStyle={styles.reviewContent}
                showsVerticalScrollIndicator={false}
                style={styles.reviewScroll}
              >
                {localDecisionReport?.decisions.length ? (
                  <DecisionReviewCard comparison={localDecisionReport.decisions.find((decision) => decision.sequence === localDecisionReport.focusDecisionSequence) ?? localDecisionReport.decisions[0]!} />
                ) : null}
                <SuitAwareText style={styles.reviewSummary} text={coachResult.review.summary} />
                <ReviewGrade
                  focusArea={coachResult.review.focusArea}
                  grade={coachResult.review.handGrade}
                />
                <ReviewLine label={t('table.review.bestPlay')} value={coachResult.review.bestDecision} />
                <ReviewLine label={t('table.review.remember')} value={coachResult.review.keyConcept} />
                <ReviewLine label={t('table.review.practiceNext')} value={coachResult.review.practiceTip} />
                <VerifiedFactsDisclosure analysis={coachResult.analysis} />
                {coachResult.quota ? <QuotaNote context="saved" quota={coachResult.quota} /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const clientId = handClientId(sessionClientId, game.handNumber);
                    setReviewVisible(false);
                    setReplayHand({
                      clientId,
                      completedAt: sessionHands.find((hand) => hand.clientId === clientId)?.completedAt
                        ?? new Date().toISOString(),
                      game,
                      coachResult,
                    });
                  }}
                  style={styles.replaySheetButton}
                >
                  <Ionicons color={palette.primary} name="play-circle-outline" size={19} />
                  <Text style={styles.replaySheetButtonText}>
                    {coachResult.review.focusDecisionSequence > 0
                      ? t('table.review.replayDecision', { decision: coachResult.review.focusDecisionSequence })
                      : t('table.review.replayHand')}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : localDecisionReport ? (
              <ScrollView
                contentContainerStyle={styles.reviewContent}
                showsVerticalScrollIndicator={false}
                style={styles.reviewScroll}
              >
                <Text style={styles.reviewSummary}>{localDecisionReport.summary}</Text>
                {localDecisionReport.decisions.length ? (
                  <DecisionReviewCard comparison={localDecisionReport.decisions.find((decision) => decision.sequence === localDecisionReport.focusDecisionSequence) ?? localDecisionReport.decisions[0]!} />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    const clientId = handClientId(sessionClientId, game.handNumber);
                    setReviewVisible(false);
                    setReplayHand({
                      clientId,
                      completedAt: sessionHands.find((hand) => hand.clientId === clientId)?.completedAt
                        ?? new Date().toISOString(),
                      game,
                      coachResult: null,
                    });
                  }}
                  style={styles.replaySheetButton}
                >
                  <Ionicons color={palette.primary} name="play-circle-outline" size={19} />
                  <Text style={styles.replaySheetButtonText}>{t('table.review.compareEvery')}</Text>
                </Pressable>
                {coachEnabled ? (
                  <Pressable accessibilityRole="button" onPress={() => void requestCoachReview()} style={styles.primarySheetButton}>
                    <Text style={styles.primarySheetButtonText}>{t('table.review.askAi')}</Text>
                  </Pressable>
                ) : null}
                <Text style={styles.reviewValue}>{t('table.review.baselineCaveat')}</Text>
              </ScrollView>
            ) : null}
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType={reduceMotionEnabled ? 'none' : 'slide'} onRequestClose={() => setInsightVisible(false)} transparent visible={insightVisible}>
        <View style={styles.modalScrim}>
          <ModalBackdrop accessibilityLabel={t('table.insight.close')} onPress={() => setInsightVisible(false)} />
          <View accessibilityViewIsModal style={[styles.reviewSheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
            <View style={styles.reviewHeader}>
              <View>
                <Text style={styles.reviewEyebrow}>{t('table.insight.eyebrow')}</Text>
                <Text accessibilityRole="header" style={styles.reviewTitle}>{t('table.insight.title')}</Text>
              </View>
              <Pressable accessibilityLabel={t('table.insight.close')} accessibilityRole="button" onPress={() => setInsightVisible(false)} style={styles.iconButton}>
                <Ionicons color={palette.text} name="close" size={20} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.reviewContent}
              showsVerticalScrollIndicator={false}
              style={styles.reviewScroll}
            >
              <View style={styles.insightMetrics}>
                <InsightMetric label={t('table.insight.rawEquity')} value={heroEquity === null ? '—' : `${Math.round(heroEquity * 100)}%`} />
                <InsightMetric label={t('table.insight.requiredCall')} value={legal.toCall > 0 ? `${Math.round(requiredEquity * 100)}%` : t('table.insight.noBet')} />
                <InsightMetric label={t('table.insight.costCall')} value={legal.toCall > 0 ? formatChips(legal.toCall) : '0'} />
              </View>

              <View style={styles.recommendationBlock}>
                <Text style={styles.recommendationAction}>{coachHeadline}</Text>
                <Text style={styles.reviewValue}>{coachDetail}</Text>
                {language === 'en' && coachRecommendation.basis ? <Text style={styles.recommendationBasis}>{coachRecommendation.basis}</Text> : null}
              </View>

              {coachRecommendation.alternative ? (
                <View style={styles.explanationBlock}>
                  <Text style={styles.reviewLabel}>{t('table.insight.compare')}</Text>
                  <Text style={styles.alternativeAction}>{coachAlternativeHeadline}</Text>
                  <Text style={styles.reviewValue}>{coachAlternativeDetail}</Text>
                </View>
              ) : null}

              <View style={styles.explanationBlock}>
                <Text style={styles.reviewLabel}>{t('table.insight.meaning')}</Text>
                <Text style={styles.reviewValue}>{insightSummary}</Text>
              </View>
              <Text style={styles.coachFootnote}>{t('table.insight.estimateNote')}</Text>
              <OpponentReadCard memory={opponentMemory} />
              <Pressable accessibilityRole="button" onPress={() => setInsightVisible(false)} style={styles.primarySheetButton}>
                <Text style={styles.primarySheetButtonText}>{t('table.insight.backToHand')}</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <BetaFeedbackModal
        context={{
          errorCode: coachError?.code,
          retryable: coachError?.retryable,
          screen: 'coach_review',
        }}
        handContext={feedbackHandContext}
        initialCategory="coach"
        onClose={() => setFeedbackVisible(false)}
        visible={feedbackVisible}
      />

      <TableGuideModal onClose={() => setGuideVisible(false)} street={game.street} visible={guideVisible} />

      <SessionHistoryModal
        hands={currentSessionHands}
        onClose={() => setSessionVisible(false)}
        onPracticeFocus={onPracticeFocus}
        onReplay={(hand) => {
          setSessionVisible(false);
          setReplayHand(hand);
        }}
        visible={sessionVisible}
      />
      <HandReplayModal hand={replayHand} onClose={() => setReplayHand(null)} />
      <SessionSummaryModal
        bigBlind={game.bigBlind}
        complete={sessionComplete}
        config={sessionConfig}
        learningSummary={sessionLearningSummary}
        onChangeSetup={() => {
          setSessionSummaryVisible(false);
          onChangeSetup();
        }}
        onClose={() => setSessionSummaryVisible(false)}
        onContinueLearning={onContinueLearning}
        onPlayAgain={startFreshSession}
        onPracticeFocus={onPracticeFocus}
        onReviewFocusHand={sessionFocusHand ? () => {
          setSessionSummaryVisible(false);
          setReplayHand(sessionFocusHand);
        } : undefined}
        onReviewHands={() => {
          setSessionSummaryVisible(false);
          setSessionVisible(true);
        }}
        reason={completionReason}
        opponentMemory={opponentMemory}
        summary={sessionSummary}
        visible={sessionSummaryVisible}
      />
    </View>
  );
}

function HeadsUpRoleBadge({
  compact,
  role,
  tablet,
}: {
  compact: boolean;
  role: HeadsUpSeatRole;
  tablet: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, compact, tablet), [compact, palette, tablet]);
  return (
    <View
      accessibilityLabel={t(role === 'D' ? 'guide.dealer' : 'guide.bb')}
      style={styles.positionMarker}
    >
      <Text style={styles.positionMarkerText}>{role}</Text>
    </View>
  );
}

function HeadsUpSeatActionBubble({
  action,
  actionKey,
  compact,
  handNumber,
  historyIndex,
  placement,
  tablet,
}: {
  action: ActionRecord;
  actionKey: string;
  compact: boolean;
  handNumber: number;
  historyIndex: number;
  placement: 'above' | 'below';
  tablet: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette, compact, tablet), [compact, palette, tablet]);
  const progress = useRef(new Animated.Value(0)).current;
  const presentation = localizedHeadsUpActionBubble(action, historyIndex, t, handNumber);
  const actor = action.player === 'hero' ? t('common.you') : 'Mara';
  const accessibilityMessage = `${actor}. ${presentation.text}`;
  useActionBubbleAnnouncement(actionKey, accessibilityMessage);

  useEffect(() => {
    const duration = motionDuration(150, reduceMotion);
    if (duration === 0) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const animation = Animated.spring(progress, {
      damping: 16,
      mass: 0.7,
      stiffness: 220,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [actionKey, progress, reduceMotion]);

  return (
    <Animated.View
      accessibilityLabel={accessibilityMessage}
      accessibilityLiveRegion="polite"
      accessible
      pointerEvents="none"
      style={[
        styles.seatActionBubbleAnchor,
        placement === 'above' ? styles.seatActionBubbleAbove : styles.seatActionBubbleBelow,
        {
          opacity: progress,
          transform: [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [placement === 'above' ? 6 : -6, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={[
        styles.seatActionBubble,
        presentation.tone === 'fold' && styles.seatActionBubbleFold,
        presentation.tone === 'check' && styles.seatActionBubbleCheck,
        presentation.tone === 'call' && styles.seatActionBubbleCall,
        presentation.tone === 'aggressive' && styles.seatActionBubbleAggressive,
        presentation.tone === 'all-in' && styles.seatActionBubbleAllIn,
      ]}>
        <ActionBubbleText
          emphasis={presentation.emphasis}
          numberOfLines={tablet ? 2 : 3}
          style={styles.seatActionBubbleText}
          text={presentation.text}
        />
      </View>
      <View style={[
        styles.seatActionBubbleTail,
        placement === 'above' ? styles.seatActionBubbleTailBottom : styles.seatActionBubbleTailTop,
      ]} />
    </Animated.View>
  );
}

function SeatActionBadge({
  active,
  activeLabel,
  compact,
  label,
  tablet,
}: {
  active: boolean;
  activeLabel: string;
  compact: boolean;
  label: string | null;
  tablet: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, compact, tablet), [compact, palette, tablet]);
  const copy = active
    ? [label, activeLabel].filter(Boolean).join(' · ')
    : label;
  if (!copy) return <View style={styles.seatBadgeSpacer} />;
  return (
    <View style={[styles.seatBadge, active && styles.seatBadgeActive]}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[styles.seatBadgeText, active && styles.seatBadgeTextActive]}
      >
        {copy}
      </Text>
    </View>
  );
}

function createSessionHand(config: PracticeSessionConfig) {
  const startingChips = sessionStartingChips(config, defaultBigBlind);
  return createHand({
    bigBlind: defaultBigBlind,
    button: practiceSessionOpeningButton(config, secureRandom),
    smallBlind: defaultBigBlind / 2,
    heroStack: startingChips,
    random: secureRandom,
    villainStack: startingChips,
  });
}

function runEntrance(value: Animated.Value, duration: number): void {
  value.stopAnimation();
  if (duration === 0) {
    value.setValue(1);
    return;
  }
  value.setValue(0);
  Animated.timing(value, {
    duration,
    easing: Easing.out(Easing.cubic),
    toValue: 1,
    useNativeDriver: true,
  }).start();
}

function InsightMetric({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.insightMetric}>
      <Text style={styles.insightMetricLabel}>{label}</Text>
      <Text style={styles.insightMetricValue}>{value}</Text>
    </View>
  );
}

function PendingCoachReview({
  analysis,
  error,
  loading,
  onReportIssue,
  onRetry,
}: {
  analysis: VerifiedHandAnalysis;
  error: CoachRequestError | null;
  loading: boolean;
  onReportIssue: () => void;
  onRetry: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const title = loading
    ? t('table.review.aiAdding')
    : error?.code === 'daily_limit'
      ? t('table.review.dailyLimit')
      : t('table.review.unavailable');

  return (
    <ScrollView
      contentContainerStyle={styles.reviewContent}
      showsVerticalScrollIndicator={false}
      style={styles.reviewScroll}
    >
      <View style={styles.coachStatusCard}>
        <View style={styles.coachStatusHeader}>
          {loading ? (
            <ActivityIndicator color={palette.primary} />
          ) : (
            <Ionicons
              color={error?.retryable ? palette.primary : palette.muted}
              name={error?.code === 'daily_limit' ? 'time-outline' : 'cloud-offline-outline'}
              size={22}
            />
          )}
          <View style={styles.coachStatusCopy}>
            <Text style={styles.coachStatusTitle}>{title}</Text>
            <Text style={styles.connectionText}>
              {loading
                ? t('table.review.factsReady')
                : error ? localizedCoachError(error.code, t) : null}
            </Text>
          </View>
        </View>
        {error?.quota ? (
          <QuotaNote context={error.quotaRefunded ? 'refunded' : 'standard'} quota={error.quota} />
        ) : null}
        {!loading && error ? (
          <View style={styles.coachErrorActions}>
            {error.retryable ? (
              <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
                <Ionicons color={palette.primaryText} name="refresh-outline" size={17} />
                <Text style={styles.retryButtonText}>{t('table.review.tryAgain')}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={onReportIssue} style={styles.reportIssueButton}>
              <Ionicons color={palette.primary} name="flag-outline" size={16} />
              <Text style={styles.reportIssueButtonText}>{t('table.review.reportIssue')}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      <VerifiedFactsDisclosure analysis={analysis} />
    </ScrollView>
  );
}

function QuotaNote({
  context = 'standard',
  quota,
}: {
  context?: 'refunded' | 'saved' | 'standard';
  quota: CoachQuota;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const allowance = quota.remaining === 0
    ? t('table.review.quotaUnlock')
    : t('table.review.quotaRemaining', { limit: quota.limit, remaining: quota.remaining });
  const copy = context === 'saved'
    ? t('table.review.quotaSaved', { allowance })
    : context === 'refunded'
      ? t('table.review.quotaRefunded', { allowance })
      : allowance;
  return (
    <View style={styles.quotaNote}>
      <Ionicons color={palette.muted} name="sparkles-outline" size={14} />
      <Text style={styles.quotaNoteText}>{copy}</Text>
    </View>
  );
}

function VerifiedFactsDisclosure({ analysis }: { analysis: VerifiedHandAnalysis }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [expanded, setExpanded] = useState(false);
  const madeHand = analysis.finalMadeHand?.description ?? t('table.review.noMadeHand');
  const decisionCount = analysis.decisions.length;

  return (
    <View style={styles.factsDisclosure}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((current) => !current)}
        style={styles.factsDisclosureButton}
      >
        <View style={styles.factsDisclosureCopy}>
          <Text style={styles.factsDisclosureTitle}>{t('table.review.factsTitle')}</Text>
          <Text numberOfLines={1} style={styles.factsDisclosureSummary}>
            {t('table.review.factsSummary', { count: decisionCount, hand: madeHand })}
          </Text>
        </View>
        <Ionicons color={palette.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>
      {expanded ? <VerifiedFacts analysis={analysis} /> : null}
    </View>
  );
}

function humanize(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function chosenActionLabel(decision: VerifiedDecisionAnalysis, t: ReturnType<typeof useLocalization>['t']): string {
  if (decision.chosenAction === 'raise') {
    return t(decision.amountToCall > 0 ? 'poker.action.raiseTo' : 'poker.action.betAmount', { amount: formatChips(decision.chosenAmount) });
  }
  if (decision.chosenAction === 'call') return t('poker.action.callAmount', { amount: formatChips(decision.amountToCall) });
  return t(decision.chosenAction === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

function legalOptionsLabel(decision: VerifiedDecisionAnalysis, t: ReturnType<typeof useLocalization>['t']): string {
  const legal = decision.legalActions;
  const options: string[] = [];
  if (legal.canFold) options.push(t('poker.action.fold'));
  if (legal.canCheck) options.push(t('poker.action.check'));
  if (legal.canCall) options.push(t('poker.action.callAmount', { amount: formatChips(legal.toCall) }));
  if (legal.canRaise) {
    const range = legal.minRaiseTo === legal.maxRaiseTo
      ? formatChips(legal.maxRaiseTo)
      : `${formatChips(legal.minRaiseTo)}–${formatChips(legal.maxRaiseTo)}`;
    options.push(t(decision.amountToCall > 0 ? 'poker.action.raiseTo' : 'poker.action.betAmount', { amount: range }));
  }
  return options.join(' · ');
}

function drawValue(decision: VerifiedDecisionAnalysis, t: ReturnType<typeof useLocalization>['t']): string {
  if (decision.drawCompletionOuts > 0) return String(decision.drawCompletionOuts);
  if (decision.draws.some((draw) => draw.type === 'backdoor-flush')) return t('table.review.backdoor');
  return t('table.review.none');
}

function VerifiedFacts({ analysis }: { analysis: VerifiedHandAnalysis }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const boardDescription = analysis.finalBoard.length > 0
    ? analysis.finalBoard.join(' ')
    : t('table.review.noCommunity');
  const textureDescription = [
    analysis.finalBoardTexture.pairing,
    analysis.finalBoardTexture.suits,
    analysis.finalBoardTexture.connectedness,
  ].filter((value) => value !== 'none').map(humanize).join(' · ');

  return (
    <View style={styles.verifiedSection}>
      <View style={styles.verifiedSectionHeader}>
        <View style={styles.verifiedBadge}>
          <Ionicons color={palette.aqua} name="shield-checkmark-outline" size={16} />
        </View>
        <View style={styles.verifiedSectionCopy}>
          <Text style={styles.reviewLabel}>{t('table.review.verifiedHand')}</Text>
          <Text style={styles.verifiedHandName}>{analysis.finalMadeHand?.description ?? t('table.review.noMadeHand')}</Text>
        </View>
      </View>
      <SuitAwareText style={styles.verifiedBoard} text={t('table.review.board', { board: boardDescription })} />
      {textureDescription ? <Text style={styles.verifiedTexture}>{textureDescription}</Text> : null}

      <Text style={styles.reviewLabel}>{t('table.review.decisionFacts')}</Text>
      {analysis.decisions.length > 0 ? analysis.decisions.map((decision) => (
        <View key={decision.sequence} style={styles.verifiedDecision}>
          <View style={styles.verifiedDecisionHeader}>
            <View>
              <Text style={styles.verifiedDecisionStreet}>
                {t('table.review.decisionLabel', { sequence: decision.sequence, street: localizedStreet(decision.street, t) })}
              </Text>
              <Text style={styles.verifiedDecisionAction}>{chosenActionLabel(decision, t)}</Text>
            </View>
            <Ionicons
              color={decision.actionWasLegal ? palette.aqua : palette.danger}
              name={decision.actionWasLegal ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={19}
            />
          </View>
          <View style={styles.factPills}>
            <FactPill
              label={t('table.review.potOdds')}
              value={decision.requiredEquityPct === null ? t('table.review.free') : `${decision.requiredEquityPct}%`}
            />
            <FactPill label={t('table.review.drawOuts')} value={drawValue(decision, t)} />
            <FactPill
              label={t('table.review.hitNext')}
              value={decision.chanceToHitCurrentDrawOutsNextCardPct === null
                ? '—'
                : `${decision.chanceToHitCurrentDrawOutsNextCardPct}%`}
            />
            <FactPill
              label="SPR"
              value={decision.stackToPotRatio === null ? '—' : String(decision.stackToPotRatio)}
            />
          </View>
          <Text style={styles.verifiedMadeHand}>
            {decision.madeHand?.description ?? t('table.review.preflopHand')}
          </Text>
          <Text style={styles.verifiedOptions}>{t('table.review.options', { options: legalOptionsLabel(decision, t) })}</Text>
        </View>
      )) : (
        <Text style={styles.verifiedEmpty}>{t('table.review.noDecision')}</Text>
      )}
      <Text style={styles.verifiedCaveat}>
        {t('table.review.outsCaveat')}
      </Text>
    </View>
  );
}

function FactPill({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.factPill}>
      <Text style={styles.factPillValue}>{value}</Text>
      <Text style={styles.factPillLabel}>{label}</Text>
    </View>
  );
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.reviewLine}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <SuitAwareText style={styles.reviewValue} text={value} />
    </View>
  );
}

function ReviewGrade({ focusArea, grade }: { focusArea: CoachFocusArea; grade: CoachHandGrade }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const color = grade === 'strong' ? palette.aqua : grade === 'mistake' ? palette.danger : palette.primary;
  const title = t(grade === 'strong' ? 'history.gradeStrong' : grade === 'close' ? 'history.gradeClose' : 'history.gradeFocus');
  return (
    <View style={styles.reviewGrade}>
      <View style={[styles.reviewGradeIcon, { backgroundColor: palette.soft }]}>
        <Ionicons
          color={color}
          name={grade === 'strong' ? 'checkmark-circle-outline' : grade === 'close' ? 'git-compare-outline' : 'locate-outline'}
          size={19}
        />
      </View>
      <View style={styles.reviewGradeCopy}>
        <Text style={[styles.reviewGradeTitle, { color }]}>{title}</Text>
        <Text style={styles.reviewGradeFocus}>
          {localizedCoachFocus(focusArea, t)}
        </Text>
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette, compact = false, tablet = false) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: tablet ? 20 : compact ? 10 : 14, paddingTop: tablet ? 10 : compact ? 4 : 8, paddingBottom: tablet ? 10 : 6, gap: tablet ? 12 : compact ? 6 : 10 },
    header: { height: tablet ? 52 : compact ? 40 : 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: tablet ? 42 : 38, height: tablet ? 42 : 38, borderRadius: tablet ? 14 : 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    handMeta: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 3 },
    handTitle: { maxWidth: '100%', color: palette.text, fontSize: tablet ? 15 : 12, fontWeight: '700', textAlign: 'center' },
    street: { color: palette.muted, fontSize: tablet ? 12 : 10, marginTop: 2 },
    headerControls: { flexDirection: 'row', alignItems: 'center', gap: tablet ? 7 : 5 },
    sessionButton: { height: tablet ? 40 : 34, minWidth: tablet ? 50 : 42, paddingHorizontal: tablet ? 10 : 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: tablet ? 13 : 11, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    guideButton: { width: tablet ? 40 : 34, height: tablet ? 40 : 34, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 13 : 11, backgroundColor: palette.accentSoft },
    sessionCount: { color: palette.text, fontSize: tablet ? 12 : 10, fontWeight: '700' },
    coachIconToggle: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    coachIconToggleActive: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    coachToggle: { minWidth: tablet ? 92 : 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: tablet ? 5 : 3 },
    coachToggleLabel: { color: palette.muted, fontSize: tablet ? 12 : 10, fontWeight: '600' },
    tableFrame: { flex: 1, minHeight: tablet ? 470 : compact ? 300 : 390 },
    table: { flex: 1, borderRadius: tablet ? 32 : compact ? 28 : 32, borderWidth: 1, borderColor: palette.tableLine, paddingVertical: tablet ? 24 : compact ? 10 : 18, paddingHorizontal: tablet ? 18 : 12, justifyContent: 'space-between', overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 5 },
    tableRing: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderRadius: tablet ? 26 : compact ? 22 : 26, borderWidth: 1, borderColor: palette.tableLine },
    playerZone: { position: 'relative', width: tablet ? 220 : compact ? 160 : 180, alignSelf: 'center', alignItems: 'center', gap: tablet ? 6 : compact ? 2 : 4, zIndex: 2, paddingHorizontal: tablet ? 12 : 8, paddingVertical: tablet ? 8 : compact ? 4 : 5, borderRadius: tablet ? 18 : 14, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.tableDeep },
    playerZoneActive: { borderColor: palette.aqua, borderWidth: 2, backgroundColor: palette.table },
    playerName: { maxWidth: tablet ? 160 : compact ? 116 : 132, color: palette.tableText, fontSize: tablet ? 15 : compact ? 10.5 : 11.5, fontWeight: '800' },
    playerHeaderRow: { width: '100%', minHeight: tablet ? 36 : 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: tablet ? 26 : 20 },
    playerIdentity: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tablet ? 8 : 5 },
    positionMarker: { position: 'absolute', zIndex: 5, top: tablet ? 8 : compact ? 5 : 6, right: tablet ? 9 : 6, minWidth: tablet ? 32 : 24, minHeight: tablet ? 24 : 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tablet ? 7 : 5, borderRadius: tablet ? 8 : 6, borderWidth: 1, borderColor: palette.tableText, backgroundColor: palette.primary },
    positionMarkerText: { color: palette.primaryText, fontSize: tablet ? 11 : 8, fontWeight: '900', letterSpacing: 0.25 },
    cardsRow: { flexDirection: 'row', gap: tablet ? 7 : 5 },
    centerZone: { alignItems: 'center', gap: tablet ? 14 : compact ? 7 : 12, zIndex: 1 },
    potPill: { paddingHorizontal: tablet ? 14 : 11, paddingVertical: tablet ? 7 : 6, borderRadius: 10, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: tablet ? 13 : 10, fontWeight: '800' },
    boardRow: { flexDirection: 'row', gap: tablet ? 6 : 4, alignItems: 'center', justifyContent: 'center' },
    statusArea: { minHeight: tablet ? 50 : compact ? 40 : 46, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tablet ? 20 : 14, paddingVertical: tablet ? 7 : 5, borderRadius: 12, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    thinkingRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
    latestActionText: { color: palette.aqua, fontSize: tablet ? 15 : compact ? 11 : 13, lineHeight: tablet ? 20 : compact ? 15 : 18, fontWeight: '800', textAlign: 'center' },
    statusText: { color: palette.tableText, fontSize: tablet ? 12 : compact ? 9 : 10.5, lineHeight: tablet ? 17 : 14, textAlign: 'center' },
    seatBadge: { maxWidth: '100%', minHeight: tablet ? 26 : 20, justifyContent: 'center', paddingHorizontal: tablet ? 10 : 8, paddingVertical: tablet ? 4 : 3, borderRadius: tablet ? 9 : 8, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    seatBadgeActive: { backgroundColor: palette.aqua },
    seatBadgeText: { color: palette.tableText, fontSize: tablet ? 11 : 9, fontWeight: '800' },
    seatBadgeTextActive: { color: palette.background },
    seatBadgeSpacer: { height: tablet ? 26 : 20 },
    seatActionBubbleAnchor: { position: 'absolute', zIndex: 9, width: tablet ? 260 : 190, left: tablet ? -20 : compact ? -15 : -5, alignItems: 'center' },
    seatActionBubbleAbove: { bottom: '100%', marginBottom: tablet ? 8 : 5 },
    seatActionBubbleBelow: { top: '100%', marginTop: tablet ? 8 : 5 },
    seatActionBubble: { maxWidth: '100%', minHeight: tablet ? 44 : 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tablet ? 14 : 9, paddingVertical: tablet ? 8 : 6, borderRadius: tablet ? 14 : 11, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 9, elevation: 6 },
    seatActionBubbleFold: { borderColor: palette.tableLine },
    seatActionBubbleCheck: { borderColor: palette.aqua },
    seatActionBubbleCall: { borderColor: palette.primary },
    seatActionBubbleAggressive: { borderColor: palette.primary, borderWidth: 2 },
    seatActionBubbleAllIn: { borderColor: palette.danger, borderWidth: 2, shadowColor: palette.danger, shadowOpacity: 0.3 },
    seatActionBubbleText: { color: palette.text, fontSize: tablet ? 13 : 10, lineHeight: tablet ? 18 : 14, fontWeight: '600', textAlign: 'center' },
    seatActionBubbleTail: { position: 'absolute', width: tablet ? 10 : 8, height: tablet ? 10 : 8, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, transform: [{ rotate: '45deg' }] },
    seatActionBubbleTailTop: { top: tablet ? -5 : -4 },
    seatActionBubbleTailBottom: { bottom: tablet ? -5 : -4 },
    coachBar: { minHeight: compact ? 52 : 57, flexDirection: 'row', alignItems: 'center', gap: compact ? 7 : 10, paddingHorizontal: compact ? 9 : 12, paddingVertical: compact ? 6 : 7, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    coachIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.aquaSoft },
    coachCopy: { flex: 1, minWidth: 0 },
    coachTitle: { color: palette.text, fontSize: 12, fontWeight: '800' },
    coachText: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
    hintButton: { width: 36, height: 36, borderRadius: 10, backgroundColor: palette.accentSoft, alignItems: 'center', justifyContent: 'center' },
    actions: { minHeight: 50, flexDirection: 'row', gap: 7 },
    modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    reviewSheet: { maxHeight: '88%', padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 14 },
    exitSheet: { padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 13 },
    exitIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    exitCopy: { gap: 5 },
    exitTitle: { color: palette.text, fontSize: 19, lineHeight: 24, fontWeight: '700' },
    exitDescription: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    leaveHandButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.danger },
    leaveHandButtonText: { color: palette.danger, fontSize: 13, fontWeight: '700' },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reviewEyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    reviewTitle: { color: palette.text, fontSize: 18, fontWeight: '700', marginTop: 2 },
    connectionText: { color: palette.text, fontSize: 12, lineHeight: 18 },
    coachStatusCard: { gap: 13, padding: 15, borderRadius: 17, backgroundColor: palette.accentSoft },
    coachStatusHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    coachStatusCopy: { flex: 1, gap: 4 },
    coachStatusTitle: { color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    retryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: palette.primary },
    retryButtonText: { color: palette.primaryText, fontSize: 12, fontWeight: '700' },
    coachErrorActions: { flexDirection: 'row', gap: 8 },
    reportIssueButton: { flex: 1, minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    reportIssueButtonText: { color: palette.primary, fontSize: 12, fontWeight: '700' },
    quotaNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    quotaNoteText: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 14 },
    reviewScroll: { flexShrink: 1 },
    reviewContent: { gap: 13, paddingBottom: 2 },
    reviewSummary: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '600' },
    reviewLine: { gap: 4 },
    reviewLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
    reviewValue: { color: palette.text, fontSize: 13, lineHeight: 19 },
    factsDisclosure: { gap: 10 },
    factsDisclosureButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderRadius: 14, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    factsDisclosureCopy: { flex: 1, gap: 2 },
    factsDisclosureTitle: { color: palette.text, fontSize: 12, fontWeight: '700' },
    factsDisclosureSummary: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    reviewGrade: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    reviewGradeIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    reviewGradeCopy: { flex: 1, gap: 2 },
    reviewGradeTitle: { fontSize: 12, fontWeight: '700' },
    reviewGradeFocus: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    insightMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    insightMetric: { width: '48%', minHeight: 76, justifyContent: 'space-between', padding: 12, borderRadius: 14, backgroundColor: palette.soft },
    insightMetricLabel: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    insightMetricValue: { color: palette.text, fontSize: 19, fontWeight: '700', marginTop: 8 },
    recommendationBlock: { gap: 5, padding: 14, borderRadius: 16, backgroundColor: palette.aquaSoft },
    recommendationAction: { color: palette.aquaText, fontSize: 20, fontWeight: '800' },
    recommendationBasis: { color: palette.aquaText, fontSize: 9, lineHeight: 13, fontWeight: '600', opacity: 0.78, marginTop: 2 },
    alternativeAction: { color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    verifiedSection: { gap: 11, padding: 14, borderRadius: 18, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    verifiedSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    verifiedBadge: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.aquaSoft },
    verifiedSectionCopy: { flex: 1, gap: 2 },
    verifiedHandName: { color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    verifiedBoard: { color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    verifiedTexture: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    verifiedDecision: { gap: 10, padding: 12, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    verifiedDecisionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    verifiedDecisionStreet: { color: palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' },
    verifiedDecisionAction: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 2 },
    factPills: { flexDirection: 'row', gap: 6 },
    factPill: { flex: 1, minHeight: 54, justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8, borderRadius: 11, backgroundColor: palette.soft },
    factPillValue: { color: palette.text, fontSize: 13, fontWeight: '700' },
    factPillLabel: { color: palette.muted, fontSize: 8, lineHeight: 11 },
    verifiedMadeHand: { color: palette.text, fontSize: 11, lineHeight: 15 },
    verifiedOptions: { color: palette.muted, fontSize: 10, lineHeight: 15 },
    verifiedEmpty: { color: palette.muted, fontSize: 11, lineHeight: 16 },
    verifiedCaveat: { color: palette.muted, fontSize: 9, lineHeight: 13 },
    replaySheetButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: palette.accentSoft },
    replaySheetButtonText: { color: palette.primary, fontSize: 13, fontWeight: '700' },
    explanationBlock: { gap: 5 },
    coachFootnote: { color: palette.muted, fontSize: 9, lineHeight: 13, textAlign: 'center', paddingHorizontal: 10 },
    primarySheetButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary },
    primarySheetButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
