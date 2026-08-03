import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeOpponentRead, type OpponentMemory } from '../domain/poker/opponentMemory';
import { useLocalization } from '../localization/LocalizationProvider';
import { type ThemePalette, useAppTheme } from '../theme';

interface OpponentReadCardProps {
  memory: OpponentMemory;
  onReset?: () => void;
  privacyNote?: boolean;
}

export function OpponentReadCard({ memory, onReset, privacyNote = false }: OpponentReadCardProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const read = describeOpponentRead(memory);
  return (
    <View accessibilityLabel={t('opponentRead.a11y', { detail: read.detail, title: read.title })} accessible style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons color={palette.primary} name="eye-outline" size={18} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>
            {t('opponentRead.eyebrow', { confidence: read.confidenceLabel, count: memory.handsObserved })}
          </Text>
          <Text style={styles.title}>{read.title}</Text>
        </View>
      </View>
      <Text style={styles.detail}>{read.detail}</Text>
      <View style={styles.metrics}>
        <ReadMetric label={t('opponentRead.playedPreflop')} value={formatRate(memory.voluntaryPreflopHands, memory.preflopOpportunities)} />
        <ReadMetric label={t('opponentRead.raisedPreflop')} value={formatRate(memory.preflopRaises, memory.preflopOpportunities)} />
        <ReadMetric label={t('opponentRead.foldedToBet')} value={formatRate(memory.foldsFacingBet, memory.facedBetOpportunities)} />
      </View>
      {privacyNote || (onReset && memory.handsObserved > 0) ? (
        <View style={styles.footer}>
          {privacyNote ? (
            <Text style={styles.privacy}>{t('opponentRead.privacy')}</Text>
          ) : null}
          {onReset && memory.handsObserved > 0 ? (
            <Pressable accessibilityRole="button" onPress={onReset} style={styles.resetButton}>
              <Text numberOfLines={2} style={styles.resetText}>{t('opponentRead.reset')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ReadMetric({ label, value }: { label: string; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text numberOfLines={2} style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function formatRate(successes: number, opportunities: number): string {
  return opportunities > 0 ? `${Math.round((successes / opportunities) * 100)}%` : '—';
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: { gap: 10, padding: 13, borderRadius: 16, backgroundColor: palette.accentSoft },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.surface },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    eyebrow: { color: palette.muted, fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 13, lineHeight: 17, fontWeight: '800' },
    detail: { color: palette.muted, fontSize: 10.5, lineHeight: 15 },
    metrics: { flexDirection: 'row', gap: 6 },
    metric: { flex: 1, minWidth: 0, gap: 2, paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, backgroundColor: palette.surface },
    metricValue: { color: palette.text, fontSize: 12, fontWeight: '800' },
    metricLabel: { minHeight: 18, color: palette.muted, fontSize: 7.5, lineHeight: 9 },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    privacy: { flex: 1, color: palette.muted, fontSize: 8.5, lineHeight: 12 },
    resetButton: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 8, borderRadius: 9, backgroundColor: palette.surface },
    resetText: { color: palette.primary, fontSize: 9, lineHeight: 11, fontWeight: '800', textAlign: 'center' },
  });
}
