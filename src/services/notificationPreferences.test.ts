import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('expo-sqlite/localStorage/install', () => ({}));
import {
  parseNotificationState,
  notificationsEnabled,
  parseNotificationAction,
  consumeNotificationAction,
  clearNotificationPreferences,
  notificationSettingsPreferences,
} from './notificationPreferences';
describe('notification preferences and navigation', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => values.get(k) ?? null,
      setItem: (k: string, v: string) => values.set(k, v),
      removeItem: (k: string) => values.delete(k),
    });
    clearNotificationPreferences();
  });
  it.each([null, 'broken', '{}', '{"version":1,"preferences":{"tips":"yes"}}'])(
    'keeps missing or malformed preferences disabled',
    (raw) =>
      expect(
        notificationsEnabled(parseNotificationState(raw).preferences),
      ).toBe(false),
  );
  it('preselects all categories without enabling a subscription', () => {
    const state = parseNotificationState(null);
    expect(notificationSettingsPreferences(state)).toEqual({
      tips: true,
      quickPlay: true,
      releases: true,
    });
    expect(notificationsEnabled(state.preferences)).toBe(false);
    expect(state.installationId).toBeNull();
  });
  it.each([
    { tips: false, quickPlay: false, releases: false },
    { tips: true, quickPlay: false, releases: true },
  ])('preserves previously saved choices', (preferences) => {
    const state = {
      ...parseNotificationState(null),
      installationId: '11111111-1111-4111-8111-111111111111',
      preferences,
    };
    expect(notificationSettingsPreferences(state)).toEqual(preferences);
  });
  it('rejects arbitrary navigation routes', () =>
    expect(
      parseNotificationAction({
        kind: 'rivermind-reminder',
        deliveryId: '11111111-1111-4111-8111-111111111111',
        target: 'https://bad.example',
      }),
    ).toBeNull());
  it('consumes repeated notification tap callbacks once', () => {
    const data = {
      kind: 'rivermind-reminder',
      deliveryId: '11111111-1111-4111-8111-111111111111',
      target: 'learn',
    };
    expect(consumeNotificationAction(data)?.target).toBe('learn');
    expect(consumeNotificationAction(data)).toBeNull();
  });
});
