import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { useLocalization } from '../../localization';
import { formatChips } from '../../domain/poker/moneyFormat';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { TournamentHudModel } from './tournamentHud';

/**
 * B2: the compact tournament HUD. One readable status line — provisional
 * place, players left, blinds, hands to the next level, and a milestone badge
 * — with the full standings in a small drawer that expands ABOVE the legal
 * action row (it never covers the controls). The drawer is pure presentation:
 * opening it touches no timer, so a timed invitation clock keeps running.
 */
export function TournamentHudView({ hud }: { hud: TournamentHudModel }) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const milestoneLabel = hud.milestone === 'bubble'
    ? t('multiway.hud.bubble')
    : hud.milestone === 'headsUp'
      ? t('multiway.hud.headsUp')
      : null;
  return (
    // B2 QA fix: the control rail shrink-wraps its children, which collapsed
    // the flex:1 status text to zero width and truncated drawer names — the
    // HUD must stretch to the rail's full width instead.
    <View style={styles.host}>
      {drawerOpen ? (
        <View accessibilityViewIsModal style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>{t('multiway.hud.standings')}</Text>
            <Pressable
              accessibilityLabel={t('multiway.hud.standings')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setDrawerOpen(false)}
              style={styles.drawerClose}
            >
              <Ionicons color={palette.muted} name="chevron-down" size={18} />
            </Pressable>
          </View>
          <ScrollView style={styles.drawerScroll} contentContainerStyle={styles.drawerContent}>
            {hud.standings.map((row) => (
              <View key={row.playerId} style={[styles.standingRow, row.isViewer && styles.standingViewer]}>
                {/* Equal holdings share a place, matching the headline rule. */}
                <Text style={styles.standingPlace}>#{row.place}</Text>
                <Text numberOfLines={1} style={[styles.standingName, row.isViewer && styles.standingViewerText]}>
                  {row.name}{row.isViewer && row.name !== t('multiway.hud.you') ? ` · ${t('multiway.hud.you')}` : ''}
                </Text>
                <Text style={[styles.standingStack, row.eliminated && styles.standingOut]}>{formatChips(row.stack)}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
      <Pressable
        accessibilityLabel={t('multiway.hud.lineA11y', {
          bigBlind: formatChips(hud.bigBlind),
          place: hud.provisionalPlace,
          remaining: hud.playersRemaining,
          smallBlind: formatChips(hud.smallBlind),
          target: hud.qualifyingPlace ?? hud.playerCount,
        })}
        accessibilityRole="button"
        onPress={() => setDrawerOpen((open) => !open)}
        style={styles.line}
        testID="tournament.hud"
      >
        <Ionicons color={palette.primary} name="trophy-outline" size={13} />
        <Text numberOfLines={1} maxFontSizeMultiplier={1.5} style={styles.lineText}>
          {t('multiway.hud.place', { place: hud.provisionalPlace, remaining: hud.playersRemaining })}
          {hud.qualifyingPlace != null ? ` · ${t('multiway.hud.target', { place: hud.qualifyingPlace })}` : ''}
          {` · ${t('multiway.hud.blinds', { bigBlind: formatChips(hud.bigBlind), smallBlind: formatChips(hud.smallBlind) })}`}
          {hud.handsToNextLevel != null ? ` · ${t('multiway.hud.handsToLevel', { hands: hud.handsToNextLevel })}` : ''}
        </Text>
        {milestoneLabel ? (
          <View style={styles.milestone}><Text style={styles.milestoneText}>{milestoneLabel}</Text></View>
        ) : null}
        <Ionicons color={palette.muted} name={drawerOpen ? 'chevron-down' : 'chevron-up'} size={14} />
      </Pressable>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    host: { alignSelf: 'stretch', width: '100%' },
    drawer: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      marginBottom: 6,
      maxHeight: 230,
    },
    drawerClose: { minHeight: 32, minWidth: 32, alignItems: 'center', justifyContent: 'center' },
    drawerContent: { paddingBottom: 6 },
    drawerHeader: {
      alignItems: 'center',
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    drawerScroll: { flexGrow: 0 },
    drawerTitle: { color: palette.text, fontSize: 12, fontWeight: '800' },
    line: {
      alignItems: 'center',
      backgroundColor: palette.soft,
      borderColor: palette.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      minHeight: 30,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    lineText: { color: palette.text, flex: 1, fontSize: 11.5, fontWeight: '700' },
    milestone: {
      backgroundColor: palette.accentSoft,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    milestoneText: { color: palette.primary, fontSize: 10.5, fontWeight: '800' },
    standingName: { color: palette.text, flex: 1, fontSize: 12.5, fontWeight: '600', marginHorizontal: 8 },
    standingOut: { color: palette.muted },
    standingPlace: { color: palette.primary, fontSize: 12, fontWeight: '800', minWidth: 26 },
    standingRow: { alignItems: 'center', flexDirection: 'row', minHeight: 34, paddingHorizontal: 12 },
    standingStack: { color: palette.text, fontSize: 12.5, fontWeight: '700' },
    standingViewer: { backgroundColor: palette.accentSoft },
    standingViewerText: { fontWeight: '800' },
  });
}
