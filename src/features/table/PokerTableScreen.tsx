import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { PlayingCard } from '../../components/PlayingCard';
import { decideAiAction } from '../../domain/poker/ai';
import { aiStrategyProfile, type AiDifficulty } from '../../domain/poker/aiProfiles';
import {
  analyzeCoachHand,
  buildCoachAnalysisInput,
  type VerifiedDecisionAnalysis,
  type VerifiedHandAnalysis,
} from '../../domain/poker/analysis';
import { cardLabel, seededRandom } from '../../domain/poker/cards';
import { estimateHeadsUpEquity } from '../../domain/poker/equity';
import {
  applyAction,
  createHand,
  createNextHand,
  formatAction,
  getLegalActions,
  streetLabel,
} from '../../domain/poker/engine';
import { createPersistenceClientId, handClientId } from '../../domain/poker/persistence';
import type { CoachFocusArea, CoachHandGrade, PlayerAction } from '../../domain/poker/types';
import {
  coachFocusLabel,
  sessionCompletionReason,
  sessionStartingChips,
  summarizePracticeSession,
  type PracticeSessionConfig,
} from '../../domain/poker/session';
import {
  CoachRequestError,
  requestHandReview,
  type CoachQuota,
  type CoachResult,
} from '../../services/coach';
import { loadRecentHandHistory, queueHandPersistence } from '../../services/handHistory';
import { isSupabaseConfigured } from '../../services/supabase';
import { type ThemePalette, useAppTheme } from '../../theme';
import { BetSizingModal } from './BetSizingModal';
import {
  buildHandResultSummary,
  formatLatestAction,
} from './gameplayPresentation';
import { HandReplayModal } from './HandReplayModal';
import { HandResultCard } from './HandResultCard';
import { SessionHistoryModal } from './SessionHistoryModal';
import type { SessionHandRecord } from './sessionModels';
import { SessionSummaryModal } from './SessionSummaryModal';

const defaultBigBlind = 20;

interface PokerTableScreenProps {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onChangeSetup: () => void;
  onCoachEnabledChange: (value: boolean) => void;
  onExit: () => void;
  sessionConfig: PracticeSessionConfig;
}

export function PokerTableScreen({
  aiDifficulty,
  coachEnabled,
  onChangeSetup,
  onCoachEnabledChange,
  onExit,
  sessionConfig,
}: PokerTableScreenProps) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compactLayout = height < 700;
  const styles = useMemo(() => createStyles(palette, compactLayout), [compactLayout, palette]);
  const aiProfile = aiStrategyProfile(aiDifficulty);
  const [game, setGame] = useState(() => createSessionHand(sessionConfig));
  const [startingHeroStack, setStartingHeroStack] = useState(
    () => game.players.hero.stack + game.players.hero.totalCommitted,
  );
  const [sessionClientId, setSessionClientId] = useState(() => createPersistenceClientId('session'));
  const [aiThinking, setAiThinking] = useState(false);
  const [betSizingVisible, setBetSizingVisible] = useState(false);
  const [insightVisible, setInsightVisible] = useState(false);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [coachResult, setCoachResult] = useState<CoachResult | null>(null);
  const [coachError, setCoachError] = useState<CoachRequestError | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const coachRequestActive = useRef(false);
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
    () => sessionHands.filter((hand) => hand.clientId.startsWith(`${sessionClientId}:hand:`)),
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
  const resultSummary = useMemo(
    () => buildHandResultSummary(game, startingHeroStack),
    [game, startingHeroStack],
  );
  const localReviewAnalysis = useMemo(
    () => game.outcome ? analyzeCoachHand(buildCoachAnalysisInput(game)) : null,
    [game],
  );

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
    void queueHandPersistence({ sessionClientId, coachEnabled, completedAt, game, aiDifficulty });
  }, [aiDifficulty, coachEnabled, game, sessionClientId]);

  useEffect(() => {
    if (game.toAct !== 'villain' || game.street === 'complete') {
      setAiThinking(false);
      return undefined;
    }

    setAiThinking(true);
    const timer = setTimeout(() => {
      setGame((current) => {
        if (current.toAct !== 'villain' || current.street === 'complete') return current;
        return applyAction(current, 'villain', decideAiAction(current, 'villain', Math.random, aiDifficulty).action);
      });
      setAiThinking(false);
    }, aiProfile.reactionDelayMs);

    return () => clearTimeout(timer);
  }, [aiDifficulty, aiProfile.reactionDelayMs, game.handNumber, game.history.length, game.street, game.toAct]);

  const takeAction = (action: PlayerAction) => {
    if (!heroTurn) return;
    setBetSizingVisible(false);
    setInsightVisible(false);
    setGame((current) => applyAction(current, 'hero', action));
  };

  const dealNext = () => {
    if (sessionComplete) {
      setSessionSummaryVisible(true);
      return;
    }
    const next = createNextHand(game);
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
    setSessionSummaryVisible(false);
    setReplayHand(null);
  };

  const leaveTable = () => {
    if (currentSessionHands.length > 0 || game.outcome) {
      setSessionSummaryVisible(true);
      return;
    }
    onExit();
  };

  const askCoach = async () => {
    if (!game.outcome || coachRequestActive.current) return;
    coachRequestActive.current = true;
    setReviewVisible(true);
    setCoachResult(null);
    if (!isSupabaseConfigured) {
      coachRequestActive.current = false;
      setCoachLoading(false);
      setCoachError(new CoachRequestError(
        'coach_configuration',
        'AI review is not connected yet. Add the Supabase project settings to enable it.',
        false,
      ));
      return;
    }

    setCoachLoading(true);
    setCoachError(null);
    try {
      const result = await requestHandReview({
        heroCards: game.players.hero.holeCards.map(cardLabel),
        board: game.board.map(cardLabel),
        street: game.street,
        potWon: game.outcome.potWon,
        result: game.outcome.message,
        actionHistory: game.history.map(formatAction),
        analysisInput: buildCoachAnalysisInput(game),
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
      setCoachError(error instanceof CoachRequestError
        ? error
        : new CoachRequestError(
          'coach_unavailable',
          'The AI coach could not complete this explanation. Your verified facts are ready below.',
          true,
        ));
    } finally {
      coachRequestActive.current = false;
      setCoachLoading(false);
    }
  };

  const requiredEquity = legal.toCall > 0 ? legal.toCall / (game.pot + legal.toCall) : 0;
  const equityMargin = heroEquity === null ? null : heroEquity - requiredEquity;
  const chipsToBb = (chips: number) => Math.round((chips / game.bigBlind) * 10) / 10;
  const insightSummary = heroEquity === null
    ? 'Calculating the current decision…'
    : legal.toCall === 0
      ? 'No bet to call. Compare checking with betting for value or pressure.'
      : equityMargin !== null && equityMargin >= 0.12
        ? 'You have a healthy raw-equity margin to continue.'
        : equityMargin !== null && equityMargin >= 0
          ? 'You meet the raw call threshold, but the margin is thin.'
          : 'A call misses the raw break-even threshold against this modeled range.';

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Leave table" accessibilityRole="button" onPress={leaveTable} style={styles.iconButton}>
          <Ionicons color={palette.text} name="arrow-back" size={19} />
        </Pressable>
        <View style={styles.handMeta}>
          <Text accessibilityRole="header" style={styles.handTitle}>
            {aiProfile.label} AI · Hand {game.handNumber}{sessionConfig.handTarget === 'open' ? '' : `/${sessionConfig.handTarget}`}
          </Text>
          <Text style={styles.street}>{streetLabel(game.street)}</Text>
        </View>
        <View style={styles.headerControls}>
          <Pressable
            accessibilityLabel={`Open this session's ${currentSessionHands.length} completed hands`}
            accessibilityRole="button"
            onPress={() => setSessionVisible(true)}
            style={styles.sessionButton}
          >
            <Ionicons color={palette.muted} name="stats-chart-outline" size={16} />
            <Text style={styles.sessionCount}>{currentSessionHands.length}</Text>
          </Pressable>
          <View style={styles.coachToggle}>
            <Text style={styles.coachToggleLabel}>Coach</Text>
            <Switch
              accessibilityLabel="Show coaching insights"
              onValueChange={onCoachEnabledChange}
              trackColor={{ false: palette.soft, true: palette.primary }}
              thumbColor={palette.surface}
              value={coachEnabled}
            />
          </View>
        </View>
      </View>

      <LinearGradient colors={[palette.table, palette.tableDeep]} style={styles.table}>
        <View style={styles.tableRing} />
        <View style={styles.playerZone}>
          <Text style={styles.playerName}>Mara · {chipsToBb(game.players.villain.stack)} BB</Text>
          <View style={styles.cardsRow}>
            {game.players.villain.holeCards.map((card) => (
              <PlayingCard card={card} compact hidden={!revealVillain} key={cardLabel(card)} />
            ))}
          </View>
        </View>

        <View style={styles.centerZone}>
          <View style={styles.potPill}><Text style={styles.potText}>Pot · {chipsToBb(displayPot)} BB</Text></View>
          <View style={styles.boardRow}>
            {Array.from({ length: 5 }, (_, index) => (
              <PlayingCard card={game.board[index]} compact key={`board-${index}`} />
            ))}
          </View>
          <View accessibilityLiveRegion="polite" style={styles.statusArea}>
            {aiThinking ? (
              <View style={styles.thinkingRow}>
                <ActivityIndicator color={palette.aqua} size="small" />
                <Text style={styles.statusText}>Mara is thinking…</Text>
              </View>
            ) : (
              <>
                <Text numberOfLines={1} style={styles.latestActionText}>
                  {game.outcome
                    ? 'Hand complete'
                    : latestAction
                      ? formatLatestAction(latestAction, game.bigBlind)
                      : `${game.button === 'hero' ? 'You have' : 'Mara has'} the button`}
                </Text>
                {!game.outcome && (
                  <Text numberOfLines={1} style={styles.statusText}>
                    {heroTurn ? 'Your decision' : 'Waiting for Mara'}
                  </Text>
                )}
              </>
            )}
          </View>
        </View>

        <View style={styles.playerZone}>
          <View style={styles.cardsRow}>
            {game.players.hero.holeCards.map((card) => (
              <PlayingCard card={card} compact={compactLayout} key={cardLabel(card)} />
            ))}
          </View>
          <Text style={styles.playerName}>You · {chipsToBb(game.players.hero.stack)} BB</Text>
        </View>
      </LinearGradient>

      {resultSummary && <HandResultCard summary={resultSummary} />}

      {coachEnabled && game.street !== 'complete' && heroTurn && (
        <View style={styles.coachBar}>
          <View style={styles.coachIcon}><Ionicons color={palette.aqua} name="sparkles-outline" size={18} /></View>
          <View style={styles.coachCopy}>
            <Text style={styles.coachTitle}>
              {heroEquity === null
                ? 'Coach insight'
                : legal.toCall > 0
                  ? `${Math.round(heroEquity * 100)}% equity · ${Math.round(requiredEquity * 100)}% needed`
                  : `${Math.round(heroEquity * 100)}% estimated equity`}
            </Text>
            <Text numberOfLines={2} style={styles.coachText}>{insightSummary}</Text>
          </View>
          <Pressable accessibilityLabel="Open coach insight details" accessibilityRole="button" onPress={() => setInsightVisible(true)} style={styles.hintButton}>
            <Text style={styles.hintButtonText}>Details</Text>
          </Pressable>
        </View>
      )}

      {game.street !== 'complete' ? (
        <View style={styles.actions}>
          <ActionButton disabled={!legal.canFold || !heroTurn} label="Fold" onPress={() => takeAction({ type: 'fold' })} tone="danger" />
          <ActionButton
            disabled={(!legal.canCheck && !legal.canCall) || !heroTurn}
            label={legal.canCheck ? 'Check' : `Call ${chipsToBb(legal.toCall)} BB`}
            onPress={() => takeAction({ type: legal.canCheck ? 'check' : 'call' })}
          />
          <ActionButton
            disabled={!legal.canRaise || !heroTurn}
            label={game.currentBet === 0 ? 'Bet' : 'Raise'}
            onPress={() => setBetSizingVisible(true)}
            tone="primary"
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <ActionButton label={sessionComplete ? 'Session results' : 'Next hand'} onPress={dealNext} tone="primary" />
          {coachEnabled && <ActionButton label="AI review" onPress={askCoach} />}
        </View>
      )}

      <BetSizingModal
        bigBlind={game.bigBlind}
        currentBet={game.currentBet}
        legal={legal}
        onClose={() => setBetSizingVisible(false)}
        onConfirm={(target) => takeAction({ type: 'raise', amount: target })}
        playerStreetBet={game.players.hero.streetBet}
        pot={game.pot}
        visible={betSizingVisible}
      />

      <Modal animationType="fade" onRequestClose={() => setReviewVisible(false)} transparent visible={reviewVisible}>
        <View style={styles.modalScrim}>
          <View accessibilityViewIsModal style={[styles.reviewSheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
            <View style={styles.reviewHeader}>
              <View>
                <Text style={styles.reviewEyebrow}>Verified facts · AI explanation</Text>
                <Text accessibilityRole="header" style={styles.reviewTitle}>Coach notes</Text>
              </View>
              <Pressable accessibilityLabel="Close review" accessibilityRole="button" onPress={() => setReviewVisible(false)} style={styles.iconButton}>
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
                  onRetry={askCoach}
                />
              ) : null
            ) : coachResult ? (
              <ScrollView
                contentContainerStyle={styles.reviewContent}
                showsVerticalScrollIndicator={false}
                style={styles.reviewScroll}
              >
                <Text style={styles.reviewSummary}>{coachResult.review.summary}</Text>
                <ReviewGrade
                  focusArea={coachResult.review.focusArea}
                  grade={coachResult.review.handGrade}
                />
                {coachResult.quota ? <QuotaNote quota={coachResult.quota} /> : null}
                <VerifiedFacts analysis={coachResult.analysis} bigBlind={game.bigBlind} />
                <ReviewLine label="Best decision" value={coachResult.review.bestDecision} />
                <ReviewLine label="Key concept" value={coachResult.review.keyConcept} />
                <ReviewLine label="Next practice" value={coachResult.review.practiceTip} />
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
                      ? `Replay decision ${coachResult.review.focusDecisionSequence}`
                      : 'Replay this hand'}
                  </Text>
                </Pressable>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setInsightVisible(false)} transparent visible={insightVisible}>
        <View style={styles.modalScrim}>
          <View accessibilityViewIsModal style={[styles.reviewSheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
            <View style={styles.reviewHeader}>
              <View>
                <Text style={styles.reviewEyebrow}>Coach insight</Text>
                <Text accessibilityRole="header" style={styles.reviewTitle}>Your decision</Text>
              </View>
              <Pressable accessibilityLabel="Close insight" accessibilityRole="button" onPress={() => setInsightVisible(false)} style={styles.iconButton}>
                <Ionicons color={palette.text} name="close" size={20} />
              </Pressable>
            </View>

            <View style={styles.insightMetrics}>
              <InsightMetric label="Estimated equity" value={heroEquity === null ? '—' : `${Math.round(heroEquity * 100)}%`} />
              <InsightMetric label="Required to call" value={legal.toCall > 0 ? `${Math.round(requiredEquity * 100)}%` : 'No bet'} />
              <InsightMetric label="Cost to call" value={legal.toCall > 0 ? `${chipsToBb(legal.toCall)} BB` : '0 BB'} />
              <InsightMetric
                label="Equity margin"
                value={legal.toCall > 0 && equityMargin !== null ? `${equityMargin >= 0 ? '+' : ''}${Math.round(equityMargin * 100)} pts` : '—'}
              />
            </View>

            <View style={styles.explanationBlock}>
              <Text style={styles.reviewLabel}>What it means</Text>
              <Text style={styles.reviewValue}>{insightSummary}</Text>
            </View>
            <View style={styles.explanationBlock}>
              <Text style={styles.reviewLabel}>How this was estimated</Text>
              <Text style={styles.reviewValue}>
                RiverMind simulates your cards against a modeled opponent range. Position, future betting, and opponent tendencies can still change the best action.
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setInsightVisible(false)} style={styles.primarySheetButton}>
              <Text style={styles.primarySheetButtonText}>Back to the hand</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <SessionHistoryModal
        hands={currentSessionHands}
        onClose={() => setSessionVisible(false)}
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
        onChangeSetup={() => {
          setSessionSummaryVisible(false);
          onChangeSetup();
        }}
        onClose={() => setSessionSummaryVisible(false)}
        onPlayAgain={startFreshSession}
        onReviewHands={() => {
          setSessionSummaryVisible(false);
          setSessionVisible(true);
        }}
        reason={completionReason}
        summary={sessionSummary}
        visible={sessionSummaryVisible}
      />
    </View>
  );
}

function createSessionHand(config: PracticeSessionConfig) {
  const startingChips = sessionStartingChips(config, defaultBigBlind);
  return createHand({
    bigBlind: defaultBigBlind,
    smallBlind: defaultBigBlind / 2,
    heroStack: startingChips,
    villainStack: startingChips,
  });
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
  onRetry,
}: {
  analysis: VerifiedHandAnalysis;
  bigBlind: number;
  error: CoachRequestError | null;
  loading: boolean;
  onRetry: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const title = loading
    ? 'Adding the AI explanation'
    : error?.code === 'daily_limit'
      ? 'Daily AI limit reached'
      : 'AI explanation unavailable';

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
                ? 'Your poker facts are ready. The coach is adding strategic context now.'
                : error?.message}
            </Text>
          </View>
        </View>
        {error?.quota ? <QuotaNote quota={error.quota} /> : null}
        {!loading && error?.retryable ? (
          <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
            <Ionicons color={palette.primaryText} name="refresh-outline" size={17} />
            <Text style={styles.retryButtonText}>Try again</Text>
          </Pressable>
        ) : null}
      </View>
      <VerifiedFacts analysis={analysis} bigBlind={bigBlind} />
    </ScrollView>
  );
}

function QuotaNote({ quota }: { quota: CoachQuota }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const copy = quota.remaining === 0
    ? 'More AI reviews unlock at 12:00 AM UTC.'
    : `${quota.remaining} of ${quota.limit} AI reviews left today.`;
  return (
    <View style={styles.quotaNote}>
      <Ionicons color={palette.muted} name="sparkles-outline" size={14} />
      <Text style={styles.quotaNoteText}>{copy}</Text>
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

function chosenActionLabel(decision: VerifiedDecisionAnalysis, bigBlind: number): string {
  if (decision.chosenAction === 'raise') {
    return `${decision.amountToCall > 0 ? 'Raised' : 'Bet'} to ${formatBb(decision.chosenAmount, bigBlind)}`;
  }
  if (decision.chosenAction === 'call') return `Called ${formatBb(decision.amountToCall, bigBlind)}`;
  return humanize(decision.chosenAction);
}

function legalOptionsLabel(decision: VerifiedDecisionAnalysis, bigBlind: number): string {
  const legal = decision.legalActions;
  const options: string[] = [];
  if (legal.canFold) options.push('Fold');
  if (legal.canCheck) options.push('Check');
  if (legal.canCall) options.push(`Call ${formatBb(legal.toCall, bigBlind)}`);
  if (legal.canRaise) {
    const action = decision.amountToCall > 0 ? 'Raise' : 'Bet';
    const range = legal.minRaiseTo === legal.maxRaiseTo
      ? formatBb(legal.maxRaiseTo, bigBlind)
      : `${formatBb(legal.minRaiseTo, bigBlind)}–${formatBb(legal.maxRaiseTo, bigBlind)}`;
    options.push(`${action} ${range}`);
  }
  return options.join(' · ');
}

function drawValue(decision: VerifiedDecisionAnalysis): string {
  if (decision.drawCompletionOuts > 0) return String(decision.drawCompletionOuts);
  if (decision.draws.some((draw) => draw.type === 'backdoor-flush')) return 'Backdoor';
  return 'None';
}

function VerifiedFacts({ analysis, bigBlind }: { analysis: VerifiedHandAnalysis; bigBlind: number }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const boardDescription = analysis.finalBoard.length > 0
    ? analysis.finalBoard.join(' ')
    : 'No community cards';
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
          <Text style={styles.reviewLabel}>Verified hand</Text>
          <Text style={styles.verifiedHandName}>{analysis.finalMadeHand?.description ?? 'No made hand'}</Text>
        </View>
      </View>
      <Text style={styles.verifiedBoard}>Board · {boardDescription}</Text>
      {textureDescription ? <Text style={styles.verifiedTexture}>{textureDescription}</Text> : null}

      <Text style={styles.reviewLabel}>Decision facts</Text>
      {analysis.decisions.length > 0 ? analysis.decisions.map((decision) => (
        <View key={decision.sequence} style={styles.verifiedDecision}>
          <View style={styles.verifiedDecisionHeader}>
            <View>
              <Text style={styles.verifiedDecisionStreet}>
                {humanize(decision.street)} · Decision {decision.sequence}
              </Text>
              <Text style={styles.verifiedDecisionAction}>{chosenActionLabel(decision, bigBlind)}</Text>
            </View>
            <Ionicons
              color={decision.actionWasLegal ? palette.aqua : palette.danger}
              name={decision.actionWasLegal ? 'checkmark-circle-outline' : 'alert-circle-outline'}
              size={19}
            />
          </View>
          <View style={styles.factPills}>
            <FactPill
              label="Pot odds"
              value={decision.requiredEquityPct === null ? 'Free' : `${decision.requiredEquityPct}%`}
            />
            <FactPill label="Draw outs" value={drawValue(decision)} />
            <FactPill
              label="Hit next"
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
            {decision.madeHand?.description ?? 'Preflop starting hand'}
          </Text>
          <Text style={styles.verifiedOptions}>Options · {legalOptionsLabel(decision, bigBlind)}</Text>
        </View>
      )) : (
        <Text style={styles.verifiedEmpty}>The hand ended before you made a recorded decision.</Text>
      )}
      <Text style={styles.verifiedCaveat}>
        Draw outs complete the named draw; whether every out wins still depends on the opponent's range.
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
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

function ReviewGrade({ focusArea, grade }: { focusArea: CoachFocusArea; grade: CoachHandGrade }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const color = grade === 'strong' ? palette.aqua : grade === 'mistake' ? palette.danger : palette.primary;
  const title = grade === 'strong' ? 'Strong hand' : grade === 'close' ? 'Close decision' : 'Focus spot';
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
          {focusArea === 'none' ? 'No major skill leak found' : coachFocusLabel(focusArea)}
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
    handMeta: { flex: 1, alignItems: 'center' },
    handTitle: { color: palette.text, fontSize: 12, fontWeight: '700' },
    street: { color: palette.muted, fontSize: 10, marginTop: 2 },
    headerControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    sessionButton: { height: 34, minWidth: 42, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: 11, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sessionCount: { color: palette.text, fontSize: 10, fontWeight: '700' },
    coachToggle: { minWidth: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
    coachToggleLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    table: { flex: 1, minHeight: compact ? 300 : 390, borderRadius: 128, borderWidth: 1, borderColor: palette.tableLine, paddingVertical: compact ? 12 : 20, paddingHorizontal: 12, justifyContent: 'space-between', overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 5 },
    tableRing: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderRadius: 122, borderWidth: 1, borderColor: palette.tableLine },
    playerZone: { alignItems: 'center', gap: compact ? 3 : 6, zIndex: 1 },
    playerName: { color: palette.tableText, fontSize: 11, fontWeight: '700' },
    cardsRow: { flexDirection: 'row', gap: 5 },
    centerZone: { alignItems: 'center', gap: compact ? 7 : 12, zIndex: 1 },
    potPill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 10, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: 10, fontWeight: '700' },
    boardRow: { flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
    statusArea: { minHeight: compact ? 32 : 42, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 16 },
    thinkingRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
    latestActionText: { color: palette.aqua, fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
    statusText: { color: palette.tableText, fontSize: 11, lineHeight: 15, textAlign: 'center' },
    coachBar: { minHeight: compact ? 58 : 66, flexDirection: 'row', alignItems: 'center', gap: compact ? 7 : 10, paddingHorizontal: compact ? 9 : 12, paddingVertical: compact ? 6 : 9, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    coachIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.aquaSoft },
    coachCopy: { flex: 1 },
    coachTitle: { color: palette.text, fontSize: 12, fontWeight: '700' },
    coachText: { color: palette.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
    hintButton: { minWidth: 52, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: palette.accentSoft, alignItems: 'center' },
    hintButtonText: { color: palette.primary, fontSize: 11, fontWeight: '700' },
    actions: { minHeight: 50, flexDirection: 'row', gap: 7 },
    modalScrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    reviewSheet: { maxHeight: '90%', padding: 20, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, gap: 18 },
    reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    reviewEyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    reviewTitle: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 3 },
    connectionText: { color: palette.text, fontSize: 12, lineHeight: 18 },
    coachStatusCard: { gap: 13, padding: 15, borderRadius: 17, backgroundColor: palette.accentSoft },
    coachStatusHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    coachStatusCopy: { flex: 1, gap: 4 },
    coachStatusTitle: { color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
    retryButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 12, backgroundColor: palette.primary },
    retryButtonText: { color: palette.primaryText, fontSize: 12, fontWeight: '700' },
    quotaNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    quotaNoteText: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 14 },
    reviewScroll: { flexShrink: 1 },
    reviewContent: { gap: 16, paddingBottom: 2 },
    reviewSummary: { color: palette.text, fontSize: 16, lineHeight: 23, fontWeight: '600' },
    reviewLine: { gap: 4 },
    reviewLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
    reviewValue: { color: palette.text, fontSize: 13, lineHeight: 19 },
    reviewGrade: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    reviewGradeIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    reviewGradeCopy: { flex: 1, gap: 2 },
    reviewGradeTitle: { fontSize: 12, fontWeight: '700' },
    reviewGradeFocus: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    insightMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    insightMetric: { width: '48%', minHeight: 76, justifyContent: 'space-between', padding: 12, borderRadius: 14, backgroundColor: palette.soft },
    insightMetricLabel: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    insightMetricValue: { color: palette.text, fontSize: 19, fontWeight: '700', marginTop: 8 },
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
    primarySheetButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary },
    primarySheetButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
