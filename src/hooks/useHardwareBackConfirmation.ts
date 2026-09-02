import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/**
 * D07 (P18-012): Android hardware Back during a live table must open the
 * leave-table confirmation, never silently abandon or ignore the game.
 *
 * The hook subscribes while `active` and consumes the event (`true`), so the
 * OS default (leaving the app/screen stack) never fires underneath. Open
 * React Native Modals intercept Back through their own `onRequestClose`
 * first, so this only handles the bare table surface.
 */
export function useHardwareBackConfirmation(onBack: () => void, active = true): void {
  useEffect(() => {
    if (!active) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack, active]);
}
