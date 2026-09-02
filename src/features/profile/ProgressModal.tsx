import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { lessons } from '../../domain/learning/content';
import { completedLessonCount } from '../../domain/learning/progress';
import type { LearningProgressEntry } from '../../domain/learning/types';
import type { CoachFocusArea } from '../../domain/poker/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { summarizeSessionHandLearning, type SessionHandRecord } from '../table/sessionModels';
import { SessionLearningCard } from '../table/SessionLearningCard';

interface ProgressModalProps {
  hands: SessionHandRecord[];
  learningProgress: LearningProgressEntry[];
  /**
   * P18-024: true while the saved-hand history is still being read from
   * storage, so the metrics show a loading state instead of zero values
   * that read as "no hands played".
   */
  loading?: boolean;
  onClose: () => void;
  onPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  visible: boolean;
}

export function ProgressModal({ hands, learningProgress, loading = false, onClose, onPracticeFocus, visible }: ProgressModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const learningSummary = useMemo(() => summarizeSessionHandLearning(hands), [hands]);
  const lessonCount = completedLessonCount(learningProgress);
  const drillScores = learningProgress.flatMap((entry) => entry.activityType === 'lesson' || entry.bestScore === null ? [] : [entry.bestScore]);
  const bestDrillScore = drillScores.length > 0 ? Math.max(...drillScores) : null;

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('progress.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{t('progress.eyebrow')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t('progress.title')}</Text>
            </View>
            <Pressable accessibilityLabel={t('progress.close')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scroll}>
            {loading ? (
              // P18-024: while the hand history loads, show a loading state —
              // never zero-value metrics that read as "no hands played".
              <View style={styles.loadingBlock}>
                <ActivityIndicator color={palette.primary} size="small" />
                <Text style={styles.loadingText}>{t('progress.loading')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.metrics}>
                  {/* Scoped to the player's own tables: private-table hands are counted in the
                    play record on the profile, not here. */}
                  <ProgressMetric label={t('progress.practiceHands')} value={hands.length} />
                  <ProgressMetric label={t('progress.decisions')} value={learningSummary.decisionsGraded} />
                  <ProgressMetric label={t('progress.lessons')} value={`${lessonCount}/${lessons.length}`} />
                  <ProgressMetric label={t('progress.bestDrill')} value={bestDrillScore === null ? '—' : `${bestDrillScore}%`} />
                </View>

                <SessionLearningCard
                  onPracticeFocus={(focus) => {
                    onClose();
                    onPracticeFocus(focus);
                  }}
                  summary={learningSummary}
                />
              </>
            )}

            <Text style={styles.note}>
              {t('progress.note')}
            </Text>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{t('common.done')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number | string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { maxHeight: '92%', gap: 14, padding: 20, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 22, fontWeight: '700', marginTop: 3 },
    // P18-013: the modal close control meets the 44-point minimum target.
    iconButton: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    scroll: { flexShrink: 1 },
    content: { gap: 18 },
    loadingBlock: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, borderRadius: 16, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    loadingText: { color: palette.muted, fontSize: 12, fontWeight: '600' },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: { width: '48%', minHeight: 78, justifyContent: 'space-between', padding: 12, borderRadius: 15, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 24, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: 10 },
    note: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
