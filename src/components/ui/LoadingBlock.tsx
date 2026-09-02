import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { RADIUS, SPACING } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * The shared loading block (S8/P18-047): the truthful "this data is arriving"
 * state (P18-024's contract — never render zero-value metrics while loading).
 * Stable test ID: `ui.loadingBlock`.
 */
export function LoadingBlock({
  label,
  testID = 'ui.loadingBlock',
}: {
  /** What is loading, e.g. "Loading your saved hands…". */
  label: string;
  testID?: string;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <View style={styles.card} testID={testID}>
      <ActivityIndicator color={palette.primary} size="small" />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    card: {
      alignItems: 'center',
      backgroundColor: palette.surfaceRaised,
      borderColor: palette.border,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      gap: SPACING.sm,
      paddingVertical: SPACING.xl,
      paddingHorizontal: SPACING.lg,
    },
    label: {
      color: palette.muted,
      fontSize: 13,
      fontWeight: '600',
      lineHeight: 18,
      textAlign: 'center',
    },
  });
}
