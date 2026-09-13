import { useMemo, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DecorativeIcon } from '../../components/DecorativeIcon';
import type { Ionicons } from '@expo/vector-icons';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';
import type { MultiplayerTableStatus } from './multiplayerTableStatus';

type StatusIconName = ComponentProps<typeof Ionicons>['name'];

const statusIcons: Record<Exclude<MultiplayerTableStatus['kind'], 'none'>, StatusIconName> = {
  pausedByHost: 'pause-circle-outline',
  rebuyRequired: 'alert-circle-outline',
  reconnecting: 'cloud-offline',
  returnQueued: 'time-outline',
  sittingOut: 'pause-circle-outline',
  waitingForPlayers: 'hourglass-outline',
};

/**
 * A2: the one consistent table status area. Renders the single prioritized
 * status from `resolveMultiplayerTableStatus` with its recovery action, in the
 * same visual and accessibility idiom as the sitting-out banner it absorbs
 * (P18-003): an accessibility live region so state changes are announced, and
 * a 44-point minimum action target.
 */
export function MultiplayerTableStatusView({
  onReturnNextHand,
  returnQueued,
  status,
}: {
  /** Present when the viewer may return (connected, funded sitting-out human). */
  onReturnNextHand?: () => void;
  /** True while a live-play return is queued for the next between-hands boundary. */
  returnQueued?: boolean;
  status: MultiplayerTableStatus;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (status.kind === 'none') return null;
  const actionLabel = status.kind === 'sittingOut' && onReturnNextHand
    ? t('multiplayer.game.returnNextHand')
    : status.kind === 'sittingOut' && returnQueued
      ? t('multiplayer.game.returnQueued')
      : status.actionLabelKey
        ? t(status.actionLabelKey)
        : null;
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.banner}
    >
      <DecorativeIcon color={palette.primary} name={statusIcons[status.kind]} size={18} />
      <View style={styles.copy}>
        <Text maxFontSizeMultiplier={1.5} style={styles.text}>{t(status.messageKey)}</Text>
      </View>
      {status.action === 'returnNextHand' && onReturnNextHand && !returnQueued ? (
        <Pressable
          accessibilityRole="button"
          onPress={onReturnNextHand}
          style={({ pressed }) => [styles.returnButton, pressed && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={1.5} style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : status.action === 'returnNextHand' && returnQueued ? (
        <View style={styles.queuedPill}>
          <Text maxFontSizeMultiplier={1.5} style={styles.queuedText}>{t('multiplayer.game.returnQueued')}</Text>
        </View>
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    actionText: { color: palette.primaryText, fontSize: 12, fontWeight: '800' },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.soft,
    },
    copy: { flex: 1, minWidth: 0 },
    pressed: { opacity: 0.74 },
    queuedPill: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' },
    queuedText: { color: palette.muted, fontSize: 12, fontWeight: '600' },
    // The recovery action must clear the 44-point minimum target (P18-013).
    returnButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
    text: { color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  });
}
