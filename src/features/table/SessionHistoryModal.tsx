import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModalBackdrop } from '../../components/ModalBackdrop';
import { coachFocusLabel, summarizeCoachSession } from '../../domain/poker/session';
import { multiwayOutcomeMessage } from '../../domain/poker/multiwaySession';
import type { CoachHandGrade } from '../../domain/poker/types';
import { type ThemePalette, useAppTheme } from '../../theme';
import {
  headsUpSessionHands,
  isMultiwaySessionHandRecord,
  type SessionHandRecord,
} from './sessionModels';

interface SessionHistoryModalProps {
  hands: SessionHandRecord[];
  onClose: () => void;
  onReplay: (hand: SessionHandRecord) => void;
  visible: boolean;
}

export function SessionHistoryModal({ hands, onClose, onReplay, visible }: SessionHistoryModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
  const reviews = headsUpSessionHands(hands).flatMap((hand) => hand.coachResult ? [hand.coachResult.review] : []);
  const stats = summarizeCoachSession(reviews);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel="Close hand history" onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(20, insets.bottom + 8) }]}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Saved across sessions</Text>
              <Text accessibilityRole="header" style={styles.title}>Hand history</Text>
            </View>
            <Pressable accessibilityLabel="Close session review" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <View style={styles.metrics}>
            <SessionMetric label="Hands" value={String(hands.length)} />
            <SessionMetric label="Reviewed" value={String(stats.reviewedHands)} />
            <SessionMetric label="Focus spots" value={String(stats.grades.mistake)} />
          </View>

          {stats.topFocusArea ? (
            <View style={styles.focusCard}>
              <View style={styles.focusIcon}>
                <Ionicons color={palette.primary} name="locate-outline" size={18} />
              </View>
              <View style={styles.focusCopy}>
                <Text style={styles.focusLabel}>Session focus</Text>
                <Text style={styles.focusValue}>{coachFocusLabel(stats.topFocusArea)}</Text>
              </View>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.handList} showsVerticalScrollIndicator={false}>
            {hands.length > 0 ? [...hands].reverse().map((hand) => (
              <View key={hand.clientId} style={styles.handRow}>
                <View style={styles.handCopy}>
                  <View style={styles.handTitleRow}>
                    <Text style={styles.handTitle}>
                      Hand {hand.game.handNumber}{isMultiwaySessionHandRecord(hand) ? ` · ${hand.game.tablePlayerIds.length} players` : ''}
                    </Text>
                    {hand.coachResult ? <GradePill grade={hand.coachResult.review.handGrade} /> : (
                      <Text style={styles.unreviewed}>{isMultiwaySessionHandRecord(hand) ? 'Local review' : 'Not reviewed'}</Text>
                    )}
                  </View>
                  <Text numberOfLines={2} style={styles.handResult}>
                    {isMultiwaySessionHandRecord(hand)
                      ? multiwayOutcomeMessage(hand.game)
                      : hand.game.outcome?.message ?? 'Hand complete'}
                  </Text>
                  {hand.coachResult && hand.coachResult.review.focusArea !== 'none' ? (
                    <Text style={styles.handFocus}>
                      Focus · {coachFocusLabel(hand.coachResult.review.focusArea)}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityLabel={`Replay ${isMultiwaySessionHandRecord(hand) ? `${hand.game.tablePlayerIds.length}-player ` : ''}hand ${hand.game.handNumber}`}
                  accessibilityRole="button"
                  onPress={() => onReplay(hand)}
                  style={styles.replayButton}
                >
                  <Ionicons color={palette.primary} name="play" size={15} />
                </Pressable>
              </View>
            )) : (
              <View style={styles.emptyState}>
                <Ionicons color={palette.muted} name="albums-outline" size={28} />
                <Text style={styles.emptyTitle}>No completed hands yet</Text>
                <Text style={styles.emptyText}>Finish a hand and it will be saved here automatically.</Text>
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
  const styles = useMemo(() => createStyles(palette), [palette]);
  const color = grade === 'strong' ? palette.aqua : grade === 'mistake' ? palette.danger : palette.primary;
  return (
    <View style={styles.gradePill}>
      <View style={[styles.gradeDot, { backgroundColor: color }]} />
      <Text style={[styles.gradeText, { color }]}>{grade === 'mistake' ? 'Focus' : grade === 'close' ? 'Close' : 'Strong'}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: palette.scrim, padding: 12 },
    sheet: { maxHeight: '88%', minHeight: '58%', gap: 16, padding: 20, borderRadius: 24, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 21, fontWeight: '700', marginTop: 3 },
    iconButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.soft },
    metrics: { flexDirection: 'row', gap: 8 },
    metric: { flex: 1, minHeight: 70, justifyContent: 'space-between', padding: 11, borderRadius: 14, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: 20, fontWeight: '700' },
    metricLabel: { color: palette.muted, fontSize: 9 },
    focusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 15, backgroundColor: palette.accentSoft },
    focusIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.surface },
    focusCopy: { flex: 1 },
    focusLabel: { color: palette.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    focusValue: { color: palette.text, fontSize: 13, fontWeight: '700', marginTop: 2 },
    handList: { gap: 9, paddingBottom: 4 },
    handRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 16, backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border },
    handCopy: { flex: 1, gap: 4 },
    handTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    handTitle: { color: palette.text, fontSize: 13, fontWeight: '700' },
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
