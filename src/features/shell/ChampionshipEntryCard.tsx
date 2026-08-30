import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CHAMPIONSHIP_EVENTS,
  championshipCurrentEvent,
  championshipIsComplete,
  championshipQualifiedCount,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { championshipEventText } from '../../localization/championship';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

/** Completed-event denominator for the card's progress line: the ten main
 * events of the expanded tour once 3.11D lands; today's catalog until then. */
const CHAMPIONSHIP_MAIN_EVENT_COUNT = CHAMPIONSHIP_EVENTS.length;

/**
 * The branded Championship entry (Slice 3.11C): a dedicated card that names
 * the journey — the current stop and its table size, the completed-event
 * count, and the Continue/Start action — with a quiet route to the
 * map/record. It is deliberately distinct from an ordinary MenuRow without
 * introducing a second navigation system.
 */
export function ChampionshipEntryCard({
  onOpen,
  onOpenRecord,
  progress,
}: {
  onOpen: () => void;
  onOpenRecord: () => void;
  progress: ChampionshipProgress;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);
  const qualified = championshipQualifiedCount(progress);
  const fresh = qualified === 0;
  const eventTitle = championshipEventText(currentEvent, 'title', t);
  const seats = t('common.players', { count: currentEvent.playerCount });

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={t('play.championshipCard.headA11y', { event: eventTitle })}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.head, pressed && styles.pressed]}
      >
        <View style={styles.badge}>
          <Ionicons color={palette.primaryText} name="trophy" size={22} />
        </View>
        <View style={styles.copy}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} numberOfLines={1} style={styles.title}>
            {t('home.championship')}
          </Text>
          <Text maxFontSizeMultiplier={1.5} numberOfLines={2} style={styles.subtitle}>
            {complete
              ? t('play.championshipCard.complete')
              : t('play.championshipCard.stage', { event: eventTitle, seats })}
          </Text>
        </View>
        <Ionicons color={palette.muted} name="chevron-forward" size={20} />
      </Pressable>
      <View style={styles.metaRow}>
        <View style={styles.meta}>
          <Ionicons color={palette.primary} name="checkmark-done-outline" size={14} />
          <Text maxFontSizeMultiplier={1.4} style={styles.metaText}>
            {t('play.championshipCard.progress', { complete: qualified, total: CHAMPIONSHIP_MAIN_EVENT_COUNT })}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={t('play.championshipCard.recordA11y')}
          accessibilityRole="button"
          onPress={onOpenRecord}
          style={({ pressed }) => [styles.recordButton, pressed && styles.pressed]}
        >
          <Ionicons color={palette.primary} name="map-outline" size={14} />
          <Text maxFontSizeMultiplier={1.4} style={styles.recordText}>{t('play.championshipCard.record')}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel={fresh
          ? t('play.championshipCard.startA11y')
          : t('play.championshipCard.continueA11y')}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
      >
        <Text style={styles.actionText}>
          {fresh ? t('play.championshipCard.start') : t('play.championshipCard.continue')}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: palette.primary,
      backgroundColor: palette.accentSoft,
      padding: 14,
      gap: 12,
    },
    head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    pressed: { opacity: 0.75 },
    badge: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.primary,
    },
    copy: { flex: 1, gap: 2 },
    title: { color: palette.text, fontSize: 16, fontWeight: '900', letterSpacing: 0.3 },
    subtitle: { color: palette.muted, fontSize: 12, lineHeight: 16, fontWeight: '600' },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    meta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    metaText: { color: palette.text, fontSize: 11.5, fontWeight: '700' },
    recordButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    recordText: { color: palette.primary, fontSize: 12, fontWeight: '800' },
    action: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      backgroundColor: palette.primary,
      paddingVertical: 11,
      paddingHorizontal: 14,
    },
    actionText: { color: palette.primaryText, fontSize: 14, fontWeight: '800' },
  });
}
