import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'ios' },
  constants: {
    appOwnership: 'standalone',
    expoConfig: { version: '1.2.0', extra: { eas: { projectId: 'project' } } },
  },
  setChannel: vi.fn(),
  invoke: vi.fn(),
  session: vi.fn(),
  ensureSession: vi.fn(),
  getPermission: vi.fn(),
  requestPermission: vi.fn(),
  getToken: vi.fn(),
  listenerRemove: vi.fn(),
  lastResponse: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-sqlite/localStorage/install', () => ({}));
vi.mock('expo-crypto', () => ({
  randomUUID: () => '11111111-1111-4111-8111-111111111111',
}));
vi.mock('expo-constants', () => ({
  default: mocks.constants,
}));
vi.mock('./supabase', () => ({
  ensureAnonymousSession: mocks.ensureSession,
  supabase: {
    auth: { getSession: mocks.session },
    functions: { invoke: mocks.invoke },
  },
}));
vi.mock('expo-notifications', () => ({
  setNotificationChannelAsync: mocks.setChannel,
  AndroidImportance: { DEFAULT: 3 },
  getPermissionsAsync: mocks.getPermission,
  requestPermissionsAsync: mocks.requestPermission,
  getExpoPushTokenAsync: mocks.getToken,
  setNotificationHandler: vi.fn(),
  addNotificationResponseReceivedListener: () => ({
    remove: mocks.listenerRemove,
  }),
  getLastNotificationResponseAsync: mocks.lastResponse,
}));
import {
  clearNotificationPreferences,
  getNotificationState,
  notificationSettingsPreferences,
  parseNotificationState,
  NOTIFICATION_STORAGE_KEY,
} from './notificationPreferences';
import {
  saveNotificationPreferences,
  subscribeToNotifications,
  syncNotifications,
} from './notifications';

const enabled = { tips: true, quickPlay: false, releases: false };
const disabled = { tips: false, quickPlay: false, releases: false };
describe('native notification consent and synchronization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.platform.OS = 'ios';
    mocks.constants.appOwnership = 'standalone';
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    clearNotificationPreferences();
    mocks.session.mockResolvedValue({
      data: { session: { user: { id: 'user' } } },
    });
    mocks.invoke.mockResolvedValue({ data: { saved: true }, error: null });
    mocks.getPermission.mockResolvedValue({ granted: true, canAskAgain: true });
    mocks.getToken.mockResolvedValue({ data: 'ExpoPushToken[test]' });
    mocks.lastResponse.mockResolvedValue(null);
  });
  it('does not ask permission or create an account on first open', async () => {
    expect(await syncNotifications('en')).toBe('saved');
    expect(await saveNotificationPreferences(disabled, 'en')).toBe('saved');
    expect(mocks.ensureSession).not.toHaveBeenCalled();
    expect(mocks.requestPermission).not.toHaveBeenCalled();
    expect(mocks.invoke).not.toHaveBeenCalled();
    const reloaded = parseNotificationState(
      localStorage.getItem(NOTIFICATION_STORAGE_KEY),
    );
    expect(notificationSettingsPreferences(reloaded)).toEqual(disabled);
    expect(reloaded.needsSync).toBe(false);
  });
  it('requests permission only after saving enabled categories', async () => {
    mocks.getPermission.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    mocks.requestPermission.mockResolvedValue({ granted: true });
    expect(await saveNotificationPreferences(enabled, 'zh-Hant')).toBe('saved');
    expect(mocks.requestPermission).toHaveBeenCalledOnce();
    expect(mocks.invoke).toHaveBeenCalledWith(
      'notifications-register',
      expect.objectContaining({
        body: expect.objectContaining({
          tips: true,
          quickPlay: false,
          releases: false,
          locale: 'zh-Hant',
          consentVersion: 'reminders-1',
        }),
      }),
    );
    mocks.getPermission.mockResolvedValue({
      granted: false,
      canAskAgain: true,
    });
    await syncNotifications('en');
    expect(mocks.requestPermission).toHaveBeenCalledOnce();
  });
  it('registers Android native runtimes after creating the reminder channel', async () => {
    mocks.platform.OS = 'android';
    expect(await saveNotificationPreferences(enabled, 'en')).toBe('saved');
    expect(mocks.setChannel).toHaveBeenCalledWith(
      'reminders',
      expect.objectContaining({ importance: 3, sound: null, enableVibrate: false }),
    );
    expect(mocks.invoke).toHaveBeenCalledWith(
      'notifications-register',
      expect.objectContaining({
        body: expect.objectContaining({
          platform: 'android',
          token: 'ExpoPushToken[test]',
        }),
      }),
    );
  });
  it.each(['expo', 'web'])('still rejects unsupported %s runtimes', async (runtime) => {
    if (runtime === 'expo') mocks.constants.appOwnership = 'expo';
    else mocks.platform.OS = 'web';
    expect(await saveNotificationPreferences(enabled, 'en')).toBe('unsupported');
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.requestPermission).not.toHaveBeenCalled();
  });
  it('disables remotely without obtaining a token on opt-out', async () => {
    await saveNotificationPreferences(enabled, 'en');
    mocks.getToken.mockClear();
    expect(await saveNotificationPreferences(disabled, 'en')).toBe('saved');
    expect(mocks.getToken).not.toHaveBeenCalled();
    expect(mocks.invoke).toHaveBeenLastCalledWith(
      'notifications-register',
      expect.objectContaining({
        body: {
          action: 'disable',
          installationId: getNotificationState().installationId,
        },
      }),
    );
  });
  it('keeps offline opt-out pending and retries on foreground', async () => {
    await saveNotificationPreferences(enabled, 'en');
    mocks.invoke.mockResolvedValueOnce({ error: new Error('offline') });
    expect(await saveNotificationPreferences(disabled, 'en')).toBe('pending');
    expect(getNotificationState().preferences).toEqual(disabled);
    expect(getNotificationState().needsSync).toBe(true);
    expect(await syncNotifications('en')).toBe('saved');
    expect(getNotificationState().needsSync).toBe(false);
  });
  it('does not register when durable preference storage fails', async () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('full');
      },
    });
    await expect(saveNotificationPreferences(enabled, 'en')).rejects.toThrow(
      'full',
    );
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('discards token work completed after account data was cleared', async () => {
    let resolveToken!: (value: { data: string }) => void;
    mocks.getToken.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveToken = resolve;
        }),
    );
    const saving = saveNotificationPreferences(enabled, 'en');
    await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalledOnce());
    clearNotificationPreferences();
    resolveToken({ data: 'ExpoPushToken[late]' });
    expect(await saving).toBe('pending');
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(getNotificationState().installationId).toBeNull();
  });
  it('still removes the live listener if reading the initial tap fails', async () => {
    mocks.lastResponse.mockRejectedValue(new Error('unavailable'));
    const remove = await subscribeToNotifications(vi.fn());
    remove();
    expect(mocks.listenerRemove).toHaveBeenCalledOnce();
  });
  it('leaves saving pending instead of trapping the screen on a token timeout', async () => {
    vi.useFakeTimers();
    try {
      mocks.getToken.mockReturnValue(new Promise(() => undefined));
      const saving = saveNotificationPreferences(enabled, 'en');
      await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(15000);
      expect(await saving).toBe('pending');
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(getNotificationState().needsSync).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
