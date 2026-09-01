import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

export interface MultiplayerReadOnlyOverlayPolicy {
  /** Read-only information never becomes unavailable merely because the
   * viewer owns the live action. */
  openable: true;
  /** The sheet keeps the decision visible without pausing or resetting it. */
  showTurnNotice: boolean;
}

/**
 * Shared policy for private-table profiles and Table stats. Keeping this
 * decision outside the screen prevents either launcher from drifting back to
 * the old "act first" behavior.
 */
export function multiplayerReadOnlyOverlayPolicy(input: {
  actionControlsEnabled: boolean;
  viewerTurn: boolean;
}): MultiplayerReadOnlyOverlayPolicy {
  return {
    openable: true,
    showTurnNotice: input.viewerTurn && input.actionControlsEnabled,
  };
}

/** Compact, live reminder rendered inside either read-only sheet. */
export function MultiplayerReadOnlyTurnNotice({
  secondsLeft,
  visible,
}: {
  secondsLeft: number | null;
  visible: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (!visible) return null;

  const copy = secondsLeft === null
    ? t('multiway.profile.turnNotice')
    : `${t('multiway.profile.turnNotice')} · ${t('multiplayer.game.seconds', { count: secondsLeft })}`;
  return (
    <View accessibilityLiveRegion="polite" accessible style={styles.notice}>
      <Ionicons color={palette.primary} name="timer-outline" size={15} />
      <Text style={styles.copy}>{copy}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    notice: {
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: palette.primary,
      backgroundColor: palette.accentSoft,
    },
    copy: {
      flexShrink: 1,
      color: palette.text,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '800',
      textAlign: 'center',
    },
  });
}
