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
import { classificationTitle } from './tableReviewPresentation';

interface SessionLearningCardProps {
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onReviewFocusHand?: () => void;
  summary: SessionLearningSummary;
  tablet?: boolean;
}

export function SessionLearningCard({ onPracticeFocus, onReviewFocusHand, summary, tablet = false }: SessionLearningCardProps) {
  const { palette } = useAppTheme();
  const { activityText, practicePackText, t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, tablet), [palette, tablet]);
  const focus = summary.topFocusArea;
  const activity = focus
    ? findLearningActivity(learningActivityIdForFocus(focus) ?? '')
    : null;
  const practicePack = practicePackForFocus(focus);
  const activityTitle = practicePack
    ? practicePackText(practicePack, 'title')
    : activity ? activityText(activity, 'title') : undefined;
  // The title/detail reflect the hand/classification presentation, never the
  // raw grade, so a session with a supported alternative is never called a
  // clean 'strongly matched' run. The focused-leak branch is evidence-based.
  const graded = summary.decisionsGraded > 0;
  const title = focus
    ? localizedCoachFocus(focus, t)
    : graded && summary.classification
      ? classificationTitle(summary.classification, t)
      : t('learning.playToStart');
  const detail = focus
    ? summary.repeatedWeakness
      ? t('learning.repeatedDetail', { activity: activityTitle ?? t('learning.targetedPractice'), hands: summary.topFocusHandCount, spots: summary.topFocusSpotCount })
      : t('learning.oneSpot', { activity: activityTitle ?? t('learning.targetedPractice') })
    : graded
      ? summary.classification === 'recommended'
        ? t('learning.strongDetail', { decisions: summary.decisionsGraded, rate: summary.strongRate ?? 0 })
        : t('learning.sessionDetail', { decisions: summary.decisionsGraded })
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
                <Text numberOfLines={tablet ? 2 : 1} style={styles.strengthText}>
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
              <Text numberOfLines={tablet ? 2 : 1} style={styles.secondaryActionText}>{t('session.reviewKeyHand')}</Text>
            </Pressable>
          ) : null}
          {canPractice && onPracticeFocus ? (
            <Pressable
              accessibilityLabel={t('session.practiceA11y', { activity: activityTitle ?? t('learning.targetedPractice'), focus: localizedCoachFocus(focus, t) })}
              accessibilityRole="button"
              onPress={() => onPracticeFocus(focus)}
              style={styles.primaryAction}
            >
              <Text numberOfLines={tablet ? 2 : 1} style={styles.primaryActionText}>{t('learning.practice')}</Text>
              <Ionicons color={palette.primaryText} name="arrow-forward" size={14} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette, tablet: boolean) {
  return StyleSheet.create({
    card: {
      gap: tablet ? 14 : 10,
      padding: tablet ? 17 : 13,
      borderRadius: tablet ? 19 : 16,
      backgroundColor: palette.accentSoft,
    },
    heading: { flexDirection: 'row', alignItems: 'center', gap: tablet ? 9 : 7 },
    headingIcon: {
      width: tablet ? 36 : 28,
      height: tablet ? 36 : 28,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: tablet ? 11 : 9,
      backgroundColor: palette.surface,
    },
    eyebrow: { color: palette.primary, fontSize: tablet ? 12 : 10, lineHeight: tablet ? 17 : 14, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    strengthSection: { gap: tablet ? 8 : 6 },
    sectionLabel: { color: palette.muted, fontSize: tablet ? 11 : 9, lineHeight: tablet ? 16 : 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
    strengths: { flexDirection: 'row', flexWrap: 'wrap', gap: tablet ? 8 : 6 },
    strengthPill: {
      maxWidth: '100%',
      minHeight: tablet ? 36 : 28,
      flexDirection: 'row',
      alignItems: 'center',
      gap: tablet ? 7 : 5,
      paddingHorizontal: tablet ? 12 : 9,
      paddingVertical: tablet ? 5 : 0,
      borderRadius: tablet ? 12 : 10,
      backgroundColor: palette.surface,
    },
    strengthText: { flexShrink: 1, color: palette.text, fontSize: tablet ? 12 : 10, lineHeight: tablet ? 17 : 13, fontWeight: '700' },
    strengthBuilding: { color: palette.muted, fontSize: tablet ? 11 : 9, lineHeight: tablet ? 16 : 13 },
    focusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: tablet ? 12 : 9, paddingTop: 1 },
    focusIcon: {
      width: tablet ? 42 : 32,
      height: tablet ? 42 : 32,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: tablet ? 13 : 10,
      backgroundColor: palette.surface,
    },
    copy: { flex: 1, minWidth: 0, gap: tablet ? 4 : 2 },
    title: { color: palette.text, fontSize: tablet ? 16 : 12, lineHeight: tablet ? 22 : 17, fontWeight: '700' },
    detail: { color: palette.muted, fontSize: tablet ? 12 : 9, lineHeight: tablet ? 18 : 13 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: tablet ? 9 : 7, paddingLeft: tablet ? 54 : 41 },
    secondaryAction: {
      minHeight: tablet ? 46 : 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      gap: tablet ? 5 : 3,
      paddingHorizontal: tablet ? 12 : 9,
      paddingVertical: tablet ? 6 : 0,
      borderRadius: tablet ? 13 : 11,
      backgroundColor: palette.surface,
    },
    secondaryActionText: { flexShrink: 1, color: palette.primary, fontSize: tablet ? 12 : 10, lineHeight: tablet ? 17 : 12, fontWeight: '700', textAlign: 'center' },
    primaryAction: {
      minHeight: tablet ? 46 : 34,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      flexGrow: 1,
      gap: tablet ? 5 : 3,
      paddingHorizontal: tablet ? 13 : 10,
      paddingVertical: tablet ? 6 : 0,
      borderRadius: tablet ? 13 : 11,
      backgroundColor: palette.primary,
    },
    primaryActionText: { flexShrink: 1, color: palette.primaryText, fontSize: tablet ? 12 : 10, lineHeight: tablet ? 17 : 12, fontWeight: '700', textAlign: 'center' },
  });
}
