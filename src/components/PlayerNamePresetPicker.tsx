import { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  PLAYER_DISPLAY_NAME_PRESETS,
  type PlayerDisplayName,
} from '../domain/playerProfile';
import { type ThemePalette, useAppTheme } from '../theme';

export function PlayerNamePresetPicker({
  hint,
  label,
  large = false,
  onSelect,
  selectedName,
}: {
  hint: string;
  label: string;
  large?: boolean;
  onSelect: (name: PlayerDisplayName) => void;
  selectedName: string;
}) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, large), [large, palette]);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityRole="radiogroup" style={styles.options}>
        {PLAYER_DISPLAY_NAME_PRESETS.map((name) => {
          const selected = name === selectedName;
          return (
            <Pressable
              accessibilityLabel={name}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              key={name}
              onPress={() => onSelect(name)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                pressed && styles.optionPressed,
              ]}
            >
              <Text numberOfLines={1} style={[styles.optionText, selected && styles.optionTextSelected]}>
                {name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
}

function createStyles(palette: ThemePalette, large: boolean) {
  return StyleSheet.create({
    hint: {
      color: palette.muted,
      fontSize: large ? 13 : 10.5,
      lineHeight: large ? 18 : 15,
      marginTop: large ? 9 : 7,
    },
    label: {
      color: palette.text,
      fontSize: large ? 15 : 12,
      fontWeight: '800',
      marginBottom: large ? 11 : 8,
    },
    option: {
      flexBasis: large ? 110 : 76,
      flexGrow: 1,
      maxWidth: large ? 154 : 112,
      minHeight: large ? 48 : 42,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: large ? 13 : 9,
      paddingVertical: 6,
      borderRadius: large ? 14 : 12,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.surface,
    },
    optionPressed: { opacity: 0.78 },
    optionSelected: {
      borderColor: palette.primary,
      backgroundColor: palette.primary,
    },
    optionText: {
      color: palette.text,
      fontSize: large ? 15 : 12.5,
      fontWeight: '800',
      textAlign: 'center',
    },
    optionTextSelected: { color: palette.primaryText },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: large ? 10 : 7,
    },
  });
}
