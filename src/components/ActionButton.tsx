import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { type ThemePalette, useAppTheme } from '../theme';

interface ActionButtonProps {
  label: string;
  tone?: 'primary' | 'danger' | 'neutral';
  disabled?: boolean;
  onPress: () => void;
}

export function ActionButton({ label, tone = 'neutral', disabled = false, onPress }: ActionButtonProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'primary' && styles.primary,
        tone === 'danger' && styles.danger,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, tone === 'primary' && styles.primaryLabel, tone === 'danger' && styles.dangerLabel]}>{label}</Text>
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    button: {
      minHeight: 48,
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 13,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
      paddingHorizontal: 8,
    },
    primary: {
      backgroundColor: palette.primary,
      borderColor: palette.primary,
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 14,
      elevation: 2,
    },
    danger: { backgroundColor: palette.surface, borderColor: palette.border },
    label: { color: palette.text, fontSize: 13, fontWeight: '700' },
    primaryLabel: { color: palette.primaryText },
    dangerLabel: { color: palette.danger },
    disabled: { opacity: 0.35 },
    pressed: { transform: [{ scale: 0.98 }], opacity: 0.78 },
  });
}
