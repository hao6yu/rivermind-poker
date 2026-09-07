import { Platform } from 'react-native';
import type { AppLanguage } from '../localization';
import { ensureAnonymousSession, supabase } from './supabase';
import {
  getNotificationState,
  getNotificationRevision,
  saveNotificationState,
  notificationsEnabled,
  type NotificationPreferences,
} from './notificationPreferences';

export type NotificationSaveResult =
  | 'saved'
  | 'permission_denied'
  | 'unsupported'
  | 'pending';
let syncQueue: Promise<unknown> = Promise.resolve();

async function withNetworkDeadline<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('notification_timeout')),
          15000,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function nativeNotifications() {
  const { default: Constants } = await import('expo-constants');
  if (
    Constants.appOwnership === 'expo' ||
    !['ios', 'android'].includes(Platform.OS)
  )
    return null;
  return { module: await import('expo-notifications'), constants: Constants };
}
async function sync(
  language: AppLanguage,
  requestPermission: boolean,
): Promise<NotificationSaveResult> {
  const initial = getNotificationState();
  if (!initial.installationId) return 'saved';
  const rev = getNotificationRevision();
  if (!supabase) return 'pending';
  if (requestPermission) await withNetworkDeadline(ensureAnonymousSession());
  else if (!(await supabase.auth.getSession()).data.session) return 'pending';
  if (rev !== getNotificationRevision()) return 'pending';
  if (!notificationsEnabled(initial.preferences)) {
    const { data, error } = await supabase.functions.invoke(
      'notifications-register',
      {
        timeout: 15000,
        body: { action: 'disable', installationId: initial.installationId },
      },
    );
    if (error || data?.saved !== true) return 'pending';
    if (rev === getNotificationRevision())
      saveNotificationState({ ...initial, needsSync: false });
    return 'saved';
  }
  const native = await nativeNotifications();
  if (!native) return 'unsupported';
  const n = native.module;
  if (Platform.OS === 'android')
    await n.setNotificationChannelAsync('reminders', {
      name: 'RiverMind',
      importance: n.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
    });
  let permission = await n.getPermissionsAsync();
  if (!permission.granted && requestPermission && permission.canAskAgain)
    permission = await n.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
  if (!permission.granted) {
    // Revoking OS permission disables server delivery on the next foreground.
    await supabase.functions.invoke('notifications-register', {
      timeout: 15000,
      body: { action: 'disable', installationId: initial.installationId },
    });
    return 'permission_denied';
  }
  const projectId = native.constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== 'string') return 'unsupported';
  // Simulator builds have no provisioning profile for Expo to inspect. APNs
  // simulator tokens require the sandbox even when the JS bundle is Release.
  const simulator =
    Platform.OS === 'ios' && !(await import('expo-device')).isDevice;
  const token = (
    await withNetworkDeadline(
      n.getExpoPushTokenAsync({
        projectId,
        ...(simulator ? { development: true } : {}),
      }),
    )
  ).data;
  if (rev !== getNotificationRevision()) return 'pending';
  const body = {
    installationId: initial.installationId,
    token,
    platform: Platform.OS,
    locale: language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    appVersion: native.constants.expoConfig?.version ?? '1.2.0',
    ...initial.preferences,
    permissionGranted: true,
    consentVersion: 'reminders-1',
  };
  const { data, error } = await supabase.functions.invoke(
    'notifications-register',
    { timeout: 15000, body },
  );
  if (error || data?.saved !== true) return 'pending';
  if (rev === getNotificationRevision())
    saveNotificationState({ ...initial, token, needsSync: false });
  return 'saved';
}
export function syncNotifications(
  language: AppLanguage,
  requestPermission = false,
): Promise<NotificationSaveResult> {
  const task = syncQueue
    .then(() => sync(language, requestPermission))
    .catch(() => 'pending' as const);
  syncQueue = task;
  return task;
}
export async function saveNotificationPreferences(
  preferences: NotificationPreferences,
  language: AppLanguage,
) {
  const current = getNotificationState();
  const revision = getNotificationRevision();
  const firstSaveDisabled =
    !current.installationId && !notificationsEnabled(preferences);
  const installationId =
    current.installationId ?? (await import('expo-crypto')).randomUUID();
  if (revision !== getNotificationRevision()) return 'pending' as const;
  saveNotificationState({
    ...current,
    installationId,
    preferences,
    needsSync: !firstSaveDisabled,
  });
  // Remember an explicit all-off choice so reopening does not preselect again.
  if (firstSaveDisabled) return 'saved' as const;
  return syncNotifications(language, notificationsEnabled(preferences));
}
export async function subscribeToNotifications(
  onResponse: (data: unknown) => void,
) {
  const native = await nativeNotifications();
  if (!native) return () => undefined;
  // Engagement messages never interrupt an active table or another app flow.
  native.module.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  const listener = native.module.addNotificationResponseReceivedListener(
    (response) => onResponse(response.notification.request.content.data),
  );
  try {
    const response = await native.module.getLastNotificationResponseAsync();
    if (response) onResponse(response.notification.request.content.data);
  } catch {
    /* Live responses still work if the initial response is unavailable. */
  }
  return () => listener.remove();
}
