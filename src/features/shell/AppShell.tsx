
import * as Linking from 'expo-linking';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Alert,
  Modal,
  View,
} from 'react-native';
import {
  SafeAreaView,
} from 'react-native-safe-area-context';

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
import {
  findLearningActivity,
  lessons,
  scenarioTrainer,
} from '../../domain/learning/content';
import {
  completedLessonCount,
  recommendedLearningActivityId,
} from '../../domain/learning/progress';
import {
  buildPersonalPracticePlan,
  type PersonalPracticePlanTarget,
} from '../../domain/learning/personalPracticePlan';
import {
  composeRecommendedSessionPlan,
  isSessionPlannable,
  type RecommendedSessionPlan,
} from '../../domain/learning/recommendedSession';
import type { GradedHandEvidence, SessionStepDecisions } from '../../domain/learning/sessionClosing';

import {
  ScenarioAttemptReview,
  ScenarioTrainerDefinition,
} from '../../domain/learning/types';
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
  QUICK_PLAY_SESSION_CONFIG,
  type PracticeSessionConfig,
} from '../../domain/poker/session';
import type { CoachFocusArea } from '../../domain/poker/types';
import {
  applyOpponentObservation,
  type HeroHandObservation,
} from '../../domain/poker/opponentMemory';
import {
  type TablePace,
  type TablePlayerCount,
} from '../../domain/poker/multiwaySession';
import {
  DAILY_CHALLENGE_VERSION,
  dailyChallengeDate,
  type DailyChallengeCheckpoint,
  type DailyChallengeResult,
} from '../../domain/poker/dailyChallenge';
import {
  currentDailyChallengeProgress,
} from '../../domain/poker/dailyChallengeProgress';
import {
  championshipEvent,
  championshipEventIsUnlocked,
  createChampionshipCheckpoint,
  type ChampionshipCheckpoint,
  type ChampionshipEvent,
  type ChampionshipEventId,
  type ChampionshipProgress,
  type ChampionshipResult,
} from '../../domain/poker/championship';
import {
  type SitAndGoCheckpoint,
  type SitAndGoPlayerCount,
} from '../../domain/poker/tournament';

import {
  loadRecentHandHistory,
} from '../../services/handHistory';

import {
  sweepAvatarCleanupTombstones,
  sweepPendingAvatarCleanups,
} from '../../services/avatarCleanup';
import {
  loadOpponentMemory,
  resetOpponentMemory,
  saveOpponentMemory,
} from '../../services/opponentMemory';
import {
  completeOnboarding,
  shouldShowOnboarding,
} from '../../services/onboarding';
import {
  AiRosterModal,
} from '../learn/AiRosterModal';
import {
  LearnScreen,
} from '../learn/LearnScreen';

import {
  ScenarioTrainingModal,
} from '../learn/ScenarioTrainingModal';
import {
  RecommendedSessionFlow,
} from '../learn/RecommendedSessionFlow';

import {
  HandHistoryEvidenceController,
} from './handHistoryEvidenceController';
import {
  gradedHandEvidence,
} from '../learn/closingOutcome';
import { reviewFocusAreaForScenario } from '../../domain/learning/practicePacks';

import {
  journeyDone,
  journeyEndEarly,
  journeySkip,
  journeyStart,
  journeyMissionExit,
} from '../learn/recommendedSessionJourney';

import {
  useLearningProgress,
} from '../learn/useLearningProgress';
import {
  ProgressModal,
} from '../profile/ProgressModal';
import {
  PokerTableScreen,
} from '../table/PokerTableScreen';
import {
  MultiwayPokerTableScreen,
} from '../table/MultiwayPokerTableScreen';
import {
  useTableOrientation,
} from '../table/useTableOrientation';

import {
  summarizeSessionHandLearning,
  type SessionHandRecord,
} from '../table/sessionModels';
import {
  useAppTheme,
} from '../../theme';

import {
  FirstRunOnboardingModal,
} from './FirstRunOnboardingModal';
import {
  LearningSetupModal,
} from '../learn/LearningSetupModal';
import {
  SkillCalibrationModal,
} from '../learn/SkillCalibrationModal';

import type { MultiplayerFlowMode } from '../multiplayer/multiplayerUx';
import {
  parseMultiplayerInviteUrl,
} from '../../services/multiplayerInvite';
import {
  departMultiplayerRoomForInviteReplacement,
  resolveMultiplayerInviteRoute,
  routeMultiplayerInviteAfterBootstrap,
} from '../../services/multiplayerInviteRouting';
import {
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
  sitAndGoCheckpointForCount,
} from './playPresentation';
import {
  type AiTournamentStart,
} from './AiPlayConfigurator';
import {
  ChampionshipModal,
} from './ChampionshipModal';
import {
  ChampionshipRecordModal,
} from './ChampionshipRecordModal';
import {
  resolveLocalAiDifficulty,
} from './aiGameModePolicy';

import {
  useLocalization,
} from '../../localization';

import {
  championshipEventText,
} from '../../localization/championship';
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

import {
  createStyles,
} from './shellStyles';
import {
  BottomTabs,
  dailyChallengeCaption,
  loadProfileIdentity,
  type MainTab,
} from './shellChrome';
import {
  HomeScreen,
} from './screens/HomeScreen';
import {
  PlayScreen,
} from './screens/PlayScreen';
import {
  ProfileScreen,
} from './screens/ProfileScreen';

type Screen = MainTab | 'profile' | 'table';
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

export function AppShell() {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const [screen, setScreen] = useState<Screen>('home');
  // The saved human identity rendered at the profile entry point (the Home and
  // Play header avatars). Re-read whenever the screen changes so a profile
  // edit (new uploaded avatar, preset, or name) shows the moment the user
  // returns to a header surface — the picker saves synchronously before
  // navigation, and a screen transition always follows.
  const [profileIdentity, setProfileIdentity] = useState(loadProfileIdentity);
  useEffect(() => {
    setProfileIdentity(loadProfileIdentity());
  }, [screen]);
  // Application-bootstrap cleanup sweep: retry every avatar artifact whose
  // deletion was never confirmed (a failed replacement/removal, or an
  // account-deletion leftover). This runs once per app launch — NOT only when
  // the avatar picker mounts — so queued privacy cleanup is retried after
  // every relaunch even if the player never opens Profile. Best-effort: a
  // missing deleter leaves the record queued for the next launch/sweep. The
  // tombstone sweep runs alongside it: references the queue could not hold
  // (a full queue or storage failure) are retried here — confirmed deletions
  // drop them, and unconfirmed ones move into the queue when a slot frees.
  useEffect(() => {
    void sweepPendingAvatarCleanups().catch(() => undefined);
    void sweepAvatarCleanupTombstones().catch(() => undefined);
  }, []);
  const [multiplayerLaunch, setMultiplayerLaunch] = useState<MultiplayerLaunch | null>(null);
  const [privateTableLive, setPrivateTableLive] = useState(false);
  const tableOrientation = useTableOrientation(screen === 'table' || privateTableLive);
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
  const [sitAndGoDifficulty, setSitAndGoDifficulty] = useState<AiDifficulty>('club');
  // The AI configurator's Tournament options ride with the launch so the
  // table screen creates the exact session the player confirmed.
  const [activeTournamentStartingStackBb, setActiveTournamentStartingStackBb] = useState<number | undefined>(undefined);
  const [activeTournamentBlindSpeed, setActiveTournamentBlindSpeed] = useState<'slow' | 'standard' | 'fast' | undefined>(undefined);
  const [activeAiDifficulty, setActiveAiDifficulty] = useState<AiDifficulty>('club');
  const [tablePace, setTablePace] = useState<TablePace>('normal');
  const [rosterVisible, setRosterVisible] = useState(false);
  const [activeSessionConfig, setActiveSessionConfig] = useState<PracticeSessionConfig>(QUICK_PLAY_SESSION_CONFIG);
  const [activePlayerCount, setActivePlayerCount] = useState<TablePlayerCount>(2);
  const [activeTableMode, setActiveTableMode] = useState<TableMode>('practice');
  const [activeLearningMissionId, setActiveLearningMissionId] = useState<TableMissionId | null>(null);
  const [tournamentCheckpoints, setTournamentCheckpoints] = useState<Record<SitAndGoPlayerCount, SitAndGoCheckpoint | null>>(() => ({
    3: loadSitAndGoCheckpoint(3),
    6: loadSitAndGoCheckpoint(6),
    9: loadSitAndGoCheckpoint(9),
  }));
  const [today, setToday] = useState(dailyChallengeDate);
  const [dailyCheckpoint, setDailyCheckpoint] = useState<DailyChallengeCheckpoint | null>(() => loadDailyChallengeCheckpoint(today));
  const [dailyProgress, setDailyProgress] = useState<DailyChallengeProgress[]>(loadCachedDailyChallengeProgress);
  const [championshipProgress, setChampionshipProgress] = useState<ChampionshipProgress>(loadChampionshipProgress);
  const [championshipCheckpoint, setChampionshipCheckpoint] = useState<ChampionshipCheckpoint | null>(loadChampionshipCheckpoint);
  const [activeChampionshipEventId, setActiveChampionshipEventId] = useState<ChampionshipEventId>('local_3');
  const [championshipVisible, setChampionshipVisible] = useState(false);
  const [championshipRecordVisible, setChampionshipRecordVisible] = useState(false);
  const [practiceFocus, setPracticeFocus] = useState<string | null>(null);
  const [learningLaunchActivityId, setLearningLaunchActivityId] = useState<string | null>(null);
  const [learningLaunchRecommendation, setLearningLaunchRecommendation] = useState<AdaptiveLearningRecommendation | null>(null);
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
    // D02: friend tables are a shipped capability, so resume discovery runs in
    // every build instead of behind a preview environment flag.
    if (
      activeMultiplayerRoom
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
    // D02: invite links are handled in every build; the preview flag is gone.
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

  const startQuickGame = (playerCount: TablePlayerCount) => {
    setTableReturnScreen('play');
    setActiveSessionConfig(QUICK_PLAY_SESSION_CONFIG);
    setActivePlayerCount(playerCount);
    setActiveTableMode('practice');
    setActiveAiDifficulty(resolveLocalAiDifficulty({ mode: 'quick_play' }));
    setScreen('table');
  };
  const startConfiguredPractice = useCallback((config: PracticeSessionConfig, playerCount: TablePlayerCount) => {
    setTableReturnScreen('play');
    setActiveSessionConfig(config);
    setActivePlayerCount(playerCount);
    setActiveTableMode('practice');
    setActiveAiDifficulty(resolveLocalAiDifficulty({ mode: 'custom', selectedDifficulty: sitAndGoDifficulty }));
    setScreen('table');
  }, [sitAndGoDifficulty]);
  const beginConfiguredTournament = useCallback((start: AiTournamentStart, checkpoint: SitAndGoCheckpoint | null) => {
    if (!checkpoint) {
      clearSitAndGoCheckpoint(start.playerCount);
      setTournamentCheckpoints((current) => ({ ...current, [start.playerCount]: null }));
      // Fresh launches carry the configurator's stack/pace; a resume keeps
      // the saved run's own values instead.
      setActiveTournamentStartingStackBb(start.startingStackBb);
      setActiveTournamentBlindSpeed(start.blindSpeed);
    } else {
      setActiveTournamentStartingStackBb(undefined);
      setActiveTournamentBlindSpeed(undefined);
    }
    setActiveAiDifficulty(resolveLocalAiDifficulty({
      mode: 'sit_and_go',
      resumeDifficulty: checkpoint?.aiDifficulty,
      selectedDifficulty: sitAndGoDifficulty,
    }));
    setTableReturnScreen('play');
    setActivePlayerCount(start.playerCount);
    setActiveTableMode('sit_and_go');
    setScreen('table');
  }, [sitAndGoDifficulty]);
  const startConfiguredTournament = useCallback((start: AiTournamentStart) => {
    const checkpoint = tournamentCheckpoints[start.playerCount];
    if (!checkpoint) {
      beginConfiguredTournament(start, null);
      return;
    }
    // A saved run is never silently discarded: the player chooses.
    Alert.alert(
      t('alert.savedTournamentTitle', { count: start.playerCount }),
      t('alert.savedTournamentMessage', { hand: checkpoint.nextHandNumber }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('alert.startNew'), style: 'destructive', onPress: () => beginConfiguredTournament(start, null) },
        { text: t('common.continue'), onPress: () => beginConfiguredTournament(start, checkpoint) },
      ],
    );
  }, [beginConfiguredTournament, t, tournamentCheckpoints]);
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
  const updateTournamentCheckpoint = useCallback((checkpoint: SitAndGoCheckpoint | null) => {
    const playerCount = checkpoint?.players.length ?? activePlayerCount;
    if (playerCount !== 3 && playerCount !== 6 && playerCount !== 9) return;
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
        t('alert.savedChampionshipTitle', { event: championshipEventText(event, 'title', t) }),
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
      t('alert.startChampionshipTitle', { event: championshipEventText(event, 'title', t) }),
      t('alert.replaceChampionshipMessage', {
        event: championshipEventText(savedEvent, 'title', t),
        hand: championshipCheckpoint.tournament.nextHandNumber,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('alert.replaceRun'), style: 'destructive', onPress: () => beginChampionship(event, null) },
      ],
    );
  }, [beginChampionship, championshipCheckpoint, championshipProgress, t]);
  // P18-042: at most one conditional Continue row on Home, covering the
  // resumable checkpoints in priority order: the live private table, then a
  // saved Sit & Go, then a saved Championship run. With none, Home keeps its
  // whitespace (the row simply does not render).
  const homeContinue = useMemo(() => {
    if (activeMultiplayerRoom) {
      return {
        key: 'multiplayer' as const,
        description: t('home.continuePrivate', { code: activeMultiplayerRoom.roomCode ?? '' }),
        onPress: () => {
          openMultiplayer({ initialMode: 'join', resumeRecord: activeMultiplayerRoom });
        },
      };
    }
    const sitAndGoCount = ([9, 6, 3] as const).find((count) => tournamentCheckpoints[count] !== null);
    if (sitAndGoCount !== undefined) {
      const checkpoint = tournamentCheckpoints[sitAndGoCount]!;
      return {
        key: 'sit_and_go' as const,
        description: t('home.continueSitAndGo', { count: sitAndGoCount, hand: checkpoint.nextHandNumber }),
        onPress: () => {
          // A resume is driven entirely by the checkpoint; the start shape's
          // stack field is unread on this path.
          beginConfiguredTournament({
            blindSpeed: checkpoint.blindSpeed ?? 'standard',
            playerCount: sitAndGoCount,
            startingStackBb: 100,
          }, checkpoint);
        },
      };
    }
    if (championshipCheckpoint) {
      const savedEvent = championshipEvent(championshipCheckpoint.eventId);
      return {
        key: 'championship' as const,
        description: t('home.continueChampionship', {
          event: championshipEventText(savedEvent, 'title', t),
          hand: championshipCheckpoint.tournament.nextHandNumber,
        }),
        onPress: () => beginChampionship(savedEvent, championshipCheckpoint),
      };
    }
    return null;
  }, [
    activeMultiplayerRoom,
    beginChampionship,
    beginConfiguredTournament,
    championshipCheckpoint,
    openMultiplayer,
    t,
    tournamentCheckpoints,
  ]);

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
    setTournamentCheckpoints({ 3: null, 6: null, 9: null });
    setDailyCheckpoint(null);
    setDailyProgress([]);
    setChampionshipProgress(loadChampionshipProgress());
    setChampionshipCheckpoint(null);
    setActiveChampionshipEventId('local_3');
    setChampionshipVisible(false);
    setChampionshipRecordVisible(false);
    setOpponentMemory(loadOpponentMemory());
    setPracticeFocus(null);
    setLearningLaunchActivityId(null);
    setLearningLaunchRecommendation(null);
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
        <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
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
              } else setScreen('play');
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
            tournamentStartingStackBb={activeTournamentStartingStackBb}
            tournamentBlindSpeed={activeTournamentBlindSpeed}
            tableMode={activeTableMode}
            orientation={tableOrientation}
            tournamentCheckpoint={championshipMode
              ? championshipCheckpoint?.eventId === activeChampionshipEventId
                ? championshipCheckpoint.tournament
                : null
              : activeTableMode === 'sit_and_go'
                ? sitAndGoCheckpointForCount(activePlayerCount, tournamentCheckpoints)
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
      <SafeAreaView style={styles.safeArea} edges={['top', 'right', 'bottom', 'left']}>
        <PokerTableScreen
          aiDifficulty={activeAiDifficulty}
          tablePace={tablePace}
          coachEnabled={coachEnabled}
          onChangeSetup={() => setScreen('play')}
          onCoachEnabledChange={setCoachEnabled}
          onContinueLearning={continueLearning}
          onExit={() => setScreen(tableReturnScreen)}
          onFocusIdentified={rememberCoachFocus}
          onHeroHandObserved={observeHeroHand}
          onPracticeFocus={practiceCoachFocus}
          opponentMemory={opponentMemory}
          orientation={tableOrientation}
          sessionConfig={activeSessionConfig}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={showTabs ? ['top', 'right', 'left'] : ['top', 'right', 'bottom', 'left']}>
      <View style={styles.app}>
        {screen === 'home' && (
          <HomeScreen
            aiDifficulty={resolveLocalAiDifficulty({ mode: 'quick_play' })}
            completedLessons={completedLessonCount(learning.progress)}
            continueTarget={homeContinue}
            fallbackLearningRecommendation={fallbackLearningRecommendation}
            learningGoal={learning.profile.goal}
            learningRecommendation={adaptiveLearningRecommendation}
            onAllGames={() => setScreen('play')}
            onOpenProfile={() => setScreen('profile')}
            profileIdentity={profileIdentity}
            onQuickPlay={() => startQuickGame(2)}
            onStartLearning={continueLearning}
            onOpenRoster={() => setRosterVisible(true)}
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
              loading={learning.loading}
              onLaunchActivityHandled={() => setLearningLaunchActivityId(null)}
              onLaunchRecommendationHandled={() => setLearningLaunchRecommendation(null)}
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
            coachEnabled={coachEnabled}
            onOpenProfile={() => setScreen('profile')}
            profileIdentity={profileIdentity}
            championshipCheckpoint={championshipCheckpoint}
            championshipProgress={championshipProgress}
            onCoachEnabledChange={setCoachEnabled}
            onOpenChampionshipRecord={() => setChampionshipRecordVisible(true)}
            onOpenScenario={() => setScenarioTrainingVisible(true)}
            onStartPractice={startConfiguredPractice}
            onStartTournament={startConfiguredTournament}
            onTablePaceChange={setTablePace}
            tablePace={tablePace}
            onSitAndGoDifficultyChange={setSitAndGoDifficulty}
            sitAndGoDifficulty={sitAndGoDifficulty}
            dailyChallengeDate={today}
            dailyCheckpoint={dailyCheckpoint}
            dailyProgress={currentDailyChallengeProgress(
              dailyProgress,
              today,
              DAILY_CHALLENGE_VERSION,
            )}
            onDailyChallenge={openDailyChallenge}
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
            onMultiplayerLivePlayChange={setPrivateTableLive}
            onMultiplayerResume={() => {
              if (!activeMultiplayerRoom) return;
              openMultiplayer({
                initialMode: 'join',
                resumeRecord: activeMultiplayerRoom,
              });
            }}
            multiplayerLaunch={multiplayerLaunch}
            tableOrientation={tableOrientation}
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
        loading={!closingHandsLoaded}
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
