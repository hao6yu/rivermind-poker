import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { findLearningActivity } from '../../domain/learning/content';
import { practicePackForFocus } from '../../domain/learning/practicePacks';
import { learningActivityIdForFocus } from '../../domain/learning/progress';
import {
  coachFocusLabel,
  sessionHandTargetLabel,
  type PracticeSessionConfig,
  type PracticeSessionSummary,
  type SessionCompletionReason,
} from '../../domain/poker/session';
import type { SessionLearningSummary } from '../../domain/poker/sessionLearning';
import { type ThemePalette, useAppTheme } from '../../theme';
import { OpponentReadCard } from '../../components/OpponentReadCard';
import type { OpponentMemory } from '../../domain/poker/opponentMemory';
import { SessionLearningCard } from './SessionLearningCard';

interface SessionSummaryModalProps {
  complete: boolean;
  config: PracticeSessionConfig;
  learningSummary: SessionLearningSummary;
  onChangeSetup: () => void;
  onClose: () => void;
  onContinueLearning: () => void;
  onPlayAgain: () => void;
  onPracticeFocus: (focus: NonNullable<PracticeSessionSummary['topFocusArea']>) => void;
  onReviewHands: () => void;
  opponentMemory: OpponentMemory;
  reason: SessionCompletionReason | null;
  summary: PracticeSessionSummary;
  visible: boolean;
}

export function SessionSummaryModal({
  complete,
  config,
  learningSummary,
  onChangeSetup,
  onClose,
  onContinueLearning,
  onPlayAgain,
  onPracticeFocus,
  onReviewHands,
  opponentMemory,
  reason,
  summary,
  visible,
}: SessionSummaryModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const positive = summary.netBb > 0;
  const netColor = summary.netBb === 0 ? palette.primary : positive ? palette.aqua : palette.danger;
  const resultCopy = reason === 'hero_bust'
    ? 'Mara won the last of your stack.'
    : reason === 'villain_bust'
      ? 'You won the last of Mara’s stack.'
      : complete
        ? 'You reached the session hand target.'
        : 'Your completed hands are saved.';
  const practiceFocus = learningSummary.topFocusArea;
  const practiceActivity = practiceFocus
    ? findLearningActivity(learningActivityIdForFocus(practiceFocus) ?? '')
    : null;
  const practiceActivityTitle = practicePackForFocus(practiceFocus)?.title ?? practiceActivity?.title;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel="Close session summary" onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>{complete ? 'Session complete' : 'Session progress'}</Text>
              <Text accessibilityRole="header" style={styles.title}>{complete ? 'Nice work' : 'Session so far'}</Text>
            </View>
            <Pressable accessibilityLabel="Close session summary" accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scroll}>
            <View style={styles.resultCard}>
              <View style={[styles.resultIcon, { backgroundColor: positive ? palette.aquaSoft : palette.accentSoft }]}>
                <Ionicons color={netColor} name={positive ? 'trending-up-outline' : summary.netBb < 0 ? 'trending-down-outline' : 'remove-outline'} size={22} />
              </View>
              <View style={styles.resultCopy}>
                <Text style={[styles.netResult, { color: netColor }]}>{formatNetBb(summary.netBb)}</Text>
                <Text style={styles.resultText}>{resultCopy}</Text>
              </View>
            </View>

            <View style={styles.metrics}>
              <SummaryMetric label="Hands" value={String(summary.handsPlayed)} />
              <SummaryMetric label="Net result" value={formatNetBb(summary.netBb)} />
              <SummaryMetric label="Win · loss · tie" value={`${summary.heroWins} · ${summary.villainWins} · ${summary.ties}`} />
              <SummaryMetric label="Decisions graded" value={String(learningSummary.decisionsGraded)} />
            </View>

            <SessionLearningCard summary={learningSummary} />

            <OpponentReadCard memory={opponentMemory} />

            <Text style={styles.setupText}>
              {config.startingStackBb} BB stacks · {sessionHandTargetLabel(config.handTarget)}
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            {practiceFocus && practiceActivity ? (
              <Pressable
                accessibilityLabel={`Practice ${coachFocusLabel(practiceFocus)} with ${practiceActivityTitle ?? practiceActivity.title}`}
                accessibilityRole="button"
                onPress={() => onPracticeFocus(practiceFocus)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Practice this spot</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={onContinueLearning} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Continue learning</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={complete ? onPlayAgain : onClose} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{complete ? 'Play same setup' : 'Continue playing'}</Text>
            </Pressable>
            <View style={styles.footerActions}>
              {summary.handsPlayed > 0 && (
                <Pressable accessibilityRole="button" onPress={onReviewHands} style={styles.textButton}>
                  <Text style={styles.textButtonText}>Review hands</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={onChangeSetup} style={styles.textButton}>
                <Text style={styles.textButtonText}>Change setup</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.metric}>
      <Text numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function formatNetBb(value: number): string {
  return `${value > 0 ? '+' : ''}${value} BB`;
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { maxHeight: '92%', gap: 16, paddingHorizontal: 18, paddingTop: 18, borderRadius: 25, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 22, fontWeight: '700', marginTop: 3 },
    closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: palette.soft },
    scroll: { flexShrink: 1 },
    content: { gap: 14 },
    resultCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 17, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    resultIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
    resultCopy: { flex: 1, gap: 3 },
    netResult: { fontSize: 20, fontWeight: '800' },
    resultText: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    metric: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%', minHeight: 72, justifyContent: 'space-between', padding: 11, borderRadius: 14, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 18, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: 9, lineHeight: 12 },
    setupText: { color: palette.muted, fontSize: 10, textAlign: 'center' },
    actions: { gap: 8 },
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
    secondaryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: palette.accentSoft },
    secondaryButtonText: { color: palette.primary, fontSize: 13, fontWeight: '700' },
    footerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    textButton: { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
    textButtonText: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  });
}
