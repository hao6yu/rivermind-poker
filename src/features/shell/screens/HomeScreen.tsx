import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import type { AiDifficulty } from '../../../domain/poker/aiProfiles';
import type { AdaptiveLearningRecommendation } from '../../../domain/learning/adaptiveRecommendation';
import type { LearningActivityDefinition } from '../../../domain/learning/types';
import { lessons } from '../../../domain/learning/content';
import type { LearningGoalId } from '../../../domain/learning/guidedProgress';
import type { RecommendedSessionPlan } from '../../../domain/learning/recommendedSession';
import { RecommendedSessionHomeCard } from '../../learn/RecommendedSessionHomeCard';
import { resolveLocalAiDifficulty } from '../aiGameModePolicy';
import { difficultyLabel } from '../playPresentation';
import { PokerToolsCard } from '../PokerToolsCard';
import {
  ScreenHeader,
  ScreenScroll,
  MenuRow,
  learningGoalTitle,
  quickPlayStartingChips,
  type ProfileIdentity,
} from '../shellChrome';
import { createStyles } from '../shellStyles';
import { useLocalization } from '../../../localization';
import { useAppTheme } from '../../../theme';

export function HomeScreen({
  aiDifficulty,
  completedLessons,
  dailyCaption,
  fallbackLearningRecommendation,
  learningRecommendation,
  learningGoal,
  onAllGames,
  onDailyChallenge,
  onOpenRoster,
  onOpenProfile,
  onQuickPlay,
  onStartLearning,
  profileIdentity,
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
  onQuickPlay: () => void;
  onOpenRoster: () => void;
  onOpenProfile: () => void;
  onStartLearning: () => void;
  profileIdentity: ProfileIdentity;
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
      <ScreenHeader
        eyebrow={t('home.eyebrow')}
        identity={profileIdentity}
        title={t('home.title')}
        onProfile={onOpenProfile}
      />
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
      {/* DT-10: the compact collapsible Poker tools card replaces the old
          two-step "cheat sheets" row. Each tool opens its exact Learn
          reference sheet in one tap and returns to Home. */}
      <PokerToolsCard />
      {onOpenRoster ? (
        <MenuRow
          compact
          flat
          icon="people-outline"
          label={t('home.meetThePlayers')}
          description={t('home.meetThePlayersDescription')}
          onPress={onOpenRoster}
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
