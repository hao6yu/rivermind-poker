import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { findLearningActivity } from '../../domain/learning/content';
import { practicePackForFocus } from '../../domain/learning/practicePacks';
import { learningActivityIdForFocus } from '../../domain/learning/progress';
import type { SessionLearningSummary } from '../../domain/poker/sessionLearning';
import type { CoachFocusArea } from '../../domain/poker/types';
import { useLocalization } from '../../localization/LocalizationProvider';
import { type ThemePalette, useAppTheme } from '../../theme';
import { localizedCoachFocus } from './localizedGameplay';

interface SessionLearningCardProps {
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  summary: SessionLearningSummary;
}

export function SessionLearningCard({ onPracticeFocus, summary }: SessionLearningCardProps) {
  const { palette } = useAppTheme();
  const { activityText, practicePackText, t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const focus = summary.topFocusArea;
  const activity = focus
    ? findLearningActivity(learningActivityIdForFocus(focus) ?? '')
    : null;
  const practicePack = practicePackForFocus(focus);
  const activityTitle = practicePack
    ? practicePackText(practicePack, 'title')
    : activity ? activityText(activity, 'title') : undefined;
  const title = focus
    ? localizedCoachFocus(focus, t)
    : t(summary.decisionsGraded > 0 ? 'learning.strongBaseline' : 'learning.playToStart');
  const detail = focus
    ? summary.repeatedWeakness
      ? t('learning.repeatedDetail', { activity: activityTitle ?? t('learning.targetedPractice'), hands: summary.topFocusHandCount, spots: summary.topFocusSpotCount })
      : t('learning.oneSpot', { activity: activityTitle ?? t('learning.targetedPractice') })
    : summary.decisionsGraded > 0
      ? t('learning.strongDetail', { decisions: summary.decisionsGraded, rate: summary.strongRate ?? 0 })
      : t('learning.emptyDetail');

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons color={palette.primary} name={focus ? 'locate-outline' : 'sparkles-outline'} size={18} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      {focus && activity && onPracticeFocus ? (
        <Pressable
          accessibilityLabel={t('session.practiceA11y', { activity: activityTitle ?? activityText(activity, 'title'), focus: localizedCoachFocus(focus, t) })}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => onPracticeFocus(focus)}
          style={styles.action}
        >
          <Text numberOfLines={2} style={styles.actionText}>{t('learning.practice')}</Text>
          <Ionicons color={palette.primary} name="arrow-forward" size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      padding: 13,
      borderRadius: 16,
      backgroundColor: palette.accentSoft,
    },
    icon: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 11,
      backgroundColor: palette.surface,
    },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    title: { color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    detail: { color: palette.muted, fontSize: 9, lineHeight: 13 },
    action: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      maxWidth: 88,
      paddingHorizontal: 9,
      borderRadius: 11,
      backgroundColor: palette.surface,
    },
    actionText: { flexShrink: 1, color: palette.primary, fontSize: 10, lineHeight: 12, fontWeight: '700', textAlign: 'center' },
  });
}
