import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Button } from './Button';
import { RADIUS, SPACING } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * The shared empty state (S8/P18-047): what a surface shows when it has
 * nothing to list yet — a calm glyph, one title, one body line, and an
 * optional next action. Used instead of blank space or zero-value metrics.
 * Stable test ID: `ui.emptyState`.
 */
export function EmptyState({
  actionAccessibilityLabel,
  actionLabel,
  body,
  iconName = 'leaf-outline',
  onAction,
  testID = 'ui.emptyState',
  title,
}: {
  actionAccessibilityLabel?: string;
  /** Renders the primary action row when both the label and handler exist. */
  actionLabel?: string;
  body?: string;
  iconName?: React.ComponentProps<typeof Ionicons>['name'];
  onAction?: () => void;
  testID?: string;
  title: string;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const showAction = Boolean(actionLabel && onAction);
  return (
    <View style={styles.card} testID={testID}>
      <View style={styles.iconRing}>
        <Ionicons color={palette.primary} name={iconName} size={22} />
      </View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {showAction ? (
        <Button
          accessibilityLabel={actionAccessibilityLabel ?? actionLabel}
          label={actionLabel!}
          onPress={onAction}
          size="compact"
          testID={`${testID}.action`}
          variant="secondary"
        />
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      alignItems: 'center',
      borderColor: palette.border,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.xl,
    },
    iconRing: {
      alignItems: 'center',
      backgroundColor: palette.accentSoft,
      borderRadius: RADIUS.pill,
      height: 44,
      justifyContent: 'center',
      width: 44,
    },
    title: {
      color: palette.text,
      fontSize: 15,
      fontWeight: '800',
      textAlign: 'center',
    },
    body: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: 'center',
    },
  });
}
