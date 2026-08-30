import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useLocalization } from '../../localization';
import { useAppTheme } from '../../theme';
import { tableOrientationDestination } from './tableOrientationController';
import type { LiveTableOrientationControl } from './useTableOrientation';

/**
 * The single orientation toggle (scope 3.11E): one 44-point target that always
 * switches to the OTHER orientation and labels that destination for
 * accessibility — no more two-tab selector. Rotation changes presentation
 * only; the in-flight state renders progress inside the same target, and
 * unsupported/failed feedback stays visible and announced.
 */
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
  const destination = tableOrientationDestination(control.snapshot.selected);
  const label = t(destination === 'portrait'
    ? 'orientation.switchToPortrait'
    : 'orientation.switchToLandscape');

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityHint={t('orientation.control')}
        accessibilityLabel={label}
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={() => control.select(destination)}
        style={({ pressed }) => [
          styles.toggle,
          { backgroundColor: palette.soft, borderColor: busy ? palette.border : palette.primary },
          pressed && !busy && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={palette.primary} size="small" />
        ) : (
          <Ionicons
            color={palette.primary}
            name={destination === 'portrait' ? 'phone-portrait-outline' : 'phone-landscape-outline'}
            size={22}
          />
        )}
      </Pressable>
      {failure ? (
        <Text accessibilityLiveRegion="polite" numberOfLines={2} style={[styles.failure, { color: palette.danger }]}>
          {failure}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  failure: {
    fontSize: 8,
    fontWeight: '700',
    lineHeight: 10,
    maxWidth: 88,
    position: 'absolute',
    right: 0,
    textAlign: 'right',
    top: 50,
  },
  pressed: { opacity: 0.65 },
  // One 44×44-point-or-larger target (scope 3.11E), sized for the header row.
  toggle: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  wrap: { zIndex: 40 },
});
