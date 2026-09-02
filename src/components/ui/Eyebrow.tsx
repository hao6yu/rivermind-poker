import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';


import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * The shared small uppercase label (S8/P18-047): the muted eyebrow used above
 * section titles, sheet headers, and metric groups. Stable test ID:
 * `ui.eyebrow`.
 */
export function Eyebrow({
  label,
  testID = 'ui.eyebrow',
  tone = 'muted',
}: {
  label: string;
  testID?: string;
  /** `muted` for plain sections, `accent` for highlighted ones. */
  tone?: 'muted' | 'accent';
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Text style={[styles.base, tone === 'accent' && styles.accent]} testID={testID}>
      {label}
    </Text>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    base: {
      color: palette.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    accent: { color: palette.primary },
  });
}
