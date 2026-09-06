import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { SPACING } from '../../theme/designTokens';

/** Only secondary information scrolls; the sibling action row keeps its height. */
export function TableRailContent({ children, landscape }: { children: ReactNode; landscape: boolean }) {
  return landscape ? (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      {children}
    </ScrollView>
  ) : <View style={styles.content}>{children}</View>;
}

/** Give the activity feed its own bounded viewport inside the information rail. */
export function TableRailFeed({ children }: { children: ReactNode }) {
  return <View style={styles.feed}>{children}</View>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  content: { gap: SPACING.sm, paddingBottom: SPACING.xs },
  feed: { height: SPACING.huge * 4 },
});
