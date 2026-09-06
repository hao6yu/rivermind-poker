import 'expo-sqlite/localStorage/install';
export interface NotificationPreferences {
  tips: boolean;
  quickPlay: boolean;
  releases: boolean;
}
export interface NotificationState {
  version: 1;
  installationId: string | null;
  token: string | null;
  preferences: NotificationPreferences;
  needsSync: boolean;
  opened: string[];
}
export const NOTIFICATION_STORAGE_KEY = 'rivermind.notifications.v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const emptyNotificationPreferences = (): NotificationPreferences => ({
  tips: false,
  quickPlay: false,
  releases: false,
});
const emptyState = (): NotificationState => ({
  version: 1,
  installationId: null,
  token: null,
  preferences: emptyNotificationPreferences(),
  needsSync: false,
  opened: [],
});
export function notificationsEnabled(p: NotificationPreferences) {
  return p.tips || p.quickPlay || p.releases;
}
export function parseNotificationState(raw: string | null): NotificationState {
  try {
    const s = JSON.parse(raw ?? 'null') as NotificationState | null;
    if (
      s?.version !== 1 ||
      !s.preferences ||
      ['tips', 'quickPlay', 'releases'].some(
        (k) =>
          typeof s.preferences[k as keyof NotificationPreferences] !==
          'boolean',
      ) ||
      typeof s.needsSync !== 'boolean' ||
      !Array.isArray(s.opened) ||
      !(
        s.installationId === null ||
        (typeof s.installationId === 'string' && uuid.test(s.installationId))
      ) ||
      !(s.token === null || typeof s.token === 'string')
    )
      return emptyState();
    return {
      ...s,
      opened: s.opened.filter((v) => typeof v === 'string').slice(-64),
    };
  } catch {
    return emptyState();
  }
}
let state: NotificationState;
try {
  state = parseNotificationState(
    typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(NOTIFICATION_STORAGE_KEY),
  );
} catch {
  state = emptyState();
}
let revision = 0;
export const getNotificationState = () => state;
export const getNotificationRevision = () => revision;
export function saveNotificationState(next: NotificationState) {
  // Persist before enabling. A receipt/token that cannot be saved must not
  // silently start an account-level reminder subscription.
  if (typeof localStorage === 'undefined')
    throw new Error('notification_storage_unavailable');
  localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(next));
  state = next;
  revision++;
}
export function clearNotificationPreferences() {
  state = emptyState();
  revision++;
  try {
    if (typeof localStorage !== 'undefined')
      localStorage.removeItem(NOTIFICATION_STORAGE_KEY);
  } catch {
    /* memory remains disabled */
  }
}
export interface NotificationAction {
  deliveryId: string;
  target: 'learn' | 'play' | 'whats_new';
  releaseVersion: string | null;
}
export function parseNotificationAction(
  data: unknown,
): NotificationAction | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.kind !== 'rivermind-reminder' ||
    typeof d.deliveryId !== 'string' ||
    !uuid.test(d.deliveryId) ||
    !['learn', 'play', 'whats_new'].includes(String(d.target))
  )
    return null;
  return {
    deliveryId: d.deliveryId,
    target: d.target as NotificationAction['target'],
    releaseVersion:
      typeof d.releaseVersion === 'string' &&
      /^\d+\.\d+\.\d+$/.test(d.releaseVersion)
        ? d.releaseVersion
        : null,
  };
}
export function consumeNotificationAction(data: unknown) {
  const action = parseNotificationAction(data);
  if (!action || state.opened.includes(action.deliveryId)) return null;
  try {
    saveNotificationState({
      ...state,
      opened: [...state.opened, action.deliveryId].slice(-64),
    });
  } catch {
    return null;
  }
  return action;
}
