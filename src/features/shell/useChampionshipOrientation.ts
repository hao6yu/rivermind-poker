import * as ScreenOrientation from 'expo-screen-orientation';
import { useEffect } from 'react';

// Serialize opening/closing a map across rapid navigation. Restore the prior
// table/shell lock only after the map's native request has settled.
let orientationQueue: Promise<void> = Promise.resolve();

export function useChampionshipOrientation(visible: boolean) {
  useEffect(() => {
    if (!visible) return;
    let active = true;
    let previous: ScreenOrientation.OrientationLock | undefined;
    orientationQueue = orientationQueue.then(async () => {
      if (!active) return;
      previous = await ScreenOrientation.getOrientationLockAsync();
      if (active && await ScreenOrientation.supportsOrientationLockAsync(ScreenOrientation.OrientationLock.DEFAULT)) {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT);
      }
    }).catch(() => { /* Unsupported hosts still use the measured responsive layout. */ });
    return () => {
      active = false;
      orientationQueue = orientationQueue.then(async () => {
        if (previous !== undefined && previous !== ScreenOrientation.OrientationLock.UNKNOWN) {
          await ScreenOrientation.lockAsync(previous);
        }
      }).catch(() => { /* A host may disappear while a modal is closing. */ });
    };
  }, [visible]);
}
