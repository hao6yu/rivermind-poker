import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { cheatSheets, findLearningActivity, handQuiz, lessons, percentageTrainer, scenarioTrainer } from '../../domain/learning/content';
import { practicePackForFocus } from '../../domain/learning/practicePacks';
import { completedLessonCount, learningProgressById, recommendedLearningActivityId } from '../../domain/learning/progress';
import type {
  CheatSheetDefinition,
  LearningActivityDefinition,
  LearningProgressEntry,
  LearningResultInput,
  LessonDefinition,
  TrainerDefinition,
} from '../../domain/learning/types';
import { type ThemePalette, useAppTheme } from '../../theme';
import { LessonModal } from './LessonModal';
import { ReferenceModal } from './ReferenceModal';
import { ScenarioTrainingModal } from './ScenarioTrainingModal';
import { TrainerModal } from './TrainerModal';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface LearnScreenProps {
  launchActivityId: string | null;
  launchSheetId: string | null;
  loading: boolean;
  onLaunchActivityHandled: () => void;
  onLaunchSheetHandled: () => void;
  onOpenProfile: () => void;
  onRecordResult: (input: LearningResultInput) => void;
  practiceFocus?: string | null;
  progress: LearningProgressEntry[];
}

export function LearnScreen({
  launchActivityId,
  launchSheetId,
  loading,
  onLaunchActivityHandled,
  onLaunchSheetHandled,
  onOpenProfile,
  onRecordResult,
  practiceFocus,
  progress,
}: LearnScreenProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [activeLesson, setActiveLesson] = useState<LessonDefinition | null>(null);
  const [activeTrainer, setActiveTrainer] = useState<TrainerDefinition | null>(null);
  const [activeSheet, setActiveSheet] = useState<CheatSheetDefinition | null>(null);
  const [scenarioVisible, setScenarioVisible] = useState(false);
  const [scenarioPracticeFocus, setScenarioPracticeFocus] = useState<string | null>(null);
  const progressById = learningProgressById(progress);
  const completedLessons = completedLessonCount(progress);
  const recommendationId = recommendedLearningActivityId(progress, practiceFocus);
  const recommendation = findLearningActivity(recommendationId) ?? lessons[0]!;
  const recommendedPack = recommendation.type === 'scenario_drill'
    ? practicePackForFocus(practiceFocus)
    : null;
  const activeScenarioPack = practicePackForFocus(scenarioPracticeFocus);
  const scenarioBestScore = progressById.get(scenarioTrainer.id)?.bestScore ?? null;
  const activeScenarioBestScore = activeScenarioPack
    ? progressById.get(activeScenarioPack.progressActivityId)?.bestScore ?? null
    : scenarioBestScore;
  const pathPercent = Math.round((completedLessons / lessons.length) * 100);

  const openActivity = useCallback((activity: LearningActivityDefinition, focus?: string | null) => {
    if (activity.type === 'lesson') setActiveLesson(activity);
    else if (activity.type === 'scenario_drill') {
      setScenarioPracticeFocus(focus ?? null);
      setScenarioVisible(true);
    }
    else setActiveTrainer(activity);
  }, []);

  useEffect(() => {
    if (!launchActivityId) return;
    openActivity(findLearningActivity(launchActivityId) ?? recommendation, practiceFocus);
    onLaunchActivityHandled();
  }, [launchActivityId, onLaunchActivityHandled, openActivity, practiceFocus, recommendation]);

  useEffect(() => {
    if (!launchSheetId) return;
    setActiveSheet(cheatSheets.find((sheet) => sheet.id === launchSheetId) ?? cheatSheets[0] ?? null);
    onLaunchSheetHandled();
  }, [launchSheetId, onLaunchSheetHandled]);

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Build your game</Text>
            <Text accessibilityRole="header" style={styles.title}>Learn</Text>
          </View>
          <Pressable accessibilityLabel="Open profile" accessibilityRole="button" onPress={onOpenProfile} style={styles.iconButton}>
            <Ionicons color={palette.text} name="person-outline" size={19} />
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel={`${recommendedPack ? 'Your session focus' : 'Recommended next'}. ${recommendedPack?.title ?? recommendation.title}. ${recommendedPack ? 5 : recommendation.estimatedMinutes} minutes`}
          accessibilityRole="button"
          onPress={() => openActivity(recommendation, practiceFocus)}
          style={({ pressed }) => [styles.continueCard, pressed && styles.pressed]}
        >
          <View style={styles.cardOrb} />
          <View style={styles.recommendationMeta}>
            <Text style={styles.continueEyebrow}>{recommendedPack ? 'Your session focus' : 'Recommended next'}</Text>
            <Text style={styles.progressLabel}>{loading ? 'Syncing progress…' : `${completedLessons} of ${lessons.length} lessons`}</Text>
          </View>
          <View style={styles.recommendationTitleRow}>
            <Text numberOfLines={1} style={styles.recommendationTitle}>{recommendedPack?.title ?? recommendation.title}</Text>
            <View style={styles.recommendationTitleMeta}>
              <View style={styles.timePill}>
                <Ionicons color={palette.aquaText} name="time-outline" size={13} />
                <Text style={styles.timeText}>{recommendedPack ? 5 : recommendation.estimatedMinutes} min</Text>
              </View>
              <Ionicons color={palette.muted} name="arrow-forward" size={15} />
            </View>
          </View>
          <Text numberOfLines={2} style={styles.recommendationDescription}>{recommendedPack?.description ?? recommendation.description}</Text>
          <View
            accessibilityLabel={`Learning path ${pathPercent}% complete`}
            accessibilityRole="progressbar"
            accessibilityValue={{ max: 100, min: 0, now: pathPercent }}
            style={styles.pathTrack}
          >
            <View style={[styles.pathFill, { width: `${pathPercent}%` }]} />
          </View>
        </Pressable>

        <SectionHeader label="Fundamentals" meta={`${completedLessons}/${lessons.length}`} />
        <View style={styles.list}>
          {lessons.map((lesson, index) => (
            <LearningRow
              completed={progressById.get(lesson.id)?.status === 'completed'}
              description={lesson.description}
              icon={index === 0 ? 'layers-outline' : index === 1 ? 'navigate-outline' : index === 2 ? 'swap-horizontal-outline' : index === 3 ? 'grid-outline' : index === 4 ? 'calculator-outline' : 'flash-outline'}
              key={lesson.id}
              label={lesson.title}
              meta={`${lesson.estimatedMinutes} min`}
              onPress={() => setActiveLesson(lesson)}
            />
          ))}
        </View>

        <SectionHeader label="Practice your decisions" />
        <View style={styles.toolGrid}>
          <ToolCard
            description="Outs and pot odds"
            icon="stats-chart-outline"
            label="Percentage trainer"
            onPress={() => setActiveTrainer(percentageTrainer)}
            score={progressById.get(percentageTrainer.id)?.bestScore}
          />
          <ToolCard
            accent="aqua"
            description="Action and reasoning"
            icon="help-circle-outline"
            label="Hand quiz"
            onPress={() => setActiveTrainer(handQuiz)}
            score={progressById.get(handQuiz.id)?.bestScore}
          />
        </View>
        <View style={styles.list}>
          <LearningRow
            accent="aqua"
            description="Six fresh spots from fourteen validated decision templates"
            icon="locate-outline"
            label="Scenario training"
            meta={scenarioBestScore === null
              ? `${scenarioTrainer.estimatedMinutes} min`
              : `Best · ${scenarioBestScore}%`}
            onPress={() => openActivity(scenarioTrainer, null)}
          />
        </View>

        <SectionHeader label="Quick reference" />
        <View style={styles.list}>
          {cheatSheets.map((sheet, index) => (
            <LearningRow
              accent={index % 2 === 1 ? 'aqua' : 'indigo'}
              description={sheet.description}
              icon={index === 0 ? 'albums-outline' : index === 1 ? 'compass-outline' : index === 2 ? 'pie-chart-outline' : 'apps-outline'}
              key={sheet.id}
              label={sheet.title}
              onPress={() => setActiveSheet(sheet)}
            />
          ))}
        </View>
        <Text style={styles.footerNote}>Practice chips only · Strategy is a learning baseline, not a guarantee.</Text>
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
        bestScore={activeTrainer ? progressById.get(activeTrainer.id)?.bestScore ?? null : null}
        onClose={() => setActiveTrainer(null)}
        onComplete={(trainer, score) => onRecordResult({
          activityId: trainer.id,
          activityType: trainer.type,
          completed: true,
          score,
          countAttempt: true,
        })}
        trainer={activeTrainer}
      />
      <ReferenceModal onClose={() => setActiveSheet(null)} sheet={activeSheet} />
      <ScenarioTrainingModal
        bestScore={activeScenarioBestScore}
        onClose={() => {
          setScenarioVisible(false);
          setScenarioPracticeFocus(null);
        }}
        onComplete={(trainer, score) => onRecordResult({
          activityId: trainer.id,
          activityType: trainer.type,
          completed: true,
          score,
          countAttempt: true,
        })}
        practiceFocus={scenarioPracticeFocus}
        visible={scenarioVisible}
      />
    </>
  );
}

function SectionHeader({ label, meta }: { label: string; meta?: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{label}</Text>
      {meta && <Text style={styles.sectionMeta}>{meta}</Text>}
    </View>
  );
}

function LearningRow({
  accent = 'indigo',
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={[label, description, meta, completed ? 'Completed' : null].filter(Boolean).join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={[styles.rowIcon, accent === 'aqua' && styles.rowIconAqua]}>
        <Ionicons color={accent === 'aqua' ? palette.aqua : palette.primary} name={icon} size={18} />
      </View>
      <View style={styles.rowCopy}>
        <View style={styles.rowTitleLine}>
          <Text numberOfLines={1} style={styles.rowTitle}>{label}</Text>
          {meta && <Text style={styles.rowMeta}>{meta}</Text>}
        </View>
        <Text numberOfLines={1} style={styles.rowDescription}>{description}</Text>
      </View>
      {completed
        ? <Ionicons color={palette.aqua} name="checkmark-circle" size={20} />
        : <Ionicons color={palette.muted} name="chevron-forward" size={17} />}
    </Pressable>
  );
}

function ToolCard({
  accent = 'indigo',
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={[label, description, score === null || score === undefined ? 'Not started' : `Best score ${score}%`].join('. ')}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.toolCard, pressed && styles.pressed]}
    >
      <View style={[styles.toolIcon, accent === 'aqua' && styles.rowIconAqua]}>
        <Ionicons color={accent === 'aqua' ? palette.aqua : palette.primary} name={icon} size={20} />
      </View>
      <Text style={styles.toolTitle}>{label}</Text>
      <Text style={styles.toolDescription}>{description}</Text>
      <Text style={styles.toolScore}>{score === null || score === undefined ? 'Start' : `Best · ${score}%`}</Text>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    screen: { flex: 1 },
    content: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 30, gap: 13 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
    eyebrow: { color: palette.primary, fontSize: 11, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.8, marginTop: 3 },
    iconButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    continueCard: { gap: 7, padding: 15, borderRadius: 21, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised, overflow: 'hidden', shadowColor: palette.shadow, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 22, elevation: 3 },
    cardOrb: { position: 'absolute', width: 154, height: 154, right: -52, top: -60, borderRadius: 77, backgroundColor: palette.accentSoft },
    recommendationMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    timePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, backgroundColor: palette.aquaSoft },
    timeText: { color: palette.aquaText, fontSize: 11, fontWeight: '700' },
    progressLabel: { color: palette.muted, fontSize: 10, fontWeight: '600' },
    recommendationTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    recommendationTitleMeta: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    continueEyebrow: { color: palette.primary, fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    recommendationTitle: { flex: 1, color: palette.text, fontSize: 18, lineHeight: 23, fontWeight: '700', letterSpacing: -0.35 },
    recommendationDescription: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    pathTrack: { height: 5, marginTop: 2, borderRadius: 4, overflow: 'hidden', backgroundColor: palette.soft },
    pathFill: { height: '100%', borderRadius: 4, backgroundColor: palette.aqua },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, paddingHorizontal: 2 },
    sectionTitle: { color: palette.text, fontSize: 14, fontWeight: '800' },
    sectionMeta: { color: palette.muted, fontSize: 10, fontWeight: '700' },
    list: { paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    row: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.border },
    rowIcon: { width: 37, height: 37, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft },
    rowIconAqua: { backgroundColor: palette.aquaSoft },
    rowCopy: { flex: 1, gap: 3 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rowTitle: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '700' },
    rowMeta: { color: palette.muted, fontSize: 9, fontWeight: '600' },
    rowDescription: { color: palette.muted, fontSize: 10, lineHeight: 15 },
    toolGrid: { flexDirection: 'row', gap: 10 },
    toolCard: { flex: 1, minHeight: 152, gap: 6, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    toolIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentSoft, marginBottom: 3 },
    toolTitle: { color: palette.text, fontSize: 13, lineHeight: 17, fontWeight: '700' },
    toolDescription: { flex: 1, color: palette.muted, fontSize: 10, lineHeight: 15 },
    toolScore: { color: palette.primary, fontSize: 10, fontWeight: '800' },
    footerNote: { color: palette.muted, fontSize: 9, lineHeight: 14, textAlign: 'center', marginTop: 3 },
    pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  });
}
