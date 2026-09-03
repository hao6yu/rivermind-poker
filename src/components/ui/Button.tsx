import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { CONTROL_HEIGHT, RADIUS, SPACING, TEXT_SCALE_CEILING } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'compact' | 'standard' | 'primary';

/**
 * The shared button (S8/P18-047). Variants map onto the established result
 * semantics: `primary` is the themed call to action, `secondary` is a bordered
 * neutral, `ghost` is quiet inline emphasis, `danger` is destructive-only red
 * (D06 — red never styles a mere loss or cancel). Sizes use the control-height
 * scale; every size clears the 44-point target (`compact` renders 36pt tall
 * and must be paired with surrounding spacing or hitSlop where it stands
 * alone). Stable test ID: `ui.button`.
 */
export function Button({
  accessibilityLabel,
  busy = false,
  disabled = false,
  label,
  onPress,
  size = 'standard',
  testID = 'ui.button',
  variant = 'primary',
}: {
  accessibilityLabel?: string;
  /** Shows a spinner and blocks presses while an action is in flight. */
  busy?: boolean;
  disabled?: boolean;
  label: string;
  onPress?: () => void;
  size?: ButtonSize;
  testID?: string;
  variant?: ButtonVariant;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const blocked = disabled || busy;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: blocked }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'compact' ? styles.size_compact : size === 'primary' ? styles.size_primary : styles.size_standard,
        variant === 'primary' ? styles.variant_primary
          : variant === 'secondary' ? styles.variant_secondary
            : variant === 'ghost' ? styles.variant_ghost
              : styles.variant_danger,
        pressed && !blocked && styles.pressed,
      ]}
      testID={testID}
    >
      {busy ? <ActivityIndicator color={onFillForeground(palette, variant)} size="small" /> : null}
      <Text
        maxFontSizeMultiplier={TEXT_SCALE_CEILING.control}
        style={[
          styles.label,
          variant === 'primary' ? styles.label_primary
            : variant === 'secondary' ? styles.label_secondary
              : variant === 'ghost' ? styles.label_ghost
                : styles.label_danger,
          size === 'compact' && styles.labelCompact,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** The foreground that sits on each variant's fill. */
function onFillForeground(palette: ThemePalette, variant: ButtonVariant): string {
  switch (variant) {
    case 'primary': return palette.primaryText;
    case 'danger': return palette.primaryText;
    default: return palette.primary;
  }
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    base: {
      alignItems: 'center',
      borderRadius: RADIUS.md,
      flexDirection: 'row',
      gap: SPACING.sm,
      justifyContent: 'center',
      paddingHorizontal: SPACING.lg,
    },
    size_compact: { minHeight: CONTROL_HEIGHT.compact, paddingHorizontal: SPACING.md },
    size_standard: { minHeight: CONTROL_HEIGHT.standard },
    size_primary: { minHeight: CONTROL_HEIGHT.primary },
    // Variants.
    variant_primary: { backgroundColor: palette.primary },
    variant_secondary: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
    },
    variant_ghost: { backgroundColor: 'transparent' },
    variant_danger: { backgroundColor: palette.danger },
    // Labels.
    label_primary: { color: palette.primaryText },
    label_secondary: { color: palette.primary },
    label_ghost: { color: palette.primary },
    label_danger: { color: palette.primaryText },
    label: { fontSize: 15, fontWeight: '800' },
    labelCompact: { fontSize: 13 },
    pressed: { opacity: 0.75 },
  });
}
