import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Eyebrow } from './Eyebrow';
import { elevationForScheme } from '../../theme/designTokens';
import { RADIUS, SPACING } from '../../theme/designTokens';
import { type ThemePalette, useAppTheme } from '../../theme';

/**
 * The shared section card (S8/P18-047): one raised surface with an optional
 * eyebrow and title, replacing the per-screen card chrome. Screens keep
 * composing their own body content and can add footers through `footer`.
 * Stable test ID: `ui.sectionCard`.
 */
export function SectionCard({
  children,
  eyebrow,
  footer,
  testID = 'ui.sectionCard',
  title,
}: {
  children: React.ReactNode;
  /** Small uppercase label above the title. */
  eyebrow?: string;
  /** Optional trailing node under a hairline separator. */
  footer?: React.ReactNode;
  testID?: string;
  /** The card's heading. */
  title?: string;
}) {
  const { palette, scheme } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, scheme), [palette, scheme]);
  return (
    <View style={styles.card} testID={testID}>
      {eyebrow ? <Eyebrow label={eyebrow} /> : null}
      {title !== undefined ? (
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      ) : null}
      {children}
      {footer ? (
        <View style={styles.footer}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

function createStyles(palette: ThemePalette, scheme: 'light' | 'dark') {
  const elevation = elevationForScheme(scheme, palette.shadow).level1;
  return StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      gap: SPACING.sm,
      padding: SPACING.lg,
      ...elevation,
    },
    title: { color: palette.text, fontSize: 17, fontWeight: '800' },
    footer: {
      borderTopColor: palette.border,
      borderTopWidth: 1,
      paddingTop: SPACING.sm,
    },
  });
}
