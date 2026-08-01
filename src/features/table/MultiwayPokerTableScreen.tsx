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
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '../../components/ActionButton';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { OpponentReadCard } from '../../components/OpponentReadCard';
import { cardLabel, seededRandom } from '../../domain/poker/cards';
import {
  createDailyChallenge,
  createDailyChallengeCheckpoint,
  createNextDailyChallengeHand,
  dailyChallengeDecisionRandom,
  dailyChallengeDisplayDate,
  dailyChallengeResult,
  resumeDailyChallenge,
  type DailyChallengeCheckpoint,
  type DailyChallengeResult,
} from '../../domain/poker/dailyChallenge';
import { createFairMultiwayDecisionState } from '../../domain/poker/fairness';
import {
  applyMultiwayAction,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type MultiwayPlayerState,
} from '../../domain/poker/multiway';
import { estimateMultiwayEquity } from '../../domain/poker/multiwayEquity';
import {
  createMultiwaySessionHand,
  createNextMultiwaySessionHand,
  decideSessionAiAction,
  multiwayAiPacingMs,
  multiwayIdentityMap,
  multiwayLatestActionLabel,
  multiwayOutcomeMessage,
  multiwayPlayerAward,
  multiwaySessionCompletionReason,
  summarizeMultiwaySession,
  type MultiwaySessionCompletionReason,
  type MultiwayTablePlayerCount,
} from '../../domain/poker/multiwaySession';
import {
  createNextSitAndGoHand,
  createSitAndGo,
  createSitAndGoCheckpoint,
  resumeSitAndGo,
  sitAndGoBlindLevel,
  sitAndGoCompletion,
  sitAndGoHeroPlace,
  sitAndGoLivePlayerIds,
  type SitAndGoCheckpoint,
} from '../../domain/poker/tournament';
import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import { aiStrategyProfile } from '../../domain/poker/aiProfiles';
import type { PracticeSessionConfig } from '../../domain/poker/session';
import type { PlayerAction } from '../../domain/poker/types';
import {
  observePublicMultiwayHand,
  type HeroHandObservation,
  type OpponentMemory,
} from '../../domain/poker/opponentMemory';
import { createPersistenceClientId, handClientId } from '../../domain/poker/persistence';
import { playGameplayHaptic } from '../../services/gameplayHaptics';
import { recordAppDiagnostic } from '../../services/betaFeedback';
import { createMultiwayFeedbackHandContext } from '../../services/betaFeedbackModel';
import {
  loadRecentHandHistory,
  queueMultiwayHandPersistence,
} from '../../services/handHistory';
import { type ThemePalette, useAppTheme } from '../../theme';
import { BetSizingModal } from './BetSizingModal';
import { BetaFeedbackModal } from '../shell/BetaFeedbackModal';
import { buildLiveCoachRecommendation } from './liveCoach';
import { HandReplayModal } from './HandReplayModal';
import { SessionHistoryModal } from './SessionHistoryModal';
import {
  buildMultiwayResultSummary,
  multiwayHeroStackBeforeHand,
  multiwaySeatPlacements,
  visibleMultiwayAiThinking,
  type MultiwaySeatAnchor,
} from './multiwayGameplayPresentation';
import type { MultiwaySessionHandRecord, SessionHandRecord } from './sessionModels';
import { TableGuideModal } from './TableGuideModal';
import { secureRandom } from '../../services/secureRandom';

interface MultiwayPokerTableScreenProps {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onChangeSetup: () => void;
  onCoachEnabledChange: (value: boolean) => void;
  onExit: () => void;
  onHeroHandObserved: (observation: HeroHandObservation) => void;
  opponentMemory: OpponentMemory;
  playerCount: MultiwayTablePlayerCount;
  sessionConfig: PracticeSessionConfig;
  tableMode?: 'practice' | 'sit_and_go' | 'daily_challenge';
  tournamentCheckpoint?: SitAndGoCheckpoint | null;
  onTournamentCheckpointChange?: (checkpoint: SitAndGoCheckpoint | null) => void;
  challengeDate?: string;
  dailyChallengeCheckpoint?: DailyChallengeCheckpoint | null;
  onDailyChallengeCheckpointChange?: (checkpoint: DailyChallengeCheckpoint | null) => void;
  onDailyChallengeComplete?: (result: DailyChallengeResult) => void;
}

export function MultiwayPokerTableScreen({
  aiDifficulty,
  coachEnabled,
  onChangeSetup,
  onCoachEnabledChange,
  onExit,
  onHeroHandObserved,
  opponentMemory,
  playerCount,
  sessionConfig,
  tableMode = 'practice',
  tournamentCheckpoint = null,
  onTournamentCheckpointChange,
  challengeDate = '',
  dailyChallengeCheckpoint = null,
  onDailyChallengeCheckpointChange,
  onDailyChallengeComplete,
}: MultiwayPokerTableScreenProps) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const compact = height < 730 || width < 370;
  const styles = useMemo(() => createStyles(palette, compact), [compact, palette]);
  const dailyMode = tableMode === 'daily_challenge';
  const tournamentMode = tableMode !== 'practice';
  const tableDifficulty: AiDifficulty = dailyMode ? 'club' : aiDifficulty;
  const effectiveCoachEnabled = coachEnabled && !dailyMode;
  const [game, setGame] = useState(() => dailyMode
    ? dailyChallengeCheckpoint
      ? resumeDailyChallenge(dailyChallengeCheckpoint)
      : createDailyChallenge(challengeDate)
    : tournamentMode
      ? tournamentCheckpoint
        ? resumeSitAndGo(tournamentCheckpoint, secureRandom)
        : createSitAndGo(secureRandom, playerCount)
      : createMultiwaySessionHand(sessionConfig, playerCount, secureRandom));
  const [startingHeroStack, setStartingHeroStack] = useState(
    () => multiwayHeroStackBeforeHand(game),
  );
  const [sessionClientId, setSessionClientId] = useState(() => createPersistenceClientId('session'));
  const [sessionHands, setSessionHands] = useState<SessionHandRecord[]>([]);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  const [betSizingVisible, setBetSizingVisible] = useState(false);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);
  const [insightVisible, setInsightVisible] = useState(false);
  const [resultVisible, setResultVisible] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [replayHand, setReplayHand] = useState<MultiwaySessionHandRecord | null>(null);
  const persistedHands = useRef(new Set<string>());
  const observedHands = useRef(new Set<string>());
  const reportedDailyResults = useRef(new Set<string>());
  const hero = game.players.hero;
  if (!hero) throw new Error('The multiway table is missing the hero seat.');
  const heroTurn = game.toAct === 'hero';
  const currentAiThinking = visibleMultiwayAiThinking(aiThinking, game.toAct);
  const legal = getMultiwayLegalActions(game, 'hero');
  const practiceCompletionReason = tournamentMode ? null : multiwaySessionCompletionReason(game, sessionConfig);
  const tournamentCompletion = tournamentMode ? sitAndGoCompletion(game) : null;
  const sessionComplete = tournamentMode ? tournamentCompletion !== null : practiceCompletionReason !== null;
  const tournamentLevel = sitAndGoBlindLevel(game.handNumber);
  const tournamentPlace = tournamentMode ? sitAndGoHeroPlace(game) : null;
  const dailyScore = dailyMode && tournamentPlace
    ? tournamentPlace === 1 ? 100 : tournamentPlace === 2 ? 70 : 40
    : null;
  const tournamentPlayersLeft = tournamentMode ? sitAndGoLivePlayerIds(game).length : playerCount;
  const activeSessionHands = useMemo(
    () => sessionHands.filter((hand): hand is MultiwaySessionHandRecord => (
      hand.mode === 'multiway' && hand.clientId.startsWith(`${sessionClientId}:hand:`)
    )),
    [sessionClientId, sessionHands],
  );
  const placements = useMemo(
    () => multiwaySeatPlacements(playerCount, game.tablePlayerIds),
    [game.tablePlayerIds, playerCount],
  );
  const revealOpponents = Boolean(game.outcome?.showdown);
  const resultSummary = useMemo(
    () => buildMultiwayResultSummary(game, startingHeroStack),
    [game, startingHeroStack],
  );
  const sessionSummary = useMemo(
    () => summarizeMultiwaySession(activeSessionHands.map((hand) => hand.game), sessionConfig, game.bigBlind),
    [activeSessionHands, game.bigBlind, sessionConfig],
  );
  const feedbackHandContext = useMemo(
    () => createMultiwayFeedbackHandContext(game, sessionClientId),
    [game, sessionClientId],
  );

  const heroEquity = useMemo(() => {
    if (dailyMode || !heroTurn || game.street === 'complete') return null;
    const seed = game.handNumber * 100_003 + game.history.length * 997 + game.board.length * 43;
    return estimateMultiwayEquity(createFairMultiwayDecisionState(game, 'hero'), 'hero', {
      identities: multiwayIdentityMap(game),
      random: seededRandom(seed),
      simulations: tableDifficulty === 'friendly' ? 72 : tableDifficulty === 'sharp' ? 180 : 120,
    });
  }, [dailyMode, game, heroTurn, tableDifficulty]);

  useEffect(() => {
    let active = true;
    void loadRecentHandHistory().then((hands) => {
      if (active) setSessionHands(hands);
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
      const existing = current.find((hand) => hand.clientId === clientId);
      const record: MultiwaySessionHandRecord = {
        clientId,
        completedAt: existing?.completedAt ?? completedAt,
        game,
        coachResult: null,
        mode: 'multiway',
      };
      return existing
        ? current.map((hand) => hand.clientId === clientId ? record : hand)
        : [...current, record];
    });
    if (!dailyMode && !observedHands.current.has(clientId)) {
      observedHands.current.add(clientId);
      onHeroHandObserved(observePublicMultiwayHand(game));
    }
    if (tournamentMode) {
      if (dailyMode) {
        if (tournamentCompletion) {
          onDailyChallengeCheckpointChange?.(null);
          const resultKey = `${challengeDate}:${sessionClientId}`;
          const result = dailyChallengeResult(challengeDate, game);
          if (result && !reportedDailyResults.current.has(resultKey)) {
            reportedDailyResults.current.add(resultKey);
            onDailyChallengeComplete?.(result);
          }
        } else {
          onDailyChallengeCheckpointChange?.(createDailyChallengeCheckpoint(challengeDate, game));
        }
      } else if (tournamentCompletion) onTournamentCheckpointChange?.(null);
      else onTournamentCheckpointChange?.(createSitAndGoCheckpoint(game, tableDifficulty));
      const heroWon = game.outcome.winnerPlayerIds.includes('hero');
      playGameplayHaptic(heroWon ? 'success' : 'warning');
      return;
    }
    if (persistedHands.current.has(clientId)) return;
    persistedHands.current.add(clientId);
    void queueMultiwayHandPersistence({
      sessionClientId,
      coachEnabled: effectiveCoachEnabled,
      completedAt,
      game,
      aiDifficulty: tableDifficulty,
    });
    const heroWon = game.outcome.winnerPlayerIds.includes('hero');
    playGameplayHaptic(heroWon ? 'success' : 'warning');
  }, [challengeDate, dailyMode, effectiveCoachEnabled, game, onDailyChallengeCheckpointChange, onDailyChallengeComplete, onHeroHandObserved, onTournamentCheckpointChange, sessionClientId, tableDifficulty, tournamentCompletion, tournamentMode]);

  useEffect(() => {
    const playerId = game.toAct;
    if (!playerId || playerId === 'hero' || game.street === 'complete') {
      setAiThinking(null);
      return undefined;
    }
    setAiThinking(playerId);
    const timer = setTimeout(() => {
      setGame((current) => {
        if (current.toAct !== playerId || current.street === 'complete') return current;
        try {
          const decision = decideSessionAiAction(
            current,
            playerId,
            tableDifficulty,
            dailyMode ? dailyChallengeDecisionRandom(challengeDate, current, playerId) : secureRandom,
            dailyMode ? undefined : opponentMemory,
          );
          return applyMultiwayAction(current, playerId, decision.action);
        } catch {
          recordAppDiagnostic({ code: 'multiway_ai_decision_failed', retryable: true, source: 'multiway_table' });
          const fallback = getMultiwayLegalActions(current, playerId);
          const action: PlayerAction = fallback.canCheck
            ? { type: 'check' }
            : fallback.canCall
              ? { type: 'call' }
              : { type: 'fold' };
          return applyMultiwayAction(current, playerId, action);
        }
      });
    }, multiwayAiPacingMs(game, playerId));
    return () => clearTimeout(timer);
  }, [challengeDate, dailyMode, game, opponentMemory, tableDifficulty]);

  useEffect(() => {
    if (!heroTurn) {
      setBetSizingVisible(false);
      setInsightVisible(false);
    }
  }, [heroTurn]);

  useEffect(() => {
    if (!effectiveCoachEnabled) setInsightVisible(false);
  }, [effectiveCoachEnabled]);

  const takeAction = (action: PlayerAction) => {
    if (!heroTurn) return;
    setBetSizingVisible(false);
    setInsightVisible(false);
    playGameplayHaptic(action.type === 'raise' ? 'medium' : action.type === 'fold' ? 'selection' : 'light');
    setGame((current) => applyMultiwayAction(current, 'hero', action));
  };

  const dealNext = () => {
    if (sessionComplete) {
      setSummaryVisible(true);
      return;
    }
    const next = dailyMode
      ? createNextDailyChallengeHand(challengeDate, game)
      : tournamentMode
        ? createNextSitAndGoHand(game, secureRandom)
        : createNextMultiwaySessionHand(game, secureRandom);
    setGame(next);
    setStartingHeroStack(multiwayHeroStackBeforeHand(next));
    setResultVisible(false);
    setInsightVisible(false);
    playGameplayHaptic('selection');
  };

  const startFreshSession = () => {
    const next = dailyMode
      ? createDailyChallenge(challengeDate)
      : tournamentMode
        ? createSitAndGo(secureRandom, playerCount)
        : createMultiwaySessionHand(sessionConfig, playerCount, secureRandom);
    if (dailyMode) onDailyChallengeCheckpointChange?.(null);
    else if (tournamentMode) onTournamentCheckpointChange?.(null);
    setGame(next);
    setStartingHeroStack(multiwayHeroStackBeforeHand(next));
    setSessionClientId(createPersistenceClientId('session'));
    setSummaryVisible(false);
    setResultVisible(false);
    setReplayHand(null);
    setAiThinking(null);
  };

  const requestExit = () => {
    if (game.outcome) onExit();
    else setExitConfirmVisible(true);
  };

  const displayPot = game.outcome?.totalPot ?? game.pot;
  const requiredEquity = legal.toCall > 0 ? legal.toCall / Math.max(1, game.pot + legal.toCall) : 0;
  const equityMargin = heroEquity === null ? null : heroEquity - requiredEquity;
  const liveOpponentCount = game.activePlayerIds.filter(
    (playerId) => playerId !== 'hero' && !game.players[playerId]?.folded,
  ).length;
  const playersBehind = Math.max(0, game.pending.indexOf('hero') >= 0
    ? game.pending.slice(game.pending.indexOf('hero') + 1).length
    : 0);
  const coachSummary = heroEquity === null
    ? 'Estimating the ranges still in this hand…'
    : legal.toCall > 0
      ? equityMargin !== null && equityMargin >= 0.06
        ? 'Your range equity clears the immediate price. Check who can still act before building the pot.'
        : equityMargin !== null && equityMargin >= 0
          ? 'The call is close. Position and players behind matter more than the raw percentage.'
          : 'The current price is above your estimated range equity against the live field.'
      : playersBehind > 0
        ? `You can check for free; ${playersBehind} player${playersBehind === 1 ? '' : 's'} can still act if you bet.`
        : 'Action closes with you, so betting pressure carries less risk from players behind.';
  const coachRecommendation = buildLiveCoachRecommendation({
    bigBlind: game.bigBlind,
    currentBet: game.currentBet,
    equity: heroEquity,
    legal,
    opponentCount: liveOpponentCount,
    playerStreetBet: hero.streetBet,
    playersBehind,
    pot: game.pot,
    street: game.street,
  });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Leave table" accessibilityRole="button" onPress={requestExit} style={styles.iconButton}>
          <Ionicons color={palette.text} name="arrow-back" size={19} />
        </Pressable>
        <View style={styles.handMeta}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.handTitle}>
            {dailyMode
              ? `Daily · Hand ${game.handNumber}`
              : tournamentMode
                ? `Sit & Go · Hand ${game.handNumber}`
              : `${playerCount}-player · Hand ${game.handNumber}${sessionConfig.handTarget === 'open' ? '' : `/${sessionConfig.handTarget}`}`}
          </Text>
          <Text style={styles.street}>
            {dailyMode
              ? `${dailyChallengeDisplayDate(challengeDate)} · ${tournamentPlayersLeft} left · ${game.smallBlind}/${game.bigBlind}`
              : tournamentMode
                ? `Level ${tournamentLevel.level} · ${tournamentPlayersLeft} left · ${game.smallBlind}/${game.bigBlind}`
                : `${streetName(game.street)} · ${aiStrategyProfile(tableDifficulty).label}`}
          </Text>
        </View>
        <View style={styles.headerControls}>
          <Pressable accessibilityLabel="Open poker cheat sheet" accessibilityRole="button" onPress={() => setGuideVisible(true)} style={styles.guideButton}>
            <Ionicons color={palette.primary} name="help-circle-outline" size={17} />
          </Pressable>
          <Pressable
            accessibilityLabel={`Open this session's ${activeSessionHands.length} completed hands`}
            accessibilityRole="button"
            onPress={() => setHistoryVisible(true)}
            style={styles.sessionButton}
          >
            <Ionicons color={palette.muted} name="stats-chart-outline" size={15} />
            <Text style={styles.sessionCount}>{activeSessionHands.length}</Text>
          </Pressable>
          {dailyMode ? (
            <View accessibilityLabel="Fair mode. Coaching is off" style={styles.fairModePill}>
              <Ionicons color={palette.aqua} name="shield-checkmark-outline" size={14} />
              <Text style={styles.fairModeText}>Fair</Text>
            </View>
          ) : (
            <View style={styles.coachToggle}>
              <Text style={styles.coachToggleLabel}>Coach</Text>
              <Switch
                accessibilityLabel="Show multiway coaching insights"
                onValueChange={onCoachEnabledChange}
                trackColor={{ false: palette.soft, true: palette.primary }}
                thumbColor={palette.surface}
                value={effectiveCoachEnabled}
              />
            </View>
          )}
        </View>
      </View>

      <View style={styles.tableFrame}>
        <LinearGradient colors={[palette.table, palette.tableDeep]} style={styles.table}>
          <View style={styles.tableRing} />
          {placements.map(({ anchor, playerId }) => {
            const player = game.players[playerId];
            if (!player) return null;
            return (
              <TableSeat
                aiThinking={currentAiThinking === playerId}
                anchor={anchor}
                bigBlind={game.bigBlind}
                compact={compact}
                currentTurn={game.toAct === playerId}
                key={playerId}
                latestAction={latestMultiwaySeatAction(game, playerId)}
                player={player}
                revealCards={playerId === 'hero' || (revealOpponents && !player.folded)}
                role={playerId === game.buttonPlayerId
                  ? playerId === game.smallBlindPlayerId ? 'D · SB' : 'D'
                  : playerId === game.smallBlindPlayerId ? 'SB'
                    : playerId === game.bigBlindPlayerId ? 'BB' : null}
              />
            );
          })}

          <View style={styles.centerZone}>
            <View style={styles.potPill}>
              <Text style={styles.potText}>Pot · {toBb(displayPot, game.bigBlind)}</Text>
            </View>
            <View style={styles.boardRow}>
              {Array.from({ length: 5 }, (_, index) => (
                <PlayingCard card={game.board[index]} compact={!compact} key={`board-${index}`} mini={compact} />
              ))}
            </View>
            <View accessibilityLiveRegion="polite" style={styles.statusCard}>
              <Text style={styles.statusEyebrow}>{game.outcome ? 'Result' : game.history.length > 0 ? 'Just happened' : 'Starting position'}</Text>
              <Text numberOfLines={2} style={styles.latestAction}>{game.outcome ? 'Hand complete' : multiwayLatestActionLabel(game)}</Text>
              {currentAiThinking ? (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator color={palette.aqua} size="small" />
                  <Text numberOfLines={1} style={styles.statusText}>{game.players[currentAiThinking]?.name ?? 'Opponent'} is thinking…</Text>
                </View>
              ) : !game.outcome ? (
                <Text style={styles.statusText}>{heroTurn ? 'Your turn · choose an action below' : 'Waiting for the next player'}</Text>
              ) : null}
            </View>
          </View>
        </LinearGradient>
      </View>

      {resultSummary ? (
        <Pressable
          accessibilityLabel={`${resultSummary.title}. ${resultSummary.detail}. Open hand result details`}
          accessibilityRole="button"
          onPress={() => setResultVisible(true)}
          style={styles.resultBar}
        >
          <View style={[styles.resultIcon, { backgroundColor: resultSummary.tone === 'win' ? palette.aquaSoft : resultSummary.tone === 'tie' ? palette.accentSoft : palette.soft }]}>
            <Ionicons color={resultSummary.tone === 'win' ? palette.aqua : resultSummary.tone === 'tie' ? palette.primary : palette.danger} name={resultSummary.tone === 'win' ? 'trophy-outline' : resultSummary.tone === 'tie' ? 'git-compare-outline' : 'analytics-outline'} size={18} />
          </View>
          <View style={styles.resultCopy}>
            <Text style={styles.resultTitle}>{resultSummary.title} · {resultSummary.heroDelta}</Text>
            <Text numberOfLines={1} style={styles.resultDetail}>{resultSummary.detail}</Text>
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={18} />
        </Pressable>
      ) : effectiveCoachEnabled && game.street !== 'complete' ? (
        <View style={styles.coachBar}>
          <View style={styles.coachIcon}><Ionicons color={palette.aqua} name="sparkles-outline" size={17} /></View>
          <View style={styles.coachCopy}>
            <Text style={styles.coachEyebrow}>{heroTurn ? 'Beginner baseline' : 'Following the action'}</Text>
            <Text style={styles.coachTitle}>{heroTurn ? `Coach suggests · ${coachRecommendation.headline}` : `${game.players[game.toAct ?? '']?.name ?? 'Opponent'} is acting`}</Text>
            <Text numberOfLines={2} style={styles.coachText}>
              {heroTurn ? coachRecommendation.detail : 'Their action badge will stay visible, and your recommendation will update when action returns to you.'}
            </Text>
          </View>
          {heroTurn ? (
            <Pressable accessibilityLabel="Open multiway coach details" accessibilityRole="button" onPress={() => setInsightVisible(true)} style={styles.detailsButton}>
              <Text style={styles.detailsText}>Details</Text>
            </Pressable>
          ) : <View style={styles.detailsButton} />}
        </View>
      ) : null}

      {game.street !== 'complete' ? (
        <View style={styles.actions}>
          <ActionButton disabled={!legal.canFold || !heroTurn} label="Fold" onPress={() => takeAction({ type: 'fold' })} tone="danger" />
          <ActionButton
            disabled={(!legal.canCheck && !legal.canCall) || !heroTurn}
            label={legal.canCheck ? 'Check' : `Call ${toBb(legal.toCall, game.bigBlind)}`}
            onPress={() => takeAction({ type: legal.canCheck ? 'check' : 'call' })}
          />
          <ActionButton
            disabled={!legal.canRaise || !heroTurn}
            label={effectiveCoachEnabled && coachRecommendation.target
              ? `${game.currentBet === 0 ? 'Bet' : 'Raise'} ${toBb(coachRecommendation.target, game.bigBlind)}`
              : game.currentBet === 0 ? 'Bet' : 'Raise'}
            onPress={() => setBetSizingVisible(true)}
            tone="primary"
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <ActionButton label={sessionComplete ? dailyMode ? 'Daily result' : tournamentMode ? 'Tournament result' : 'Session results' : 'Next hand'} onPress={dealNext} tone="primary" />
          <ActionButton label="Review hand" onPress={() => setResultVisible(true)} />
        </View>
      )}

      <BetSizingModal
        bigBlind={game.bigBlind}
        currentBet={game.currentBet}
        legal={legal}
        onClose={() => setBetSizingVisible(false)}
        onConfirm={(target) => takeAction({ type: 'raise', amount: target })}
        playerStreetBet={hero.streetBet}
        pot={game.pot}
        recommendation={effectiveCoachEnabled && coachRecommendation.target ? {
          detail: coachRecommendation.detail,
          target: coachRecommendation.target,
        } : undefined}
        visible={betSizingVisible}
      />

      <SimpleSheet onClose={() => setExitConfirmVisible(false)} visible={exitConfirmVisible}>
        <SheetHeader eyebrow="Unfinished hand" onClose={() => setExitConfirmVisible(false)} title="Leave this table?" />
        <Text style={styles.sheetBody}>
          {tournamentMode
            ? `This unfinished hand will be abandoned. Your ${dailyMode ? 'Daily Challenge' : 'tournament'} is safely saved at the end of the previous hand.`
            : 'This hand will be abandoned. Completed hands remain in your saved history.'}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setExitConfirmVisible(false)} style={styles.primarySheetButton}><Text style={styles.primarySheetButtonText}>Keep playing</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onExit} style={styles.secondarySheetButton}><Text style={styles.secondarySheetButtonText}>Leave table</Text></Pressable>
      </SimpleSheet>

      <SimpleSheet onClose={() => setInsightVisible(false)} visible={insightVisible}>
        <SheetHeader eyebrow="Public information only" onClose={() => setInsightVisible(false)} title="Multiway coach" />
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <View style={styles.metrics}>
            <Metric label="Range equity" value={heroEquity === null ? '—' : `${Math.round(heroEquity * 100)}%`} />
            <Metric label="Required" value={legal.toCall > 0 ? `${Math.round(requiredEquity * 100)}%` : 'Free'} />
            <Metric label="Live opponents" value={String(liveOpponentCount)} />
            <Metric label="Players behind" value={String(playersBehind)} />
          </View>
          <View style={styles.recommendationCard}>
            <Text style={styles.recommendationEyebrow}>Suggested play</Text>
            <Text style={styles.recommendationAction}>{coachRecommendation.headline}</Text>
            <Text style={styles.sheetBody}>{coachRecommendation.detail}</Text>
          </View>
          <View style={styles.explanationCard}>
            <Text style={styles.explanationTitle}>What it means</Text>
            <Text style={styles.sheetBody}>{coachSummary}</Text>
          </View>
          {!dailyMode ? <OpponentReadCard memory={opponentMemory} /> : null}
          <View style={styles.explanationCard}>
            <Text style={styles.explanationTitle}>Fairness guarantee</Text>
            <Text style={styles.sheetBody}>Coaching estimates ranges from visible action. AI opponents can remember your public choices across hands, but never read your cards or the undealt deck.</Text>
          </View>
        </ScrollView>
      </SimpleSheet>

      <SimpleSheet onClose={() => setResultVisible(false)} visible={resultVisible}>
        <SheetHeader eyebrow={`Hand ${game.handNumber} · ${playerCount} players`} onClose={() => setResultVisible(false)} title={resultSummary?.title ?? 'Hand result'} />
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetBody}>{multiwayOutcomeMessage(game)}</Text>
          <View style={styles.metrics}>
            <Metric label="Your result" value={resultSummary?.heroDelta ?? '—'} />
            <Metric label="Final pot" value={resultSummary?.pot ?? '—'} />
            <Metric label="Your stack" value={resultSummary?.heroStack ?? '—'} />
            <Metric label="Showdown" value={game.outcome?.showdown ? 'Yes' : 'No'} />
          </View>
          <View style={styles.payoutList}>
            <Text style={styles.explanationTitle}>Payouts and stacks</Text>
            {game.tablePlayerIds.map((playerId) => {
              const player = game.players[playerId];
              if (!player) return null;
              const award = multiwayPlayerAward(game, playerId);
              return (
                <View key={playerId} style={styles.payoutRow}>
                  <Text style={styles.payoutName}>{player.name}{player.position ? ` · ${player.position}` : ''}</Text>
                  <Text style={styles.payoutValue}>{award > 0 ? `+${toBb(award, game.bigBlind)} · ` : ''}{toBb(player.stack, game.bigBlind)}</Text>
                </View>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setResultVisible(false);
              setReplayHand({
                clientId: handClientId(sessionClientId, game.handNumber),
                completedAt: activeSessionHands.find((hand) => hand.game.handNumber === game.handNumber)?.completedAt ?? new Date().toISOString(),
                game,
                coachResult: null,
                mode: 'multiway',
              });
            }}
            style={styles.replayButton}
          >
            <Ionicons color={palette.primary} name="play-circle-outline" size={19} />
            <Text style={styles.replayButtonText}>Replay this hand</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setResultVisible(false); setFeedbackVisible(true); }} style={styles.secondarySheetButton}>
            <Text style={styles.secondarySheetButtonText}>Send gameplay feedback</Text>
          </Pressable>
        </ScrollView>
      </SimpleSheet>

      <SimpleSheet onClose={() => setSummaryVisible(false)} visible={summaryVisible}>
        <SheetHeader
          eyebrow={sessionComplete ? dailyMode ? 'Daily complete' : tournamentMode ? 'Tournament complete' : 'Session complete' : 'Session progress'}
          onClose={() => setSummaryVisible(false)}
          title={dailyMode
            ? `${dailyChallengeDisplayDate(challengeDate)} · ${dailyScore ?? 0} points`
            : tournamentMode ? tournamentPlace === 1 ? 'You won the Sit & Go' : `Finished ${ordinal(tournamentPlace ?? 3)}` : 'Table results'}
        />
        {tournamentMode ? (
          <>
            <View style={styles.metrics}>
              <Metric label="Place" value={ordinal(tournamentPlace ?? 3)} />
              <Metric label={dailyMode ? 'Score' : 'Hands'} value={dailyMode ? String(dailyScore ?? 0) : String(game.handNumber)} />
              <Metric label={dailyMode ? 'Hands' : 'Final level'} value={dailyMode ? String(game.handNumber) : String(tournamentLevel.level)} />
              <Metric label={dailyMode ? 'Coach' : 'Players'} value={dailyMode ? 'Off' : String(playerCount)} />
            </View>
            <Text style={styles.sheetBody}>
              {dailyMode
                ? 'Your best placement is saved for today. Replay the same table to study a different line, or return tomorrow for a fresh event.'
                : tournamentPlace === 1
                ? 'You are the last player with chips. The tournament is complete.'
                : 'Your stack reached zero. Review the key hands, then try another run with a fresh dealer and deck.'}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.metrics}>
              <Metric label="Hands" value={String(sessionSummary.handsPlayed)} />
              <Metric label="Hands won" value={String(sessionSummary.heroWins)} />
              <Metric label="Net result" value={`${sessionSummary.netBb > 0 ? '+' : ''}${sessionSummary.netBb} BB`} />
              <Metric label="Chip leader" value={sessionSummary.leaderName} />
            </View>
            <Text style={styles.sheetBody}>{completionCopy(practiceCompletionReason, sessionSummary.leaderName)}</Text>
          </>
        )}
        {!dailyMode ? <OpponentReadCard memory={opponentMemory} /> : null}
        <Pressable accessibilityRole="button" onPress={startFreshSession} style={styles.primarySheetButton}><Text style={styles.primarySheetButtonText}>{dailyMode ? "Replay today's table" : 'Play again'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setSummaryVisible(false); onChangeSetup(); }} style={styles.secondarySheetButton}><Text style={styles.secondarySheetButtonText}>{tournamentMode ? 'Back to Play' : 'Change setup'}</Text></Pressable>
      </SimpleSheet>

      <SessionHistoryModal
        hands={activeSessionHands}
        onClose={() => setHistoryVisible(false)}
        onReplay={(hand) => {
          if (hand.mode !== 'multiway') return;
          setHistoryVisible(false);
          setReplayHand(hand);
        }}
        visible={historyVisible}
      />
      <HandReplayModal hand={replayHand} onClose={() => setReplayHand(null)} />
      <BetaFeedbackModal
        context={{ screen: 'multiway_table' }}
        handContext={feedbackHandContext}
        initialCategory="gameplay"
        onClose={() => setFeedbackVisible(false)}
        visible={feedbackVisible}
      />
      <TableGuideModal onClose={() => setGuideVisible(false)} visible={guideVisible} />
    </View>
  );
}

function TableSeat({
  aiThinking,
  anchor,
  bigBlind,
  compact,
  currentTurn,
  latestAction,
  player,
  revealCards,
  role,
}: {
  aiThinking: boolean;
  anchor: MultiwaySeatAnchor;
  bigBlind: number;
  compact: boolean;
  currentTurn: boolean;
  latestAction: string | null;
  player: MultiwayPlayerState;
  revealCards: boolean;
  role: 'D' | 'D · SB' | 'SB' | 'BB' | null;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, compact), [compact, palette]);
  const isHero = player.id === 'hero';
  const state = player.stack === 0
    ? 'Out'
    : player.folded
      ? 'Folded'
    : player.allIn
      ? 'All-in'
      : aiThinking
        ? 'Thinking…'
        : currentTurn
          ? isHero ? 'Your turn' : 'Acting'
          : latestAction;
  return (
    <View
      accessibilityLabel={`${player.name}, ${role ?? player.position ?? 'seat'}, ${toBb(player.stack, bigBlind)}${state ? `, ${state}` : ''}`}
      accessible
      style={[styles.seat, seatAnchorStyle(anchor), currentTurn && styles.seatActive, player.folded && styles.seatFolded, player.stack === 0 && styles.seatOut]}
    >
      <View style={[styles.seatCards, isHero && styles.heroCards]}>
        {Array.from({ length: 2 }, (_, index) => (
          <PlayingCard
            card={revealCards ? player.holeCards[index] : undefined}
            compact={isHero}
            hidden={!revealCards}
            key={`${player.id}-card-${index}`}
            mini={!isHero}
          />
        ))}
      </View>
      <View style={[styles.seatLabel, currentTurn && styles.seatLabelActive]}>
        <View style={styles.seatNameRow}>
          <Text numberOfLines={1} style={styles.seatName}>{player.name}</Text>
          {role
            ? <Text style={styles.roleBadge}>{role}</Text>
            : player.position ? <Text style={styles.positionBadge}>{positionMarker(player.position)}</Text> : null}
        </View>
        <Text numberOfLines={1} style={styles.seatStack}>{toBb(player.stack, bigBlind)}</Text>
        {state ? (
          <View style={[styles.actionBadge, currentTurn && styles.actionBadgeActive]}>
            <Text numberOfLines={1} style={[styles.actionBadgeText, currentTurn && styles.actionBadgeTextActive]}>{state}</Text>
          </View>
        ) : <View style={styles.actionBadgeSpacer} />}
      </View>
    </View>
  );
}

function SimpleSheet({ children, onClose, visible }: { children: React.ReactNode; onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel="Close dialog" onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>{children}</View>
      </View>
    </Modal>
  );
}

function SheetHeader({ eyebrow, onClose, title }: { eyebrow: string; onClose: () => void; title: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetHeaderCopy}><Text style={styles.sheetEyebrow}>{eyebrow}</Text><Text accessibilityRole="header" style={styles.sheetTitle}>{title}</Text></View>
      <Pressable accessibilityLabel="Close dialog" accessibilityRole="button" onPress={onClose} style={styles.iconButton}><Ionicons color={palette.text} name="close" size={20} /></Pressable>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return <View style={styles.metric}><Text numberOfLines={1} style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function toBb(chips: number, bigBlind: number): string {
  return `${Math.round((chips / bigBlind) * 10) / 10} BB`;
}

function ordinal(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  return '3rd';
}

function latestMultiwaySeatAction(game: MultiwayHandState, playerId: string): string | null {
  const action = [...game.history].reverse().find((entry) => (
    entry.playerId === playerId && entry.street === game.street
  ));
  if (!action) return null;
  const actionIndex = game.history.lastIndexOf(action);
  const amount = toBb(action.amount, game.bigBlind);
  if (action.type === 'raise') {
    const priorAggression = game.history.slice(0, actionIndex).some((entry) => (
      entry.street === action.street && entry.type === 'raise'
    ));
    return `${action.street !== 'preflop' && !priorAggression ? 'Bet' : 'Raise to'} ${amount}`;
  }
  if (action.type === 'call') return `Call ${amount}`;
  return action.type === 'check' ? 'Check' : 'Fold';
}

function positionMarker(position: NonNullable<MultiwayPlayerState['position']>): string {
  if (position === 'BTN/SB' || position === 'BTN') return 'BTN';
  return position;
}

function streetName(street: MultiwayHandState['street']): string {
  return street === 'complete' ? 'Complete' : `${street[0]?.toUpperCase()}${street.slice(1)}`;
}

function completionCopy(reason: MultiwaySessionCompletionReason | null, leader: string): string {
  if (reason === 'hero_bust') return `${leader} leads the table. Your stack is below one big blind, so this session is complete.`;
  if (reason === 'table_winner') return `${leader} has every chip at the table.`;
  if (reason === 'target') return `You reached the selected hand target. ${leader} finishes as chip leader.`;
  return `${leader} currently leads the table.`;
}

function seatAnchorStyle(anchor: MultiwaySeatAnchor): ViewStyle {
  switch (anchor) {
    case 'top-left': return { left: '5%', top: '9%' };
    case 'top-center': return { left: '38%', top: '1%' };
    case 'top-right': return { right: '5%', top: '9%' };
    case 'mid-left': return { left: '1%', top: '40%' };
    case 'mid-right': return { right: '1%', top: '40%' };
    case 'hero': return { bottom: '2%', left: '35%' };
  }
}

function createStyles(palette: ThemePalette, compact: boolean) {
  return StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: compact ? 9 : 13, paddingTop: compact ? 3 : 7, paddingBottom: 5, gap: compact ? 6 : 9, backgroundColor: palette.background },
    header: { height: compact ? 40 : 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    handMeta: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    handTitle: { color: palette.text, fontSize: 12, fontWeight: '700' },
    street: { color: palette.muted, fontSize: 9, marginTop: 2 },
    headerControls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    sessionButton: { height: 34, minWidth: 40, paddingHorizontal: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 11, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    guideButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentSoft },
    sessionCount: { color: palette.text, fontSize: 10, fontWeight: '700' },
    coachToggle: { minWidth: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
    coachToggleLabel: { color: palette.muted, fontSize: 9, fontWeight: '600' },
    fairModePill: { height: 30, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, borderRadius: 10, backgroundColor: palette.aquaSoft },
    fairModeText: { color: palette.aquaText, fontSize: 8.5, fontWeight: '800' },
    tableFrame: { flex: 1, minHeight: compact ? 295 : 390 },
    table: { flex: 1, overflow: 'hidden', borderRadius: 132, borderWidth: 1, borderColor: palette.tableLine, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 22, elevation: 5 },
    tableRing: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderRadius: 126, borderWidth: 1, borderColor: palette.tableLine },
    seat: { position: 'absolute', zIndex: 2, width: compact ? 91 : 100, alignItems: 'center', gap: 2, opacity: 1 },
    seatActive: { transform: [{ scale: 1.04 }] },
    seatFolded: { opacity: 0.45 },
    seatOut: { opacity: 0.34 },
    seatCards: { flexDirection: 'row', gap: 2 },
    heroCards: { gap: 4 },
    seatLabel: { width: '100%', minHeight: compact ? 48 : 53, paddingHorizontal: 6, paddingVertical: 4, alignItems: 'center', borderRadius: 10, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    seatLabelActive: { borderColor: palette.aqua, borderWidth: 2 },
    seatNameRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 3 },
    seatName: { color: palette.tableText, fontSize: compact ? 9.5 : 10, fontWeight: '800' },
    positionBadge: { color: palette.background, fontSize: 6.5, fontWeight: '900', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 5, backgroundColor: palette.aqua, overflow: 'hidden' },
    roleBadge: { color: palette.primaryText, fontSize: 7.5, fontWeight: '900', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, backgroundColor: palette.primary, overflow: 'hidden' },
    seatStack: { color: palette.tableText, fontSize: compact ? 8.5 : 9, fontWeight: '600', marginTop: 1 },
    actionBadge: { maxWidth: '100%', minHeight: 17, justifyContent: 'center', marginTop: 2, paddingHorizontal: 6, borderRadius: 6, backgroundColor: palette.tableLine },
    actionBadgeActive: { backgroundColor: palette.aqua },
    actionBadgeText: { color: palette.tableText, fontSize: compact ? 7.5 : 8, fontWeight: '800' },
    actionBadgeTextActive: { color: palette.background },
    actionBadgeSpacer: { height: 19 },
    centerZone: { position: 'absolute', zIndex: 1, left: '18%', right: '18%', top: compact ? '32%' : '34%', alignItems: 'center', gap: compact ? 5 : 8 },
    potPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: 9, fontWeight: '700' },
    boardRow: { flexDirection: 'row', gap: compact ? 2 : 3 },
    statusCard: { minWidth: '82%', maxWidth: '100%', minHeight: compact ? 49 : 58, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    statusEyebrow: { color: palette.tableText, opacity: 0.58, fontSize: 7, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    latestAction: { color: palette.aqua, fontSize: compact ? 10 : 11.5, lineHeight: compact ? 13 : 16, fontWeight: '800', textAlign: 'center' },
    thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    statusText: { color: palette.tableText, fontSize: compact ? 8 : 9, marginTop: 2, textAlign: 'center' },
    resultBar: { minHeight: compact ? 54 : 61, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    resultIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
    resultCopy: { flex: 1 },
    resultTitle: { color: palette.text, fontSize: 11, fontWeight: '700' },
    resultDetail: { color: palette.muted, fontSize: 9, marginTop: 2 },
    coachBar: { minHeight: compact ? 58 : 66, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: compact ? 8 : 11, paddingVertical: compact ? 6 : 8, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    coachIcon: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.aquaSoft },
    coachCopy: { flex: 1 },
    coachEyebrow: { color: palette.aqua, fontSize: 7.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    coachTitle: { color: palette.text, fontSize: 10.5, fontWeight: '800', marginTop: 1 },
    coachText: { color: palette.muted, fontSize: compact ? 8.5 : 9.5, lineHeight: compact ? 12 : 13, marginTop: 2 },
    detailsButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 8 },
    detailsText: { color: palette.primary, fontSize: 10, fontWeight: '700' },
    actions: { flexDirection: 'row', gap: 7 },
    scrim: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: palette.scrim },
    sheet: { maxHeight: '90%', gap: 15, padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetHeaderCopy: { flex: 1 },
    sheetEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    sheetTitle: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 3 },
    sheetContent: { gap: 13 },
    sheetBody: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%', minHeight: 70, justifyContent: 'space-between', padding: 11, borderRadius: 14, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 17, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: 9 },
    explanationCard: { gap: 5, padding: 13, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    recommendationCard: { gap: 5, padding: 14, borderRadius: 16, backgroundColor: palette.aquaSoft },
    recommendationEyebrow: { color: palette.aquaText, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    recommendationAction: { color: palette.aquaText, fontSize: 20, fontWeight: '800' },
    explanationTitle: { color: palette.text, fontSize: 11, fontWeight: '700' },
    payoutList: { gap: 8, padding: 13, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    payoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    payoutName: { flex: 1, color: palette.text, fontSize: 10, fontWeight: '600' },
    payoutValue: { color: palette.muted, fontSize: 10 },
    replayButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: palette.accentSoft },
    replayButtonText: { color: palette.primary, fontSize: 12, fontWeight: '700' },
    primarySheetButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary },
    primarySheetButtonText: { color: palette.primaryText, fontSize: 13, fontWeight: '700' },
    secondarySheetButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    secondarySheetButtonText: { color: palette.text, fontSize: 12, fontWeight: '700' },
  });
}
