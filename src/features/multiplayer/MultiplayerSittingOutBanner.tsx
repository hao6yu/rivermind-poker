import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DecorativeIcon } from '../../components/DecorativeIcon';
import { useLocalization } from '../../localization';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * P18-003: the persistent sitting-out banner.
 *
 * A sat-out viewer previously had no persistent statement of their own state
 * during live play — the between-hands panel was the only place the Return
 * action existed, so a viewer who missed a deadline could watch hand after
 * hand with no visible way back. This banner renders whenever the viewer's
 * seat is sitting out (live play included), announces the state through an
 * accessibility live region, and hosts the Return next hand action. During
 * live play the return queues and fires at the next between-hands boundary;
 * the worker's one-missed-turn policy is unchanged.
 */
export function MultiplayerSittingOutBanner({
  onReturn,
  queued,
}: {
  /** Present when the viewer can return (connected, funded sitting-out human). */
  onReturn?: () => void;
  /** True while a live-play return is queued for the next between-hands boundary. */
  queued?: boolean;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={styles.banner}
    >
      <DecorativeIcon color={palette.primary} name="pause-circle-outline" size={18} />
      <View style={styles.copy}>
        <Text maxFontSizeMultiplier={1.5} style={styles.text}>{t('multiplayer.game.sittingOutBanner')}</Text>
      </View>
      {onReturn ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: Boolean(queued), disabled: Boolean(queued) }}
          disabled={Boolean(queued)}
          onPress={onReturn}
          style={({ pressed }) => [styles.returnButton, pressed && !queued && styles.pressed]}
        >
          <Text maxFontSizeMultiplier={1.5} style={styles.returnText}>{
            queued ? t('multiplayer.game.returnQueued') : t('multiplayer.game.returnNextHand')
          }</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
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
    text: { color: palette.text, fontSize: 12, lineHeight: 17, fontWeight: '600' },
    // The recovery action must clear the 44-point minimum target (P18-013).
    returnButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
    returnText: { color: palette.primaryText, fontSize: 12, fontWeight: '800' },
    pressed: { opacity: 0.74 },
  });
}
