import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { HandResultSummary } from './gameplayPresentation';

export function HandResultCard({ summary }: { summary: HandResultSummary }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const color = summary.tone === 'win' ? palette.aqua : summary.tone === 'loss' ? palette.danger : palette.primary;
  const stacks = t('table.result.stacks', {
    hero: summary.heroStack,
    opponent: summary.villainStack,
    player: 'Mara',
    pot: summary.pot,
  });

  return (
    <View
      accessibilityLabel={`${summary.title}. ${summary.heroDelta}. ${summary.detail}. ${stacks}.`}
      accessibilityLiveRegion="polite"
      accessible
      style={[styles.card, { borderColor: color }]}
    >
      <View style={[styles.icon, { backgroundColor: summary.tone === 'win' ? palette.aquaSoft : palette.accentSoft }]}>
        <Ionicons
          color={color}
          name={summary.tone === 'win' ? 'trophy-outline' : summary.tone === 'loss' ? 'trending-down-outline' : 'git-compare-outline'}
          size={20}
        />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{summary.title}</Text>
          <Text style={[styles.delta, { color }]}>{summary.heroDelta}</Text>
        </View>
        <Text numberOfLines={1} style={styles.detail}>{summary.detail}</Text>
        <Text style={styles.stacks}>{stacks}</Text>
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1 },
    icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1, gap: 3 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    title: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '700' },
    delta: { fontSize: 12, fontWeight: '800' },
    detail: { color: palette.text, fontSize: 10, lineHeight: 14 },
    stacks: { color: palette.muted, fontSize: 9, lineHeight: 13 },
  });
}
