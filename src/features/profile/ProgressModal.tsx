import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { lessons } from '../../domain/learning/content';
import { completedLessonCount } from '../../domain/learning/progress';
import type { LearningProgressEntry } from '../../domain/learning/types';
import type { CoachFocusArea } from '../../domain/poker/types';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { summarizeSessionHandLearning, type SessionHandRecord } from '../table/sessionModels';
import { SessionLearningCard } from '../table/SessionLearningCard';

interface ProgressModalProps {
  hands: SessionHandRecord[];
  learningProgress: LearningProgressEntry[];
  onClose: () => void;
  onPracticeFocus: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  visible: boolean;
}

export function ProgressModal({ hands, learningProgress, onClose, onPracticeFocus, visible }: ProgressModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const learningSummary = useMemo(() => summarizeSessionHandLearning(hands), [hands]);
  const lessonCount = completedLessonCount(learningProgress);
  const drillScores = learningProgress.flatMap((entry) => entry.activityType === 'lesson' || entry.bestScore === null ? [] : [entry.bestScore]);
  const bestDrillScore = drillScores.length > 0 ? Math.max(...drillScores) : null;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
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

          <View style={styles.metrics}>
            <ProgressMetric label={t('progress.hands')} value={hands.length} />
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

          <Text style={styles.note}>
            {t('progress.note')}
          </Text>
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
    sheet: { gap: 18, padding: 20, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 22, fontWeight: '700', marginTop: 3 },
    iconButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: { width: '48%', minHeight: 78, justifyContent: 'space-between', padding: 12, borderRadius: 15, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 24, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: 10 },
    note: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
