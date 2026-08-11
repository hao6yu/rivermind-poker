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
  onReviewFocusHand?: () => void;
  summary: SessionLearningSummary;
}

export function SessionLearningCard({ onPracticeFocus, onReviewFocusHand, summary }: SessionLearningCardProps) {
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
  const canPractice = Boolean(focus && onPracticeFocus && (activity || practicePack));
  const showActions = Boolean(focus && (canPractice || onReviewFocusHand));

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons color={palette.primary} name="sparkles-outline" size={16} />
        </View>
        <Text style={styles.eyebrow}>{t('learning.coachingRecap')}</Text>
      </View>

      {summary.strengths.length > 0 ? (
        <View style={styles.strengthSection}>
          <Text style={styles.sectionLabel}>{t('learning.observedStrengths')}</Text>
          <View style={styles.strengths}>
            {summary.strengths.map((strength) => (
              <View key={strength.area} style={styles.strengthPill}>
                <Ionicons color={palette.aqua} name="checkmark-circle" size={14} />
                <Text numberOfLines={1} style={styles.strengthText}>
                  {localizedCoachFocus(strength.area, t)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : summary.decisionsGraded > 0 ? (
        <Text style={styles.strengthBuilding}>{t('learning.strengthsBuilding')}</Text>
      ) : null}

      <View style={styles.focusRow}>
        <View style={styles.focusIcon}>
          <Ionicons color={palette.primary} name={focus ? 'locate-outline' : 'sparkles-outline'} size={18} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.sectionLabel}>{t(focus ? 'learning.nextFocus' : 'learning.currentSignal')}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
      </View>

      {focus && showActions ? (
        <View style={styles.actions}>
          {onReviewFocusHand ? (
            <Pressable
              accessibilityLabel={t('session.reviewKeyHandA11y', { focus: localizedCoachFocus(focus, t) })}
              accessibilityRole="button"
              onPress={onReviewFocusHand}
              style={styles.secondaryAction}
            >
              <Ionicons color={palette.primary} name="play-circle-outline" size={16} />
              <Text numberOfLines={1} style={styles.secondaryActionText}>{t('session.reviewKeyHand')}</Text>
            </Pressable>
          ) : null}
          {canPractice && onPracticeFocus ? (
            <Pressable
              accessibilityLabel={t('session.practiceA11y', { activity: activityTitle ?? t('learning.targetedPractice'), focus: localizedCoachFocus(focus, t) })}
              accessibilityRole="button"
              onPress={() => onPracticeFocus(focus)}
              style={styles.primaryAction}
            >
              <Text numberOfLines={1} style={styles.primaryActionText}>{t('learning.practice')}</Text>
              <Ionicons color={palette.primaryText} name="arrow-forward" size={14} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      gap: 10,
      padding: 13,
      borderRadius: 16,
      backgroundColor: palette.accentSoft,
    },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    headingIcon: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
      backgroundColor: palette.surface,
    },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    strengthSection: { gap: 6 },
    sectionLabel: { color: palette.muted, fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
    strengths: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    strengthPill: {
      maxWidth: '100%',
      minHeight: 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      borderRadius: 10,
      backgroundColor: palette.surface,
    },
    strengthText: { flexShrink: 1, color: palette.text, fontSize: 10, lineHeight: 13, fontWeight: '700' },
    strengthBuilding: { color: palette.muted, fontSize: 9, lineHeight: 13 },
    focusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingTop: 1 },
    focusIcon: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: palette.surface,
    },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    title: { color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    detail: { color: palette.muted, fontSize: 9, lineHeight: 13 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, paddingLeft: 41 },
    secondaryAction: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      gap: 3,
      paddingHorizontal: 9,
      borderRadius: 11,
      backgroundColor: palette.surface,
    },
    secondaryActionText: { flexShrink: 1, color: palette.primary, fontSize: 10, lineHeight: 12, fontWeight: '700', textAlign: 'center' },
    primaryAction: {
      minHeight: 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      gap: 3,
      paddingHorizontal: 10,
      borderRadius: 11,
      backgroundColor: palette.primary,
    },
    primaryActionText: { flexShrink: 1, color: palette.primaryText, fontSize: 10, lineHeight: 12, fontWeight: '700', textAlign: 'center' },
  });
}
