import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  humanSeatChipLabel,
  humanIdentityAccessibilityLabel,
  type HumanSeatControl,
  type HumanRoleLabels,
} from '../domain/humanIdentity';
import { type ThemePalette, useAppTheme } from '../theme';

export type { HumanSeatControl };
export { humanIdentityAccessibilityLabel, humanSeatChipLabel };

export interface HumanIdentityBadgeProps {
  /** The player's display name. */
  displayName: string;
  /** Whether the seat's turns are driven by a human or by AI control. */
  control?: HumanSeatControl;
  /** Whether the seat is the room host. */
  isHost?: boolean;
  /** Whether this seat is the current player. */
  isYou?: boolean;
  /** Optional locale role strings; defaults are English. */
  roles?: HumanRoleLabels;
  /** Optional explicit label; overrides the computed role label. */
  accessibilityLabel?: string;
}

export function HumanIdentityBadge({
  displayName,
  control = 'human',
  isHost = false,
  isYou = false,
  roles,
  accessibilityLabel,
}: HumanIdentityBadgeProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const label = accessibilityLabel ?? humanIdentityAccessibilityLabel({ displayName, control, isHost, isYou, roles });
  const chip = humanSeatChipLabel({ isHost, isYou, roles });

  return (
    <View accessibilityLabel={label} style={styles.container} testID="human-identity-badge">
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        numberOfLines={1}
        style={styles.name}
      >
        {displayName}
      </Text>
      {chip && (
        <View style={styles.chipContainer}>
          <View style={[styles.chip, chip === 'You' ? styles.chipYou : styles.chipHost]}>
            <Text style={styles.chipText}>{chip}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    name: {
      color: palette.text,
      fontSize: 16,
      fontWeight: '700',
      textAlign: 'center',
    },
    chipContainer: {
      borderRadius: 10,
      overflow: 'hidden',
    },
    chip: {
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    chipYou: { backgroundColor: palette.accentSoft },
    chipHost: { backgroundColor: palette.aquaSoft },
    chipText: { color: palette.text, fontSize: 11, fontWeight: '700' },
  });
}
