import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { summarizeDecisionReports } from '../../domain/poker/sessionLearning';
import type { CoachFocusArea, CoachHandGrade } from '../../domain/poker/types';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  isMultiwaySessionHandRecord,
  sessionHandDecisionReports,
  type SessionHandRecord,
} from './sessionModels';
import { SessionLearningCard } from './SessionLearningCard';
import { localizedCoachFocus, localizedMultiwayOutcome } from './localizedGameplay';

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
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const reports = useMemo(() => sessionHandDecisionReports(hands), [hands]);
  const reportByHandId = useMemo(
    () => new Map(reports.map(({ hand, report }) => [hand.clientId, report])),
    [reports],
  );
  const learning = useMemo(() => summarizeDecisionReports(reports.map(({ hand, report }) => ({
    handId: hand.clientId,
    report,
  }))), [reports]);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('history.close')} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('history.eyebrow')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t('history.title')}</Text>
            </View>
            <Pressable accessibilityLabel={t('history.close')} accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <View style={styles.metrics}>
            <SessionMetric label={t('history.hands')} value={String(hands.length)} />
            <SessionMetric label={t('history.decisions')} value={String(learning.decisionsGraded)} />
            <SessionMetric label={t('history.strong')} value={learning.strongRate === null ? '—' : `${learning.strongRate}%`} />
          </View>

          <SessionLearningCard
            onPracticeFocus={onPracticeFocus ? (focus) => {
              onClose();
              onPracticeFocus(focus);
            } : undefined}
            summary={learning}
          />

          <ScrollView contentContainerStyle={styles.handList} showsVerticalScrollIndicator={false}>
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
                      {report && report.decisions.length > 0
                        ? <GradePill grade={report.handGrade} />
                        : <Text style={styles.unreviewed}>{t('history.ungraded')}</Text>}
                    </View>
                    <Text numberOfLines={2} style={styles.handResult}>
                      {isMultiwaySessionHandRecord(hand)
                        ? localizedMultiwayOutcome(hand.game, t)
                        : hand.game.outcome?.message ?? t('table.handComplete')}
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
                <Ionicons color={palette.muted} name="albums-outline" size={28} />
                <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
                <Text style={styles.emptyText}>{t('history.emptyText')}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function SessionMetric({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function GradePill({ grade }: { grade: CoachHandGrade }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const color = grade === 'strong' ? palette.aqua : grade === 'mistake' ? palette.danger : palette.primary;
  return (
    <View style={styles.gradePill}>
      <View style={[styles.gradeDot, { backgroundColor: color }]} />
      <Text style={[styles.gradeText, { color }]}>{grade === 'mistake' ? t('history.gradeFocus') : grade === 'close' ? t('history.gradeClose') : t('history.gradeStrong')}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { maxHeight: '88%', minHeight: '58%', gap: 16, padding: 20, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 3 },
    iconButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    metrics: { flexDirection: 'row', gap: 8 },
    metric: { flex: 1, minHeight: 70, justifyContent: 'space-between', padding: 11, borderRadius: 14, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 20, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: 9, lineHeight: 12 },
    handList: { gap: 9, paddingBottom: 4 },
    handRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    handCopy: { flex: 1, minWidth: 0, gap: 4 },
    handTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    handTitle: { flexShrink: 1, color: palette.text, fontSize: 13, fontWeight: '700' },
    unreviewed: { color: palette.muted, fontSize: 9 },
    gradePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: palette.soft },
    gradeDot: { width: 5, height: 5, borderRadius: 3 },
    gradeText: { fontSize: 9, fontWeight: '700' },
    handResult: { color: palette.muted, fontSize: 10, lineHeight: 14 },
    handFocus: { color: palette.text, fontSize: 9, lineHeight: 13 },
    replayButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.accentSoft },
    emptyState: { minHeight: 170, alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 24 },
    emptyTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
    emptyText: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  });
}
