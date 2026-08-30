import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { useAppTheme } from '../../theme';
import type { LiveTableOrientationControl } from './useTableOrientation';

export function TableOrientationControl({
  control,
}: {
  control: LiveTableOrientationControl;
}) {
  const { palette } = useAppTheme();
  const { t } = useLocalization();
  const busy = control.snapshot.presentation === 'changing';
  const failure = control.snapshot.failure === null
    ? null
    : t(control.snapshot.failure === 'unsupported'
      ? 'orientation.unsupported'
      : 'orientation.failed');

  return (
    <View style={styles.wrap}>
      <View
        accessibilityLabel={t('orientation.control')}
        accessibilityRole="tablist"
        style={[styles.control, { backgroundColor: palette.soft, borderColor: palette.border }]}
      >
        {(['portrait', 'landscape'] as const).map((selection) => {
          const selected = control.snapshot.selected === selection;
          return (
            <Pressable
              accessibilityLabel={t(selection === 'portrait' ? 'orientation.portrait' : 'orientation.landscape')}
              accessibilityRole="tab"
              accessibilityState={{ busy, disabled: busy, selected }}
              disabled={busy}
              key={selection}
              onPress={() => control.select(selection)}
              style={({ pressed }) => [
                styles.option,
                selected && { backgroundColor: palette.surface, borderColor: palette.primary },
                pressed && styles.pressed,
              ]}
            >
              {busy && selected ? (
                <ActivityIndicator color={palette.primary} size="small" />
              ) : (
                <Ionicons
                  color={selected ? palette.primary : palette.muted}
                  name={selection === 'portrait' ? 'phone-portrait-outline' : 'phone-landscape-outline'}
                  size={15}
                />
              )}
            </Pressable>
          );
        })}
      </View>
      {failure ? (
        <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[styles.failure, { color: palette.danger }]}>
          {failure}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    borderRadius: 11,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 2,
    padding: 2,
  },
  failure: {
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    maxWidth: 88,
    position: 'absolute',
    right: 0,
    textAlign: 'right',
    top: 34,
  },
  option: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 8,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 30,
  },
  pressed: { opacity: 0.65 },
  wrap: { zIndex: 40 },
});
