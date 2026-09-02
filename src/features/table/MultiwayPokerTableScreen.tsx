import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useHardwareBackConfirmation } from '../../hooks/useHardwareBackConfirmation';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  PixelRatio,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton } from '../../components/ActionButton';
import { AiAvatar } from '../../components/AiAvatar';
import { AiPlayerProfile } from '../../components/AiPlayerProfile';
import { HumanAvatar } from '../../components/HumanAvatar';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayingCard } from '../../components/PlayingCard';
import { OpponentReadCard } from '../../components/OpponentReadCard';
import { DEFAULT_HUMAN_AVATAR, type HumanAvatarReference } from '../../domain/playerProfile';
import { cardLabel, seededRandom } from '../../domain/poker/cards';
import {
  scoreTableMission,
  tableMissionDecisions,
  type TableMissionDefinition,
  type TableMissionResult,
  type TableMissionScoringProfile,
} from '../../domain/learning/tableMissions';
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
  type MultiwayActionRecord,
  type MultiwayHandState,
  type MultiwayPlayerState,
} from '../../domain/poker/multiway';
import { estimateMultiwayEquity } from '../../domain/poker/multiwayEquity';
import { gradeMultiwayHand } from '../../domain/poker/decisionGrading';
import { classifyDecision, presentationRank, type DecisionPresentationClass } from '../../domain/poker/decisionReviewPresentation';
import {
  createMultiwaySessionHand,
  createNextMultiwaySessionHand,
  decideSessionAiAction,
  multiwayAiPacingMs,
  type TablePace,
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
  DEFAULT_SIT_AND_GO_PLAYER_COUNT,
  resumeSitAndGo,
  sitAndGoCheckpointStructure,
  sitAndGoBlindLevel,
  sitAndGoCompletion,
  sitAndGoHeroPlace,
  sitAndGoLivePlayerIds,
  type SitAndGoBlindSpeed,
  type SitAndGoCheckpoint,
  type SitAndGoPlayerCount,
} from '../../domain/poker/tournament';
import { InvitationTurnClock, invitationClockAppStateReaction, invitationClockSecondsLabel, INVITATION_CLOCK_CRITICAL_MS, INVITATION_CLOCK_WARNING_MS, type InvitationClockPhase } from '../../domain/poker/invitationTurnClock';
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
import { useGameplayFeedback } from '../../services/GameplayFeedbackProvider';
import { recordAppDiagnostic } from '../../services/betaFeedback';
import { createMultiwayFeedbackHandContext } from '../../services/betaFeedbackModel';
import { loadHumanAvatar } from '../../services/playerProfile';
import {
  loadRecentHandHistory,
  queueMultiwayHandPersistence,
} from '../../services/handHistory';
import { type ThemePalette, useAppTheme } from '../../theme';
import { BetSizingModal } from './BetSizingModal';
import { DecisionReviewCard } from './DecisionReviewCard';
import { BetaFeedbackModal } from '../shell/BetaFeedbackModal';
import { buildLiveCoachRecommendation } from './liveCoach';
import { formatChips, formatChipsCompact, formatChipsSigned } from '../../domain/poker/moneyFormat';
import { HandReplayModal } from './HandReplayModal';
import { SessionHistoryModal } from './SessionHistoryModal';
import { SessionLearningCard } from './SessionLearningCard';
import { InlineCoachPanel } from './InlineCoachPanel';
import {
  tableContinuationActions,
  type TableContinuationAction,
  type TableContinuationMode,
} from './sessionContinuation';
import {
  multiwayActionBubbleDurationMs,
  multiwayActionRecordIsAllIn,
  multiwayHeroStackBeforeHand,
  multiwayReadableAiDelayMs,
  multiwaySeatActionBubblePlacement,
  multiwaySeatPlacements,
  multiwaySeatRoleBadge,
  type MultiwaySeatRoleBadge,
  resolveMultiwayBubbleFrame,
  visibleMultiwayAiThinking,
  type MultiwaySeatAnchor,
} from './multiwayGameplayPresentation';
import type { MultiwayLayoutRect } from './multiwayTableLayout';
import {
  buildLocalizedMultiwayResultSummary,
  localizedCoachHeadline,
  localizedCoachAlternativeDetail,
  localizedCoachAlternativeHeadline,
  localizedCoachDetail,
  localizedSessionLearningVerdict,
  localizedMultiwayOutcome,
  localizedMultiwaySeatAction,
  localizedStreet,
} from './localizedGameplay';
import {
  summarizeSessionHandLearning,
  type MultiwaySessionHandRecord,
  type SessionHandRecord,
} from './sessionModels';
import { TableGuideModal } from './TableGuideModal';
import { loadPlayStatistics } from '../../services/playStatistics';
import { PlayStatisticsCard } from '../profile/PlayStatisticsCard';
import { playStatisticsRecordTitle } from '../profile/playStatisticsPresentation';
import type { PlayStatistics } from '../../domain/stats/playStatistics';
import { loadPlayerDisplayName } from '../../services/playerProfile';
import { TableActivityFeed } from './TableActivityFeed';
import { SharedTableBoard } from './SharedTableBoard';
import { projectMultiwayTableActivity } from './tableActivity';
import { tableActivityLayout } from './tableActivityLayout';
import { sharedTableVisualDensity } from './tableVisualDensity';
import { sharedTableSeatVisualTreatment, type SharedTableSeatDensity } from './sharedTableSeatPresentation';
import { LIVE_TABLE_HEADER_CONTROL_SIZE, TableOrientationControl } from './TableOrientationControl';
import { multiwaySeatAnchorStyle, multiwayTableLayout, resolveMeasuredTableLayout, type MeasuredTableLayoutResult } from './multiwayTableLayout';
import { showsExpandedPortraitCoach } from './tableResponsiveLayout';
import {
  LIVE_TABLE_SUPPORTED_ORIENTATIONS,
  type LiveTableOrientationControl,
} from './useTableOrientation';
import { secureRandom } from '../../services/secureRandom';
import { buildTournamentPressure } from '../../domain/poker/tournamentIntelligence';
import { multiwayAiIdentityForName, multiwayDifficultyTuning } from '../../domain/poker/multiwayAiProfiles';
import { type MessageKey, useLocalization } from '../../localization';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { championshipEventText } from '../../localization/championship';
import {
  buildMultiplayerActionBubblePresentation,
  type MultiplayerActionBubblePresentation,
} from '../multiplayer/multiplayerGamePresentation';
import {
  ActionBubbleText,
  useActionBubbleAnnouncement,
} from '../../components/ActionBubbleText';
import {
  gameplayCueForAction,
  isLiveBoardReveal,
  localActionPresentationPending,
  localTableFeedbackStep,
  localTerminalResultSchedule,
  multiwayResultKind,
  planLocalTableFeedback,
  type LocalTableActionFeedback,
} from './gameplayFeedbackEvents';

const missionScoreNoteKey: Record<TableMissionScoringProfile, MessageKey> = {
  preflop: 'mission.tableScoreNote.preflop',
  'flop-initiative': 'mission.tableScoreNote.flopInitiative',
  river: 'mission.tableScoreNote.river',
  tournament: 'mission.tableScoreNote.tournament',
  adjustment: 'mission.tableScoreNote.adjustment',
};

const missionDecisionLabelKey: Record<TableMissionScoringProfile, MessageKey> = {
  preflop: 'mission.gradedDecisions.preflop',
  'flop-initiative': 'mission.gradedDecisions.flopInitiative',
  river: 'mission.gradedDecisions.river',
  tournament: 'mission.gradedDecisions.tournament',
  adjustment: 'mission.gradedDecisions.adjustment',
};

const missionSummaryBodyKey: Record<TableMissionScoringProfile, MessageKey> = {
  preflop: 'mission.summaryBody.preflop',
  'flop-initiative': 'mission.summaryBody.flopInitiative',
  river: 'mission.summaryBody.river',
  tournament: 'mission.summaryBody.tournament',
  adjustment: 'mission.summaryBody.adjustment',
};

const missionScoreFootnoteKey: Record<TableMissionScoringProfile, MessageKey> = {
  preflop: 'mission.scoreFootnote.preflop',
  'flop-initiative': 'mission.scoreFootnote.flopInitiative',
  river: 'mission.scoreFootnote.river',
  tournament: 'mission.scoreFootnote.tournament',
  adjustment: 'mission.scoreFootnote.adjustment',
};

interface MultiwayPokerTableScreenProps {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onChangeSetup: () => void;
  onCoachEnabledChange: (value: boolean) => void;
  onExit: () => void;
  onFocusIdentified: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onHeroHandObserved: (observation: HeroHandObservation) => void;
  onPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  learningMission?: TableMissionDefinition | null;
  onLearningMissionComplete?: (result: TableMissionResult) => void;
  opponentMemory: OpponentMemory;
  orientation: LiveTableOrientationControl;
  playerCount: MultiwayTablePlayerCount;
  sessionConfig: PracticeSessionConfig;
  /** How long each opponent action stays on screen. */
  tablePace?: TablePace;
  tableMode?: 'practice' | 'learning_mission' | 'sit_and_go' | 'daily_challenge' | 'championship';
  tournamentCheckpoint?: SitAndGoCheckpoint | null;
  /** Sit & Go configurator overrides (ignored by Championship/Daily tables). */
  tournamentStartingStackBb?: number;
  tournamentBlindSpeed?: SitAndGoBlindSpeed;
  onTournamentCheckpointChange?: (checkpoint: SitAndGoCheckpoint | null) => void;
  challengeDate?: string;
  dailyChallengeCheckpoint?: DailyChallengeCheckpoint | null;
  onDailyChallengeCheckpointChange?: (checkpoint: DailyChallengeCheckpoint | null) => void;
  onDailyChallengeComplete?: (result: DailyChallengeResult) => void;
  championshipEvent?: ChampionshipEvent | null;
  onChampionshipComplete?: (result: ChampionshipResult) => void;
}

interface MultiwayActionBubbleFrame {
  action: MultiwayActionRecord;
  historyIndex: number;
  key: string;
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
  learningMission = null,
  onLearningMissionComplete,
  opponentMemory,
  orientation,
  playerCount,
  sessionConfig,
  tablePace = 'normal',
  tableMode = 'practice',
  tournamentCheckpoint = null,
  tournamentStartingStackBb,
  tournamentBlindSpeed,
  onTournamentCheckpointChange,
  challengeDate = '',
  dailyChallengeCheckpoint = null,
  onDailyChallengeCheckpointChange,
  onDailyChallengeComplete,
  championshipEvent = null,
  onChampionshipComplete,
}: MultiwayPokerTableScreenProps) {
  const { palette } = useAppTheme();
  const { activityText, language, t } = useLocalization();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const tableLayout = multiwayTableLayout(width, height, playerCount);
  const activityLayout = tableActivityLayout(width, height);
  // Measure the felt itself. The previous boundary included the coach/feed/
  // action rail and then subtracted a second guessed rail, which gave the seat
  // resolver an imaginary felt taller than the one React Native rendered.
  const [tableFrameLayout, setTableFrameLayout] = useState<{ height: number; width: number } | null>(null);
  const measuredLayout: MeasuredTableLayoutResult | null = useMemo(() => {
    if (!tableFrameLayout) return null;
    return resolveMeasuredTableLayout({
      // Header, feed, coaching, actions, and a landscape rail are siblings of
      // this exact frame. Nothing else may be subtracted from it.
      activityFeedMode: 'hidden',
      contentHeight: tableFrameLayout.height,
      contentWidth: tableFrameLayout.width,
      insets: { bottom: 0, left: 0, right: 0, top: 0 },
      orientation: tableFrameLayout.width >= tableFrameLayout.height ? 'landscape' : 'portrait',
      seatCount: playerCount,
      surface: 'live',
      textScale: Math.max(1, PixelRatio.getFontScale()),
    });
  }, [playerCount, tableFrameLayout]);
  const effectiveActivityMode = activityLayout.mode;
  const measuredRailWidth = activityLayout.railWidth;
  /** Resolver seats keyed by the shared anchor vocabulary. */
  const measuredSeatByAnchor = new Map((measuredLayout?.seats ?? []).map((seat) => [seat.anchor, seat]));
  const visualDensity = sharedTableVisualDensity(playerCount, width, height);
  const compact = tableLayout.compact;
  const nineSeat = playerCount === 9;
  const phoneNineMax = tableLayout.phoneNineMax;
  const denseTable = visualDensity.plaque === 'compact' || visualDensity.plaque === 'dense';
  // Landscape surfaces fall back to the dense nine-seat ring, so the tablet
  // plaque scale only applies where the roomy ring was chosen.
  const tabletMode = tableLayout.tablet && !phoneNineMax;
  const landscapeSixMax = tableLayout.landscapeSixMax;
  const tablet = tabletMode;
  const compactHeader = compact && !tablet;
  const expandedPortraitCoach = showsExpandedPortraitCoach(width, height);
  const { play, stopGameplayFeedback } = useGameplayFeedback();
  const styles = useMemo(
    () => createStyles(
      palette,
      compact,
      denseTable,
      effectiveActivityMode === 'rail',
      tablet,
      tableLayout.centerInsetPercent,
      tableLayout.centerTopPercent,
      phoneNineMax,
    ),
    [
      compact,
      denseTable,
      effectiveActivityMode,
      palette,
      phoneNineMax,
      tableLayout.centerInsetPercent,
      tableLayout.centerTopPercent,
      tablet,
    ],
  );
  const dailyMode = tableMode === 'daily_challenge';  const championshipMode = tableMode === 'championship';
  const missionMode = tableMode === 'learning_mission';
  const competitiveMode = dailyMode || championshipMode;
  const tournamentMode = tableMode === 'sit_and_go' || dailyMode || championshipMode;
  if (championshipMode && !championshipEvent) throw new Error('A Championship table requires an event.');
  if (missionMode && !learningMission) throw new Error('A learning mission table requires a mission.');
  const tableDifficulty: AiDifficulty = championshipMode
    ? championshipEvent!.aiDifficulty
    : dailyMode ? 'club' : missionMode ? learningMission!.tableDifficulty : aiDifficulty;
  const tournamentStructureId = championshipMode
    ? tournamentCheckpoint
      ? tournamentCheckpoint.structureId ?? championshipEvent!.structureId
      : championshipEvent!.structureId
    : tournamentCheckpoint ? sitAndGoCheckpointStructure(tournamentCheckpoint) : 'standard';
  const effectiveCoachEnabled = coachEnabled && !competitiveMode && !missionMode;
  // Slice 3.11D: nine-seat tournaments are a first-class layout for every
  // tournament mode, so the seat count passes through unmodified.
  // One effective pace for the whole run: a resumed checkpoint carries its
  // own speed; a fresh configurator launch supplies one; everything else
  // (Championship, Daily) stays at the structure's standard cadence.
  const effectiveBlindSpeed: SitAndGoBlindSpeed = tableMode === 'sit_and_go'
    ? tournamentCheckpoint?.blindSpeed ?? tournamentBlindSpeed ?? 'standard'
    : 'standard';
  const [game, setGame] = useState(() => dailyMode
    ? dailyChallengeCheckpoint
      ? resumeDailyChallenge(dailyChallengeCheckpoint)
      : createDailyChallenge(challengeDate)
    : tournamentMode
      ? tournamentCheckpoint
        ? resumeSitAndGo(tournamentCheckpoint, secureRandom, tournamentStructureId)
        : createSitAndGo(secureRandom, playerCount as SitAndGoPlayerCount, tournamentStructureId, tableDifficulty, undefined, {
          // Only the plain Sit & Go flow supplies configurator overrides;
          // Championship and Daily keep their structure-defined depth/pace.
          ...(tableMode === 'sit_and_go' && tournamentStartingStackBb ? { startingStackBb: tournamentStartingStackBb } : {}),
          blindSpeed: effectiveBlindSpeed,
        })
      : createMultiwaySessionHand(sessionConfig, playerCount, secureRandom, tableDifficulty));
  const [startingHeroStack, setStartingHeroStack] = useState(
    () => multiwayHeroStackBeforeHand(game),
  );
  const [sessionClientId, setSessionClientId] = useState(() => createPersistenceClientId('session'));
  const restoredCheckpointOnMount = dailyMode
    ? dailyChallengeCheckpoint !== null
    : tournamentMode && tournamentCheckpoint !== null;
  const [sessionHands, setSessionHands] = useState<SessionHandRecord[]>([]);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  // The seat whose action just landed. The next player's thinking delay is how
  // long it stays lit, which is what makes a fast fold sequence followable.
  const [justActed, setJustActed] = useState<string | null>(null);
  const [actionBubble, setActionBubble] = useState<MultiwayActionBubbleFrame | null>(null);
  // A restored checkpoint may contain a long history. Seed from it rather than
  // replaying old decisions when the table first mounts.
  const observedActionHistory = useRef({ handNumber: game.handNumber, length: game.history.length });
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);
  // Read-only identity (DT-07/DT-08): the shared popup stays openable during
  // the viewer's own turn; opening it never acts, pauses, extends, or resets a
  // turn clock. The popup surfaces a compact "your turn" notice instead of
  // dismissing itself, so the live decision stays visible.
  const [viewerRecord, setViewerRecord] = useState<PlayStatistics | null>(null);
  const [viewerRecordLoading, setViewerRecordLoading] = useState(false);
  useEffect(() => {
    if (profilePlayerId !== 'hero') return;
    let cancelled = false;
    setViewerRecordLoading(true);
    void loadPlayStatistics({ includePrivate: true }).then((statistics) => {
      if (!cancelled) {
        setViewerRecord(statistics);
        setViewerRecordLoading(false);
      }
    }).catch(() => {
      if (!cancelled) setViewerRecordLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [profilePlayerId]);
  const [betSizingVisible, setBetSizingVisible] = useState(false);
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false);
  // D07 (P18-012): Android hardware Back during a live table opens the
  // leave-table confirmation; open RN Modals intercept Back first.
  useHardwareBackConfirmation(() => setExitConfirmVisible(true));
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
  const reportedMissionResults = useRef(new Set<string>());
  const initialFeedbackHandKey = `${sessionClientId}:${game.handNumber}`;
  const lastDealtHandFeedback = useRef<string | null>(
    restoredCheckpointOnMount ? initialFeedbackHandKey : null,
  );
  const boardFeedbackSnapshot = useRef({
    boardCount: game.board.length,
    handKey: `${sessionClientId}:${game.handNumber}`,
  });
  const lastViewerTurnFeedback = useRef<string | null>(
    restoredCheckpointOnMount && game.toAct === 'hero' && game.street !== 'complete'
      ? `${initialFeedbackHandKey}:${game.street}:${game.history.length}:hero`
      : null,
  );
  const initialResultKind = game.outcome ? multiwayResultKind(game.outcome) : null;
  const lastResultFeedback = useRef<string | null>(
    restoredCheckpointOnMount && initialResultKind
      ? `${initialFeedbackHandKey}:${initialResultKind}`
      : null,
  );
  const latestDealFeedback = useRef<{
    eventId: string;
    handKey: string;
    terminal: boolean;
  } | null>(null);
  const latestActionFeedback = useRef<(LocalTableActionFeedback & {
    handKey: string;
    historyLength: number;
  }) | null>(null);
  const latestBoardRevealFeedback = useRef<{ handKey: string; historyLength: number } | null>(null);
  const hero = game.players.hero;
  // The human hero's own avatar, read from the persisted profile so the seat
  // identity stays consistent with the profile, lobby, and results surfaces.
  const profileAvatar = useMemo(
    () => loadHumanAvatar() ?? DEFAULT_HUMAN_AVATAR,
    [],
  );
  if (!hero) throw new Error('The multiway table is missing the hero seat.');
  const heroTurn = game.toAct === 'hero';
  // The viewer is the live actor. Read-only sheets stay openable (DT-07/DT-08)
  // and surface a compact turn notice; the clock keeps running regardless.
  const viewerActing = heroTurn && game.street !== 'complete';
  const currentAiThinking = visibleMultiwayAiThinking(aiThinking, game.toAct);
  const legal = getMultiwayLegalActions(game, 'hero');
  const practiceCompletionReason = tournamentMode ? null : multiwaySessionCompletionReason(game, sessionConfig);
  const tournamentCompletion = tournamentMode ? sitAndGoCompletion(game) : null;
  const sessionComplete = tournamentMode ? tournamentCompletion !== null : practiceCompletionReason !== null;
  const continuationMode: TableContinuationMode = missionMode
    ? 'learning_mission'
    : championshipMode
      ? 'championship'
      : dailyMode
        ? 'daily_challenge'
        : tournamentMode
          ? 'sit_and_go'
          : 'multiway_practice';
  const continuationActions = tableContinuationActions(continuationMode, sessionComplete);
  const tournamentLevel = sitAndGoBlindLevel(game.handNumber, tournamentStructureId, effectiveBlindSpeed);
  const tournamentPlace = tournamentMode ? sitAndGoHeroPlace(game) : null;
  const dailyScore = dailyMode && tournamentPlace
    ? tournamentPlace === 1 ? 100 : tournamentPlace === 2 ? 70 : 40
    : null;
  const tournamentPlayersLeft = tournamentMode ? sitAndGoLivePlayerIds(game).length : playerCount;
  const tournamentQualifyingPlace = championshipMode ? championshipEvent!.qualifyingPlace : 1;

  // The hidden-invitation turn clock (scope 3.11D): it starts only after the
  // hero's legal actions are actually visible (settle delay), pauses while
  // the app is backgrounded, and resolves expiry to check-if-legal-else-fold.
  // Deal, street, and result animations never consume the budget because the
  // key includes only the turn identity, and the clock is part of the local
  // challenge rules — no server, leaderboard, or anti-tamper claim.
  const invitationClockSeconds = championshipMode ? championshipEvent?.turnClockSeconds : undefined;
  const clockTurnKey = invitationClockSeconds && heroTurn && game.street !== 'complete' && !sessionComplete
    ? `${game.handNumber}:${game.street}:${game.history.length}`
    : null;
  const [clockRemainingMs, setClockRemainingMs] = useState<number | null>(null);
  const clockRef = useRef<InvitationTurnClock | null>(null);
  const clockTimersRef = useRef<{ settle: ReturnType<typeof setTimeout> | null; tick: ReturnType<typeof setInterval> | null }>({ settle: null, tick: null });
  useEffect(() => {
    const seconds = invitationClockSeconds ?? 0;
    if (!seconds || !clockTurnKey) {
      setClockRemainingMs(null);
      return () => undefined;
    }
    const clearTimers = () => {
      if (clockTimersRef.current.settle) clearTimeout(clockTimersRef.current.settle);
      if (clockTimersRef.current.tick) clearInterval(clockTimersRef.current.tick);
      clockTimersRef.current = { settle: null, tick: null };
    };
    const clock = new InvitationTurnClock(seconds, () => {
      // Timeout chooses Check when legal, otherwise Fold. It never calls,
      // bets, raises, or goes all-in.
      setClockRemainingMs(0);
      takeAction({ type: getMultiwayLegalActions(game, 'hero').canCheck ? 'check' : 'fold' });
    });
    clockRef.current = clock;
    setClockRemainingMs(seconds * 1000);
    // The settle delay keeps deal/street animations out of the action budget.
    clockTimersRef.current.settle = setTimeout(() => {
      // The settle window is over: from here the clock may run, and a resumed
      // 'active' app state may start it.
      clockTimersRef.current.settle = null;
      clock.start();
      clockTimersRef.current.tick = setInterval(() => {
        const snapshot = clock.tick();
        setClockRemainingMs(snapshot.remainingMs);
      }, 250);
    }, 400);
    // Backgrounding pauses the local clock and resumes with the same
    // remaining duration; opening app-owned sheets does not reset it. The
    // shared reaction gates the resume on the settle window so a background/
    // foreground race can never start the countdown before the turn's
    // animations complete, and an expired clock is never restarted.
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      const reaction = invitationClockAppStateReaction(
        state,
        clockTimersRef.current.settle !== null,
        clock.isExpired,
      );
      if (reaction === 'start') clock.start();
      else if (reaction === 'pause') clock.pause();
    });
    return () => {
      clearTimers();
      appStateSubscription.remove();
      clockRef.current = null;
    };
    // The expiry closure intentionally reads the turn-scoped game snapshot:
    // the turn key changes with hand/street/history, so the legal-action set
    // captured at creation is the one the deadline belongs to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockTurnKey]);
  const clockPhase: InvitationClockPhase | null = clockRemainingMs === null
    ? null
    : clockRemainingMs <= INVITATION_CLOCK_CRITICAL_MS
      ? 'critical'
      : clockRemainingMs <= INVITATION_CLOCK_WARNING_MS
        ? 'warning'
        : 'calm';
  // Accessibility announcements change only at the reviewed boundaries (turn
  // start, ten seconds, five seconds) instead of every tick.
  const clockAnnouncedSeconds = clockRemainingMs === null
    ? null
    : clockPhase === 'critical'
      ? 5
      : clockPhase === 'warning'
        ? 10
        : invitationClockSeconds ?? null;
  const tournamentDecisionContext = useMemo(() => tournamentMode
    ? { enabled: true, qualifyingPlace: tournamentQualifyingPlace }
    : learningMission?.tournamentContext, [learningMission?.tournamentContext, tournamentMode, tournamentQualifyingPlace]);
  const heroTournamentPressure = tournamentDecisionContext
    ? buildTournamentPressure(game, 'hero', tournamentDecisionContext)
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
  // Concise results (scope 3.11E): when exactly one player received the whole
  // pot, the headline already carries the winner and amount — payout rows and
  // the duplicated final-pot copy collapse away.
  const solePotRecipient = useMemo(() => {
    if (!game.outcome) return null;
    const awarded = game.tablePlayerIds.filter((playerId) => multiwayPlayerAward(game, playerId) > 0);
    if (awarded.length !== 1) return null;
    const [winnerId] = awarded;
    return multiwayPlayerAward(game, winnerId!) === game.outcome.totalPot ? winnerId! : null;
  }, [game]);
  const actionPresentationPending = localActionPresentationPending({
    currentHandNumber: game.handNumber,
    currentHistoryLength: game.history.length,
    hasVisibleAction: actionBubble?.key.startsWith(`${game.handNumber}:`) ?? false,
    observedHandNumber: observedActionHistory.current.handNumber,
    observedHistoryLength: observedActionHistory.current.length,
  });
  const localDecisionReport = useMemo(
    () => {
      if (!game.outcome) return null;
      const report = gradeMultiwayHand(game);
      if (!missionMode) return report;
      const decisions = tableMissionDecisions(learningMission!, [report]);
      // Route to the worst-classified spot, using the shared presentation rank
      // (not the raw grade), so a hand the model now calls an acceptable
      // alternative is not skipped for a merely-close one.
      const focus = [...decisions]
        .sort((left, right) => presentationRank[classifyDecision(right).classification]
          - presentationRank[classifyDecision(left).classification])[0]
        ?? decisions[0];
      return {
        ...report,
        decisions,
        focusDecisionSequence: focus?.sequence ?? 0,
      };
    },
    [game, learningMission, missionMode],
  );
  const sessionSummary = useMemo(
    () => summarizeMultiwaySession(activeSessionHands.map((hand) => hand.game), sessionConfig, game.bigBlind),
    [activeSessionHands, game.bigBlind, sessionConfig],
  );
  const sessionLearningSummary = useMemo(
    () => summarizeSessionHandLearning(activeSessionHands),
    [activeSessionHands],
  );
  const sessionFocusHand = useMemo(
    () => sessionLearningSummary.focusHandId
      ? activeSessionHands.find((hand) => hand.clientId === sessionLearningSummary.focusHandId) ?? null
      : null,
    [activeSessionHands, sessionLearningSummary.focusHandId],
  );
  const missionResult = useMemo(() => learningMission
    ? scoreTableMission(
      learningMission,
      activeSessionHands.map((hand) => gradeMultiwayHand(hand.game)),
    )
    : null, [activeSessionHands, learningMission]);
  // The session summary reports its net in big blinds; the table speaks chips,
  // so rebuild the delta from the same stacks rather than scaling the rounded
  // big-blind figure back up.
  const sessionNetChips = sessionSummary.heroStack - sessionConfig.startingStackBb * game.bigBlind;
  const learningVerdict = useMemo(
    () => localizedSessionLearningVerdict(sessionLearningSummary, t),
    [sessionLearningSummary, t],
  );
  const feedbackHandContext = useMemo(
    () => createMultiwayFeedbackHandContext(game, sessionClientId),
    [game, sessionClientId],
  );
  // A tapped seat only has a profile if we can match its name to a scripted
  // identity; an unrecognised name opens nothing rather than an empty sheet.
  const profilePlayerName = profilePlayerId ? game.players[profilePlayerId]?.name ?? null : null;
  const profileIdentity = profilePlayerName ? multiwayAiIdentityForName(profilePlayerName) : null;
  const profileIsViewer = profilePlayerId === 'hero';
  const viewerDisplayName = useMemo(
    () => loadPlayerDisplayName() || t('common.you'),
    [t],
  );

  useEffect(() => () => {
    stopGameplayFeedback();
  }, [stopGameplayFeedback]);

  useEffect(() => {
    const handKey = `${sessionClientId}:${game.handNumber}`;
    if (lastDealtHandFeedback.current === handKey) return;
    lastDealtHandFeedback.current = handKey;
    const eventId = `${handKey}:deal`;
    const result = game.outcome ? multiwayResultKind(game.outcome) : null;
    const deal = { eventId };
    latestDealFeedback.current = {
      eventId,
      handKey,
      terminal: result !== null,
    };
    const plan = planLocalTableFeedback({
      action: null,
      boardRevealed: game.board.length > 0,
      deal,
      result,
      viewerTurnReady: heroTurn && game.street !== 'complete',
    });
    const dealStep = localTableFeedbackStep(plan, 'newHand');
    play('newHand', {
      eventId,
      haptic: dealStep?.haptic ?? true,
    });
  }, [game.board.length, game.handNumber, game.outcome, game.street, heroTurn, play, sessionClientId]);

  useEffect(() => {
    const observed = observedActionHistory.current;
    const sameHand = observed.handNumber === game.handNumber;
    if (!sameHand) {
      observedActionHistory.current = { handNumber: game.handNumber, length: game.history.length };
      latestActionFeedback.current = null;
      setActionBubble(null);
      return;
    }
    if (game.history.length <= observed.length) {
      if (game.history.length < observed.length) setActionBubble(null);
      observedActionHistory.current = { handNumber: game.handNumber, length: game.history.length };
      return;
    }
    const historyIndex = game.history.length - 1;
    const action = game.history[historyIndex];
    observedActionHistory.current = { handNumber: game.handNumber, length: game.history.length };
    if (!action) return;
    const handKey = `${sessionClientId}:${game.handNumber}`;
    const eventId = `${sessionClientId}:action:${game.handNumber}:${historyIndex}:${action.playerId}:${action.type}`;
    const actionFeedback = {
      cue: gameplayCueForAction(action),
      eventId,
      viewerActed: action.playerId === 'hero',
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
      result: game.outcome ? multiwayResultKind(game.outcome) : null,
      viewerTurnReady: heroTurn && game.street !== 'complete',
    });
    const actionStep = localTableFeedbackStep(plan, 'action');
    setActionBubble({
      action,
      historyIndex,
      key: `${game.handNumber}:${historyIndex}`,
    });
    play(actionFeedback.cue, {
      eventId,
      haptic: actionStep?.haptic ?? false,
    });
  }, [game.board.length, game.handNumber, game.history.length, game.outcome, game.street, heroTurn, play, sessionClientId]);

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
      result: game.outcome ? multiwayResultKind(game.outcome) : null,
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
    // New-hand feedback owns the opening transition when the viewer acts
    // first, avoiding two simultaneous taps for one visible moment.
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
      result: game.outcome ? multiwayResultKind(game.outcome) : null,
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
    if (!actionBubble) return undefined;
    const timer = setTimeout(() => setActionBubble((current) => (
      current?.key === actionBubble.key ? null : current
    )), multiwayActionBubbleDurationMs(tablePace));
    return () => clearTimeout(timer);
  }, [actionBubble?.key, tablePace]);

  const visibleActionBubble = actionBubble?.key.startsWith(`${game.handNumber}:`)
    ? actionBubble
    : null;
  const actionBubblePresentation = visibleActionBubble
    ? buildMultiplayerActionBubblePresentation(game, visibleActionBubble.action, t, {
      allIn: multiwayActionRecordIsAllIn(visibleActionBubble.action),
      historyIndex: visibleActionBubble.historyIndex,
      isAi: visibleActionBubble.action.playerId !== 'hero',
    })
    : null;
  const visibleResultSummary = actionPresentationPending ? null : resultSummary;
  useActionBubbleAnnouncement(
    visibleResultSummary ? `multiway-result:${sessionClientId}:${game.handNumber}` : '',
    visibleResultSummary
      ? `${visibleResultSummary.title}. ${visibleResultSummary.headlineAmount}. ${visibleResultSummary.detail}`
      : '',
  );

  useEffect(() => {
    if (sessionLearningSummary.topFocusArea) {
      onFocusIdentified(sessionLearningSummary.topFocusArea);
    }
  }, [onFocusIdentified, sessionLearningSummary.topFocusArea]);

  const heroEquity = useMemo(() => {
    if (competitiveMode || missionMode || !heroTurn || game.street === 'complete') return null;
    const seed = game.handNumber * 100_003 + game.history.length * 997 + game.board.length * 43;
    return estimateMultiwayEquity(createFairMultiwayDecisionState(game, 'hero'), 'hero', {
      identities: multiwayIdentityMap(game, tableDifficulty),
      random: seededRandom(seed),
      simulations: tableDifficulty === 'friendly' ? 72 : tableDifficulty === 'sharp' ? 180 : 120,
    });
  }, [competitiveMode, game, heroTurn, missionMode, tableDifficulty]);

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
          onTournamentCheckpointChange?.(createSitAndGoCheckpoint(game, tableDifficulty, tournamentStructureId, effectiveBlindSpeed));
        }
      } else if (tournamentCompletion) onTournamentCheckpointChange?.(null);
      else onTournamentCheckpointChange?.(createSitAndGoCheckpoint(game, tableDifficulty, tournamentStructureId, effectiveBlindSpeed));
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
  }, [challengeDate, championshipEvent, championshipMode, dailyMode, effectiveCoachEnabled, game, onChampionshipComplete, onDailyChallengeCheckpointChange, onDailyChallengeComplete, onHeroHandObserved, onTournamentCheckpointChange, sessionClientId, tableDifficulty, tournamentCompletion, tournamentMode, tournamentPlace, tournamentStructureId]);

  useEffect(() => {
    if (!game.outcome) return undefined;
    const kind = multiwayResultKind(game.outcome);
    const resultKey = `${sessionClientId}:${game.handNumber}:${kind}`;
    if (lastResultFeedback.current === resultKey) return undefined;
    lastResultFeedback.current = resultKey;
    const handKey = `${sessionClientId}:${game.handNumber}`;
    const actionFrame = latestActionFeedback.current;
    const action = actionFrame?.handKey === handKey
      && actionFrame.historyLength === game.history.length
      ? actionFrame
      : null;
    const dealFrame = latestDealFeedback.current;
    const deal = game.history.length === 0
      && dealFrame?.handKey === handKey
      && dealFrame.terminal
      ? { eventId: dealFrame.eventId }
      : null;
    const schedule = localTerminalResultSchedule({
      hasCommittedAction: action !== null,
      hasOutcome: true,
      presentationDurationMs: multiwayActionBubbleDurationMs(tablePace),
    });
    if (!schedule) return undefined;
    const plan = planLocalTableFeedback({
      action,
      boardRevealed: false,
      deal,
      result: kind,
      viewerTurnReady: false,
    });
    const resultStep = localTableFeedbackStep(plan, 'handResult');
    play({ type: 'handResult', result: kind }, {
      delayMs: Math.max(
        resultStep?.delayMs ?? 0,
        schedule.delayMs,
      ),
      eventId: resultKey,
      haptic: resultStep?.haptic ?? true,
    });
    return undefined;
  }, [game.handNumber, game.history.length, game.outcome, play, sessionClientId, tablePace]);

  useEffect(() => {
    if (!missionMode || !missionResult?.completed || !onLearningMissionComplete) return;
    const resultKey = `${missionResult.missionId}:${sessionClientId}`;
    if (reportedMissionResults.current.has(resultKey)) return;
    reportedMissionResults.current.add(resultKey);
    onLearningMissionComplete(missionResult);
  }, [missionMode, missionResult, onLearningMissionComplete, sessionClientId]);

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
            tournamentDecisionContext,
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
      setJustActed(playerId);
    }, multiwayReadableAiDelayMs(
      multiwayAiPacingMs(game, playerId, tablePace),
      game.history.length > 0,
      tablePace,
    ));
    return () => clearTimeout(timer);
  }, [challengeDate, championshipEvent, championshipMode, competitiveMode, dailyMode, game, opponentMemory, tableDifficulty, tablePace, tournamentDecisionContext]);

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
    setGame((current) => applyMultiwayAction(current, 'hero', action, {
      estimatedEquity: heroEquity ?? undefined,
      tournamentPressureLabel: heroTournamentPressure?.pressureLabel ?? undefined,
      tournamentRiskPremium: heroTournamentPressure?.riskPremium,
    }));
    // Every seat lights up when it acts, the hero included, so the highlight
    // means one thing at the table rather than "an opponent moved".
    setJustActed('hero');
  };

  const dealNext = () => {
    if (sessionComplete) {
      setSummaryVisible(true);
      return;
    }
    const next = dailyMode
      ? createNextDailyChallengeHand(challengeDate, game)
      : tournamentMode
        ? createNextSitAndGoHand(game, secureRandom, tournamentStructureId, effectiveBlindSpeed)
        : createNextMultiwaySessionHand(game, secureRandom);
    setGame(next);
    setStartingHeroStack(multiwayHeroStackBeforeHand(next));
    setResultVisible(false);
    setInsightVisible(false);
    // A new hand starts with no one having acted; otherwise the last seat of
    // the previous hand stays lit until somebody moves.
    setJustActed(null);
  };

  const startFreshSession = () => {
    const next = dailyMode
      ? createDailyChallenge(challengeDate)
      : tournamentMode
        ? createSitAndGo(secureRandom, playerCount as SitAndGoPlayerCount, tournamentStructureId, tableDifficulty, undefined, {
          // "Play again" repeats the configuration the player is in, not the
          // structure default.
          ...(tableMode === 'sit_and_go' && tournamentStartingStackBb ? { startingStackBb: tournamentStartingStackBb } : {}),
          blindSpeed: effectiveBlindSpeed,
        })
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
    setJustActed(null);
    setProfilePlayerId(null);
  };

  const continuationLabel = (action: TableContinuationAction): string => {
    if (action === 'next_hand') return t('table.nextHand');
    if (action === 'play_again') return t('summary.playAgain');
    if (action === 'replay_today') return t('summary.replayToday');
    if (action === 'review_hand') return t('multiway.reviewFinal');
    return missionMode
      ? t('mission.viewResults')
      : dailyMode
        ? t('multiway.dailySummary')
        : tournamentMode
          ? t('multiway.tournamentSummary')
          : t('multiway.sessionSummary');
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
      setSummaryVisible(true);
      return;
    }
    setResultVisible(true);
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
  // Seat badges and temporary bubbles already retain every concrete action.
  // The center is reserved for table state only, so a fold/call/raise is never
  // narrated in three places at once.
  const tableStatusPanel = !tableLayout.phoneSixMax && !tableLayout.phoneNineMax && !game.outcome && (currentAiThinking || heroTurn) ? (
    <View style={[styles.statusCard, landscapeSixMax && styles.statusCardLandscape]}>
      {currentAiThinking ? (
        <View style={styles.thinkingRow}>
          <ActivityIndicator color={palette.aqua} size="small" />
          <Text numberOfLines={1} style={[styles.statusText, landscapeSixMax && styles.statusTextLandscape]}>{t('multiway.thinking', { player: game.players[currentAiThinking]?.name ?? t('common.opponent') })}</Text>
        </View>
      ) : (
        <Text numberOfLines={1} style={[styles.centerStatusText, landscapeSixMax && styles.centerStatusTextLandscape]}>
          {t('table.yourTurn')}
        </Text>
      )}
    </View>
  ) : null;
  const activityEvents = projectMultiwayTableActivity(game);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel={t('table.leave')} accessibilityRole="button" onPress={requestExit} style={styles.iconButton}>
          <Ionicons color={palette.text} name="arrow-back" size={19} />
        </Pressable>
        <View style={styles.handMeta}>
          <Text
            accessibilityRole="header"
            adjustsFontSizeToFit
            minimumFontScale={compactHeader ? 0.7 : compact ? 0.78 : 0.9}
            numberOfLines={1}
            style={styles.handTitle}
          >
            {missionMode
              ? t('mission.tableHand', { title: activityText(learningMission!, 'title'), hand: game.handNumber, target: learningMission!.sessionConfig.handTarget })
              : championshipMode
              ? t('multiway.hand.championship', { event: championshipEventText(championshipEvent!, 'title', t), hand: game.handNumber })
              : dailyMode
              ? t('multiway.hand.daily', { hand: game.handNumber })
              : tournamentMode
                ? t(compact ? 'multiway.hand.tournamentCompact' : 'multiway.hand.tournament', { count: playerCount, hand: game.handNumber })
              : sessionConfig.handTarget === 'open'
                ? t('multiway.hand.practiceOpen', { count: playerCount, hand: game.handNumber })
                : t('multiway.hand.practiceTarget', { count: playerCount, hand: game.handNumber, target: sessionConfig.handTarget })}
          </Text>
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.street}>
            {missionMode
              ? t(missionScoreNoteKey[learningMission!.scoringProfile])
              : dailyMode
              ? t('multiway.dailyLevel', {
                bigBlind: formatChips(game.bigBlind),
                count: tournamentPlayersLeft,
                date: dailyChallengeDisplayDate(challengeDate, language),
                difficulty: t('difficulty.club'),
                smallBlind: formatChips(game.smallBlind),
              })
              : tournamentMode
                ? t('multiway.level', { bigBlind: formatChips(game.bigBlind), count: tournamentPlayersLeft, level: tournamentLevel.level, smallBlind: formatChips(game.smallBlind) })
                : t('multiway.practiceLevel', { street: localizedStreet(game.street, t), difficulty: t(`difficulty.${tableDifficulty}`) })}
          </Text>
        </View>
        <View style={styles.headerControls}>
          <TableOrientationControl control={orientation} />
          <Pressable accessibilityLabel={t('table.openGuide')} accessibilityRole="button" hitSlop={5} onPress={() => setGuideVisible(true)} style={[styles.headerControl, styles.guideButton]}>
            <Ionicons color={palette.primary} name="help-circle-outline" size={17} />
          </Pressable>
          {activeSessionHands.length > 0 ? (
            <Pressable
              accessibilityLabel={t('table.sessionHands', { count: activeSessionHands.length })}
              accessibilityRole="button"
              hitSlop={5}
              onPress={() => setHistoryVisible(true)}
              style={[styles.headerControl, styles.sessionButton]}
            >
              <Ionicons color={palette.muted} name="stats-chart-outline" size={15} />
              <Text style={styles.sessionCount}>{activeSessionHands.length}</Text>
            </Pressable>
          ) : null}
          {missionMode ? (
            <View accessibilityLabel={t('mission.badgeA11y')} accessible style={[styles.headerControl, styles.fairModePill, !tablet && styles.fairModePillCompact]}>
              <Ionicons color={palette.aqua} name="flag-outline" size={14} />
              {tablet ? <Text style={styles.fairModeText}>{t('mission.badge')}</Text> : null}
            </View>
          ) : competitiveMode ? (
            <View accessibilityLabel={t('multiway.fairModeA11y', { mode: championshipMode ? t('home.championship') : t('multiway.fair') })} accessible style={[styles.headerControl, styles.fairModePill, !tablet && styles.fairModePillCompact]}>
              <Ionicons color={palette.aqua} name="shield-checkmark-outline" size={14} />
              {tablet ? <Text style={styles.fairModeText}>{championshipMode ? t('multiway.tour') : t('multiway.fair')}</Text> : null}
            </View>
          ) : !tablet ? (
            <Pressable
              accessibilityLabel={t('multiway.showCoach')}
              accessibilityRole="switch"
              accessibilityState={{ checked: effectiveCoachEnabled }}
              hitSlop={5}
              onPress={() => onCoachEnabledChange(!effectiveCoachEnabled)}
              style={[styles.headerControl, styles.coachIconToggle, effectiveCoachEnabled && styles.coachIconToggleActive]}
            >
              <Ionicons color={effectiveCoachEnabled ? palette.primary : palette.muted} name={effectiveCoachEnabled ? 'sparkles' : 'sparkles-outline'} size={17} />
            </Pressable>
          ) : (
            <Pressable
              accessibilityLabel={t('multiway.showCoach')}
              accessibilityRole="switch"
              accessibilityState={{ checked: effectiveCoachEnabled }}
              hitSlop={5}
              onPress={() => onCoachEnabledChange(!effectiveCoachEnabled)}
              style={[styles.headerControl, styles.coachIconToggle, effectiveCoachEnabled && styles.coachIconToggleActive]}
            >
              <Ionicons color={effectiveCoachEnabled ? palette.primary : palette.muted} name={effectiveCoachEnabled ? 'sparkles' : 'sparkles-outline'} size={17} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.tableBody, effectiveActivityMode === 'rail' && styles.tableBodyLandscape]}>
      <View
        onLayout={(event) => {
          const { height, width } = event.nativeEvent.layout;
          setTableFrameLayout((previous) => previous && previous.width === width && previous.height === height ? previous : { height, width });
        }}
        style={styles.tableFrame}
      >
        <LinearGradient colors={[palette.table, palette.tableDeep]} style={styles.table}>
          <View style={styles.tableRing} />
          {placements.map(({ anchor, playerId }) => {
            const player = game.players[playerId];
            if (!player) return null;
            return (
              <TableSeat
                aiThinking={currentAiThinking === playerId}
                actionBubble={visibleActionBubble?.action.playerId === playerId ? actionBubblePresentation : null}
                actionKey={visibleActionBubble?.action.playerId === playerId ? visibleActionBubble.key : ''}
                anchor={anchor}
                bubbleBoard={measuredLayout?.boardRect ?? null}
                bubblePane={measuredLayout?.pane ?? null}
                compact={compact}
                currentTurn={game.toAct === playerId}
                dense={denseTable}
                frame={(() => {
                  const seat = measuredSeatByAnchor.get(anchor);
                  return measuredLayout && seat
                    ? {
                        height: seat.height,
                        left: seat.x - measuredLayout.pane.left,
                        top: seat.y - measuredLayout.pane.top,
                        width: seat.width,
                      }
                    : undefined;
                })()}
                handComplete={game.street === 'complete'}
                justActed={justActed === playerId}
                key={playerId}
                layoutDensity={measuredLayout?.plaqueDensity}
                nineSeat={nineSeat}
                phoneNine={phoneNineMax}
                onPress={playerId === 'hero'
                  ? () => setProfilePlayerId('hero')
                  : multiwayAiIdentityForName(player.name)
                    ? () => setProfilePlayerId(playerId)
                    : undefined}
                latestAction={localizedMultiwaySeatAction(game, playerId, t)}
                player={player}
                revealCards={playerId === 'hero' || (revealOpponents && !player.folded)}
                simplified={denseTable}
                tablet={tablet}
                role={multiwaySeatRoleBadge(game, playerId)}
                heroAvatar={profileAvatar}
              />
            );
          })}

          <View style={[
            styles.centerZone,
            measuredLayout?.boardRect && {
              left: measuredLayout.boardRect.left - measuredLayout.pane.left,
              top: measuredLayout.boardRect.top - measuredLayout.pane.top,
              right: measuredLayout.pane.right - measuredLayout.boardRect.right,
              height: measuredLayout.boardRect.bottom - measuredLayout.boardRect.top,
              justifyContent: 'center',
            },
          ]}>
            <View style={styles.potPill}>
              <Text style={styles.potText}>{t('table.pot', { amount: formatChips(displayPot) })}</Text>
            </View>
            <View style={styles.boardRow}>
              <SharedTableBoard board={game.board} variant={visualDensity.boardCard} />
            </View>
            {effectiveActivityMode !== 'rail' ? tableStatusPanel : null}
          </View>
        </LinearGradient>
      </View>

      <View style={[
        styles.tableRail,
        effectiveActivityMode === 'rail' && styles.tableRailLandscape,
        effectiveActivityMode === 'rail' && { width: measuredRailWidth },
      ]}>
      {effectiveActivityMode === 'rail' ? (
        <TableActivityFeed
          events={activityEvents}
          handKey={`multiway:${sessionClientId}:${game.handNumber}`}
          mode="rail"
        />
      ) : null}
      {effectiveActivityMode === 'rail' ? tableStatusPanel : null}
      {visibleResultSummary ? (
        <Pressable
          accessibilityLabel={`${visibleResultSummary.title}. ${visibleResultSummary.headlineAmount}. ${visibleResultSummary.detail}. ${t('multiway.openResult')}`}
          accessibilityLiveRegion="polite"
          accessibilityRole="button"
          onPress={() => setResultVisible(true)}
          style={styles.resultBar}
        >
          <View style={[styles.resultIcon, { backgroundColor: visibleResultSummary.tone === 'win' ? palette.aquaSoft : visibleResultSummary.tone === 'tie' ? palette.accentSoft : palette.soft }]}>
            <Ionicons color={visibleResultSummary.tone === 'win' ? palette.aqua : visibleResultSummary.tone === 'tie' ? palette.primary : palette.muted} name={visibleResultSummary.tone === 'win' ? 'trophy-outline' : visibleResultSummary.tone === 'tie' ? 'git-compare-outline' : 'analytics-outline'} size={18} />
          </View>
          <View style={styles.resultCopy}>
            <View style={styles.resultHeadline}>
              <Text numberOfLines={1} style={styles.resultTitle}>{visibleResultSummary.title}</Text>
              <Text numberOfLines={1} style={styles.resultAmount}>{visibleResultSummary.headlineAmount}</Text>
            </View>
            <Text numberOfLines={compact || landscapeSixMax ? 2 : 1} style={styles.resultDetail}>{visibleResultSummary.detail}</Text>
          </View>
          <Ionicons color={palette.muted} name="chevron-forward" size={18} />
        </Pressable>
      ) : effectiveCoachEnabled && game.street !== 'complete' && heroTurn ? (
        expandedPortraitCoach ? (
          <InlineCoachPanel
            alternativeHeadline={coachRecommendation.alternative ? localizedAlternativeHeadline ?? undefined : undefined}
            detail={localizedCoachCopy}
            headline={coachHeadline}
            metrics={[
              { label: t('multiway.coach.rangeEquity'), value: heroEquity === null ? '—' : `${Math.round(heroEquity * 100)}%` },
              { label: t('multiway.coach.required'), value: legal.toCall > 0 ? `${Math.round(requiredEquity * 100)}%` : '0%' },
              { label: t('multiway.coach.liveOpponents'), value: String(liveOpponentCount) },
              { label: t('multiway.coach.playersBehind'), value: String(playersBehind) },
            ]}
            onPress={() => setInsightVisible(true)}
          />
        ) : (
          <View style={styles.coachBar}>
            <View style={styles.coachIcon}><Ionicons color={palette.aqua} name="sparkles-outline" size={17} /></View>
            <View style={styles.coachCopy}>
              <Text style={styles.coachTitle}>{coachHeadline}</Text>
              <Text numberOfLines={landscapeSixMax ? 2 : 1} style={styles.coachText}>{localizedCoachCopy}</Text>
            </View>
            <Pressable accessibilityLabel={t('multiway.openCoach')} accessibilityRole="button" onPress={() => setInsightVisible(true)} style={styles.detailsButton}>
              <Ionicons color={palette.primary} name="chevron-forward" size={18} />
            </Pressable>
          </View>
        )
      ) : null}

      {game.street !== 'complete' && clockRemainingMs !== null ? (
        <View
          accessibilityLabel={t('multiway.turnClockA11y', { seconds: clockAnnouncedSeconds ?? 0 })}
          accessibilityLiveRegion="polite"
          style={[styles.turnClock, clockPhase === 'warning' && styles.turnClockWarning, clockPhase === 'critical' && styles.turnClockCritical]}
        >
          <Ionicons color={clockPhase === 'calm' ? palette.text : palette.danger} name="timer-outline" size={15} />
          <Text maxFontSizeMultiplier={1.3} style={[styles.turnClockText, clockPhase !== 'calm' && styles.turnClockTextUrgent]}>
            {t('multiway.turnClock', { seconds: invitationClockSecondsLabel(clockRemainingMs) })}
          </Text>
        </View>
      ) : null}
      <View style={[styles.tableControlRail, effectiveActivityMode === 'rail' && styles.tableControlRailLandscape]}>
      <View style={styles.tableControlRailMain}>
      {game.street !== 'complete' ? (
        <View style={[styles.actions, effectiveActivityMode === 'rail' && styles.actionsLandscape]}>
          <ActionButton disabled={!legal.canFold || !heroTurn} label={t('poker.action.fold')} onPress={() => takeAction({ type: 'fold' })} tone="danger" />
          <ActionButton
            disabled={(!legal.canCheck && !legal.canCall) || !heroTurn}
            label={legal.canCheck ? t('poker.action.check') : t('poker.action.callAmount', { amount: formatChips(legal.toCall) })}
            onPress={() => takeAction({ type: legal.canCheck ? 'check' : 'call' })}
          />
          <ActionButton
            disabled={!legal.canRaise || !heroTurn}
            label={effectiveCoachEnabled && coachRecommendation.target
              ? t(game.currentBet === 0 ? 'poker.action.betAmount' : 'poker.action.raiseTo', { amount: formatChips(coachRecommendation.target) })
              : t(game.currentBet === 0 ? 'poker.action.bet' : 'poker.action.raise')}
            onPress={() => setBetSizingVisible(true)}
            tone="primary"
          />
        </View>
      ) : (
        <View style={[styles.actions, effectiveActivityMode === 'rail' && styles.actionsLandscape]}>
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
      </View>
      {effectiveActivityMode === 'disclosure' ? (
        <TableActivityFeed
          events={activityEvents}
          handKey={`multiway:${sessionClientId}:${game.handNumber}`}
          mode="disclosure"
        />
      ) : null}
      </View>
      </View>
      </View>

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

      <SimpleSheet onClose={() => setProfilePlayerId(null)} visible={profileIdentity !== null || profileIsViewer}>
        {viewerActing ? (
          <View accessibilityLiveRegion="polite" style={styles.profileTurnNotice}>
            <Ionicons color={palette.danger} name="timer-outline" size={15} />
            <Text maxFontSizeMultiplier={1.3} style={styles.profileTurnNoticeText}>
              {clockRemainingMs !== null
                ? `${t('multiway.profile.turnNotice')} · ${t('multiway.turnClock', { seconds: invitationClockSecondsLabel(clockRemainingMs) })}`
                : t('multiway.profile.turnNotice')}
            </Text>
          </View>
        ) : null}
        {profileIsViewer ? (
          <>
            <SheetHeader
              eyebrow={t('profile.eyebrow')}
              onClose={() => setProfilePlayerId(null)}
              title={viewerDisplayName}
            />
            <View style={styles.profileIdentityRow}>
              <HumanAvatar avatar={profileAvatar} displayName={viewerDisplayName} size={64} />
              <Text maxFontSizeMultiplier={1.2} style={styles.profileIdentityPill}>{t('multiplayer.profile.human')}</Text>
            </View>
            <PlayStatisticsCard
              large
              loading={viewerRecordLoading}
              statistics={viewerRecord}
              title={playStatisticsRecordTitle(viewerDisplayName, true, t)}
            />
          </>
        ) : profileIdentity ? (
          <>
            <SheetHeader
              eyebrow={t('profile.eyebrow')}
              onClose={() => setProfilePlayerId(null)}
              title={profileIdentity.name}
            />
            <AiPlayerProfile identity={profileIdentity} size="large" />
          </>
        ) : null}
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
            {solePotRecipient && solePotRecipient !== 'hero' ? null : (
              <Metric label={t('multiway.result.finalPot')} value={resultSummary?.pot ?? '—'} />
            )}
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
          {solePotRecipient ? null : (
            <View style={styles.payoutList}>
              <Text style={styles.explanationTitle}>{t('multiway.result.payouts')}</Text>
              {game.tablePlayerIds.map((playerId) => {
                const player = game.players[playerId];
                if (!player) return null;
                const award = multiwayPlayerAward(game, playerId);
                const role = multiwaySeatRoleBadge(game, playerId);
                return (
                  <View key={playerId} style={styles.payoutRow}>
                    <Text style={styles.payoutName}>{player.name}{role ? ` · ${role}` : ''}</Text>
                    <Text style={styles.payoutValue}>{award > 0 ? `${formatChipsSigned(award)} · ` : ''}{formatChips(player.stack)}</Text>
                  </View>
                );
              })}
            </View>
          )}
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
              ? missionMode
                ? t('mission.summaryEyebrow', { count: learningMission!.sessionConfig.handTarget })
                : t(championshipMode ? 'summary.eyebrow.championship' : dailyMode ? 'summary.eyebrow.daily' : tournamentMode ? 'summary.eyebrow.tournament' : 'summary.eyebrow.session')
              : t('summary.eyebrow.progress')}
            onClose={() => setSummaryVisible(false)}
            title={missionMode
              ? activityText(learningMission!, 'title')
              : championshipMode
              ? championshipQualifies(championshipEvent!, tournamentPlace ?? playerCount)
                ? championshipEvent!.id === 'the_undertow'
                  ? t('summary.undertowChampion')
                  : championshipEvent!.id === 'river_below'
                    ? t('summary.belowChampion')
                    : championshipEvent!.id === 'championship_final'
                      ? t('summary.champion')
                      : t('summary.qualified', { event: championshipEventText(championshipEvent!, 'title', t) })
                : t('summary.finished', { place: tournamentPlace ?? playerCount })
              : dailyMode
                ? t('summary.dailyTitle', { date: dailyChallengeDisplayDate(challengeDate, language), score: dailyScore ?? 0 })
                : tournamentMode ? tournamentPlace === 1 ? t('summary.wonSitGo') : t('summary.finished', { place: tournamentPlace ?? 3 }) : t('summary.tableResults')}
          />
          {missionMode && missionResult ? (
            <>
              <View style={styles.metrics}>
                <Metric label={t('summary.hands')} value={String(missionResult.handsPlayed)} />
                <Metric label={t(missionDecisionLabelKey[learningMission!.scoringProfile])} value={String(missionResult.decisionsGraded)} />
                <Metric label={t('mission.baselineScore')} value={missionResult.decisionsGraded > 0 ? `${missionResult.score}%` : '—'} />
                <Metric label={t('mission.reviewSpots')} value={String(missionResult.grades.close + missionResult.grades.mistake)} />
              </View>
              <Text style={styles.sheetBody}>{t(missionSummaryBodyKey[learningMission!.scoringProfile])}</Text>
            </>
          ) : tournamentMode ? (
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
                    ? championshipEvent!.id === 'the_undertow'
                      ? t('summary.body.undertowChampion')
                      : championshipEvent!.id === 'river_below'
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
                <Metric label={t('summary.netResult')} value={formatChipsSigned(sessionNetChips)} />
                <Metric label={t('summary.chipLeader')} value={sessionSummary.leaderName} />
              </View>
              <Text style={styles.sheetBody}>{localizedCompletionCopy(practiceCompletionReason, sessionSummary.leaderName, t)}</Text>
            </>
          )}
          <View style={styles.sessionReviewCard}>
            <Text style={styles.sessionReviewEyebrow}>{t(missionMode ? 'mission.decisionScore' : tournamentMode ? 'summary.review.tournament' : 'summary.review.session')}</Text>
            <Text style={styles.sessionReviewTitle}>{missionMode && missionResult
              ? t(missionResult.decisionsGraded < missionResult.minimumDecisions
                ? 'mission.needMoreSpots'
                : missionResult.passed ? 'mission.passed' : 'mission.keepPracticing')
              : learningVerdict.title}</Text>
            <Text style={styles.sessionReviewText}>{missionMode && missionResult
              ? t('mission.scoreDetail', {
                close: missionResult.grades.close,
                mistake: missionResult.grades.mistake,
                strong: missionResult.grades.strong,
              })
              : learningVerdict.detail}</Text>
            <View style={styles.sessionReviewMetrics}>
              <View style={styles.sessionReviewMetric}>
                <Text style={styles.sessionReviewMetricValue}>{missionMode && missionResult
                  ? missionResult.decisionsGraded > 0 ? `${missionResult.score}%` : '—'
                  : `${sessionLearningSummary.strongRate ?? 0}%`}</Text>
                <Text numberOfLines={2} style={styles.sessionReviewMetricLabel}>{t(missionMode ? 'mission.baselineScore' : 'summary.review.strong')}</Text>
              </View>
              <View style={styles.sessionReviewMetric}>
                <Text style={styles.sessionReviewMetricValue}>{missionMode && missionResult ? missionResult.grades.close + missionResult.grades.mistake : sessionLearningSummary.reviewSpots}</Text>
                <Text numberOfLines={2} style={styles.sessionReviewMetricLabel}>{t(missionMode ? 'mission.reviewSpots' : 'summary.review.spots')}</Text>
              </View>
              <View style={styles.sessionReviewMetric}>
                <Text style={styles.sessionReviewMetricValue}>{missionMode && missionResult ? missionResult.decisionsGraded : sessionLearningSummary.decisionsGraded}</Text>
                <Text numberOfLines={2} style={styles.sessionReviewMetricLabel}>{t(missionMode
                  ? missionDecisionLabelKey[learningMission!.scoringProfile]
                  : 'summary.review.decisions')}</Text>
              </View>
            </View>
            <Text style={styles.sessionReviewFootnote}>{t(missionMode
              ? missionScoreFootnoteKey[learningMission!.scoringProfile]
              : 'summary.review.footnote')}</Text>
          </View>
          {!missionMode ? <SessionLearningCard
            onPracticeFocus={(focus) => {
              setSummaryVisible(false);
              onPracticeFocus(focus);
            }}
            onReviewFocusHand={sessionFocusHand ? () => {
              setSummaryVisible(false);
              setReplayHand(sessionFocusHand);
            } : undefined}
            summary={sessionLearningSummary}
          /> : null}
          {!competitiveMode && !missionMode ? <OpponentReadCard memory={opponentMemory} /> : null}
        </ScrollView>
        <View style={styles.summaryActions}>
          {activeSessionHands.length > 0 ? (
            <Pressable accessibilityRole="button" onPress={() => { setSummaryVisible(false); setHistoryVisible(true); }} style={styles.primarySheetButton}><Text numberOfLines={2} style={styles.primarySheetButtonText}>{t('summary.reviewEvery')}</Text></Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={startFreshSession} style={styles.secondarySheetButton}><Text numberOfLines={2} style={styles.secondarySheetButtonText}>{t(missionMode ? 'mission.tryAgain' : championshipMode ? 'summary.retryEvent' : dailyMode ? 'summary.replayToday' : 'summary.playAgain')}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { setSummaryVisible(false); onChangeSetup(); }} style={styles.secondarySheetButton}><Text numberOfLines={2} style={styles.secondarySheetButtonText}>{t(missionMode ? 'mission.backToLearn' : championshipMode ? 'summary.championshipMap' : tournamentMode ? 'summary.backToPlay' : 'summary.changeSetup')}</Text></Pressable>
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
  actionBubble,
  actionKey,
  aiThinking,
  anchor,
  bubbleBoard,
  bubblePane,
  compact,
  currentTurn,
  dense,
  frame,
  handComplete,
  justActed,
  heroAvatar,
  layoutDensity,
  latestAction,
  nineSeat,
  onPress,
  phoneNine,
  player,
  profileHint,
  revealCards,
  role,
  simplified,
  tablet,
}: {
  actionBubble: MultiplayerActionBubblePresentation | null;
  actionKey: string;
  aiThinking: boolean;
  anchor: MultiwaySeatAnchor;
  /** The protected community-board lane in felt coords (for the DT-12 bubble
   * resolver); null when no measured layout was resolved. */
  bubbleBoard: MultiwayLayoutRect | null;
  /** The safe felt pane in felt coords (notch-inset boundaries) for the DT-12
   * bubble resolver; null when no measured layout was resolved. */
  bubblePane: MultiwayLayoutRect | null;
  compact: boolean;
  currentTurn: boolean;
  dense: boolean;
  /** Measured felt-relative pixel frame from the layout resolver; when
   * absent the seat falls back to its percentage anchor. The validated
   * width/height are the SAME numbers the collision matrix proved. */
  frame?: { height: number; left: number; top: number; width: number };
  handComplete: boolean;
  justActed: boolean;
  heroAvatar: HumanAvatarReference;
  layoutDensity?: SharedTableSeatDensity;
  latestAction: string | null;
  nineSeat: boolean;
  onPress?: () => void;
  phoneNine: boolean;
  player: MultiwayPlayerState;
  /** Accessibility hint shown when the profile action is unavailable. */
  profileHint?: string;
  revealCards: boolean;
  role: MultiwaySeatRoleBadge | null;
  simplified: boolean;
  tablet: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, compact, dense, false, tablet), [compact, dense, palette, tablet]);
  const isHero = player.id === 'hero';
  const seatDensity: SharedTableSeatDensity = layoutDensity ?? (phoneNine ? 'compact' : dense ? 'dense' : 'regular');
  const micro = seatDensity === 'compact';
  const condensed = seatDensity !== 'regular';
  const plaqueVisual = sharedTableSeatVisualTreatment(isHero ? 'human' : 'ai', false);
  const playerName = isHero ? t('common.you') : player.name;
  const roleAccessibilityLabel = role
    ? t(role === 'D' ? 'guide.dealer' : role === 'SB' ? 'guide.sb' : 'guide.bb')
    : null;
  const displayFolded = !handComplete && player.folded;
  const displayOut = player.stack === 0 && (handComplete || !player.allIn);
  const displayCurrentTurn = !handComplete && currentTurn;
  const persistentAction = !displayFolded && !handComplete ? latestAction : null;
  const tacticalState = handComplete
    ? displayOut ? t('multiway.state.out') : null
    : displayOut
      ? t('multiway.state.out')
      : displayFolded
        ? t('multiway.state.folded')
        : aiThinking
          ? t('table.thinking')
          : displayCurrentTurn
            ? isHero ? t('table.yourTurn') : t('table.acting')
            : player.allIn ? t('multiway.state.allIn') : null;
  // Keep one fixed, shrinking metadata line in compact absolute-positioned
  // seats while retaining both the exact action and important tactical state.
  const state = displayFolded || displayOut
    ? tacticalState
    : [persistentAction, tacticalState].filter(Boolean).join(' · ') || null;
  useActionBubbleAnnouncement(
    actionBubble ? actionKey : '',
    actionBubble ? `${t('multiplayer.game.actionHistory')}. ${playerName}. ${actionBubble.text}` : '',
  );
  return (
    <Pressable
      accessibilityHint={onPress ? t('multiway.seat.openProfileHint') : profileHint}
      accessibilityLabel={`${playerName}${roleAccessibilityLabel ? `, ${roleAccessibilityLabel}` : ''}${isHero ? '' : `, ${t('multiplayer.lobby.ai')}`}, ${formatChips(player.stack)}${actionBubble ? `, ${actionBubble.text}` : state ? `, ${state}` : ''}`}
      accessibilityLiveRegion={actionBubble ? 'polite' : 'none'}
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[styles.seat, dense && !isHero && styles.denseOpponentSeat, frame ?? multiwaySeatAnchorStyle(anchor, dense, tablet, nineSeat), displayCurrentTurn && styles.seatActive, justActed && styles.seatJustActed, actionBubble && styles.seatActionVisible, displayOut && styles.seatOut]}
    >
      <View style={[styles.seatLabel, simplified && !isHero && styles.simplifiedSeatLabel, condensed && styles.seatLabelCondensed, micro && styles.seatLabelMicro, plaqueVisual.borderStyle === 'dashed' && styles.aiSeatLabel, displayFolded && styles.seatLabelFolded, justActed && styles.seatLabelJustActed, displayCurrentTurn && styles.seatLabelActive]}>
        {role ? (
          <View accessibilityLabel={roleAccessibilityLabel ?? undefined} style={styles.roleMarker}>
            <Text style={styles.roleMarkerText}>{role}</Text>
          </View>
        ) : null}
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.seatName, role && styles.seatNameWithRole]}>{playerName}</Text>
        <View style={styles.seatStackRow}>
          {isHero ? (
            <HumanAvatar avatar={heroAvatar} displayName={playerName} size={micro ? 16 : condensed ? 24 : tablet ? 34 : 28} />
          ) : (
            <AiAvatar name={player.name} size={micro ? 16 : condensed ? 24 : tablet ? 34 : 28} />
          )}
          <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={1} style={styles.seatStack}>
            {formatChipsCompact(player.stack)}{condensed && state ? ` · ${state}` : ''}
          </Text>
        </View>
        {state && !condensed ? (
          <View style={[styles.actionBadge, displayFolded && styles.actionBadgeFolded, justActed && styles.actionBadgeJustActed, displayCurrentTurn && styles.actionBadgeActive]}>
            <Text adjustsFontSizeToFit minimumFontScale={0.76} numberOfLines={1} style={[styles.actionBadgeText, displayCurrentTurn && styles.actionBadgeTextActive]}>{state}</Text>
          </View>
        ) : simplified ? null : <View style={styles.actionBadgeSpacer} />}
      </View>
      <View style={[styles.seatCards, isHero && styles.heroCards, displayFolded && styles.seatCardsFolded]}>
        {Array.from({ length: 2 }, (_, index) => (
          <PlayingCard
            card={revealCards ? player.holeCards[index] : undefined}
            // P18-015: the hero's card tier sits one step above the ring
            // density's tier, so the hero's cards are strictly the largest
            // while every opponent stays at its density tier.
            compact={!isHero && !tablet && seatDensity === 'regular'}
            hidden={!revealCards}
            key={`${player.id}-card-${index}`}
            medium={!isHero && tablet && seatDensity === 'regular'}
            micro={!isHero && micro}
            mini={isHero ? seatDensity === 'compact' : seatDensity === 'dense'}
            small={isHero && seatDensity === 'dense'}
          />
        ))}
      </View>
      {actionBubble && frame ? (
        <MultiwaySeatActionBubble
          actionKey={actionKey}
          actorName={playerName}
          anchor={anchor}
          bubbleBoard={bubbleBoard}
          bubblePane={bubblePane}
          dense={dense}
          frame={frame}
          placement={multiwaySeatActionBubblePlacement(anchor, dense)}
          presentation={actionBubble}
          tablet={tablet}
        />
      ) : null}
    </Pressable>
  );
}

function MultiwaySeatActionBubble({
  actionKey,
  actorName,
  anchor,
  bubbleBoard,
  bubblePane,
  dense,
  frame,
  placement,
  presentation,
  tablet,
}: {
  actionKey: string;
  actorName: string;
  anchor: MultiwaySeatAnchor;
  /** The protected community-board lane in the same felt coords as `frame`. */
  bubbleBoard: MultiwayLayoutRect | null;
  /** The safe felt pane (notch-inset boundaries) in the same coords as `frame`. */
  bubblePane: MultiwayLayoutRect | null;
  dense: boolean;
  /** The validated felt-relative seat frame this bubble hangs off. */
  frame: { height: number; left: number; top: number; width: number };
  placement: 'above' | 'below';
  presentation: MultiplayerActionBubblePresentation;
  tablet: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette, false, dense, false, tablet), [dense, palette, tablet]);
  const progress = useRef(new Animated.Value(0)).current;
  const [bubbleContentSize, setBubbleContentSize] = useState<{ height: number; width: number } | null>(null);
  const accessibilityMessage = `${t('multiplayer.game.actionHistory')}. ${actorName}. ${presentation.text}`;
  useActionBubbleAnnouncement(actionKey, accessibilityMessage);

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      duration: 140,
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [actionKey, progress, reduceMotion]);

  useEffect(() => {
    setBubbleContentSize(null);
  }, [actionKey]);

  // DT-12: the bubble is laid out by the measured resolver (edge-seat inward
  // bias, flip off a clipping side, clamp inside the safe pane and out of the
  // protected board lane) whenever we have measured coords. The legacy align/
  // above-below style positioning is only a fallback for the one-frame span
  // before the layout lands.
  const maxBubbleWidth = tablet ? 190 : dense ? 88 : 116;
  const fallbackBubbleHeight = dense ? 36 : tablet ? 42 : 31;
  const tailSize = tablet ? 10 : 7;
  // Measure the rendered localized card first, then include the shadow/tail
  // envelope in the frame the resolver keeps inside the safe felt pane.
  const bubbleWidth = Math.min(maxBubbleWidth, bubbleContentSize?.width ?? maxBubbleWidth) + 12;
  const bubbleHeight = (bubbleContentSize?.height ?? fallbackBubbleHeight) + 12;
  const seatRect: MultiwayLayoutRect = {
    left: frame.left,
    top: frame.top,
    right: frame.left + frame.width,
    bottom: frame.top + frame.height,
  };
  const resolved = bubblePane && bubbleContentSize
    ? resolveMultiwayBubbleFrame({
        anchor,
        pane: bubblePane,
        seat: seatRect,
        bubbleHeight,
        bubbleWidth,
        prefer: placement,
        board: bubbleBoard,
      })
    : null;
  const below = resolved ? resolved.placement === 'below' : placement === 'below';
  const seatBubbleLayout = resolved
    ? {
        // The bubble is an absolutely-positioned child of the seat (which sits
        // at `frame`), so resolve the pane-space frame back into seat space.
        left: resolved.left - frame.left,
        top: resolved.top - frame.top,
        width: resolved.right - resolved.left,
        minHeight: resolved.bottom - resolved.top,
      }
    : null;
  const resolvedTailLeft = resolved
    ? (() => {
        const resolvedWidth = resolved.right - resolved.left;
        const sourceCenter = (seatRect.left + seatRect.right) / 2;
        const tailMargin = Math.min(8, Math.max(0, (resolvedWidth - tailSize) / 2));
        return Math.max(
          tailMargin,
          Math.min(
            sourceCenter - resolved.left - tailSize / 2,
            resolvedWidth - tailSize - tailMargin,
          ),
        );
      })()
    : (maxBubbleWidth - tailSize) / 2;
  return (
    <Animated.View
      accessibilityElementsHidden
      accessibilityLiveRegion="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        styles.seatActionBubbleAnchor,
        resolved
          ? seatBubbleLayout
          : [
              anchor.endsWith('left')
                ? styles.seatActionBubbleAlignLeft
                : anchor.endsWith('right')
                  ? styles.seatActionBubbleAlignRight
                  : styles.seatActionBubbleAlignCenter,
              below ? styles.seatActionBubbleBelow : styles.seatActionBubbleAbove,
            ],
        {
          opacity: progress,
          transform: [{
            scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
          }, {
            translateY: progress.interpolate({
              inputRange: [0, 1],
              outputRange: [below ? -5 : 5, 0],
            }),
          }],
        },
      ]}
    >
      <View style={[
        styles.seatActionBubble,
        resolved && (below ? styles.seatActionBubbleMeasuredBelow : styles.seatActionBubbleMeasuredAbove),
        presentation.tone === 'fold' && styles.seatActionBubbleFold,
        presentation.tone === 'check' && styles.seatActionBubbleCheck,
        presentation.tone === 'call' && styles.seatActionBubbleCall,
        presentation.tone === 'aggressive' && styles.seatActionBubbleAggressive,
        presentation.tone === 'all-in' && styles.seatActionBubbleAllIn,
      ]}
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setBubbleContentSize((previous) => previous
          && previous.width === width
          && previous.height === height
          ? previous
          : { height, width });
      }}>
        <ActionBubbleText
          emphasis={presentation.emphasis}
          maxFontSizeMultiplier={dense ? 1.05 : tablet ? 1.1 : 1.15}
          numberOfLines={tablet || dense ? 2 : 3}
          style={styles.seatActionBubbleText}
          text={presentation.text}
        />
      </View>
      <View style={[
        styles.seatActionBubbleTail,
        { left: resolvedTailLeft },
        resolved
          ? below ? styles.seatActionBubbleTailTopMeasured : styles.seatActionBubbleTailBottomMeasured
          : below ? styles.seatActionBubbleTailTop : styles.seatActionBubbleTailBottom,
      ]} />
    </Animated.View>
  );
}


function SimpleSheet({ children, onClose, visible }: { children: React.ReactNode; onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette, false), [palette]);
  const reduceMotion = useReducedMotion();
  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} supportedOrientations={LIVE_TABLE_SUPPORTED_ORIENTATIONS} transparent visible={visible}>
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

function createStyles(
  palette: ThemePalette,
  compact: boolean,
  dense = false,
  landscape = false,
  tablet = false,
  centerInsetPercent: 18 | 24 | 25 = 18,
  centerTopPercent: 30 | 34 | 38 = 34,
  ninePhone = false,
) {
  const compactHeader = compact && !tablet;
  return StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: compact ? 9 : 13, paddingTop: compact ? 3 : 7, paddingBottom: 5, gap: tablet ? 10 : compact ? 6 : 9, backgroundColor: palette.background },
    header: { height: tablet ? 56 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    handMeta: { flex: 1, minWidth: compactHeader ? 42 : 0, alignItems: 'center', paddingHorizontal: compactHeader ? 1 : 4 },
    handTitle: { maxWidth: '100%', color: palette.text, fontSize: tablet ? 16 : 12, fontWeight: '700', textAlign: 'center' },
    street: { maxWidth: '100%', color: palette.muted, fontSize: tablet ? 11 : compactHeader ? 8 : 9, marginTop: 2, textAlign: 'center' },
    headerControls: { flexDirection: 'row', alignItems: 'center', gap: compactHeader ? 3 : 5 },
    headerControl: { minWidth: LIVE_TABLE_HEADER_CONTROL_SIZE, height: LIVE_TABLE_HEADER_CONTROL_SIZE, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    orientationButtonDisabled: { opacity: 0.55 },
    sessionButton: { width: LIVE_TABLE_HEADER_CONTROL_SIZE, flexDirection: 'row', gap: 2, backgroundColor: palette.surface },
    guideButton: { width: LIVE_TABLE_HEADER_CONTROL_SIZE, backgroundColor: palette.accentSoft },
    sessionCount: { color: palette.text, fontSize: tablet ? 12 : 10, fontWeight: '700' },
    coachIconToggle: { width: LIVE_TABLE_HEADER_CONTROL_SIZE, backgroundColor: palette.surface },
    coachIconToggleActive: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    fairModePill: { flexDirection: 'row', gap: 3, paddingHorizontal: tablet ? 10 : 0, backgroundColor: palette.aquaSoft },
    fairModePillCompact: { width: LIVE_TABLE_HEADER_CONTROL_SIZE, paddingHorizontal: 0 },
    fairModeText: { color: palette.aquaText, fontSize: tablet ? 10 : 8.5, fontWeight: '800' },
    tableBody: { flex: 1, gap: compact ? 6 : 9 },
    tableBodyLandscape: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
    // The nine-seat phone ring stacks five plaque bands plus the board, so it
    // raises the felt floor from the six-max 295pt to 350pt. Available screen
    // height on every supported phone still exceeds this floor, and the ring
    // percentages only gain breathing room as the felt grows above it.
    tableFrame: { flex: 1, minHeight: landscape ? 0 : ninePhone ? 350 : compact ? 295 : 390 },
    tableRail: { gap: compact ? 6 : 9 },
    tableRailLandscape: { minWidth: 190, maxWidth: 360, justifyContent: 'flex-start' },
    tableControlRail: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 6 },
    tableControlRailLandscape: { flexDirection: 'column' },
    tableControlRailMain: { flex: 1, minWidth: 0 },
    table: { flex: 1, overflow: 'hidden', borderRadius: tablet ? 30 : compact ? 22 : 26, borderWidth: 1, borderColor: palette.tableLine, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 22, elevation: 5 },
    tableRing: { position: 'absolute', top: 6, right: 6, bottom: 6, left: 6, borderRadius: tablet ? 22 : compact ? 15 : 18, borderWidth: 1, borderColor: palette.tableLine },
    seat: { position: 'absolute', zIndex: 2, width: tablet ? 144 : compact ? 91 : 100, alignItems: 'center', gap: tablet ? 5 : 2, opacity: 1 },
    denseOpponentSeat: { width: tablet ? 136 : 88 },
    seatActive: { zIndex: 5, transform: [{ scale: 1.06 }] },
    seatJustActed: { zIndex: 4 },
    seatActionVisible: { zIndex: 6 },
    seatOut: { opacity: 0.34 },
    seatCards: { flexDirection: 'row', gap: tablet ? 3 : 2 },
    seatCardsFolded: { opacity: 0.3 },
    heroCards: { gap: tablet ? 5 : 4 },
    seatLabel: { position: 'relative', width: '100%', minHeight: tablet ? 72 : compact ? 46 : dense ? 48 : 51, paddingHorizontal: tablet ? 9 : 5, paddingVertical: tablet ? 7 : 4, alignItems: 'center', borderRadius: tablet ? 13 : 10, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    simplifiedSeatLabel: { minHeight: 45, justifyContent: 'center', paddingVertical: 5 },
    seatLabelCondensed: { minHeight: 48, paddingHorizontal: 5, paddingVertical: 4 },
    // Two readable identity lines plus the active-seat scale fit inside the
    // shared 72pt compact plaque+cards envelope.
    seatLabelMicro: { minHeight: 40, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 7 },
    seatLabelFolded: { borderColor: palette.tableLine },
    seatLabelActive: { borderColor: palette.aqua, borderWidth: 2 },
    // The seat that just acted, held until the next player acts. Distinct from
    // seatLabelActive (whose turn it is) so the two never read as the same thing.
    seatLabelJustActed: { borderColor: palette.primary, borderWidth: 2, backgroundColor: palette.tableLine },
    seatName: { width: '100%', textAlign: 'center', color: palette.tableText, fontSize: tablet ? 14 : dense ? 11 : compact ? 9.5 : 10, fontWeight: '800' },
    seatNameWithRole: { paddingHorizontal: tablet ? 27 : 22 },
    roleMarker: { position: 'absolute', zIndex: 2, top: tablet ? 5 : 3, right: tablet ? 5 : 3, minWidth: tablet ? 28 : 22, minHeight: tablet ? 22 : 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tablet ? 6 : 4, borderRadius: tablet ? 8 : 6, backgroundColor: palette.primary, borderWidth: 1, borderColor: palette.primaryText },
    // AI identity is encoded on the boundary. The dashed neutral line remains
    // visible without competing with active/winner colors, while accessibility
    // still announces the localized AI label.
    aiSeatLabel: { borderColor: palette.muted, borderStyle: 'dashed' },
    roleMarkerText: { color: palette.primaryText, fontSize: tablet ? 10.5 : 8, fontWeight: '900', letterSpacing: 0.2 },
    seatActionBubbleAnchor: { position: 'absolute', zIndex: 8, width: tablet ? 190 : dense ? 88 : 116, alignItems: 'center' },
    seatActionBubbleAlignLeft: { left: 0 },
    seatActionBubbleAlignRight: { right: 0 },
    seatActionBubbleAlignCenter: { left: tablet ? -23 : dense ? 0 : -10 },
    seatActionBubbleBelow: { top: '100%', marginTop: tablet ? 7 : 4 },
    seatActionBubbleAbove: { bottom: '100%', marginBottom: tablet ? 7 : 4 },
    seatActionBubble: { maxWidth: '100%', height: dense ? 36 : undefined, minHeight: tablet ? 42 : 31, alignItems: 'center', justifyContent: 'center', paddingHorizontal: tablet ? 13 : dense ? 5 : 7, paddingVertical: tablet ? 8 : dense ? 4 : 5, borderRadius: tablet ? 13 : 9, borderWidth: 1.5, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 9, elevation: 7 },
    seatActionBubbleMeasuredBelow: { marginTop: 6 },
    seatActionBubbleMeasuredAbove: { marginBottom: 6 },
    seatActionBubbleFold: { borderColor: palette.tableLine },
    seatActionBubbleCheck: { borderColor: palette.aqua },
    seatActionBubbleCall: { borderColor: palette.primary },
    seatActionBubbleAggressive: { borderColor: palette.primary, borderWidth: 2 },
    seatActionBubbleAllIn: { borderColor: palette.danger, borderWidth: 2, shadowColor: palette.danger, shadowOpacity: 0.3 },
    seatActionBubbleText: { color: palette.text, fontSize: tablet ? 12.5 : 9, lineHeight: tablet ? 17 : 11.5, fontWeight: '600', textAlign: 'center' },
    seatActionBubbleTail: { position: 'absolute', width: tablet ? 10 : 7, height: tablet ? 10 : 7, borderWidth: 1, borderColor: palette.tableLine, backgroundColor: palette.surfaceRaised, transform: [{ rotate: '45deg' }] },
    seatActionBubbleTailTop: { top: tablet ? -5 : -3 },
    seatActionBubbleTailBottom: { bottom: tablet ? -5 : -3 },
    seatActionBubbleTailTopMeasured: { top: 2 },
    seatActionBubbleTailBottomMeasured: { bottom: 2 },
    seatStackRow: { width: '100%', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: tablet ? 5 : dense ? 2 : 3, marginTop: tablet ? 2 : 1 },
    seatStack: { color: palette.tableText, fontSize: tablet ? 13 : dense ? 10 : compact ? 8.5 : 9, fontWeight: '700' },
    actionBadge: { maxWidth: dense ? 88 : '100%', minHeight: tablet ? 21 : 17, justifyContent: 'center', marginTop: tablet ? 3 : 2, paddingHorizontal: tablet ? 8 : dense ? 4 : 6, borderRadius: tablet ? 7 : 6, backgroundColor: palette.tableLine },
    actionBadgeWithMeta: { paddingVertical: tablet ? 3 : 2 },
    actionBadgeFolded: { backgroundColor: palette.tableLine },
    actionBadgeJustActed: { backgroundColor: palette.primary },
    actionBadgeActive: { backgroundColor: palette.aqua },
    actionBadgeText: { color: palette.tableText, fontSize: tablet ? 10.5 : dense ? 9 : compact ? 8 : 8.5, fontWeight: '800' },
    actionBadgeTextActive: { color: palette.background },
    actionBadgeMeta: { color: palette.tableText, opacity: 0.78, fontSize: tablet ? 9 : dense ? 7 : 7.5, fontWeight: '800' },
    actionBadgeSpacer: { height: tablet ? 24 : 19 },
    heroInlineActionBubble: { width: '100%', height: 22, marginTop: 2, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', borderRadius: 6, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.tableLine },
    heroInlineActionBubbleText: { color: palette.tableText, fontSize: 7.5, lineHeight: 9, fontWeight: '600', textAlign: 'center' },
    centerZone: { position: 'absolute', zIndex: 1, left: `${centerInsetPercent}%`, right: `${centerInsetPercent}%`, top: `${centerTopPercent}%`, alignItems: 'center', gap: tablet ? 9 : dense ? 3 : compact ? 5 : 8 },
    potPill: { paddingHorizontal: dense ? 7 : 9, paddingVertical: dense ? 2 : 4, borderRadius: 9, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    potText: { color: palette.tableText, fontSize: tablet ? 11.5 : dense ? 10.5 : 9, fontWeight: '800' },
    boardRow: { flexDirection: 'row', gap: compact ? 2 : 3 },
    statusCard: { minWidth: dense ? '100%' : '72%', maxWidth: '100%', minHeight: tablet ? 50 : compact ? 40 : dense ? 44 : 46, paddingHorizontal: tablet ? 11 : 8, paddingVertical: tablet ? 7 : 5, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.tableDeep, borderWidth: 1, borderColor: palette.tableLine },
    thinkingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
    statusText: { color: palette.tableText, fontSize: tablet ? 12 : dense ? 9.5 : compact ? 8.5 : 9.5, textAlign: 'center' },
    centerStatusText: { color: palette.aqua, fontSize: tablet ? 13.5 : dense ? 11 : compact ? 10 : 11.5, fontWeight: '800', textAlign: 'center' },
    statusCardLandscape: { width: '100%', minWidth: 0, minHeight: 58, alignItems: 'flex-start', paddingHorizontal: 13, paddingVertical: 11, backgroundColor: palette.surface, borderColor: palette.border },
    statusTextLandscape: { color: palette.muted, textAlign: 'left' },
    centerStatusTextLandscape: { color: palette.primary, textAlign: 'left' },
    resultBar: { minHeight: tablet ? 72 : compact ? 60 : 64, flexDirection: 'row', alignItems: 'center', gap: tablet ? 12 : 9, paddingHorizontal: tablet ? 14 : 10, paddingVertical: compact ? 6 : 8, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    resultIcon: { width: tablet ? 40 : 34, height: tablet ? 40 : 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
    resultCopy: { flex: 1, minWidth: 0 },
    resultHeadline: { minWidth: 0, flexDirection: 'row', alignItems: 'baseline', gap: tablet ? 8 : 5 },
    resultTitle: { flexShrink: 1, color: palette.text, fontSize: tablet ? 14 : compact ? 11.5 : 12, fontWeight: '800' },
    resultAmount: { color: palette.primary, fontSize: tablet ? 15 : compact ? 12 : 13, fontWeight: '900', fontVariant: ['tabular-nums'] },
    resultDetail: { color: palette.muted, fontSize: tablet ? 11 : compact ? 9.5 : 10, lineHeight: tablet ? 15 : compact ? 12 : 13, marginTop: 2 },
    coachBar: { minHeight: compact ? 52 : 57, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: compact ? 8 : 11, paddingVertical: compact ? 6 : 7, borderRadius: 15, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    coachIcon: { width: 33, height: 33, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.aquaSoft },
    coachCopy: { flex: 1, minWidth: 0 },
    coachTitle: { color: palette.text, fontSize: 10.5, fontWeight: '800' },
    coachText: { color: palette.muted, fontSize: compact ? 8.5 : 9.5, lineHeight: compact ? 12 : 13, marginTop: 2 },
    detailsButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    turnClock: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 12, backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.border },
    turnClockWarning: { backgroundColor: palette.accentSoft, borderColor: palette.danger },
    turnClockCritical: { backgroundColor: palette.danger, borderColor: palette.danger },
    turnClockText: { color: palette.text, fontSize: 13, fontWeight: '800' },
    turnClockTextUrgent: { color: palette.danger },
    actions: { flexDirection: 'row', gap: 7 },
    actionsLandscape: { flexDirection: 'row', gap: 5, marginTop: 'auto' },
    scrim: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: palette.scrim },
    sheet: { width: '100%', maxWidth: 620, maxHeight: '90%', alignSelf: 'center', gap: 15, padding: 18, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
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
    profileIdentityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 4 },
    profileIdentityPill: { color: palette.muted, fontSize: 11, fontWeight: '900', letterSpacing: 0.5, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, backgroundColor: palette.soft, borderWidth: StyleSheet.hairlineWidth, borderColor: palette.border },
    // DT-07/DT-08: a compact in-popup notice that an open read-only sheet will
    // not hide the live "your turn" state, so the decision urgency stays
    // visible while the popup is open.
    profileTurnNotice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 11, backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.danger },
    profileTurnNoticeText: { color: palette.danger, fontSize: 12.5, fontWeight: '800' },
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
