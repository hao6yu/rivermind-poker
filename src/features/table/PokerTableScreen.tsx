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
import type { CoachFocusArea, CoachHandGrade, PlayerAction } from '../../domain/poker/types';
import {
  observePublicHeadsUpHand,
  type HeroHandObservation,
  type OpponentMemory,
} from '../../domain/poker/opponentMemory';
import {
  sessionCompletionReason,
  sessionStartingChips,
  summarizePracticeSession,
  type PracticeSessionConfig,
} from '../../domain/poker/session';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import {
  CoachRequestError,
  requestHandReview,
  type CoachQuota,
  type CoachResult,
} from '../../services/coach';
import { recordAppDiagnostic } from '../../services/betaFeedback';
import { createFeedbackHandContext } from '../../services/betaFeedbackModel';
import { playGameplayHaptic } from '../../services/gameplayHaptics';
import { loadRecentHandHistory, queueHandPersistence } from '../../services/handHistory';
import { isSupabaseConfigured } from '../../services/supabase';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { BetSizingModal } from './BetSizingModal';
import { BetaFeedbackModal } from '../shell/BetaFeedbackModal';
import { buildLiveCoachRecommendation } from './liveCoach';
import {
  aiTurnDelayMs,
  hapticCueForOutcome,
  hapticCueForPlayerAction,
  motionDuration,
} from './gameplayPresentation';
import {
  buildLocalizedHandResultSummary,
  localizedAiThinking,
  localizedCoachHeadline,
  localizedCoachAlternativeDetail,
  localizedCoachAlternativeHeadline,
  localizedCoachDetail,
  localizedCoachError,
  localizedCoachFocus,
  localizedLatestAction,
  localizedStreet,
} from './localizedGameplay';
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
import { TableGuideModal } from './TableGuideModal';
import { secureRandom } from '../../services/secureRandom';

const defaultBigBlind = 20;

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
}: PokerTableScreenProps) {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compactLayout = height < 700;
  const reduceMotionEnabled = useReducedMotion();
  const styles = useMemo(() => createStyles(palette, compactLayout), [compactLayout, palette]);
  const aiProfile = aiStrategyProfile(aiDifficulty);
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
  const coachRequestActive = useRef(false);
  const tableTransition = useRef(new Animated.Value(1)).current;
  const boardTransition = useRef(new Animated.Value(1)).current;
  const actionTransition = useRef(new Animated.Value(1)).current;
  const reduceMotionRef = useRef(reduceMotionEnabled);
  const lastResultHaptic = useRef<string | null>(null);
  const observedHands = useRef(new Set<string>());
  const [sessionHands, setSessionHands] = useState<SessionHandRecord[]>([]);
  const [sessionVisible, setSessionVisible] = useState(false);
  const [sessionSummaryVisible, setSessionSummaryVisible] = useState(false);
  const [replayHand, setReplayHand] = useState<SessionHandRecord | null>(null);

  const legal = getLegalActions(game, 'hero');
  const heroTurn = game.toAct === 'hero';
  const displayPot = game.outcome?.potWon ?? game.pot;
  const revealVillain = Boolean(game.outcome?.showdown);
  const latestAction = game.history.length > 0 ? game.history[game.history.length - 1] : null;
  const currentSessionHands = useMemo(
    () => sessionHands.filter((hand): hand is HeadsUpSessionHandRecord => (
      !isMultiwaySessionHandRecord(hand) && hand.clientId.startsWith(`${sessionClientId}:hand:`)
    )),
    [sessionClientId, sessionHands],
  );
  const completionReason = sessionCompletionReason(game, sessionConfig);
  const sessionComplete = completionReason !== null;
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
  const resultSummary = useMemo(
    () => buildLocalizedHandResultSummary(game, startingHeroStack, t),
    [game, startingHeroStack, t],
  );
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
    runEntrance(boardTransition, motionDuration(220, reduceMotionRef.current));
  }, [boardTransition, game.board.length, game.street]);

  useEffect(() => {
    runEntrance(actionTransition, motionDuration(180, reduceMotionRef.current));
  }, [actionTransition, game.history.length, game.outcome]);

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
    if (lastResultHaptic.current === resultKey) return;
    lastResultHaptic.current = resultKey;
    playGameplayHaptic(hapticCueForOutcome(game.outcome.winner));
  }, [game.handNumber, game.outcome, sessionClientId]);

  useEffect(() => {
    if (game.toAct !== 'villain' || game.street === 'complete') {
      setAiThinking(false);
      return undefined;
    }

    setAiThinking(true);
    const villainLegal = getLegalActions(game, 'villain');
    const delayMs = aiTurnDelayMs({
      baseDelayMs: aiProfile.reactionDelayMs,
      handNumber: game.handNumber,
      historyLength: game.history.length,
      legal: villainLegal,
      pot: game.pot,
      street: game.street,
    });
    const timer = setTimeout(() => {
      setGame((current) => {
        if (current.toAct !== 'villain' || current.street === 'complete') return current;
        return applyAction(
          current,
          'villain',
          decideAiAction(createFairHeadsUpDecisionState(current, 'villain'), 'villain', secureRandom, aiDifficulty, opponentMemory).action,
        );
      });
      setAiThinking(false);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [aiDifficulty, aiProfile.reactionDelayMs, game, opponentMemory]);

  const takeAction = (action: PlayerAction) => {
    if (!heroTurn) return;
    setBetSizingVisible(false);
    setInsightVisible(false);
    const next = applyAction(game, 'hero', action);
    if (!next.outcome) playGameplayHaptic(hapticCueForPlayerAction(action));
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
    playGameplayHaptic('selection');
    const next = createNextHand(game, secureRandom);
    setGame(next);
    setStartingHeroStack(next.players.hero.stack + next.players.hero.totalCommitted);
    setInsightVisible(false);
    setCoachResult(null);
    setCoachError(null);
    setReviewVisible(false);
  };

  const startFreshSession = () => {
    playGameplayHaptic('selection');
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
    setSessionSummaryVisible(false);
    setReplayHand(null);
  };

  const requestCoachReview = async () => {
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
      const result = await requestHandReview({
        heroCards: game.players.hero.holeCards.map(cardLabel),
        board: game.board.map(cardLabel),
        street: game.street,
        actionHistory: game.history.map(formatAction),
        analysisInput: buildCoachAnalysisInput(game),
        language,
      });
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

  const openCoachReview = () => {
    setReviewVisible(true);
  };

  const requiredEquity = legal.toCall > 0 ? legal.toCall / (game.pot + legal.toCall) : 0;
  const equityMargin = heroEquity === null ? null : heroEquity - requiredEquity;
  const chipsToBb = (chips: number) => Math.round((chips / game.bigBlind) * 10) / 10;
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
  const villainStreetAction = [...game.history].reverse().find((action) => (
    action.player === 'villain' && action.street === game.street
  ));
  const heroStreetAction = [...game.history].reverse().find((action) => (
    action.player === 'hero' && action.street === game.street
  ));

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
          <Pressable accessibilityLabel={t('table.openGuide')} accessibilityRole="button" onPress={() => setGuideVisible(true)} style={styles.guideButton}>
            <Ionicons color={palette.primary} name="help-circle-outline" size={18} />
          </Pressable>
          <Pressable
            accessibilityLabel={t('table.sessionHands', { count: currentSessionHands.length })}
            accessibilityRole="button"
            onPress={() => setSessionVisible(true)}
            style={styles.sessionButton}
          >
            <Ionicons color={palette.muted} name="stats-chart-outline" size={16} />
            <Text style={styles.sessionCount}>{currentSessionHands.length}</Text>
          </Pressable>
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
          <View style={[styles.playerZone, game.toAct === 'villain' && styles.playerZoneActive]}>
            <View style={styles.playerHeaderRow}>
              <View style={styles.playerIdentity}>
                <AiAvatar name="Mara" size={22} />
                <Text style={styles.playerName}>Mara · {formatChipAmount(game.players.villain.stack)}</Text>
              </View>
              <Text style={styles.positionMarker}>{game.button === 'villain' ? 'D · SB' : 'BB'}</Text>
            </View>
            <View style={styles.cardsRow}>
              {game.players.villain.holeCards.map((card) => (
                <PlayingCard card={card} compact hidden={!revealVillain} key={cardLabel(card)} />
              ))}
            </View>
            <SeatActionBadge
              active={game.toAct === 'villain'}
              activeLabel={t('table.acting')}
              label={aiThinking ? t('table.thinking') : villainStreetAction ? compactSeatAction(villainStreetAction.type, villainStreetAction.amount, villainStreetAction.decisionContext.currentBet, t) : null}
            />
          </View>

          <View style={styles.centerZone}>
            <Animated.View
              style={[
                styles.potPill,
                { transform: [{ scale: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [1.05, 1] }) }] },
              ]}
            >
              <Text style={styles.potText}>{t('table.pot', { amount: formatChipAmount(displayPot) })}</Text>
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
                <PlayingCard card={game.board[index]} compact key={`board-${index}`} />
              ))}
            </Animated.View>
            <Animated.View
              accessibilityLiveRegion="polite"
              style={[
                styles.statusArea,
                {
                  opacity: actionTransition,
                  transform: [{ translateY: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }],
                },
              ]}
            >
              <Text style={styles.statusEyebrow}>{game.outcome ? t('table.result') : latestAction ? t('table.justHappened') : t('table.startingPosition')}</Text>
              <Text numberOfLines={2} style={styles.latestActionText}>
                {game.outcome
                  ? t('table.handComplete')
                  : latestAction
                    ? localizedLatestAction(latestAction, game.bigBlind, t)
                    : t('table.hasButton', { player: game.button === 'hero' ? t('common.you') : 'Mara' })}
              </Text>
              {!game.outcome && (
                aiThinking ? (
                  <View style={styles.thinkingRow}>
                    <ActivityIndicator color={palette.aqua} size="small" />
                    <Text style={styles.statusText}>
                      {localizedAiThinking(game.street, getLegalActions(game, 'villain').toCall, t)}
                    </Text>
                  </View>
                ) : (
                  <Text numberOfLines={1} style={styles.statusText}>
                    {heroTurn ? t('table.heroTurnPrompt') : t('table.waitingFor', { player: 'Mara' })}
                  </Text>
                )
              )}
            </Animated.View>
          </View>

          <View style={[styles.playerZone, heroTurn && styles.playerZoneActive]}>
            <View style={styles.cardsRow}>
              {game.players.hero.holeCards.map((card) => (
                <PlayingCard card={card} compact={compactLayout} key={cardLabel(card)} />
              ))}
            </View>
            <View style={styles.playerHeaderRow}>
              <Text style={styles.playerName}>{t('common.you')} · {formatChipAmount(game.players.hero.stack)}</Text>
              <Text style={styles.positionMarker}>{game.button === 'hero' ? 'D · SB' : 'BB'}</Text>
            </View>
            <SeatActionBadge
              active={heroTurn}
              activeLabel={t('table.yourTurn')}
              label={heroStreetAction ? compactSeatAction(heroStreetAction.type, heroStreetAction.amount, heroStreetAction.decisionContext.currentBet, t) : null}
            />
          </View>
        </LinearGradient>
      </Animated.View>

      {resultSummary && (
        <Animated.View
          style={{
            opacity: actionTransition,
            transform: [{ translateY: actionTransition.interpolate({ inputRange: [0, 1], outputRange: [7, 0] }) }],
          }}
        >
          <HandResultCard summary={resultSummary} />
        </Animated.View>
      )}

      {coachEnabled && game.street !== 'complete' && heroTurn && (
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
      )}

      {game.street !== 'complete' ? (
        <View style={styles.actions}>
          <ActionButton disabled={!legal.canFold || !heroTurn} label={t('poker.action.fold')} onPress={() => takeAction({ type: 'fold' })} tone="danger" />
          <ActionButton
            disabled={(!legal.canCheck && !legal.canCall) || !heroTurn}
            label={legal.canCheck ? t('poker.action.check') : t('poker.action.callAmount', { amount: formatChipAmount(legal.toCall) })}
            onPress={() => takeAction({ type: legal.canCheck ? 'check' : 'call' })}
          />
          <ActionButton
            disabled={!legal.canRaise || !heroTurn}
            label={coachEnabled && coachRecommendation.target
              ? t(game.currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChipAmount(coachRecommendation.target) })
              : t(game.currentBet === 0 ? 'poker.action.bet' : 'poker.action.raise')}
            onPress={() => setBetSizingVisible(true)}
            tone="primary"
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <ActionButton label={sessionComplete ? t('table.sessionResults') : t('table.nextHand')} onPress={dealNext} tone="primary" />
          <ActionButton label={t('table.reviewHand')} onPress={openCoachReview} />
        </View>
      )}

      <Modal animationType="fade" onRequestClose={() => setExitConfirmVisible(false)} transparent visible={exitConfirmVisible}>
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

      <Modal animationType="fade" onRequestClose={() => setReviewVisible(false)} transparent visible={reviewVisible}>
        <View style={styles.modalScrim}>
          <ModalBackdrop accessibilityLabel={t('table.review.close')} onPress={() => setReviewVisible(false)} />
          <View accessibilityViewIsModal style={[styles.reviewSheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
            <View style={styles.reviewHeader}>
              <View>
                <Text style={styles.reviewEyebrow}>
                  {coachResult ? t('table.review.saved') : coachLoading ? t('table.review.reviewing') : t('table.review.learn')}
                </Text>
                <Text accessibilityRole="header" style={styles.reviewTitle}>{t('table.review.title')}</Text>
              </View>
              <Pressable accessibilityLabel={t('table.review.close')} accessibilityRole="button" onPress={() => setReviewVisible(false)} style={styles.iconButton}>
                <Ionicons color={palette.text} name="close" size={20} />
              </Pressable>
            </View>
            {coachLoading || coachError ? (
              localReviewAnalysis ? (
                <PendingCoachReview
                  analysis={coachError?.analysis ?? localReviewAnalysis}
                  bigBlind={game.bigBlind}
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
                <VerifiedFactsDisclosure analysis={coachResult.analysis} bigBlind={game.bigBlind} />
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
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setInsightVisible(false)} transparent visible={insightVisible}>
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
                <InsightMetric label={t('table.insight.costCall')} value={legal.toCall > 0 ? formatChipAmount(legal.toCall) : '0'} />
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

function compactSeatAction(
  type: PlayerAction['type'],
  amount: number,
  currentBet: number,
  t: ReturnType<typeof useLocalization>['t'],
): string {
  const value = formatChipAmount(amount);
  if (type === 'raise') return t(currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: value });
  if (type === 'call') return t('poker.action.callAmount', { amount: value });
  return t(type === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

function formatChipAmount(chips: number): string {
  if (Math.abs(chips) < 1_000) return String(Math.round(chips));
  return `${Math.round((chips / 1_000) * 10) / 10}K`;
}

function SeatActionBadge({ active, activeLabel, label }: { active: boolean; activeLabel: string; label: string | null }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  const copy = active ? activeLabel : label;
  if (!copy) return <View style={styles.seatBadgeSpacer} />;
  return (
    <View style={[styles.seatBadge, active && styles.seatBadgeActive]}>
      <Text style={[styles.seatBadgeText, active && styles.seatBadgeTextActive]}>{copy}</Text>
    </View>
  );
}

function createSessionHand(config: PracticeSessionConfig) {
  const startingChips = sessionStartingChips(config, defaultBigBlind);
  return createHand({
    bigBlind: defaultBigBlind,
    button: secureRandom() < 0.5 ? 'hero' : 'villain',
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
  bigBlind,
  error,
  loading,
  onReportIssue,
  onRetry,
}: {
  analysis: VerifiedHandAnalysis;
  bigBlind: number;
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
      <VerifiedFactsDisclosure analysis={analysis} bigBlind={bigBlind} />
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

function VerifiedFactsDisclosure({ analysis, bigBlind }: { analysis: VerifiedHandAnalysis; bigBlind: number }) {
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
      {expanded ? <VerifiedFacts analysis={analysis} bigBlind={bigBlind} /> : null}
    </View>
  );
}

function formatBb(chips: number, bigBlind: number): string {
  const amount = Math.round((chips / bigBlind) * 10) / 10;
  return `${amount} BB`;
}

function humanize(value: string): string {
  return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function chosenActionLabel(decision: VerifiedDecisionAnalysis, bigBlind: number, t: ReturnType<typeof useLocalization>['t']): string {
  if (decision.chosenAction === 'raise') {
    return t(decision.amountToCall > 0 ? 'poker.action.raiseTo' : 'poker.action.betAmount', { amount: formatBb(decision.chosenAmount, bigBlind) });
  }
  if (decision.chosenAction === 'call') return t('poker.action.callAmount', { amount: formatBb(decision.amountToCall, bigBlind) });
  return t(decision.chosenAction === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

function legalOptionsLabel(decision: VerifiedDecisionAnalysis, bigBlind: number, t: ReturnType<typeof useLocalization>['t']): string {
  const legal = decision.legalActions;
  const options: string[] = [];
  if (legal.canFold) options.push(t('poker.action.fold'));
  if (legal.canCheck) options.push(t('poker.action.check'));
  if (legal.canCall) options.push(t('poker.action.callAmount', { amount: formatBb(legal.toCall, bigBlind) }));
  if (legal.canRaise) {
    const range = legal.minRaiseTo === legal.maxRaiseTo
      ? formatBb(legal.maxRaiseTo, bigBlind)
      : `${formatBb(legal.minRaiseTo, bigBlind)}–${formatBb(legal.maxRaiseTo, bigBlind)}`;
    options.push(t(decision.amountToCall > 0 ? 'poker.action.raiseTo' : 'poker.action.betAmount', { amount: range }));
  }
  return options.join(' · ');
}

function drawValue(decision: VerifiedDecisionAnalysis, t: ReturnType<typeof useLocalization>['t']): string {
  if (decision.drawCompletionOuts > 0) return String(decision.drawCompletionOuts);
  if (decision.draws.some((draw) => draw.type === 'backdoor-flush')) return t('table.review.backdoor');
  return t('table.review.none');
}

function VerifiedFacts({ analysis, bigBlind }: { analysis: VerifiedHandAnalysis; bigBlind: number }) {
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
              <Text style={styles.verifiedDecisionAction}>{chosenActionLabel(decision, bigBlind, t)}</Text>
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
          <Text style={styles.verifiedOptions}>{t('table.review.options', { options: legalOptionsLabel(decision, bigBlind, t) })}</Text>
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

function createStyles(palette: ThemePalette, compact = false) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: compact ? 10 : 14, paddingTop: compact ? 4 : 8, paddingBottom: 6, gap: compact ? 6 : 10 },
    header: { height: compact ? 40 : 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    handMeta: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 3 },
    handTitle: { maxWidth: '100%', color: palette.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
    street: { color: palette.muted, fontSize: 10, marginTop: 2 },
    headerControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    sessionButton: { height: 34, minWidth: 42, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 11, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    guideButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentSoft },
    sessionCount: { color: palette.text, fontSize: 10, fontWeight: '700' },
    coachToggle: { minWidth: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
    coachToggleLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    tableFrame: { flex: 1, minHeight: compact ? 300 : 390 },
    table: { flex: 1, borderRadius: 38, borderWidth: 1, borderColor: palette.tableLine, paddingVertical: compact ? 12 : 20, paddingHorizontal: 12, justifyContent: 'space-between', overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 5 },
    tableRing: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderRadius: 32, borderWidth: 1, borderColor: palette.tableLine },
    playerZone: { width: compact ? 150 : 170, alignSelf: 'center', alignItems: 'center', gap: compact ? 2 : 4, zIndex: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 16, borderWidth: 1, borderColor: 'transparent' },
    playerZoneActive: { borderColor: palette.aqua, backgroundColor: palette.tableDeep },
    playerName: { color: palette.tableText, fontSize: 11, fontWeight: '700' },
    playerHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    playerIdentity: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    positionMarker: { color: palette.background, fontSize: 8, fontWeight: '900', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 7, backgroundColor: palette.aqua, overflow: 'hidden' },
    cardsRow: { flexDirection: 'row', gap: 5 },
    centerZone: { alignItems: 'center', gap: compact ? 7 : 12, zIndex: 1 },
    potPill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: 10, fontWeight: '700' },
    boardRow: { flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
    statusArea: { minHeight: compact ? 46 : 55, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 16, paddingVertical: 5, borderRadius: 12, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    statusEyebrow: { color: palette.tableText, opacity: 0.6, fontSize: 8, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    thinkingRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
    latestActionText: { color: palette.aqua, fontSize: compact ? 11 : 13, lineHeight: compact ? 15 : 18, fontWeight: '800', textAlign: 'center' },
    statusText: { color: palette.tableText, fontSize: compact ? 9 : 10.5, lineHeight: 14, textAlign: 'center' },
    seatBadge: { minHeight: 20, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    seatBadgeActive: { backgroundColor: palette.aqua },
    seatBadgeText: { color: palette.tableText, fontSize: 9, fontWeight: '800' },
    seatBadgeTextActive: { color: palette.background },
    seatBadgeSpacer: { height: 20 },
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
