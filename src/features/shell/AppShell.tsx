import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { findLearningActivity, lessons, scenarioTrainer } from '../../domain/learning/content';
import { completedLessonCount, recommendedLearningActivityId } from '../../domain/learning/progress';
import type { LearningActivityDefinition, LearningProgressEntry } from '../../domain/learning/types';
import {
  AI_DIFFICULTY_OPTIONS,
  aiStrategyProfile,
  type AiDifficulty,
} from '../../domain/poker/aiProfiles';
import { coachFocusLabel, summarizeCoachSession } from '../../domain/poker/session';
import { deleteAllHandHistory, loadRecentHandHistory } from '../../services/handHistory';
import { LearnScreen } from '../learn/LearnScreen';
import { ScenarioTrainingModal } from '../learn/ScenarioTrainingModal';
import { useLearningProgress } from '../learn/useLearningProgress';
import { ProgressModal } from '../profile/ProgressModal';
import { PokerTableScreen } from '../table/PokerTableScreen';
import { HandReplayModal } from '../table/HandReplayModal';
import { SessionHistoryModal } from '../table/SessionHistoryModal';
import type { SessionHandRecord } from '../table/sessionModels';
import { type ThemePalette, type ThemePreference, useAppTheme } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type MainTab = 'home' | 'learn' | 'play';
type Screen = MainTab | 'profile' | 'setup' | 'tournaments' | 'table';

export function AppShell() {
  const { palette } = useAppTheme();
  const [screen, setScreen] = useState<Screen>('home');
  const [coachEnabled, setCoachEnabled] = useState(true);
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('club');
  const [playerCount, setPlayerCount] = useState(2);
  const [practiceFocus, setPracticeFocus] = useState<string | null>(null);
  const [scenarioTrainingVisible, setScenarioTrainingVisible] = useState(false);
  const learning = useLearningProgress();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const showTabs = screen === 'home' || screen === 'learn' || screen === 'play';
  const recommendation = findLearningActivity(
    recommendedLearningActivityId(learning.progress, practiceFocus),
  ) ?? lessons[0]!;

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

  if (screen === 'table') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <PokerTableScreen
          aiDifficulty={aiDifficulty}
          coachEnabled={coachEnabled}
          onCoachEnabledChange={setCoachEnabled}
          onExit={() => setScreen('play')}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.app}>
        {screen === 'home' && (
          <HomeScreen
            aiDifficulty={aiDifficulty}
            learningRecommendation={recommendation}
            onOpenProfile={() => setScreen('profile')}
            onQuickPlay={() => setScreen('table')}
            onOpenChampionship={() => setScreen('tournaments')}
            onStartLearning={() => setScreen('learn')}
          />
        )}
        {screen === 'learn' && (
          <LearnScreen
            loading={learning.loading}
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
            onQuickPlay={() => setScreen('table')}
            onOpenSetup={() => setScreen('setup')}
            onOpenScenario={() => setScenarioTrainingVisible(true)}
            onOpenTournaments={() => setScreen('tournaments')}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            learningProgress={learning.progress}
            onBack={() => setScreen('home')}
            onDeleteLearningProgress={learning.clearProgress}
          />
        )}
        {screen === 'setup' && (
          <GameSetupScreen
            aiDifficulty={aiDifficulty}
            coachEnabled={coachEnabled}
            playerCount={playerCount}
            onBack={() => setScreen('play')}
            onAiDifficultyChange={setAiDifficulty}
            onCoachEnabledChange={setCoachEnabled}
            onPlayerCountChange={setPlayerCount}
            onStart={() => setScreen('table')}
          />
        )}
        {screen === 'tournaments' && <TournamentsScreen onBack={() => setScreen('play')} />}
      </View>
      {showTabs && <BottomTabs active={screen} onSelect={setScreen} />}
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

function HomeScreen({
  aiDifficulty,
  learningRecommendation,
  onOpenProfile,
  onQuickPlay,
  onOpenChampionship,
  onStartLearning,
}: {
  aiDifficulty: AiDifficulty;
  learningRecommendation: LearningActivityDefinition;
  onOpenProfile: () => void;
  onQuickPlay: () => void;
  onOpenChampionship: () => void;
  onStartLearning: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScreenScroll>
      <ScreenHeader eyebrow="RiverMind" title="Good evening" onProfile={onOpenProfile} />
      <View style={styles.sessionCard}>
        <View style={styles.orb} />
        <View style={styles.sessionCopy}>
          <View style={styles.timePill}>
            <Ionicons name="time-outline" size={14} color={palette.aquaText} />
            <Text style={styles.timeText}>{learningRecommendation.estimatedMinutes} min</Text>
          </View>
          <Text style={styles.sessionTitle}>{learningRecommendation.title}</Text>
          <Text style={styles.bodyText}>{learningRecommendation.description}</Text>
        </View>
        <PrimaryButton label="Continue learning" onPress={onStartLearning} />
      </View>
      <MenuRow
        icon="play"
        label="Quick Play"
        description={`Heads-up · ${aiStrategyProfile(aiDifficulty).label} AI`}
        onPress={onQuickPlay}
      />
      <MenuRow
        accent="aqua"
        icon="trophy-outline"
        label="Championship"
        description="Local Tables · 42%"
        onPress={onOpenChampionship}
      />
    </ScreenScroll>
  );
}

function PlayScreen({
  aiDifficulty,
  coachEnabled,
  onOpenProfile,
  onQuickPlay,
  onOpenSetup,
  onOpenScenario,
  onOpenTournaments,
}: {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  onOpenProfile: () => void;
  onQuickPlay: () => void;
  onOpenSetup: () => void;
  onOpenScenario: () => void;
  onOpenTournaments: () => void;
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
          <Text style={styles.bodyText}>Heads-up against {aiStrategyProfile(aiDifficulty).label} AI. Coach is {coachEnabled ? 'on' : 'off'}.</Text>
        </View>
        <PrimaryButton label="Play now" onPress={onQuickPlay} />
      </View>
      <View style={styles.flatList}>
        <MenuRow icon="hardware-chip-outline" label="Custom AI game" description="Choose players and coaching" flat onPress={onOpenSetup} />
        <MenuRow accent="aqua" icon="locate-outline" label="Scenario training" description="6 guided spots · immediate coaching" flat onPress={onOpenScenario} />
        <MenuRow icon="trophy-outline" label="Tournaments" description="Sit & Go and Championship" flat onPress={onOpenTournaments} />
      </View>
    </ScreenScroll>
  );
}

function ProfileScreen({
  learningProgress,
  onBack,
  onDeleteLearningProgress,
}: {
  learningProgress: LearningProgressEntry[];
  onBack: () => void;
  onDeleteLearningProgress: () => Promise<void>;
}) {
  const { palette, preference, setPreference } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [savedHands, setSavedHands] = useState<SessionHandRecord[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
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
      'This permanently removes your saved practice sessions, hands, coach reviews, lessons, and drill scores.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void Promise.all([deleteAllHandHistory(), onDeleteLearningProgress()])
              .then(() => setSavedHands([]))
              .catch(() => Alert.alert('Could not delete history', 'Check your connection and try again.'));
          },
        },
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
        <View style={styles.flatList}>
          <MenuRow icon="time-outline" label="Hand history" flat onPress={openHandHistory} />
          <MenuRow accent="aqua" icon="bar-chart-outline" label="Progress and statistics" flat onPress={() => setProgressVisible(true)} />
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
    </>
  );
}

function GameSetupScreen({
  aiDifficulty,
  coachEnabled,
  playerCount,
  onBack,
  onAiDifficultyChange,
  onCoachEnabledChange,
  onPlayerCountChange,
  onStart,
}: {
  aiDifficulty: AiDifficulty;
  coachEnabled: boolean;
  playerCount: number;
  onBack: () => void;
  onAiDifficultyChange: (difficulty: AiDifficulty) => void;
  onCoachEnabledChange: (value: boolean) => void;
  onPlayerCountChange: (value: number) => void;
  onStart: () => void;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScreenScroll>
      <BackHeader title="Custom AI game" onBack={onBack} />
      <View style={styles.surface}>
        <Text style={styles.fieldLabel}>Total players</Text>
        <View style={styles.playerOptions}>
          {[2, 3, 6, 9].map((count) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: count === playerCount }}
              key={count}
              onPress={() => onPlayerCountChange(count)}
              style={[styles.playerOption, count === playerCount && styles.playerOptionSelected]}
            >
              <Text style={[styles.playerOptionLabel, count === playerCount && styles.playerOptionLabelSelected]}>{count}</Text>
            </Pressable>
          ))}
        </View>
        {playerCount !== 2 && (
          <Text style={styles.setupNotice}>The first build starts heads-up. {playerCount}-player support is planned next.</Text>
        )}
      </View>
      <View style={[styles.surface, styles.spaceBetween]}>
        <View style={styles.flexShrink}>
          <Text style={styles.surfaceTitle}>Coach</Text>
          <Text style={styles.secondaryText}>Hints available during play</Text>
        </View>
        <Switch
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
      <PrimaryButton disabled={playerCount !== 2} label="Start game" onPress={onStart} />
      <Text style={styles.setupFooter}>100 BB · {aiStrategyProfile(aiDifficulty).label} AI · play chips</Text>
    </ScreenScroll>
  );
}

function TournamentsScreen({ onBack }: { onBack: () => void }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <ScreenScroll>
      <BackHeader title="Tournaments" onBack={onBack} />
      <View style={[styles.sessionCard, styles.playCard]}>
        <View style={styles.orb} />
        <View style={styles.sessionCopy}>
          <Text style={styles.eyebrow}>RiverMind Championship</Text>
          <Text style={styles.sessionTitle}>Local Tables</Text>
          <Text style={styles.bodyText}>Finish two more events to reach the City Circuit.</Text>
        </View>
        <PrimaryButton disabled label="Coming soon" />
      </View>
      <View style={styles.flatList}>
        <MenuRow icon="people-outline" label="Sit & Go" description="3, 6 or 9 players" flat />
        <MenuRow accent="aqua" icon="calendar-outline" label="Daily tournament" description="The same challenge for everyone" flat />
      </View>
    </ScreenScroll>
  );
}

function ScreenHeader({ eyebrow, title, onProfile }: { eyebrow: string; title: string; onProfile: () => void }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
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
      <Text style={styles.backTitle}>{title}</Text>
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
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [...style, pressed && styles.pressed]}>
      {content}
    </Pressable>
  ) : <View style={style}>{content}</View>;
}

function PrimaryButton({ disabled = false, label, onPress }: { disabled?: boolean; label: string; onPress?: () => void }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityRole="button"
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  const tabs: Array<{ key: MainTab; label: string; activeIcon: IconName; icon: IconName }> = [
    { key: 'home', label: 'Home', activeIcon: 'home', icon: 'home-outline' },
    { key: 'learn', label: 'Learn', activeIcon: 'school', icon: 'school-outline' },
    { key: 'play', label: 'Play', activeIcon: 'game-controller', icon: 'game-controller-outline' },
  ];
  return (
    <View style={styles.tabs}>
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <Pressable
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
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
    iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    sessionCard: { minHeight: 228, padding: 20, borderRadius: 23, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, justifyContent: 'space-between', overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.09, shadowRadius: 24, elevation: 3 },
    playCard: { minHeight: 198 },
    orb: { position: 'absolute', width: 148, height: 148, borderRadius: 74, right: -48, top: -58, backgroundColor: palette.accentSoft },
    sessionCopy: { maxWidth: 280, gap: 7 },
    timePill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: palette.aquaSoft },
    timeText: { color: palette.aquaText, fontSize: 11, fontWeight: '700' },
    sessionTitle: { color: palette.text, fontSize: 21, lineHeight: 27, fontWeight: '700', letterSpacing: -0.35 },
    bodyText: { color: palette.muted, fontSize: 13, lineHeight: 19 },
    primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.primary, paddingHorizontal: 16, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 7 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 2 },
    primaryButtonLabel: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    surface: { padding: 15, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    surfaceTitle: { color: palette.text, fontSize: 15, fontWeight: '700' },
    secondaryText: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
    spaceBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
    flexShrink: { flex: 1 },
    progressTrack: { height: 5, backgroundColor: palette.soft, borderRadius: 4, overflow: 'hidden', marginTop: 12 },
    progressFill: { width: '42%', height: '100%', backgroundColor: palette.aqua },
    flatList: { borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 12 },
    menuRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuRowFlat: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border, paddingVertical: 11 },
    menuIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    menuIconAqua: { backgroundColor: palette.aquaSoft },
    menuCopy: { flex: 1 },
    menuLabel: { color: palette.text, fontSize: 14, fontWeight: '700' },
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
    playerOptions: { flexDirection: 'row', gap: 8 },
    playerOption: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.border },
    playerOptionSelected: { backgroundColor: palette.primary, borderColor: palette.primary },
    playerOptionLabel: { color: palette.text, fontSize: 14, fontWeight: '700' },
    playerOptionLabelSelected: { color: palette.primaryText },
    difficultyOptions: { flexDirection: 'row', gap: 7 },
    difficultyOption: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.soft },
    difficultyOptionSelected: { borderColor: palette.primary, backgroundColor: palette.primary },
    difficultyLabel: { color: palette.text, fontSize: 12, fontWeight: '700' },
    difficultyLabelSelected: { color: palette.primaryText },
    setupNotice: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
    setupFooter: { color: palette.muted, fontSize: 11, textAlign: 'center' },
    tabs: { height: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border, backgroundColor: palette.surface, paddingHorizontal: 34 },
    tab: { flex: 1, height: 58, alignItems: 'center', justifyContent: 'center', gap: 3 },
    tabLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    tabLabelSelected: { color: palette.primary },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    disabled: { opacity: 0.42 },
  });
}
