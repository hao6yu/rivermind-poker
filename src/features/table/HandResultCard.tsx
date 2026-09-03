import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { HandResultSummary } from './gameplayPresentation';

export function HandResultCard({ summary, tablet = false }: { summary: HandResultSummary; tablet?: boolean }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, tablet), [palette, tablet]);
  // D06 (P18-010): a loss is a normal outcome, not an error — it takes the
  // neutral border and a legible neutral accent; red stays destructive/error
  // only. Win keeps aqua; a split keeps the indigo identity color.
  const color = summary.tone === 'win'
    ? palette.aqua
    : summary.tone === 'loss' ? palette.muted : palette.primary;
  const stacks = t('table.result.stacks', {
    hero: summary.heroStack,
    opponent: summary.villainStack,
    player: 'Mara',
    pot: summary.pot,
  });

  return (
    <View
      accessibilityLabel={`${summary.title}. ${t('summary.netResult')} ${summary.heroDelta}. ${summary.detail}. ${stacks}.`}
      accessibilityLiveRegion="polite"
      accessible
      style={[styles.card, { borderColor: color }]}
    >
      <View style={[styles.icon, { backgroundColor: summary.tone === 'win' ? palette.aquaSoft : palette.accentSoft }]}>
        <Ionicons
          color={color}
          name={summary.tone === 'win' ? 'trophy-outline' : summary.tone === 'loss' ? 'trending-down-outline' : 'git-compare-outline'}
          size={tablet ? 24 : 20}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{summary.title}</Text>
          <View style={styles.deltaWrap}>
            <Text style={styles.deltaLabel}>{t('summary.netResult')}</Text>
            <Text style={[styles.delta, { color }]}>{summary.heroDelta}</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={styles.detail}>{summary.detail}</Text>
        <Text style={styles.stacks}>{stacks}</Text>
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette, tablet: boolean) {
  return StyleSheet.create({
    card: { minHeight: tablet ? 104 : 82, flexDirection: 'row', alignItems: 'center', gap: tablet ? 14 : 11, padding: tablet ? 16 : 12, borderRadius: tablet ? 20 : 17, backgroundColor: palette.surface, borderWidth: 1 },
    icon: { width: tablet ? 46 : 38, height: tablet ? 46 : 38, borderRadius: tablet ? 14 : 12, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1, gap: tablet ? 5 : 3 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    title: { flex: 1, color: palette.text, fontSize: tablet ? 16 : 13, lineHeight: tablet ? 21 : 17, fontWeight: '700' },
    deltaWrap: { flexShrink: 0, alignItems: 'flex-end', gap: 1 },
    deltaLabel: { color: palette.muted, fontSize: tablet ? 9 : 7.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    delta: { fontSize: tablet ? 15 : 12, fontWeight: '900' },
    detail: { color: palette.text, fontSize: tablet ? 12 : 10, lineHeight: tablet ? 17 : 14 },
    stacks: { color: palette.muted, fontSize: tablet ? 11 : 9, lineHeight: tablet ? 15 : 13 },
  });
}
