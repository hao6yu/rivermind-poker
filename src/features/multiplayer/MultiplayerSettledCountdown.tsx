import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { type ThemePalette, useAppTheme } from '../../theme';

interface MultiplayerSettledCountdownProps {
  actionLabel?: string;
  busy: boolean;
  label: string;
  onPress?: () => void;
  wide: boolean;
}

/** A wrapping settled-state clock; localized copy must never be ellipsized. */
export function MultiplayerSettledCountdown({
  actionLabel,
  busy,
  label,
  onPress,
  wide,
}: MultiplayerSettledCountdownProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, wide), [palette, wide]);
  return (
    <Pressable
      accessibilityLabel={actionLabel ? `${label}. ${actionLabel}` : label}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { disabled: busy } : undefined}
      disabled={busy || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.root,
        busy && styles.disabled,
        pressed && !busy && styles.pressed,
      ]}
    >
      <Ionicons color={palette.primary} name="timer-outline" size={13} />
      <Text maxFontSizeMultiplier={1.25} style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette, wide: boolean) {
  return StyleSheet.create({
    disabled: { opacity: 0.42 },
    label: { flexShrink: 1, color: palette.primary, fontSize: wide ? 10.5 : 9, lineHeight: wide ? 14 : 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
    pressed: { opacity: 0.74, transform: [{ scale: 0.99 }] },
    root: { alignSelf: 'stretch', minHeight: 20, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, paddingRight: 7, borderRadius: 8 },
  });
}
