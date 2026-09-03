import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RADIUS } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * The shared determinate progress bar (S8/P18-047): one a11y-progressbar
 * track/fill pair. Value is clamped to [0, 100]. Pass `accessibilityLabel`;
 * when omitted the caller must provide one through wrapping copy.
 * Stable test ID: `ui.progressBar`.
 */
export function ProgressBar({
  accessibilityLabel,
  percent,
  testID = 'ui.progressBar',
}: {
  accessibilityLabel?: string;
  /** 0–100. Values outside the range are clamped. */
  percent: number;
  testID?: string;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: clamped }}
      style={styles.track}
      testID={testID}
    >
      <View style={[styles.fill, { width: `${clamped}%` }]} />
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    track: {
      backgroundColor: palette.soft,
      borderRadius: RADIUS.pill,
      height: 6,
      overflow: 'hidden',
    },
    fill: {
      backgroundColor: palette.primary,
      borderRadius: RADIUS.pill,
      height: '100%',
    },
  });
}
