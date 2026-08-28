import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { PlayStatistics } from '../../domain/stats/playStatistics';
import { type ThemePalette, useAppTheme } from '../../theme';
import { useLocalization } from '../../localization';
import { describePlayStatistics } from './playStatisticsPresentation';

/**
 * The compact play record: what the player has actually finished, counted the
 * same way in every mode. It is a read-out, not a menu — the routes into the
 * detailed history and learning sheets stay in the settings rows below it.
 */
export function PlayStatisticsCard({
  large,
  loading,
  statistics,
}: {
  large?: boolean;
  loading: boolean;
  statistics: PlayStatistics | null;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const panel = statistics === null ? null : describePlayStatistics(statistics, t);

  return (
    <View style={[styles.card, large && styles.cardLarge]}>
      <View style={styles.header}>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.4} style={[styles.title, large && styles.titleLarge]}>
          {t('profile.stats.title')}
        </Text>
        {loading ? <ActivityIndicator color={palette.primary} size="small" /> : null}
      </View>

      {panel === null ? (
        // Nothing has been read yet. Only say so once the read has actually
        // settled — a card that apologizes while it is still loading is noise.
        loading ? null : (
          <Text maxFontSizeMultiplier={1.5} style={[styles.emptyText, large && styles.emptyTextLarge]}>
            {t('profile.stats.noteUnavailable')}
          </Text>
        )
      ) : panel.isEmpty ? (
        <Text maxFontSizeMultiplier={1.5} style={[styles.emptyText, large && styles.emptyTextLarge]}>
          {panel.notes[0]}
        </Text>
      ) : (
        <>
          <View style={styles.tileRow}>
            {panel.tiles.map((entry) => (
              <View
                key={entry.id}
                accessibilityLabel={entry.accessibilityLabel}
                style={[styles.tile, large && styles.tileLarge]}
              >
                <Text maxFontSizeMultiplier={1.25} numberOfLines={1} style={[styles.tileValue, large && styles.tileValueLarge]}>
                  {entry.value}
                </Text>
                <Text maxFontSizeMultiplier={1.4} numberOfLines={2} style={styles.tileLabel}>
                  {t(entry.labelKey)}
                </Text>
              </View>
            ))}
          </View>

          {panel.modes.length > 1 ? (
            <View style={styles.modeList}>
              {panel.modes.map((mode) => (
                <View key={mode.id} style={styles.modeRow}>
                  <Text maxFontSizeMultiplier={1.4} style={styles.modeLabel}>
                    {t(mode.labelKey)}
                  </Text>
                  <Text maxFontSizeMultiplier={1.4} style={styles.modeDetail}>
                    {mode.detail}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.noteList}>
            {panel.notes.map((note) => (
              <Text key={note} maxFontSizeMultiplier={1.5} style={styles.noteText}>
                {note}
              </Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 12,
    },
    cardLarge: { paddingHorizontal: 22, paddingVertical: 18, gap: 16 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    title: { color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: '800', letterSpacing: 0.2 },
    titleLarge: { fontSize: 16, lineHeight: 22 },
    emptyText: { color: palette.muted, fontSize: 12.5, lineHeight: 19 },
    emptyTextLarge: { fontSize: 14, lineHeight: 21 },
    tileRow: { flexDirection: 'row', gap: 6 },
    tile: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2, paddingVertical: 6 },
    tileLarge: { paddingVertical: 9 },
    tileValue: { color: palette.text, fontSize: 20, lineHeight: 24, fontWeight: '800' },
    tileValueLarge: { fontSize: 24, lineHeight: 28 },
    tileLabel: { color: palette.muted, fontSize: 10.5, lineHeight: 13, fontWeight: '700', textAlign: 'center' },
    modeList: { gap: 6, borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 10 },
    modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    modeLabel: { color: palette.text, fontSize: 12.5, lineHeight: 17, fontWeight: '700', flexShrink: 1 },
    modeDetail: { color: palette.muted, fontSize: 12, lineHeight: 17, fontWeight: '600', flexShrink: 0 },
    noteList: { gap: 3 },
    noteText: { color: palette.muted, fontSize: 11, lineHeight: 16 },
  });
}
