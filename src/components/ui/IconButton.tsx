import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RADIUS, SPACING } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * The shared round icon button (S8/P18-047): a 44-point target with the
 * themed chrome every screen's close/back/utility control shares. The glyph
 * stays decorative — pass the meaning through `accessibilityLabel`.
 * Stable test ID: `ui.iconButton`.
 */
export function IconButton({
  accessibilityLabel,
  color,
  disabled = false,
  name,
  onPress,
  size = 20,
  testID = 'ui.iconButton',
  variant = 'soft',
}: {
  accessibilityLabel: string;
  /** Glyph color; defaults to the themed text token. */
  color?: string;
  disabled?: boolean;
  name: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
  /** Glyph size in points; the target stays 44 regardless. */
  size?: number;
  testID?: string;
  /** `soft` fills the circle, `plain` renders the bare 44pt target. */
  variant?: 'soft' | 'plain';
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={SPACING.xs}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'soft' && styles.soft,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
    >
      <Ionicons color={color ?? palette.text} name={name} size={size} />
    </Pressable>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    base: {
      alignItems: 'center',
      borderRadius: RADIUS.md,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    soft: { backgroundColor: palette.soft },
    pressed: { opacity: 0.7 },
  });
}
