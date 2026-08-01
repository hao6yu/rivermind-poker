import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { GameplayHapticCue } from '../features/table/gameplayPresentation';

/**
 * Haptics are progressive enhancement: unsupported hardware, user settings, and
 * low-power conditions can suppress them without affecting gameplay.
 */
export function playGameplayHaptic(cue: GameplayHapticCue): void {
  if (Platform.OS === 'web') return;

  try {
    const feedback = cue === 'success'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : cue === 'warning'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        : cue === 'medium'
          ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
          : cue === 'light'
            ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
            : Haptics.selectionAsync();
    void feedback.catch(() => undefined);
  } catch {
    // Native haptics must never interrupt a poker action.
  }
}
