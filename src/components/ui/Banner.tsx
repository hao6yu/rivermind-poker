import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { RADIUS, SPACING } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

type BannerTone = 'info' | 'attention' | 'error';

/**
 * The shared inline banner (S8/P18-047): the one presentation for a state the
 * player must notice — an interrupted upload, a queued recovery, an
 * unavailable feature. `attention` is the amber caution; `error` is reserved
 * for failures that changed what the player sees (D06: red stays
 * destructive/error only). An optional single recovery action renders on the
 * right. Stable test ID: `ui.banner`.
 */
export function Banner({
  actionAccessibilityLabel,
  actionLabel,
  children,
  iconName,
  onAction,
  testID = 'ui.banner',
  tone = 'info',
}: {
  actionAccessibilityLabel?: string;
  /** Renders one recovery action when both the label and handler exist. */
  actionLabel?: string;
  /** The message. Keep it one or two sentences; it wraps. */
  children: React.ReactNode;
  /** Overrides the tone's default glyph. */
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  onAction?: () => void;
  testID?: string;
  tone?: BannerTone;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const toneIcon: Record<BannerTone, React.ComponentProps<typeof Ionicons>['name']> = {
    info: 'information-circle-outline',
    attention: 'warning-outline',
    error: 'alert-circle-outline',
  };
  // Fill and foreground stay a palette-owned pair per tone: info sits on the
  // themed soft accent, attention on amber with its text token, error on the
  // danger fill with the on-fill foreground.
  const fill: Record<BannerTone, string> = {
    info: palette.accentSoft,
    attention: palette.amber,
    error: palette.danger,
  };
  const foreground: Record<BannerTone, string> = {
    info: palette.text,
    attention: palette.amberText,
    error: palette.primaryText,
  };
  const showAction = Boolean(actionLabel && onAction);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: fill[tone], borderColor: tone === 'info' ? palette.border : fill[tone] }]}
      testID={testID}
    >
      <Ionicons color={foreground[tone]} name={iconName ?? toneIcon[tone]} size={18} />
      <Text style={[styles.message, { color: foreground[tone] }]}>{children}</Text>
      {showAction ? (
        <Pressable
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          accessibilityRole="button"
          hitSlop={SPACING.xs}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          testID={`${testID}.action`}
        >
          <Text style={[styles.actionLabel, { color: foreground[tone] }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(_palette: ThemePalette) {
  return StyleSheet.create({
    banner: {
      alignItems: 'center',
      borderRadius: RADIUS.md,
      borderWidth: 1,
      flexDirection: 'row',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    message: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
    },
    action: {
      borderRadius: RADIUS.sm,
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: SPACING.xs,
    },
    actionLabel: { fontSize: 13, fontWeight: '800' },
    pressed: { opacity: 0.7 },
  });
}
