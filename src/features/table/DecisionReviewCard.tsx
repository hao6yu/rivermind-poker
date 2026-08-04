import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DecisionComparison } from '../../domain/poker/decisionGrading';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { formatChips } from '../../domain/poker/moneyFormat';

export function DecisionReviewCard({
  comparison,
  compact = false,
}: {
  comparison: DecisionComparison;
  compact?: boolean;
}) {
  const { palette } = useAppTheme();
  const { language, t } = useLocalization();
  const styles = useMemo(() => createStyles(palette, compact), [compact, palette]);
  const gradeColor = comparison.grade === 'strong'
    ? palette.aqua : comparison.grade === 'close' ? palette.primary : palette.danger;
  const gradeLabel = comparison.grade === 'strong'
    ? t('decision.strong') : comparison.grade === 'close' ? t('decision.close') : t('decision.review');
  const summary = language === 'en' ? comparison.summary : t(`decision.summary.${comparison.grade}`);
  const detail = language === 'en'
    ? comparison.detail
    : t(comparison.street === 'preflop' ? 'decision.detail.preflop' : 'decision.detail.postflop');
  const chosen = language === 'en' ? comparison.chosen.label : localizedLine(comparison.chosen, t);
  const baseline = language === 'en' ? comparison.baseline.label : localizedLine(comparison.baseline, t);

  return (
    <View accessible accessibilityLabel={`${gradeLabel}. ${summary}`} style={styles.card}>
      <View style={styles.header}>
        <View style={styles.icon}>
          <Ionicons color={gradeColor} name={comparison.grade === 'strong' ? 'checkmark' : 'git-compare-outline'} size={compact ? 13 : 15} />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: gradeColor }]}>{gradeLabel}</Text>
          <Text numberOfLines={compact ? 1 : 2} style={styles.summary}>{summary}</Text>
        </View>
      </View>
      <View style={styles.lines}>
        <View style={styles.line}>
          <Text style={styles.lineLabel}>{t('decision.youChose')}</Text>
          <Text numberOfLines={1} style={styles.chosen}>{chosen}</Text>
        </View>
        <Ionicons color={palette.muted} name="arrow-forward" size={13} />
        <View style={styles.line}>
          <Text style={styles.lineLabel}>{t('decision.baseline')}</Text>
          <Text numberOfLines={1} style={styles.baseline}>{baseline}</Text>
        </View>
      </View>
      {!compact ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

function localizedLine(
  line: DecisionComparison['chosen'],
  t: ReturnType<typeof useLocalization>['t'],
): string {
  // The grader hands us the wager as a number, so the localized line formats it
  // in chips rather than parsing the English label back apart.
  const amount = line.amountChips === undefined ? undefined : formatChips(line.amountChips);
  if (line.action === 'raise') {
    return amount ? t('poker.action.raiseTo', { amount }) : t('poker.action.raise');
  }
  if (line.action === 'call') return amount ? t('poker.action.callAmount', { amount }) : t('poker.action.call');
  return t(line.action === 'check' ? 'poker.action.check' : 'poker.action.fold');
}

function createStyles(palette: ThemePalette, compact: boolean) {
  return StyleSheet.create({
    card: {
      gap: compact ? 7 : 9,
      paddingHorizontal: compact ? 10 : 12,
      paddingVertical: compact ? 8 : 11,
      borderRadius: 14,
      backgroundColor: palette.surfaceRaised,
      borderWidth: 1,
      borderColor: palette.border,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    icon: { width: compact ? 27 : 31, height: compact ? 27 : 31, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
    headerCopy: { flex: 1, gap: 2 },
    eyebrow: { fontSize: compact ? 8 : 9, fontWeight: '800', letterSpacing: 0.55, textTransform: 'uppercase' },
    summary: { color: palette.text, fontSize: compact ? 9 : 11, lineHeight: compact ? 12 : 15, fontWeight: '600' },
    lines: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    line: { flex: 1, minWidth: 0, gap: 2, paddingHorizontal: 8, paddingVertical: compact ? 5 : 7, borderRadius: 9, backgroundColor: palette.soft },
    lineLabel: { color: palette.muted, fontSize: 7, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.45 },
    chosen: { color: palette.text, fontSize: compact ? 9 : 10, fontWeight: '700' },
    baseline: { color: palette.primary, fontSize: compact ? 9 : 10, fontWeight: '800' },
    detail: { color: palette.muted, fontSize: 9, lineHeight: 13 },
  });
}
