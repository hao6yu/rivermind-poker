import { beforeEach, describe, it, expect, vi } from 'vitest';
vi.mock('expo-sqlite/localStorage/install', () => ({}));
import {
  parseNotificationState,
  notificationsEnabled,
  parseNotificationAction,
  consumeNotificationAction,
  clearNotificationPreferences,
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
