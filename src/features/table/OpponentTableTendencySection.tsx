import { useMemo } from 'react';
import { Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { StyleSheet } from 'react-native';
import type { SessionHandRecord } from './sessionModels';
import { deriveOpponentTableTendencies, emptyOpponentTableTendencies } from './opponentTableTendencies';
import { localizeOpponentTableTendencies, opponentTendencyRows } from './opponentTendenciesPresentation';

/**
 * P18-038 — the "This table" tendency section for the tap-a-seat profile
 * sheet. Renders the sample-progress note below the floor, otherwise the
 * floored rates with the scope note. The persona description above it stays a
 * separate claim: who they are vs. what they did here.
 */
export function OpponentTableTendencySection({ hands, playerId }: { hands: readonly SessionHandRecord[]; playerId: string }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const localized = useMemo(() => {
    const map = deriveOpponentTableTendencies(hands);
    return localizeOpponentTableTendencies(map.get(playerId) ?? emptyOpponentTableTendencies(), t);
  }, [hands, playerId, t]);
  if (!localized.sectionVisible) {
    return (
      <View style={styles.card} testID="table.tendencies">
        <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>{t('opponentTendencies.eyebrow')}</Text>
        <Text maxFontSizeMultiplier={1.5} style={styles.scope}>{localized.sampleNoteLabel}</Text>
      </View>
    );
  }
  return (
    <View style={styles.card} testID="table.tendencies">
      <Text maxFontSizeMultiplier={1.3} style={styles.eyebrow}>{t('opponentTendencies.eyebrow')}</Text>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={styles.title}>{t('opponentTendencies.title')}</Text>
      <View style={styles.row}>
        <Text maxFontSizeMultiplier={1.3} style={styles.label}>{localized.handsObservedLabel}</Text>
      </View>
      {opponentTendencyRows(localized, t).map((row) => (
        <View key={row.label} style={styles.row}>
          <Text maxFontSizeMultiplier={1.3} style={styles.label}>{row.label}</Text>
          <Text maxFontSizeMultiplier={1.3} style={[styles.value, !row.ready && styles.valueFloor]}>{row.value}</Text>
        </View>
      ))}
      <Text maxFontSizeMultiplier={1.5} style={styles.scope}>{localized.scopeLabel}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: { gap: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.accentSoft },
    eyebrow: { color: palette.aquaText, fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: 15, fontWeight: '800' },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    label: { color: palette.muted, flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    value: { color: palette.text, fontSize: 14, fontWeight: '800' },
    valueFloor: { color: palette.muted, fontSize: 12, fontWeight: '700' },
    scope: { color: palette.muted, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  });
}
