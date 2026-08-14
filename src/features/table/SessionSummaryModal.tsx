import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { findLearningActivity } from '../../domain/learning/content';
import { practicePackForFocus } from '../../domain/learning/practicePacks';
import { learningActivityIdForFocus } from '../../domain/learning/progress';
import {
  type PracticeSessionConfig,
  type PracticeSessionSummary,
  type SessionCompletionReason,
} from '../../domain/poker/session';
import type { SessionLearningSummary } from '../../domain/poker/sessionLearning';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization/LocalizationProvider';
import { type ThemePalette, useAppTheme } from '../../theme';
import { OpponentReadCard } from '../../components/OpponentReadCard';
import type { OpponentMemory } from '../../domain/poker/opponentMemory';
import { SessionLearningCard } from './SessionLearningCard';
import { localizedCoachFocus } from './localizedGameplay';
import { formatChipsSigned } from '../../domain/poker/moneyFormat';

interface SessionSummaryModalProps {
  /** Needed to state the session result in chips; netBb is a ratio, chips are the unit players read. */
  bigBlind: number;
  complete: boolean;
  config: PracticeSessionConfig;
  learningSummary: SessionLearningSummary;
  onChangeSetup: () => void;
  onClose: () => void;
  onContinueLearning: () => void;
  onPlayAgain: () => void;
  onPracticeFocus: (focus: NonNullable<PracticeSessionSummary['topFocusArea']>) => void;
  onReviewFocusHand?: () => void;
  onReviewHands: () => void;
  opponentMemory: OpponentMemory;
  reason: SessionCompletionReason | null;
  summary: PracticeSessionSummary;
  visible: boolean;
}

export function SessionSummaryModal({
  bigBlind,
  complete,
  learningSummary,
  onChangeSetup,
  onClose,
  onContinueLearning,
  onPlayAgain,
  onPracticeFocus,
  onReviewFocusHand,
  onReviewHands,
  opponentMemory,
  reason,
  summary,
  visible,
}: SessionSummaryModalProps) {
  const { palette } = useAppTheme();
  const { activityText, practicePackText, t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const netChips = Math.round(summary.netBb * bigBlind);
  const netLabel = formatChipsSigned(netChips);
  const positive = netChips > 0;
  const netColor = netChips === 0 ? palette.primary : positive ? palette.aqua : palette.danger;
  const resultCopy = reason === 'hero_bust'
    ? t('session.heroBust')
    : reason === 'villain_bust'
      ? t('session.opponentBust')
      : complete
        ? t('session.targetReached')
        : t('session.saved');
  const practiceFocus = learningSummary.topFocusArea;
  const practiceActivity = practiceFocus
    ? findLearningActivity(learningActivityIdForFocus(practiceFocus) ?? '')
    : null;
  const practicePack = practicePackForFocus(practiceFocus);
  const practiceActivityTitle = practicePack
    ? practicePackText(practicePack, 'title')
    : practiceActivity ? activityText(practiceActivity, 'title') : undefined;
  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('session.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t(complete ? 'session.complete' : 'session.progress')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t(complete ? 'session.niceWork' : 'session.soFar')}</Text>
            </View>
            <Pressable accessibilityLabel={t('session.close')} accessibilityRole="button" onPress={onClose} style={styles.closeButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={styles.scroll}>
            <View style={styles.resultCard}>
              <View style={[styles.resultIcon, { backgroundColor: positive ? palette.aquaSoft : palette.accentSoft }]}>
                <Ionicons color={netColor} name={positive ? 'trending-up-outline' : netChips < 0 ? 'trending-down-outline' : 'remove-outline'} size={22} />
              </View>
              <View style={styles.resultCopy}>
                <Text style={[styles.netResult, { color: netColor }]}>{netLabel}</Text>
                <Text style={styles.resultText}>{resultCopy}</Text>
              </View>
            </View>

            <View style={styles.metrics}>
              <SummaryMetric label={t('session.hands')} value={String(summary.handsPlayed)} />
              <SummaryMetric label={t('session.record')} value={`${summary.heroWins} · ${summary.villainWins} · ${summary.ties}`} />
              <SummaryMetric label={t('session.decisionsGraded')} value={String(learningSummary.decisionsGraded)} />
            </View>

            <SessionLearningCard onReviewFocusHand={onReviewFocusHand} summary={learningSummary} />

            <OpponentReadCard memory={opponentMemory} />
          </ScrollView>

          <View style={styles.actions}>
            {practiceFocus && practiceActivity ? (
              <Pressable
                accessibilityLabel={t('session.practiceA11y', { activity: practiceActivityTitle ?? activityText(practiceActivity, 'title'), focus: localizedCoachFocus(practiceFocus, t) })}
                accessibilityRole="button"
                onPress={() => onPracticeFocus(practiceFocus)}
                style={styles.primaryButton}
              >
                <Text numberOfLines={2} style={styles.primaryButtonText}>{t('session.practiceSpot')}</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" onPress={onContinueLearning} style={styles.primaryButton}>
                <Text numberOfLines={2} style={styles.primaryButtonText}>{t('session.continueLearning')}</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={complete ? onPlayAgain : onClose} style={styles.secondaryButton}>
              <Text numberOfLines={2} style={styles.secondaryButtonText}>{t(complete ? 'summary.playAgain' : 'session.continuePlaying')}</Text>
            </Pressable>
            <View style={styles.footerActions}>
              {summary.handsPlayed > 0 && (
                <Pressable accessibilityRole="button" onPress={onReviewHands} style={styles.textButton}>
                  <Text numberOfLines={2} style={styles.textButtonText}>{t('session.reviewHands')}</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={onChangeSetup} style={styles.textButton}>
                <Text numberOfLines={2} style={styles.textButtonText}>{t('session.changeSetup')}</Text>
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
      <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { maxHeight: '92%', gap: 16, paddingHorizontal: 18, paddingTop: 18, borderRadius: 25, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 22, fontWeight: '700', marginTop: 3 },
    closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    scroll: { flexShrink: 1 },
    content: { gap: 14 },
    resultCard: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 17, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    resultIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 },
    resultCopy: { flex: 1, gap: 3 },
    netResult: { fontSize: 20, fontWeight: '800' },
    resultText: { color: palette.muted, fontSize: 12, lineHeight: 17 },
    metrics: { flexDirection: 'row', gap: 8 },
    metric: { flex: 1, minWidth: 0, minHeight: 68, justifyContent: 'space-between', padding: 10, borderRadius: 14, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 17, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: 10.5, lineHeight: 14 },
    actions: { gap: 8 },
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { flexShrink: 1, paddingHorizontal: 12, color: palette.primaryText, fontSize: 14, lineHeight: 18, fontWeight: '700', textAlign: 'center' },
    secondaryButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: palette.accentSoft },
    secondaryButtonText: { flexShrink: 1, paddingHorizontal: 12, color: palette.primary, fontSize: 13, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
    footerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    textButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    textButtonText: { color: palette.muted, fontSize: 11, lineHeight: 14, fontWeight: '600', textAlign: 'center' },
  });
}
