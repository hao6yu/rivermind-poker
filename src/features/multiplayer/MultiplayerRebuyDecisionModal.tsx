import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MULTIPLAYER_REBUY_CHIPS } from '../../domain/multiplayer/contracts';
import { formatChips } from '../../domain/poker/moneyFormat';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import { LIVE_TABLE_SUPPORTED_ORIENTATIONS } from '../table/useTableOrientation';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface MultiplayerRebuyDecisionModalProps {
  busy: boolean;
  onRebuy: () => void;
  onSitOut: () => void;
  visible: boolean;
}

/**
 * A busted seat must make one explicit server-owned lifecycle decision. Keep
 * that choice in a focused modal instead of stacking it into the already
 * dense settled-result rail. There is deliberately no backdrop dismissal:
 * Rebuy and Sit out are the two truthful ways to resolve the pending seat.
 */
export function MultiplayerRebuyDecisionModal({
  busy,
  onRebuy,
  onSitOut,
  visible,
}: MultiplayerRebuyDecisionModalProps) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReducedMotion();
  // P18-017: the label quotes the server-owned rebuy amount instead of a
  // hard-coded "4,000", so the copy can never drift from the worker's ledger.
  const rebuyAmount = formatChips(MULTIPLAYER_REBUY_CHIPS);

  return (
    <Modal
      animationType={reduceMotion ? 'none' : "fade"}
      onRequestClose={() => undefined}
      supportedOrientations={LIVE_TABLE_SUPPORTED_ORIENTATIONS}
      transparent
      visible={visible}
    >
      <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.scrim}>
        <View accessibilityViewIsModal style={styles.sheet}>
          <View style={styles.headingRow}>
            <View style={styles.icon}>
              <Ionicons color={palette.primary} name="refresh-circle-outline" size={25} />
            </View>
            <View style={styles.headingCopy}>
              <Text accessibilityRole="header" style={styles.title}>{t('multiplayer.game.rebuyPending')}</Text>
              <Text maxFontSizeMultiplier={1.5} style={styles.detail}>{t('multiplayer.rebuy.pending')}</Text>
            </View>
          </View>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={t('multiplayer.rebuy.actionA11y', { amount: rebuyAmount })}
              accessibilityRole="button"
              accessibilityState={{ busy, disabled: busy }}
              disabled={busy}
              onPress={onRebuy}
              style={({ pressed }) => [styles.primary, busy && styles.disabled, pressed && !busy && styles.pressed]}
            >
              {busy ? <ActivityIndicator color={palette.primaryText} size="small" /> : (
                <Text maxFontSizeMultiplier={1.3} style={styles.primaryText}>{t('multiplayer.rebuy.action', { amount: rebuyAmount })}</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityLabel={t('multiplayer.rebuy.sitOutA11y')}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onSitOut}
              style={({ pressed }) => [styles.secondary, busy && styles.disabled, pressed && !busy && styles.pressed]}
            >
              <Text maxFontSizeMultiplier={1.3} style={styles.secondaryText}>{t('multiplayer.rebuy.sitOut')}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    actions: { flexDirection: 'row', gap: 9 },
    detail: { color: palette.muted, fontSize: 12, fontWeight: '600', lineHeight: 18, marginTop: 3 },
    disabled: { opacity: 0.48 },
    headingCopy: { flex: 1, minWidth: 0 },
    headingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
    icon: { width: 42, height: 42, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.accentSoft },
    pressed: { opacity: 0.76, transform: [{ scale: 0.99 }] },
    primary: { minHeight: 50, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 14, backgroundColor: palette.primary },
    primaryText: { color: palette.primaryText, fontSize: 13.5, fontWeight: '900', textAlign: 'center' },
    scrim: { flex: 1, justifyContent: 'flex-end', padding: 12, backgroundColor: palette.scrim },
    secondary: { minHeight: 50, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface },
    secondaryText: { color: palette.text, fontSize: 13.5, fontWeight: '900', textAlign: 'center' },
    sheet: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16, padding: 18, borderRadius: 22, borderWidth: 1, borderColor: palette.primary, backgroundColor: palette.surfaceRaised, shadowColor: palette.shadow, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 8 },
    title: { color: palette.text, fontSize: 18, fontWeight: '900', lineHeight: 23 },
  });
}
