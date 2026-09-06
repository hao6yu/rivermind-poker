import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { AppLanguage } from '../../localization';
import {
  consumeNotificationAction,
  parseNotificationAction,
  type NotificationAction,
} from '../../services/notificationPreferences';
import {
  subscribeToNotifications,
  syncNotifications,
} from '../../services/notifications';
export function useNotifications(
  language: AppLanguage,
  ready: boolean,
  onOpen: (action: NotificationAction) => void,
) {
  const [pending, setPending] = useState<NotificationAction | null>(null);
  const open = useRef(onOpen);
  open.current = onOpen;
  useEffect(() => {
    let disposed = false;
    let unsubscribe: undefined | (() => void);
    void subscribeToNotifications((data) => {
      if (disposed) return;
      const action = parseNotificationAction(data);
      if (action) setPending(action);
    })
      .then((remove) => {
        if (disposed) remove();
        else unsubscribe = remove;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);
  useEffect(() => {
    void syncNotifications(language);
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNotifications(language);
    });
    return () => listener.remove();
  }, [language]);
  useEffect(() => {
    if (ready && pending) {
      setPending(null);
      const action = consumeNotificationAction({
        kind: 'rivermind-reminder',
        ...pending,
      });
      if (action) open.current(action);
    }
  }, [ready, pending]);
}
