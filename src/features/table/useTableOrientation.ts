import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, type ModalProps } from 'react-native';

import { recordAppDiagnostic } from '../../services/betaFeedback';
import {
  createTableOrientationController,
  type TableOrientationSelection,
  type TableOrientationSnapshot,
} from './tableOrientationController';

export const LIVE_TABLE_SUPPORTED_ORIENTATIONS = [
  'portrait',
  'landscape',
  'landscape-left',
  'landscape-right',
] satisfies NonNullable<ModalProps['supportedOrientations']>;

export interface LiveTableOrientationControl {
  select: (selection: TableOrientationSelection) => void;
  snapshot: TableOrientationSnapshot;
}

export function useTableOrientation(live: boolean): LiveTableOrientationControl {
  const controller = useRef<ReturnType<typeof createTableOrientationController> | null>(null);
  if (controller.current === null) {
    controller.current = createTableOrientationController({
      async apply(selection) {
        const lock = selection === 'portrait'
          ? ScreenOrientation.OrientationLock.PORTRAIT_UP
          : ScreenOrientation.OrientationLock.LANDSCAPE;
        const supported = await ScreenOrientation.supportsOrientationLockAsync(lock);
        if (!supported) return 'unsupported';
        try {
          await ScreenOrientation.lockAsync(lock);
          return 'applied';
        } catch (error) {
          recordAppDiagnostic({
            code: 'screen_orientation_change_failed',
            retryable: true,
            source: 'table_orientation',
          });
          throw error;
        }
      },
    });
  }
  const orientationController = controller.current;
  const [snapshot, setSnapshot] = useState(orientationController.snapshot);

  useEffect(() => orientationController.subscribe(setSnapshot), [orientationController]);

  useEffect(() => {
    orientationController.setLive(live);
  }, [live, orientationController]);

  useEffect(() => {
    if (!live) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') orientationController.foreground();
    });
    return () => subscription.remove();
  }, [live, orientationController]);

  const select = useCallback((selection: TableOrientationSelection) => {
    orientationController.select(selection);
  }, [orientationController]);

  return useMemo(() => ({ select, snapshot }), [select, snapshot]);
}
