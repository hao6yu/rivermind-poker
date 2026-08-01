import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../../theme';

export function ModalSafeArea({ children }: PropsWithChildren) {
  const { palette } = useAppTheme();
  const liveInsets = useSafeAreaInsets();
  const initialInsets = initialWindowMetrics?.insets;
  const top = Math.max(liveInsets.top, initialInsets?.top ?? 0);
  const bottom = Math.max(liveInsets.bottom, initialInsets?.bottom ?? 0);
  const style = useMemo(
    () => [styles.frame, { backgroundColor: palette.background, paddingBottom: bottom, paddingTop: top }],
    [bottom, palette.background, top],
  );

  return <View style={style}>{children}</View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
});
