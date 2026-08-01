import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppState,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { findLearningActivity, lessons, scenarioTrainer } from '../../domain/learning/content';
import {
  completedLessonCount,
  learningActivityIdForFocus,
  recommendedLearningActivityId,
} from '../../domain/learning/progress';
import type { LearningActivityDefinition, LearningProgressEntry } from '../../domain/learning/types';
import {
  AI_DIFFICULTY_OPTIONS,
  aiStrategyProfile,
  type AiDifficulty,
} from '../../domain/poker/aiProfiles';
import {
  coachFocusLabel,
  DEFAULT_CUSTOM_SESSION_CONFIG,
  QUICK_PLAY_SESSION_CONFIG,
  SESSION_HAND_TARGET_OPTIONS,
  sessionHandTargetLabel,
  STARTING_STACK_OPTIONS,
  summarizeCoachSession,
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
  championshipCurrentEvent,
  championshipEvent,
  championshipEventIsUnlocked,
  championshipIsComplete,
  championshipQualifiedCount,
  createChampionshipCheckpoint,
  type ChampionshipCheckpoint,
  type ChampionshipEvent,
  type ChampionshipEventId,
  type ChampionshipProgress,
  type ChampionshipResult,
} from '../../domain/poker/championship';
import type { SitAndGoCheckpoint, SitAndGoPlayerCount } from '../../domain/poker/tournament';
import { deleteAllHandHistory, loadRecentHandHistory } from '../../services/handHistory';
import {
  loadOpponentMemory,
  resetOpponentMemory,
  saveOpponentMemory,
} from '../../services/opponentMemory';
import { completeOnboarding, shouldShowOnboarding } from '../../services/onboarding';
import { LearnScreen } from '../learn/LearnScreen';
import { ScenarioTrainingModal } from '../learn/ScenarioTrainingModal';
import { useLearningProgress } from '../learn/useLearningProgress';
import { ProgressModal } from '../profile/ProgressModal';
import { PokerTableScreen } from '../table/PokerTableScreen';
import { MultiwayPokerTableScreen } from '../table/MultiwayPokerTableScreen';
import { HandReplayModal } from '../table/HandReplayModal';
import { SessionHistoryModal } from '../table/SessionHistoryModal';
import type { SessionHandRecord } from '../table/sessionModels';
import { type ThemePalette, type ThemePreference, useAppTheme } from '../../theme';
import { BetaInfoModal } from './BetaInfoModal';
import { BetaFeedbackModal } from './BetaFeedbackModal';
import { FirstRunOnboardingModal } from './FirstRunOnboardingModal';
import { ChampionshipModal } from './ChampionshipModal';
import { OpponentReadCard } from '../../components/OpponentReadCard';
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
type TableMode = 'practice' | 'sit_and_go' | 'daily_challenge' | 'championship';

export function AppShell() {
  const { palette } = useAppTheme();
  const [screen, setScreen] = useState<Screen>('home');
  const [tableReturnScreen, setTableReturnScreen] = useState<Exclude<Screen, 'table'>>('play');
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('club');
  const [customSessionConfig, setCustomSessionConfig] = useState<PracticeSessionConfig>(DEFAULT_CUSTOM_SESSION_CONFIG);
  const [activeSessionConfig, setActiveSessionConfig] = useState<PracticeSessionConfig>(QUICK_PLAY_SESSION_CONFIG);
  const [customPlayerCount, setCustomPlayerCount] = useState<TablePlayerCount>(3);
  const [activePlayerCount, setActivePlayerCount] = useState<TablePlayerCount>(2);
  const [activeTableMode, setActiveTableMode] = useState<TableMode>('practice');
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
  const [practiceFocus, setPracticeFocus] = useState<string | null>(null);
  const [learningLaunchActivityId, setLearningLaunchActivityId] = useState<string | null>(null);
  const [learningLaunchSheetId, setLearningLaunchSheetId] = useState<string | null>(null);
  const [scenarioTrainingVisible, setScenarioTrainingVisible] = useState(false);
  const [onboardingVisible, setOnboardingVisible] = useState(shouldShowOnboarding);
  const [opponentMemory, setOpponentMemory] = useState(loadOpponentMemory);
  const learning = useLearningProgress();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const showTabs = screen === 'home' || screen === 'learn' || screen === 'play';
  const recommendation = findLearningActivity(
    recommendedLearningActivityId(learning.progress, practiceFocus),
  ) ?? lessons[0]!;
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
      `Saved ${playerCount}-player Sit & Go`,
      `Continue at hand ${checkpoint.nextHandNumber}, or start again with fresh stacks and a new dealer?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start new', style: 'destructive', onPress: () => beginTournament(playerCount, null) },
        { text: 'Continue', onPress: () => beginTournament(playerCount, checkpoint) },
      ],
    );
  }, [beginTournament, tournamentCheckpoints]);
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
      'Saved Daily Challenge',
      `Continue at hand ${dailyCheckpoint.tournament.nextHandNumber}, or restart today's same table from hand 1?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Restart', style: 'destructive', onPress: () => beginDailyChallenge(null) },
        { text: 'Continue', onPress: () => beginDailyChallenge(dailyCheckpoint) },
      ],
    );
  }, [beginDailyChallenge, dailyCheckpoint]);
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
        `Saved ${event.title}`,
        `Continue at hand ${championshipCheckpoint.tournament.nextHandNumber}, or restart this event with fresh stacks and cards?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restart', style: 'destructive', onPress: () => beginChampionship(event, null) },
          { text: 'Continue', onPress: () => beginChampionship(event, championshipCheckpoint) },
        ],
      );
      return;
    }
    const savedEvent = championshipEvent(championshipCheckpoint.eventId);
    Alert.alert(
      `Start ${event.title}?`,
      `This replaces your saved ${savedEvent.title} run at hand ${championshipCheckpoint.tournament.nextHandNumber}. Completed results stay saved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace run', style: 'destructive', onPress: () => beginChampionship(event, null) },
      ],
    );
  }, [beginChampionship, championshipCheckpoint, championshipProgress]);
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
  const practiceCoachFocus = useCallback((focus: Exclude<CoachFocusArea, 'none'>) => {
    setPracticeFocus(focus);
    setLearningLaunchActivityId(
      learningActivityIdForFocus(focus)
      ?? recommendedLearningActivityId(learning.progress),
    );
    setScreen('learn');
  }, [learning.progress]);
  const continueLearning = useCallback(() => {
    setLearningLaunchActivityId(recommendation.id);
    setScreen('learn');
  }, [recommendation.id]);
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
      const reviews = hands.flatMap((hand) => hand.coachResult ? [hand.coachResult.review] : []);
      setPracticeFocus(summarizeCoachSession(reviews).topFocusArea);
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
      return (
        <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
          <MultiwayPokerTableScreen
            aiDifficulty={aiDifficulty}
            coachEnabled={coachEnabled}
            onChangeSetup={() => {
              if (championshipMode) leaveChampionshipTable();
              else setScreen(activeTableMode === 'practice' ? 'setup' : 'play');
            }}
            onCoachEnabledChange={setCoachEnabled}
            onExit={() => {
              if (championshipMode) leaveChampionshipTable();
              else setScreen(tableReturnScreen);
            }}
            onHeroHandObserved={observeHeroHand}
            opponentMemory={opponentMemory}
            playerCount={activePlayerCount}
            sessionConfig={activeSessionConfig}
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
          onFocusIdentified={setPracticeFocus}
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
            learningRecommendation={recommendation}
            onHandRankings={openHandRankings}
            onOpenProfile={() => setScreen('profile')}
            onQuickPlay={startQuickPlay}
            onScenario={() => setScenarioTrainingVisible(true)}
            onStartLearning={continueLearning}
            scenarioBestScore={learning.progress.find((entry) => entry.activityId === scenarioTrainer.id)?.bestScore ?? null}
            dailyCaption={dailyChallengeCaption(today, dailyCheckpoint, dailyProgress)}
            onDailyChallenge={openDailyChallenge}
            championshipCaption={championshipCaption(championshipProgress, championshipCheckpoint)}
            onChampionship={() => setChampionshipVisible(true)}
          />
        )}
        {screen === 'learn' && (
          <LearnScreen
            launchActivityId={learningLaunchActivityId}
            launchSheetId={learningLaunchSheetId}
            loading={learning.loading}
            onLaunchActivityHandled={() => setLearningLaunchActivityId(null)}
            onLaunchSheetHandled={() => setLearningLaunchSheetId(null)}
            onOpenProfile={() => setScreen('profile')}
            onRecordResult={learning.recordResult}
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
            championshipCaption={championshipCaption(championshipProgress, championshipCheckpoint)}
            onChampionship={() => setChampionshipVisible(true)}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
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
        onSelectEvent={openChampionshipEvent}
        progress={championshipProgress}
        visible={championshipVisible}
      />
      <ScenarioTrainingModal
        bestScore={learning.progress.find((entry) => entry.activityId === scenarioTrainer.id)?.bestScore ?? null}
        onClose={() => setScenarioTrainingVisible(false)}
        onComplete={(trainer, score) => learning.recordResult({
          activityId: trainer.id,
          activityType: trainer.type,
          completed: true,
          score,
          countAttempt: true,
        })}
        visible={scenarioTrainingVisible}
      />
      <FirstRunOnboardingModal
        onComplete={() => {
          completeOnboarding();
          setOnboardingVisible(false);
        }}
        visible={onboardingVisible}
      />
    </SafeAreaView>
  );
}
function ScreenScroll({ children }: { children: ReactNode }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScrollView
      contentContainerStyle={styles.screenContent}
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
): string {
  if (checkpoint) {
    const event = championshipEvent(checkpoint.eventId);
    return `${event.title} · continue hand ${checkpoint.tournament.nextHandNumber}`;
  }
  const qualified = championshipQualifiedCount(progress);
  if (championshipIsComplete(progress)) return `Tour complete · ${qualified}/5 qualified`;
  return `${championshipCurrentEvent(progress).title} · ${qualified}/5 qualified`;
}

function dailyChallengeCaption(
  today: string,
  checkpoint: DailyChallengeCheckpoint | null,
  progress: readonly DailyChallengeProgress[],
): string {
  if (checkpoint) return `Continue hand ${checkpoint.tournament.nextHandNumber} · coaching off`;
  const todayResult = progress.find((entry) => entry.challengeDate === today);
  if (todayResult) return `Today · ${ordinal(todayResult.bestPlace)} · ${todayResult.bestScore} points`;
  const streak = dailyChallengeStreak(progress.map((entry) => entry.challengeDate), today);
  return streak > 0
    ? `${streak}-day streak · play today's table`
    : 'Same table for everyone · coaching off';
}

function HomeScreen({
  aiDifficulty,
  championshipCaption,
  completedLessons,
  dailyCaption,
  learningRecommendation,
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
  learningRecommendation: LearningActivityDefinition;
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScreenScroll>
      <ScreenHeader eyebrow="RiverMind · Beta" title="Good evening" onProfile={onOpenProfile} />
      <View style={styles.sessionCard}>
        <View style={styles.orb} />
        <View style={styles.sessionCopy}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={14} color={palette.aquaText} />
            <Text style={styles.timeText}>{learningRecommendation.estimatedMinutes} min</Text>
          </View>
          <Text style={styles.sessionTitle}>{learningRecommendation.title}</Text>
          <Text style={styles.bodyText}>{learningRecommendation.description}</Text>
          <View style={styles.homeProgressHeader}>
            <Text style={styles.homeProgressLabel}>Learning path</Text>
            <Text style={styles.homeProgressValue}>{completedLessons}/{lessons.length} lessons</Text>
          </View>
          <View
            accessibilityLabel={`Learning path ${Math.round((completedLessons / lessons.length) * 100)}% complete`}
            accessibilityRole="progressbar"
            style={styles.progressTrack}
          >
            <View style={[styles.progressFill, { width: `${Math.round((completedLessons / lessons.length) * 100)}%` }]} />
          </View>
        </View>
        <PrimaryButton label="Continue learning" onPress={onStartLearning} />
      </View>
      <Text accessibilityRole="header" style={styles.homeSectionTitle}>Quick start</Text>
      <MenuRow
        icon="trophy-outline"
        label="RiverMind Championship"
        description={championshipCaption}
        onPress={onChampionship}
      />
      <MenuRow
        accent="aqua"
        icon="today-outline"
        label="Daily Challenge"
        description={dailyCaption}
        onPress={onDailyChallenge}
      />
      <MenuRow
        icon="play"
        label="Quick Play"
        description={`1 hand · 100 BB · ${aiStrategyProfile(aiDifficulty).label} AI`}
        onPress={onQuickPlay}
      />
      <View style={styles.homeQuickGrid}>
        <HomeQuickLink
          accent="aqua"
          caption={scenarioBestScore === null ? '6 fresh spots' : `Best · ${scenarioBestScore}%`}
          icon="locate-outline"
          label="Scenario drill"
          onPress={onScenario}
        />
        <HomeQuickLink
          caption="Examples + odds"
          icon="albums-outline"
          label="Hand rankings"
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScreenScroll>
      <ScreenHeader eyebrow="Choose a game" title="Play" onProfile={onOpenProfile} />
      <View style={[styles.sessionCard, styles.playCard]}>
        <View style={styles.orb} />
        <View style={styles.sessionCopy}>
          <View style={styles.timePill}>
            <Ionicons name="sparkles-outline" size={14} color={palette.aquaText} />
            <Text style={styles.timeText}>Recommended</Text>
          </View>
          <Text style={styles.sessionTitle}>Quick Play</Text>
          <Text style={styles.bodyText}>One 100 BB hand against {aiStrategyProfile(aiDifficulty).label} AI. Coach is {coachEnabled ? 'on' : 'off'}.</Text>
        </View>
        <PrimaryButton label="Play now" onPress={onQuickPlay} />
      </View>
      <View style={styles.flatList}>
        <MenuRow
          icon="trophy-outline"
          label="RiverMind Championship"
          description={championshipCaption}
          flat
          onPress={onChampionship}
        />
        <MenuRow
          accent="aqua"
          icon="today-outline"
          label="Daily Challenge"
          description={dailyCheckpoint
            ? `Saved at hand ${dailyCheckpoint.tournament.nextHandNumber} · coaching off`
            : dailyProgress
              ? `${ordinal(dailyProgress.bestPlace)} · ${dailyProgress.bestScore} points · ${dailyProgress.attempts} ${dailyProgress.attempts === 1 ? 'attempt' : 'attempts'}`
              : `${dailyChallengeDisplayDate(dailyChallengeDate)} · same table for everyone · coaching off`}
          flat
          onPress={onDailyChallenge}
        />
        <TournamentChoiceRow
          checkpoints={tournamentCheckpoints}
          onSelect={onTournament}
        />
        <MenuRow icon="hardware-chip-outline" label="Custom AI game" description="Choose stack, length, difficulty, and coaching" flat onPress={onOpenSetup} />
        <MenuRow accent="aqua" icon="locate-outline" label="Scenario training" description="6 fresh spots · recalculated coaching" flat onPress={onOpenScenario} />
      </View>
    </ScreenScroll>
  );
}

function ProfileScreen({
  learningProgress,
  onBack,
  onDeleteChampionshipProgress,
  onDeleteDailyChallengeProgress,
  onDeleteLearningProgress,
  onResetOpponentMemory,
  opponentMemory,
}: {
  learningProgress: LearningProgressEntry[];
  onBack: () => void;
  onDeleteChampionshipProgress: () => void;
  onDeleteDailyChallengeProgress: () => Promise<void>;
  onDeleteLearningProgress: () => Promise<void>;
  onResetOpponentMemory: () => void;
  opponentMemory: OpponentMemory;
}) {
  const { palette, preference, setPreference } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [savedHands, setSavedHands] = useState<SessionHandRecord[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [betaInfoVisible, setBetaInfoVisible] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [replayHand, setReplayHand] = useState<SessionHandRecord | null>(null);
  const reviews = savedHands.flatMap((hand) => hand.coachResult ? [hand.coachResult.review] : []);
  const stats = summarizeCoachSession(reviews);
  const completedLessons = completedLessonCount(learningProgress);
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
      'Delete saved history?',
      'This permanently removes your saved practice sessions, hands, coach reviews, lessons, drills, Daily Challenge results, and Championship progress.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            onDeleteChampionshipProgress();
            void Promise.all([deleteAllHandHistory(), onDeleteLearningProgress(), onDeleteDailyChallengeProgress()])
              .then(() => setSavedHands([]))
              .catch(() => Alert.alert('Could not delete history', 'Check your connection and try again.'));
          },
        },
      ],
    );
  };
  const confirmResetOpponentMemory = () => {
    Alert.alert(
      'Reset opponent learning?',
      'AI opponents will forget the public tendencies they learned from your play. Your hands and lesson progress will stay saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: onResetOpponentMemory },
      ],
    );
  };
  return (
    <>
      <ScreenScroll>
        <BackHeader title="Profile & settings" onBack={onBack} />
        <View style={styles.surface}>
          <Text style={styles.surfaceTitle}>Appearance</Text>
          <Text style={styles.secondaryText}>Choose how RiverMind looks on this device.</Text>
          <View style={styles.appearanceOptions}>
            {(['system', 'light', 'dark'] as ThemePreference[]).map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: preference === option }}
                key={option}
                onPress={() => setPreference(option)}
                style={[styles.appearanceOption, preference === option && styles.appearanceOptionSelected]}
              >
                <Ionicons
                  color={preference === option ? palette.primaryText : palette.muted}
                  name={option === 'system' ? 'phone-portrait-outline' : option === 'light' ? 'sunny-outline' : 'moon-outline'}
                  size={19}
                />
                <Text style={[styles.appearanceLabel, preference === option && styles.appearanceLabelSelected]}>
                  {option[0]?.toUpperCase()}{option.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.surface}>
          <Text style={styles.surfaceTitle}>{savedHands.length} saved hands · {completedLessons}/{lessons.length} lessons</Text>
          <Text style={styles.secondaryText}>
            {stats.topFocusArea ? `Recommended focus · ${coachFocusLabel(stats.topFocusArea)}` : 'Review hands to build a personalized focus.'}
          </Text>
        </View>
        <OpponentReadCard memory={opponentMemory} onReset={confirmResetOpponentMemory} privacyNote />
        <View style={styles.flatList}>
          <MenuRow icon="time-outline" label="Hand history" flat onPress={openHandHistory} />
          <MenuRow accent="aqua" icon="bar-chart-outline" label="Progress and statistics" flat onPress={() => setProgressVisible(true)} />
          <MenuRow icon="chatbubble-ellipses-outline" label="Send beta feedback" description="Report a bug or share an idea" flat onPress={() => setFeedbackVisible(true)} />
          <MenuRow icon="information-circle-outline" label="Beta & privacy" flat onPress={() => setBetaInfoVisible(true)} />
          <MenuRow icon="trash-outline" label="Delete saved history" flat onPress={confirmDeleteHistory} />
        </View>
      </ScreenScroll>
      <SessionHistoryModal
        hands={savedHands}
        onClose={() => setHistoryVisible(false)}
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
    </>
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
  playerCount,
  sessionConfig,
}: {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onBack: () => void;
  onAiDifficultyChange: (difficulty: AiDifficulty) => void;
  onCoachEnabledChange: (value: boolean) => void;
  onSessionConfigChange: (config: PracticeSessionConfig) => void;
  onPlayerCountChange: (count: TablePlayerCount) => void;
  onStart: () => void;
  playerCount: TablePlayerCount;
  sessionConfig: PracticeSessionConfig;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.screenContent, styles.setupScreenContent]}
        showsVerticalScrollIndicator={false}
      >
        <BackHeader title="Custom AI game" onBack={onBack} />
        <View style={styles.surface}>
          <Text style={styles.surfaceTitle}>{playerCount === 2 ? 'Heads-up practice' : `${playerCount}-player AI table`}</Text>
          <Text style={styles.secondaryText}>
            {playerCount === 2
              ? 'You and one AI opponent play a focused session with practice chips.'
              : `You face ${playerCount - 1} distinct AI opponents on one private practice table.`}
          </Text>
        </View>
        <View style={[styles.surface, styles.setupGroup]}>
          <View>
            <Text style={styles.fieldLabel}>Table size</Text>
            <View style={styles.difficultyOptions}>
              {TABLE_PLAYER_COUNT_OPTIONS.map((count) => {
                const selected = playerCount === count;
                return (
                  <Pressable
                    accessibilityLabel={`${count} total players`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={count}
                    onPress={() => onPlayerCountChange(count)}
                    style={[styles.difficultyOption, selected && styles.difficultyOptionSelected]}
                  >
                    <Text style={[styles.difficultyLabel, selected && styles.difficultyLabelSelected]}>{count} players</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.setupNotice}>Every opponent has private cards, acts independently, and gradually learns only from your visible choices. No shared-device play.</Text>
          </View>
          <View>
            <Text style={styles.fieldLabel}>Starting stack</Text>
            <View style={styles.difficultyOptions}>
              {STARTING_STACK_OPTIONS.map((stackBb) => {
                const selected = sessionConfig.startingStackBb === stackBb;
                return (
                  <Pressable
                    accessibilityLabel={`${stackBb} big blind starting stack`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={stackBb}
                    onPress={() => onSessionConfigChange({ ...sessionConfig, startingStackBb: stackBb })}
                    style={[styles.difficultyOption, selected && styles.difficultyOptionSelected]}
                  >
                    <Text style={[styles.difficultyLabel, selected && styles.difficultyLabelSelected]}>{stackBb} BB</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={styles.fieldLabel}>Session length</Text>
            <View style={styles.difficultyOptions}>
              {SESSION_HAND_TARGET_OPTIONS.map((target) => {
                const selected = sessionConfig.handTarget === target;
                const label = target === 'open' ? 'Open' : String(target);
                return (
                  <Pressable
                    accessibilityLabel={sessionHandTargetLabel(target)}
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
            <Text style={styles.setupNotice}>Choose a fixed target or keep playing until a stack is below one big blind.</Text>
          </View>
        </View>
        <View style={[styles.surface, styles.spaceBetween]}>
          <View style={styles.flexShrink}>
            <Text style={styles.surfaceTitle}>Coach</Text>
            <Text style={styles.secondaryText}>Hints available during play</Text>
          </View>
          <Switch
            accessibilityLabel="Show coaching insights"
            onValueChange={onCoachEnabledChange}
            trackColor={{ false: palette.soft, true: palette.primary }}
            thumbColor={palette.surface}
            value={coachEnabled}
          />
        </View>
        <View style={styles.surface}>
          <Text style={styles.fieldLabel}>Opponent difficulty</Text>
          <View style={styles.difficultyOptions}>
            {AI_DIFFICULTY_OPTIONS.map((profile) => (
              <Pressable
                accessibilityLabel={`${profile.label} opponent difficulty`}
                accessibilityRole="button"
                accessibilityState={{ selected: profile.id === aiDifficulty }}
                key={profile.id}
                onPress={() => onAiDifficultyChange(profile.id)}
                style={[styles.difficultyOption, profile.id === aiDifficulty && styles.difficultyOptionSelected]}
              >
                <Text style={[styles.difficultyLabel, profile.id === aiDifficulty && styles.difficultyLabelSelected]}>{profile.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.setupNotice}>{aiStrategyProfile(aiDifficulty).summary}</Text>
        </View>
      </ScrollView>
      <View style={styles.setupActionBar}>
        <PrimaryButton label="Start game" onPress={onStart} />
        <Text style={styles.setupFooter}>
          {playerCount} players · {sessionConfig.startingStackBb} BB · {sessionHandTargetLabel(sessionConfig.handTarget)} · {aiStrategyProfile(aiDifficulty).label} AI
        </Text>
      </View>
    </View>
  );
}

function ScreenHeader({ eyebrow, title, onProfile }: { eyebrow: string; title: string; onProfile: () => void }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      <Pressable accessibilityLabel="Open profile" accessibilityRole="button" onPress={onProfile} style={styles.iconButton}>
        <Ionicons color={palette.text} name="person-outline" size={19} />
      </Pressable>
    </View>
  );
}

function BackHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.backHeader}>
      <Pressable accessibilityLabel="Go back" accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Ionicons color={palette.text} name="arrow-back" size={19} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.backTitle}>{title}</Text>
      <View style={styles.backSpacer} />
    </View>
  );
}

function MenuRow({
  accent = 'indigo',
  description,
  flat = false,
  icon,
  label,
  onPress,
}: {
  accent?: 'indigo' | 'aqua';
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
      <View style={[styles.menuIcon, accent === 'aqua' && styles.menuIconAqua]}>
        <Ionicons color={accent === 'aqua' ? palette.aqua : palette.primary} name={icon} size={19} />
      </View>
      <View style={styles.menuCopy}>
        <Text style={styles.menuLabel}>{label}</Text>
        {description && <Text style={styles.secondaryText}>{description}</Text>}
      </View>
      <Ionicons color={palette.muted} name="chevron-forward" size={18} />
    </>
  );
  const style: ViewStyle[] = [styles.menuRow, flat ? styles.menuRowFlat : styles.surface];
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.tournamentGroup}>
      <View style={styles.tournamentHeader}>
        <View style={[styles.menuIcon, styles.menuIconAqua]}>
          <Ionicons color={palette.aqua} name="trophy-outline" size={19} />
        </View>
        <View style={styles.menuCopy}>
          <Text style={styles.menuLabel}>Sit & Go</Text>
          <Text style={styles.secondaryText}>60 BB · rising blinds · one winner</Text>
        </View>
      </View>
      <View style={styles.tournamentChoices}>
        {([3, 6] as const).map((playerCount) => {
          const checkpoint = checkpoints[playerCount];
          return (
            <Pressable
              accessibilityLabel={`${playerCount}-player Sit and Go. ${checkpoint ? `Continue at hand ${checkpoint.nextHandNumber}` : 'Start new tournament'}`}
              accessibilityRole="button"
              key={playerCount}
              onPress={() => onSelect(playerCount)}
              style={({ pressed }) => [styles.tournamentChoice, checkpoint && styles.tournamentChoiceSaved, pressed && styles.pressed]}
            >
              <View style={styles.tournamentChoiceCopy}>
                <Text style={styles.tournamentChoiceLabel}>{playerCount} players</Text>
                <Text numberOfLines={1} style={styles.tournamentChoiceCaption}>
                  {checkpoint ? `Hand ${checkpoint.nextHandNumber} saved` : playerCount === 3 ? 'Quick table' : 'Full table'}
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
      <Ionicons color={palette.muted} name="arrow-forward" size={15} />
    </Pressable>
  );
}

function BottomTabs({ active, onSelect }: { active: MainTab; onSelect: (tab: MainTab) => void }) {
  const { palette } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const tabs: Array<{ key: MainTab; label: string; activeIcon: IconName; icon: IconName }> = [
    { key: 'home', label: 'Home', activeIcon: 'home', icon: 'home-outline' },
    { key: 'learn', label: 'Learn', activeIcon: 'school', icon: 'school-outline' },
    { key: 'play', label: 'Play', activeIcon: 'game-controller', icon: 'game-controller-outline' },
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
    setupScreenContent: { paddingBottom: 14 },
    setupActionBar: { gap: 7, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
    iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sessionCard: { minHeight: 246, padding: 20, borderRadius: 23, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, justifyContent: 'space-between', overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 24, elevation: 3 },
    playCard: { minHeight: 198 },
    orb: { position: 'absolute', width: 148, height: 148, borderRadius: 74, right: -48, top: -58, backgroundColor: palette.accentSoft },
    sessionCopy: { maxWidth: 280, gap: 7 },
    timePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: palette.aquaSoft },
    timeText: { color: palette.aquaText, fontSize: 11, fontWeight: '700' },
    sessionTitle: { color: palette.text, fontSize: 21, lineHeight: 27, fontWeight: '700', letterSpacing: -0.35 },
    bodyText: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    homeProgressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 6 },
    homeProgressLabel: { color: palette.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    homeProgressValue: { color: palette.aquaText, fontSize: 10, fontWeight: '800' },
    homeSectionTitle: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 4, paddingHorizontal: 2 },
    homeQuickGrid: { flexDirection: 'row', gap: 10 },
    homeQuickLink: { flex: 1, minHeight: 132, alignItems: 'flex-start', gap: 6, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    homeQuickIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft, marginBottom: 2 },
    homeQuickLabel: { color: palette.text, fontSize: 13, fontWeight: '800' },
    homeQuickCaption: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 14 },
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
    menuRowFlat: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, paddingVertical: 11 },
    menuIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    menuIconAqua: { backgroundColor: palette.aquaSoft },
    menuCopy: { flex: 1 },
    menuLabel: { color: palette.text, fontSize: 14, fontWeight: '700' },
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
