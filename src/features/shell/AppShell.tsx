import { Ionicons } from '@expo/vector-icons';
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
import { reviewFocusAreaForScenario } from '../../domain/learning/practicePacks';
import type { ScenarioAttemptReview, ScenarioTrainerDefinition } from '../../domain/learning/types';
import {
  loadCachedLearningReviewQueue,
  updateLearningReviewQueue,
} from '../../services/learningReviewQueue';
import type { LearningActivityDefinition, LearningProgressEntry } from '../../domain/learning/types';
import {
  tableMissionById,
  type TableMissionId,
  type TableMissionResult,
} from '../../domain/learning/tableMissions';
import {
  AI_DIFFICULTY_OPTIONS,
  type AiDifficulty,
} from '../../domain/poker/aiProfiles';
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
  dailyChallengeDate,
  dailyChallengeDisplayDate,
  dailyChallengeStreak,
  type DailyChallengeCheckpoint,
  type DailyChallengeResult,
} from '../../domain/poker/dailyChallenge';
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
import {
  loadOpponentMemory,
  resetOpponentMemory,
  saveOpponentMemory,
} from '../../services/opponentMemory';
import { completeOnboarding, shouldShowOnboarding } from '../../services/onboarding';
import { AiRosterModal } from '../learn/AiRosterModal';
import { LearnScreen } from '../learn/LearnScreen';
import { ScenarioTrainingModal } from '../learn/ScenarioTrainingModal';
import { useLearningProgress } from '../learn/useLearningProgress';
import { ProgressModal } from '../profile/ProgressModal';
import { PokerTableScreen } from '../table/PokerTableScreen';
import { MultiwayPokerTableScreen } from '../table/MultiwayPokerTableScreen';
import { HandReplayModal } from '../table/HandReplayModal';
import { SessionHistoryModal } from '../table/SessionHistoryModal';
import { localizedCoachFocus } from '../table/localizedGameplay';
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
import { ChampionshipModal } from './ChampionshipModal';
import { ChampionshipRecordModal } from './ChampionshipRecordModal';
import { OpponentReadCard } from '../../components/OpponentReadCard';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import {
  LANGUAGE_PREFERENCES,
  type AppLanguage,
  type LanguagePreference,
  type MessageKey,
  useLocalization,
} from '../../localization';
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
  const [tableReturnScreen, setTableReturnScreen] = useState<Exclude<Screen, 'table'>>('play');
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('club');
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
  const [learningLaunchSheetId, setLearningLaunchSheetId] = useState<string | null>(null);
  const [scenarioTrainingVisible, setScenarioTrainingVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(shouldShowOnboarding);
  const [learningSetupVisible, setLearningSetupVisible] = useState(false);
  const [calibrationVisible, setCalibrationVisible] = useState(false);
  const [calibrationKind, setCalibrationKind] = useState<CalibrationKind>('baseline');
  const calibrationOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opponentMemory, setOpponentMemory] = useState(loadOpponentMemory);
  const learning = useLearningProgress();
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
    setScreen('table');
  };
  const startCustomSession = () => {
    setTableReturnScreen('setup');
    setActiveSessionConfig(customSessionConfig);
    setActivePlayerCount(customPlayerCount);
    setActiveTableMode('practice');
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
  }, [learning.recordResult]);
  const beginTournament = useCallback((playerCount: SitAndGoPlayerCount, checkpoint: SitAndGoCheckpoint | null) => {
    if (!checkpoint) {
      clearSitAndGoCheckpoint(playerCount);
      setTournamentCheckpoints((current) => ({ ...current, [playerCount]: null }));
    } else {
      setAiDifficulty(checkpoint.aiDifficulty);
    }
    setTableReturnScreen(screen === 'home' ? 'home' : 'play');
    setActivePlayerCount(playerCount);
    setActiveTableMode('sit_and_go');
    setScreen('table');
  }, [screen]);
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
        ...current.filter((entry) => entry.challengeDate !== saved.challengeDate),
      ].sort((left, right) => right.challengeDate.localeCompare(left.challengeDate)));
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
  const openHandRankings = useCallback(() => {
    setLearningLaunchSheetId('sheet-hand-rankings');
    setScreen('learn');
  }, []);
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

  useEffect(() => {
    let active = true;
    void loadRecentHandHistory().then((hands) => {
      if (!active) return;
      setPracticeFocus(summarizeSessionHandLearning(hands).topFocusArea);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadDailyChallengeProgress().then((progress) => {
      if (active) setDailyProgress(progress);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (screen === 'table') return undefined;
    const refreshDailyDate = () => {
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
            aiDifficulty={aiDifficulty}
            tablePace={tablePace}
            coachEnabled={coachEnabled}
            onChangeSetup={() => {
              if (championshipMode) leaveChampionshipTable();
              else if (learningMission) setScreen('learn');
              else setScreen(activeTableMode === 'practice' ? 'setup' : 'play');
            }}
            onCoachEnabledChange={setCoachEnabled}
            onExit={() => {
              if (championshipMode) leaveChampionshipTable();
              else setScreen(tableReturnScreen);
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
          aiDifficulty={aiDifficulty}
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
            aiDifficulty={aiDifficulty}
            completedLessons={completedLessonCount(learning.progress)}
            fallbackLearningRecommendation={fallbackLearningRecommendation}
            learningGoal={learning.profile.goal}
            learningRecommendation={adaptiveLearningRecommendation}
            onHandRankings={openHandRankings}
            onOpenProfile={() => setScreen('profile')}
            onQuickPlay={startQuickPlay}
            onScenario={() => setScenarioTrainingVisible(true)}
            onStartLearning={continueLearning}
            scenarioBestScore={learning.progress.find((entry) => entry.activityId === scenarioTrainer.id)?.bestScore ?? null}
            dailyCaption={dailyChallengeCaption(today, dailyCheckpoint, dailyProgress, language, t)}
            onDailyChallenge={openDailyChallenge}
            championshipCaption={championshipCaption(championshipProgress, championshipCheckpoint, t)}
            onChampionship={() => setChampionshipVisible(true)}
          />
        )}
        {screen === 'learn' && (
          <LearnScreen
            history={learning.history}
            learningProfile={learning.profile}
            launchActivityId={learningLaunchActivityId}
            launchRecommendation={learningLaunchRecommendation}
            launchSheetId={learningLaunchSheetId}
            loading={learning.loading}
            onLaunchActivityHandled={() => setLearningLaunchActivityId(null)}
            onLaunchRecommendationHandled={() => setLearningLaunchRecommendation(null)}
            onLaunchSheetHandled={() => setLearningLaunchSheetId(null)}
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
        )}
        {screen === 'play' && (
          <PlayScreen
            aiDifficulty={aiDifficulty}
            coachEnabled={coachEnabled}
            onOpenProfile={() => setScreen('profile')}
            onQuickPlay={startQuickPlay}
            onOpenSetup={() => setScreen('setup')}
            onOpenScenario={() => setScenarioTrainingVisible(true)}
            onTournament={openTournament}
            tournamentCheckpoints={tournamentCheckpoints}
            dailyChallengeDate={today}
            dailyCheckpoint={dailyCheckpoint}
            dailyProgress={dailyProgress.find((entry) => entry.challengeDate === today) ?? null}
            onDailyChallenge={openDailyChallenge}
            championshipCaption={championshipCaption(championshipProgress, championshipCheckpoint, t)}
            onChampionship={() => setChampionshipVisible(true)}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            championshipProgress={championshipProgress}
            learningProgress={learning.progress}
            onBack={() => setScreen('home')}
            onDeleteLearningProgress={learning.clearProgress}
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
function ScreenScroll({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScrollView
      contentContainerStyle={[styles.screenContent, compact && styles.homeScreenContent]}
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
  const todayResult = progress.find((entry) => entry.challengeDate === today);
  if (todayResult) return t('caption.dailyToday', {
    place: localizedOrdinal(todayResult.bestPlace, language),
    score: todayResult.bestScore,
  });
  const streak = dailyChallengeStreak(progress.map((entry) => entry.challengeDate), today);
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
  championshipCaption,
  completedLessons,
  dailyCaption,
  fallbackLearningRecommendation,
  learningRecommendation,
  learningGoal,
  onDailyChallenge,
  onChampionship,
  onHandRankings,
  onOpenProfile,
  onQuickPlay,
  onScenario,
  onStartLearning,
  scenarioBestScore,
}: {
  aiDifficulty: AiDifficulty;
  championshipCaption: string;
  completedLessons: number;
  dailyCaption: string;
  fallbackLearningRecommendation: LearningActivityDefinition;
  learningRecommendation: AdaptiveLearningRecommendation | null;
  learningGoal: LearningGoalId;
  onDailyChallenge: () => void;
  onChampionship: () => void;
  onHandRankings: () => void;
  onOpenProfile: () => void;
  onQuickPlay: () => void;
  onScenario: () => void;
  onStartLearning: () => void;
  scenarioBestScore: number | null;
}) {
  const { palette } = useAppTheme();
  const { activityText, practicePackText, t } = useLocalization();
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
    <ScreenScroll compact>
      <ScreenHeader eyebrow={t('home.eyebrow')} title={t('home.title')} onProfile={onOpenProfile} />
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
      <Text accessibilityRole="header" style={styles.homeSectionTitle}>{t('home.quickStart')}</Text>
      <View style={styles.homeMenuList}>
        <MenuRow
          compact
          flat
          icon="trophy-outline"
          label={t('home.championship')}
          description={championshipCaption}
          onPress={onChampionship}
        />
        <MenuRow
          accent="aqua"
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
          icon="play"
          label={t('home.quickPlay')}
          description={t('home.quickPlayDescription', { difficulty: difficultyLabel(aiDifficulty, t), stack: quickPlayStartingChips })}
          onPress={onQuickPlay}
        />
      </View>
      <View style={styles.homeQuickGrid}>
        <HomeQuickLink
          accent="aqua"
          caption={scenarioBestScore === null ? t('home.freshSpots') : t('common.best', { score: scenarioBestScore })}
          icon="locate-outline"
          label={t('home.scenarioDrill')}
          onPress={onScenario}
        />
        <HomeQuickLink
          caption={t('home.examplesOdds')}
          icon="albums-outline"
          label={t('home.handRankings')}
          onPress={onHandRankings}
        />
      </View>
    </ScreenScroll>
  );
}

function PlayScreen({
  aiDifficulty,
  championshipCaption,
  coachEnabled,
  dailyChallengeDate,
  dailyCheckpoint,
  dailyProgress,
  onDailyChallenge,
  onChampionship,
  onOpenProfile,
  onQuickPlay,
  onOpenSetup,
  onOpenScenario,
  onTournament,
  tournamentCheckpoints,
}: {
  aiDifficulty: AiDifficulty;
  championshipCaption: string;
  coachEnabled: boolean;
  dailyChallengeDate: string;
  dailyCheckpoint: DailyChallengeCheckpoint | null;
  dailyProgress: DailyChallengeProgress | null;
  onDailyChallenge: () => void;
  onChampionship: () => void;
  onOpenProfile: () => void;
  onQuickPlay: () => void;
  onOpenSetup: () => void;
  onOpenScenario: () => void;
  onTournament: (playerCount: SitAndGoPlayerCount) => void;
  tournamentCheckpoints: Record<SitAndGoPlayerCount, SitAndGoCheckpoint | null>;
}) {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const localizedDifficulty = difficultyLabel(aiDifficulty, t);
  const coachStatus = t(coachEnabled ? 'common.coachOn' : 'common.coachOff');
  const [multiplayerMode, setMultiplayerMode] = useState<MultiplayerFlowMode | null>(null);
  return (
    <>
      <ScreenScroll compact>
        <ScreenHeader eyebrow={t('play.eyebrow')} title={t('play.title')} onProfile={onOpenProfile} />
        <Pressable
          accessibilityLabel={`${t('home.quickPlay')}. ${t('play.quickDescription', { coach: coachStatus, difficulty: localizedDifficulty, stack: quickPlayStartingChips })}`}
          accessibilityRole="button"
          onPress={onQuickPlay}
          style={({ pressed }) => [styles.sessionCard, styles.playCard, pressed && styles.pressed]}
        >
          <View style={styles.orb} />
          <View style={[styles.sessionCopy, styles.playSessionCopy]}>
            <View style={styles.playTitleRow}>
              <Text style={styles.sessionTitle}>{t('home.quickPlay')}</Text>
              <View style={styles.homeSessionMeta}>
                <View style={styles.timePill}>
                  <Ionicons name="sparkles-outline" size={13} color={palette.aquaText} />
                  <Text style={styles.timeText}>{t('play.recommended')}</Text>
                </View>
                <Ionicons color={palette.muted} name="arrow-forward" size={15} />
              </View>
            </View>
            <Text numberOfLines={2} style={styles.bodyText}>{t('play.quickDescription', { coach: coachStatus, difficulty: localizedDifficulty, stack: quickPlayStartingChips })}</Text>
          </View>
        </Pressable>
        {multiplayerPreviewEnabled && (
          <MultiplayerEntryCard
            onCreate={() => setMultiplayerMode('create')}
            onJoin={() => setMultiplayerMode('join')}
          />
        )}
        {multiplayerPreviewEnabled && (
          <Text accessibilityRole="header" style={styles.homeSectionTitle}>{t('multiplayer.play.soloSection')}</Text>
        )}
        <View style={styles.flatList}>
          <MenuRow
            compact
            icon="trophy-outline"
            label={t('home.championship')}
            description={championshipCaption}
            flat
            onPress={onChampionship}
          />
          <MenuRow
            accent="aqua"
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
            onSelect={onTournament}
          />
          <MenuRow compact icon="hardware-chip-outline" label={t('play.customGame')} description={t('play.customGameDescription')} flat onPress={onOpenSetup} />
          <MenuRow accent="aqua" compact icon="locate-outline" label={t('play.scenarioTraining')} description={t('play.scenarioDescription')} flat onPress={onOpenScenario} />
        </View>
      </ScreenScroll>
      {multiplayerPreviewEnabled && (
        <MultiplayerFlowModal
          initialMode={multiplayerMode ?? 'create'}
          onClose={() => setMultiplayerMode(null)}
          visible={multiplayerMode !== null}
        />
      )}
    </>
  );
}

function ProfileScreen({
  championshipProgress,
  learningProgress,
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [savedHands, setSavedHands] = useState<SessionHandRecord[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [betaInfoVisible, setBetaInfoVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [replayHand, setReplayHand] = useState<SessionHandRecord | null>(null);
  const learningSummary = useMemo(() => summarizeSessionHandLearning(savedHands), [savedHands]);
  const completedLessons = completedLessonCount(learningProgress);
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
            void Promise.all([deleteAllHandHistory(), onDeleteLearningProgress(), onDeleteDailyChallengeProgress()])
              .then(() => setSavedHands([]))
              .catch(() => Alert.alert(t('settings.deleteFailedTitle'), t('settings.deleteFailedMessage')));
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
      <ScreenScroll>
        <BackHeader title={t('settings.title')} onBack={onBack} />
        <View style={styles.surface}>
          <Text style={styles.surfaceTitle}>{t('settings.appearance')}</Text>
          <Text style={styles.secondaryText}>{t('settings.appearanceDescription')}</Text>
          <View style={styles.appearanceOptions}>
            {(['system', 'light', 'dark'] as ThemePreference[]).map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: themePreference === option }}
                key={option}
                onPress={() => setThemePreference(option)}
                style={[styles.appearanceOption, themePreference === option && styles.appearanceOptionSelected]}
              >
                <Ionicons
                  color={themePreference === option ? palette.primaryText : palette.muted}
                  name={option === 'system' ? 'phone-portrait-outline' : option === 'light' ? 'sunny-outline' : 'moon-outline'}
                  size={19}
                />
                <Text style={[styles.appearanceLabel, themePreference === option && styles.appearanceLabelSelected]}>
                  {themePreferenceLabel(option, t)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.surface}>
          <Text style={styles.surfaceTitle}>{t('settings.language')}</Text>
          <Text style={styles.secondaryText}>{t('settings.languageDescription')}</Text>
          <Pressable
            accessibilityLabel={t('settings.languageChoose')}
            accessibilityRole="button"
            onPress={() => setLanguagePickerVisible(true)}
            style={({ pressed }) => [styles.languageSelector, pressed && styles.pressed]}
          >
            <View style={styles.languageSelectorIcon}>
              <Ionicons color={palette.primary} name="language-outline" size={20} />
            </View>
            <View style={styles.menuCopy}>
              <Text style={styles.menuLabel}>{languagePreferenceLabel(languagePreference, t)}</Text>
              <Text style={styles.secondaryText}>{t('settings.languageCurrent', {
                language: languageLabel(language, t),
              })}</Text>
            </View>
            <Ionicons color={palette.muted} name="chevron-down" size={18} />
          </Pressable>
        </View>
        <View style={styles.surface}>
          <Text style={styles.surfaceTitle}>{t('settings.savedSummary', {
            complete: completedLessons,
            hands: savedHands.length,
            total: lessons.length,
          })}</Text>
          <Text style={styles.secondaryText}>
            {learningSummary.topFocusArea
              ? t('settings.recommendedFocus', { focus: localizedCoachFocus(learningSummary.topFocusArea, t) })
              : t('settings.playMore')}
          </Text>
        </View>
        <OpponentReadCard memory={opponentMemory} onReset={confirmResetOpponentMemory} privacyNote />
        <View style={styles.flatList}>
          <MenuRow icon="time-outline" label={t('settings.handHistory')} flat onPress={openHandHistory} />
          <MenuRow accent="aqua" icon="bar-chart-outline" label={t('settings.progressStatistics')} flat onPress={() => setProgressVisible(true)} />
          <MenuRow
            icon="ribbon-outline"
            label={t('settings.championshipRecord')}
            description={t('settings.achievements', { complete: unlockedChampionshipAchievements, total: championshipAchievementsList.length })}
            flat
            onPress={onOpenChampionshipRecord}
          />
          <MenuRow icon="chatbubble-ellipses-outline" label={t('settings.sendFeedback')} description={t('settings.sendFeedbackDescription')} flat onPress={() => setFeedbackVisible(true)} />
          <MenuRow icon="information-circle-outline" label={t('settings.betaPrivacy')} flat onPress={() => setBetaInfoVisible(true)} />
          <MenuRow icon="trash-outline" label={t('settings.deleteHistory')} flat onPress={confirmDeleteHistory} />
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
        onClose={() => setLanguagePickerVisible(false)}
        visible={languagePickerVisible}
      />
    </>
  );
}

function LanguagePickerModal({ onClose, visible }: { onClose: () => void; visible: boolean }) {
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
      <View style={styles.languageModalRoot}>
        <ModalBackdrop accessibilityLabel={t('settings.languageClose')} onPress={onClose} />
        <View style={styles.languageSheet}>
          <View style={styles.languageSheetHandle} />
          <Text accessibilityRole="header" style={styles.languageSheetTitle}>{t('settings.languageChoose')}</Text>
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
                  style={({ pressed }) => [styles.languageOption, selected && styles.languageOptionSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.languageRadio, selected && styles.languageRadioSelected]}>
                    {selected && <View style={styles.languageRadioDot} />}
                  </View>
                  <View style={styles.menuCopy}>
                    <Text style={styles.languageOptionLabel}>{languagePreferenceLabel(option, t)}</Text>
                    {option === 'system' && (
                      <Text style={styles.secondaryText}>{languageLabel(optionLanguage, t)}</Text>
                    )}
                  </View>
                  {selected && <Ionicons color={palette.primary} name="checkmark" size={20} />}
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.screenContent, styles.setupScreenContent]}
        showsVerticalScrollIndicator={false}
      >
        <BackHeader title={t('setup.title')} onBack={onBack} />
        <View style={styles.surface}>
          <Text style={styles.surfaceTitle}>{playerCount === 2 ? t('setup.headsUp') : t('setup.multiway', { count: playerCount })}</Text>
          <Text style={styles.secondaryText}>
            {playerCount === 2
              ? t('setup.headsUpDescription')
              : t('setup.multiwayDescription', { count: playerCount - 1 })}
          </Text>
        </View>
        <View style={[styles.surface, styles.setupGroup]}>
          <View>
            <Text style={styles.fieldLabel}>{t('setup.tableSize')}</Text>
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
                    style={[styles.difficultyOption, selected && styles.difficultyOptionSelected]}
                  >
                    <Text style={[styles.difficultyLabel, selected && styles.difficultyLabelSelected]}>{t('common.players', { count })}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.setupNotice}>{t('setup.privateCards')}</Text>
          </View>
          <View>
            <Text style={styles.fieldLabel}>{t('setup.startingStack')}</Text>
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
                    style={[styles.difficultyOption, selected && styles.difficultyOptionSelected]}
                  >
                    <Text style={[styles.difficultyLabel, selected && styles.difficultyLabelSelected]}>{stackChips}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={styles.fieldLabel}>{t('setup.sessionLength')}</Text>
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
                    style={[styles.difficultyOption, selected && styles.difficultyOptionSelected]}
                  >
                    <Text style={[styles.difficultyLabel, selected && styles.difficultyLabelSelected]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.setupNotice}>{t('setup.sessionLengthDescription')}</Text>
          </View>
        </View>
        <View style={[styles.surface, styles.spaceBetween]}>
          <View style={styles.flexShrink}>
            <Text style={styles.surfaceTitle}>{t('setup.coach')}</Text>
            <Text style={styles.secondaryText}>{t('setup.coachDescription')}</Text>
          </View>
          <Switch
            accessibilityLabel={t('setup.coachA11y')}
            onValueChange={onCoachEnabledChange}
            trackColor={{ false: palette.soft, true: palette.primary }}
            thumbColor={palette.surface}
            value={coachEnabled}
          />
        </View>
        <View style={styles.surface}>
          <Text style={styles.fieldLabel}>{t('setup.difficulty')}</Text>
          <View style={styles.difficultyOptions}>
            {AI_DIFFICULTY_OPTIONS.map((profile) => (
              <Pressable
                accessibilityLabel={t('setup.difficultyA11y', { difficulty: difficultyLabel(profile.id, t) })}
                accessibilityRole="button"
                accessibilityState={{ selected: profile.id === aiDifficulty }}
                key={profile.id}
                onPress={() => onAiDifficultyChange(profile.id)}
                style={[styles.difficultyOption, profile.id === aiDifficulty && styles.difficultyOptionSelected]}
              >
                <Text style={[styles.difficultyLabel, profile.id === aiDifficulty && styles.difficultyLabelSelected]}>{difficultyLabel(profile.id, t)}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.setupNotice}>{difficultySummary(aiDifficulty, t)}</Text>
        </View>
        <View style={styles.surface}>
          <Text style={styles.fieldLabel}>{t('pace.label')}</Text>
          <View style={styles.difficultyOptions}>
            {TABLE_PACE_OPTIONS.map((pace) => {
              const selected = pace === tablePace;
              return (
                <Pressable
                  accessibilityLabel={paceLabel(pace, t)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={pace}
                  onPress={() => onTablePaceChange(pace)}
                  style={[styles.difficultyOption, selected && styles.difficultyOptionSelected]}
                >
                  <Text style={[styles.difficultyLabel, selected && styles.difficultyLabelSelected]}>{paceLabel(pace, t)}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.setupNotice}>{t('pace.description')}</Text>
        </View>
      </ScrollView>
      <View style={styles.setupActionBar}>
        <PrimaryButton label={t('setup.startGame')} onPress={onStart} />
        <Text style={styles.setupFooter}>
          {t('setup.footer', {
            count: playerCount,
            difficulty: difficultyLabel(aiDifficulty, t),
            length: localizedSessionLength(sessionConfig.handTarget, t),
            stack: formatChips(sessionConfig.startingStackBb * CASH_GAME_BIG_BLIND),
          })}
        </Text>
      </View>
    </View>
  );
}

function ScreenHeader({ eyebrow, title, onProfile }: { eyebrow: string; title: string; onProfile: () => void }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      <Pressable accessibilityLabel={t('common.openProfile')} accessibilityRole="button" onPress={onProfile} style={styles.iconButton}>
        <Ionicons color={palette.text} name="person-outline" size={19} />
      </Pressable>
    </View>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.backHeader}>
      <Pressable accessibilityLabel={t('common.back')} accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Ionicons color={palette.text} name="arrow-back" size={19} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.backTitle}>{title}</Text>
      <View style={styles.backSpacer} />
    </View>
  );
}

function MenuRow({
  accent = 'indigo',
  compact = false,
  description,
  flat = false,
  icon,
  label,
  onPress,
}: {
  accent?: 'indigo' | 'aqua';
  compact?: boolean;
  description?: string;
  flat?: boolean;
  icon: IconName;
  label: string;
  onPress?: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const content = (
    <>
      <View style={[styles.menuIcon, compact && styles.menuIconCompact, accent === 'aqua' && styles.menuIconAqua]}>
        <Ionicons color={accent === 'aqua' ? palette.aqua : palette.primary} name={icon} size={compact ? 17 : 19} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={[styles.menuLabel, compact && styles.menuLabelCompact]}>{label}</Text>
        {description && <Text numberOfLines={1} style={[styles.secondaryText, compact && styles.secondaryTextCompact]}>{description}</Text>}
      </View>
      <Ionicons color={palette.muted} name="chevron-forward" size={compact ? 16 : 18} />
    </>
  );
  const style: ViewStyle[] = [styles.menuRow, ...(compact ? [styles.menuRowCompact] : []), flat ? styles.menuRowFlat : styles.surface];
  return onPress ? (
    <Pressable
      accessibilityLabel={[label, description].filter(Boolean).join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...style, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  ) : <View style={style}>{content}</View>;
}

function TournamentChoiceRow({
  checkpoints,
  onSelect,
}: {
  checkpoints: Record<SitAndGoPlayerCount, SitAndGoCheckpoint | null>;
  onSelect: (playerCount: SitAndGoPlayerCount) => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
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
      <View style={styles.tournamentChoices}>
        {([3, 6] as const).map((playerCount) => {
          const checkpoint = checkpoints[playerCount];
          return (
            <Pressable
              accessibilityLabel={checkpoint
                ? t('tournament.continueA11y', { count: playerCount, hand: checkpoint.nextHandNumber })
                : t('tournament.startA11y', { count: playerCount })}
              accessibilityRole="button"
              key={playerCount}
              onPress={() => onSelect(playerCount)}
              style={({ pressed }) => [styles.tournamentChoice, checkpoint && styles.tournamentChoiceSaved, pressed && styles.pressed]}
            >
              <View style={styles.tournamentChoiceCopy}>
                <Text style={styles.tournamentChoiceLabel}>{t('common.players', { count: playerCount })}</Text>
                <Text numberOfLines={1} style={styles.tournamentChoiceCaption}>
                  {checkpoint
                    ? t('tournament.savedHand', { hand: checkpoint.nextHandNumber })
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

function HomeQuickLink({
  accent = 'indigo',
  caption,
  icon,
  label,
  onPress,
}: {
  accent?: 'indigo' | 'aqua';
  caption: string;
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={`${label}. ${caption}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.homeQuickLink, pressed && styles.pressed]}
    >
      <View style={[styles.homeQuickIcon, accent === 'aqua' && styles.menuIconAqua]}>
        <Ionicons color={accent === 'aqua' ? palette.aqua : palette.primary} name={icon} size={19} />
      </View>
      <Text style={styles.homeQuickLabel}>{label}</Text>
      <Text style={styles.homeQuickCaption}>{caption}</Text>
      <Ionicons color={palette.muted} name="arrow-forward" size={14} style={styles.homeQuickArrow} />
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
    homeScreenContent: { paddingTop: 8, paddingBottom: 14, gap: 9 },
    setupScreenContent: { paddingBottom: 14 },
    setupActionBar: { gap: 7, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
    iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sessionCard: { minHeight: 246, padding: 20, borderRadius: 23, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, justifyContent: 'space-between', overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 24, elevation: 3 },
    homeSessionCard: { minHeight: 0, padding: 15 },
    playCard: { minHeight: 0, padding: 15 },
    orb: { position: 'absolute', width: 148, height: 148, borderRadius: 74, right: -48, top: -58, backgroundColor: palette.accentSoft },
    sessionCopy: { maxWidth: 280, gap: 7 },
    homeSessionCopy: { maxWidth: '100%', gap: 5 },
    homeGoalLabel: { alignSelf: 'flex-start', color: palette.primary, fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase' },
    playSessionCopy: { maxWidth: '100%', gap: 5 },
    playTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
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
    homeQuickGrid: { flexDirection: 'row', gap: 10 },
    homeQuickLink: { flex: 1, minHeight: 90, alignItems: 'flex-start', gap: 3, padding: 11, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    homeQuickIcon: { width: 31, height: 31, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.accentSoft, marginBottom: 1 },
    homeQuickLabel: { color: palette.text, fontSize: 12, fontWeight: '800' },
    homeQuickCaption: { color: palette.muted, fontSize: 9, lineHeight: 12 },
    homeQuickArrow: { position: 'absolute', right: 10, top: 19 },
    primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary, paddingHorizontal: 16, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 2 },
    primaryButtonLabel: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    surface: { padding: 15, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    surfaceTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    secondaryText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    spaceBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    flexShrink: { flex: 1 },
    progressTrack: { height: 5, backgroundColor: palette.soft, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
    progressFill: { height: '100%', backgroundColor: palette.aqua },
    flatList: { borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12 },
    menuRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuRowCompact: { minHeight: 54, gap: 9 },
    menuRowFlat: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, paddingVertical: 11 },
    menuIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    menuIconCompact: { width: 32, height: 32, borderRadius: 10 },
    menuIconAqua: { backgroundColor: palette.aquaSoft },
    menuCopy: { flex: 1 },
    menuLabel: { color: palette.text, fontSize: 14, fontWeight: '700' },
    menuLabelCompact: { fontSize: 12.5 },
    secondaryTextCompact: { fontSize: 9.5, lineHeight: 13, marginTop: 1 },
    tournamentGroup: { gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    tournamentHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    tournamentChoices: { flexDirection: 'row', gap: 8 },
    tournamentChoice: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    tournamentChoiceSaved: { borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    tournamentChoiceCopy: { flex: 1, gap: 2 },
    tournamentChoiceLabel: { color: palette.text, fontSize: 12, fontWeight: '800' },
    tournamentChoiceCaption: { color: palette.muted, fontSize: 9, lineHeight: 12 },
    backHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    backButton: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    backTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
    backSpacer: { width: 36 },
    appearanceOptions: { flexDirection: 'row', gap: 8, marginTop: 14 },
    appearanceOption: { flex: 1, minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    appearanceOptionSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
    appearanceLabel: { color: palette.muted, fontSize: 12, fontWeight: '700' },
    appearanceLabelSelected: { color: palette.primaryText },
    languageSelector: { minHeight: 62, marginTop: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    languageSelectorIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.accentSoft },
    languageModalRoot: { flex: 1, justifyContent: 'flex-end', padding: 14, backgroundColor: palette.scrim },
    languageSheet: { gap: 14, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, borderRadius: 22, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 8 },
    languageSheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 3, backgroundColor: palette.border },
    languageSheetTitle: { color: palette.text, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
    languageOptions: { gap: 7 },
    languageOption: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 11, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    languageOptionSelected: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    languageOptionLabel: { color: palette.text, fontSize: 14, fontWeight: '700' },
    languageRadio: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 2, borderColor: palette.border },
    languageRadioSelected: { borderColor: palette.primary },
    languageRadioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: palette.primary },
    fieldLabel: { color: palette.muted, fontSize: 12, fontWeight: '600', marginBottom: 9 },
    setupGroup: { gap: 18 },
    difficultyOptions: { flexDirection: 'row', gap: 7 },
    difficultyOption: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    difficultyOptionSelected: { borderColor: palette.primary, backgroundColor: palette.primary },
    difficultyLabel: { color: palette.text, fontSize: 12, fontWeight: '700' },
    difficultyLabelSelected: { color: palette.primaryText },
    setupNotice: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
    setupFooter: { color: palette.muted, fontSize: 11, textAlign: 'center' },
    tabs: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 34 },
    tab: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', gap: 3 },
    tabLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    tabLabelSelected: { color: palette.primary },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.42 },
  });
}
