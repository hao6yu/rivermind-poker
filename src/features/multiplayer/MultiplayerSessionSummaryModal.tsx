import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HumanAvatar } from '../../components/HumanAvatar';
import { ModalBackdrop } from '../../components/ModalBackdrop';
import type { MultiplayerSessionSummary } from '../../domain/multiplayer/contracts';
import { formatChips, formatChipsSigned } from '../../domain/poker/moneyFormat';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

interface MultiplayerSessionSummaryModalProps {
  busy: boolean;
  onClose: () => void;
  onRematch?: () => void;
  onReviewHands?: () => void;
  /** The room the ranked session ran in; authorizes foreign uploaded avatars' cached images. */
  roomId: string;
  summary: MultiplayerSessionSummary;
  visible: boolean;
  wide: boolean;
}

/**
 * Session-level result UI. It deliberately stays separate from the final-hand
 * result panel: one explains the last pot, while this sheet ranks the complete
 * private-table run and exposes the next durable action.
 */
export function MultiplayerSessionSummaryModal({
  busy,
  onClose,
  onRematch,
  onReviewHands,
  roomId,
  summary,
  visible,
  wide,
}: MultiplayerSessionSummaryModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const reduceMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  const viewer = summary.rows.find((row) => row.isViewer) ?? null;
  const leaders = summary.rows.filter((row) => row.place === 1);
  const headline = leaders.length > 1
    ? t('multiplayer.session.leaders', { names: leaders.map((row) => row.label).join(' · ') })
    : t('multiplayer.session.winner', { name: leaders[0]?.label ?? summary.rows[0]?.label ?? '—' });
  const completion = t(summary.completionReason === 'last-player-standing'
    ? 'multiplayer.session.lastPlayer'
    : 'multiplayer.session.handLimit');

  return (
    <Modal
      animationType={reduceMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.scrim}>
        <ModalBackdrop accessibilityLabel={t('multiplayer.session.close')} onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { paddingBottom: Math.max(18, insets.bottom + 8) }]}
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>{t('multiplayer.session.eyebrow')}</Text>
              <Text accessibilityRole="header" style={styles.title}>{t('multiplayer.session.title')}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('multiplayer.session.close')}
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Ionicons color={palette.text} name="close" size={wide ? 23 : 20} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.heroCard}>
              <View style={styles.trophyIcon}>
                <Ionicons color={palette.aquaText} name="trophy" size={wide ? 27 : 23} />
              </View>
              <View style={styles.heroCopy}>
                <Text style={styles.headline}>{headline}</Text>
                <Text style={styles.subtitle}>{t('multiplayer.session.subtitle', {
                  hands: summary.handsPlayed,
                  session: summary.sessionNumber,
                })}</Text>
                <Text style={styles.completion}>{completion}</Text>
              </View>
            </View>

            <View style={styles.metrics}>
              <SessionMetric
                label={t('multiplayer.session.yourPlace')}
                value={viewer ? t('multiplayer.session.place', { place: viewer.place }) : '—'}
                wide={wide}
              />
              <SessionMetric
                label={t('multiplayer.session.finalStack')}
                value={viewer ? formatChips(viewer.stack) : '—'}
                wide={wide}
              />
              <SessionMetric
                label={t('multiplayer.session.netChange')}
                tone={viewer && viewer.delta > 0 ? 'positive' : viewer && viewer.delta < 0 ? 'negative' : 'neutral'}
                value={viewer ? formatChipsSigned(viewer.delta) : '—'}
                wide={wide}
              />
            </View>

            <View style={styles.standings}>
              {summary.rows.map((row) => (
                <View
                  accessibilityLabel={t('multiplayer.session.rowA11y', {
                    delta: formatChipsSigned(row.delta),
                    name: row.label,
                    place: row.place,
                    stack: formatChips(row.stack),
                  })}
                  accessible
                  key={row.playerId}
                  style={[styles.row, row.isViewer && styles.viewerRow]}
                >
                  <View style={[styles.place, row.place === 1 && styles.firstPlace]}>
                    <Text style={[styles.placeText, row.place === 1 && styles.firstPlaceText]}>{row.place}</Text>
                  </View>
                  <View style={styles.playerIcon}>
                    {row.kind === 'human' && row.avatar ? (
                      <HumanAvatar
                        accessibilityLabel={row.label}
                        avatar={row.avatar}
                        displayName={row.label}
                        roomId={roomId}
                        size={wide ? 20 : 17}
                      />
                    ) : (
                      <Ionicons
                        color={row.isViewer ? palette.aquaText : palette.muted}
                        name={row.kind === 'ai' ? 'hardware-chip' : 'person'}
                        size={wide ? 20 : 17}
                      />
                    )}
                  </View>
                  <View style={styles.rowCopy}>
                    <Text numberOfLines={1} style={styles.playerName}>{row.label}</Text>
                    <Text style={styles.stack}>{formatChips(row.stack)}</Text>
                  </View>
                  <Text style={[
                    styles.delta,
                    row.delta > 0 && styles.positive,
                    row.delta < 0 && styles.negative,
                  ]}>{formatChipsSigned(row.delta)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {!onRematch ? <Text style={styles.waiting}>{t('multiplayer.session.waitingHost')}</Text> : null}
          <View style={styles.actions}>
            {onReviewHands ? (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                onPress={onReviewHands}
                style={({ pressed }) => [styles.secondaryButton, busy && styles.disabled, pressed && !busy && styles.pressed]}
              >
                <Ionicons color={palette.primary} name="albums-outline" size={18} />
                <Text style={styles.secondaryText}>{t('multiplayer.session.reviewHands')}</Text>
              </Pressable>
            ) : null}
            {onRematch ? (
              <Pressable
                accessibilityHint={t('multiplayer.session.rematchHint')}
                accessibilityRole="button"
                accessibilityState={{ busy, disabled: busy }}
                disabled={busy}
                onPress={onRematch}
                style={({ pressed }) => [styles.primaryButton, busy && styles.disabled, pressed && !busy && styles.pressed]}
              >
                {busy ? <ActivityIndicator color={palette.primaryText} size="small" /> : (
                  <>
                    <Text style={styles.primaryText}>{t('multiplayer.session.rematch')}</Text>
                    <Ionicons color={palette.primaryText} name="refresh" size={18} />
                  </>
                )}
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SessionMetric({
  label,
  tone = 'neutral',
  value,
  wide,
}: {
  label: string;
  tone?: 'negative' | 'neutral' | 'positive';
  value: string;
  wide: boolean;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  return (
    <View style={styles.metric}>
      <Text
        adjustsFontSizeToFit
        minimumFontScale={0.78}
        numberOfLines={1}
        style={[
          styles.metricValue,
          tone === 'positive' && styles.positive,
          tone === 'negative' && styles.negative,
        ]}
      >{value}</Text>
      <Text numberOfLines={2} style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette, wide: boolean) {
  return StyleSheet.create({
    scrim: { flex: 1, justifyContent: 'flex-end', padding: wide ? 20 : 12, backgroundColor: palette.scrim },
    sheet: { width: '100%', maxWidth: 680, maxHeight: wide ? '84%' : '91%', alignSelf: 'center', gap: wide ? 17 : 13, padding: wide ? 24 : 17, borderRadius: wide ? 28 : 23, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerCopy: { flex: 1, minWidth: 0 },
    eyebrow: { color: palette.primary, fontSize: wide ? 11 : 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
    title: { color: palette.text, fontSize: wide ? 25 : 21, lineHeight: wide ? 31 : 26, fontWeight: '900', marginTop: 2 },
    closeButton: { width: wide ? 44 : 40, height: wide ? 44 : 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.soft },
    content: { gap: wide ? 15 : 12, paddingBottom: 2 },
    heroCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: wide ? 17 : 14, borderRadius: 18, borderWidth: 1, borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    trophyIcon: { width: wide ? 50 : 43, height: wide ? 50 : 43, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: palette.surface },
    heroCopy: { flex: 1, minWidth: 0, gap: 2 },
    headline: { color: palette.text, fontSize: wide ? 18 : 15, lineHeight: wide ? 23 : 20, fontWeight: '900' },
    subtitle: { color: palette.aquaText, fontSize: wide ? 12 : 10.5, fontWeight: '800' },
    completion: { color: palette.muted, fontSize: wide ? 11 : 9.5, lineHeight: wide ? 16 : 14, marginTop: 2 },
    metrics: { flexDirection: 'row', gap: 8 },
    metric: { flex: 1, minWidth: 0, minHeight: wide ? 79 : 68, justifyContent: 'space-between', gap: 4, padding: wide ? 13 : 10, borderRadius: 15, backgroundColor: palette.soft },
    metricValue: { color: palette.text, fontSize: wide ? 20 : 16, fontWeight: '900', fontVariant: ['tabular-nums'] },
    metricLabel: { color: palette.muted, fontSize: wide ? 10.5 : 9, lineHeight: wide ? 14 : 12 },
    standings: { gap: 7 },
    row: { minHeight: wide ? 64 : 54, flexDirection: 'row', alignItems: 'center', gap: wide ? 11 : 8, paddingHorizontal: wide ? 14 : 10, paddingVertical: 8, borderRadius: 15, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    viewerRow: { borderColor: palette.aqua, backgroundColor: palette.aquaSoft },
    place: { width: wide ? 31 : 27, height: wide ? 31 : 27, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: palette.soft },
    firstPlace: { backgroundColor: palette.accentSoft },
    placeText: { color: palette.muted, fontSize: wide ? 13 : 11, fontWeight: '900' },
    firstPlaceText: { color: palette.primary },
    playerIcon: { width: wide ? 34 : 29, height: wide ? 34 : 29, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 11, backgroundColor: palette.surface },
    rowCopy: { flex: 1, minWidth: 0, gap: 1 },
    playerName: { color: palette.text, fontSize: wide ? 14 : 12, fontWeight: '900' },
    stack: { color: palette.muted, fontSize: wide ? 11 : 9.5, fontVariant: ['tabular-nums'] },
    delta: { flexShrink: 0, color: palette.muted, fontSize: wide ? 13 : 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
    positive: { color: palette.aquaText },
    negative: { color: palette.danger },
    waiting: { color: palette.muted, fontSize: wide ? 12 : 10.5, lineHeight: wide ? 17 : 15, textAlign: 'center' },
    actions: { flexDirection: 'row', gap: 8 },
    secondaryButton: { flex: 1, minHeight: wide ? 52 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceRaised },
    secondaryText: { color: palette.primary, fontSize: wide ? 13.5 : 12, fontWeight: '900', textAlign: 'center' },
    primaryButton: { flex: 1, minHeight: wide ? 52 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderRadius: 14, backgroundColor: palette.primary },
    primaryText: { color: palette.primaryText, fontSize: wide ? 13.5 : 12, fontWeight: '900', textAlign: 'center' },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
  });
}
