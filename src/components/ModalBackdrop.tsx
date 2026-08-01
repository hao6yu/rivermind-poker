import { Pressable, StyleSheet } from 'react-native';

interface ModalBackdropProps {
  accessibilityLabel?: string;
  onPress: () => void;
}

export function ModalBackdrop({
  accessibilityLabel = 'Close dialog',
  onPress,
}: ModalBackdropProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={StyleSheet.absoluteFill}
    />
  );
}
