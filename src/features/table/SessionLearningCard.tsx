import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { findLearningActivity } from '../../domain/learning/content';
import { learningActivityIdForFocus } from '../../domain/learning/progress';
import { coachFocusLabel } from '../../domain/poker/session';
import type { SessionLearningSummary } from '../../domain/poker/sessionLearning';
import type { CoachFocusArea } from '../../domain/poker/types';
import { type ThemePalette, useAppTheme } from '../../theme';

interface SessionLearningCardProps {
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  summary: SessionLearningSummary;
}

export function SessionLearningCard({ onPracticeFocus, summary }: SessionLearningCardProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const focus = summary.topFocusArea;
  const activity = focus
    ? findLearningActivity(learningActivityIdForFocus(focus) ?? '')
    : null;
  const title = focus
    ? coachFocusLabel(focus)
    : summary.decisionsGraded > 0 ? 'Strong baseline so far' : 'Play a new hand to start';
  const detail = focus
    ? summary.repeatedWeakness
      ? `${summary.topFocusSpotCount} review spots across ${summary.topFocusHandCount} hands · ${activity?.title ?? 'targeted practice'}`
      : `One early review spot · ${activity?.title ?? 'targeted practice'}`
    : summary.decisionsGraded > 0
      ? `${summary.strongRate}% of ${summary.decisionsGraded} decisions matched strongly. No repeated leak yet.`
      : 'Newly completed hands are graded locally and do not use AI credits.';

  return (
    <View style={styles.card}>
      <View style={styles.icon}>
        <Ionicons color={palette.primary} name={focus ? 'locate-outline' : 'sparkles-outline'} size={18} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{focus && summary.repeatedWeakness ? 'Repeated pattern' : 'Next best practice'}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      {focus && activity && onPracticeFocus ? (
        <Pressable
          accessibilityLabel={`Practice ${coachFocusLabel(focus)} with ${activity.title}`}
          accessibilityRole="button"
          hitSlop={6}
          onPress={() => onPracticeFocus(focus)}
          style={styles.action}
        >
          <Text style={styles.actionText}>Practice</Text>
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
    copy: { flex: 1, gap: 2 },
    label: {
      color: palette.muted,
      fontSize: 9,
      fontWeight: '700',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    title: { color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    detail: { color: palette.muted, fontSize: 9, lineHeight: 13 },
    action: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 9,
      borderRadius: 11,
      backgroundColor: palette.surface,
    },
    actionText: { color: palette.primary, fontSize: 10, fontWeight: '700' },
  });
}
