import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeOpponentRead, type OpponentMemory } from '../domain/poker/opponentMemory';
import { useLocalization } from '../localization/LocalizationProvider';
import { type ThemePalette, useAppTheme } from '../theme';
import { localizeOpponentRead } from './opponentReadPresentation';

interface OpponentReadCardProps {
  large?: boolean;
  memory: OpponentMemory;
  onReset?: () => void;
  privacyNote?: boolean;
}

export function OpponentReadCard({ large = false, memory, onReset, privacyNote = false }: OpponentReadCardProps) {
  const { palette } = useAppTheme();
  const { t, tCount } = useLocalization();
  const styles = useMemo(() => createStyles(palette, large), [large, palette]);
  const read = describeOpponentRead(memory);
  const localizedRead = localizeOpponentRead(read, memory.handsObserved, t);
  return (
    <View accessibilityLabel={t('opponentRead.a11y', { detail: localizedRead.detail, title: localizedRead.title })} accessible style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons color={palette.primary} name="eye-outline" size={large ? 23 : 18} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>
            {tCount('opponentRead.eyebrow', memory.handsObserved, { confidence: localizedRead.confidenceLabel })}
          </Text>
          <Text style={styles.title}>{localizedRead.title}</Text>
        </View>
      </View>
      <Text style={styles.detail}>{localizedRead.detail}</Text>
      <View style={styles.metrics}>
        <ReadMetric label={t('opponentRead.playedPreflop')} large={large} value={formatRate(memory.voluntaryPreflopHands, memory.preflopOpportunities)} />
        <ReadMetric label={t('opponentRead.raisedPreflop')} large={large} value={formatRate(memory.preflopRaises, memory.preflopOpportunities)} />
        <ReadMetric label={t('opponentRead.foldedToBet')} large={large} value={formatRate(memory.foldsFacingBet, memory.facedBetOpportunities)} />
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

function ReadMetric({ label, large, value }: { label: string; large: boolean; value: string }) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, large), [large, palette]);
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

function createStyles(palette: ThemePalette, large: boolean) {
  return StyleSheet.create({
    card: { gap: large ? 14 : 10, padding: large ? 18 : 13, borderRadius: large ? 20 : 16, backgroundColor: palette.accentSoft },
    header: { flexDirection: 'row', alignItems: 'center', gap: large ? 13 : 10 },
    icon: { width: large ? 46 : 36, height: large ? 46 : 36, alignItems: 'center', justifyContent: 'center', borderRadius: large ? 14 : 11, backgroundColor: palette.surface },
    copy: { flex: 1, minWidth: 0, gap: 2 },
    eyebrow: { color: palette.muted, fontSize: large ? 10.5 : 8, lineHeight: large ? 14 : 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: large ? 16 : 13, lineHeight: large ? 21 : 17, fontWeight: '800' },
    detail: { color: palette.muted, fontSize: large ? 13.5 : 10.5, lineHeight: large ? 19 : 15 },
    metrics: { flexDirection: 'row', gap: large ? 10 : 6 },
    metric: { flex: 1, minWidth: 0, gap: large ? 4 : 2, paddingHorizontal: large ? 12 : 8, paddingVertical: large ? 11 : 7, borderRadius: large ? 13 : 10, backgroundColor: palette.surface },
    metricValue: { color: palette.text, fontSize: large ? 15 : 12, fontWeight: '800' },
    metricLabel: { minHeight: large ? 26 : 18, color: palette.muted, fontSize: large ? 10.5 : 7.5, lineHeight: large ? 13 : 9 },
    footer: { flexDirection: 'row', alignItems: 'center', gap: large ? 11 : 8 },
    privacy: { flex: 1, color: palette.muted, fontSize: large ? 11.5 : 8.5, lineHeight: large ? 16 : 12 },
    resetButton: { minHeight: large ? 38 : 30, justifyContent: 'center', paddingHorizontal: large ? 12 : 8, borderRadius: large ? 11 : 9, backgroundColor: palette.surface },
    resetText: { color: palette.primary, fontSize: large ? 11.5 : 9, lineHeight: large ? 14 : 11, fontWeight: '800', textAlign: 'center' },
  });
}
