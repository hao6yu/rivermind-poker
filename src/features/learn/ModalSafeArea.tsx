import type { PropsWithChildren } from 'react';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { useAppTheme } from '../../theme';
import { modalSafeAreaPadding } from './modalSafeAreaGeometry';

export function ModalSafeArea({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <ModalSafeAreaFrame>{children}</ModalSafeAreaFrame>
    </SafeAreaProvider>
  );
}

function ModalSafeAreaFrame({ children }: PropsWithChildren) {
  const { palette } = useAppTheme();
  const liveInsets = useSafeAreaInsets();
  const initialInsets = initialWindowMetrics?.insets;
  const { bottom, left, right, top } = modalSafeAreaPadding(liveInsets, initialInsets);
  const style = useMemo(
    () => [styles.frame, {
      backgroundColor: palette.background,
      paddingBottom: bottom,
      paddingLeft: left,
      paddingRight: right,
      paddingTop: top,
    }],
    [bottom, left, palette.background, right, top],
  );

  return <View style={style}>{children}</View>;
}

const styles = StyleSheet.create({
  frame: { flex: 1 },
});
