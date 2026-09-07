import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  CHAMPIONSHIP_EVENTS,
  championshipCurrentEvent,
  championshipIsComplete,
  championshipQualifiedCount,
  type ChampionshipProgress,
} from '../../domain/poker/championship';
import { championshipEntryFresh } from './playPresentation';
import { championshipEventText } from '../../localization/championship';
import { useLocalization } from '../../localization';
import { championshipPalette as palette } from '../../themePalette';
import { TYPOGRAPHY } from '../../theme/designTokens';
import { championshipMapArtwork } from './championshipMapArtwork';

/** The progress line counts the ten main championship events. */
const CHAMPIONSHIP_MAIN_EVENT_COUNT = CHAMPIONSHIP_EVENTS.length;

/**
 * The branded Championship entry (Slice 3.11C): a dedicated card that names
 * the journey — the current stop and its table size, the completed-event
 * count, and the Continue/Start action. DT-03 removed the misleading
 * "Map & record" secondary action: the card header and Start/Continue open the
 * existing Championship journey, and Record stays inside the journey and
 * Profile. It is deliberately distinct from an ordinary MenuRow without
 * introducing a second navigation system.
 */
export function ChampionshipEntryCard({
  activeEvent,
  onOpen,
  progress,
  variant = 'full',
  testID = 'play.championship.entry',
}: {
  /** A saved mid-event Championship run exists for this device. */
  activeEvent?: boolean;
  onOpen: () => void;
  progress: ChampionshipProgress;
  variant?: 'full' | 'compact';
  testID?: string;
}) {
  const { t, tCount } = useLocalization();
  const [width, setWidth] = useState(0);
  const imageWidth = Math.max(width, 600);
  const skylineHeight = Math.min(176, imageWidth * 0.2);
  const currentEvent = championshipCurrentEvent(progress);
  const complete = championshipIsComplete(progress);
  const qualified = championshipQualifiedCount(progress);
  // "Continue" wins whenever a saved run exists, even before the first event
  // is qualified — the old caption used the checkpoint, and so does the card.
  const fresh = championshipEntryFresh(progress, activeEvent ?? false);
  const eventTitle = championshipEventText(currentEvent, 'title', t);
  const seats = tCount('common.players', currentEvent.playerCount);
  const stage = complete
    ? t('play.championshipCard.complete')
    : t('play.championshipCard.stage', { event: eventTitle, seats });
  const progressLabel = t('play.championshipCard.progress', { complete: qualified, total: CHAMPIONSHIP_MAIN_EVENT_COUNT });
  const actionLabel = t(fresh ? 'play.championshipCard.start' : 'play.championshipCard.continue');

  if (variant === 'compact') {
    return (
      <Pressable
        testID={testID}
        accessibilityLabel={`${t('home.championship')}. ${stage}. ${progressLabel}. ${actionLabel}`}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.card, styles.compactCard, pressed && styles.pressed]}
      >
        <View accessible={false} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Image accessible={false} source={championshipMapArtwork} resizeMode="cover" style={styles.compactArtwork} />
          <LinearGradient
            colors={[palette.surface, `${palette.surface}EE`, `${palette.surface}66`]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View style={styles.compactHead}>
          <View style={[styles.badge, styles.compactBadge]}>
            <Ionicons accessible={false} color={palette.primaryText} name="trophy" size={23} />
          </View>
          <View style={styles.copy}>
            <Text maxFontSizeMultiplier={1.3} style={styles.compactTitle}>{t('home.championship')}</Text>
            <Text maxFontSizeMultiplier={1.5} style={styles.compactSubtitle}>{stage}</Text>
          </View>
        </View>
        <View style={styles.compactProgress}>
          <Text maxFontSizeMultiplier={1.4} style={styles.compactMeta}>{progressLabel}</Text>
          <View accessible={false} style={styles.compactTrack}>
            <View style={[styles.compactFill, { width: `${(qualified / CHAMPIONSHIP_MAIN_EVENT_COUNT) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.compactAction}>
          <Text maxFontSizeMultiplier={1.4} style={styles.compactActionText}>{actionLabel}</Text>
          <Ionicons accessible={false} color={palette.primary} name="arrow-forward" size={18} />
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.card} onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}>
      <Pressable
        testID={testID}
        accessibilityLabel={t('play.championshipCard.headA11y', { event: eventTitle })}
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <View accessible={false} pointerEvents="none" style={[styles.skyline, { height: skylineHeight }]}>
          <Image accessible={false} source={championshipMapArtwork} resizeMode="stretch" style={{ position: 'absolute', width: imageWidth, height: imageWidth * 1.5, top: 0, left: (width - imageWidth) * 0.65 }} />
          <LinearGradient colors={[`${palette.surface}00`, palette.surface]} locations={[0.55, 1]} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.head}>
          <View style={styles.badge}>
            <Ionicons accessible={false} color={palette.primaryText} name="trophy" size={22} />
          </View>
          <View style={styles.copy}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
              {t('home.championship')}
            </Text>
            <Text maxFontSizeMultiplier={1.5} style={styles.subtitle}>
              {stage}
            </Text>
          </View>
          <Ionicons accessible={false} color={palette.muted} name="chevron-forward" size={20} />
        </View>
      </Pressable>
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <View style={styles.meta}>
            <Ionicons accessible={false} color={palette.primary} name="checkmark-done-outline" size={14} />
            <Text maxFontSizeMultiplier={1.4} style={styles.metaText}>
              {progressLabel}
            </Text>
          </View>
          {/* DT-03: the journey is the map, so the card exposes no separate
              "Map & record" action. Record stays inside the journey and Profile. */}
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
            {actionLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, overflow: 'hidden' },
  compactCard: { padding: 16, gap: 12 },
  compactArtwork: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 200, opacity: 0.6 },
  compactHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  compactBadge: { width: 44, height: 44, borderRadius: 12 },
  compactTitle: { color: palette.text, ...TYPOGRAPHY.sectionTitle, fontWeight: '900' },
  compactSubtitle: { color: palette.muted, ...TYPOGRAPHY.caption, lineHeight: 18 },
  compactProgress: { gap: 8 },
  compactMeta: { color: palette.muted, ...TYPOGRAPHY.caption, fontWeight: '600' },
  compactTrack: { height: 4, borderRadius: 4, backgroundColor: palette.surfaceRaised, overflow: 'hidden' },
  compactFill: { height: 4, borderRadius: 4, backgroundColor: palette.primary },
  compactAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  compactActionText: { flexShrink: 1, color: palette.primary, ...TYPOGRAPHY.caption, fontWeight: '800' },
  skyline: { overflow: 'hidden', backgroundColor: palette.background },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12, minHeight: 64 },
  body: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  pressed: { opacity: 0.75 },
  badge: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.primary },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: palette.text, ...TYPOGRAPHY.sectionTitle, fontWeight: '900', letterSpacing: 0.3 },
  subtitle: { color: palette.muted, ...TYPOGRAPHY.caption, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  metaText: { color: palette.primary, ...TYPOGRAPHY.caption, fontWeight: '700', flexShrink: 1 },
  action: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: palette.primary, paddingVertical: 12, paddingHorizontal: 16 },
  actionText: { color: palette.primaryText, ...TYPOGRAPHY.bodyLarge, fontWeight: '800', textAlign: 'center' },
});
