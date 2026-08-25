import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { summarizeDecisionReports } from '../../domain/poker/sessionLearning';
import type { DecisionPresentationClass } from '../../domain/poker/decisionReviewPresentation';
import type { CoachFocusArea } from '../../domain/poker/types';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  isMultiwaySessionHandRecord,
  sessionHandDecisionReports,
  type SessionHandRecord,
} from './sessionModels';
import { SessionLearningCard } from './SessionLearningCard';
import { buildLocalizedHandResultSummary, localizedCoachFocus, localizedMultiwayOutcome } from './localizedGameplay';
import { tableOverlayLayout, type TableOverlayLayout } from './tableOverlayLayout';
import { classificationTitle } from './tableReviewPresentation';

interface SessionHistoryModalProps {
  hands: SessionHandRecord[];
  onClose: () => void;
  onPracticeFocus?: (focus: Exclude<CoachFocusArea, 'none'>) => void;
  onReplay: (hand: SessionHandRecord) => void;
  visible: boolean;
}

export function SessionHistoryModal({ hands, onClose, onPracticeFocus, onReplay, visible }: SessionHistoryModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { fontScale, height, width } = useWindowDimensions();
  const layout = useMemo(
    () => tableOverlayLayout(width, height, fontScale),
    [fontScale, height, width],
  );
  const styles = useMemo(() => createStyles(palette, layout), [layout, palette]);
  const reports = useMemo(() => sessionHandDecisionReports(hands), [hands]);
  const reportByHandId = useMemo(
    () => new Map(reports.map(({ hand, report }) => [hand.clientId, report])),
    [reports],
  );
  const learning = useMemo(() => summarizeDecisionReports(reports.map(({ hand, report }) => ({
    handId: hand.clientId,
    report,
  }))), [reports]);
  const focusHand = learning.focusHandId
    ? hands.find((hand) => hand.clientId === learning.focusHandId) ?? null
    : null;

  return (
    <Modal animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('history.close')} onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            layout.tablet && { maxHeight: Math.min(920, height - 48) },
            { paddingBottom: Math.max(layout.tablet ? 24 : 20, insets.bottom + 8) },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('history.eyebrow')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t('history.title')}</Text>
            </View>
            <Pressable accessibilityLabel={t('history.close')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
            <View style={styles.metrics}>
              <SessionMetric label={t('history.hands')} layout={layout} value={String(hands.length)} />
              <SessionMetric label={t('history.decisions')} layout={layout} value={String(learning.decisionsGraded)} />
              <SessionMetric label={t('history.strong')} layout={layout} value={learning.strongRate === null ? '—' : `${learning.strongRate}%`} />
            </View>

            <SessionLearningCard
              onPracticeFocus={onPracticeFocus ? (focus) => {
                onClose();
                onPracticeFocus(focus);
              } : undefined}
              onReviewFocusHand={focusHand ? () => {
                onClose();
                onReplay(focusHand);
              } : undefined}
              summary={learning}
              tablet={layout.tablet}
            />

            <View style={styles.handList}>
              {hands.length > 0 ? [...hands].reverse().map((hand) => {
              const report = reportByHandId.get(hand.clientId);
              return (
                <View key={hand.clientId} style={styles.handRow}>
                  <View style={styles.handCopy}>
                    <View style={styles.handTitleRow}>
                      <Text style={styles.handTitle}>
                        {isMultiwaySessionHandRecord(hand)
                          ? t('history.multiwayHand', { count: hand.game.tablePlayerIds.length, hand: hand.game.handNumber })
                          : t('history.hand', { hand: hand.game.handNumber })}
                      </Text>
                      {report && report.classification
                        ? <GradePill classification={report.classification} layout={layout} />
                        : <Text style={styles.unreviewed}>{t('history.ungraded')}</Text>}
                    </View>
                    <Text numberOfLines={2} style={styles.handResult}>
                      {isMultiwaySessionHandRecord(hand)
                        ? localizedMultiwayOutcome(hand.game, t)
                        : buildLocalizedHandResultSummary(hand.game, hand.game.players.hero.stack, t)?.title ?? t('table.handComplete')}
                    </Text>
                    {report && report.focusArea !== 'none' && report.handGrade !== 'strong' ? (
                      <Text style={styles.handFocus}>
                        {t('history.focus', { focus: localizedCoachFocus(report.focusArea, t) })}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityLabel={t('history.replayA11y', { hand: hand.game.handNumber })}
                    accessibilityRole="button"
                    onPress={() => onReplay(hand)}
                    style={styles.replayButton}
                  >
                    <Ionicons color={palette.primary} name="play" size={15} />
                  </Pressable>
                </View>
              );
              }) : (
                <View style={styles.emptyState}>
                  <Ionicons color={palette.muted} name="albums-outline" size={layout.tablet ? 34 : 28} />
                  <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
                  <Text style={styles.emptyText}>{t('history.emptyText')}</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SessionMetric({ label, layout, value }: { label: string; layout: TableOverlayLayout; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, layout), [layout, palette]);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function GradePill({ classification, layout }: { classification: DecisionPresentationClass; layout: TableOverlayLayout }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, layout), [layout, palette]);
  const color = classification === 'costlyMistake' ? palette.danger : classification === 'recommended' ? palette.aqua : palette.primary;
  return (
    <View style={styles.gradePill}>
      <View style={[styles.gradeDot, { backgroundColor: color }]} />
      <Text style={[styles.gradeText, { color }]}>{classificationTitle(classification, t)}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette, layout: TableOverlayLayout) {
  const { largeText, tablet } = layout;
  return StyleSheet.create({
    scrim: { flex: 1, alignItems: tablet ? 'center' : 'stretch', justifyContent: tablet ? 'center' : 'flex-end', backgroundColor: palette.scrim, padding: tablet ? 24 : 12 },
    sheet: { width: '100%', maxWidth: tablet ? 760 : undefined, maxHeight: tablet ? undefined : '88%', minHeight: tablet ? 620 : '58%', gap: tablet ? 20 : 16, padding: tablet ? 26 : 20, borderRadius: tablet ? 28 : 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: tablet ? 12 : 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: tablet ? 28 : 21, lineHeight: tablet ? 34 : 27, fontWeight: '700', marginTop: 3 },
    iconButton: { width: tablet ? 46 : 38, height: tablet ? 46 : 38, borderRadius: tablet ? 15 : 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    scroll: { minHeight: 0 },
    scrollContent: { gap: tablet ? 18 : 16, paddingBottom: 4 },
    metrics: { flexDirection: largeText && !tablet ? 'column' : 'row', gap: tablet ? 12 : 8 },
    metric: { flex: largeText && !tablet ? undefined : 1, minHeight: tablet ? 88 : 70, justifyContent: 'space-between', gap: 6, padding: tablet ? 15 : 11, borderRadius: tablet ? 17 : 14, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: tablet ? 26 : 20, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: tablet ? 12 : 9, lineHeight: tablet ? 17 : 12 },
    handList: { gap: tablet ? 12 : 9 },
    handRow: { flexDirection: 'row', alignItems: 'center', gap: tablet ? 13 : 10, padding: tablet ? 17 : 13, borderRadius: tablet ? 19 : 16, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    handCopy: { flex: 1, minWidth: 0, gap: 4 },
    handTitleRow: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: largeText ? 'wrap' : 'nowrap', gap: tablet ? 10 : 8 },
    handTitle: { flexShrink: 1, color: palette.text, fontSize: tablet ? 16 : 13, lineHeight: tablet ? 22 : 18, fontWeight: '700' },
    unreviewed: { color: palette.muted, fontSize: tablet ? 11 : 9, lineHeight: tablet ? 16 : 13 },
    gradePill: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: tablet ? 6 : 4, paddingHorizontal: tablet ? 10 : 7, paddingVertical: tablet ? 5 : 3, borderRadius: tablet ? 10 : 8, backgroundColor: palette.soft },
    gradeDot: { width: tablet ? 7 : 5, height: tablet ? 7 : 5, borderRadius: 4 },
    gradeText: { flexShrink: 1, fontSize: tablet ? 11 : 9, lineHeight: tablet ? 15 : 12, fontWeight: '700' },
    handResult: { color: palette.muted, fontSize: tablet ? 13 : 10, lineHeight: tablet ? 19 : 14 },
    handFocus: { color: palette.text, fontSize: tablet ? 12 : 9, lineHeight: tablet ? 17 : 13 },
    replayButton: { width: tablet ? 48 : 44, height: tablet ? 48 : 44, alignItems: 'center', justifyContent: 'center', borderRadius: tablet ? 15 : 12, backgroundColor: palette.accentSoft },
    emptyState: { minHeight: tablet ? 220 : 170, alignItems: 'center', justifyContent: 'center', gap: tablet ? 10 : 7, paddingHorizontal: 24 },
    emptyTitle: { color: palette.text, fontSize: tablet ? 18 : 14, fontWeight: '700' },
    emptyText: { color: palette.muted, fontSize: tablet ? 14 : 11, lineHeight: tablet ? 21 : 16, textAlign: 'center' },
  });
}
