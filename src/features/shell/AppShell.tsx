import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as ScreenOrientation from 'expo-screen-orientation';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildAdaptiveLearningRecommendation,
  type AdaptiveLearningRecommendation,
} from '../../domain/learning/adaptiveRecommendation';
import {
  guidedLearningContext,
  latestLearningSnapshot,
  type CalibrationKind,
  type LearningGoalId,
} from '../../domain/learning/guidedProgress';
import { findLearningActivity, lessons, scenarioTrainer } from '../../domain/learning/content';
import {
  completedLessonCount,
  recommendedLearningActivityId,
} from '../../domain/learning/progress';
import { buildPersonalPracticePlan, type PersonalPracticePlanTarget } from '../../domain/learning/personalPracticePlan';
import {
  composeRecommendedSessionPlan,
  isSessionPlannable,
  type RecommendedSessionPlan,
} from '../../domain/learning/recommendedSession';
import type { GradedHandEvidence, SessionStepDecisions } from '../../domain/learning/sessionClosing';
import { reviewFocusAreaForScenario } from '../../domain/learning/practicePacks';
import type { ScenarioAttemptReview, ScenarioTrainerDefinition } from '../../domain/learning/types';
import {
  loadCachedLearningReviewQueue,
  updateLearningReviewQueue,
} from '../../services/learningReviewQueue';
import {
  clearRecommendedSession,
  loadRecommendedSession,
  saveRecommendedSession,
} from '../../services/recommendedSessionCheckpoint';
import {
  clearSessionEvidence,
  loadSessionEvidence,
  saveSessionEvidence,
} from '../../services/recommendedSessionEvidence';
import type { LessonDefinition, LearningActivityDefinition, LearningProgressEntry, TrainerAttemptReview, TrainerDefinition } from '../../domain/learning/types';
import {
  tableMissionById,
  type TableMissionId,
  type TableMissionResult,
} from '../../domain/learning/tableMissions';
import type { AiDifficulty } from '../../domain/poker/aiProfiles';
import {
  CASH_GAME_BIG_BLIND,
  DEFAULT_CUSTOM_SESSION_CONFIG,
  QUICK_PLAY_SESSION_CONFIG,
  SESSION_HAND_TARGET_OPTIONS,
  STARTING_STACK_OPTIONS,
  type PracticeSessionConfig,
} from '../../domain/poker/session';
import type { CoachFocusArea } from '../../domain/poker/types';
import {
  applyOpponentObservation,
  type HeroHandObservation,
  type OpponentMemory,
} from '../../domain/poker/opponentMemory';
import {
  TABLE_PLAYER_COUNT_OPTIONS,
  type TablePace,
  type TablePlayerCount,
} from '../../domain/poker/multiwaySession';
import {
  DAILY_CHALLENGE_VERSION,
  dailyChallengeDate,
  dailyChallengeDisplayDate,
  dailyChallengeStreak,
  type DailyChallengeCheckpoint,
  type DailyChallengeResult,
} from '../../domain/poker/dailyChallenge';
import {
  currentDailyChallengeProgress,
  dailyChallengeStreakDatesForVersion,
} from '../../domain/poker/dailyChallengeProgress';
import {
  championshipAchievements,
  championshipCurrentEvent,
  championshipEvent,
  championshipEventIsUnlocked,
  championshipIsComplete,
  championshipInvitationIsComplete,
  championshipInvitationIsUnlocked,
  championshipQualifiedCount,
  createChampionshipCheckpoint,
  type ChampionshipCheckpoint,
  type ChampionshipEvent,
  type ChampionshipEventId,
  type ChampionshipProgress,
  type ChampionshipResult,
} from '../../domain/poker/championship';
import {
  SIT_AND_GO_INITIAL_BIG_BLIND,
  SIT_AND_GO_STRUCTURES,
  type SitAndGoCheckpoint,
  type SitAndGoPlayerCount,
} from '../../domain/poker/tournament';
import { formatChips } from '../../domain/poker/moneyFormat';
import { deleteAllHandHistory, loadRecentHandHistory } from '../../services/handHistory';
import { deleteCurrentAccount } from '../../services/accountDeletion';
import {
  loadOpponentMemory,
  resetOpponentMemory,
  saveOpponentMemory,
} from '../../services/opponentMemory';
import { completeOnboarding, shouldShowOnboarding } from '../../services/onboarding';
import { AiRosterModal } from '../learn/AiRosterModal';
import { LearnScreen } from '../learn/LearnScreen';
import { ScenarioTrainingModal } from '../learn/ScenarioTrainingModal';
import { RecommendedSessionFlow } from '../learn/RecommendedSessionFlow';
import { HandHistoryEvidenceController } from './handHistoryEvidenceController';
import { gradedHandEvidence } from '../learn/closingOutcome';

import {
  journeyDone,
  journeyEndEarly,
  journeySkip,
  journeyStart,
  journeyMissionExit,
} from '../learn/recommendedSessionJourney';
import { RecommendedSessionHomeCard } from '../learn/RecommendedSessionHomeCard';
import { useLearningProgress } from '../learn/useLearningProgress';
import { ProgressModal } from '../profile/ProgressModal';
import { PokerTableScreen } from '../table/PokerTableScreen';
import { MultiwayPokerTableScreen } from '../table/MultiwayPokerTableScreen';
import { HandReplayModal } from '../table/HandReplayModal';
import { SessionHistoryModal } from '../table/SessionHistoryModal';
import { summarizeSessionHandLearning, type SessionHandRecord } from '../table/sessionModels';
import { type ThemePalette, type ThemePreference, useAppTheme } from '../../theme';
import { BetaInfoModal } from './BetaInfoModal';
import { BetaFeedbackModal } from './BetaFeedbackModal';
import { FirstRunOnboardingModal } from './FirstRunOnboardingModal';
import { LearningSetupModal } from '../learn/LearningSetupModal';
import { SkillCalibrationModal } from '../learn/SkillCalibrationModal';
import { MultiplayerEntryCard } from '../multiplayer/MultiplayerEntryCard';
import { MultiplayerFlowModal } from '../multiplayer/MultiplayerFlowModal';
import { multiplayerPreviewEnabled } from '../multiplayer/multiplayerPreview';
import type { MultiplayerFlowMode } from '../multiplayer/multiplayerUx';
import { parseMultiplayerInviteUrl } from '../../services/multiplayerInvite';
import {
  departMultiplayerRoomForInviteReplacement,
  resolveMultiplayerInviteRoute,
  routeMultiplayerInviteAfterBootstrap,
} from '../../services/multiplayerInviteRouting';
import {
  deleteAllMultiplayerHandHistory,
  resumeMultiplayerTable,
  sendMultiplayerCommand,
  syncMultiplayerTable,
} from '../../services/multiplayer';
import {
  clearActiveMultiplayerRoom,
  loadActiveMultiplayerRoom,
  saveDiscoveredActiveMultiplayerRoom,
  type ActiveMultiplayerRoomRecord,
} from '../../services/multiplayerRecovery';
import {
  DEFAULT_PLAYER_DISPLAY_NAME,
  PLAYER_DISPLAY_NAME_MAX_LENGTH,
  loadPlayerDisplayName,
  loadPlayerProfile,
  savePlayerDisplayName,
} from '../../services/playerProfile';
import { validatePlayerDisplayName } from '../../domain/playerProfile';
import { HumanAvatarProfilePicker } from '../../components/HumanAvatarProfilePicker';
import { useGameFeedbackPreferences } from '../../services/gameFeedbackPreferences';
import { ChampionshipModal } from './ChampionshipModal';
import { ChampionshipRecordModal } from './ChampionshipRecordModal';
import {
  aiDifficultyPickerLayout,
  resolveLocalAiDifficulty,
  SELECTABLE_AI_DIFFICULTIES,
} from './aiGameModePolicy';
import { OpponentReadCard } from '../../components/OpponentReadCard';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import { PlayerNamePresetPicker } from '../../components/PlayerNamePresetPicker';
import {
  LANGUAGE_PREFERENCES,
  type AppLanguage,
  type LanguagePreference,
  type MessageKey,
  useLocalization,
} from '../../localization';
import { accountDeletionMessage } from '../../localization/accountDeletionMessages';
import {
  clearDailyChallengeCheckpoint,
  clearSitAndGoCheckpoint,
  loadDailyChallengeCheckpoint,
  loadSitAndGoCheckpoint,
  saveDailyChallengeCheckpoint,
  saveSitAndGoCheckpoint,
} from '../../services/tournamentCheckpoint';
import {
  deleteAllDailyChallengeProgress,
  loadCachedDailyChallengeProgress,
  loadDailyChallengeProgress,
  recordDailyChallengeResult,
  type DailyChallengeProgress,
} from '../../services/dailyChallengeProgress';
import {
  clearChampionshipCheckpoint,
  clearChampionshipProgress,
  loadChampionshipCheckpoint,
  loadChampionshipProgress,
  recordChampionshipResult,
  saveChampionshipCheckpoint,
} from '../../services/championshipProgress';

type IconName = ComponentProps<typeof Ionicons>['name'];
type MainTab = 'home' | 'learn' | 'play';
type Screen = MainTab | 'profile' | 'setup' | 'table';
type TableMode = 'practice' | 'learning_mission' | 'sit_and_go' | 'daily_challenge' | 'championship';
type Translator = ReturnType<typeof useLocalization>['t'];

interface MultiplayerLaunch {
  id: number;
  initialMode: MultiplayerFlowMode;
  initialRoomCode?: string;
  resumeRecord?: ActiveMultiplayerRoomRecord;
}

function recordTrainerReview(
  trainer: TrainerDefinition,
  review: TrainerAttemptReview,
): void {
  updateLearningReviewQueue(
    review.missedQuestionIds.map((questionId) => ({
      activityId: trainer.id,
      questionId,
      source: 'trainer' as const,
    })),
    review.correctQuestionIds.map((questionId) => ({
      correct: true,
      itemId: `trainer:${trainer.id}:${questionId}`,
    })),
  );
}

function recordScenarioReview(
  trainer: ScenarioTrainerDefinition,
  review: ScenarioAttemptReview,
  preferredFocus?: string | null,
): void {
  updateLearningReviewQueue(
    review.missedScenarios.map((scenario) => ({
      activityId: trainer.id,
      focusArea: reviewFocusAreaForScenario(scenario, preferredFocus),
      scenario,
      source: 'scenario' as const,
    })),
    review.correctScenarioIds.map((scenarioId) => ({
      correct: true,
      itemId: `scenario:${trainer.id}:${scenarioId}`,
    })),
  );
}

/**
 * Resolves the next continue-path *activity* a personal-plan target routes to,
 * or null for a review target (a review is the "next review timing", not a
 * continue-path activity). The id is stable and localized at render time.
 */
function nextActivityIdForTarget(target: PersonalPracticePlanTarget | null): string | null {
  if (!target) return null;
  switch (target.kind) {
    case 'review':
      return null;
    case 'practice':
      return target.pack.progressActivityId;
    case 'activity':
      return target.activity.id;
    case 'curriculum':
      return target.step.id;
  }
}

/**
 * Setup and home copy quote chips, not the big-blind multiple the configs store,
 * so the number a player reads before sitting down matches the felt.
 */
const quickPlayStartingChips = formatChips(QUICK_PLAY_SESSION_CONFIG.startingStackBb * CASH_GAME_BIG_BLIND);
const sitAndGoStartingChips = formatChips(
  SIT_AND_GO_STRUCTURES.standard.startingStackBb * SIT_AND_GO_INITIAL_BIG_BLIND,
);

export function AppShell() {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const [screen, setScreen] = useState<Screen>('home');
  const [multiplayerLaunch, setMultiplayerLaunch] = useState<MultiplayerLaunch | null>(null);
  const [activeMultiplayerRoom, setActiveMultiplayerRoom] = useState<ActiveMultiplayerRoomRecord | null>(
    loadActiveMultiplayerRoom,
  );
  const multiplayerLaunchSequence = useRef(0);
  const lastInviteDelivery = useRef<{ atMs: number; url: string } | null>(null);
  const activeRoomLookupAttempted = useRef(false);
  const activeRoomLookup = useRef<Promise<void> | null>(null);
  const accountDeletionCompleted = useRef(false);
  const inviteReplacementInFlight = useRef(false);
  const inviteScreen = useRef<Screen>(screen);
  const inviteActiveRoom = useRef<ActiveMultiplayerRoomRecord | null>(activeMultiplayerRoom);
  const inviteOpenFlow = useRef<MultiplayerLaunch | null>(multiplayerLaunch);
  const inviteTranslator = useRef(t);
  const [tableReturnScreen, setTableReturnScreen] = useState<Exclude<Screen, 'table'>>('play');
  const [coachEnabled, setCoachEnabled] = useState(true);
  /** Custom and Sit & Go keep separate choices; a launch snapshots one below. */
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('club');
  const [sitAndGoDifficulty, setSitAndGoDifficulty] = useState<AiDifficulty>('club');
  const [activeAiDifficulty, setActiveAiDifficulty] = useState<AiDifficulty>('club');
  const [tablePace, setTablePace] = useState<TablePace>('normal');
  const [rosterVisible, setRosterVisible] = useState(false);
  const [customSessionConfig, setCustomSessionConfig] = useState<PracticeSessionConfig>(DEFAULT_CUSTOM_SESSION_CONFIG);
  const [activeSessionConfig, setActiveSessionConfig] = useState<PracticeSessionConfig>(QUICK_PLAY_SESSION_CONFIG);
  const [customPlayerCount, setCustomPlayerCount] = useState<TablePlayerCount>(3);
  const [activePlayerCount, setActivePlayerCount] = useState<TablePlayerCount>(2);
  const [activeTableMode, setActiveTableMode] = useState<TableMode>('practice');
  const [activeLearningMissionId, setActiveLearningMissionId] = useState<TableMissionId | null>(null);
  const [tournamentCheckpoints, setTournamentCheckpoints] = useState<Record<SitAndGoPlayerCount, SitAndGoCheckpoint | null>>(() => ({
    3: loadSitAndGoCheckpoint(3),
    6: loadSitAndGoCheckpoint(6),
  }));
  const [today, setToday] = useState(dailyChallengeDate);
  const [dailyCheckpoint, setDailyCheckpoint] = useState<DailyChallengeCheckpoint | null>(() => loadDailyChallengeCheckpoint(today));
  const [dailyProgress, setDailyProgress] = useState<DailyChallengeProgress[]>(loadCachedDailyChallengeProgress);
  const [championshipProgress, setChampionshipProgress] = useState<ChampionshipProgress>(loadChampionshipProgress);
  const [championshipCheckpoint, setChampionshipCheckpoint] = useState<ChampionshipCheckpoint | null>(loadChampionshipCheckpoint);
  const [activeChampionshipEventId, setActiveChampionshipEventId] = useState<ChampionshipEventId>('local_tables');
  const [championshipVisible, setChampionshipVisible] = useState(false);
  const [championshipRecordVisible, setChampionshipRecordVisible] = useState(false);
  const [practiceFocus, setPracticeFocus] = useState<string | null>(null);
  const [learningLaunchActivityId, setLearningLaunchActivityId] = useState<string | null>(null);
  const [learningLaunchRecommendation, setLearningLaunchRecommendation] = useState<AdaptiveLearningRecommendation | null>(null);
  const [launchCheatSheets, setLaunchCheatSheets] = useState(false);
  const [scenarioTrainingVisible, setScenarioTrainingVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(shouldShowOnboarding);
  const [learningSetupVisible, setLearningSetupVisible] = useState(false);
  const [calibrationVisible, setCalibrationVisible] = useState(false);
  const [calibrationKind, setCalibrationKind] = useState<CalibrationKind>('baseline');
  const calibrationOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opponentMemory, setOpponentMemory] = useState(loadOpponentMemory);
  const learning = useLearningProgress();
  // ----- Recommended session: Home preview card + journey controller -----
  const recommendedSessionSnapshot = useMemo(() => loadRecommendedSession(), []);
  const [recommendedSession, setRecommendedSession] = useState<RecommendedSessionPlan | null>(recommendedSessionSnapshot.plan);
  const [recommendedSessionOpen, setRecommendedSessionOpen] = useState(false);
  const recommendedSessionDiagnostics = recommendedSessionSnapshot.diagnostics;
  // The step the dispatched table mission must advance, tagged with the mission
  // it came from. Tagging it lets a return from any other (non-recommended)
  // mission be rejected so it cannot settle the recommended session's step.
  const missionStepRef = useRef<{ stepId: string; missionId: TableMissionId } | null>(null);
  // The recommended mission the table just returned with a result and checkpointed
  // as completed. A table "Back to Learn"/"Exit" whose id matches it is a
  // completion return: keep the controller open so the next journey step or the
  // terminal view renders rather than generic Learn. Cleared again on dispatch so
  // only the current table mission is treated as a completion.
  const completedRecommendedMissionId = useRef<TableMissionId | null>(null);
  // The closing outcome freezes the session's own decision evidence when the
  // session reaches a terminal state. These tallies are hydrated from the
  // per-plan checkpoint on (re)start and only grow during the session, so the
  // "what did I practice / what changed" copy is built from the session itself
  // (decisions + prior evidence), never from chip profit or the next
  // recommendation.
  const sessionEvidenceRef = useRef<SessionStepDecisions>({ decisionsScored: 0, costlyMistakes: 0 });
  // The id of the session whose evidence is being accumulated. A plan id that
  // differs from a resumed plan's stored evidence means a genuinely new
  // session, which must start from zero.
  const currentPlanIdRef = useRef<string | null>(null);
  // Quiet secondary route from the closing outcome to detailed progress, rendered
  // at the shell level so the Learn flow can open it without the Profile screen.
  const [closingProgressVisible, setClosingProgressVisible] = useState(false);
  const [closingHands, setClosingHands] = useState<SessionHandRecord[]>([]);
  // Whether the recorded hands above have finished loading. The closing view
  // gates on this (a terminal plan may exist from a prior session, but the
  // graded-hand evidence loads only after the session opens) so a cold-relaunch
  // freeze never wins the race against that async load and omits hand evidence.
  const [closingHandsLoaded, setClosingHandsLoaded] = useState(false);
  // Coordinates the closing hand-history loads so only the newest may record the
  // hands or (re)open the gate; a stale load racing it (a mission refresh
  // superseding the session-opening load, or a late request after close) is
  // discarded. Created once; its snapshot is mirrored into the state above so
  // every begin()/invalidate() republishes and re-renders.
  const handHistoryLoadRef = useRef(new HandHistoryEvidenceController(loadRecentHandHistory));
  useEffect(() => {
    handHistoryLoadRef.current.onChange = ({ hands, loaded }) => {
      setClosingHands(hands);
      setClosingHandsLoaded(loaded);
    };
  }, []);

  // A terminal (completed/abandoned) plan can be shown while a fresh session is
  // opening. On open, its graded hand evidence loads asynchronously, so the
  // reset below re-arms the gate until that load settles for this session.
  useEffect(() => {
    if (!recommendedSessionOpen) {
      // Invalidate any in-flight load: a late-resolving request from the prior
      // session can't re-arm the gate or overwrite the cleared hands once the
      // next session opens.
      handHistoryLoadRef.current.invalidate();
    }
  }, [recommendedSessionOpen]);

  // Load the recorded hands when a session opens (so the closing summary has
  // graded-hand evidence to freeze) and refresh when the detailed-progress route
  // opens. Local-first: resolves from the on-device store even offline.
  useEffect(() => {
    if (!recommendedSessionOpen && !closingProgressVisible) return;
    handHistoryLoadRef.current.begin();
  }, [recommendedSessionOpen, closingProgressVisible]);

  // Project the loaded hands into chip-free, presentation-level evidence the
  // domain can count by distinct hand id.
  const closingHandEvidence = useMemo<readonly GradedHandEvidence[]>(
    () => gradedHandEvidence(closingHands),
    [closingHands],
  );

  // Compose a fresh session plan once the learner's profile is loaded, so the
  // Home preview card has a session to show and the controller has one to drive.
  // Any persisted plan with steps is kept rather than replaced: an open
  // (planned/active) journey resumes in place, and a completed/abandoned (terminal)
  // one keeps its closing outcome until the learner dismisses it with "Finish".
  // A genuinely fresh plan is composed only when the checkpoint is empty.
  useEffect(() => {
    if (learning.loading) return;
    // Do not (re)compose while the controller is driving the session: an
    // open, in-progress journey must not be replaced, and a completed/abandoned
    // checkpoint must survive until the learner dismisses it. The terminal view
    // stays mounted (recommendedSessionOpen stays true) so "Finish" is reachable.
    if (recommendedSessionOpen) return;
    const { plan } = loadRecommendedSession();
    if (plan && plan.steps.length > 0) {
      setRecommendedSession(plan);
      return;
    }
    const composed = composeRecommendedSessionPlan(
      buildPersonalPracticePlan(learning.progress, loadCachedLearningReviewQueue(), practiceFocus, true, undefined, guidedLearningContext(learning.profile)),
      learning.progress,
      loadCachedLearningReviewQueue(),
    );
    if (isSessionPlannable(composed)) {
      saveRecommendedSession(composed);
      setRecommendedSession(composed);
    } else {
      // Composition can't produce a session (no targets): clear the in-memory
      // terminal card so the one-step fallback returns instead of showing a
      // finished or abandoned plan as the dominant card.
      setRecommendedSession(null);
    }
  }, [recommendedSessionOpen, learning.loading, learning.progress, learning.profile, practiceFocus]);

  const composeFreshRecommendedSession = useCallback((): RecommendedSessionPlan | null => {
    const composed = composeRecommendedSessionPlan(
      buildPersonalPracticePlan(learning.progress, loadCachedLearningReviewQueue(), practiceFocus, true, undefined, guidedLearningContext(learning.profile)),
      learning.progress,
      loadCachedLearningReviewQueue(),
    );
    return isSessionPlannable(composed) ? composed : null;
  }, [learning.progress, learning.profile, practiceFocus]);

  const startRecommendedSession = useCallback(() => {
    const { plan } = loadRecommendedSession();
    // A persisted terminal (completed/abandoned) plan still owns its closing
    // outcome: open the controller on it so the terminal view renders, rather
    // than letting journeyStart recompose a fresh session over it.
    const target = plan && (plan.status === 'completed' || plan.status === 'abandoned') && plan.steps.length > 0
      ? plan
      : journeyStart(plan, composeFreshRecommendedSession).plan;
    if (!target) return;
    // Hydrate the evidence tally for this plan from the per-plan checkpoint so a
    // relaunch or resume keeps the count; a genuinely new session (no stored
    // evidence for its id) starts from zero.
    currentPlanIdRef.current = target.id;
    sessionEvidenceRef.current = loadSessionEvidence(target.id) ?? { decisionsScored: 0, costlyMistakes: 0 };
    setRecommendedSession(target);
    setRecommendedSessionOpen(true);
    setScreen('learn');
  }, [composeFreshRecommendedSession]);

  // Open the existing Learn reference/cheat-sheet collection. Landing on the
  // first sheet keeps the whole collection browsable and duplicates no content.
  const openCheatSheets = useCallback(() => {
    // Route the plural Home action to the reference collection: expand the
    // Quick Reference chapter on the Learn screen so the whole set stays
    // browsable, instead of opening a single sheet with no navigation back.
    setLaunchCheatSheets(true);
    setScreen('learn');
  }, []);

  const onRecordLesson = useCallback((lesson: LessonDefinition) => {
    learning.recordResult({ activityId: lesson.id, activityType: lesson.type, completed: true });
  }, [learning.recordResult]);

  const onRecordTrainer = useCallback((trainer: TrainerDefinition, score: number, review: TrainerAttemptReview) => {
    learning.recordResult({
      activityId: trainer.id,
      activityType: trainer.type,
      completed: trainer.masteryThreshold === undefined || score >= trainer.masteryThreshold,
      score,
      countAttempt: true,
    });
    recordTrainerReview(trainer, review);
    // Each answered question is a scored decision. A binary trainer question
    // has no "reasonable" middle ground, so a miss is a costly mistake.
    sessionEvidenceRef.current = {
      decisionsScored: sessionEvidenceRef.current.decisionsScored + review.correctQuestionIds.length + review.missedQuestionIds.length,
      costlyMistakes: sessionEvidenceRef.current.costlyMistakes + review.missedQuestionIds.length,
    };
    saveSessionEvidence(currentPlanIdRef.current, sessionEvidenceRef.current);
  }, [learning.recordResult]);

  const onRecordScenario = useCallback((trainer: ScenarioTrainerDefinition, score: number, review: ScenarioAttemptReview) => {
    learning.recordResult({
      activityId: trainer.id,
      activityType: trainer.type,
      completed: true,
      score,
      countAttempt: true,
    });
    recordScenarioReview(trainer, review);
    // Every answered spot is a scored decision. A costly mistake is only a spot
    // whose chosen grade is `mistake` — a `reasonable` alternative, while not
    // the best line, is not a costly mistake (the Slice 0 correction).
    const scenarioCostly = review.gradedDecisions.filter((decision) => decision.grade === 'mistake').length;
    sessionEvidenceRef.current = {
      decisionsScored: sessionEvidenceRef.current.decisionsScored + review.gradedDecisions.length,
      costlyMistakes: sessionEvidenceRef.current.costlyMistakes + scenarioCostly,
    };
    saveSessionEvidence(currentPlanIdRef.current, sessionEvidenceRef.current);
  }, [learning.recordResult]);

  const onRecordReview = useCallback((trainer: TrainerDefinition, score: number, review: TrainerAttemptReview) => {
    learning.recordReviewSession({
      activityId: trainer.id,
      correctCount: review.correctQuestionIds.length,
      score,
      totalCount: review.correctQuestionIds.length + review.missedQuestionIds.length,
    });
    // The review questions map 1:1 onto frozen `LearningReviewItem` ids, so the
    // outcomes use the raw ids — the generic trainer recorder prefixes them
    // `trainer:<trainerId>:`, which never matches a frozen item. Mirror the
    // LearnScreen review path here.
    updateLearningReviewQueue([], [
      ...review.correctQuestionIds.map((itemId) => ({ correct: true, itemId })),
      ...review.missedQuestionIds.map((itemId) => ({ correct: false, itemId })),
    ]);
    // A review question is a scored decision; a miss is normally a costly mistake.
    // Scenario-derived review questions carry the chosen grade (gradedQuestionIds),
    // and a `reasonable` alternative is only a mis-scored attempt, not a costly
    // mistake — so count a miss as costly only when it had no grade (a binary,
    // authored question) or a `mistake` grade.
    let reviewCostly = 0;
    for (const questionId of review.missedQuestionIds) {
      const grade = review.gradedQuestionIds[questionId];
      if (grade === undefined || grade === 'mistake') reviewCostly += 1;
    }
    sessionEvidenceRef.current = {
      decisionsScored: sessionEvidenceRef.current.decisionsScored + review.correctQuestionIds.length + review.missedQuestionIds.length,
      costlyMistakes: sessionEvidenceRef.current.costlyMistakes + reviewCostly,
    };
    saveSessionEvidence(currentPlanIdRef.current, sessionEvidenceRef.current);
  }, [learning.recordReviewSession]);

  // Advance the mission step the controller dispatched, but only when the
  // returning mission is the one we dispatched. The ref is consumed first so a
  // duplicate or unrelated return (e.g. an ordinary Learn mission) cannot settle
  // the recommended session's step.
  const completeRecommendedMission = useCallback((missionId: TableMissionId) => {
    const step = missionStepRef.current;
    missionStepRef.current = null;
    if (!step || step.missionId !== missionId) return;
    const result = journeyMissionExit(step.stepId);
    if (result.plan) setRecommendedSession(result.plan);
    // Record that the current table mission just completed and was checkpointed,
    // so the table's "Back to Learn"/"Exit" is a completion return (keep the
    // controller open) rather than an abandonment (which closes it).
    completedRecommendedMissionId.current = missionId;
  }, []);

  // A mission the learner abandoned (Change Setup / exit) without a result keeps
  // the step pending so it resumes — it is never skipped. The controller is
  // unmounted and the dispatched-mission ref is cleared so its dispatch effect
  // cannot restart the mission on return.
  const leaveRecommendedMission = useCallback(() => {
    missionStepRef.current = null;
    setRecommendedSessionOpen(false);
  }, []);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const showTabs = screen === 'home' || screen === 'learn' || screen === 'play';
  const fallbackLearningRecommendation = findLearningActivity(
    recommendedLearningActivityId(learning.progress, practiceFocus),
  ) ?? lessons[0]!;
  const guidedContext = guidedLearningContext(learning.profile);
  const adaptiveLearningRecommendation = buildAdaptiveLearningRecommendation(
    learning.progress,
    loadCachedLearningReviewQueue(),
    true,
    undefined,
    guidedContext,
  );
  // The next continue-path activity the closing outcome points at. Derived from
  // the same local plan the Home recommendation uses, but only the first
  // non-review target is named so a due review is surfaced as a "review timing"
  // instead of a "next activity".
  const nextActivityId = useMemo(
    () => {
      const items = buildPersonalPracticePlan(
        learning.progress,
        loadCachedLearningReviewQueue(),
        practiceFocus,
        true,
        undefined,
        guidedContext,
      );
      return nextActivityIdForTarget(items.find((item) => item.target.kind !== 'review')?.target ?? null);
    },
    [learning.progress, learning.profile, practiceFocus],
  );
  inviteScreen.current = screen;
  inviteActiveRoom.current = activeMultiplayerRoom;
  inviteTranslator.current = t;

  const openMultiplayer = useCallback((input: Omit<MultiplayerLaunch, 'id'>) => {
    multiplayerLaunchSequence.current += 1;
    const next = { ...input, id: multiplayerLaunchSequence.current };
    // Native links and network responses can settle before React commits the
    // next render. Keep the launch identity current synchronously so an old
    // flow cannot publish state after it has been replaced.
    inviteOpenFlow.current = next;
    setMultiplayerLaunch(next);
  }, []);

  const closeMultiplayer = useCallback(() => {
    inviteOpenFlow.current = null;
    setMultiplayerLaunch(null);
  }, []);

  const multiplayerLaunchIsCurrent = useCallback((launchId: number) => (
    inviteOpenFlow.current?.id === launchId
  ), []);

  const updateActiveMultiplayerRoom = useCallback((
    record: ActiveMultiplayerRoomRecord | null,
  ) => {
    // Invite routing and cold-start discovery both run outside React's state
    // commit. Keep their shared pointer authoritative synchronously.
    inviteActiveRoom.current = record;
    setActiveMultiplayerRoom(record);
  }, []);

  useEffect(() => {
    if (
      !multiplayerPreviewEnabled
      || activeMultiplayerRoom
      || activeRoomLookupAttempted.current
    ) return undefined;
    activeRoomLookupAttempted.current = true;
    let disposed = false;
    const lookup = resumeMultiplayerTable().then((snapshot) => {
      if (!snapshot || disposed || accountDeletionCompleted.current) return;
      const record = saveDiscoveredActiveMultiplayerRoom(inviteActiveRoom.current, snapshot);
      if (record) updateActiveMultiplayerRoom(record);
    }).catch(() => {
      // A transient lookup failure must not block the normal create/join entry.
    });
    activeRoomLookup.current = lookup;
    void lookup.finally(() => {
      if (activeRoomLookup.current === lookup) activeRoomLookup.current = null;
    });
    return () => {
      disposed = true;
    };
  }, [activeMultiplayerRoom, updateActiveMultiplayerRoom]);

  useEffect(() => {
    if (!multiplayerPreviewEnabled) return undefined;
    let disposed = false;
    const handleInvite = (url: string) => {
      const invite = parseMultiplayerInviteUrl(url);
      if (!invite || disposed) return;
      const nowMs = Date.now();
      if (
        lastInviteDelivery.current?.url === url
        && nowMs - lastInviteDelivery.current.atMs < 1_500
      ) return;
      lastInviteDelivery.current = { atMs: nowMs, url };

      const openInvite = () => {
        setScreen('play');
        openMultiplayer({ initialMode: 'join', initialRoomCode: invite.roomCode });
      };
      const resumeSavedRoom = () => {
        const savedRoom = inviteActiveRoom.current;
        if (!savedRoom) {
          openInvite();
          return;
        }
        setScreen('play');
        openMultiplayer({ initialMode: 'join', resumeRecord: savedRoom });
      };
      const replaceSavedRoom = () => {
        const savedRoom = inviteActiveRoom.current;
        if (!savedRoom) {
          openInvite();
          return;
        }
        if (inviteReplacementInFlight.current) return;
        inviteReplacementInFlight.current = true;
        // Stop the old room UI from issuing commands while its authoritative
        // departure is in flight. Its recovery record remains intact unless
        // the server confirms leave (or confirms the room is already gone).
        closeMultiplayer();
        void departMultiplayerRoomForInviteReplacement(savedRoom.roomId, {
          leave: async (roomId, version) => {
            await sendMultiplayerCommand(roomId, version, { type: 'leave' });
          },
          sync: syncMultiplayerTable,
        }).then((result) => {
          if (disposed || inviteActiveRoom.current?.roomId !== savedRoom.roomId) return;
          if (result === 'retry') {
            Alert.alert(
              inviteTranslator.current('multiplayer.error.title'),
              inviteTranslator.current('multiplayer.resume.network'),
            );
            return;
          }
          clearActiveMultiplayerRoom();
          updateActiveMultiplayerRoom(null);
          openInvite();
        }).finally(() => {
          inviteReplacementInFlight.current = false;
        });
      };
      const routeInvite = (ignoreLocalTable = false): void => {
        const savedRoom = inviteActiveRoom.current;
        const route = resolveMultiplayerInviteRoute({
          activeRoomCode: savedRoom?.roomCode,
          hasActivePrivateRoom: savedRoom !== null,
          hasOpenMultiplayerFlow: inviteOpenFlow.current !== null,
          inviteRoomCode: invite.roomCode,
          localTableOpen: !ignoreLocalTable && inviteScreen.current === 'table',
        });
        const translate = inviteTranslator.current;
        if (route === 'join-invite') {
          openInvite();
          return;
        }
        if (route === 'resume-saved-room') {
          resumeSavedRoom();
          return;
        }
        if (route === 'confirm-leave-local-table') {
          Alert.alert(
            translate('multiplayer.invite.leaveGameTitle'),
            translate('multiplayer.invite.leaveGameDetail'),
            [
              { style: 'cancel', text: translate('common.cancel') },
              { onPress: () => routeInvite(true), style: 'destructive', text: translate('multiplayer.invite.open') },
            ],
          );
          return;
        }
        if (route === 'confirm-saved-room-choice') {
          Alert.alert(
            translate('multiplayer.invite.conflictTitle'),
            translate('multiplayer.invite.conflictDetail'),
            [
              { style: 'cancel', text: translate('common.cancel') },
              { onPress: resumeSavedRoom, text: translate('multiplayer.invite.resumeSaved') },
              { onPress: replaceSavedRoom, style: 'destructive', text: translate('multiplayer.invite.replace') },
            ],
          );
          return;
        }
        Alert.alert(
          translate('multiplayer.invite.flowTitle'),
          translate('multiplayer.invite.flowDetail'),
          [
            { style: 'cancel', text: translate('common.cancel') },
            { onPress: openInvite, text: translate('multiplayer.invite.open') },
          ],
        );
      };
      void routeMultiplayerInviteAfterBootstrap(
        activeRoomLookup.current,
        () => { if (!disposed) routeInvite(); },
      );
    };
    const subscription = Linking.addEventListener('url', ({ url }) => handleInvite(url));
    void Linking.getInitialURL().then((url) => {
      if (url) handleInvite(url);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [closeMultiplayer, openMultiplayer, updateActiveMultiplayerRoom]);

  useEffect(() => {
    if (!onboardingVisible && learning.profile.setupStatus === 'not-started') {
      setLearningSetupVisible(true);
    }
  }, [learning.profile.setupStatus, onboardingVisible]);

  useEffect(() => () => {
    if (calibrationOpenTimer.current) clearTimeout(calibrationOpenTimer.current);
  }, []);

  useEffect(() => {
    if (screen === 'table') return;
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP)
      .catch(() => undefined);
  }, [screen]);
  const startQuickPlay = () => {
    setTableReturnScreen('play');
    setActiveSessionConfig(QUICK_PLAY_SESSION_CONFIG);
    setActivePlayerCount(2);
    setActiveTableMode('practice');
    setActiveAiDifficulty(resolveLocalAiDifficulty({ mode: 'quick_play' }));
    setScreen('table');
  };
  const startCustomSession = () => {
    setTableReturnScreen('setup');
    setActiveSessionConfig(customSessionConfig);
    setActivePlayerCount(customPlayerCount);
    setActiveTableMode('practice');
    setActiveAiDifficulty(resolveLocalAiDifficulty({ mode: 'custom', selectedDifficulty: aiDifficulty }));
    setScreen('table');
  };
  const startLearningMission = useCallback((missionId: TableMissionId) => {
    const mission = tableMissionById(missionId);
    setActiveLearningMissionId(missionId);
    setActiveSessionConfig(mission.sessionConfig);
    setActivePlayerCount(mission.playerCount);
    setActiveTableMode('learning_mission');
    setTableReturnScreen('learn');
    setScreen('table');
  }, []);
  const completeLearningMission = useCallback((result: TableMissionResult) => {
    learning.recordResult({
      activityId: result.missionId,
      activityType: 'scenario_drill',
      completed: result.passed,
      score: result.decisionsGraded > 0 ? result.score : undefined,
      countAttempt: result.completed,
    });
    // A completed recommended mission grades decisions. Count them for the
    // closing outcome, but only when this mission belongs to the recommended
    // session: the dispatched-mission ref is set at dispatch and consumed by the
    // handler below, and its mission id must match the returning result so a
    // stale or mismatched completion callback can't inflate the evidence.
    if (
      result.completed
      && missionStepRef.current !== null
      && missionStepRef.current.missionId === result.missionId
    ) {
      sessionEvidenceRef.current = {
        decisionsScored: sessionEvidenceRef.current.decisionsScored + result.decisionsGraded,
        costlyMistakes: sessionEvidenceRef.current.costlyMistakes + (result.grades.mistake ?? 0),
      };
      saveSessionEvidence(currentPlanIdRef.current, sessionEvidenceRef.current);
      // A recommended mission grades decisions for this session and keeps the
      // session open, so the closing summary must refetch the recorded hands —
      // the mission's own hands aren't in the history loaded when the session
      // first opened. Re-arm the gate and load: only this newer load may record
      // the hands and re-open the gate, so the session-opening load racing it
      // can't freeze the terminal summary on the stale pre-mission set.
      handHistoryLoadRef.current.begin({ reArm: true });
    }
    // Only the recommended session's dispatched mission settles its step; the
    // handler rejects any other returning mission by id.
    completeRecommendedMission(result.missionId);
  }, [completeRecommendedMission]);
  const beginTournament = useCallback((playerCount: SitAndGoPlayerCount, checkpoint: SitAndGoCheckpoint | null) => {
    if (!checkpoint) {
      clearSitAndGoCheckpoint(playerCount);
      setTournamentCheckpoints((current) => ({ ...current, [playerCount]: null }));
    }
    setActiveAiDifficulty(resolveLocalAiDifficulty({
      mode: 'sit_and_go',
      resumeDifficulty: checkpoint?.aiDifficulty,
      selectedDifficulty: sitAndGoDifficulty,
    }));
    setTableReturnScreen(screen === 'home' ? 'home' : 'play');
    setActivePlayerCount(playerCount);
    setActiveTableMode('sit_and_go');
    setScreen('table');
  }, [screen, sitAndGoDifficulty]);
  const openTournament = useCallback((playerCount: SitAndGoPlayerCount) => {
    const checkpoint = tournamentCheckpoints[playerCount];
    if (!checkpoint) {
      beginTournament(playerCount, null);
      return;
    }
    Alert.alert(
      t('alert.savedTournamentTitle', { count: playerCount }),
      t('alert.savedTournamentMessage', { hand: checkpoint.nextHandNumber }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('alert.startNew'), style: 'destructive', onPress: () => beginTournament(playerCount, null) },
        { text: t('common.continue'), onPress: () => beginTournament(playerCount, checkpoint) },
      ],
    );
  }, [beginTournament, t, tournamentCheckpoints]);
  const updateTournamentCheckpoint = useCallback((checkpoint: SitAndGoCheckpoint | null) => {
    const playerCount = checkpoint?.players.length ?? activePlayerCount;
    if (playerCount !== 3 && playerCount !== 6) return;
    setTournamentCheckpoints((current) => ({ ...current, [playerCount]: checkpoint }));
    if (checkpoint) saveSitAndGoCheckpoint(checkpoint);
    else clearSitAndGoCheckpoint(playerCount);
  }, [activePlayerCount]);
  const beginDailyChallenge = useCallback((checkpoint: DailyChallengeCheckpoint | null) => {
    if (!checkpoint) {
      clearDailyChallengeCheckpoint();
      setDailyCheckpoint(null);
    }
    setTableReturnScreen(screen === 'home' ? 'home' : 'play');
    setActivePlayerCount(3);
    setActiveTableMode('daily_challenge');
    setActiveAiDifficulty(resolveLocalAiDifficulty({ mode: 'daily_challenge' }));
    setScreen('table');
  }, [screen]);
  const openDailyChallenge = useCallback(() => {
    if (!dailyCheckpoint) {
      beginDailyChallenge(null);
      return;
    }
    Alert.alert(
      t('alert.savedDailyTitle'),
      t('alert.savedDailyMessage', { hand: dailyCheckpoint.tournament.nextHandNumber }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.restart'), style: 'destructive', onPress: () => beginDailyChallenge(null) },
        { text: t('common.continue'), onPress: () => beginDailyChallenge(dailyCheckpoint) },
      ],
    );
  }, [beginDailyChallenge, dailyCheckpoint, t]);
  const updateDailyCheckpoint = useCallback((checkpoint: DailyChallengeCheckpoint | null) => {
    setDailyCheckpoint(checkpoint);
    if (checkpoint) saveDailyChallengeCheckpoint(checkpoint);
    else clearDailyChallengeCheckpoint();
  }, []);
  const completeDailyChallenge = useCallback((result: DailyChallengeResult) => {
    const pending = recordDailyChallengeResult(result);
    setDailyProgress(loadCachedDailyChallengeProgress());
    void pending.then((saved) => {
      setDailyProgress((current) => [
        saved,
        ...current.filter((entry) => (
          entry.challengeDate !== saved.challengeDate
            || entry.challengeVersion !== saved.challengeVersion
        )),
      ].sort((left, right) => (
        right.challengeDate.localeCompare(left.challengeDate)
          || right.challengeVersion - left.challengeVersion
      )));
    });
  }, []);
  const beginChampionship = useCallback((event: ChampionshipEvent, checkpoint: ChampionshipCheckpoint | null) => {
    if (!checkpoint) {
      clearChampionshipCheckpoint();
      setChampionshipCheckpoint(null);
    }
    setActivePlayerCount(event.playerCount);
    setActiveChampionshipEventId(event.id);
    setActiveTableMode('championship');
    setActiveAiDifficulty(resolveLocalAiDifficulty({
      authoredDifficulty: event.aiDifficulty,
      mode: 'championship',
    }));
    setTableReturnScreen('play');
    setChampionshipVisible(false);
    setScreen('table');
  }, []);
  const openChampionshipEvent = useCallback((event: ChampionshipEvent) => {
    if (!championshipEventIsUnlocked(championshipProgress, event.id)) return;
    if (!championshipCheckpoint) {
      beginChampionship(event, null);
      return;
    }
    if (championshipCheckpoint.eventId === event.id) {
      Alert.alert(
        t('alert.savedChampionshipTitle', { event: event.title }),
        t('alert.savedChampionshipMessage', { hand: championshipCheckpoint.tournament.nextHandNumber }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('common.restart'), style: 'destructive', onPress: () => beginChampionship(event, null) },
          { text: t('common.continue'), onPress: () => beginChampionship(event, championshipCheckpoint) },
        ],
      );
      return;
    }
    const savedEvent = championshipEvent(championshipCheckpoint.eventId);
    Alert.alert(
      t('alert.startChampionshipTitle', { event: event.title }),
      t('alert.replaceChampionshipMessage', {
        event: savedEvent.title,
        hand: championshipCheckpoint.tournament.nextHandNumber,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('alert.replaceRun'), style: 'destructive', onPress: () => beginChampionship(event, null) },
      ],
    );
  }, [beginChampionship, championshipCheckpoint, championshipProgress, t]);
  const updateChampionshipCheckpoint = useCallback((checkpoint: SitAndGoCheckpoint | null) => {
    if (!checkpoint) {
      clearChampionshipCheckpoint();
      setChampionshipCheckpoint(null);
      return;
    }
    const wrapped = createChampionshipCheckpoint(activeChampionshipEventId, checkpoint);
    saveChampionshipCheckpoint(wrapped);
    setChampionshipCheckpoint(wrapped);
  }, [activeChampionshipEventId]);
  const completeChampionship = useCallback((result: ChampionshipResult) => {
    const next = recordChampionshipResult(result);
    setChampionshipProgress(next);
    clearChampionshipCheckpoint();
    setChampionshipCheckpoint(null);
  }, []);
  const leaveChampionshipTable = useCallback(() => {
    setScreen('play');
    setChampionshipVisible(true);
  }, []);
  const openChampionshipRecord = useCallback(() => {
    setChampionshipRecordVisible(true);
  }, []);
  const closeChampionshipRecord = useCallback(() => {
    setChampionshipRecordVisible(false);
  }, []);
  const practiceCoachFocus = useCallback((focus: Exclude<CoachFocusArea, 'none'>) => {
    setPracticeFocus(focus);
    updateLearningReviewQueue([{
      activityId: 'table-session',
      focusArea: focus,
      source: 'table',
    }]);
    setLearningLaunchActivityId(null);
    setLearningLaunchRecommendation(null);
    setScreen('learn');
  }, []);
  const rememberCoachFocus = useCallback((focus: Exclude<CoachFocusArea, 'none'>) => {
    setPracticeFocus(focus);
    updateLearningReviewQueue([{
      activityId: 'table-session',
      focusArea: focus,
      source: 'table',
    }]);
  }, []);
  const continueLearning = useCallback(() => {
    setLearningLaunchActivityId(adaptiveLearningRecommendation ? null : fallbackLearningRecommendation.id);
    setLearningLaunchRecommendation(adaptiveLearningRecommendation);
    setScreen('learn');
  }, [adaptiveLearningRecommendation, fallbackLearningRecommendation.id]);
  const beginCalibration = useCallback((goal: LearningGoalId, kind: CalibrationKind) => {
    learning.chooseGoal(goal);
    if (calibrationOpenTimer.current) clearTimeout(calibrationOpenTimer.current);
    const waitForSetupDismissal = learningSetupVisible;
    setLearningSetupVisible(false);
    setCalibrationKind(kind);
    if (waitForSetupDismissal) {
      calibrationOpenTimer.current = setTimeout(() => {
        calibrationOpenTimer.current = null;
        setCalibrationVisible(true);
      }, 400);
    } else {
      setCalibrationVisible(true);
    }
  }, [learning.chooseGoal, learningSetupVisible]);
  const observeHeroHand = useCallback((observation: HeroHandObservation) => {
    setOpponentMemory((current) => {
      const next = applyOpponentObservation(current, observation);
      saveOpponentMemory(next);
      return next;
    });
  }, []);
  const clearOpponentMemory = useCallback(() => {
    setOpponentMemory(resetOpponentMemory());
  }, []);
  // Learning-data reset: clear progress/history/reviews (the learning store) and,
  // so an active recommended session can't survive the reset, the session
  // checkpoint, its persisted evidence, its React state, and the dispatched-
  // mission ref.
  const resetLearningProgress = useCallback(async () => {
    // Clear the learning store first so the Home composition (its deps include
    // `recommendedSessionOpen`, which drops on the next line) rebuilds from the
    // cleared progress/review/profile rather than the stale data. Keeping the
    // recommended session open through the await suppresses that composition
    // until the deletion settles, so no stale session is saved and retained.
    await learning.clearProgress();
    clearRecommendedSession();
    // A later session with the same deterministic id (reason:concept) could
    // otherwise rehydrate the pre-reset totals, so clear the evidence store and
    // the refs that carry the current tally alongside the checkpoint.
    clearSessionEvidence();
    sessionEvidenceRef.current = { decisionsScored: 0, costlyMistakes: 0 };
    currentPlanIdRef.current = null;
    missionStepRef.current = null;
    setRecommendedSession(null);
    setRecommendedSessionOpen(false);
    setScreen('home');
  }, [learning.clearProgress]);
  const resetAfterAccountDeletion = useCallback(() => {
    accountDeletionCompleted.current = true;
    activeRoomLookupAttempted.current = true;
    activeRoomLookup.current = null;
    inviteOpenFlow.current = null;
    inviteActiveRoom.current = null;
    lastInviteDelivery.current = null;
    inviteReplacementInFlight.current = false;
    if (calibrationOpenTimer.current) {
      clearTimeout(calibrationOpenTimer.current);
      calibrationOpenTimer.current = null;
    }

    setMultiplayerLaunch(null);
    updateActiveMultiplayerRoom(null);
    learning.resetAfterAccountDeletion();
    setTournamentCheckpoints({ 3: null, 6: null });
    setDailyCheckpoint(null);
    setDailyProgress([]);
    setChampionshipProgress(loadChampionshipProgress());
    setChampionshipCheckpoint(null);
    setActiveChampionshipEventId('local_tables');
    setChampionshipVisible(false);
    setChampionshipRecordVisible(false);
    setOpponentMemory(loadOpponentMemory());
    setPracticeFocus(null);
    setLearningLaunchActivityId(null);
    setLearningLaunchRecommendation(null);
    setLaunchCheatSheets(false);
    setLearningSetupVisible(false);
    setCalibrationVisible(false);
    setScenarioTrainingVisible(false);
    setRosterVisible(false);
    setTableReturnScreen('home');
    setActiveTableMode('practice');
    setScreen('home');
    setOnboardingVisible(true);
  }, [learning.resetAfterAccountDeletion, updateActiveMultiplayerRoom]);

  useEffect(() => {
    let active = true;
    void loadRecentHandHistory().then((hands) => {
      if (!active || accountDeletionCompleted.current) return;
      setPracticeFocus(summarizeSessionHandLearning(hands).topFocusArea);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadDailyChallengeProgress().then((progress) => {
      if (active && !accountDeletionCompleted.current) setDailyProgress(progress);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (screen === 'table') return undefined;
    const refreshDailyDate = () => {
      if (accountDeletionCompleted.current) return;
      const nextDate = dailyChallengeDate();
      if (nextDate === today) return;
      setToday(nextDate);
      setDailyCheckpoint(loadDailyChallengeCheckpoint(nextDate));
      void loadDailyChallengeProgress().then(setDailyProgress);
    };
    refreshDailyDate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshDailyDate();
    });
    return () => subscription.remove();
  }, [screen, today]);

  if (screen === 'table') {
    if (activePlayerCount !== 2) {
      const activeChampionshipEvent = championshipEvent(activeChampionshipEventId);
      const championshipMode = activeTableMode === 'championship';
      const learningMission = activeTableMode === 'learning_mission' && activeLearningMissionId
        ? tableMissionById(activeLearningMissionId)
        : null;
      return (
        <SafeAreaView style={styles.safeArea} edges={activePlayerCount === 6 ? ['top', 'right', 'bottom', 'left'] : ['top', 'bottom']}>
          <MultiwayPokerTableScreen
            aiDifficulty={activeAiDifficulty}
            tablePace={tablePace}
            coachEnabled={coachEnabled}
            onChangeSetup={() => {
              if (championshipMode) leaveChampionshipTable();
              else if (learningMission) {
                // A completed recommended-mission return keeps the controller
                // open for the next step or terminal view; abandoning the mission
                // mid-flight closes it so the step stays pending to resume.
                if (completedRecommendedMissionId.current === activeLearningMissionId) {
                  setScreen('learn');
                } else {
                  leaveRecommendedMission();
                  setScreen('learn');
                }
              } else setScreen(activeTableMode === 'practice' ? 'setup' : 'play');
            }}
            onCoachEnabledChange={setCoachEnabled}
            onExit={() => {
              if (championshipMode) leaveChampionshipTable();
              else if (learningMission) {
                // A completed recommended-mission return keeps the controller
                // open for the next step or terminal view; abandoning the mission
                // mid-flight closes it so the step stays pending to resume.
                if (completedRecommendedMissionId.current === activeLearningMissionId) {
                  setScreen(tableReturnScreen);
                } else {
                  leaveRecommendedMission();
                  setScreen(tableReturnScreen);
                }
              } else {
                leaveRecommendedMission();
                setScreen(tableReturnScreen);
              }
            }}
            onFocusIdentified={rememberCoachFocus}
            onHeroHandObserved={observeHeroHand}
            onPracticeFocus={practiceCoachFocus}
            opponentMemory={opponentMemory}
            playerCount={activePlayerCount}
            sessionConfig={activeSessionConfig}
            learningMission={learningMission}
            onLearningMissionComplete={completeLearningMission}
            tableMode={activeTableMode}
            tournamentCheckpoint={championshipMode
              ? championshipCheckpoint?.eventId === activeChampionshipEventId
                ? championshipCheckpoint.tournament
                : null
              : activeTableMode === 'sit_and_go'
                ? tournamentCheckpoints[activePlayerCount]
                : null}
            onTournamentCheckpointChange={championshipMode ? updateChampionshipCheckpoint : updateTournamentCheckpoint}
            championshipEvent={championshipMode ? activeChampionshipEvent : null}
            onChampionshipComplete={completeChampionship}
            challengeDate={today}
            dailyChallengeCheckpoint={activeTableMode === 'daily_challenge' ? dailyCheckpoint : null}
            onDailyChallengeCheckpointChange={updateDailyCheckpoint}
            onDailyChallengeComplete={completeDailyChallenge}
          />
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <PokerTableScreen
          aiDifficulty={activeAiDifficulty}
          tablePace={tablePace}
          coachEnabled={coachEnabled}
          onChangeSetup={() => setScreen('setup')}
          onCoachEnabledChange={setCoachEnabled}
          onContinueLearning={continueLearning}
          onExit={() => setScreen(tableReturnScreen)}
          onFocusIdentified={rememberCoachFocus}
          onHeroHandObserved={observeHeroHand}
          onPracticeFocus={practiceCoachFocus}
          opponentMemory={opponentMemory}
          sessionConfig={activeSessionConfig}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={showTabs ? ['top'] : ['top', 'bottom']}>
      <View style={styles.app}>
        {screen === 'home' && (
          <HomeScreen
            aiDifficulty={resolveLocalAiDifficulty({ mode: 'quick_play' })}
            completedLessons={completedLessonCount(learning.progress)}
            fallbackLearningRecommendation={fallbackLearningRecommendation}
            learningGoal={learning.profile.goal}
            learningRecommendation={adaptiveLearningRecommendation}
            onAllGames={() => setScreen('play')}
            onOpenProfile={() => setScreen('profile')}
            onQuickPlay={startQuickPlay}
            onStartLearning={continueLearning}
            onOpenCheatSheets={openCheatSheets}
            dailyCaption={dailyChallengeCaption(today, dailyCheckpoint, dailyProgress, language, t)}
            onDailyChallenge={openDailyChallenge}
            recommendedSession={recommendedSession}
            startRecommendedSession={startRecommendedSession}
          />
        )}
        {screen === 'learn' && (
          recommendedSessionOpen && recommendedSession ? (
            <RecommendedSessionFlow
              plan={recommendedSession}
              progress={learning.progress}
              history={learning.history}
              reviewItems={loadCachedLearningReviewQueue()}
              handEvidence={closingHandEvidence}
              handHistoryLoaded={closingHandsLoaded}
              sessionDecisions={sessionEvidenceRef.current}
              nextActivityId={nextActivityId}
              skippableStepIds={recommendedSession.steps.filter((step) => step.status === 'skipped').map((step) => step.id)}
              onEndEarly={() => {
                // End early abandons the session, but the controller must stay
                // mounted so the "Session paused" terminal view (and its Finish
                // button) is reachable — we do not unmount here.
                const result = journeyEndEarly();
                if (result.plan) setRecommendedSession(result.plan);
              }}
              onLaunchMission={(missionId, stepId) => {
                missionStepRef.current = { stepId, missionId };
                // A fresh dispatch is not a completion return, so clear any prior
                // completion marker before the mission goes out.
                completedRecommendedMissionId.current = null;
                startLearningMission(missionId);
              }}
              onRecordLesson={onRecordLesson}
              onRecordReview={onRecordReview}
              onRecordScenario={onRecordScenario}
              onRecordTrainer={onRecordTrainer}
              onSessionAbort={() => {
                // Modal back/close: the step is kept (already in state) so the
                // session resumes; unmount the controller so the modal
                // disappears. No terminal view — the plan stays open.
                setRecommendedSessionOpen(false);
              }}
              onSessionEnd={() => {
                // Terminal dismissal: return Home and clear both the checkpoint and
                // the persisted evidence so a genuinely new session starts clean.
                // The composition effect (its deps include recommendedSessionOpen)
                // then composes the next plan, so Home shows a fresh session, not
                // the completed/abandoned one.
                clearRecommendedSession();
                clearSessionEvidence();
                sessionEvidenceRef.current = { decisionsScored: 0, costlyMistakes: 0 };
                currentPlanIdRef.current = null;
                setClosingProgressVisible(false);
                setRecommendedSessionOpen(false);
                setRecommendedSession(null);
                setScreen('home');
              }}
              onStepChange={(stepId, status) => {
                const result = status === 'skipped' ? journeySkip(stepId) : journeyDone(stepId);
                if (result.plan) setRecommendedSession(result.plan);
              }}
              onViewProgress={() => setClosingProgressVisible(true)}
            />
          ) : (
            <LearnScreen
              history={learning.history}
              learningProfile={learning.profile}
              launchActivityId={learningLaunchActivityId}
              launchRecommendation={learningLaunchRecommendation}
              launchCheatSheets={launchCheatSheets}
              loading={learning.loading}
              onLaunchActivityHandled={() => setLearningLaunchActivityId(null)}
              onLaunchRecommendationHandled={() => setLearningLaunchRecommendation(null)}
              onLaunchCheatSheetsHandled={() => setLaunchCheatSheets(false)}
              onOpenProfile={() => setScreen('profile')}
              onOpenRoster={() => setRosterVisible(true)}
              onOpenLearningSetup={() => setLearningSetupVisible(true)}
              onRecordResult={learning.recordResult}
              onRecordReviewSession={learning.recordReviewSession}
              onStartCalibration={() => beginCalibration(
                learning.profile.goal,
                latestLearningSnapshot(learning.profile) ? 'checkpoint' : 'baseline',
              )}
              onStartMission={startLearningMission}
              practiceFocus={practiceFocus}
              progress={learning.progress}
            />
          )
        )}
        {screen === 'play' && (
          <PlayScreen
            activeMultiplayerRoom={activeMultiplayerRoom}
            aiDifficulty={resolveLocalAiDifficulty({ mode: 'quick_play' })}
            coachEnabled={coachEnabled}
            onOpenProfile={() => setScreen('profile')}
            onQuickPlay={startQuickPlay}
            onOpenSetup={() => setScreen('setup')}
            onOpenScenario={() => setScenarioTrainingVisible(true)}
            onTournament={openTournament}
            onSitAndGoDifficultyChange={setSitAndGoDifficulty}
            sitAndGoDifficulty={sitAndGoDifficulty}
            tournamentCheckpoints={tournamentCheckpoints}
            dailyChallengeDate={today}
            dailyCheckpoint={dailyCheckpoint}
            dailyProgress={currentDailyChallengeProgress(
              dailyProgress,
              today,
              DAILY_CHALLENGE_VERSION,
            )}
            onDailyChallenge={openDailyChallenge}
            championshipCaption={championshipCaption(championshipProgress, championshipCheckpoint, t)}
            onChampionship={() => setChampionshipVisible(true)}
            isMultiplayerLaunchCurrent={multiplayerLaunchIsCurrent}
            onMultiplayerClose={closeMultiplayer}
            onMultiplayerCreate={() => openMultiplayer({ initialMode: 'create' })}
            onMultiplayerJoin={() => openMultiplayer({ initialMode: 'join' })}
            onMultiplayerPracticeFocus={(focus) => {
              closeMultiplayer();
              practiceCoachFocus(focus);
            }}
            onMultiplayerRecoveryChange={updateActiveMultiplayerRoom}
            onMultiplayerResume={() => {
              if (!activeMultiplayerRoom) return;
              openMultiplayer({
                initialMode: 'join',
                resumeRecord: activeMultiplayerRoom,
              });
            }}
            multiplayerLaunch={multiplayerLaunch}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            championshipProgress={championshipProgress}
            learningProgress={learning.progress}
            onAccountDeleted={resetAfterAccountDeletion}
            onBack={() => setScreen('home')}
            onDeleteLearningProgress={resetLearningProgress}
            onDeleteDailyChallengeProgress={async () => {
              await deleteAllDailyChallengeProgress();
              clearDailyChallengeCheckpoint();
              setDailyCheckpoint(null);
              setDailyProgress([]);
            }}
            onDeleteChampionshipProgress={() => {
              clearChampionshipProgress();
              setChampionshipProgress(loadChampionshipProgress());
              setChampionshipCheckpoint(null);
            }}
            onResetOpponentMemory={clearOpponentMemory}
            onOpenChampionshipRecord={openChampionshipRecord}
            onPracticeFocus={practiceCoachFocus}
            opponentMemory={opponentMemory}
          />
        )}
        {screen === 'setup' && (
          <GameSetupScreen
            aiDifficulty={aiDifficulty}
            coachEnabled={coachEnabled}
            onBack={() => setScreen('play')}
            onAiDifficultyChange={setAiDifficulty}
            onCoachEnabledChange={setCoachEnabled}
            onTablePaceChange={setTablePace}
            tablePace={tablePace}
            onSessionConfigChange={setCustomSessionConfig}
            onPlayerCountChange={setCustomPlayerCount}
            onStart={startCustomSession}
            playerCount={customPlayerCount}
            sessionConfig={customSessionConfig}
          />
        )}
      </View>
      {showTabs && <BottomTabs active={screen} onSelect={setScreen} />}
      <ChampionshipModal
        checkpoint={championshipCheckpoint}
        onClose={() => setChampionshipVisible(false)}
        onCloseRecord={closeChampionshipRecord}
        onOpenRecord={openChampionshipRecord}
        onSelectEvent={openChampionshipEvent}
        progress={championshipProgress}
        recordVisible={championshipRecordVisible}
        visible={championshipVisible}
      />
      <ChampionshipRecordModal
        onClose={closeChampionshipRecord}
        progress={championshipProgress}
        visible={championshipRecordVisible && !championshipVisible}
      />
      {/* The closing outcome's quiet route to detailed progress, opened from the
          Learn journey and rendered at the shell level. */}
      <ProgressModal
        hands={closingHands}
        learningProgress={learning.progress}
        onClose={() => setClosingProgressVisible(false)}
        onPracticeFocus={practiceCoachFocus}
        visible={closingProgressVisible}
      />
      <ScenarioTrainingModal
        bestScore={learning.progress.find((entry) => entry.activityId === scenarioTrainer.id)?.bestScore ?? null}
        onClose={() => setScenarioTrainingVisible(false)}
        onComplete={(trainer, score, review) => {
          learning.recordResult({
            activityId: trainer.id,
            activityType: trainer.type,
            completed: true,
            score,
            countAttempt: true,
          });
          recordScenarioReview(trainer, review);
        }}
        visible={scenarioTrainingVisible}
      />
      <AiRosterModal onClose={() => setRosterVisible(false)} visible={rosterVisible} />
      <FirstRunOnboardingModal
        onComplete={() => {
          completeOnboarding();
          setOnboardingVisible(false);
          setLearningSetupVisible(true);
        }}
        visible={onboardingVisible}
      />
      <LearningSetupModal
        currentGoal={learning.profile.goal}
        onChooseGoal={(goal) => {
          learning.chooseGoal(goal);
          setLearningSetupVisible(false);
        }}
        onSkip={() => {
          learning.skipSetup();
          setLearningSetupVisible(false);
        }}
        onStartCalibration={(goal) => beginCalibration(goal, latestLearningSnapshot(learning.profile) ? 'checkpoint' : 'baseline')}
        visible={learningSetupVisible && !onboardingVisible}
      />
      <SkillCalibrationModal
        goal={learning.profile.goal}
        kind={calibrationKind}
        onClose={() => setCalibrationVisible(false)}
        onComplete={(answers) => {
          learning.recordCalibration(answers, calibrationKind);
          setCalibrationVisible(false);
        }}
        previousSnapshot={latestLearningSnapshot(learning.profile)}
        sessionCount={learning.history.length}
        visible={calibrationVisible}
      />
    </SafeAreaView>
  );
}
function ScreenScroll({ children, compact = false, tablet = false }: { children: ReactNode; compact?: boolean; tablet?: boolean }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScrollView
      contentContainerStyle={[styles.screenContent, compact && styles.homeScreenContent, tablet && styles.screenContentTablet]}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {children}
    </ScrollView>
  );
}

function ordinal(place: number): string {
  const remainder = place % 100;
  if (remainder >= 11 && remainder <= 13) return `${place}th`;
  if (place % 10 === 1) return `${place}st`;
  if (place % 10 === 2) return `${place}nd`;
  if (place % 10 === 3) return `${place}rd`;
  return `${place}th`;
}

function championshipCaption(
  progress: ChampionshipProgress,
  checkpoint: ChampionshipCheckpoint | null,
  t: Translator,
): string {
  if (checkpoint) {
    const event = championshipEvent(checkpoint.eventId);
    return t('caption.championshipContinue', {
      event: event.title,
      hand: checkpoint.tournament.nextHandNumber,
    });
  }
  const qualified = championshipQualifiedCount(progress);
  if (championshipInvitationIsUnlocked(progress) && !championshipInvitationIsComplete(progress)) {
    return t('caption.championshipInvitation');
  }
  if (championshipIsComplete(progress)) return t('caption.championshipComplete', { qualified });
  return t('caption.championshipProgress', {
    event: championshipCurrentEvent(progress).title,
    qualified,
  });
}

function dailyChallengeCaption(
  today: string,
  checkpoint: DailyChallengeCheckpoint | null,
  progress: readonly DailyChallengeProgress[],
  language: AppLanguage,
  t: Translator,
): string {
  if (checkpoint) return t('caption.dailyContinue', { hand: checkpoint.tournament.nextHandNumber });
  const todayResult = currentDailyChallengeProgress(progress, today, DAILY_CHALLENGE_VERSION);
  if (todayResult) return t('caption.dailyToday', {
    place: localizedOrdinal(todayResult.bestPlace, language),
    score: todayResult.bestScore,
  });
  const streak = dailyChallengeStreak(
    dailyChallengeStreakDatesForVersion(progress, today, DAILY_CHALLENGE_VERSION),
    today,
  );
  return streak > 0
    ? t('caption.dailyStreak', { streak })
    : t('caption.dailyNew');
}

function localizedOrdinal(place: number, language: AppLanguage): string {
  return language === 'en' ? ordinal(place) : `第 ${place} 名`;
}

const TABLE_PACE_OPTIONS: readonly TablePace[] = ['brisk', 'normal', 'relaxed'];

function difficultyLabel(difficulty: AiDifficulty, t: Translator): string {
  return t(`difficulty.${difficulty}`);
}

function paceLabel(pace: TablePace, t: Translator): string {
  return t(`pace.${pace}`);
}

function difficultySummary(difficulty: AiDifficulty, t: Translator): string {
  return t(`difficulty.${difficulty}Summary`);
}

function languageLabel(language: AppLanguage, t: Translator): string {
  if (language === 'zh-Hans') return t('language.zhHans');
  if (language === 'zh-Hant') return t('language.zhHant');
  return t('language.en');
}

function languagePreferenceLabel(preference: LanguagePreference, t: Translator): string {
  return preference === 'system' ? t('language.system') : languageLabel(preference, t);
}

function learningGoalTitle(goal: LearningGoalId, t: Translator): string {
  return t(`guided.goal.${goal}.title` as MessageKey);
}

function themePreferenceLabel(preference: ThemePreference, t: Translator): string {
  return t(`settings.theme.${preference}`);
}

function localizedSessionLength(
  target: PracticeSessionConfig['handTarget'],
  t: Translator,
): string {
  return target === 'open' ? t('setup.open') : t('setup.handCount', { count: target });
}

function HomeScreen({
  aiDifficulty,
  completedLessons,
  dailyCaption,
  fallbackLearningRecommendation,
  learningRecommendation,
  learningGoal,
  onAllGames,
  onDailyChallenge,
  onOpenCheatSheets,
  onOpenProfile,
  onQuickPlay,
  onStartLearning,
  recommendedSession,
  startRecommendedSession,
}: {
  aiDifficulty: AiDifficulty;
  completedLessons: number;
  dailyCaption: string;
  fallbackLearningRecommendation: LearningActivityDefinition;
  learningRecommendation: AdaptiveLearningRecommendation | null;
  learningGoal: LearningGoalId;
  onAllGames: () => void;
  onDailyChallenge: () => void;
  onOpenCheatSheets: () => void;
  onOpenProfile: () => void;
  onQuickPlay: () => void;
  onStartLearning: () => void;
  recommendedSession: RecommendedSessionPlan | null;
  startRecommendedSession: () => void;
}) {
  const { palette } = useAppTheme();
  const { activityText, practicePackText, t } = useLocalization();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const curriculumActivity = learningRecommendation?.kind === 'curriculum'
    ? learningRecommendation.step.kind === 'lesson'
      ? learningRecommendation.step.lesson
      : learningRecommendation.step.kind === 'mission'
        ? learningRecommendation.step.mission
        : learningRecommendation.step.kind === 'mastery'
          ? learningRecommendation.step.trainer
          : null
    : null;
  const recommendationTitle = learningRecommendation?.kind === 'review'
    ? t('learn.reviewToday')
    : learningRecommendation?.kind === 'reinforce-practice'
      ? practicePackText(learningRecommendation.pack, 'title')
      : learningRecommendation?.kind === 'reinforce-activity'
        ? activityText(learningRecommendation.activity, 'title')
        : learningRecommendation?.kind === 'curriculum' && learningRecommendation.step.kind === 'practice'
          ? practicePackText(learningRecommendation.step.pack, 'title')
          : curriculumActivity
            ? activityText(curriculumActivity, 'title')
            : activityText(fallbackLearningRecommendation, 'title');
  const recommendationDescription = learningRecommendation?.kind === 'review'
    ? t('learn.reviewTodayDescription')
    : learningRecommendation?.kind === 'reinforce-practice'
      ? practicePackText(learningRecommendation.pack, 'description')
      : learningRecommendation?.kind === 'reinforce-activity'
        ? activityText(learningRecommendation.activity, 'description')
        : learningRecommendation?.kind === 'curriculum' && learningRecommendation.step.kind === 'practice'
          ? practicePackText(learningRecommendation.step.pack, 'description')
          : curriculumActivity
            ? activityText(curriculumActivity, 'description')
            : activityText(fallbackLearningRecommendation, 'description');
  const recommendationMinutes = learningRecommendation?.kind === 'review'
    ? 3
    : learningRecommendation?.kind === 'reinforce-practice'
      ? 5
      : learningRecommendation?.kind === 'reinforce-activity'
        ? learningRecommendation.activity.estimatedMinutes
        : learningRecommendation?.kind === 'curriculum'
          ? learningRecommendation.step.kind === 'lesson'
            ? learningRecommendation.step.lesson.estimatedMinutes
            : learningRecommendation.step.kind === 'mission'
              ? learningRecommendation.step.mission.estimatedMinutes
              : learningRecommendation.step.kind === 'mastery'
                ? learningRecommendation.step.trainer.estimatedMinutes
                : 5
          : fallbackLearningRecommendation.estimatedMinutes;
  return (
    <ScreenScroll compact tablet={tablet}>
      <ScreenHeader eyebrow={t('home.eyebrow')} title={t('home.title')} onProfile={onOpenProfile} />
      {recommendedSession ? (
        <RecommendedSessionHomeCard plan={recommendedSession} onStart={startRecommendedSession} />
      ) : (
        <Pressable
          accessibilityLabel={t('home.continueLearning', {
            minutes: recommendationMinutes,
            title: recommendationTitle,
          })}
          accessibilityRole="button"
          onPress={onStartLearning}
          style={({ pressed }) => [styles.sessionCard, styles.homeSessionCard, pressed && styles.pressed]}
        >
        <View style={styles.orb} />
        <View style={[styles.sessionCopy, styles.homeSessionCopy]}>
          <Text maxFontSizeMultiplier={1.5} style={styles.homeGoalLabel}>{t('guided.home.goal', { goal: learningGoalTitle(learningGoal, t) })}</Text>
          <View style={styles.homeSessionTitleRow}>
            <Text numberOfLines={2} style={[styles.sessionTitle, styles.homeSessionTitle]}>{recommendationTitle}</Text>
            <View style={styles.homeSessionMeta}>
              <View style={styles.timePill}>
                <Ionicons name="time-outline" size={13} color={palette.aquaText} />
                <Text style={styles.timeText}>{t('common.minutes', { count: recommendationMinutes })}</Text>
              </View>
              <Ionicons color={palette.muted} name="arrow-forward" size={15} />
            </View>
          </View>
          <Text numberOfLines={2} style={styles.bodyText}>{recommendationDescription}</Text>
          <View style={styles.homeProgressHeader}>
            <Text style={styles.homeProgressLabel}>{t('home.learningPath')}</Text>
            <Text style={styles.homeProgressValue}>{t('home.learningProgress', { complete: completedLessons, total: lessons.length })}</Text>
          </View>
          <View
            accessibilityLabel={t('home.learningProgressA11y', { percent: Math.round((completedLessons / lessons.length) * 100) })}
            accessibilityRole="progressbar"
            style={[styles.progressTrack, styles.homeProgressTrack]}
          >
            <View style={[styles.progressFill, { width: `${Math.round((completedLessons / lessons.length) * 100)}%` }]} />
          </View>
        </View>
        </Pressable>
      )}
      {onOpenCheatSheets ? (
        <MenuRow
          compact
          flat
          icon="book-outline"
          label={t('home.cheatSheets')}
          description={t('home.cheatSheetsDescription')}
          onPress={onOpenCheatSheets}
        />
      ) : null}
      <Text accessibilityRole="header" style={styles.homeSectionTitle}>{t('home.quickStart')}</Text>
      <View style={styles.homeMenuList}>
        <MenuRow
          compact
          flat
          icon="play"
          label={t('home.quickPlay')}
          description={t('home.quickPlayDescription', { difficulty: difficultyLabel(aiDifficulty, t), stack: quickPlayStartingChips })}
          onPress={onQuickPlay}
        />
        <MenuRow
          badge={t('play.fixedAiBadge', {
            difficulty: difficultyLabel(resolveLocalAiDifficulty({ mode: 'daily_challenge' }), t),
          })}
          compact
          flat
          icon="today-outline"
          label={t('home.dailyChallenge')}
          description={dailyCaption}
          onPress={onDailyChallenge}
        />
        <MenuRow
          compact
          flat
          icon="grid-outline"
          label={t('home.allGames')}
          description={t('home.allGamesDescription')}
          onPress={onAllGames}
        />
      </View>
    </ScreenScroll>
  );
}

function PlayScreen({
  activeMultiplayerRoom,
  aiDifficulty,
  championshipCaption,
  coachEnabled,
  dailyChallengeDate,
  dailyCheckpoint,
  dailyProgress,
  isMultiplayerLaunchCurrent,
  onDailyChallenge,
  onChampionship,
  onMultiplayerClose,
  onMultiplayerCreate,
  onMultiplayerJoin,
  onMultiplayerPracticeFocus,
  onMultiplayerRecoveryChange,
  onMultiplayerResume,
  onOpenProfile,
  onQuickPlay,
  onOpenSetup,
  onOpenScenario,
  onSitAndGoDifficultyChange,
  onTournament,
  sitAndGoDifficulty,
  multiplayerLaunch,
  tournamentCheckpoints,
}: {
  activeMultiplayerRoom: ActiveMultiplayerRoomRecord | null;
  aiDifficulty: AiDifficulty;
  championshipCaption: string;
  coachEnabled: boolean;
  dailyChallengeDate: string;
  dailyCheckpoint: DailyChallengeCheckpoint | null;
  dailyProgress: DailyChallengeProgress | null;
  isMultiplayerLaunchCurrent: (launchId: number) => boolean;
  onDailyChallenge: () => void;
  onChampionship: () => void;
  onMultiplayerClose: () => void;
  onMultiplayerCreate: () => void;
  onMultiplayerJoin: () => void;
  onMultiplayerPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onMultiplayerRecoveryChange: (record: ActiveMultiplayerRoomRecord | null) => void;
  onMultiplayerResume: () => void;
  onOpenProfile: () => void;
  onQuickPlay: () => void;
  onOpenSetup: () => void;
  onOpenScenario: () => void;
  onSitAndGoDifficultyChange: (difficulty: AiDifficulty) => void;
  onTournament: (playerCount: SitAndGoPlayerCount) => void;
  sitAndGoDifficulty: AiDifficulty;
  multiplayerLaunch: MultiplayerLaunch | null;
  tournamentCheckpoints: Record<SitAndGoPlayerCount, SitAndGoCheckpoint | null>;
}) {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const localizedDifficulty = difficultyLabel(aiDifficulty, t);
  const coachStatus = t(coachEnabled ? 'common.coachOn' : 'common.coachOff');
  return (
    <>
      <ScreenScroll compact tablet={tablet}>
        <ScreenHeader eyebrow={t('play.eyebrow')} title={t('play.title')} onProfile={onOpenProfile} />
        {multiplayerPreviewEnabled && (
          <MultiplayerEntryCard
            onCreate={onMultiplayerCreate}
            onJoin={onMultiplayerJoin}
            onResume={activeMultiplayerRoom ? onMultiplayerResume : undefined}
          />
        )}
        <Text accessibilityRole="header" style={styles.homeSectionTitle}>{t('multiplayer.play.soloSection')}</Text>
        <View style={styles.flatList}>
          <MenuRow
            compact
            icon="play"
            label={t('home.quickPlay')}
            description={t('play.quickDescription', { coach: coachStatus, difficulty: localizedDifficulty, stack: quickPlayStartingChips })}
            flat
            onPress={onQuickPlay}
          />
          <MenuRow
            compact
            icon="trophy-outline"
            label={t('home.championship')}
            description={championshipCaption}
            flat
            onPress={onChampionship}
          />
          <MenuRow
            badge={t('play.fixedAiBadge', {
              difficulty: difficultyLabel(resolveLocalAiDifficulty({ mode: 'daily_challenge' }), t),
            })}
            compact
            icon="today-outline"
            label={t('home.dailyChallenge')}
            description={dailyCheckpoint
              ? t('play.savedHandCoachingOff', { hand: dailyCheckpoint.tournament.nextHandNumber })
              : dailyProgress
                ? t('play.dailyResult', {
                  attempts: dailyProgress.attempts,
                  place: localizedOrdinal(dailyProgress.bestPlace, language),
                  score: dailyProgress.bestScore,
                })
                : t('play.dailyNew', { date: dailyChallengeDisplayDate(dailyChallengeDate, language) })}
            flat
            onPress={onDailyChallenge}
          />
          <TournamentChoiceRow
            checkpoints={tournamentCheckpoints}
            difficulty={sitAndGoDifficulty}
            onDifficultyChange={onSitAndGoDifficultyChange}
            onSelect={onTournament}
          />
          <MenuRow compact icon="hardware-chip-outline" label={t('play.customGame')} description={t('play.customGameDescription')} flat onPress={onOpenSetup} />
          <MenuRow compact icon="locate-outline" label={t('play.scenarioTraining')} description={t('play.scenarioDescription')} flat onPress={onOpenScenario} />
        </View>
      </ScreenScroll>
      {multiplayerPreviewEnabled && (
        <MultiplayerFlowModal
          initialMode={multiplayerLaunch?.initialMode ?? 'create'}
          initialRoomCode={multiplayerLaunch?.initialRoomCode}
          isLaunchCurrent={multiplayerLaunch
            ? () => isMultiplayerLaunchCurrent(multiplayerLaunch.id)
            : undefined}
          key={multiplayerLaunch?.id ?? 'closed-multiplayer'}
          onClose={onMultiplayerClose}
          onPracticeFocus={onMultiplayerPracticeFocus}
          onRecoveryRecordChange={onMultiplayerRecoveryChange}
          resumeRecord={multiplayerLaunch?.resumeRecord}
          visible={multiplayerLaunch !== null}
        />
      )}
    </>
  );
}

function ProfileScreen({
  championshipProgress,
  learningProgress,
  onAccountDeleted,
  onBack,
  onDeleteChampionshipProgress,
  onDeleteDailyChallengeProgress,
  onDeleteLearningProgress,
  onOpenChampionshipRecord,
  onPracticeFocus,
  onResetOpponentMemory,
  opponentMemory,
}: {
  championshipProgress: ChampionshipProgress;
  learningProgress: LearningProgressEntry[];
  onAccountDeleted: () => void;
  onBack: () => void;
  onDeleteChampionshipProgress: () => void;
  onDeleteDailyChallengeProgress: () => Promise<void>;
  onDeleteLearningProgress: () => Promise<void>;
  onOpenChampionshipRecord: () => void;
  onPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onResetOpponentMemory: () => void;
  opponentMemory: OpponentMemory;
}) {
  const { palette, preference: themePreference, setPreference: setThemePreference } = useAppTheme();
  const { language, preference: languagePreference, t } = useLocalization();
  const { hapticsEnabled, setHapticsEnabled } = useGameFeedbackPreferences();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [savedHands, setSavedHands] = useState<SessionHandRecord[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [betaInfoVisible, setBetaInfoVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [accountDeletionPending, setAccountDeletionPending] = useState(false);
  const [replayHand, setReplayHand] = useState<SessionHandRecord | null>(null);
  const [playerName, setPlayerName] = useState(
    () => loadPlayerDisplayName() || DEFAULT_PLAYER_DISPLAY_NAME,
  );
  const [nameText, setNameText] = useState(() =>
    loadPlayerProfile()?.displayName || DEFAULT_PLAYER_DISPLAY_NAME,
  );
  const [nameError, setNameError] = useState<MessageKey | null>(null);
  const handleNameSave = (): void => {
    const result = validatePlayerDisplayName(nameText);
    if (result.ok) {
      const saved = savePlayerDisplayName(result.value);
      if (saved) {
        setPlayerName(saved);
        setNameError(null);
      }
    } else if (result.reason === 'too-short') {
      setNameError('settings.nameTooShort');
    } else if (result.reason === 'too-long') {
      setNameError('settings.nameTooLong');
    } else if (result.reason === 'contact-information') {
      setNameError('settings.nameContactInfo');
    } else {
      setNameError('settings.nameInvalidCharacter');
    }
  };
  const championshipAchievementsList = championshipAchievements(championshipProgress);
  const unlockedChampionshipAchievements = championshipAchievementsList.filter((achievement) => achievement.unlocked).length;
  useEffect(() => {
    let active = true;
    void loadRecentHandHistory().then((hands) => {
      if (active) setSavedHands(hands);
    });
    return () => {
      active = false;
    };
  }, []);
  const openHandHistory = () => {
    setHistoryVisible(true);
    void loadRecentHandHistory().then(setSavedHands);
  };
  const confirmDeleteHistory = () => {
    Alert.alert(
      t('settings.deleteTitle'),
      t('settings.deleteMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => {
            onDeleteChampionshipProgress();
            void Promise.all([
              deleteAllHandHistory(),
              deleteAllMultiplayerHandHistory(),
              onDeleteLearningProgress(),
              onDeleteDailyChallengeProgress(),
            ])
              .then(() => setSavedHands([]))
              .catch(() => Alert.alert(t('settings.deleteFailedTitle'), t('settings.deleteFailedMessage')));
          },
        },
      ],
    );
  };
  const confirmDeleteAccount = () => {
    if (accountDeletionPending) return;
    Alert.alert(
      accountDeletionMessage(language, 'settings.deleteAccountTitle'),
      accountDeletionMessage(language, 'settings.deleteAccountMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: accountDeletionMessage(language, 'settings.deleteAccountConfirm'),
          style: 'destructive',
          onPress: () => {
            setAccountDeletionPending(true);
            void deleteCurrentAccount()
              .then(onAccountDeleted)
              .catch(() => {
                setAccountDeletionPending(false);
                Alert.alert(
                  accountDeletionMessage(language, 'settings.deleteAccountFailedTitle'),
                  accountDeletionMessage(language, 'settings.deleteAccountFailedMessage'),
                );
              });
          },
        },
      ],
    );
  };
  const confirmResetOpponentMemory = () => {
    Alert.alert(
      t('settings.resetLearningTitle'),
      t('settings.resetLearningMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.reset'), style: 'destructive', onPress: onResetOpponentMemory },
      ],
    );
  };
  return (
    <>
      <ScreenScroll tablet={tablet}>
        <BackHeader large={tablet} title={t('settings.title')} onBack={onBack} />
        <View style={[styles.surface, tablet && styles.profileSurfaceTablet]}>
          <Text style={[styles.surfaceTitle, tablet && styles.profileSurfaceTitleTablet]}>{t('settings.identitySection')}</Text>
          <Text style={[styles.secondaryText, tablet && styles.profileSecondaryTextTablet]}>{t('settings.identityDescription')}</Text>

          <Text style={styles.fieldLabel}>{t('settings.nameLabel')}</Text>
          <View style={[styles.nameInputRow, tablet && styles.nameInputRowTablet]}>
            <TextInput
              autoCapitalize="words"
              autoCorrect={false}
              maxLength={PLAYER_DISPLAY_NAME_MAX_LENGTH}
              placeholder={t('settings.nameHint')}
              placeholderTextColor={palette.muted}
              style={[styles.nameInput, tablet && styles.nameInputTablet]}
              value={nameText}
              onChangeText={setNameText}
              accessibilityLabel={t('settings.nameLabel')}
            />
            <Pressable
              accessibilityLabel={t('common.done')}
              accessibilityRole="button"
              onPress={handleNameSave}
              style={({ pressed }) => [
                styles.saveNameButton,
                tablet && styles.saveNameButtonTablet,
                pressed && styles.saveNameButtonPressed,
                (!nameText.trim()) && styles.disabled,
              ]}
            >
              <Text style={styles.saveNameButtonText}>{t('common.done')}</Text>
            </Pressable>
          </View>
          {nameError && <Text style={styles.nameErrorText}>{t(nameError)}</Text>}
          <Text style={[styles.secondaryText, tablet && styles.profileSecondaryTextTablet]}>{t('settings.nameHint')}</Text>
          <View style={[styles.playerNamePicker, tablet && styles.playerNamePickerTablet]}>
            <PlayerNamePresetPicker
              hint={t('settings.playerNameReuse')}
              label={t('multiplayer.name.label')}
              large={tablet}
              onSelect={(name) => {
                setNameText(name);
                savePlayerDisplayName(name);
              }}
              selectedName={playerName}
            />
          </View>

          <Text style={[styles.surfaceTitle, tablet && styles.profileSurfaceTitleTablet]}>{t('settings.avatarSection')}</Text>
          <Text style={[styles.secondaryText, tablet && styles.profileSecondaryTextTablet]}>{t('settings.avatarDescription')}</Text>
          <HumanAvatarProfilePicker displayName={playerName} t={t} />
        </View>
        <View style={[styles.surface, tablet && styles.profileSurfaceTablet]}>
          <Text style={[styles.surfaceTitle, tablet && styles.profileSurfaceTitleTablet]}>{t('settings.preferences')}</Text>
          <Text style={[styles.preferenceSectionLabel, tablet && styles.preferenceSectionLabelTablet]}>{t('settings.appearance')}</Text>
          <View style={[styles.appearanceOptions, tablet && styles.profileAppearanceOptionsTablet]}>
            {(['system', 'light', 'dark'] as ThemePreference[]).map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: themePreference === option }}
                key={option}
                onPress={() => setThemePreference(option)}
                style={[styles.appearanceOption, tablet && styles.profileAppearanceOptionTablet, themePreference === option && styles.appearanceOptionSelected]}
              >
                <Ionicons
                  color={themePreference === option ? palette.primaryText : palette.muted}
                  name={option === 'system' ? 'phone-portrait-outline' : option === 'light' ? 'sunny-outline' : 'moon-outline'}
                  size={tablet ? 25 : 19}
                />
                <Text style={[styles.appearanceLabel, tablet && styles.profileAppearanceLabelTablet, themePreference === option && styles.appearanceLabelSelected]}>
                  {themePreferenceLabel(option, t)}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={[styles.preferenceDivider, tablet && styles.preferenceDividerTablet]} />
          <View style={styles.feedbackPreferenceList}>
            <View style={[styles.feedbackPreferenceRow, tablet && styles.feedbackPreferenceRowTablet]}>
              <View style={[styles.feedbackPreferenceIcon, tablet && styles.feedbackPreferenceIconTablet]}>
                <Ionicons color={palette.primary} name="phone-portrait-outline" size={tablet ? 25 : 20} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={[styles.feedbackPreferenceLabel, tablet && styles.feedbackPreferenceLabelTablet]}>{t('settings.haptics')}</Text>
                <Text style={[styles.feedbackPreferenceDescription, tablet && styles.feedbackPreferenceDescriptionTablet]}>{t('settings.hapticsDescription')}</Text>
              </View>
              <Switch
                accessibilityHint={t('settings.hapticsDescription')}
                accessibilityLabel={t('settings.hapticsA11y')}
                accessibilityRole="switch"
                accessibilityState={{ checked: hapticsEnabled }}
                hitSlop={8}
                ios_backgroundColor={palette.border}
                onValueChange={setHapticsEnabled}
                thumbColor={palette.surface}
                trackColor={{ false: palette.border, true: palette.primary }}
                value={hapticsEnabled}
              />
            </View>
          </View>
          <View style={[styles.preferenceDivider, tablet && styles.preferenceDividerTablet]} />
          <Pressable
            accessibilityLabel={t('settings.languageChoose')}
            accessibilityRole="button"
            onPress={() => setLanguagePickerVisible(true)}
            style={({ pressed }) => [styles.languageSelector, tablet && styles.profileLanguageSelectorTablet, styles.preferenceLanguageSelector, pressed && styles.pressed]}
          >
            <View style={[styles.languageSelectorIcon, tablet && styles.profileLanguageSelectorIconTablet]}>
              <Ionicons color={palette.primary} name="language-outline" size={tablet ? 25 : 20} />
            </View>
            <View style={styles.menuCopy}>
              <Text style={[styles.menuLabel, tablet && styles.menuLabelLarge]}>{t('settings.language')}</Text>
              <Text style={[styles.secondaryText, tablet && styles.profileSecondaryTextTablet]}>{t('settings.languageCurrent', {
                language: languagePreference === 'system'
                  ? `${languagePreferenceLabel(languagePreference, t)} · ${languageLabel(language, t)}`
                  : languagePreferenceLabel(languagePreference, t),
              })}</Text>
            </View>
            <Ionicons color={palette.muted} name="chevron-down" size={tablet ? 22 : 18} />
          </Pressable>
        </View>
        <OpponentReadCard large={tablet} memory={opponentMemory} onReset={confirmResetOpponentMemory} privacyNote />
        <View style={[styles.flatList, tablet && styles.profileFlatListTablet]}>
          <MenuRow icon="time-outline" label={t('settings.handHistory')} flat large={tablet} onPress={openHandHistory} />
          <MenuRow accent="aqua" icon="bar-chart-outline" label={t('settings.progressStatistics')} flat large={tablet} onPress={() => setProgressVisible(true)} />
          <MenuRow
            icon="ribbon-outline"
            label={t('settings.championshipRecord')}
            description={t('settings.achievements', { complete: unlockedChampionshipAchievements, total: championshipAchievementsList.length })}
            flat
            large={tablet}
            onPress={onOpenChampionshipRecord}
          />
          <MenuRow icon="chatbubble-ellipses-outline" label={t('settings.sendFeedback')} description={t('settings.sendFeedbackDescription')} flat large={tablet} onPress={() => setFeedbackVisible(true)} />
          <MenuRow icon="information-circle-outline" label={t('settings.betaPrivacy')} flat large={tablet} onPress={() => setBetaInfoVisible(true)} />
          <MenuRow icon="trash-outline" label={t('settings.deleteHistory')} flat large={tablet} onPress={confirmDeleteHistory} />
          <MenuRow
            accent="danger"
            description={accountDeletionPending
              ? undefined
              : accountDeletionMessage(language, 'settings.deleteAccountDescription')}
            disabled={accountDeletionPending}
            flat
            icon="trash-bin-outline"
            label={accountDeletionMessage(
              language,
              accountDeletionPending
                ? 'settings.deleteAccountDeleting'
                : 'settings.deleteAccount',
            )}
            large={tablet}
            onPress={confirmDeleteAccount}
          />
        </View>
      </ScreenScroll>
      <SessionHistoryModal
        hands={savedHands}
        onClose={() => setHistoryVisible(false)}
        onPracticeFocus={onPracticeFocus}
        onReplay={(hand) => {
          setHistoryVisible(false);
          setReplayHand(hand);
        }}
        visible={historyVisible}
      />
      <HandReplayModal hand={replayHand} onClose={() => setReplayHand(null)} />
      <ProgressModal
        hands={savedHands}
        learningProgress={learningProgress}
        onClose={() => setProgressVisible(false)}
        onPracticeFocus={onPracticeFocus}
        visible={progressVisible}
      />
      <BetaInfoModal
        onClose={() => setBetaInfoVisible(false)}
        onSendFeedback={() => {
          setBetaInfoVisible(false);
          setFeedbackVisible(true);
        }}
        visible={betaInfoVisible}
      />
      <BetaFeedbackModal
        context={{ screen: 'profile' }}
        onClose={() => setFeedbackVisible(false)}
        visible={feedbackVisible}
      />
      <LanguagePickerModal
        large={tablet}
        onClose={() => setLanguagePickerVisible(false)}
        visible={languagePickerVisible}
      />
    </>
  );
}

function LanguagePickerModal({ large = false, onClose, visible }: { large?: boolean; onClose: () => void; visible: boolean }) {
  const { palette } = useAppTheme();
  const { language, preference, setPreference, t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <View style={[styles.languageModalRoot, large && styles.languageModalRootLarge]}>
        <ModalBackdrop accessibilityLabel={t('settings.languageClose')} onPress={onClose} />
        <View style={[styles.languageSheet, large && styles.languageSheetLarge]}>
          <View style={styles.languageSheetHandle} />
          <Text accessibilityRole="header" style={[styles.languageSheetTitle, large && styles.languageSheetTitleLarge]}>{t('settings.languageChoose')}</Text>
          <View style={styles.languageOptions}>
            {LANGUAGE_PREFERENCES.map((option) => {
              const selected = preference === option;
              const optionLanguage = option === 'system' ? language : option;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={option}
                  onPress={() => {
                    setPreference(option);
                    onClose();
                  }}
                  style={({ pressed }) => [styles.languageOption, large && styles.languageOptionLarge, selected && styles.languageOptionSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.languageRadio, large && styles.languageRadioLarge, selected && styles.languageRadioSelected]}>
                    {selected && <View style={styles.languageRadioDot} />}
                  </View>
                  <View style={styles.menuCopy}>
                    <Text style={[styles.languageOptionLabel, large && styles.languageOptionLabelLarge]}>{languagePreferenceLabel(option, t)}</Text>
                    {option === 'system' && (
                      <Text style={[styles.secondaryText, large && styles.profileSecondaryTextTablet]}>{languageLabel(optionLanguage, t)}</Text>
                    )}
                  </View>
                  {selected && <Ionicons color={palette.primary} name="checkmark" size={large ? 24 : 20} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function GameSetupScreen({
  aiDifficulty,
  coachEnabled,
  onBack,
  onAiDifficultyChange,
  onCoachEnabledChange,
  onSessionConfigChange,
  onPlayerCountChange,
  onStart,
  onTablePaceChange,
  playerCount,
  sessionConfig,
  tablePace,
}: {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onBack: () => void;
  onAiDifficultyChange: (difficulty: AiDifficulty) => void;
  onCoachEnabledChange: (value: boolean) => void;
  onSessionConfigChange: (config: PracticeSessionConfig) => void;
  onPlayerCountChange: (count: TablePlayerCount) => void;
  onStart: () => void;
  onTablePaceChange: (pace: TablePace) => void;
  playerCount: TablePlayerCount;
  sessionConfig: PracticeSessionConfig;
  tablePace: TablePace;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const pickerLayout = aiDifficultyPickerLayout(width);
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.screenContent,
          pickerLayout.tablet && styles.screenContentTablet,
          styles.setupScreenContent,
        ]}
        showsVerticalScrollIndicator={false}
        style={styles.setupScroll}
      >
        <BackHeader large={pickerLayout.tablet} title={t('setup.title')} onBack={onBack} />
        <View style={[styles.surface, styles.setupGroup, pickerLayout.tablet && styles.setupSurfaceTablet]}>
          <View>
            <Text style={[styles.fieldLabel, pickerLayout.tablet && styles.setupFieldLabelTablet]}>{t('setup.tableSize')}</Text>
            <View style={styles.difficultyOptions}>
              {TABLE_PLAYER_COUNT_OPTIONS.map((count) => {
                const selected = playerCount === count;
                return (
                  <Pressable
                    accessibilityLabel={t('setup.totalPlayersA11y', { count })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={count}
                    onPress={() => onPlayerCountChange(count)}
                    style={[
                      styles.difficultyOption,
                      pickerLayout.tablet && styles.difficultyOptionTablet,
                      selected && styles.difficultyOptionSelected,
                    ]}
                  >
                    <Text style={[
                      styles.difficultyLabel,
                      pickerLayout.tablet && styles.setupDifficultyLabelTablet,
                      selected && styles.difficultyLabelSelected,
                    ]}>{t('common.players', { count })}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, pickerLayout.tablet && styles.setupFieldLabelTablet]}>{t('setup.startingStack')}</Text>
            <View style={styles.difficultyOptions}>
              {STARTING_STACK_OPTIONS.map((stackBb) => {
                const selected = sessionConfig.startingStackBb === stackBb;
                const stackChips = formatChips(stackBb * CASH_GAME_BIG_BLIND);
                return (
                  <Pressable
                    accessibilityLabel={t('setup.startingStackA11y', { stack: stackChips })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={stackBb}
                    onPress={() => onSessionConfigChange({ ...sessionConfig, startingStackBb: stackBb })}
                    style={[
                      styles.difficultyOption,
                      pickerLayout.tablet && styles.difficultyOptionTablet,
                      selected && styles.difficultyOptionSelected,
                    ]}
                  >
                    <Text style={[
                      styles.difficultyLabel,
                      pickerLayout.tablet && styles.setupDifficultyLabelTablet,
                      selected && styles.difficultyLabelSelected,
                    ]}>{stackChips}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={[styles.fieldLabel, pickerLayout.tablet && styles.setupFieldLabelTablet]}>{t('setup.sessionLength')}</Text>
            <View style={styles.difficultyOptions}>
              {SESSION_HAND_TARGET_OPTIONS.map((target) => {
                const selected = sessionConfig.handTarget === target;
                const label = target === 'open' ? t('setup.open') : String(target);
                return (
                  <Pressable
                    accessibilityLabel={localizedSessionLength(target, t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={target}
                    onPress={() => onSessionConfigChange({ ...sessionConfig, handTarget: target })}
                    style={[
                      styles.difficultyOption,
                      pickerLayout.tablet && styles.difficultyOptionTablet,
                      selected && styles.difficultyOptionSelected,
                    ]}
                  >
                    <Text style={[
                      styles.difficultyLabel,
                      pickerLayout.tablet && styles.setupDifficultyLabelTablet,
                      selected && styles.difficultyLabelSelected,
                    ]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={[styles.setupNotice, pickerLayout.tablet && styles.setupNoticeTablet]}>{t('setup.sessionLengthDescription')}</Text>
          </View>
        </View>
        <View style={[styles.surface, styles.setupGroup, pickerLayout.tablet && styles.setupSurfaceTablet]}>
          <View style={styles.spaceBetween}>
            <View style={styles.flexShrink}>
              <Text style={[styles.surfaceTitle, pickerLayout.tablet && styles.setupSurfaceTitleTablet]}>{t('setup.coach')}</Text>
              <Text style={[styles.secondaryText, pickerLayout.tablet && styles.setupSecondaryTextTablet]}>{t('setup.coachDescription')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('setup.coachA11y')}
              onValueChange={onCoachEnabledChange}
              trackColor={{ false: palette.soft, true: palette.primary }}
              thumbColor={palette.surface}
              value={coachEnabled}
            />
          </View>
          <View style={[styles.preferenceDivider, pickerLayout.tablet && styles.preferenceDividerTablet]} />
          <AiDifficultyRadioGroup
            difficulty={aiDifficulty}
            label={t('setup.difficulty')}
            onChange={onAiDifficultyChange}
          />
          <View style={[styles.preferenceDivider, pickerLayout.tablet && styles.preferenceDividerTablet]} />
          <Text style={[styles.fieldLabel, {
            fontSize: pickerLayout.labelFontSize,
            lineHeight: pickerLayout.labelLineHeight,
          }]}>{t('pace.label')}</Text>
          <View
            accessibilityLabel={t('pace.label')}
            accessibilityRole="radiogroup"
            style={[styles.difficultyOptions, pickerLayout.tablet && styles.difficultyOptionsTablet]}
          >
            {TABLE_PACE_OPTIONS.map((pace) => {
              const selected = pace === tablePace;
              return (
                <Pressable
                  accessibilityLabel={paceLabel(pace, t)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={pace}
                  onPress={() => onTablePaceChange(pace)}
                  style={[
                    styles.difficultyOption,
                    { minHeight: pickerLayout.optionMinHeight },
                    pickerLayout.tablet && styles.difficultyOptionTablet,
                    selected && styles.difficultyOptionSelected,
                  ]}
                >
                  <Text style={[
                    styles.difficultyLabel,
                    {
                      fontSize: pickerLayout.labelFontSize,
                      lineHeight: pickerLayout.labelLineHeight,
                    },
                    selected && styles.difficultyLabelSelected,
                  ]}>{paceLabel(pace, t)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[
            styles.setupNotice,
            {
              fontSize: pickerLayout.summaryFontSize,
              lineHeight: pickerLayout.summaryLineHeight,
            },
          ]}>{t('pace.description')}</Text>
        </View>
      </ScrollView>
      <View style={[styles.setupActionBar, pickerLayout.tablet && styles.setupActionBarTablet]}>
        <PrimaryButton label={t('setup.startGame')} onPress={onStart} />
      </View>
    </View>
  );
}

function AiDifficultyRadioGroup({
  difficulty,
  label,
  onChange,
}: {
  difficulty: AiDifficulty;
  label: string;
  onChange: (difficulty: AiDifficulty) => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const layout = aiDifficultyPickerLayout(width);
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View>
      <Text style={[styles.fieldLabel, {
        fontSize: layout.labelFontSize,
        lineHeight: layout.labelLineHeight,
      }]}>{label}</Text>
      <View
        accessibilityLabel={label}
        accessibilityRole="radiogroup"
        style={[styles.difficultyOptions, layout.tablet && styles.difficultyOptionsTablet]}
      >
        {SELECTABLE_AI_DIFFICULTIES.map((option) => {
          const selected = option === difficulty;
          const summary = difficultySummary(option, t);
          return (
            <Pressable
              accessibilityHint={summary}
              accessibilityLabel={difficultyLabel(option, t)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={option}
              onPress={() => onChange(option)}
              style={[
                styles.difficultyOption,
                { minHeight: layout.optionMinHeight },
                layout.tablet && styles.difficultyOptionTablet,
                selected && styles.difficultyOptionSelected,
              ]}
            >
              <Text
                style={[
                  styles.difficultyLabel,
                  { fontSize: layout.labelFontSize, lineHeight: layout.labelLineHeight },
                  selected && styles.difficultyLabelSelected,
                ]}
              >
                {difficultyLabel(option, t)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[
        styles.setupNotice,
        { fontSize: layout.summaryFontSize, lineHeight: layout.summaryLineHeight },
      ]}>{difficultySummary(difficulty, t)}</Text>
    </View>
  );
}

function ScreenHeader({ eyebrow, title, onProfile }: { eyebrow: string; title: string; onProfile: () => void }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{title}</Text>
      </View>
      <Pressable accessibilityLabel={t('common.openProfile')} accessibilityRole="button" onPress={onProfile} style={styles.iconButton}>
        <Ionicons color={palette.text} name="person-outline" size={19} />
      </Pressable>
    </View>
  );
}

function BackHeader({ large = false, title, onBack }: { large?: boolean; title: string; onBack: () => void }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={[styles.backHeader, large && styles.backHeaderLarge]}>
      <Pressable accessibilityLabel={t('common.back')} accessibilityRole="button" onPress={onBack} style={[styles.backButton, large && styles.backButtonLarge]}>
        <Ionicons color={palette.text} name="arrow-back" size={large ? 23 : 19} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={2} style={[styles.backTitle, large && styles.backTitleLarge]}>{title}</Text>
      <View style={[styles.backSpacer, large && styles.backSpacerLarge]} />
    </View>
  );
}

function MenuRow({
  accent = 'indigo',
  badge,
  compact = false,
  description,
  disabled = false,
  flat = false,
  icon,
  label,
  large = false,
  onPress,
}: {
  accent?: 'indigo' | 'aqua' | 'danger';
  badge?: string;
  compact?: boolean;
  description?: string;
  disabled?: boolean;
  flat?: boolean;
  icon: IconName;
  label: string;
  large?: boolean;
  onPress?: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const accentColor = accent === 'aqua'
    ? palette.aqua
    : accent === 'danger' ? palette.danger : palette.muted;
  const content = (
    <>
      <View style={[
        styles.menuIcon,
        compact && styles.menuIconCompact,
        large && styles.menuIconLarge,
        accent === 'aqua' && styles.menuIconAqua,
        accent === 'danger' && styles.menuIconDanger,
      ]}>
        <Ionicons color={accentColor} name={icon} size={large ? 23 : compact ? 17 : 19} />
      </View>
      <View style={styles.menuCopy}>
        <View style={styles.menuLabelRow}>
          <Text style={[
            styles.menuLabel,
            compact && styles.menuLabelCompact,
            large && styles.menuLabelLarge,
            accent === 'danger' && styles.menuLabelDanger,
          ]}>{label}</Text>
          {badge ? <Text numberOfLines={1} style={styles.menuBadge}>{badge}</Text> : null}
        </View>
        {description && <Text numberOfLines={large ? 2 : 1} style={[styles.secondaryText, compact && styles.secondaryTextCompact, large && styles.secondaryTextLarge]}>{description}</Text>}
      </View>
      <Ionicons color={palette.muted} name="chevron-forward" size={large ? 22 : compact ? 16 : 18} />
    </>
  );
  const style: ViewStyle[] = [styles.menuRow];
  if (compact) style.push(styles.menuRowCompact);
  if (large) style.push(styles.menuRowLarge);
  style.push(flat ? styles.menuRowFlat : styles.surface);
  if (flat && large) style.push(styles.menuRowFlatLarge);
  if (disabled) style.push(styles.disabled);
  return onPress ? (
    <Pressable
      accessibilityLabel={[label, badge, description].filter(Boolean).join('. ')}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : <View style={style}>{content}</View>;
}

function TournamentChoiceRow({
  checkpoints,
  difficulty,
  onDifficultyChange,
  onSelect,
}: {
  checkpoints: Record<SitAndGoPlayerCount, SitAndGoCheckpoint | null>;
  difficulty: AiDifficulty;
  onDifficultyChange: (difficulty: AiDifficulty) => void;
  onSelect: (playerCount: SitAndGoPlayerCount) => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.tournamentGroup}>
      <View style={styles.tournamentHeader}>
        <View style={[styles.menuIcon, styles.menuIconAqua]}>
          <Ionicons color={palette.aqua} name="trophy-outline" size={19} />
        </View>
        <View style={styles.menuCopy}>
          <Text style={styles.menuLabel}>{t('tournament.sitAndGo')}</Text>
          <Text style={styles.secondaryText}>{t('tournament.description', { stack: sitAndGoStartingChips })}</Text>
        </View>
      </View>
      <AiDifficultyRadioGroup
        difficulty={difficulty}
        label={t('tournament.newDifficulty')}
        onChange={onDifficultyChange}
      />
      <View style={styles.tournamentChoices}>
        {([3, 6] as const).map((playerCount) => {
          const checkpoint = checkpoints[playerCount];
          return (
            <Pressable
              accessibilityLabel={checkpoint
                ? t('tournament.continueDifficultyA11y', {
                  count: playerCount,
                  difficulty: difficultyLabel(checkpoint.aiDifficulty, t),
                  hand: checkpoint.nextHandNumber,
                })
                : t('tournament.startDifficultyA11y', {
                  count: playerCount,
                  difficulty: difficultyLabel(difficulty, t),
                })}
              accessibilityRole="button"
              key={playerCount}
              onPress={() => onSelect(playerCount)}
              style={({ pressed }) => [
                styles.tournamentChoice,
                tablet && styles.tournamentChoiceTablet,
                checkpoint && styles.tournamentChoiceSaved,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.tournamentChoiceCopy}>
                <Text style={[styles.tournamentChoiceLabel, tablet && styles.tournamentChoiceLabelTablet]}>{t('common.players', { count: playerCount })}</Text>
                <Text numberOfLines={2} style={[styles.tournamentChoiceCaption, tablet && styles.tournamentChoiceCaptionTablet]}>
                  {checkpoint
                    ? t('tournament.savedHandDifficulty', {
                      difficulty: difficultyLabel(checkpoint.aiDifficulty, t),
                      hand: checkpoint.nextHandNumber,
                    })
                    : playerCount === 3 ? t('tournament.quickTable') : t('tournament.fullTable')}
                </Text>
              </View>
              <Ionicons color={checkpoint ? palette.aqua : palette.muted} name="chevron-forward" size={16} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PrimaryButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress?: () => void }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, disabled && styles.disabled, pressed && !disabled && styles.pressed]}
    >
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  );
}

function BottomTabs({ active, onSelect }: { active: MainTab; onSelect: (tab: MainTab) => void }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const tabs: Array<{ key: MainTab; label: string; activeIcon: IconName; icon: IconName }> = [
    { key: 'home', label: t('tabs.home'), activeIcon: 'home', icon: 'home-outline' },
    { key: 'learn', label: t('tabs.learn'), activeIcon: 'school', icon: 'school-outline' },
    { key: 'play', label: t('tabs.play'), activeIcon: 'game-controller', icon: 'game-controller-outline' },
  ];
  return (
    <View style={[styles.tabs, { height: 58 + insets.bottom, paddingBottom: insets.bottom }]}>
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            style={styles.tab}
          >
            <Ionicons color={selected ? palette.primary : palette.muted} name={selected ? tab.activeIcon : tab.icon} size={21} />
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: palette.background },
    app: { flex: 1 },
    screen: { flex: 1 },
    screenContent: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 28, gap: 14 },
    screenContentTablet: { width: '100%', maxWidth: 980, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 18, paddingBottom: 44, gap: 18 },
    homeScreenContent: { paddingTop: 8, paddingBottom: 14, gap: 9 },
    setupScroll: { flex: 1, minHeight: 0 },
    setupScreenContent: { paddingBottom: 24 },
    setupActionBar: { gap: 7, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.background },
    setupActionBarTablet: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 10, paddingHorizontal: 28, paddingTop: 14, paddingBottom: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
    title: { flexShrink: 1, color: palette.text, fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sessionCard: { minHeight: 246, padding: 20, borderRadius: 23, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, justifyContent: 'space-between', overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 24, elevation: 3 },
    homeSessionCard: { minHeight: 0, padding: 15 },
    orb: { position: 'absolute', width: 148, height: 148, borderRadius: 74, right: -48, top: -58, backgroundColor: palette.accentSoft },
    sessionCopy: { maxWidth: 280, gap: 7 },
    homeSessionCopy: { maxWidth: '100%', gap: 5 },
    homeGoalLabel: { alignSelf: 'flex-start', color: palette.primary, fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase' },
    homeSessionTitleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
    homeSessionMeta: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 7 },
    homeSessionTitle: { flex: 1, minWidth: 0, fontSize: 18, lineHeight: 23 },
    timePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: palette.aquaSoft },
    timeText: { color: palette.aquaText, fontSize: 11, fontWeight: '700' },
    sessionTitle: { color: palette.text, fontSize: 21, lineHeight: 27, fontWeight: '700', letterSpacing: -0.35 },
    bodyText: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    homeProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 3 },
    homeProgressLabel: { color: palette.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    homeProgressValue: { color: palette.aquaText, fontSize: 10, fontWeight: '800' },
    homeProgressTrack: { marginTop: 5 },
    homeSectionTitle: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 1, paddingHorizontal: 2 },
    homeMenuList: { paddingHorizontal: 11, borderRadius: 17, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' },
    primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary, paddingHorizontal: 16, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 2 },
    primaryButtonLabel: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    surface: { padding: 15, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    surfaceTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    secondaryText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    setupSurfaceTablet: { padding: 22, borderRadius: 22 },
    setupSurfaceTitleTablet: { fontSize: 19, lineHeight: 25 },
    setupSecondaryTextTablet: { fontSize: 15, lineHeight: 21, marginTop: 4 },
    profileSurfaceTablet: { padding: 22, borderRadius: 22 },
    profileSurfaceTitleTablet: { fontSize: 19, lineHeight: 25 },
    profileSecondaryTextTablet: { fontSize: 14, lineHeight: 20, marginTop: 4 },
    preferenceSectionLabel: { color: palette.muted, fontSize: 11, lineHeight: 15, fontWeight: '800', marginTop: 14 },
    preferenceSectionLabelTablet: { fontSize: 14, lineHeight: 19, marginTop: 18 },
    preferenceDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12, backgroundColor: palette.border },
    preferenceDividerTablet: { marginVertical: 17 },
    playerNamePicker: { marginTop: 13 },
    playerNamePickerTablet: { marginTop: 17 },
    nameInputRow: { marginTop: 13, flexDirection: 'row', gap: 10 },
    nameInputRowTablet: { marginTop: 17, gap: 12 },
    nameInput: {
      flex: 1,
      minHeight: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: palette.text,
      fontSize: 15,
    },
    nameInputTablet: { fontSize: 17 },
    saveNameButton: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.primary,
      paddingVertical: 11,
      paddingHorizontal: 16,
      justifyContent: 'center',
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 2,
    },
    saveNameButtonTablet: { paddingVertical: 13, paddingHorizontal: 20 },
    saveNameButtonPressed: { opacity: 0.74 },
    saveNameButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    nameErrorText: { color: palette.danger, fontSize: 12, lineHeight: 16, marginTop: 6, fontWeight: '600' },
    spaceBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    flexShrink: { flex: 1 },
    progressTrack: { height: 5, backgroundColor: palette.soft, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
    progressFill: { height: '100%', backgroundColor: palette.aqua },
    flatList: { borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12 },
    profileFlatListTablet: { borderRadius: 22, paddingHorizontal: 16 },
    menuRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuRowLarge: { minHeight: 82, gap: 15 },
    menuRowCompact: { minHeight: 54, gap: 9 },
    menuRowFlat: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, paddingVertical: 11 },
    menuRowFlatLarge: { paddingVertical: 14 },
    menuIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.soft },
    menuIconLarge: { width: 46, height: 46, borderRadius: 14 },
    menuIconCompact: { width: 32, height: 32, borderRadius: 10 },
    menuIconAqua: { backgroundColor: palette.aquaSoft },
    menuIconDanger: { backgroundColor: `${palette.danger}18` },
    menuCopy: { flex: 1 },
    menuLabelRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
    menuLabel: { flexShrink: 1, color: palette.text, fontSize: 14, fontWeight: '700' },
    menuLabelDanger: { color: palette.danger },
    menuBadge: { flexShrink: 1, color: palette.muted, fontSize: 11, lineHeight: 14, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 7, backgroundColor: palette.soft, overflow: 'hidden' },
    menuLabelLarge: { fontSize: 16.5, lineHeight: 22 },
    menuLabelCompact: { fontSize: 12.5 },
    secondaryTextCompact: { fontSize: 9.5, lineHeight: 13, marginTop: 1 },
    secondaryTextLarge: { fontSize: 13.5, lineHeight: 19, marginTop: 3 },
    tournamentGroup: { gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    tournamentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tournamentChoices: { flexDirection: 'row', gap: 8 },
    tournamentChoice: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    tournamentChoiceTablet: { minHeight: 76, gap: 9, paddingHorizontal: 15, borderRadius: 16 },
    tournamentChoiceSaved: { borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    tournamentChoiceCopy: { flex: 1, gap: 2 },
    tournamentChoiceLabel: { color: palette.text, fontSize: 12, fontWeight: '800' },
    tournamentChoiceLabelTablet: { fontSize: 16, lineHeight: 21 },
    tournamentChoiceCaption: { color: palette.muted, fontSize: 9, lineHeight: 12 },
    tournamentChoiceCaptionTablet: { fontSize: 13, lineHeight: 18 },
    backHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    backHeaderLarge: { minHeight: 52, marginBottom: 8 },
    backButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    backButtonLarge: { width: 48, height: 48, borderRadius: 15 },
    backTitle: { flex: 1, minWidth: 0, color: palette.text, fontSize: 16, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
    backTitleLarge: { fontSize: 21, lineHeight: 27 },
    backSpacer: { width: 44 },
    backSpacerLarge: { width: 48 },
    appearanceOptions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    profileAppearanceOptionsTablet: { gap: 12, marginTop: 18 },
    appearanceOption: { flex: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    profileAppearanceOptionTablet: { minHeight: 88, gap: 8, borderRadius: 16 },
    appearanceOptionSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
    appearanceLabel: { color: palette.muted, fontSize: 12, fontWeight: '700' },
    profileAppearanceLabelTablet: { fontSize: 15 },
    appearanceLabelSelected: { color: palette.primaryText },
    feedbackPreferenceList: { marginTop: 0 },
    feedbackPreferenceRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 11 },
    feedbackPreferenceRowTablet: { minHeight: 86, gap: 15 },
    feedbackPreferenceIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    feedbackPreferenceIconTablet: { width: 48, height: 48, borderRadius: 15 },
    feedbackPreferenceLabel: { color: palette.text, fontSize: 14, lineHeight: 19, fontWeight: '800' },
    feedbackPreferenceLabelTablet: { fontSize: 17, lineHeight: 23 },
    feedbackPreferenceDescription: { color: palette.muted, fontSize: 11, lineHeight: 15, marginTop: 2, paddingRight: 6 },
    feedbackPreferenceDescriptionTablet: { fontSize: 14, lineHeight: 20, marginTop: 3, paddingRight: 12 },
    languageSelector: { minHeight: 62, marginTop: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    profileLanguageSelectorTablet: { minHeight: 78, marginTop: 17, paddingHorizontal: 16, gap: 14, borderRadius: 17 },
    preferenceLanguageSelector: { marginTop: 0 },
    languageSelectorIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentSoft },
    profileLanguageSelectorIconTablet: { width: 46, height: 46, borderRadius: 14 },
    languageModalRoot: { flex: 1, justifyContent: 'flex-end', padding: 14, backgroundColor: palette.scrim },
    languageModalRootLarge: { alignItems: 'center', padding: 24 },
    languageSheet: { gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 8 },
    languageSheetLarge: { width: '100%', maxWidth: 620, gap: 18, paddingHorizontal: 22, paddingTop: 14, paddingBottom: 24, borderRadius: 26 },
    languageSheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, backgroundColor: palette.border },
    languageSheetTitle: { color: palette.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    languageSheetTitleLarge: { fontSize: 22, lineHeight: 28 },
    languageOptions: { gap: 7 },
    languageOption: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    languageOptionLarge: { minHeight: 72, paddingHorizontal: 16, gap: 14, borderRadius: 17 },
    languageOptionSelected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    languageOptionLabel: { color: palette.text, fontSize: 14, fontWeight: '700' },
    languageOptionLabelLarge: { fontSize: 17, lineHeight: 22 },
    languageRadio: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: palette.border },
    languageRadioLarge: { width: 24, height: 24, borderRadius: 12 },
    languageRadioSelected: { borderColor: palette.primary },
    languageRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.primary },
    fieldLabel: { color: palette.muted, fontSize: 12, fontWeight: '600', marginBottom: 9 },
    setupGroup: { gap: 18 },
    difficultyOptions: { flexDirection: 'row', gap: 7 },
    difficultyOptionsTablet: { gap: 12 },
    difficultyOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    difficultyOptionTablet: { minHeight: 56, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 15 },
    difficultyOptionSelected: { borderColor: palette.primary, backgroundColor: palette.primary },
    difficultyLabel: { color: palette.text, fontSize: 12, lineHeight: 16, fontWeight: '700', textAlign: 'center' },
    setupDifficultyLabelTablet: { fontSize: 15, lineHeight: 20 },
    difficultyLabelSelected: { color: palette.primaryText },
    setupNotice: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
    setupFieldLabelTablet: { fontSize: 15, lineHeight: 20, marginBottom: 12 },
    setupNoticeTablet: { fontSize: 14, lineHeight: 20, marginTop: 12 },
    tabs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 34 },
    tab: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', gap: 3 },
    tabLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    tabLabelSelected: { color: palette.primary },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.42 },
  });
}
