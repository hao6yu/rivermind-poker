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
import { AiAvatar } from '../../components/AiAvatar';
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
  championshipOpponentDifficulty,
  championshipQualifies,
  type ChampionshipEvent,
  type ChampionshipResult,
} from '../../domain/poker/championship';
import {
  applyMultiwayAction,
  getMultiwayLegalActions,
  type MultiwayHandState,
  type MultiwayPlayerState,
} from '../../domain/poker/multiway';
import { estimateMultiwayEquity } from '../../domain/poker/multiwayEquity';
import { gradeMultiwayHand } from '../../domain/poker/decisionGrading';
import {
  createMultiwaySessionHand,
  createNextMultiwaySessionHand,
  decideSessionAiAction,
  multiwayAiPacingMs,
  multiwayIsWalk,
  multiwayIdentityMap,
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
  sitAndGoCheckpointStructure,
  sitAndGoBlindLevel,
  sitAndGoCompletion,
  sitAndGoHeroPlace,
  sitAndGoLivePlayerIds,
  type SitAndGoCheckpoint,
} from '../../domain/poker/tournament';
import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import { aiStrategyProfile } from '../../domain/poker/aiProfiles';
import type { PracticeSessionConfig } from '../../domain/poker/session';
import type { CoachFocusArea, PlayerAction } from '../../domain/poker/types';
import {
  observePublicMultiwayHand,
  type HeroHandObservation,
  type OpponentMemory,
} from '../../domain/poker/opponentMemory';
import { createPersistenceClientId, handClientId } from '../../domain/poker/persistence';
import { preflopFacingFromPublicAction } from '../../domain/poker/preflopStrategy';
import { playGameplayHaptic } from '../../services/gameplayHaptics';
import { recordAppDiagnostic } from '../../services/betaFeedback';
import { createMultiwayFeedbackHandContext } from '../../services/betaFeedbackModel';
import {
  loadRecentHandHistory,
  queueMultiwayHandPersistence,
} from '../../services/handHistory';
import { type ThemePalette, useAppTheme } from '../../theme';
import { BetSizingModal } from './BetSizingModal';
import { DecisionReviewCard } from './DecisionReviewCard';
import { BetaFeedbackModal } from '../shell/BetaFeedbackModal';
import { buildLiveCoachRecommendation } from './liveCoach';
import { HandReplayModal } from './HandReplayModal';
import { SessionHistoryModal } from './SessionHistoryModal';
import { SessionLearningCard } from './SessionLearningCard';
import {
  multiwayHeroStackBeforeHand,
  multiwaySeatPlacements,
  visibleMultiwayAiThinking,
  type MultiwaySeatAnchor,
} from './multiwayGameplayPresentation';
import {
  buildLocalizedMultiwayResultSummary,
  localizedCoachHeadline,
  localizedCoachAlternativeDetail,
  localizedCoachAlternativeHeadline,
  localizedCoachDetail,
  localizedSessionLearningVerdict,
  localizedMultiwayLatestAction,
  localizedMultiwayOutcome,
  localizedMultiwayRecentActions,
  localizedStreet,
} from './localizedGameplay';
import {
  summarizeSessionHandLearning,
  type MultiwaySessionHandRecord,
  type SessionHandRecord,
} from './sessionModels';
import { TableGuideModal } from './TableGuideModal';
import { secureRandom } from '../../services/secureRandom';
import { buildTournamentPressure } from '../../domain/poker/tournamentIntelligence';
import { multiwayDifficultyTuning } from '../../domain/poker/multiwayAiProfiles';
import { useLocalization } from '../../localization';
import { championshipEventText } from '../../localization/championship';

interface MultiwayPokerTableScreenProps {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onChangeSetup: () => void;
  onCoachEnabledChange: (value: boolean) => void;
  onExit: () => void;
  onFocusIdentified: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onHeroHandObserved: (observation: HeroHandObservation) => void;
  onPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  opponentMemory: OpponentMemory;
  playerCount: MultiwayTablePlayerCount;
  sessionConfig: PracticeSessionConfig;
  tableMode?: 'practice' | 'sit_and_go' | 'daily_challenge' | 'championship';
  tournamentCheckpoint?: SitAndGoCheckpoint | null;
  onTournamentCheckpointChange?: (checkpoint: SitAndGoCheckpoint | null) => void;
  challengeDate?: string;
  dailyChallengeCheckpoint?: DailyChallengeCheckpoint | null;
  onDailyChallengeCheckpointChange?: (checkpoint: DailyChallengeCheckpoint | null) => void;
  onDailyChallengeComplete?: (result: DailyChallengeResult) => void;
  championshipEvent?: ChampionshipEvent | null;
  onChampionshipComplete?: (result: ChampionshipResult) => void;
}

export function MultiwayPokerTableScreen({
  aiDifficulty,
  coachEnabled,
  onChangeSetup,
  onCoachEnabledChange,
  onExit,
  onFocusIdentified,
  onHeroHandObserved,
  onPracticeFocus,
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
  championshipEvent = null,
  onChampionshipComplete,
}: MultiwayPokerTableScreenProps) {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const compact = height < 730 || width < 370;
  const denseTable = playerCount === 6 && width < 500;
  const styles = useMemo(() => createStyles(palette, compact, denseTable), [compact, denseTable, palette]);
  const dailyMode = tableMode === 'daily_challenge';
  const championshipMode = tableMode === 'championship';
  const competitiveMode = dailyMode || championshipMode;
  const tournamentMode = tableMode !== 'practice';
  if (championshipMode && !championshipEvent) throw new Error('A Championship table requires an event.');
  const tableDifficulty: AiDifficulty = championshipMode
    ? championshipEvent!.aiDifficulty
    : dailyMode ? 'club' : aiDifficulty;
  const tournamentStructureId = championshipMode
    ? tournamentCheckpoint
      ? tournamentCheckpoint.structureId ?? championshipEvent!.structureId
      : championshipEvent!.structureId
    : tournamentCheckpoint ? sitAndGoCheckpointStructure(tournamentCheckpoint) : 'standard';
  const effectiveCoachEnabled = coachEnabled && !competitiveMode;
  const [game, setGame] = useState(() => dailyMode
    ? dailyChallengeCheckpoint
      ? resumeDailyChallenge(dailyChallengeCheckpoint)
      : createDailyChallenge(challengeDate)
    : tournamentMode
      ? tournamentCheckpoint
        ? resumeSitAndGo(tournamentCheckpoint, secureRandom, tournamentStructureId)
        : createSitAndGo(secureRandom, playerCount, tournamentStructureId, tableDifficulty)
      : createMultiwaySessionHand(sessionConfig, playerCount, secureRandom, tableDifficulty));
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
  const reportedChampionshipResults = useRef(new Set<string>());
  const hero = game.players.hero;
  if (!hero) throw new Error('The multiway table is missing the hero seat.');
  const heroTurn = game.toAct === 'hero';
  const currentAiThinking = visibleMultiwayAiThinking(aiThinking, game.toAct);
  const legal = getMultiwayLegalActions(game, 'hero');
  const practiceCompletionReason = tournamentMode ? null : multiwaySessionCompletionReason(game, sessionConfig);
  const tournamentCompletion = tournamentMode ? sitAndGoCompletion(game) : null;
  const sessionComplete = tournamentMode ? tournamentCompletion !== null : practiceCompletionReason !== null;
  const tournamentLevel = sitAndGoBlindLevel(game.handNumber, tournamentStructureId);
  const tournamentPlace = tournamentMode ? sitAndGoHeroPlace(game) : null;
  const dailyScore = dailyMode && tournamentPlace
    ? tournamentPlace === 1 ? 100 : tournamentPlace === 2 ? 70 : 40
    : null;
  const tournamentPlayersLeft = tournamentMode ? sitAndGoLivePlayerIds(game).length : playerCount;
  const tournamentQualifyingPlace = championshipMode ? championshipEvent!.qualifyingPlace : 1;
  const heroTournamentPressure = tournamentMode
    ? buildTournamentPressure(game, 'hero', { enabled: true, qualifyingPlace: tournamentQualifyingPlace })
    : null;
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
    () => buildLocalizedMultiwayResultSummary(game, startingHeroStack, t),
    [game, startingHeroStack, t],
  );
  const localDecisionReport = useMemo(
    () => game.outcome ? gradeMultiwayHand(game) : null,
    [game],
  );
  const sessionSummary = useMemo(
    () => summarizeMultiwaySession(activeSessionHands.map((hand) => hand.game), sessionConfig, game.bigBlind),
    [activeSessionHands, game.bigBlind, sessionConfig],
  );
  const sessionLearningSummary = useMemo(
    () => summarizeSessionHandLearning(activeSessionHands),
    [activeSessionHands],
  );
  const learningVerdict = useMemo(
    () => localizedSessionLearningVerdict(sessionLearningSummary, t),
    [sessionLearningSummary, t],
  );
  const recentActions = useMemo(
    () => localizedMultiwayRecentActions(game, t, 3),
    [game, t],
  );
  const currentAction = recentActions.at(-1) ?? localizedMultiwayLatestAction(game, t);
  const earlierActions = recentActions.slice(0, -1);
  const walkOutcome = multiwayIsWalk(game);
  const walkWinnerId = walkOutcome ? game.outcome?.winnerPlayerIds[0] : null;
  const walkWinnerName = walkWinnerId === 'hero'
    ? t('common.you')
    : walkWinnerId ? game.players[walkWinnerId]?.name ?? 'BB' : null;
  const feedbackHandContext = useMemo(
    () => createMultiwayFeedbackHandContext(game, sessionClientId),
    [game, sessionClientId],
  );

  useEffect(() => {
    if (sessionLearningSummary.topFocusArea) {
      onFocusIdentified(sessionLearningSummary.topFocusArea);
    }
  }, [onFocusIdentified, sessionLearningSummary.topFocusArea]);

  const heroEquity = useMemo(() => {
    if (competitiveMode || !heroTurn || game.street === 'complete') return null;
    const seed = game.handNumber * 100_003 + game.history.length * 997 + game.board.length * 43;
    return estimateMultiwayEquity(createFairMultiwayDecisionState(game, 'hero'), 'hero', {
      identities: multiwayIdentityMap(game, tableDifficulty),
      random: seededRandom(seed),
      simulations: tableDifficulty === 'friendly' ? 72 : tableDifficulty === 'sharp' ? 180 : 120,
    });
  }, [competitiveMode, game, heroTurn, tableDifficulty]);

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
      } else if (championshipMode) {
        if (tournamentCompletion) {
          onTournamentCheckpointChange?.(null);
          const resultKey = `${championshipEvent!.id}:${sessionClientId}`;
          if (tournamentPlace && !reportedChampionshipResults.current.has(resultKey)) {
            reportedChampionshipResults.current.add(resultKey);
            onChampionshipComplete?.({
              eventId: championshipEvent!.id,
              place: tournamentPlace,
              handsPlayed: game.handNumber,
              completedAt,
            });
          }
        } else {
          onTournamentCheckpointChange?.(createSitAndGoCheckpoint(game, tableDifficulty, tournamentStructureId));
        }
      } else if (tournamentCompletion) onTournamentCheckpointChange?.(null);
      else onTournamentCheckpointChange?.(createSitAndGoCheckpoint(game, tableDifficulty, tournamentStructureId));
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
  }, [challengeDate, championshipEvent, championshipMode, dailyMode, effectiveCoachEnabled, game, onChampionshipComplete, onDailyChallengeCheckpointChange, onDailyChallengeComplete, onHeroHandObserved, onTournamentCheckpointChange, sessionClientId, tableDifficulty, tournamentCompletion, tournamentMode, tournamentPlace, tournamentStructureId]);

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
          const decisionDifficulty = championshipMode
            ? championshipOpponentDifficulty(championshipEvent!, playerId)
            : tableDifficulty;
          const decisionSimulations = championshipEvent?.invitational
            ? Math.round(multiwayDifficultyTuning(decisionDifficulty).equitySamples * 1.5)
            : undefined;
          const decision = decideSessionAiAction(
            current,
            playerId,
            decisionDifficulty,
            dailyMode ? dailyChallengeDecisionRandom(challengeDate, current, playerId) : secureRandom,
            dailyMode ? undefined : opponentMemory,
            tournamentMode ? { enabled: true, qualifyingPlace: tournamentQualifyingPlace } : undefined,
            decisionSimulations,
          );
          return applyMultiwayAction(current, playerId, decision.action, {
            estimatedEquity: decision.estimatedEquity,
            tournamentPressureLabel: decision.tournamentPressureLabel ?? undefined,
            tournamentRiskPremium: decision.tournamentRiskPremium,
          });
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
  }, [challengeDate, championshipEvent, championshipMode, competitiveMode, dailyMode, game, opponentMemory, tableDifficulty, tournamentMode, tournamentQualifyingPlace]);

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
    setGame((current) => applyMultiwayAction(current, 'hero', action, {
      estimatedEquity: heroEquity ?? undefined,
      tournamentPressureLabel: heroTournamentPressure?.pressureLabel ?? undefined,
      tournamentRiskPremium: heroTournamentPressure?.riskPremium,
    }));
  };

  const dealNext = () => {
    if (sessionComplete) {
      setSummaryVisible(true);
      return;
    }
    const next = dailyMode
      ? createNextDailyChallengeHand(challengeDate, game)
      : tournamentMode
        ? createNextSitAndGoHand(game, secureRandom, tournamentStructureId)
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
        ? createSitAndGo(secureRandom, playerCount, tournamentStructureId, tableDifficulty)
        : createMultiwaySessionHand(sessionConfig, playerCount, secureRandom, tableDifficulty);
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
  const preflopFacing = preflopFacingFromPublicAction(game.currentBet, game.bigBlind, game.history);
  const preflopAggressorId = [...game.history].reverse().find((action) => (
    action.street === 'preflop' && action.type === 'raise'
  ))?.playerId;
  const preflopAggressor = preflopAggressorId ? game.players[preflopAggressorId] : undefined;
  const preflopRaises = game.history.filter((action) => (
    action.street === 'preflop' && action.type === 'raise'
  ));
  const latestPreflopRaiseIndex = preflopRaises.length > 0
    ? game.history.lastIndexOf(preflopRaises.at(-1)!)
    : -1;
  const callersAfterPreflopRaise = latestPreflopRaiseIndex < 0 ? 0 : game.history
    .slice(latestPreflopRaiseIndex + 1)
    .filter((action) => action.street === 'preflop' && action.type === 'call').length;
  const preflopOpponentChips = preflopFacing === 'raised' && preflopAggressor
    ? preflopAggressor.stack + preflopAggressor.streetBet
    : Math.max(
      game.bigBlind,
      ...game.activePlayerIds
        .filter((playerId) => playerId !== 'hero' && !game.players[playerId]?.folded)
        .map((playerId) => {
          const opponent = game.players[playerId];
          return opponent ? opponent.stack + opponent.streetBet : 0;
        }),
    );
  const coachSummary = game.street === 'preflop'
    ? t('multiway.coach.preflop', { count: game.activePlayerIds.length, position: hero.position ?? '' })
    : heroEquity === null
      ? t('multiway.coach.estimating')
    : legal.toCall > 0
      ? equityMargin !== null && equityMargin >= 0.06
        ? t('multiway.coach.clearsPrice')
        : equityMargin !== null && equityMargin >= 0
          ? t('multiway.coach.closeCall')
          : t('multiway.coach.aboveEquity')
      : playersBehind > 0
        ? t('multiway.coach.freeCheck', { count: playersBehind })
        : t('multiway.coach.actionCloses');
  const coachRecommendation = buildLiveCoachRecommendation({
    bigBlind: game.bigBlind,
    board: game.board,
    cards: hero.holeCards,
    currentBet: game.currentBet,
    effectiveStack: Math.min(
      hero.stack,
      Math.max(
        game.bigBlind,
        ...game.activePlayerIds
          .filter((playerId) => playerId !== 'hero' && !game.players[playerId]?.folded)
          .map((playerId) => game.players[playerId]?.stack ?? 0),
      ),
    ),
    equity: heroEquity,
    initiative: game.currentBet > hero.streetBet
      ? 'opponent'
      : [...game.history].reverse().find((action) => action.type === 'raise')?.playerId === 'hero'
        ? 'player'
        : game.history.some((action) => action.type === 'raise') ? 'opponent' : 'none',
    legal,
    opponentCount: liveOpponentCount,
    playerStreetBet: hero.streetBet,
    playersBehind,
    pot: game.pot,
    preflop: game.street === 'preflop' && hero.position ? {
      cards: hero.holeCards,
      callersAfterRaise: callersAfterPreflopRaise,
      effectiveStackBb: Math.min(
        hero.stack + hero.streetBet,
        preflopOpponentChips,
      ) / game.bigBlind,
      facing: preflopFacing,
      limperCount: game.history.filter((action) => action.street === 'preflop' && action.type === 'call').length,
      playerCount: game.activePlayerIds.length,
      position: hero.position,
      raiseCount: preflopRaises.length,
      raiseSizeBb: preflopFacing === 'raised' ? game.currentBet / game.bigBlind : undefined,
      raiserPosition: preflopAggressor?.position,
    } : undefined,
    street: game.street,
    tournamentPressureLabel: heroTournamentPressure?.pressureLabel,
    tournamentRiskPremium: heroTournamentPressure?.riskPremium,
  });
  const coachHeadline = localizedCoachHeadline(
    coachRecommendation,
    game.currentBet,
    legal.maxRaiseTo,
    game.bigBlind,
    legal.toCall,
    t,
  );
  const localizedCoachCopy = localizedCoachDetail(coachRecommendation, language, game.street, heroEquity, requiredEquity, liveOpponentCount, t);
  const localizedAlternativeCopy = localizedCoachAlternativeDetail(coachRecommendation, language, t);
  const localizedAlternativeHeadline = localizedCoachAlternativeHeadline(coachRecommendation, language, t);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('table.leave')} accessibilityRole="button" onPress={requestExit} style={styles.iconButton}>
          <Ionicons color={palette.text} name="arrow-back" size={19} />
        </Pressable>
        <View style={styles.handMeta}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.handTitle}>
            {championshipMode
              ? t('multiway.hand.championship', { event: championshipEvent!.title, hand: game.handNumber })
              : dailyMode
              ? t('multiway.hand.daily', { hand: game.handNumber })
              : tournamentMode
                ? t('multiway.hand.tournament', { hand: game.handNumber })
              : sessionConfig.handTarget === 'open'
                ? t('multiway.hand.practiceOpen', { count: playerCount, hand: game.handNumber })
                : t('multiway.hand.practiceTarget', { count: playerCount, hand: game.handNumber, target: sessionConfig.handTarget })}
          </Text>
          <Text style={styles.street}>
            {dailyMode
              ? t('multiway.dailyLevel', { bigBlind: game.bigBlind, count: tournamentPlayersLeft, date: dailyChallengeDisplayDate(challengeDate, language), smallBlind: game.smallBlind })
              : tournamentMode
                ? t('multiway.level', { bigBlind: game.bigBlind, count: tournamentPlayersLeft, level: tournamentLevel.level, smallBlind: game.smallBlind })
                : t('multiway.practiceLevel', { street: localizedStreet(game.street, t), difficulty: t(`difficulty.${tableDifficulty}`) })}
          </Text>
        </View>
        <View style={styles.headerControls}>
          <Pressable accessibilityLabel={t('table.openGuide')} accessibilityRole="button" onPress={() => setGuideVisible(true)} style={styles.guideButton}>
            <Ionicons color={palette.primary} name="help-circle-outline" size={17} />
          </Pressable>
          <Pressable
            accessibilityLabel={t('table.sessionHands', { count: activeSessionHands.length })}
            accessibilityRole="button"
            onPress={() => setHistoryVisible(true)}
            style={styles.sessionButton}
          >
            <Ionicons color={palette.muted} name="stats-chart-outline" size={15} />
            <Text style={styles.sessionCount}>{activeSessionHands.length}</Text>
          </Pressable>
          {competitiveMode ? (
            <View accessibilityLabel={t('multiway.fairModeA11y', { mode: championshipMode ? t('home.championship') : t('multiway.fair') })} style={styles.fairModePill}>
              <Ionicons color={palette.aqua} name="shield-checkmark-outline" size={14} />
              <Text style={styles.fairModeText}>{championshipMode ? t('multiway.tour') : t('multiway.fair')}</Text>
            </View>
          ) : (
            <View style={styles.coachToggle}>
              <Text style={styles.coachToggleLabel}>{t('table.coach')}</Text>
              <Switch
                accessibilityLabel={t('multiway.showCoach')}
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
                compact={compact}
                currentTurn={game.toAct === playerId}
                dense={denseTable}
                key={playerId}
                latestAction={latestMultiwaySeatAction(game, playerId, t)}
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
              <Text style={styles.potText}>{t('table.pot', { amount: formatChipAmount(displayPot) })}</Text>
            </View>
            <View style={styles.boardRow}>
              {Array.from({ length: 5 }, (_, index) => (
                <PlayingCard card={game.board[index]} compact key={`board-${index}`} />
              ))}
            </View>
            <View accessibilityLiveRegion="polite" style={styles.statusCard}>
              <Text style={styles.statusEyebrow}>{game.outcome ? walkOutcome ? t('multiway.handCompleteWalk') : t('table.handComplete') : game.history.length > 0 ? t('multiway.streetAction', { street: localizedStreet(game.street, t) }) : t('table.startingPosition')}</Text>
              {walkOutcome
                ? <Text numberOfLines={2} style={styles.actionHistoryText}>{t('multiway.allFolded', { count: game.history.length })}</Text>
                : earlierActions.length > 0 ? <Text numberOfLines={2} style={styles.actionHistoryText}>{earlierActions.join('  ·  ')}</Text> : null}
              <Text numberOfLines={2} style={styles.latestAction}>
                {game.outcome
                  ? walkOutcome ? t('multiway.winBlinds', { player: walkWinnerName ?? t('common.opponent') }) : t('multiway.reviewBelow')
                  : currentAction}
              </Text>
              {currentAiThinking ? (
                <View style={styles.thinkingRow}>
                  <ActivityIndicator color={palette.aqua} size="small" />
                  <Text numberOfLines={1} style={styles.statusText}>{t('multiway.thinking', { player: game.players[currentAiThinking]?.name ?? t('common.opponent') })}</Text>
                </View>
              ) : !game.outcome ? (
                <Text style={styles.statusText}>{heroTurn ? t('table.heroTurnPrompt') : t('multiway.waitingNext')}</Text>
              ) : null}
            </View>
          </View>
        </LinearGradient>
      </View>

      {resultSummary ? (
        <Pressable
          accessibilityLabel={`${resultSummary.title}. ${resultSummary.detail}. ${t('multiway.openResult')}`}
          accessibilityRole="button"
          onPress={() => setResultVisible(true)}
          style={styles.resultBar}
        >
          <View style={[styles.resultIcon, { backgroundColor: resultSummary.tone === 'win' ? palette.aquaSoft : resultSummary.tone === 'tie' ? palette.accentSoft : palette.soft }]}>
            <Ionicons color={resultSummary.tone === 'win' ? palette.aqua : resultSummary.tone === 'tie' ? palette.primary : palette.danger} name={resultSummary.tone === 'win' ? 'trophy-outline' : resultSummary.tone === 'tie' ? 'git-compare-outline' : 'analytics-outline'} size={18} />
          </View>
          <View style={styles.resultCopy}>
            <Text style={styles.resultTitle}>{resultSummary.title} · {resultSummary.headlineAmount}</Text>
            <Text numberOfLines={1} style={styles.resultDetail}>{resultSummary.detail}</Text>
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={18} />
        </Pressable>
      ) : effectiveCoachEnabled && game.street !== 'complete' && heroTurn ? (
        <View style={styles.coachBar}>
          <View style={styles.coachIcon}><Ionicons color={palette.aqua} name="sparkles-outline" size={17} /></View>
          <View style={styles.coachCopy}>
            <Text style={styles.coachTitle}>{coachHeadline}</Text>
            <Text numberOfLines={1} style={styles.coachText}>{localizedCoachCopy}</Text>
          </View>
          <Pressable accessibilityLabel={t('multiway.openCoach')} accessibilityRole="button" onPress={() => setInsightVisible(true)} style={styles.detailsButton}>
            <Ionicons color={palette.primary} name="chevron-forward" size={18} />
          </Pressable>
        </View>
      ) : null}

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
            label={effectiveCoachEnabled && coachRecommendation.target
              ? t(game.currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChipAmount(coachRecommendation.target) })
              : t(game.currentBet === 0 ? 'poker.action.bet' : 'poker.action.raise')}
            onPress={() => setBetSizingVisible(true)}
            tone="primary"
          />
        </View>
      ) : (
        <View style={styles.actions}>
          <ActionButton label={sessionComplete ? dailyMode ? t('multiway.dailySummary') : tournamentMode ? t('multiway.tournamentSummary') : t('multiway.sessionSummary') : t('table.nextHand')} onPress={dealNext} tone="primary" />
          <ActionButton label={t('multiway.reviewFinal')} onPress={() => setResultVisible(true)} />
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
          detail: localizedCoachCopy,
          target: coachRecommendation.target,
        } : undefined}
        visible={betSizingVisible}
      />

      <SimpleSheet onClose={() => setExitConfirmVisible(false)} visible={exitConfirmVisible}>
        <SheetHeader eyebrow={t('multiway.exit.eyebrow')} onClose={() => setExitConfirmVisible(false)} title={t('multiway.exit.title')} />
        <Text style={styles.sheetBody}>
          {tournamentMode
            ? t('multiway.exit.saved')
            : t('multiway.exit.practice')}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setExitConfirmVisible(false)} style={styles.primarySheetButton}><Text style={styles.primarySheetButtonText}>{t('table.keepPlaying')}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onExit} style={styles.secondarySheetButton}><Text style={styles.secondarySheetButtonText}>{t('table.leave')}</Text></Pressable>
      </SimpleSheet>

      <SimpleSheet onClose={() => setInsightVisible(false)} visible={insightVisible}>
        <SheetHeader eyebrow={t('multiway.coach.publicOnly')} onClose={() => setInsightVisible(false)} title={t('multiway.coach.title')} />
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false} style={styles.summaryScroll}>
          <View style={styles.metrics}>
            <Metric label={t('multiway.coach.rangeEquity')} value={heroEquity === null ? '—' : `${Math.round(heroEquity * 100)}%`} />
            <Metric label={t('multiway.coach.required')} value={legal.toCall > 0 ? `${Math.round(requiredEquity * 100)}%` : '0%'} />
            <Metric label={t('multiway.coach.liveOpponents')} value={String(liveOpponentCount)} />
            <Metric label={t('multiway.coach.playersBehind')} value={String(playersBehind)} />
          </View>
          <View style={styles.recommendationCard}>
            <Text style={styles.recommendationAction}>{coachHeadline}</Text>
            <Text style={styles.sheetBody}>{localizedCoachCopy}</Text>
            {language === 'en' && coachRecommendation.basis ? <Text style={styles.recommendationBasis}>{coachRecommendation.basis}</Text> : null}
          </View>
          {coachRecommendation.alternative ? (
            <View style={styles.explanationCard}>
              <Text style={styles.explanationTitle}>{t('table.insight.compare')} · {localizedAlternativeHeadline}</Text>
              <Text style={styles.sheetBody}>{localizedAlternativeCopy}</Text>
            </View>
          ) : null}
          <View style={styles.explanationCard}>
            <Text style={styles.explanationTitle}>{t('table.insight.meaning')}</Text>
            <Text style={styles.sheetBody}>{coachSummary}</Text>
          </View>
          {!dailyMode ? <OpponentReadCard memory={opponentMemory} /> : null}
          <Text style={styles.coachFootnote}>{t('multiway.coach.fairnessNote')}</Text>
        </ScrollView>
      </SimpleSheet>

      <SimpleSheet onClose={() => setResultVisible(false)} visible={resultVisible}>
        <SheetHeader eyebrow={t('multiway.result.header', { count: playerCount, hand: game.handNumber })} onClose={() => setResultVisible(false)} title={resultSummary?.title ?? t('multiway.result.title')} />
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.sheetBody}>{localizedMultiwayOutcome(game, t)}</Text>
          <View style={styles.metrics}>
            <Metric label={t('multiway.result.yourResult')} value={resultSummary?.heroDelta ?? '—'} />
            <Metric label={t('multiway.result.finalPot')} value={resultSummary?.pot ?? '—'} />
            <Metric label={t('multiway.result.yourStack')} value={resultSummary?.heroStack ?? '—'} />
            <Metric label={t('multiway.result.showdown')} value={game.outcome?.showdown ? t('multiway.result.yes') : t('multiway.result.no')} />
          </View>
          {localDecisionReport?.decisions.length ? (
            <View style={styles.handDecisionSection}>
              <Text style={styles.explanationTitle}>{t('multiway.result.keyDecision')}</Text>
              <Text style={styles.handDecisionContext}>{t('multiway.result.keyDecisionContext', { hand: game.handNumber })}</Text>
              <DecisionReviewCard comparison={localDecisionReport.decisions.find((decision) => decision.sequence === localDecisionReport.focusDecisionSequence) ?? localDecisionReport.decisions[0]!} />
            </View>
          ) : null}
          <View style={styles.payoutList}>
            <Text style={styles.explanationTitle}>{t('multiway.result.payouts')}</Text>
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
            <Text style={styles.replayButtonText}>{t('table.review.compareEvery')}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setResultVisible(false); setFeedbackVisible(true); }} style={styles.secondarySheetButton}>
            <Text style={styles.secondarySheetButtonText}>{t('multiway.result.feedback')}</Text>
          </Pressable>
        </ScrollView>
      </SimpleSheet>

      <SimpleSheet onClose={() => setSummaryVisible(false)} visible={summaryVisible}>
        <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
          <SheetHeader
            eyebrow={sessionComplete
              ? t(championshipMode ? 'summary.eyebrow.championship' : dailyMode ? 'summary.eyebrow.daily' : tournamentMode ? 'summary.eyebrow.tournament' : 'summary.eyebrow.session')
              : t('summary.eyebrow.progress')}
            onClose={() => setSummaryVisible(false)}
            title={championshipMode
              ? championshipQualifies(championshipEvent!, tournamentPlace ?? playerCount)
                ? championshipEvent!.id === 'river_below'
                  ? t('summary.belowChampion')
                  : championshipEvent!.id === 'championship_final'
                    ? t('summary.champion')
                    : t('summary.qualified', { event: championshipEventText(championshipEvent!, 'title', t) })
                : t('summary.finished', { place: tournamentPlace ?? playerCount })
              : dailyMode
                ? t('summary.dailyTitle', { date: dailyChallengeDisplayDate(challengeDate, language), score: dailyScore ?? 0 })
                : tournamentMode ? tournamentPlace === 1 ? t('summary.wonSitGo') : t('summary.finished', { place: tournamentPlace ?? 3 }) : t('summary.tableResults')}
          />
          {tournamentMode ? (
            <>
              <View style={styles.metrics}>
                <Metric label={t('summary.place')} value={t('summary.placeNumber', { place: tournamentPlace ?? 3 })} />
                <Metric label={t(dailyMode ? 'summary.score' : 'summary.hands')} value={dailyMode ? String(dailyScore ?? 0) : String(game.handNumber)} />
                <Metric label={t(dailyMode ? 'summary.hands' : 'summary.finalLevel')} value={dailyMode ? String(game.handNumber) : String(tournamentLevel.level)} />
                <Metric
                  label={t(championshipMode ? 'summary.target' : dailyMode ? 'summary.coach' : 'summary.players')}
                  value={championshipMode ? t('summary.topTarget', { place: championshipEvent!.qualifyingPlace }) : dailyMode ? t('summary.off') : String(playerCount)}
                />
              </View>
              <Text style={styles.sheetBody}>
                {championshipMode
                  ? championshipQualifies(championshipEvent!, tournamentPlace ?? playerCount)
                    ? championshipEvent!.id === 'river_below'
                      ? t('summary.body.belowChampion')
                      : championshipEvent!.id === 'championship_final'
                        ? t('summary.body.champion')
                        : t('summary.body.qualified', { place: championshipEvent!.qualifyingPlace })
                    : t('summary.body.retry', { place: championshipEvent!.qualifyingPlace })
                  : dailyMode
                  ? t('summary.body.daily')
                  : tournamentPlace === 1
                  ? t('summary.body.tournamentWin')
                  : t('summary.body.tournamentBust')}
              </Text>
            </>
          ) : (
            <>
              <View style={styles.metrics}>
                <Metric label={t('summary.hands')} value={String(sessionSummary.handsPlayed)} />
                <Metric label={t('summary.handsWon')} value={String(sessionSummary.heroWins)} />
                <Metric label={t('summary.netResult')} value={`${sessionSummary.netBb > 0 ? '+' : ''}${sessionSummary.netBb} BB`} />
                <Metric label={t('summary.chipLeader')} value={sessionSummary.leaderName} />
              </View>
              <Text style={styles.sheetBody}>{localizedCompletionCopy(practiceCompletionReason, sessionSummary.leaderName, t)}</Text>
            </>
          )}
          <View style={styles.sessionReviewCard}>
            <Text style={styles.sessionReviewEyebrow}>{t(tournamentMode ? 'summary.review.tournament' : 'summary.review.session')}</Text>
            <Text style={styles.sessionReviewTitle}>{learningVerdict.title}</Text>
            <Text style={styles.sessionReviewText}>{learningVerdict.detail}</Text>
            <View style={styles.sessionReviewMetrics}>
              <View style={styles.sessionReviewMetric}>
                <Text style={styles.sessionReviewMetricValue}>{sessionLearningSummary.strongRate ?? 0}%</Text>
                <Text numberOfLines={2} style={styles.sessionReviewMetricLabel}>{t('summary.review.strong')}</Text>
              </View>
              <View style={styles.sessionReviewMetric}>
                <Text style={styles.sessionReviewMetricValue}>{sessionLearningSummary.reviewSpots}</Text>
                <Text numberOfLines={2} style={styles.sessionReviewMetricLabel}>{t('summary.review.spots')}</Text>
              </View>
              <View style={styles.sessionReviewMetric}>
                <Text style={styles.sessionReviewMetricValue}>{sessionLearningSummary.decisionsGraded}</Text>
                <Text numberOfLines={2} style={styles.sessionReviewMetricLabel}>{t('summary.review.decisions')}</Text>
              </View>
            </View>
            <Text style={styles.sessionReviewFootnote}>{t('summary.review.footnote')}</Text>
          </View>
          <SessionLearningCard
            onPracticeFocus={(focus) => {
              setSummaryVisible(false);
              onPracticeFocus(focus);
            }}
            summary={sessionLearningSummary}
          />
          {!competitiveMode ? <OpponentReadCard memory={opponentMemory} /> : null}
        </ScrollView>
        <View style={styles.summaryActions}>
          {activeSessionHands.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => { setSummaryVisible(false); setHistoryVisible(true); }} style={styles.primarySheetButton}><Text numberOfLines={2} style={styles.primarySheetButtonText}>{t('summary.reviewEvery')}</Text></Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={startFreshSession} style={styles.secondarySheetButton}><Text numberOfLines={2} style={styles.secondarySheetButtonText}>{t(championshipMode ? 'summary.retryEvent' : dailyMode ? 'summary.replayToday' : 'summary.playAgain')}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setSummaryVisible(false); onChangeSetup(); }} style={styles.secondarySheetButton}><Text numberOfLines={2} style={styles.secondarySheetButtonText}>{t(championshipMode ? 'summary.championshipMap' : tournamentMode ? 'summary.backToPlay' : 'summary.changeSetup')}</Text></Pressable>
        </View>
      </SimpleSheet>

      <SessionHistoryModal
        hands={activeSessionHands}
        onClose={() => setHistoryVisible(false)}
        onPracticeFocus={onPracticeFocus}
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
      <TableGuideModal onClose={() => setGuideVisible(false)} street={game.street} visible={guideVisible} />
    </View>
  );
}

function TableSeat({
  aiThinking,
  anchor,
  compact,
  currentTurn,
  dense,
  latestAction,
  player,
  revealCards,
  role,
}: {
  aiThinking: boolean;
  anchor: MultiwaySeatAnchor;
  compact: boolean;
  currentTurn: boolean;
  dense: boolean;
  latestAction: string | null;
  player: MultiwayPlayerState;
  revealCards: boolean;
  role: 'D' | 'D · SB' | 'SB' | 'BB' | null;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, compact, dense), [compact, dense, palette]);
  const isHero = player.id === 'hero';
  const playerName = isHero ? t('common.you') : player.name;
  const state = player.stack === 0
    ? t('multiway.state.out')
    : player.folded
      ? t('multiway.state.folded')
      : player.allIn
      ? t('multiway.state.allIn')
      : aiThinking
        ? t('table.thinking')
        : currentTurn
          ? isHero ? t('table.yourTurn') : t('table.acting')
          : latestAction;
  return (
    <View
      accessibilityLabel={`${playerName}, ${role ?? ''}, ${formatChipAmount(player.stack)}${state ? `, ${state}` : ''}`}
      accessible
      style={[styles.seat, dense && !isHero && styles.denseOpponentSeat, seatAnchorStyle(anchor, dense), currentTurn && styles.seatActive, player.stack === 0 && styles.seatOut]}
    >
      <View style={[styles.seatCards, isHero && styles.heroCards, player.folded && styles.seatCardsFolded]}>
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
      <View style={[styles.seatLabel, player.folded && styles.seatLabelFolded, currentTurn && styles.seatLabelActive]}>
        <View style={styles.seatNameRow}>
          {!isHero ? <AiAvatar name={player.name} size={dense ? 24 : 28} /> : null}
          <Text numberOfLines={1} style={styles.seatName}>{playerName}</Text>
        </View>
        <Text numberOfLines={1} style={styles.seatStack}>{formatChipAmount(player.stack)}</Text>
        {state ? (
          <View style={[styles.actionBadge, player.folded && styles.actionBadgeFolded, currentTurn && styles.actionBadgeActive]}>
            <Text numberOfLines={1} style={[styles.actionBadgeText, currentTurn && styles.actionBadgeTextActive]}>{state}</Text>
          </View>
        ) : <View style={styles.actionBadgeSpacer} />}
      </View>
      {/* The blind and button markers sit under the plaque rather than beside
          the name. Sharing the name's row left a six-max seat about 20px of
          text width, and these three seats are the ones a player scans for
          first, so they read better as their own marker. The dealer keeps the
          light disc of the physical button; the blinds take the accent. */}
      {role ? (
        <View style={[styles.roleMarker, role.startsWith('D') && styles.roleMarkerDealer]}>
          <Text style={[styles.roleMarkerText, role.startsWith('D') && styles.roleMarkerTextDealer]}>{role}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SimpleSheet({ children, onClose, visible }: { children: React.ReactNode; onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('multiway.dialog.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>{children}</View>
      </View>
    </Modal>
  );
}

function SheetHeader({ eyebrow, onClose, title }: { eyebrow: string; onClose: () => void; title: string }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetHeaderCopy}><Text numberOfLines={2} style={styles.sheetEyebrow}>{eyebrow}</Text><Text accessibilityRole="header" numberOfLines={2} style={styles.sheetTitle}>{title}</Text></View>
      <Pressable accessibilityLabel={t('multiway.dialog.close')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}><Ionicons color={palette.text} name="close" size={20} /></Pressable>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  return <View style={styles.metric}><Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.metricValue}>{value}</Text><Text numberOfLines={2} style={styles.metricLabel}>{label}</Text></View>;
}

function toBb(chips: number, bigBlind: number): string {
  return `${Math.round((chips / bigBlind) * 10) / 10} BB`;
}

function formatChipAmount(chips: number): string {
  const absolute = Math.abs(chips);
  if (absolute < 1_000) return String(Math.round(chips));
  const compact = Math.round((chips / 1_000) * 10) / 10;
  return `${compact}K`;
}

function latestMultiwaySeatAction(
  game: MultiwayHandState,
  playerId: string,
  t: ReturnType<typeof useLocalization>['t'],
): string | null {
  const action = [...game.history].reverse().find((entry) => (
    entry.playerId === playerId && entry.street === game.street
  ));
  if (!action) return null;
  const actionIndex = game.history.lastIndexOf(action);
  const amount = formatChipAmount(action.amount);
  if (action.type === 'raise') {
    const priorAggression = game.history.slice(0, actionIndex).some((entry) => (
      entry.street === action.street && entry.type === 'raise'
    ));
    return t(action.street !== 'preflop' && !priorAggression ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount });
  }
  if (action.type === 'call') return t('poker.action.callAmount', { amount });
  return t(action.type === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

function localizedCompletionCopy(
  reason: MultiwaySessionCompletionReason | null,
  leader: string,
  t: ReturnType<typeof useLocalization>['t'],
): string {
  if (reason === 'hero_bust') return t('summary.body.heroBust', { leader });
  if (reason === 'table_winner') return t('summary.body.tableWinner', { leader });
  if (reason === 'target') return t('summary.body.target', { leader });
  return t('summary.body.progress', { leader });
}

function seatAnchorStyle(anchor: MultiwaySeatAnchor, dense = false): ViewStyle {
  switch (anchor) {
    case 'top-left': return { left: '5%', top: '9%' };
    case 'top-center': return { left: '38%', top: '1%' };
    case 'top-right': return { right: '5%', top: '9%' };
    case 'mid-left': return { left: '3%', top: dense ? '58%' : '43%' };
    case 'mid-right': return { right: '3%', top: dense ? '58%' : '43%' };
    case 'hero': return { bottom: '2%', left: '35%' };
  }
}

function createStyles(palette: ThemePalette, compact: boolean, dense = false) {
  return StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: compact ? 9 : 13, paddingTop: compact ? 3 : 7, paddingBottom: 5, gap: compact ? 6 : 9, backgroundColor: palette.background },
    header: { height: compact ? 40 : 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    handMeta: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 },
    handTitle: { maxWidth: '100%', color: palette.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
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
    table: { flex: 1, overflow: 'hidden', borderRadius: 38, borderWidth: 1, borderColor: palette.tableLine, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 22, elevation: 5 },
    tableRing: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderRadius: 32, borderWidth: 1, borderColor: palette.tableLine },
    seat: { position: 'absolute', zIndex: 2, width: compact ? 91 : 100, alignItems: 'center', gap: 2, opacity: 1 },
    denseOpponentSeat: { width: 76 },
    seatActive: { transform: [{ scale: 1.04 }] },
    seatOut: { opacity: 0.34 },
    seatCards: { flexDirection: 'row', gap: 2 },
    seatCardsFolded: { opacity: 0.3 },
    heroCards: { gap: 4 },
    seatLabel: { width: '100%', minHeight: compact ? 46 : dense ? 48 : 51, paddingHorizontal: dense ? 3 : 5, paddingVertical: 4, alignItems: 'center', borderRadius: 10, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    seatLabelFolded: { borderColor: palette.tableLine },
    seatLabelActive: { borderColor: palette.aqua, borderWidth: 2 },
    seatNameRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: dense ? 2 : 3 },
    seatName: { flexShrink: 1, color: palette.tableText, fontSize: compact ? 9.5 : 10, fontWeight: '800' },
    roleMarker: { marginTop: 2, paddingHorizontal: dense ? 6 : 7, paddingVertical: 1.5, borderRadius: 8, backgroundColor: palette.primary },
    roleMarkerDealer: { backgroundColor: palette.tableText },
    roleMarkerText: { color: palette.primaryText, fontSize: dense ? 8 : 8.5, fontWeight: '900', letterSpacing: 0.2 },
    roleMarkerTextDealer: { color: palette.tableDeep },
    seatStack: { color: palette.tableText, fontSize: compact ? 8.5 : 9, fontWeight: '600', marginTop: 1 },
    actionBadge: { maxWidth: dense ? 88 : '100%', minHeight: 17, justifyContent: 'center', marginTop: 2, paddingHorizontal: dense ? 4 : 6, borderRadius: 6, backgroundColor: palette.tableLine },
    actionBadgeFolded: { backgroundColor: palette.tableLine },
    actionBadgeActive: { backgroundColor: palette.aqua },
    actionBadgeText: { color: palette.tableText, fontSize: compact ? 7.5 : dense ? 7.25 : 8, fontWeight: '800' },
    actionBadgeTextActive: { color: palette.background },
    actionBadgeSpacer: { height: 19 },
    centerZone: { position: 'absolute', zIndex: 1, left: dense ? '24%' : '18%', right: dense ? '24%' : '18%', top: compact ? '30%' : dense ? '30%' : '34%', alignItems: 'center', gap: compact || dense ? 5 : 8 },
    potPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: 9, fontWeight: '700' },
    boardRow: { flexDirection: 'row', gap: compact ? 2 : 3 },
    statusCard: { minWidth: dense ? '100%' : '82%', maxWidth: '100%', minHeight: compact ? 49 : dense ? 66 : 58, paddingHorizontal: 8, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    statusEyebrow: { color: palette.tableText, opacity: 0.58, fontSize: 7, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    actionHistoryText: { color: palette.tableText, opacity: 0.68, fontSize: compact || dense ? 7 : 8, lineHeight: compact || dense ? 10 : 11, marginTop: 2, textAlign: 'center' },
    latestAction: { color: palette.aqua, fontSize: compact ? 10 : 11.5, lineHeight: compact ? 13 : 16, fontWeight: '800', textAlign: 'center' },
    thinkingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
    statusText: { color: palette.tableText, fontSize: compact ? 8 : 9, marginTop: 2, textAlign: 'center' },
    resultBar: { minHeight: compact ? 54 : 61, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    resultIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
    resultCopy: { flex: 1 },
    resultTitle: { color: palette.text, fontSize: 11, fontWeight: '700' },
    resultDetail: { color: palette.muted, fontSize: 9, marginTop: 2 },
    coachBar: { minHeight: compact ? 52 : 57, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: compact ? 8 : 11, paddingVertical: compact ? 6 : 7, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    coachIcon: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.aquaSoft },
    coachCopy: { flex: 1, minWidth: 0 },
    coachTitle: { color: palette.text, fontSize: 10.5, fontWeight: '800' },
    coachText: { color: palette.muted, fontSize: compact ? 8.5 : 9.5, lineHeight: compact ? 12 : 13, marginTop: 2 },
    detailsButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    actions: { flexDirection: 'row', gap: 7 },
    scrim: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: palette.scrim },
    sheet: { maxHeight: '90%', gap: 15, padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetHeaderCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
    sheetEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
    sheetTitle: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 3 },
    sheetContent: { gap: 13 },
    sheetBody: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    summaryScroll: { flexShrink: 1 },
    summaryActions: { gap: 8 },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%', minHeight: 70, justifyContent: 'space-between', padding: 11, borderRadius: 14, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 17, fontWeight: '700' },
    metricLabel: { minHeight: 22, color: palette.muted, fontSize: 9, lineHeight: 11 },
    explanationCard: { gap: 5, padding: 13, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    recommendationCard: { gap: 5, padding: 14, borderRadius: 16, backgroundColor: palette.aquaSoft },
    recommendationAction: { color: palette.aquaText, fontSize: 20, fontWeight: '800' },
    recommendationBasis: { color: palette.aquaText, fontSize: 9, lineHeight: 13, fontWeight: '600', opacity: 0.78, marginTop: 2 },
    coachFootnote: { color: palette.muted, fontSize: 9, lineHeight: 13, textAlign: 'center', paddingHorizontal: 10 },
    explanationTitle: { color: palette.text, fontSize: 11, fontWeight: '700' },
    handDecisionSection: { gap: 7 },
    handDecisionContext: { color: palette.muted, fontSize: 9, lineHeight: 13 },
    sessionReviewCard: { gap: 5, padding: 14, borderRadius: 16, backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.border },
    sessionReviewEyebrow: { color: palette.primary, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    sessionReviewTitle: { color: palette.text, fontSize: 16, lineHeight: 21, fontWeight: '800' },
    sessionReviewText: { color: palette.muted, fontSize: 10, lineHeight: 15 },
    sessionReviewMetrics: { flexDirection: 'row', gap: 6, marginTop: 4 },
    sessionReviewMetric: { flex: 1, gap: 1, padding: 8, borderRadius: 10, backgroundColor: palette.surface },
    sessionReviewMetricValue: { color: palette.text, fontSize: 14, fontWeight: '800' },
    sessionReviewMetricLabel: { minHeight: 18, color: palette.muted, fontSize: 7.5, lineHeight: 9 },
    sessionReviewFootnote: { color: palette.muted, fontSize: 8, lineHeight: 12, marginTop: 2 },
    payoutList: { gap: 8, padding: 13, borderRadius: 15, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    payoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    payoutName: { flex: 1, color: palette.text, fontSize: 10, fontWeight: '600' },
    payoutValue: { color: palette.muted, fontSize: 10 },
    replayButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: palette.accentSoft },
    replayButtonText: { color: palette.primary, fontSize: 12, fontWeight: '700' },
    primarySheetButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary },
    primarySheetButtonText: { flexShrink: 1, paddingHorizontal: 12, color: palette.primaryText, fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
    secondarySheetButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    secondarySheetButtonText: { flexShrink: 1, paddingHorizontal: 12, color: palette.text, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
  });
}
