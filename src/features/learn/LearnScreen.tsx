import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { HostInstance } from 'react-native';

import {
  buildAdaptiveMasterySnapshot,
  type AdaptiveMasterySnapshot,
  type ChapterMasterySnapshot,
  type WeeklyLearningSnapshot,
} from '../../domain/learning/adaptiveMastery';
import type { AdaptiveLearningRecommendation } from '../../domain/learning/adaptiveRecommendation';
import {
  completedCurriculumStepCount,
  curriculumSteps,
  curriculumStepsForChapter,
  type CurriculumChapterId,
  type CurriculumStep,
} from '../../domain/learning/curriculum';
import type { LearningSessionInput, LearningSessionRecord } from '../../domain/learning/history';
import {
  guidedLearningContext,
  latestLearningSnapshot,
  learningCheckpointStatus,
  learningProgressComparison,
  type LearningGoalId,
  type LearningProfile,
} from '../../domain/learning/guidedProgress';
import { expandCheatsheetCollection, shouldFocusCollection, type LearnChapterId } from '../../domain/learning/cheatSheetLaunch';
import {
  buildPersonalPracticePlan,
  type PersonalPracticePlanItem,
} from '../../domain/learning/personalPracticePlan';
import {
  buildLearningProgressInsights,
  type LearningProgressInsights,
} from '../../domain/learning/progressInsights';
import {
  advancedMathCheatSheet,
  advancedMathLessons,
  cheatSheets,
  findLearningActivity,
  fundamentalsLessons,
  handQuiz,
  intermediatePostflopLessons,
  intermediatePreflopLessons,
  intermediateRiverLessons,
  lessons,
  opponentReadLessons,
  percentageTrainer,
  postflopFoundationsLessons,
  postflopMasteryCheck,
  preflopMasteryCheck,
  preflopStrategyLessons,
  scenarioTrainer,
  tournamentFoundationsLessons,
  tournamentBubbleLessons,
} from '../../domain/learning/content';
import {
  advancedMathPracticePacks,
  intermediatePostflopPracticePacks,
  intermediatePreflopPracticePacks,
  intermediateRiverPracticePacks,
  opponentPracticePacks,
  postflopPracticePacks,
  practicePackById,
  practicePackForFocus,
  preflopPracticePacks,
  reviewFocusAreaForScenario,
  tournamentPracticePacks,
} from '../../domain/learning/practicePacks';
import {
  learningProgressById,
  recommendedLearningActivityId,
} from '../../domain/learning/progress';
import {
  selectDailyLearningReviewItems,
  type LearningReviewCapture,
  type LearningReviewItem,
  type LearningReviewOutcome,
} from '../../domain/learning/reviewQueue';
import { generateFocusedScenarioSessionFromRandom } from '../../domain/learning/scenarios';
import {
  opponentTableMissions,
  postflopTableMissions,
  preflopTableMissions,
  tournamentTableMissions,
  type TableMissionDefinition,
  type TableMissionId,
} from '../../domain/learning/tableMissions';
import type {
  CheatSheetDefinition,
  LearningActivityDefinition,
  LearningProgressEntry,
  LearningResultInput,
  LessonDefinition,
  PracticePackId,
  ScenarioAttemptReview,
  ScenarioSpot,
  ScenarioTrainerDefinition,
  TrainerAttemptReview,
  TrainerDefinition,
  TrainerQuestion,
} from '../../domain/learning/types';
import type { CoachFocusArea } from '../../domain/poker/types';
import { useLocalization } from '../../localization';
import type { MessageKey } from '../../localization/messages';
import { secureRandom } from '../../services/secureRandom';
import { type ThemePalette, useAppTheme } from '../../theme';
import { LessonModal } from './LessonModal';
import { ReferenceModal } from './ReferenceModal';
import { ScenarioTrainingModal } from './ScenarioTrainingModal';
import { TrainerModal } from './TrainerModal';
import { useLearningReviewQueue } from './useLearningReviewQueue';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface LearnScreenProps {
  launchActivityId: string | null;
  launchRecommendation: AdaptiveLearningRecommendation | null;
  /** True when the Home "cheat sheets" route should expand the reference collection. */
  launchCheatSheets: boolean;
  learningProfile: LearningProfile;
  loading: boolean;
  onLaunchActivityHandled: () => void;
  onLaunchRecommendationHandled: () => void;
  onLaunchCheatSheetsHandled?: () => void;
  onOpenProfile: () => void;
  onOpenLearningSetup: () => void;
  onOpenRoster?: () => void;
  onRecordResult: (input: LearningResultInput) => void;
  onRecordReviewSession: (input: Omit<LearningSessionInput, 'kind'>) => void;
  onStartCalibration: () => void;
  onStartMission: (missionId: TableMissionId) => void;
  practiceFocus?: string | null;
  progress: LearningProgressEntry[];
  history: LearningSessionRecord[];
}

export function LearnScreen({
  launchActivityId,
  launchRecommendation,
  launchCheatSheets,
  learningProfile,
  loading,
  onLaunchActivityHandled,
  onLaunchRecommendationHandled,
  onLaunchCheatSheetsHandled,
  onOpenProfile,
  onOpenLearningSetup,
  onOpenRoster,
  onRecordResult,
  onRecordReviewSession,
  onStartCalibration,
  onStartMission,
  practiceFocus,
  progress,
  history,
}: LearnScreenProps) {
  const { palette } = useAppTheme();
  const { activityText, practicePackText, scenarioContent, t, trainerContent } = useLocalization();
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  const styles = useMemo(() => createStyles(palette), [palette]);
  const scrollRef = useRef<ScrollView>(null);
  // Anchor over the Quick Reference collection so the Home route can reveal it.
  const quickReferenceRef = useRef<View>(null);
  const reviewQueue = useLearningReviewQueue();
  const progressById = learningProgressById(progress);
  const fallbackRecommendation = findLearningActivity(recommendedLearningActivityId(progress)) ?? lessons[0]!;
  const [expandedChapter, setExpandedChapter] = useState<LearnChapterId | null>(null);
  const [catalogExpanded, setCatalogExpanded] = useState(false);
  const [activeLesson, setActiveLesson] = useState<LessonDefinition | null>(null);
  const [pendingScenarioLesson, setPendingScenarioLesson] = useState<LessonDefinition | null>(null);
  const [activeTrainer, setActiveTrainer] = useState<TrainerDefinition | null>(null);
  const [activeSheet, setActiveSheet] = useState<CheatSheetDefinition | null>(null);
  const [activeDailyReview, setActiveDailyReview] = useState<TrainerDefinition | null>(null);
  const [masteryExpanded, setMasteryExpanded] = useState(false);
  const [scenarioVisible, setScenarioVisible] = useState(false);
  const [scenarioPracticeFocus, setScenarioPracticeFocus] = useState<string | null>(null);
  const [scenarioPracticePackId, setScenarioPracticePackId] = useState<PracticePackId | null>(null);

  useEffect(() => {
    if (scenarioVisible || !pendingScenarioLesson) return undefined;
    const openLessonTimer = setTimeout(() => {
      setActiveLesson(pendingScenarioLesson);
      setPendingScenarioLesson(null);
    }, 350);
    return () => clearTimeout(openLessonTimer);
  }, [pendingScenarioLesson, scenarioVisible]);

  const openActivity = useCallback((activity: LearningActivityDefinition, focus?: string | null, packId?: PracticePackId | null) => {
    if (activity.type === 'lesson') setActiveLesson(activity);
    else if (activity.type === 'scenario_drill') {
      setPendingScenarioLesson(null);
      setScenarioPracticeFocus(focus ?? null);
      setScenarioPracticePackId(packId ?? null);
      setScenarioVisible(true);
    } else setActiveTrainer(activity);
  }, []);

  const openCurriculumStep = useCallback((step: CurriculumStep) => {
    setExpandedChapter(step.chapter);
    if (step.kind === 'lesson') setActiveLesson(step.lesson);
    else if (step.kind === 'practice') openActivity(scenarioTrainer, null, step.pack.id);
    else if (step.kind === 'mission') onStartMission(step.mission.id);
    else setActiveTrainer(step.trainer);
  }, [onStartMission, openActivity]);

  useEffect(() => {
    if (!launchActivityId) return;
    openActivity(findLearningActivity(launchActivityId) ?? fallbackRecommendation, practiceFocus);
    onLaunchActivityHandled();
  }, [fallbackRecommendation, launchActivityId, onLaunchActivityHandled, openActivity, practiceFocus]);

  useEffect(() => {
    // The Home "cheat sheets" route expands the reference-collection chapter so
    // the whole set is browsable, rather than opening a single sheet that has
    // no way back to its collection. The reveal below clears the one-shot flag
    // once the Quick Reference collection is on screen, so the flag persists
    // until then instead of dropping the flag before the collection is shown.
    if (!launchCheatSheets) return;
    setExpandedChapter(expandCheatsheetCollection(expandedChapter, launchCheatSheets));
  }, [launchCheatSheets, expandedChapter]);

  // Reveal the Quick Reference collection in the scroll view so the Home launch
  // ends on the requested collection, not the screen top. Measured against the
  // scroll container; a safe no-op until layout is available.
  const revealReferenceCollection = useCallback((onComplete?: () => void) => {
    const scroll = scrollRef.current;
    const anchor = quickReferenceRef.current;
    if (!scroll || !anchor) return;
    anchor.measureLayout(
      scroll as unknown as HostInstance,
      (_x, y) => {
        scroll.scrollTo({ y: Math.max(0, y - 16), animated: true });
        onComplete?.();
      },
      () => onComplete?.(),
    );
  }, []);

  // Once Tools is expanded, reveal the Quick Reference collection as the visible
  // destination. Gated on shouldFocusCollection so only the Home launch reveals
  // (a normal tap that opens Tools must not auto-scroll).
  useEffect(() => {
    if (!shouldFocusCollection(launchCheatSheets, expandedChapter)) return;
    revealReferenceCollection(onLaunchCheatSheetsHandled);
  }, [launchCheatSheets, expandedChapter, revealReferenceCollection]);

  const activeScenarioPack = scenarioPracticePackId
    ? practicePackById(scenarioPracticePackId)
    : practicePackForFocus(scenarioPracticeFocus);
  const scenarioBestScore = progressById.get(scenarioTrainer.id)?.bestScore ?? null;
  const activeScenarioBestScore = activeScenarioPack
    ? progressById.get(activeScenarioPack.progressActivityId)?.bestScore ?? null
    : scenarioBestScore;

  const completedPathSteps = completedCurriculumStepCount(progress);
  const pathPercent = Math.round((completedPathSteps / curriculumSteps.length) * 100);

  const adaptiveMastery = useMemo(
    () => buildAdaptiveMasterySnapshot(progress, reviewQueue.items, history),
    [history, progress, reviewQueue.items],
  );
  const progressInsights = useMemo(
    () => buildLearningProgressInsights(history, reviewQueue.items),
    [history, reviewQueue.items],
  );

  const dailyReviewTrainer = useMemo(() => {
    const selectedItems = selectDailyLearningReviewItems(reviewQueue.items);
    const questions = selectedItems.flatMap((item): TrainerQuestion[] => {
      if (item.source === 'trainer') {
        const activity = findLearningActivity(item.activityId);
        if (!activity || activity.type === 'lesson' || activity.type === 'scenario_drill') return [];
        const question = trainerContent(activity).questions.find((candidate) => candidate.id === item.questionId);
        return question ? [{ ...question, id: item.id }] : [];
      }

      const sourceScenario = item.source === 'scenario'
        ? item.scenario
        : generateFocusedScenarioSessionFromRandom(item.focusArea, secureRandom)[0];
      if (!sourceScenario) return [];
      return [scenarioReviewQuestion(item, scenarioContent(sourceScenario), t)];
    });
    if (questions.length === 0) return null;
    return {
      id: 'daily-learning-review',
      type: 'hand_quiz' as const,
      title: t('learn.reviewToday'),
      description: t('learn.reviewTodayDescription'),
      estimatedMinutes: 3,
      questions,
    };
  }, [reviewQueue.items, scenarioContent, t, trainerContent]);

  useEffect(() => {
    if (!launchRecommendation) return;
    if (launchRecommendation.kind === 'review') {
      if (dailyReviewTrainer) setActiveDailyReview(dailyReviewTrainer);
    } else if (launchRecommendation.kind === 'reinforce-practice') {
      openActivity(scenarioTrainer, null, launchRecommendation.pack.id);
    } else if (launchRecommendation.kind === 'reinforce-activity') {
      openActivity(launchRecommendation.activity);
    } else {
      openCurriculumStep(launchRecommendation.step);
    }
    onLaunchRecommendationHandled();
  }, [dailyReviewTrainer, launchRecommendation, onLaunchRecommendationHandled, openActivity, openCurriculumStep]);

  const personalPlan = useMemo(() => buildPersonalPracticePlan(
    progress,
    reviewQueue.items,
    practiceFocus,
    Boolean(dailyReviewTrainer),
    undefined,
    guidedLearningContext(learningProfile),
  ), [dailyReviewTrainer, learningProfile, practiceFocus, progress, reviewQueue.items]);

  const openPlanItem = (item: PersonalPracticePlanItem) => {
    if (item.target.kind === 'review' && dailyReviewTrainer) {
      setActiveDailyReview(dailyReviewTrainer);
    } else if (item.target.kind === 'practice') {
      openActivity(scenarioTrainer, item.target.focus, item.target.pack.id);
    } else if (item.target.kind === 'activity') {
      openActivity(item.target.activity);
    } else if (item.target.kind === 'curriculum') {
      openCurriculumStep(item.target.step);
    }
  };

  const recordTrainerReview = useCallback((trainer: TrainerDefinition, review: TrainerAttemptReview) => {
    const captures: LearningReviewCapture[] = review.missedQuestionIds.map((questionId) => ({
      activityId: trainer.id,
      questionId,
      source: 'trainer',
    }));
    const outcomes: LearningReviewOutcome[] = review.correctQuestionIds.map((questionId) => ({
      correct: true,
      itemId: `trainer:${trainer.id}:${questionId}`,
    }));
    reviewQueue.record(captures, outcomes);
  }, [reviewQueue.record]);

  const recordScenarioReview = useCallback((trainer: ScenarioTrainerDefinition, review: ScenarioAttemptReview) => {
    const captures: LearningReviewCapture[] = review.missedScenarios.map((scenario) => ({
      activityId: trainer.id,
      focusArea: reviewFocusAreaForScenario(scenario, scenarioPracticeFocus),
      scenario,
      source: 'scenario',
    }));
    const outcomes: LearningReviewOutcome[] = review.correctScenarioIds.map((scenarioId) => ({
      correct: true,
      itemId: `scenario:${trainer.id}:${scenarioId}`,
    }));
    reviewQueue.record(captures, outcomes);
  }, [reviewQueue.record, scenarioPracticeFocus]);

  return (
    <>
      <ScrollView contentContainerStyle={[styles.content, tablet && styles.contentTablet]} showsVerticalScrollIndicator={false} style={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>{t('learn.eyebrow')}</Text>
            <Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{t('learn.title')}</Text>
          </View>
          <Pressable accessibilityLabel={t('common.openProfile')} accessibilityRole="button" onPress={onOpenProfile} style={styles.iconButton}>
            <Ionicons color={palette.text} name="person-outline" size={19} />
          </Pressable>
        </View>

        <PersonalPracticePlanCard
          completed={completedPathSteps}
          goal={learningProfile.goal}
          loading={loading}
          onOpen={openPlanItem}
          pathPercent={pathPercent}
          plan={personalPlan}
          total={curriculumSteps.length}
        />

        <GuidedProgressCard
          history={history}
          onChangeGoal={onOpenLearningSetup}
          onStartCalibration={onStartCalibration}
          profile={learningProfile}
        />

        <AdaptiveMasteryCard
          expanded={masteryExpanded}
          onPress={() => setMasteryExpanded((current) => !current)}
          onReview={dailyReviewTrainer ? () => setActiveDailyReview(dailyReviewTrainer) : undefined}
          onSelectChapter={(chapter) => {
            setCatalogExpanded(true);
            setExpandedChapter(chapter);
          }}
          insights={progressInsights}
          snapshot={adaptiveMastery}
        />

        <Pressable
          accessibilityLabel={t(catalogExpanded ? 'learn.hideCatalogA11y' : 'learn.browseCatalogA11y')}
          accessibilityRole="button"
          accessibilityState={{ expanded: catalogExpanded }}
          onPress={() => setCatalogExpanded((current) => !current)}
          style={({ pressed }) => [styles.browseCard, pressed && styles.pressed]}
        >
          <View style={styles.browseIcon}>
            <Ionicons color={palette.primary} name="library-outline" size={19} />
          </View>
          <View style={styles.browseCopy}>
            <Text style={styles.browseTitle}>{t('learn.browseAll')}</Text>
            <Text numberOfLines={2} style={styles.browseDescription}>{t('learn.browseAllDescription')}</Text>
          </View>
          <Ionicons color={palette.muted} name={catalogExpanded ? 'chevron-up' : 'chevron-down'} size={18} />
        </Pressable>

        {catalogExpanded ? <>
          <Text accessibilityRole="header" style={styles.curriculumTitle}>{t('learn.curriculum')}</Text>

        <ChapterCard
          complete={completedCurriculumStepCount(progress, 'fundamentals')}
          description={t('learn.fundamentalsDescription')}
          expanded={expandedChapter === 'fundamentals'}
          icon="school-outline"
          label={t('learn.fundamentals')}
          onPress={() => setExpandedChapter((current) => current === 'fundamentals' ? null : 'fundamentals')}
          total={curriculumStepsForChapter('fundamentals').length}
        >
          <View style={styles.list}>
            {fundamentalsLessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
        </ChapterCard>

        <ChapterCard
          accent="aqua"
          complete={completedCurriculumStepCount(progress, 'preflop')}
          description={t('learn.preflopDescription')}
          expanded={expandedChapter === 'preflop'}
          icon="git-compare-outline"
          label={t('learn.preflopStrategy')}
          onPress={() => setExpandedChapter((current) => current === 'preflop' ? null : 'preflop')}
          total={curriculumStepsForChapter('preflop').length}
        >
          <SectionHeader label={t('learn.lessons')} />
          <View style={styles.list}>
            {preflopStrategyLessons.map((lesson) => (
              <LessonRow accent="aqua" key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.preflopPractice')} />
          <View style={styles.list}>
            {preflopPracticePacks.map((pack, index) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent={index === 0 ? 'indigo' : 'aqua'}
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon={index === 0 ? 'enter-outline' : 'shield-checkmark-outline'}
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined ? t('common.minutes', { count: 5 }) : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
          <SectionHeader label={t('learn.tableMissions')} />
          <View style={styles.list}>
            {preflopTableMissions.map((mission, index) => (
              <MissionRow key={mission.id} mission={mission} onPress={() => onStartMission(mission.id)} prerequisitesComplete={mission.prerequisiteIds.every((id) => progressById.get(id)?.status === 'completed')} progress={progressById.get(mission.id)} tone={index === 0 ? 'indigo' : 'aqua'} />
            ))}
          </View>
          <SectionHeader label={t('learn.mastery')} />
          <View style={styles.list}>
            <MasteryRow accent="aqua" progress={progressById.get(preflopMasteryCheck.id)} trainer={preflopMasteryCheck} onPress={() => setActiveTrainer(preflopMasteryCheck)} />
          </View>
          <SectionHeader label={t('learn.intermediatePreflop')} />
          <View style={styles.list}>
            {intermediatePreflopLessons.map((lesson) => (
              <LessonRow accent="aqua" key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.threeBetPractice')} />
          <View style={styles.list}>
            {intermediatePreflopPracticePacks.map((pack) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent="aqua"
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon="swap-vertical-outline"
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined
                    ? `${t('common.intermediate')} · ${t('common.minutes', { count: 5 })}`
                    : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
        </ChapterCard>

        <ChapterCard
          complete={completedCurriculumStepCount(progress, 'postflop')}
          description={t('learn.postflopDescription')}
          expanded={expandedChapter === 'postflop'}
          icon="layers-outline"
          label={t('learn.postflopFoundations')}
          onPress={() => setExpandedChapter((current) => current === 'postflop' ? null : 'postflop')}
          total={curriculumStepsForChapter('postflop').length}
        >
          <SectionHeader label={t('learn.lessons')} />
          <View style={styles.list}>
            {postflopFoundationsLessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.postflopPractice')} />
          <View style={styles.list}>
            {postflopPracticePacks.map((pack, index) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent={index === 0 ? 'indigo' : 'aqua'}
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon={index === 0 ? 'flash-outline' : 'calculator-outline'}
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined ? t('common.minutes', { count: 5 }) : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
          <SectionHeader label={t('learn.postflopTableMissions')} />
          <View style={styles.list}>
            {postflopTableMissions.map((mission, index) => (
              <MissionRow key={mission.id} mission={mission} onPress={() => onStartMission(mission.id)} prerequisitesComplete={mission.prerequisiteIds.every((id) => progressById.get(id)?.status === 'completed')} progress={progressById.get(mission.id)} tone={index === 0 ? 'indigo' : 'aqua'} />
            ))}
          </View>
          <SectionHeader label={t('learn.postflopMastery')} />
          <View style={styles.list}>
            <MasteryRow progress={progressById.get(postflopMasteryCheck.id)} trainer={postflopMasteryCheck} onPress={() => setActiveTrainer(postflopMasteryCheck)} />
          </View>
          <SectionHeader label={t('learn.intermediatePostflop')} />
          <View style={styles.list}>
            {intermediatePostflopLessons.map((lesson) => (
              <LessonRow accent="aqua" key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.rangePlanPractice')} />
          <View style={styles.list}>
            {intermediatePostflopPracticePacks.map((pack) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent="aqua"
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon="analytics-outline"
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined
                    ? `${t('common.intermediate')} · ${t('common.minutes', { count: 5 })}`
                    : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
          <SectionHeader label={t('learn.intermediateRiver')} />
          <View style={styles.list}>
            {intermediateRiverLessons.map((lesson) => (
              <LessonRow accent="aqua" key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.riverDecisionPractice')} />
          <View style={styles.list}>
            {intermediateRiverPracticePacks.map((pack) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent="aqua"
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon="water-outline"
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined
                    ? `${t('common.intermediate')} · ${t('common.minutes', { count: 5 })}`
                    : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
        </ChapterCard>

        <ChapterCard
          accent="aqua"
          complete={completedCurriculumStepCount(progress, 'tournament')}
          description={t('learn.tournamentDescription')}
          expanded={expandedChapter === 'tournament'}
          icon="trophy-outline"
          label={t('learn.tournament')}
          onPress={() => setExpandedChapter((current) => current === 'tournament' ? null : 'tournament')}
          total={curriculumStepsForChapter('tournament').length}
        >
          <SectionHeader description={t('learn.tournamentFoundationPathDescription')} label={t('learn.tournamentFoundationPath')} />
          <View style={styles.list}>
            {tournamentFoundationsLessons.map((lesson) => (
              <LessonRow accent="aqua" key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.tournamentPractice')} />
          <View style={styles.list}>
            {tournamentPracticePacks.filter((pack) => pack.id === 'tournament-short-stack').map((pack) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent="aqua"
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon="timer-outline"
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined
                    ? `${t('common.intermediate')} · ${t('common.minutes', { count: 5 })}`
                    : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
          <SectionHeader description={t('learn.bubblePathDescription')} label={t('learn.bubblePath')} />
          <View style={styles.list}>
            {tournamentBubbleLessons.map((lesson) => (
              <LessonRow accent="aqua" key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.bubblePractice')} />
          <View style={styles.list}>
            {tournamentPracticePacks.filter((pack) => pack.id === 'tournament-bubble').map((pack) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent="aqua"
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon="podium-outline"
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined
                    ? `${t('common.intermediate')} · ${t('common.minutes', { count: 5 })}`
                    : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
          <SectionHeader label={t('learn.appliedMission')} />
          <View style={styles.list}>
            {tournamentTableMissions.map((mission) => (
              <MissionRow key={mission.id} mission={mission} onPress={() => onStartMission(mission.id)} prerequisitesComplete={mission.prerequisiteIds.every((id) => progressById.get(id)?.status === 'completed')} progress={progressById.get(mission.id)} tone="aqua" />
            ))}
          </View>
        </ChapterCard>

        <ChapterCard
          complete={completedCurriculumStepCount(progress, 'opponents')}
          description={t('learn.opponentsDescription')}
          expanded={expandedChapter === 'opponents'}
          icon="people-outline"
          label={t('learn.opponents')}
          onPress={() => setExpandedChapter((current) => current === 'opponents' ? null : 'opponents')}
          total={curriculumStepsForChapter('opponents').length}
        >
          <SectionHeader description={t('learn.opponentPathDescription')} label={t('learn.opponentPath')} />
          <View style={styles.list}>
            {opponentReadLessons.map((lesson) => (
              <LessonRow key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.opponentPractice')} />
          <View style={styles.list}>
            {opponentPracticePacks.map((pack) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon="eye-outline"
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined
                    ? `${t('common.intermediate')} · ${t('common.minutes', { count: 5 })}`
                    : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
          <SectionHeader label={t('learn.appliedMission')} />
          <View style={styles.list}>
            {opponentTableMissions.map((mission) => (
              <MissionRow key={mission.id} mission={mission} onPress={() => onStartMission(mission.id)} prerequisitesComplete={mission.prerequisiteIds.every((id) => progressById.get(id)?.status === 'completed')} progress={progressById.get(mission.id)} tone="indigo" />
            ))}
          </View>
        </ChapterCard>

        <ChapterCard
          accent="aqua"
          complete={completedCurriculumStepCount(progress, 'advanced-math')}
          description={t('learn.advancedMathDescription')}
          expanded={expandedChapter === 'advanced-math'}
          icon="calculator-outline"
          label={t('learn.advancedMath')}
          onPress={() => setExpandedChapter((current) => current === 'advanced-math' ? null : 'advanced-math')}
          total={curriculumStepsForChapter('advanced-math').length}
        >
          <SectionHeader description={t('learn.mathPathDescription')} label={t('learn.mathPath')} />
          <View style={styles.list}>
            {advancedMathLessons.map((lesson) => (
              <LessonRow accent="aqua" key={lesson.id} lesson={lesson} onPress={() => setActiveLesson(lesson)} progress={progressById.get(lesson.id)} />
            ))}
          </View>
          <SectionHeader label={t('learn.advancedMathPractice')} />
          <View style={styles.list}>
            {advancedMathPracticePacks.map((pack) => {
              const entry = progressById.get(pack.progressActivityId);
              return (
                <LearningRow
                  accent="aqua"
                  completed={entry?.status === 'completed'}
                  description={practicePackText(pack, 'description')}
                  icon="stats-chart-outline"
                  key={pack.id}
                  label={practicePackText(pack, 'title')}
                  meta={entry?.bestScore === null || entry?.bestScore === undefined
                    ? `${t('common.intermediate')} · ${t('common.minutes', { count: 5 })}`
                    : t('common.best', { score: entry.bestScore })}
                  onPress={() => openActivity(scenarioTrainer, null, pack.id)}
                />
              );
            })}
          </View>
          <SectionHeader label={t('learn.quickReference')} />
          <View style={styles.list}>
            <LearningRow
              accent="aqua"
              description={activityText(advancedMathCheatSheet, 'description')}
              icon="document-text-outline"
              label={activityText(advancedMathCheatSheet, 'title')}
              onPress={() => setActiveSheet(advancedMathCheatSheet)}
            />
          </View>
        </ChapterCard>

        <ChapterCard
          accent="aqua"
          description={t('learn.toolsDescription')}
          expanded={expandedChapter === 'tools'}
          icon="extension-puzzle-outline"
          label={t('learn.practiceTools')}
          meta={t('learn.openAnytime')}
          onPress={() => setExpandedChapter((current) => current === 'tools' ? null : 'tools')}
        >
          <SectionHeader label={t('learn.practiceDecisions')} />
          <View style={styles.toolGrid}>
            <ToolCard description={t('learn.percentageDescription')} icon="stats-chart-outline" label={t('learn.percentageTrainer')} onPress={() => setActiveTrainer(percentageTrainer)} score={progressById.get(percentageTrainer.id)?.bestScore} />
            <ToolCard accent="aqua" description={t('learn.handQuizDescription')} icon="help-circle-outline" label={t('learn.handQuiz')} onPress={() => setActiveTrainer(handQuiz)} score={progressById.get(handQuiz.id)?.bestScore} />
          </View>
          <View style={styles.list}>
            <LearningRow
              accent="aqua"
              description={t('learn.scenarioDescription')}
              icon="locate-outline"
              label={t('learn.scenarioTraining')}
              meta={scenarioBestScore === null ? t('common.minutes', { count: scenarioTrainer.estimatedMinutes }) : t('common.best', { score: scenarioBestScore })}
              onPress={() => openActivity(scenarioTrainer, null)}
            />
          </View>
          <View ref={quickReferenceRef} accessibilityLabel={t('learn.quickReference')}>
            <SectionHeader label={t('learn.quickReference')} />
            <View style={styles.list}>
              {cheatSheets.map((sheet, index) => (
                <LearningRow
                  accent={index % 2 === 1 ? 'aqua' : 'indigo'}
                  description={activityText(sheet, 'description')}
                  icon={index === 0 ? 'albums-outline' : index === 1 ? 'compass-outline' : index === 2 ? 'pie-chart-outline' : 'apps-outline'}
                  key={sheet.id}
                  label={activityText(sheet, 'title')}
                  onPress={() => setActiveSheet(sheet)}
                />
              ))}
              {onOpenRoster ? (
                <LearningRow accent={cheatSheets.length % 2 === 1 ? 'aqua' : 'indigo'} description={t('roster.openDescription')} icon="people-outline" label={t('roster.open')} onPress={onOpenRoster} />
              ) : null}
            </View>
          </View>
        </ChapterCard>

        </> : null}

        <Text style={styles.footerNote}>{t('learn.footer')}</Text>
      </ScrollView>

      <LessonModal
        completed={activeLesson ? progressById.get(activeLesson.id)?.status === 'completed' : false}
        lesson={activeLesson}
        onClose={() => setActiveLesson(null)}
        onComplete={(lesson) => {
          onRecordResult({ activityId: lesson.id, activityType: lesson.type, completed: true });
          setActiveLesson(null);
        }}
      />
      <TrainerModal
        bestScore={activeDailyReview ? null : activeTrainer ? progressById.get(activeTrainer.id)?.bestScore ?? null : null}
        onClose={() => {
          setActiveTrainer(null);
          setActiveDailyReview(null);
        }}
        onComplete={(trainer, score, review) => {
          if (activeDailyReview) {
            reviewQueue.record([], [
              ...review.correctQuestionIds.map((itemId) => ({ correct: true, itemId })),
              ...review.missedQuestionIds.map((itemId) => ({ correct: false, itemId })),
            ]);
            onRecordReviewSession({
              activityId: activeDailyReview.id,
              correctCount: review.correctQuestionIds.length,
              score,
              totalCount: review.correctQuestionIds.length + review.missedQuestionIds.length,
            });
            return;
          }
          onRecordResult({
            activityId: trainer.id,
            activityType: trainer.type,
            completed: trainer.masteryThreshold === undefined || score >= trainer.masteryThreshold,
            score,
            countAttempt: true,
          });
          recordTrainerReview(trainer, review);
        }}
        reviewMode={Boolean(activeDailyReview)}
        trainer={activeDailyReview ?? activeTrainer}
      />
      <ReferenceModal onClose={() => setActiveSheet(null)} sheet={activeSheet} />
      <ScenarioTrainingModal
        bestScore={activeScenarioBestScore}
        onClose={() => {
          setScenarioVisible(false);
          setScenarioPracticeFocus(null);
          setScenarioPracticePackId(null);
        }}
        onComplete={(trainer, score, review) => {
          onRecordResult({
            activityId: trainer.id,
            activityType: trainer.type,
            completed: true,
            score,
            countAttempt: true,
          });
          recordScenarioReview(trainer, review);
        }}
        onReviewLesson={(lessonId) => {
          const activity = findLearningActivity(lessonId);
          if (!activity || activity.type !== 'lesson') return;
          setPendingScenarioLesson(activity);
          setScenarioVisible(false);
          setScenarioPracticeFocus(null);
          setScenarioPracticePackId(null);
        }}
        practiceFocus={scenarioPracticeFocus}
        practicePackId={scenarioPracticePackId}
        visible={scenarioVisible}
      />
    </>
  );
}

function PersonalPracticePlanCard({
  completed,
  goal,
  loading,
  onOpen,
  pathPercent,
  plan,
  total,
}: {
  completed: number;
  goal: LearningGoalId;
  loading: boolean;
  onOpen: (item: PersonalPracticePlanItem) => void;
  pathPercent: number;
  plan: PersonalPracticePlanItem[];
  total: number;
}) {
  const { palette } = useAppTheme();
  const { activityText, practicePackText, t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [expanded, setExpanded] = useState(false);
  const visiblePlan = expanded ? plan : plan.slice(0, 1);
  const hiddenItemCount = Math.max(0, plan.length - visiblePlan.length);

  return (
    <View style={styles.planCard}>
      <View style={styles.cardOrb} />
      <View style={styles.planHeader}>
        <View style={styles.planIcon}>
          <Ionicons color={palette.primary} name="navigate-circle-outline" size={22} />
        </View>
        <View style={styles.planHeaderCopy}>
          <Text style={styles.continueEyebrow}>{t('learn.personalPlanEyebrow')}</Text>
          <Text style={styles.planTitle}>{t('learn.personalPlanTitle')}</Text>
          <Text style={styles.planDescription}>{t('learn.personalPlanDescription')}</Text>
        </View>
        <Text style={styles.progressLabel}>{loading
          ? t('learn.syncing')
          : t('learn.pathCount', { complete: completed, total })}</Text>
      </View>

      {loading ? (
        <View style={styles.planLoading}>
          <ActivityIndicator color={palette.primary} size="small" />
          <Text style={styles.planLoadingText}>{t('learn.planUpdating')}</Text>
        </View>
      ) : (
        <View style={styles.planList}>
          {visiblePlan.map((item, index) => {
            const title = personalPlanItemTitle(item, activityText, practicePackText, t);
            const reason = personalPlanItemReason(item, goal, t);
            const minutes = personalPlanItemMinutes(item);
            return (
              <Pressable
                accessibilityLabel={`${personalPlanItemBadge(item, t)}. ${title}. ${reason}. ${t('common.minutes', { count: minutes })}`}
                accessibilityRole="button"
                key={item.id}
                onPress={() => onOpen(item)}
                style={({ pressed }) => [
                  styles.planRow,
                  index === 0 && styles.planRowPrimary,
                  pressed && styles.pressed,
                ]}
              >
                <View style={[styles.planStep, index === 0 && styles.planStepPrimary]}>
                  <Text style={[styles.planStepText, index === 0 && styles.planStepTextPrimary]}>{index + 1}</Text>
                </View>
                <View style={styles.planRowCopy}>
                  <View style={styles.planRowMeta}>
                    <Text style={styles.planBadge}>{personalPlanItemBadge(item, t)}</Text>
                    <Text style={styles.planMinutes}>{t('common.minutes', { count: minutes })}</Text>
                  </View>
                  <Text numberOfLines={2} style={styles.planRowTitle}>{title}</Text>
                  <Text numberOfLines={2} style={styles.planReason}>{reason}</Text>
                </View>
                <View style={[styles.planArrow, index === 0 && styles.planArrowPrimary]}>
                  <Ionicons color={index === 0 ? palette.primaryText : palette.primary} name="arrow-forward" size={14} />
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {!loading && plan.length > 1 ? (
        <Pressable
          accessibilityLabel={t(expanded ? 'learn.planShowLess' : 'learn.planShowMore', {
            count: expanded ? plan.length - 1 : hiddenItemCount,
          })}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded((current) => !current)}
          style={({ pressed }) => [styles.planDisclosure, pressed && styles.pressed]}
        >
          <Text style={styles.planDisclosureText}>
            {t(expanded ? 'learn.planShowLess' : 'learn.planShowMore', {
              count: expanded ? plan.length - 1 : hiddenItemCount,
            })}
          </Text>
          <Ionicons color={palette.primary} name={expanded ? 'chevron-up' : 'chevron-down'} size={16} />
        </Pressable>
      ) : null}

      <View
        accessibilityLabel={t('home.learningProgressA11y', { percent: pathPercent })}
        accessibilityRole="progressbar"
        accessibilityValue={{ max: 100, min: 0, now: pathPercent }}
        style={styles.pathTrack}
      >
        <View style={[styles.pathFill, { width: `${pathPercent}%` }]} />
      </View>
    </View>
  );
}

function personalPlanItemTitle(
  item: PersonalPracticePlanItem,
  activityText: (activity: { description: string; id: string; title: string }, field: 'description' | 'title') => string,
  practicePackText: (pack: { description: string; id: string; title: string }, field: 'description' | 'title') => string,
  t: (key: MessageKey, values?: Record<string, number | string>) => string,
): string {
  if (item.target.kind === 'review') return t('learn.reviewToday');
  if (item.target.kind === 'practice') return practicePackText(item.target.pack, 'title');
  if (item.target.kind === 'activity') return activityText(item.target.activity, 'title');
  return curriculumStepText(item.target.step, 'title', activityText, practicePackText);
}

function personalPlanItemReason(
  item: PersonalPracticePlanItem,
  goal: LearningGoalId,
  t: (key: MessageKey, values?: Record<string, number | string>) => string,
): string {
  if (item.reason === 'resume') return t('learn.planResumeReason');
  if (item.reason === 'review' && item.target.kind === 'review') {
    return t('learn.planReviewReason', { count: item.target.dueCount });
  }
  if (item.reason === 'table-focus' && item.target.kind === 'practice' && item.target.focus) {
    return t('learn.planTableReason', { focus: localizedFocus(item.target.focus, t) });
  }
  if (item.reason === 'reinforce') return t('learn.planReinforceReason', { score: item.score ?? 0 });
  if (item.reason === 'goal-focus') return t('learn.planGoalReason', { goal: guidedGoalTitle(goal, t) });
  return t('learn.planContinueReason');
}

function personalPlanItemBadge(
  item: PersonalPracticePlanItem,
  t: (key: MessageKey) => string,
): string {
  if (item.reason === 'resume') return t('learn.planResume');
  if (item.reason === 'review') return t('learn.planReview');
  return t('learn.planRecommended');
}

function personalPlanItemMinutes(item: PersonalPracticePlanItem): number {
  if (item.target.kind === 'review') return 3;
  if (item.target.kind === 'practice') return 5;
  if (item.target.kind === 'activity') return item.target.activity.estimatedMinutes;
  return curriculumStepMinutes(item.target.step);
}

function guidedGoalTitle(
  goal: LearningGoalId,
  t: (key: MessageKey, values?: Record<string, number | string>) => string,
): string {
  return t(`guided.goal.${goal}.title` as MessageKey);
}

function guidedGoalDescription(
  goal: LearningGoalId,
  t: (key: MessageKey, values?: Record<string, number | string>) => string,
): string {
  return t(`guided.goal.${goal}.description` as MessageKey);
}

function signedProgressChange(change: number): string {
  return change > 0 ? `+${change}` : String(change);
}

function GuidedProgressCard({
  history,
  onChangeGoal,
  onStartCalibration,
  profile,
}: {
  history: readonly LearningSessionRecord[];
  onChangeGoal: () => void;
  onStartCalibration: () => void;
  profile: LearningProfile;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const snapshot = latestLearningSnapshot(profile);
  const checkpoint = learningCheckpointStatus(profile, history);
  const comparison = learningProgressComparison(profile);
  const checkpointDescription = !snapshot
    ? t('guided.card.noBaseline')
    : checkpoint.due
      ? t('guided.card.checkpointDue', { count: checkpoint.sessionsCompleted })
      : t('guided.card.checkpointIn', { count: checkpoint.sessionsRemaining });
  const canCheck = !snapshot || checkpoint.due;

  return (
    <View style={styles.focusCard}>
      <View style={styles.focusHeading}>
        <View style={styles.focusIcon}>
          <Ionicons color={palette.primary} name="navigate-outline" size={20} />
        </View>
        <View style={styles.focusCopy}>
          <Text maxFontSizeMultiplier={1.5} style={styles.focusEyebrow}>{t('guided.card.eyebrow')}</Text>
          <Text maxFontSizeMultiplier={1.5} style={styles.focusTitle}>{guidedGoalTitle(profile.goal, t)}</Text>
        </View>
        {snapshot ? (
          <View style={styles.guidedScorePill}>
            <Text maxFontSizeMultiplier={1.5} style={styles.guidedScoreValue}>{snapshot.overallScore}%</Text>
          </View>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={1.5} style={styles.focusDescription}>{guidedGoalDescription(profile.goal, t)}</Text>
      <View style={styles.guidedStatus}>
        <Ionicons color={checkpoint.due ? palette.primary : palette.aqua} name={checkpoint.due ? 'flag-outline' : 'time-outline'} size={16} />
        <Text maxFontSizeMultiplier={1.5} style={styles.guidedStatusText}>{checkpointDescription}</Text>
        {comparison ? (
          <Text maxFontSizeMultiplier={1.5} style={[styles.guidedChange, comparison.goalChange < 0 && styles.guidedChangeDown]}>
            {t('guided.card.change', { change: signedProgressChange(comparison.goalChange) })}
          </Text>
        ) : null}
      </View>
      <View style={styles.focusActions}>
        <Pressable
          accessibilityRole="button"
          onPress={onChangeGoal}
          style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
        >
          <Ionicons color={palette.primary} name="options-outline" size={16} />
          <Text maxFontSizeMultiplier={1.5} style={styles.secondaryActionText}>{profile.setupStatus === 'not-started'
            ? t('guided.card.chooseGoal')
            : t('guided.card.changeGoal')}</Text>
        </Pressable>
        {canCheck ? (
          <Pressable
            accessibilityRole="button"
            onPress={onStartCalibration}
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          >
            <Ionicons color={palette.primaryText} name="analytics-outline" size={16} />
            <Text maxFontSizeMultiplier={1.5} style={styles.primaryActionText}>{snapshot
              ? t('guided.card.checkNow')
              : t('guided.card.takeBaseline')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AdaptiveMasteryCard({
  expanded,
  insights,
  onPress,
  onReview,
  onSelectChapter,
  snapshot,
}: {
  expanded: boolean;
  insights: LearningProgressInsights;
  onPress: () => void;
  onReview?: () => void;
  onSelectChapter: (chapter: CurriculumChapterId) => void;
  snapshot: AdaptiveMasterySnapshot;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const recommended = snapshot.chapters[snapshot.recommendedChapter];
  return (
    <View style={[styles.masteryCard, expanded && styles.masteryCardExpanded]}>
      <Pressable
        accessibilityLabel={`${t('learn.progressOverview')}. ${t('learn.weeklyActivitySummary', { sessions: snapshot.week.recentActivities, days: snapshot.week.activeDays })}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [styles.masteryHeader, pressed && styles.pressed]}
      >
        <View style={styles.masteryIcon}>
          <Ionicons color={palette.primary} name="analytics-outline" size={20} />
        </View>
        <View style={styles.masteryHeaderCopy}>
          <Text style={styles.masteryEyebrow}>{t('learn.thisWeek')}</Text>
          <Text style={styles.masteryTitle}>{t('learn.progressOverview')}</Text>
          <Text numberOfLines={1} style={styles.masterySummary}>
            {t('learn.weeklyActivitySummary', { sessions: snapshot.week.recentActivities, days: snapshot.week.activeDays })}
          </Text>
        </View>
        <View style={styles.masteryHeaderMeta}>
          <Text style={styles.masteryScore}>{recommended.masteryPercent}%</Text>
          <Text numberOfLines={1} style={styles.masteryScoreLabel}>{chapterLabel(snapshot.recommendedChapter, t)}</Text>
        </View>
        <Ionicons color={palette.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={17} />
      </Pressable>
      {expanded ? (
        <View style={styles.masteryBody}>
          <WeeklyActivityTrend snapshot={snapshot.week} />
          <LearningInsightSummary insights={insights} />
          <View style={styles.masteryFocusRow}>
            <Text style={styles.masteryFocusText}>{t('learn.focusNext', { chapter: chapterLabel(snapshot.recommendedChapter, t) })}</Text>
            {snapshot.dueReviews > 0 && onReview ? (
              <Pressable accessibilityRole="button" onPress={onReview} style={({ pressed }) => [styles.masteryReviewAction, pressed && styles.pressed]}>
                <Text style={styles.masteryDue}>{t('learn.reviewNow', { count: snapshot.dueReviews })}</Text>
                <Ionicons color={palette.primary} name="arrow-forward" size={12} />
              </Pressable>
            ) : (
              <Text style={styles.masteryOnTrack}>{t('learn.onTrack')}</Text>
            )}
          </View>
          {(['fundamentals', 'preflop', 'postflop', 'tournament', 'opponents', 'advanced-math'] as CurriculumChapterId[]).map((chapter) => (
            <MasteryTrackRow
              key={chapter}
              label={chapterLabel(chapter, t)}
              onPress={() => onSelectChapter(chapter)}
              snapshot={snapshot.chapters[chapter]}
            />
          ))}
          <Text style={styles.masteryNote}>{t('learn.masteryEstimateNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function LearningInsightSummary({ insights }: { insights: LearningProgressInsights }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (!insights.improving && !insights.recurringReview) {
    return (
      <View style={styles.insightEmpty}>
        <Ionicons color={palette.muted} name="analytics-outline" size={16} />
        <Text style={styles.insightEmptyText}>{t('learn.insightsNeedEvidence')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.insightGrid}>
      {insights.improving ? (
        <View style={styles.insightCard}>
          <View style={styles.insightHeading}>
            <Ionicons color={palette.aqua} name="trending-up-outline" size={15} />
            <Text style={styles.insightLabel}>{t('learn.improving')}</Text>
          </View>
          <Text numberOfLines={1} style={styles.insightValue}>{learningConceptLabel(insights.improving.concept, t)}</Text>
          <Text style={styles.insightDetail}>{t('learn.improvingDetail', {
            attempts: insights.improving.attempts,
            change: insights.improving.change,
          })}</Text>
        </View>
      ) : null}
      {insights.recurringReview ? (
        <View style={styles.insightCard}>
          <View style={styles.insightHeading}>
            <Ionicons color={palette.primary} name="refresh-outline" size={15} />
            <Text style={styles.insightLabel}>{t('learn.recurringReview')}</Text>
          </View>
          <Text numberOfLines={1} style={styles.insightValue}>{learningConceptLabel(insights.recurringReview.concept, t)}</Text>
          <Text style={styles.insightDetail}>{t('learn.recurringReviewDetail', {
            due: insights.recurringReview.dueCount,
            spots: insights.recurringReview.spots,
          })}</Text>
        </View>
      ) : null}
    </View>
  );
}

function WeeklyActivityTrend({ snapshot }: { snapshot: WeeklyLearningSnapshot }) {
  const { language, t } = useLocalization();
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const busiestDay = Math.max(1, ...snapshot.days.map((day) => day.sessions));
  const trend = snapshot.sessionTrend > 0
    ? t('learn.weeklyTrendUp', { count: snapshot.sessionTrend })
    : snapshot.sessionTrend < 0
      ? t('learn.weeklyTrendDown', { count: Math.abs(snapshot.sessionTrend) })
      : t('learn.weeklyTrendSteady');

  return (
    <View
      accessibilityLabel={`${t('learn.currentStreakValue', { count: snapshot.currentStreak })}. ${t('learn.weeklyActivitySummary', { sessions: snapshot.recentActivities, days: snapshot.activeDays })}`}
      style={styles.weeklyTrendCard}
    >
      <View style={styles.weeklyStatsRow}>
        <View style={styles.weeklyStat}>
          <View style={styles.weeklyStatValueRow}>
            <Ionicons color={palette.primary} name="flame-outline" size={13} />
            <Text style={styles.weeklyStatValue}>{snapshot.currentStreak}</Text>
          </View>
          <Text numberOfLines={1} style={styles.weeklyStatLabel}>{t('learn.currentStreak')}</Text>
        </View>
        <View style={styles.weeklyStat}>
          <Text style={styles.weeklyStatValue}>{snapshot.recentActivities}</Text>
          <Text numberOfLines={1} style={styles.weeklyStatLabel}>{t('learn.learningSessions')}</Text>
        </View>
        <View style={styles.weeklyStat}>
          <Text style={styles.weeklyStatValue}>{snapshot.reviewAccuracy === null ? '—' : `${snapshot.reviewAccuracy}%`}</Text>
          <Text numberOfLines={1} style={styles.weeklyStatLabel}>{t('learn.reviewAccuracy')}</Text>
        </View>
      </View>
      <View style={styles.weeklyChartHeader}>
        <Text style={styles.weeklyChartTitle}>{t('learn.lastSevenDays')}</Text>
        <Text numberOfLines={1} style={styles.weeklyChartTrend}>{trend}</Text>
      </View>
      <View style={styles.weeklyBars}>
        {snapshot.days.map((day) => (
          <View
            accessibilityLabel={t('learn.daySessions', { count: day.sessions, date: day.date })}
            key={day.date}
            style={styles.weeklyBarColumn}
          >
            <View style={styles.weeklyBarTrack}>
              <View style={[
                styles.weeklyBarFill,
                { height: day.sessions === 0 ? 3 : Math.max(7, Math.round((day.sessions / busiestDay) * 28)) },
              ]} />
            </View>
            <Text style={styles.weeklyDayLabel}>{learningDayLabel(day.date, language)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function learningDayLabel(date: string, language: string): string {
  const locale = language === 'zh-Hans' ? 'zh-CN' : language === 'zh-Hant' ? 'zh-TW' : 'en-US';
  return new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00.000Z`));
}

function MasteryTrackRow({
  label,
  onPress,
  snapshot,
}: {
  label: string;
  onPress: () => void;
  snapshot: ChapterMasterySnapshot;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={`${label}. ${t('learn.masteryPercent', { score: snapshot.masteryPercent })}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.masteryTrackRow, pressed && styles.pressed]}
    >
      <View style={styles.masteryTrackCopy}>
        <View style={styles.masteryTrackHeading}>
          <Text style={styles.masteryTrackLabel}>{label}</Text>
          <Text style={styles.masteryTrackMeta}>{snapshot.completedSteps}/{snapshot.totalSteps}</Text>
        </View>
        <View style={styles.masteryTrack}>
          <View style={[styles.masteryTrackFill, { width: `${snapshot.masteryPercent}%` }]} />
        </View>
        {snapshot.dueReviews > 0 ? (
          <Text style={styles.masteryTrackDue}>{t('learn.reviewSpotsDue', { count: snapshot.dueReviews })}</Text>
        ) : null}
      </View>
      <Text style={styles.masteryTrackScore}>{snapshot.masteryPercent}%</Text>
      <Ionicons color={palette.muted} name="chevron-forward" size={15} />
    </Pressable>
  );
}

function chapterLabel(
  chapter: CurriculumChapterId,
  t: (key: MessageKey) => string,
): string {
  if (chapter === 'fundamentals') return t('learn.fundamentals');
  if (chapter === 'preflop') return t('learn.preflopStrategy');
  if (chapter === 'postflop') return t('learn.postflopFoundations');
  if (chapter === 'tournament') return t('learn.tournament');
  if (chapter === 'opponents') return t('learn.opponents');
  return t('learn.advancedMath');
}

function learningConceptLabel(
  concept: import('../../domain/learning/adaptiveRecommendation').LearningConceptId,
  t: (key: MessageKey) => string,
): string {
  const keys: Record<import('../../domain/learning/adaptiveRecommendation').LearningConceptId, MessageKey> = {
    'poker-basics': 'concept.pokerBasics',
    'table-math': 'concept.tableMath',
    'betting-purpose': 'concept.bettingPurpose',
    'preflop-entry': 'concept.preflopEntry',
    'preflop-pressure': 'concept.preflopPressure',
    'preflop-three-bet': 'concept.preflopThreeBet',
    'postflop-betting': 'concept.postflopBetting',
    'postflop-odds': 'concept.postflopOdds',
    'postflop-range': 'concept.postflopRange',
    'postflop-river': 'concept.postflopRiver',
    'tournament-short-stack': 'concept.tournamentShortStack',
    'tournament-bubble': 'concept.tournamentBubble',
    'opponent-adjustments': 'concept.opponentAdjustments',
    'advanced-math': 'concept.advancedMath',
  };
  return t(keys[concept]);
}

function curriculumStepText(
  step: CurriculumStep,
  field: 'description' | 'title',
  activityText: (activity: { description: string; id: string; title: string }, field: 'description' | 'title') => string,
  practicePackText: (pack: { description: string; id: string; title: string }, field: 'description' | 'title') => string,
): string {
  if (step.kind === 'lesson') return activityText(step.lesson, field);
  if (step.kind === 'practice') return practicePackText(step.pack, field);
  if (step.kind === 'mission') return activityText(step.mission, field);
  return activityText(step.trainer, field);
}

function curriculumStepMinutes(step: CurriculumStep): number {
  if (step.kind === 'lesson') return step.lesson.estimatedMinutes;
  if (step.kind === 'practice') return 5;
  if (step.kind === 'mission') return step.mission.estimatedMinutes;
  return step.trainer.estimatedMinutes;
}

function scenarioReviewQuestion(
  item: Exclude<LearningReviewItem, { source: 'trainer' }>,
  scenario: ScenarioSpot,
  t: (key: MessageKey, values?: Record<string, string | number>) => string,
): TrainerQuestion {
  return {
    id: item.id,
    prompt: scenario.prompt,
    context: t('learn.reviewScenarioContext', {
      action: scenario.opponentAction,
      position: scenario.position,
      pot: scenario.potBb,
    }),
    heroCards: scenario.heroCards,
    board: scenario.board,
    choices: scenario.choices.map((choice) => ({ id: choice.id, label: choice.label, feedback: choice.feedback })),
    correctChoiceId: scenario.bestChoiceId,
    explanation: `${scenario.reasoning}\n\n${scenario.takeaway}`,
  };
}

function localizedFocus(
  focus: Exclude<CoachFocusArea, 'none'>,
  t: (key: MessageKey) => string,
): string {
  const keys: Record<Exclude<CoachFocusArea, 'none'>, MessageKey> = {
    preflop: 'focus.preflop',
    'value-betting': 'focus.valueBetting',
    bluffing: 'focus.bluffing',
    calling: 'focus.calling',
    'bet-sizing': 'focus.betSizing',
    'pot-odds': 'focus.potOdds',
    draws: 'focus.draws',
  };
  return t(keys[focus]);
}

function lessonIcon(id: string): IconName {
  const icons: Record<string, IconName> = {
    'lesson-hand-rankings': 'layers-outline',
    'lesson-position-blinds': 'navigate-outline',
    'lesson-actions-order': 'swap-horizontal-outline',
    'lesson-starting-hands': 'grid-outline',
    'lesson-outs-equity-odds': 'calculator-outline',
    'lesson-value-bluffs': 'flash-outline',
    'lesson-preflop-opening-position': 'compass-outline',
    'lesson-preflop-limpers': 'people-outline',
    'lesson-preflop-facing-raise': 'git-compare-outline',
    'lesson-preflop-blind-defense': 'shield-outline',
    'lesson-preflop-three-bet-plan': 'trending-up-outline',
    'lesson-preflop-facing-three-bet': 'swap-vertical-outline',
    'lesson-postflop-board-texture': 'apps-outline',
    'lesson-postflop-continuation-bets': 'pulse-outline',
    'lesson-postflop-value-sizing': 'resize-outline',
    'lesson-postflop-playing-draws': 'water-outline',
    'lesson-postflop-river-decisions': 'checkmark-done-outline',
    'lesson-postflop-range-advantage': 'analytics-outline',
    'lesson-postflop-three-bet-pots': 'layers-outline',
    'lesson-postflop-turn-barrels': 'trending-up-outline',
    'lesson-postflop-river-polarization': 'git-compare-outline',
    'lesson-postflop-river-bluff-catchers': 'shield-checkmark-outline',
    'lesson-tournament-stack-zones': 'speedometer-outline',
    'lesson-tournament-short-stack-opens': 'arrow-up-circle-outline',
    'lesson-tournament-reshoves-calls': 'repeat-outline',
    'lesson-tournament-risk-premium': 'shield-half-outline',
    'lesson-tournament-stack-coverage': 'podium-outline',
    'lesson-tournament-bubble-decisions': 'list-outline',
    'lesson-opponents-evidence': 'analytics-outline',
    'lesson-opponents-callers-folders': 'swap-horizontal-outline',
    'lesson-opponents-aggression-traps': 'warning-outline',
    'lesson-math-implied-odds': 'trending-up-outline',
    'lesson-math-reverse-implied-odds': 'trending-down-outline',
    'lesson-math-break-even-bluffs': 'calculator-outline',
  };
  return icons[id] ?? 'book-outline';
}

function ChapterCard({
  children,
  complete,
  description,
  expanded,
  icon,
  label,
  meta,
  onPress,
  total,
}: {
  accent?: 'indigo' | 'aqua';
  children: ReactNode;
  complete?: number;
  description: string;
  expanded: boolean;
  icon: IconName;
  label: string;
  meta?: string;
  onPress: () => void;
  total?: number;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const percent = complete !== undefined && total ? Math.round((complete / total) * 100) : null;
  return (
    <View style={[styles.chapterCard, expanded && styles.chapterCardExpanded]}>
      <Pressable
        accessibilityLabel={`${label}. ${description}. ${expanded ? t('learn.collapseChapter') : t('learn.expandChapter')}`}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onPress}
        style={({ pressed }) => [styles.chapterHeader, pressed && styles.pressed]}
      >
        <View style={styles.chapterIcon}>
          <Ionicons color={palette.primary} name={icon} size={20} />
        </View>
        <View style={styles.chapterCopy}>
          <View style={styles.chapterTitleRow}>
            <Text style={styles.chapterTitle}>{label}</Text>
            <Text style={styles.chapterMeta}>{meta ?? `${complete ?? 0}/${total ?? 0}`}</Text>
          </View>
          <Text numberOfLines={expanded ? 2 : 1} style={styles.chapterDescription}>{description}</Text>
          {percent !== null ? (
            <View style={styles.chapterTrack}>
              <View style={[styles.chapterFill, { width: `${percent}%` }]} />
            </View>
          ) : null}
        </View>
        <Ionicons color={palette.muted} name={expanded ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>
      {expanded ? <View style={styles.chapterBody}>{children}</View> : null}
    </View>
  );
}

function SectionHeader({ description, label }: { description?: string; label: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{label}</Text>
      {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
    </View>
  );
}

function LessonRow({
  accent = 'indigo',
  lesson,
  onPress,
  progress,
}: {
  accent?: 'indigo' | 'aqua';
  lesson: LessonDefinition;
  onPress: () => void;
  progress?: LearningProgressEntry;
}) {
  const { activityText, t } = useLocalization();
  return (
    <LearningRow
      accent={accent}
      completed={progress?.status === 'completed'}
      description={activityText(lesson, 'description')}
      icon={lessonIcon(lesson.id)}
      label={activityText(lesson, 'title')}
      meta={lesson.difficulty === 'intermediate'
        ? `${t('common.intermediate')} · ${t('common.minutes', { count: lesson.estimatedMinutes })}`
        : t('common.minutes', { count: lesson.estimatedMinutes })}
      onPress={onPress}
    />
  );
}

function MissionRow({ mission, onPress, prerequisitesComplete, progress, tone }: {
  mission: TableMissionDefinition;
  onPress: () => void;
  prerequisitesComplete: boolean;
  progress?: LearningProgressEntry;
  tone: 'indigo' | 'aqua';
}) {
  const { activityText, t } = useLocalization();
  return (
    <LearningRow
      accent={tone}
      completed={progress?.status === 'completed'}
      description={activityText(mission, 'description')}
      icon={mission.curriculumTrack === 'preflop'
        ? 'flag-outline'
        : mission.curriculumTrack === 'tournament'
          ? 'podium-outline'
          : mission.curriculumTrack === 'opponents'
            ? 'eye-outline'
            : 'pulse-outline'}
      label={activityText(mission, 'title')}
      meta={progress?.bestScore === null || progress?.bestScore === undefined
        ? prerequisitesComplete
          ? t('common.minutes', { count: mission.estimatedMinutes })
          : t('learn.afterLessons', { count: mission.prerequisiteIds.length })
        : t('common.best', { score: progress.bestScore })}
      onPress={onPress}
    />
  );
}

function MasteryRow({ accent = 'indigo', onPress, progress, trainer }: {
  accent?: 'indigo' | 'aqua';
  onPress: () => void;
  progress?: LearningProgressEntry;
  trainer: TrainerDefinition;
}) {
  const { activityText, t } = useLocalization();
  return (
    <LearningRow
      accent={accent}
      completed={progress?.status === 'completed'}
      description={activityText(trainer, 'description')}
      icon={accent === 'aqua' ? 'ribbon-outline' : 'trophy-outline'}
      label={activityText(trainer, 'title')}
      meta={progress?.bestScore === null || progress?.bestScore === undefined
        ? t('common.minutes', { count: trainer.estimatedMinutes })
        : t('common.best', { score: progress.bestScore })}
      onPress={onPress}
    />
  );
}

function LearningRow({
  completed = false,
  description,
  icon,
  label,
  meta,
  onPress,
}: {
  accent?: 'indigo' | 'aqua';
  completed?: boolean;
  description: string;
  icon: IconName;
  label: string;
  meta?: string;
  onPress: () => void;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={[label, description, meta, completed ? t('learn.completed') : null].filter(Boolean).join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowIcon}>
        <Ionicons color={palette.primary} name={icon} size={18} />
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={2} style={styles.rowTitle}>{label}</Text>
          {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
        </View>
        <Text numberOfLines={2} style={styles.rowDescription}>{description}</Text>
      </View>
      {completed
        ? <Ionicons color={palette.aqua} name="checkmark-circle" size={20} />
        : <Ionicons color={palette.muted} name="chevron-forward" size={17} />}
    </Pressable>
  );
}

function ToolCard({
  description,
  icon,
  label,
  onPress,
  score,
}: {
  accent?: 'indigo' | 'aqua';
  description: string;
  icon: IconName;
  label: string;
  onPress: () => void;
  score?: number | null;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={[label, description, score === null || score === undefined ? t('learn.notStarted') : t('learn.bestScore', { score })].join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.toolCard, pressed && styles.pressed]}
    >
      <View style={styles.toolIcon}>
        <Ionicons color={palette.primary} name={icon} size={20} />
      </View>
      <Text style={styles.toolTitle}>{label}</Text>
      <Text style={styles.toolDescription}>{description}</Text>
      <Text style={styles.toolScore}>{score === null || score === undefined ? t('learn.start') : t('common.best', { score })}</Text>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: { width: '100%', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30, gap: 12 },
    contentTablet: { maxWidth: 800, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 18, paddingBottom: 44, gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
    title: { flexShrink: 1, color: palette.text, fontSize: 28, lineHeight: 33, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    planCard: { gap: 10, padding: 14, borderRadius: 21, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 22, elevation: 3 },
    planHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
    planIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    planHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
    planTitle: { color: palette.text, fontSize: 17, lineHeight: 21, fontWeight: '800', letterSpacing: -0.25 },
    planDescription: { color: palette.muted, fontSize: 11, lineHeight: 16 },
    planLoading: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, backgroundColor: palette.soft },
    planLoadingText: { color: palette.muted, fontSize: 11, fontWeight: '700' },
    planList: { gap: 7 },
    planRow: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    planRowPrimary: { borderColor: palette.primary, backgroundColor: palette.accentSoft },
    planStep: { width: 27, height: 27, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: palette.soft },
    planStepPrimary: { backgroundColor: palette.primary },
    planStepText: { color: palette.muted, fontSize: 10, fontWeight: '800' },
    planStepTextPrimary: { color: palette.primaryText },
    planRowCopy: { flex: 1, minWidth: 0, gap: 2 },
    planRowMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    planBadge: { color: palette.primary, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.45, textTransform: 'uppercase' },
    planMinutes: { color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
    planRowTitle: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '800' },
    planReason: { color: palette.muted, fontSize: 11, lineHeight: 15 },
    planArrow: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: palette.accentSoft },
    planArrowPrimary: { backgroundColor: palette.primary },
    planDisclosure: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 12 },
    planDisclosureText: { color: palette.primary, fontSize: 11, lineHeight: 15, fontWeight: '800', textAlign: 'center' },
    continueCard: { gap: 7, padding: 15, borderRadius: 21, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 22, elevation: 3 },
    cardOrb: { position: 'absolute', width: 154, height: 154, right: -52, top: -60, borderRadius: 77, backgroundColor: palette.accentSoft },
    recommendationMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    timePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: palette.aquaSoft },
    timeText: { color: palette.aquaText, fontSize: 11, fontWeight: '700' },
    progressLabel: { maxWidth: 92, color: palette.muted, fontSize: 11, lineHeight: 15, fontWeight: '600', textAlign: 'right' },
    recommendationTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    recommendationTitleMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    continueEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    recommendationTitle: { flex: 1, color: palette.text, fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.35 },
    recommendationDescription: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    pathTrack: { height: 5, marginTop: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: palette.soft },
    pathFill: { height: '100%', borderRadius: 4, backgroundColor: palette.aqua },
    masteryCard: { borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' },
    masteryCardExpanded: { backgroundColor: palette.surfaceRaised },
    masteryHeader: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
    masteryIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.accentSoft },
    masteryHeaderCopy: { flex: 1, minWidth: 0, gap: 2 },
    masteryEyebrow: { color: palette.primary, fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
    masteryTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    masterySummary: { color: palette.muted, fontSize: 11, lineHeight: 15 },
    masteryHeaderMeta: { maxWidth: 72, alignItems: 'flex-end', gap: 1 },
    masteryScore: { color: palette.aquaText, fontSize: 17, fontWeight: '800' },
    masteryScoreLabel: { color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'right' },
    masteryBody: { gap: 7, paddingHorizontal: 11, paddingBottom: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    weeklyTrendCard: { gap: 7, marginTop: 9, padding: 9, borderRadius: 13, backgroundColor: palette.surface },
    weeklyStatsRow: { flexDirection: 'row', alignItems: 'stretch', gap: 4 },
    weeklyStat: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 3 },
    weeklyStatValueRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    weeklyStatValue: { color: palette.text, fontSize: 14, fontWeight: '800' },
    weeklyStatLabel: { color: palette.muted, fontSize: 9.5, lineHeight: 13, fontWeight: '700', textAlign: 'center' },
    weeklyChartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    weeklyChartTitle: { color: palette.text, fontSize: 10, lineHeight: 14, fontWeight: '800' },
    weeklyChartTrend: { flex: 1, color: palette.aquaText, fontSize: 9.5, lineHeight: 13, fontWeight: '700', textAlign: 'right' },
    weeklyBars: { height: 43, flexDirection: 'row', alignItems: 'flex-end', gap: 5 },
    weeklyBarColumn: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 2 },
    weeklyBarTrack: { height: 28, width: '100%', maxWidth: 17, alignItems: 'stretch', justifyContent: 'flex-end', borderRadius: 4, overflow: 'hidden', backgroundColor: palette.soft },
    weeklyBarFill: { width: '100%', borderRadius: 4, backgroundColor: palette.aqua },
    weeklyDayLabel: { color: palette.muted, fontSize: 9, lineHeight: 12, fontWeight: '700' },
    insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    insightCard: { flexBasis: '47%', flexGrow: 1, minHeight: 76, gap: 3, padding: 9, borderRadius: 12, backgroundColor: palette.surface },
    insightHeading: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    insightLabel: { color: palette.muted, fontSize: 9.5, lineHeight: 13, fontWeight: '800', letterSpacing: 0.35, textTransform: 'uppercase' },
    insightValue: { color: palette.text, fontSize: 12, lineHeight: 16, fontWeight: '800' },
    insightDetail: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    insightEmpty: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 12, backgroundColor: palette.surface },
    insightEmptyText: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 14 },
    masteryFocusRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    masteryFocusText: { flex: 1, color: palette.text, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
    masteryDue: { color: palette.primary, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    masteryReviewAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, borderRadius: 12, backgroundColor: palette.accentSoft },
    masteryOnTrack: { color: palette.aquaText, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    masteryTrackRow: { minHeight: 57, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 13, backgroundColor: palette.surface },
    masteryTrackCopy: { flex: 1, minWidth: 0, gap: 4 },
    masteryTrackHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    masteryTrackLabel: { flex: 1, color: palette.text, fontSize: 11, fontWeight: '700' },
    masteryTrackMeta: { color: palette.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
    masteryTrack: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: palette.soft },
    masteryTrackFill: { height: '100%', borderRadius: 2, backgroundColor: palette.aqua },
    masteryTrackDue: { color: palette.primary, fontSize: 10, lineHeight: 14, fontWeight: '700' },
    masteryTrackScore: { minWidth: 31, color: palette.aquaText, fontSize: 12, fontWeight: '800', textAlign: 'right' },
    masteryNote: { color: palette.muted, fontSize: 10, lineHeight: 14, textAlign: 'center', paddingHorizontal: 8, paddingTop: 2 },
    browseCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    browseIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    browseCopy: { flex: 1, minWidth: 0, gap: 2 },
    browseTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    browseDescription: { color: palette.muted, fontSize: 11, lineHeight: 15 },
    focusCard: { gap: 11, padding: 14, borderRadius: 19, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.accentSoft },
    focusHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    focusIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.surface },
    focusCopy: { flex: 1, gap: 2 },
    focusEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
    focusTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
    focusDescription: { color: palette.muted, fontSize: 11, lineHeight: 16 },
    guidedScorePill: { minWidth: 49, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, backgroundColor: palette.aquaSoft },
    guidedScoreValue: { color: palette.aquaText, fontSize: 13, fontWeight: '800' },
    guidedStatus: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 2 },
    guidedStatusText: { flex: 1, color: palette.muted, fontSize: 11, lineHeight: 16 },
    guidedChange: { color: palette.aquaText, fontSize: 10.5, lineHeight: 14, fontWeight: '800' },
    guidedChangeDown: { color: palette.danger },
    focusActions: { flexDirection: 'row', gap: 8 },
    secondaryAction: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    secondaryActionText: { color: palette.primary, fontSize: 11, fontWeight: '800' },
    primaryAction: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 13, backgroundColor: palette.primary },
    primaryActionText: { color: palette.primaryText, fontSize: 11, fontWeight: '800' },
    reviewCard: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    reviewIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.aquaSoft },
    reviewCopy: { flex: 1, minWidth: 0, gap: 3 },
    reviewTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    reviewDescription: { color: palette.muted, fontSize: 10, lineHeight: 15 },
    reviewBadge: { minWidth: 26, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.aquaSoft },
    reviewBadgeText: { color: palette.aquaText, fontSize: 11, fontWeight: '800' },
    curriculumTitle: { color: palette.text, fontSize: 16, fontWeight: '800', marginTop: 4, paddingHorizontal: 2 },
    chapterCard: { borderRadius: 19, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' },
    chapterCardExpanded: { backgroundColor: palette.surfaceRaised },
    chapterHeader: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 13 },
    chapterIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.accentSoft },
    chapterCopy: { flex: 1, minWidth: 0, gap: 4 },
    chapterTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    chapterTitle: { flex: 1, color: palette.text, fontSize: 15, fontWeight: '800' },
    chapterMeta: { color: palette.primary, fontSize: 10, fontWeight: '800' },
    chapterDescription: { color: palette.muted, fontSize: 11.5, lineHeight: 16 },
    chapterTrack: { height: 4, overflow: 'hidden', borderRadius: 2, backgroundColor: palette.soft },
    chapterFill: { height: '100%', borderRadius: 2, backgroundColor: palette.aqua },
    chapterBody: { gap: 9, paddingHorizontal: 10, paddingBottom: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.border },
    sectionHeader: { gap: 3, marginTop: 9, paddingHorizontal: 2 },
    sectionTitle: { color: palette.muted, fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    sectionDescription: { color: palette.muted, fontSize: 11, lineHeight: 15 },
    list: { paddingHorizontal: 11, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    row: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    rowIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft },
    rowCopy: { flex: 1, minWidth: 0, gap: 3 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    rowTitle: { flex: 1, color: palette.text, fontSize: 13, lineHeight: 17, fontWeight: '700' },
    rowMeta: { flexShrink: 0, maxWidth: 100, color: palette.muted, fontSize: 10.5, lineHeight: 14, fontWeight: '600', textAlign: 'right' },
    rowDescription: { color: palette.muted, fontSize: 11.5, lineHeight: 16 },
    toolGrid: { flexDirection: 'row', gap: 9 },
    toolCard: { flex: 1, minHeight: 142, gap: 6, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    toolIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft, marginBottom: 2 },
    toolTitle: { color: palette.text, fontSize: 13, lineHeight: 17, fontWeight: '700' },
    toolDescription: { flex: 1, color: palette.muted, fontSize: 11.5, lineHeight: 16 },
    toolScore: { color: palette.primary, fontSize: 11, lineHeight: 15, fontWeight: '800' },
    footerNote: { color: palette.muted, fontSize: 10.5, lineHeight: 15, textAlign: 'center', marginTop: 3 },
    pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  });
}
