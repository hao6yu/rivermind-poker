import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { coachFocusLabel, summarizeCoachSession } from '../../domain/poker/session';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { SessionHandRecord } from '../table/sessionModels';

interface ProgressModalProps {
  hands: SessionHandRecord[];
  onClose: () => void;
  visible: boolean;
}

export function ProgressModal({ hands, onClose, visible }: ProgressModalProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reviews = hands.flatMap((hand) => hand.coachResult ? [hand.coachResult.review] : []);
  const stats = summarizeCoachSession(reviews);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.scrim}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>Saved learning data</Text>
              <Text style={styles.title}>Progress</Text>
            </View>
            <Pressable accessibilityLabel="Close progress" accessibilityRole="button" onPress={onClose} style={styles.iconButton}>
              <Ionicons color={palette.text} name="close" size={20} />
            </Pressable>
          </View>

          <View style={styles.metrics}>
            <ProgressMetric label="Hands" value={hands.length} />
            <ProgressMetric label="Reviewed" value={stats.reviewedHands} />
            <ProgressMetric label="Strong" value={stats.grades.strong} />
            <ProgressMetric label="Focus spots" value={stats.grades.mistake} />
          </View>

          <View style={styles.focusCard}>
            <View style={styles.focusIcon}>
              <Ionicons color={palette.primary} name="locate-outline" size={20} />
            </View>
            <View style={styles.focusCopy}>
              <Text style={styles.focusLabel}>Recommended focus</Text>
              <Text style={styles.focusValue}>
                {stats.topFocusArea ? coachFocusLabel(stats.topFocusArea) : 'Review more hands to find a pattern'}
              </Text>
            </View>
          </View>

          <Text style={styles.note}>
            RiverMind grades the decision process, not whether the hand happened to win.
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
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
    focusCard: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14, borderRadius: 16, backgroundColor: palette.accentSoft },
    focusIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.surface },
    focusCopy: { flex: 1, gap: 3 },
    focusLabel: { color: palette.muted, fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
    focusValue: { color: palette.text, fontSize: 13, lineHeight: 18, fontWeight: '700' },
    note: { color: palette.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
    primaryButton: { minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.primary },
    primaryButtonText: { color: palette.primaryText, fontSize: 14, fontWeight: '700' },
  });
}
